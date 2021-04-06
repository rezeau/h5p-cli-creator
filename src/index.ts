#!usr/bin/env node

import * as yargs from "yargs";
import { DialogCardsModule } from "./dialogcards-module";
import { DialogCardsPapiJoModule } from "./dialogcardsPapiJo-module";
import { FlashcardsModule } from "./flashcards-module";

try {
  yargs
    .command(new FlashcardsModule())
    .command(new DialogCardsModule())
    .command(new DialogCardsPapiJoModule())
    .help().argv;
} catch (error) {
  console.error(error);
}
