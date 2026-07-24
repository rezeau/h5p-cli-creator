import axios from "axios";
import * as fs from "fs";
import * as fsExtra from "fs-extra";
import * as jszip from "jszip";
import * as path from "path";

import { toBuffer } from "./helpers";
import { LanguageStrings } from "./language-strings";

interface H5pLibraryDependency {
  machineName: string;
  majorVersion: number | string;
  minorVersion: number | string;
}

interface H5pLibraryDefinition {
  title?: string;
  machineName: string;
  majorVersion: number;
  minorVersion: number;
  runnable?: number;
  embedTypes?: string[];
  preloadedDependencies?: H5pLibraryDependency[];
}

interface H5pLibraryRecord {
  directory: string;
  definition: H5pLibraryDefinition;
}

export interface H5pPackageSource {
  machineName: string;
  cacheFilename: string;
  downloadUrl: string;
}

export interface H5pPackageAcquisitionSettings {
  cacheDirectory?: string;
  h5pHubBaseUrl?: string;
  customPackageSources?: ReadonlyArray<H5pPackageSource>;
  timeoutMs?: number;
  maxDownloadSizeBytes?: number;
  maxRedirects?: number;
}

interface PendingCachePublication {
  cachePath: string;
  sourceDescription: string;
  temporaryPath: string;
}

export type H5pPackageMode = "full" | "minimal";

/**
 * H5P Package
 */
export class H5pPackage {
  /**
   * Factory method to fetch a package for a content type from the h5p hub and load its content into memory.
   * @param contentTypeName the name of the content type to download
   * @param language the code of the language to use the language strings for
   * @returns the newly created package object
   */
  public static async createFromHub(
    contentTypeName: string,
    language: string,
    acquisitionSettings: H5pPackageAcquisitionSettings = {}
  ): Promise<H5pPackage> {
    const pack = new H5pPackage(
      contentTypeName,
      undefined,
      acquisitionSettings
    );
    await pack.load(language);
    return pack;
  }

  /**
   * Loads either a complete H5P content package or a bundle containing a
   * runnable H5P library and its dependencies.
   */
  public static async createFromFile(
    packagePath: string,
    contentTypeName: string,
    language: string
  ): Promise<H5pPackage> {
    const pack = new H5pPackage(contentTypeName, packagePath);
    await pack.load(language);
    return pack;
  }

  public languageStrings: LanguageStrings;
  public h5pMetadata: any;

  private packageZip: jszip;
  private pendingCachePublication?: PendingCachePublication;
  private static projectRoot = path.resolve(__dirname, "..");
  private static defaultH5pHubBaseUrl = "https://api.h5p.org/v1/";
  private static defaultMaxDownloadSizeBytes = 50 * 1024 * 1024;
  private static defaultMaxRedirects = 5;
  private static defaultTimeoutMs = 30000;

  private constructor(
    private contentTypeName: string,
    private packagePath?: string,
    private acquisitionSettings: H5pPackageAcquisitionSettings = {}
  ) {}

  /**
   * Removes all content from the package.
   */
  public clearContent(): void {
    this.packageZip.remove("content");
  }

  public addMetadata(h5pMetadata: any) {
    this.h5pMetadata = h5pMetadata;
    const json = JSON.stringify(h5pMetadata);
    this.packageZip.file("h5p.json", Buffer.from(json));
  }

  /**
   * Creates a content.json in the package containing the passed string.
   * @param json
   */
  public addMainContentFile(json: string): void {
    this.packageZip.file("content/content.json", Buffer.from(json), {
      createFolders: false
    });
  }

  public addContentFile(path: string, buffer: Buffer) {
    this.packageZip.file("content/" + path, buffer, { createFolders: false });
  }

  /**
   * Stores the package to the disk
   * @param path
   * @returns
   */
  public async savePackage(
    path: string,
    packageMode: H5pPackageMode = "full"
  ): Promise<void> {
    if (packageMode !== "full" && packageMode !== "minimal") {
      throw new Error(
        `Invalid H5P package mode "${packageMode}". Use "full" or "minimal".`
      );
    }

    const outputPackage =
      packageMode === "minimal"
        ? await this.createMinimalOutputPackage()
        : this.packageZip;
    if (packageMode === "minimal") {
      console.warn(
        "WARNING: Creating a minimal H5P package without libraries. " +
          "The destination platform must already have every library and " +
          "major/minor version declared in h5p.json, or the package will not import."
      );
    }

    const file = await outputPackage.generateAsync({ type: "nodebuffer" });
    fs.writeFileSync(path, file);
    console.log(`Stored ${packageMode} H5P package at ${path}.`);
  }

