import * as path from "path";

import { ContentCreator } from "./content-creator";
import { H5pPackage } from "./h5p-package";
import { H5pAudio } from "./models/h5p-audio";
import {
  GuessItMode,
  H5pGuessItContent,
  H5pGuessItQuestion,
} from "./models/h5p-guessit-content";

export interface GuessItCsvRow {
  item: string;
  tip?: string;
  audio?: string;
}

export interface GuessItCreatorOptions {
  mode: GuessItMode;
  description: string;
  caseSensitive: boolean;
  maxTries: number;
  random: boolean;
  showSolutions: boolean;
  itemCountChoice: boolean;
  audioDisplay: "correct" | "always";
}

export class GuessItCreator extends ContentCreator<H5pGuessItContent> {
  public constructor(
    h5pPackage: H5pPackage,
    private data: GuessItCsvRow[],
    private options: GuessItCreatorOptions,
    sourcePath: string
  ) {
    super(h5pPackage, sourcePath);
  }

  public setTitle(title: string): void {
    this.h5pPackage.h5pMetadata.title = title;
    this.h5pPackage.addMetadata(this.h5pPackage.h5pMetadata);
  }

  protected contentObjectFactory(): H5pGuessItContent {
    return new H5pGuessItContent();
  }

  protected async addContent(contentObject: H5pGuessItContent): Promise<void> {
    const questions: H5pGuessItQuestion[] = [];
    let audioCounter = 0;

    for (const line of this.data) {
      const question: H5pGuessItQuestion = {
        sentence: line.item,
      };
      if (line.tip) {
        question.tip = line.tip;
      }
      if (line.audio) {
        const audio = await this.addAudio(line.audio, audioCounter++);
        if (audio) {
          question.audio = [audio];
        }
      }
      questions.push(question);
    }

    contentObject.wordle = this.options.mode === "wordle";
    contentObject.enableAudio = questions.some(question => question.audio);
    if (contentObject.wordle) {
      contentObject.questionsW = questions;
      contentObject.questions = [];
    } else {
      contentObject.questions = questions;
      contentObject.questionsW = [];
    }
  }

  protected addSettings(contentObject: H5pGuessItContent): void {
    contentObject.description = this.options.description;
    contentObject.behaviour = {
      caseSensitive:
        this.options.mode === "sentence" && this.options.caseSensitive,
      enableNumChoice: false,
      enableItemCountChoice: this.options.itemCountChoice,
      enableSolutionsButton:
        this.options.mode === "sentence" && this.options.showSolutions,
      enableEndGameButton: false,
      numRounds: 1,
      maxTries: this.options.maxTries,
      displayAudio: this.options.audioDisplay,
      listGuessedSentences: this.options.mode === "wordle",
      listGuessedAudioAndTips: "none",
      sentencesOrder: this.options.random ? "random" : "normal",
    };
  }

  private async addAudio(source: string, counter: number): Promise<H5pAudio> {
    try {
      const result = this.isRemote(source)
        ? await H5pAudio.fromDownload(source)
        : await H5pAudio.fromLocalFile(path.join(this.sourcePath, source));
      const filename = `audios/${counter}${result.extension}`;
      this.h5pPackage.addContentFile(filename, result.buffer);
      result.audio.path = filename;
      console.log(`Added audio from ${source}. (${result.buffer.byteLength} bytes)`);
      return result.audio;
    } catch (error) {
      console.error(error);
      return undefined;
    }
  }

  private isRemote(source: string): boolean {
    return source.startsWith("http://") || source.startsWith("https://");
  }
}
