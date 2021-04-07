import * as fs from "fs";
import * as papa from "papaparse";
import * as yargs from "yargs";

import { DialogCardsPapiJoCreator } from "./dialogcardsPapiJo-creator";
import { H5pPackage } from "./h5p-package";

/**
 * This is the yargs module for dialogcards PapiJo.
 */
export class DialogCardsPapiJoModule implements yargs.CommandModule {
  public command = "dialogcardsPapiJo <input> <output>";
  public describe =
    "Converts csv input to h5p dialog cards PapiJo content. The headings for the columns \
                     should be: front, back, [image] (image is the URL of an image to include)";
  public builder = (y: yargs.Argv) =>
    y
      .positional("input", { describe: "csv input file" })
      .positional("output", {
        describe: "h5p output file including .h5p extension"
      })
      .option("l", {
        describe: "language for translations in h5p content: available \"en\" and \"fr\"",
        default: "en",
        type: "string"
      })
      .option("d", { describe: "CSV delimiter", default: ";", type: "string" })
      .option("e", { describe: "encoding", default: "UTF-8", type: "string" })
      .option("n", {
        describe: "name/title of the content",
        default: "Dialog Cards Papi Jo",
        type: "string"
      })
      .option("m", {
        describe: "mode of the content",
        default: "normalMode",
        type: "string",
        choices: ["normalMode", "matchMode", "matchRepetition", "selfCorrectionMode"]
      });

  public handler = async argv => {
    await this.runDialogcardsPapiJo(
      argv.input,
      argv.output,
      argv.n,
      argv.e,
      argv.d,
      argv.l,
      argv.m
    );
  };

  private async runDialogcardsPapiJo(
    csvfile: string,
    outputfile: string,
    title: string,
    encoding: string,
    delimiter: string,
    language: string,
    playMode: "normalMode" | "matchMode" | "matchRepetition" | "selfCorrectionMode"
  ): Promise<void> {
    console.log("Creating module content type.");
    csvfile = csvfile.trim();
    outputfile = outputfile.trim();

    let csv = fs.readFileSync(csvfile, encoding);
    let csvParsed = papa.parse(csv, {
      header: true,
      delimiter,
      skipEmptyLines: true
    });
    let h5pPackage = await H5pPackage.createFromHub(
      "H5P.DialogCardsPapiJo",
      language
    );
    let creator = new DialogCardsPapiJoCreator(h5pPackage, csvParsed.data, playMode);
    await creator.create();
    creator.setTitle(title);
    creator.savePackage(outputfile);
  }
}