  private async load(language: string): Promise<void> {
    try {
      await this.get();
      await this.initialize(language);
      await this.publishPendingDownload(language);
    } finally {
      await this.cleanupPendingDownload();
    }
  }

  /**
   * Downloads a package or uses a locally cached copy and loads the content for
   * further processing. A download remains in a temporary file until the
   * package has been initialized successfully.
   */
  private async get(): Promise<void> {
    if (this.packagePath) {
      const packagePath = this.resolveProjectPath(this.packagePath);
      if (!(await fsExtra.pathExists(packagePath))) {
        throw new Error(`H5P package file not found: ${packagePath}`);
      }
      this.packageZip = await this.openPackage(
        await fsExtra.readFile(packagePath),
        packagePath,
        false
      );
      console.log(`Using H5P package from ${packagePath}`);
      return;
    }

    const customSource = this.findCustomPackageSource(this.contentTypeName);
    const cachePath = await this.resolveCachedPackagePath(
      this.contentTypeName,
      customSource && customSource.cacheFilename
    );
    if (await fsExtra.pathExists(cachePath)) {
      this.packageZip = await this.openPackage(
        await fsExtra.readFile(cachePath),
        cachePath,
        true
      );
      console.log(`Using cached content type package from ${cachePath}`);
      return;
    }

    const sourceUrl = customSource
      ? customSource.downloadUrl
      : this.h5pHubUrl(this.contentTypeName);
    const sourceDescription = customSource
      ? `custom package source ${sourceUrl}`
      : "H5P Hub";
    await fsExtra.ensureDir(path.dirname(cachePath));
    const temporaryPath = this.createTemporaryPackagePath(cachePath);
    this.pendingCachePublication = {
      cachePath,
      sourceDescription,
      temporaryPath
    };
    await this.downloadPackageToFile(
      sourceUrl,
      sourceDescription,
      temporaryPath
    );
    this.packageZip = await this.openPackage(
      await fsExtra.readFile(temporaryPath),
      temporaryPath,
      false,
      true
    );
  }

  private async downloadPackageToFile(
    sourceUrl: string,
    sourceDescription: string,
    temporaryPath: string
  ): Promise<void> {
    const timeoutMs =
      this.acquisitionSettings.timeoutMs === undefined
        ? H5pPackage.defaultTimeoutMs
        : this.acquisitionSettings.timeoutMs;
    const maxDownloadSizeBytes =
      this.acquisitionSettings.maxDownloadSizeBytes === undefined
        ? H5pPackage.defaultMaxDownloadSizeBytes
        : this.acquisitionSettings.maxDownloadSizeBytes;
    const maxRedirects =
      this.acquisitionSettings.maxRedirects === undefined
        ? H5pPackage.defaultMaxRedirects
        : this.acquisitionSettings.maxRedirects;

    let response;
    try {
      response = await axios.get(sourceUrl, {
        maxContentLength: maxDownloadSizeBytes,
        maxRedirects,
        responseType: "arraybuffer",
        timeout: timeoutMs,
        validateStatus: () => true
      });
    } catch (error) {
      throw this.createDownloadError(
        error,
        sourceDescription,
        timeoutMs,
        maxDownloadSizeBytes
      );
    }

    if (response.status !== 200) {
      throw new Error(
        `Could not download content type ${this.contentTypeName} from ${sourceDescription}: HTTP ${response.status}.`
      );
    }

    const dataBuffer = toBuffer(response.data);
    if (dataBuffer.byteLength > maxDownloadSizeBytes) {
      throw new Error(
        `Could not download content type ${this.contentTypeName} from ${sourceDescription}: ` +
          `download exceeds the ${maxDownloadSizeBytes}-byte limit.`
      );
    }
    if (this.isObviousErrorResponse(response.headers, dataBuffer)) {
      throw new Error(
        `Could not download content type ${this.contentTypeName} from ${sourceDescription}: ` +
          "the response is HTML or text, not an H5P package."
      );
    }

    try {
      await fsExtra.writeFile(temporaryPath, dataBuffer, { flag: "wx" });
    } catch (error) {
      throw new Error(
        `Could not write temporary H5P package ${temporaryPath}: ${this.errorMessage(
          error
        )}`
      );
    }
  }

