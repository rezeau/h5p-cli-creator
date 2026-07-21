import { H5pAudio } from "./h5p-audio";
import { H5pContent } from "./h5p-content";
import { H5pImage } from "./h5p-image";

export type DialogCardsPapiJoPlayMode =
  | "normalMode"
  | "browseSideBySide"
  | "matchMode"
  | "matchRepetition"
  | "selfCorrectionMode"
  | "user";

export interface H5PDialogCardsPapiJoDialog {
  text: string;
  answer?: string;
  imageMedia: {
    image?: H5pImage;
    imageAltText?: string;
    image2?: H5pImage;
    imageAltText2?: string;
  };
  audioMedia: {
    audio?: H5pAudio[];
    audio2?: H5pAudio[];
  };
  tips: {
    front?: string;
    back?: string;
  };
  itemCategories?: string;
}

export class H5PDialogCardsPapiJoContent extends H5pContent {
  public info: boolean = false;
  public title: string;
  public description: string;
  public enableCategories: boolean = false;
  public dialogs: H5PDialogCardsPapiJoDialog[] = [];
  public behaviour: {
    filterByCategories: "noFilter" | "userFilter";
    playMode: DialogCardsPapiJoPlayMode;
    allowedPlayModes: {
      normalMode: boolean;
      browseSideBySide: boolean;
      matchMode: boolean;
      matchRepetition: boolean;
      selfCorrectionMode: boolean;
    };
    noTextOnCards: boolean;
    hideTurnButton: boolean;
    enableRetry: boolean;
    scaleTextNotCard: boolean;
    noDupeFrontPicToBack: boolean;
    cardsOrderChoice: "normal" | "random" | "user";
    enableCardsNumber: boolean;
    cardsSideChoice: "frontFirst" | "backFirst" | "user";
    penalty: number;
    passPercentage: number;
  };
}
