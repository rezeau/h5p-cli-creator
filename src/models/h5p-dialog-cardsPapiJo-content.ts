import { H5pContent } from "./h5p-content";
import { H5pImage } from "./h5p-image";

export class H5PDialogCardsPapiJoContent extends H5pContent {
  public title: string;
  public description: string;
  public enableCategories: boolean;
  public dialogs: {
    text: string;
    answer: string;
    image?: H5pImage;
    imageAltText?: string;
    image2?: H5pImage;
    imageAltText2?: string;
  }[];
  public behaviour: {
    playMode: "normalMode" | "matchMode" | "matchRepetition" | "selfCorrectionMode";
		enableRetry: boolean;
		scaleTextNotCard: boolean;
    noTextOnCards: boolean;
    cardsOrderChoice: string,
    cardsSideChoice:  string
  };
}