  private async openPackage(
    dataBuffer: Buffer,
    packagePath: string,
    cachedPackage: boolean,
    downloadedPackage: boolean = false
  ): Promise<jszip> {
    try {
      return await jszip.loadAsync(dataBuffer);
    } catch (error) {
      if (cachedPackage) {
        throw new Error(
          `Could not open cached H5P package ${packagePath}: ${this.errorMessage(
            error
          )}. Remove the cached file and retry.`
        );
      }
      const description = downloadedPackage
        ? `downloaded H5P package for ${this.contentTypeName}`
        : `H5P package ${packagePath}`;
      throw new Error(
        `Could not open ${description}: ${this.errorMessage(error)}`
      );
    }
  }

  private async publishPendingDownload(language: string): Promise<void> {
    const pending = this.pendingCachePublication;
    if (!pending) {
      return;
    }

    try {
      await fs.promises.link(pending.temporaryPath, pending.cachePath);
      console.log(
        `Downloaded content type package ${this.contentTypeName} from ${pending.sourceDescription}.`
      );
    } catch (error) {
      if (!error || error.code !== "EEXIST") {
        throw new Error(
          `Could not publish downloaded H5P package to ${pending.cachePath}: ${this.errorMessage(
            error
          )}`
        );
      }

      try {
        this.packageZip = await this.openPackage(
          await fsExtra.readFile(pending.cachePath),
          pending.cachePath,
          true
        );
        await this.initialize(language);
      } catch (cacheError) {
        throw new Error(
          `Another process created ${pending.cachePath}, but the cached package is invalid: ` +
            `${this.errorMessage(cacheError)}`
        );
      }
      console.log(
        `Using cached content type package published by another process at ${pending.cachePath}`
      );
    }
  }

  private async cleanupPendingDownload(): Promise<void> {
    if (!this.pendingCachePublication) {
      return;
    }
    const temporaryPath = this.pendingCachePublication.temporaryPath;
    this.pendingCachePublication = undefined;
    try {
      await fsExtra.remove(temporaryPath);
    } catch (error) {
      throw new Error(
        `Could not remove temporary H5P package ${temporaryPath}: ${this.errorMessage(
          error
        )}`
      );
    }
  }

  private createDownloadError(
    error: any,
    sourceDescription: string,
    timeoutMs: number,
    maxDownloadSizeBytes: number
  ): Error {
    if (
      error &&
      (error.code === "ECONNABORTED" ||
        error.code === "ETIMEDOUT" ||
        /timeout/i.test(this.errorMessage(error)))
    ) {
      return new Error(
        `Could not download content type ${this.contentTypeName} from ${sourceDescription}: ` +
          `request timed out after ${timeoutMs} ms.`
      );
    }
    if (error && error.code === "ECONNRESET") {
      return new Error(
        `Could not download content type ${this.contentTypeName} from ${sourceDescription}: connection reset.`
      );
    }
    if (/maxContentLength|larger than|max size/i.test(this.errorMessage(error))) {
      return new Error(
        `Could not download content type ${this.contentTypeName} from ${sourceDescription}: ` +
          `download exceeds the ${maxDownloadSizeBytes}-byte limit.`
      );
    }
    return new Error(
      `Could not download content type ${this.contentTypeName} from ${sourceDescription}: ${this.errorMessage(
        error
      )}`
    );
  }

  private isObviousErrorResponse(headers: any, dataBuffer: Buffer): boolean {
    const contentType = String(
      headers && headers["content-type"] ? headers["content-type"] : ""
    ).toLowerCase();
    if (contentType.startsWith("text/") || contentType.indexOf("html") !== -1) {
      return true;
    }
    const prefix = dataBuffer
      .slice(0, Math.min(dataBuffer.byteLength, 512))
      .toString("utf8")
      .trim()
      .toLowerCase();
    return (
      prefix.startsWith("<!doctype html") ||
      prefix.startsWith("<html") ||
      prefix.startsWith("<head") ||
      prefix.startsWith("<body")
    );
  }

  private getLibraryInformation(
    name: string
  ): { name: string; majorVersion: number; minorVersion: number } {
    if (!Array.isArray(this.h5pMetadata.preloadedDependencies)) {
      throw new Error("Invalid h5p.json: preloadedDependencies must be an array.");
    }
    for (const dep of this.h5pMetadata.preloadedDependencies) {
      if (
        typeof dep.machineName === "string" &&
        dep.machineName.toLowerCase() === name.toLowerCase()
      ) {
        return {
          name: dep.machineName,
          majorVersion: +dep.majorVersion,
          minorVersion: +dep.minorVersion
        };
      }
    }
    throw new Error(
      `Invalid h5p.json: main library ${name} is missing from preloadedDependencies.`
    );
  }

