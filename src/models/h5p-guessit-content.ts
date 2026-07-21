import { H5pAudio } from "./h5p-audio";
import { H5pContent } from "./h5p-content";

export type GuessItMode = "sentence" | "wordle";

export interface H5pGuessItQuestion {
  sentence: string;
  audio?: H5pAudio[];
  tip?: string;
}

export class H5pGuessItContent extends H5pContent {
  public info: boolean = false;
  public description: string;
  public wordle: boolean = false;
  public playMode: "availableSentences" = "availableSentences";
  public playModeW: "availableSentences" = "availableSentences";
  public enableAudio: boolean = false;
  public questions: H5pGuessItQuestion[] = [];
  public questionsW: H5pGuessItQuestion[] = [];
  public behaviour: {
    caseSensitive: boolean;
    enableNumChoice: boolean;
    enableItemCountChoice: boolean;
    enableSolutionsButton: boolean;
    enableEndGameButton: boolean;
    numRounds: number;
    maxTries: number;
    displayAudio: "correct" | "always";
    listGuessedSentences: boolean;
    listGuessedAudioAndTips: "none" | "audioAndTip" | "tipOnly" | "audioOnly";
    sentencesOrder: "normal" | "random";
  };
}
