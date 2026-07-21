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
    language: string
  ): Promise<H5pPackage> {
    const pack = new H5pPackage(contentTypeName);
    await pack.get();
    await pack.initialize(language);
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
    await pack.get();
    await pack.initialize(language);
    return pack;
  }

  public languageStrings: LanguageStrings;
  public h5pMetadata: any;

  private h5pHubUrl = "https://api.h5p.org/v1/";
  private packageZip: jszip;
  private static projectRoot = path.resolve(__dirname, "..");

  private constructor(
    private contentTypeName: string,
    private packagePath?: string
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
  public async savePackage(path: string): Promise<void> {
    const file = await this.packageZip.generateAsync({ type: "nodebuffer" });
    fs.writeFileSync(path, file);
    console.log(`Stored H5P package at ${path}.`);
  }

  /**
   * Downloads the package from the h5p hub
   * @param contentTypeName The name of the package to download.
   * @returns The binary data of the package
   */
  private async downloadContentType(
    contentTypeName: string
  ): Promise<ArrayBuffer> {
    let response;
    try {
      response = await axios.get(
        this.h5pHubUrl + "content-types/" + contentTypeName,
        { responseType: "arraybuffer" }
      );
    } catch (error) {
      throw new Error(
        `Could not download content type ${contentTypeName} from the H5P Hub: ${this.errorMessage(
          error
        )}`
      );
    }
    if (response.status !== 200) {
      throw new Error(
        `Could not download content type ${contentTypeName} from the H5P Hub (HTTP ${response.status}).`
      );
    }
    return response.data;
  }

  /**
   * Downloads the h5p package from the hub or uses a locally cached copy and loads the
   * content for further processing.
   * @returns the jszip object
   */
  private async get(): Promise<void> {
    const localPath = this.packagePath
      ? this.resolveProjectPath(this.packagePath)
      : await this.resolveCachedPackagePath(this.contentTypeName);
    let dataBuffer: Buffer;
    if (this.packagePath) {
      if (!(await fsExtra.pathExists(localPath))) {
        throw new Error(`H5P package file not found: ${localPath}`);
      }
      dataBuffer = await fsExtra.readFile(localPath);
      console.log(`Using H5P package from ${localPath}`);
    } else if (!(await fsExtra.pathExists(localPath))) {
      dataBuffer = toBuffer(await this.downloadContentType(this.contentTypeName));
      await fsExtra.ensureDir(path.dirname(localPath));
      await fsExtra.writeFile(localPath, dataBuffer);
      console.log(`Downloaded content type package ${this.contentTypeName} from H5P Hub.`);
    } else {
      dataBuffer = await fsExtra.readFile(localPath);
      console.log(`Using cached content type package from ${localPath}`);
    }

    try {
      this.packageZip = await jszip.loadAsync(dataBuffer);
    } catch (error) {
      throw new Error(
        `Could not open H5P package ${localPath}: ${this.errorMessage(error)}`
      );
    }
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

  private async resolveCachedPackagePath(contentTypeName: string): Promise<string> {
    const cacheDirectory = path.resolve(H5pPackage.projectRoot, "content-type-cache");
    const expectedFilename = `${contentTypeName}.h5p`;
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