  /**
   * Initializes the h5p package
   * @param language the code of the language to use the language strings for
   */
  private async initialize(language: string): Promise<void> {
    const metadataEntry = this.packageZip.file("h5p.json");
    if (metadataEntry) {
      try {
        this.h5pMetadata = JSON.parse(await metadataEntry.async("text"));
      } catch (error) {
        throw new Error(`Invalid h5p.json: ${this.errorMessage(error)}`);
      }
      if (
        !this.h5pMetadata ||
        typeof this.h5pMetadata.mainLibrary !== "string"
      ) {
        throw new Error("Invalid h5p.json: mainLibrary is required.");
      }
      if (
        this.h5pMetadata.mainLibrary.toLowerCase() !==
        this.contentTypeName.toLowerCase()
      ) {
        throw new Error(
          `H5P package main library ${this.h5pMetadata.mainLibrary} does not match requested content type ${this.contentTypeName}.`
        );
      }
      this.contentTypeName = this.h5pMetadata.mainLibrary;
    } else {
      this.h5pMetadata = await this.createMetadataFromLibraryBundle();
      this.addMetadata(this.h5pMetadata);
    }

    const libInfo = this.getLibraryInformation(this.h5pMetadata.mainLibrary);
    await this.validateDeclaredDependencies();
    this.languageStrings = await LanguageStrings.fromLibrary(
      this.packageZip,
      libInfo.name,
      libInfo.majorVersion,
      libInfo.minorVersion,
      language
    );
    this.removeLibraryDevelopmentArtifacts(libInfo);
  }

  private removeLibraryDevelopmentArtifacts(
    library: { name: string; majorVersion: number; minorVersion: number }
  ): void {
    if (library.name.toLowerCase() !== "h5p.guessit") {
      return;
    }

    const libraryDirectory =
      `${library.name}-${library.majorVersion}.${library.minorVersion}`;
    this.packageZip.remove(`${libraryDirectory}/tests`);
    this.packageZip.remove(`${libraryDirectory}/AGENTS.md`);
    this.packageZip.remove(`${libraryDirectory}/WORDLE-FRENCH-ACCENTS.md`);
  }

  private async createMinimalOutputPackage(): Promise<jszip> {
    const minimalPackage = new jszip();
    const requiredEntries = ["h5p.json", "content/content.json"];

    for (const requiredEntry of requiredEntries) {
      if (!this.packageZip.file(requiredEntry)) {
        throw new Error(
          `Cannot create a minimal H5P package because ${requiredEntry} is missing.`
        );
      }
    }

    for (const entryName of Object.keys(this.packageZip.files)) {
      if (
        entryName !== "h5p.json" &&
        !entryName.startsWith("content/")
      ) {
        continue;
      }
      const entry = this.packageZip.file(entryName);
      if (!entry) {
        continue;
      }
      minimalPackage.file(
        entryName,
        await entry.async("nodebuffer"),
        { createFolders: false }
      );
    }

    return minimalPackage;
  }

  private async createMetadataFromLibraryBundle(): Promise<any> {
    const libraries = await this.loadLibraryCatalog();
    const mainLibrary = libraries.find(
      library =>
        library.definition.machineName.toLowerCase() ===
          this.contentTypeName.toLowerCase() &&
        library.definition.runnable === 1
    );

    if (!mainLibrary) {
      throw new Error(
        `Package contains no h5p.json and no runnable library matching ${this.contentTypeName}.`
      );
    }

    const dependencies: H5pLibraryDependency[] = [];
    const visited = new Set<string>();
    const addDependency = (dependency: H5pLibraryDependency) => {
      const key = this.libraryKey(dependency);
      if (visited.has(key)) {
        return;
      }
      const record = this.findLibraryRecord(libraries, dependency);
      if (!record) {
        throw new Error(
          `Library bundle is missing dependency ${dependency.machineName} ${dependency.majorVersion}.${dependency.minorVersion}.`
        );
      }
      visited.add(key);
      dependencies.push({
        machineName: record.definition.machineName,
        majorVersion: record.definition.majorVersion,
        minorVersion: record.definition.minorVersion
      });
      for (const child of record.definition.preloadedDependencies || []) {
        addDependency(child);
      }
    };

    addDependency({
      machineName: mainLibrary.definition.machineName,
      majorVersion: mainLibrary.definition.majorVersion,
      minorVersion: mainLibrary.definition.minorVersion
    });
    this.contentTypeName = mainLibrary.definition.machineName;

    return {
      title: mainLibrary.definition.title || mainLibrary.definition.machineName,
      language: "und",
      mainLibrary: mainLibrary.definition.machineName,
      embedTypes: mainLibrary.definition.embedTypes || ["div"],
      license: "U",
      preloadedDependencies: dependencies
    };
  }

