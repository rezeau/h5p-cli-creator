import * as fs from "fs";
import * as papa from "papaparse";
import * as path from "path";
import * as yargs from "yargs";

import {
  GuessItCreator,
  GuessItCreatorOptions,
  GuessItCsvRow,
} from "./guessit-creator";
import { H5pPackage, H5pPackageMode } from "./h5p-package";
import { GuessItMode } from "./models/h5p-guessit-content";

export class GuessItModule implements yargs.CommandModule {
  public command = "guessit <input> <output>";
  public describe =
    "Converts CSV input to H5P GuessIt content. The headings should be: item, [tip], [audio]";
  public builder = (y: yargs.Argv) =>
    y
      .positional("input", { describe: "CSV input file" })
      .positional("output", {
        describe: "H5P output file including .h5p extension",
      })
      .option("l", {
        describe: "language for translations in H5P content",
        default: "en",
        type: "string",
      })
      .option("d", { describe: "CSV delimiter", default: ";", type: "string" })
      .option("e", { describe: "encoding", default: "UTF-8", type: "string" })
      .option("n", {
        describe: "name/title of the content",
        default: "Guess It",
        type: "string",
      })
      .option("description", {
        describe: "task description",
        default: "Try to guess the mysterious sentence/word",
        type: "string",
      })
      .option("m", {
        alias: "mode",
        choices: ["sentence", "wordle"],
        default: "sentence",
        describe: "GuessIt activity mode",
        type: "string",
      })
      .option("case-sensitive", {
        default: false,
        describe: "require exact case in sentence mode",
        type: "boolean",
      })
      .option("max-tries", {
        default: 6,
        describe: "maximum Wordle tries; must be an even number of at least 6",
        type: "number",
      })
      .option("random", {
        default: false,
        describe: "present imported items in random order",
        type: "boolean",
      })
      .option("show-solutions", {
        default: false,
        describe: "enable the Show solution button in sentence mode",
        type: "boolean",
      })
      .option("item-count-choice", {
        default: false,
        describe: "allow learners to choose the number of imported items",
        type: "boolean",
      })
      .option("audio-display", {
        choices: ["correct", "always"],
        default: "correct",
        describe: "when attached audio controls are displayed",
        type: "string",
      })
      .option("package-mode", {
        choices: ["full", "minimal"],
        default: "full",
        describe:
          "output package: full includes libraries; minimal omits all libraries and requires every h5p.json dependency to be preinstalled",
        type: "string",
      });

  public handler = async (argv) => {
    const options: GuessItCreatorOptions = {
      mode: argv.m as GuessItMode,
      description: argv.description,
      caseSensitive: argv["case-sensitive"],
      maxTries: argv["max-tries"],
      random: argv.random,
      showSolutions: argv["show-solutions"],
      itemCountChoice: argv["item-count-choice"],
      audioDisplay: argv["audio-display"],
    };
    await this.runGuessIt(
      argv.input,
      argv.output,
      argv.n,
      argv.e,
      argv.d,
      argv.l,
      options,
      argv["package-mode"]
    );
  };

  private async runGuessIt(
    csvfile: string,
    outputfile: string,
    title: string,
    encoding: BufferEncoding,
    delimiter: string,
    language: string,
    options: GuessItCreatorOptions,
    packageMode: H5pPackageMode
  ): Promise<void> {
    console.log("Creating GuessIt content type.");
    csvfile = csvfile.trim();
    outputfile = outputfile.trim();

    const csv = fs.readFileSync(csvfile, { encoding });
    const parsed = papa.parse(csv, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });
    if (parsed.errors.length > 0) {
      throw new Error(
        "Could not parse GuessIt CSV: " +
          parsed.errors.map(error => error.message).join("; ")
      );
    }
    if (!parsed.meta.fields || parsed.meta.fields.indexOf("item") === -1) {
      throw new Error('GuessIt CSV must contain an "item" column.');
    }

    const rows = (parsed.data as any[]).map((row, index) =>
      this.normalizeAndValidateRow(row, index + 2, options.mode)
    );
    if (rows.length === 0) {
      throw new Error("GuessIt CSV must contain at least one data row.");
    }
    if (
      !Number.isInteger(options.maxTries) ||
      options.maxTries < 6 ||
      options.maxTries % 2 !== 0
    ) {
      throw new Error("GuessIt max-tries must be an even integer of at least 6.");
    }

    const h5pPackage = await H5pPackage.createFromHub(
      "H5P.GuessIt",
      language
    );
    const creator = new GuessItCreator(
      h5pPackage,
      rows,
      options,
      path.dirname(csvfile)
    );
    await creator.create();
    creator.setTitle(title);
    await creator.savePackage(outputfile, packageMode);
  }

  private normalizeAndValidateRow(
    row: any,
    csvLine: number,
    mode: GuessItMode
  ): GuessItCsvRow {
    const item = typeof row.item === "string" ? row.item.trim() : "";
    if (!item) {
      throw new Error(`GuessIt CSV row ${csvLine} has an empty item.`);
    }
    if (mode === "wordle" && !this.isValidWordleItem(item)) {
      throw new Error(
        `GuessIt CSV row ${csvLine} has invalid Wordle item "${item}". ` +
          "Wordle items must contain 4 to 8 supported letters and no spaces."
      );
    }
    return {
      item,
      tip: typeof row.tip === "string" ? row.tip.trim() : undefined,
      audio: typeof row.audio === "string" ? row.audio.trim() : undefined,
    };
  }

  private isValidWordleItem(item: string): boolean {
    return /^[A-Za-zÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÑÒÓÔÕÖØÙÚÛÜÝŸŒàáâãäåæçèéêëìíîïñòóôõöøùúûüýÿœ]{4,8}$/.test(
      item
    );
  }
}
