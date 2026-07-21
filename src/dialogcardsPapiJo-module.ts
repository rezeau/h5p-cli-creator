import * as fs from "fs";
import * as papa from "papaparse";
import * as yargs from "yargs";
import * as path from "path";

import { DialogCardsPapiJoCreator } from "./dialogcardsPapiJo-creator";
import { H5pPackage } from "./h5p-package";
import { DialogCardsPapiJoPlayMode } from "./models/h5p-dialog-cardsPapiJo-content";

/**
 * This is the yargs module for Dialog Cards Papi Jo.
 */
export class DialogCardsPapiJoModule implements yargs.CommandModule {
  public command = "dialogcardsPapiJo <input> <output>";
  public describe =
    "Converts CSV input to H5P Dialog Cards Papi Jo content. The headings should be: \
                     front, [back], [image], [imageAltText], [image2], [imageAltText2], \
                     [audio], [audio2], [tipFront], [tipBack], [categories]";
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
        choices: [
          "normalMode",
          "browseSideBySide",
          "matchMode",
          "matchRepetition",
          "selfCorrectionMode",
          "user",
        ]
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
    encoding: BufferEncoding,
    delimiter: string,
    language: string,
    playMode: DialogCardsPapiJoPlayMode
  ): Promise<void> {
    console.log("Creating Dialog Cards Papi Jo content type.");
    csvfile = csvfile.trim();
    outputfile = outputfile.trim();

    let csv = fs.readFileSync(csvfile, { encoding });
    let csvParsed = papa.parse(csv, {
      header: true,
      delimiter,
      skipEmptyLines: true,
    });
    
    let h5pPackage = await H5pPackage.createFromHub(
      "H5P.DialogcardsPapiJo",
      language
    );
    let creator = new DialogCardsPapiJoCreator(
      h5pPackage,
      csvParsed.data as any,
      playMode,
      path.dirname(csvfile)
    );
    await creator.create();
    creator.setTitle(title);
    await creator.savePackage(outputfile);
  }
}