  private async validateDeclaredDependencies(): Promise<void> {
    const libraries = await this.loadLibraryCatalog();
    for (const dependency of this.h5pMetadata.preloadedDependencies) {
      if (!this.findLibraryRecord(libraries, dependency)) {
        throw new Error(
          `H5P package is missing declared dependency ${dependency.machineName} ${dependency.majorVersion}.${dependency.minorVersion}.`
        );
      }
    }
  }

  private async loadLibraryCatalog(): Promise<H5pLibraryRecord[]> {
    const records: H5pLibraryRecord[] = [];
    for (const entryName of Object.keys(this.packageZip.files)) {
      if (!/\/library\.json$/i.test(entryName)) {
        continue;
      }
      const entry = this.packageZip.file(entryName);
      if (!entry) {
        continue;
      }
      let definition: H5pLibraryDefinition;
      try {
        definition = JSON.parse(await entry.async("text"));
      } catch (error) {
        throw new Error(
          `Invalid library definition ${entryName}: ${this.errorMessage(error)}`
        );
      }
      if (
        typeof definition.machineName !== "string" ||
        typeof definition.majorVersion !== "number" ||
        typeof definition.minorVersion !== "number"
      ) {
        throw new Error(
          `Invalid library definition ${entryName}: machineName, majorVersion and minorVersion are required.`
        );
      }
      records.push({
        directory: entryName.substring(0, entryName.lastIndexOf("/")),
        definition
      });
    }
    return records;
  }

  private findLibraryRecord(
    libraries: H5pLibraryRecord[],
    dependency: H5pLibraryDependency
  ): H5pLibraryRecord | undefined {
    return libraries.find(
      library =>
        library.definition.machineName.toLowerCase() ===
          dependency.machineName.toLowerCase() &&
        library.definition.majorVersion === +dependency.majorVersion &&
        library.definition.minorVersion === +dependency.minorVersion
    );
  }

  private libraryKey(dependency: H5pLibraryDependency): string {
    return `${dependency.machineName.toLowerCase()}-${+dependency.majorVersion}.${+dependency.minorVersion}`;
  }

  private resolveProjectPath(packagePath: string): string {
    return path.isAbsolute(packagePath)
      ? packagePath
      : path.resolve(H5pPackage.projectRoot, packagePath);
  }

  private findCustomPackageSource(
    contentTypeName: string
  ): H5pPackageSource | undefined {
    return (this.acquisitionSettings.customPackageSources || []).find(
      source =>
        source.machineName.toLowerCase() === contentTypeName.toLowerCase()
    );
  }

  private h5pHubUrl(contentTypeName: string): string {
    const configuredBaseUrl =
      this.acquisitionSettings.h5pHubBaseUrl ||
      H5pPackage.defaultH5pHubBaseUrl;
    const baseUrl = configuredBaseUrl.endsWith("/")
      ? configuredBaseUrl
      : configuredBaseUrl + "/";
    return baseUrl + "content-types/" + contentTypeName;
  }

  private createTemporaryPackagePath(cachePath: string): string {
    const uniqueSuffix =
      `${process.pid}-${Date.now()}-` +
      Math.random().toString(16).slice(2);
    return path.join(
      path.dirname(cachePath),
      `.${path.basename(cachePath)}.${uniqueSuffix}.tmp`
    );
  }

  private cacheDirectory(): string {
    if (!this.acquisitionSettings.cacheDirectory) {
      return path.resolve(H5pPackage.projectRoot, "content-type-cache");
    }
    return path.isAbsolute(this.acquisitionSettings.cacheDirectory)
      ? this.acquisitionSettings.cacheDirectory
      : path.resolve(
          H5pPackage.projectRoot,
          this.acquisitionSettings.cacheDirectory
        );
  }

  private async resolveCachedPackagePath(
    contentTypeName: string,
    configuredFilename?: string
  ): Promise<string> {
    const cacheDirectory = this.cacheDirectory();
    const expectedFilename =
      configuredFilename || `${contentTypeName}.h5p`;
    if (await fsExtra.pathExists(cacheDirectory)) {
      const entries = await fsExtra.readdir(cacheDirectory);
      const matchingFilename = entries.find(
        entry => entry.toLowerCase() === expectedFilename.toLowerCase()
      );
      if (matchingFilename) {
        return path.join(cacheDirectory, matchingFilename);
      }
    }
    return path.join(cacheDirectory, expectedFilename);
  }

  private errorMessage(error: any): string {
    return error && error.message ? error.message : String(error);
  }
}
