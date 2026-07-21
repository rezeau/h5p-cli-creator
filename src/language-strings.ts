import * as jszip from "jszip";

import { H5pContent } from "./models/h5p-content";

/**
 * Manages the string that are displayed to the user in an h5p library and configurable in the editor.
 */
export class LanguageStrings {
  /**
   * Creates a H5pLanguageStrings object by opening a library in the H5P package.
   * @param h5pPackage - the zip package containing the library
   * @param libraryName - the full name of the library (e.g. H5P.Flashcards)
   * @param majorVersion - e.g. 1
   * @param minorVersion - e.g 0
   * @param languageCode - the language code as used in h5p (e.g. en, de, fr).
   * @returns library
   */
  public static async fromLibrary(h5pPackage: jszip, libraryName: string, majorVersion: number,
                                  minorVersion: number, languageCode: string = "en"): Promise<LanguageStrings> {
    const libraryDirectory = `${libraryName}-${majorVersion}.${minorVersion}`;
    const semanticsPath = LanguageStrings.findEntry(
      h5pPackage,
      libraryDirectory + "/semantics.json"
    );
    if (!semanticsPath) {
      throw new Error(
        `Semantics file not found for library ${libraryName} ${majorVersion}.${minorVersion}.`
      );
    }
    const semanticsEntry = await h5pPackage.file(semanticsPath).async("text");

    let langObject: object = null;
    if (languageCode !== "en") {
      const languagePath = LanguageStrings.findEntry(
        h5pPackage,
        libraryDirectory + `/language/${languageCode}.json`
      );
      if (!languagePath) {
        throw new Error(
          `Language file ${languageCode}.json not found for library ${libraryName} ${majorVersion}.${minorVersion}.`
        );
      }
      const langEntry = await h5pPackage.file(languagePath).async("text");
      langObject = JSON.parse(langEntry);
    }
    return new LanguageStrings(JSON.parse(semanticsEntry), langObject);
  }

  private static findEntry(h5pPackage: jszip, expectedPath: string): string {
    const normalizedExpectedPath = expectedPath.toLowerCase();
    return Object.keys(h5pPackage.files).find(
      entry => entry.toLowerCase() === normalizedExpectedPath
    );
  }

  private constructor(private semantics: object, private languageFile = null) { }

  /**
   * Gets language strings
   * @param name The name of the string.
   * @returns The string in the language this object was initialized with.
   */
  public get(name: string) {
    for (const key in this.semantics) {
      if (this.semantics[key].name === undefined || this.semantics[key].name !== name) {
        continue;
      }
      const translatedSemantic =
        this.languageFile && this.languageFile.semantics
          ? this.languageFile.semantics[key]
          : undefined;
      return this.getDefaultValue(this.semantics[key], translatedSemantic);
    }
  }

  /**
   * Gets alls language strings
   * @returns language strings including their name and value
   */
  public getAll(): Array<{ name: string, value: any }> {
    const list: Array<{ name: string, value: any }> = new Array();

    for (const key in this.semantics) {
      if (this.semantics[key].name !== undefined && this.semantics[key].common === true) {
        list.push({ name: this.semantics[key].name, value: this.get(this.semantics[key].name) });
      }
    }

    return list;
  }

  /**
   * Adds all language strings as properties to the object
   * @param content
   */
  public addAllToContent(content: H5pContent) {
    const commonStrings = this.getAll();
    for (const str of commonStrings) {
      if (content[str.name] !== undefined) {
        continue;
      }
      content[str.name] = str.value;
    }
  }

  private getDefaultValue(semantic: any, translatedSemantic?: any): any {
    if (semantic.type === "group" && Array.isArray(semantic.fields)) {
      const value = {};
      for (const key in semantic.fields) {
        const field = semantic.fields[key];
        const translatedField =
          translatedSemantic && translatedSemantic.fields
            ? translatedSemantic.fields[key]
            : undefined;
        const fieldValue = this.getDefaultValue(field, translatedField);
        if (fieldValue !== undefined) {
          value[field.name] = fieldValue;
        }
      }
      return value;
    }
    if (translatedSemantic && translatedSemantic.default !== undefined) {
      return translatedSemantic.default;
    }
    return semantic.default;
  }
}
