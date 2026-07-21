import * as path from "path";

import { ContentCreator } from "./content-creator";
import { H5pPackage } from "./h5p-package";
import { H5pAudio } from "./models/h5p-audio";
import {
  DialogCardsPapiJoPlayMode,
  H5PDialogCardsPapiJoContent,
  H5PDialogCardsPapiJoDialog,
} from "./models/h5p-dialog-cardsPapiJo-content";
import { H5pImage } from "./models/h5p-image";

interface DialogCardsPapiJoCsvRow {
  front: string;
  back?: string;
  image?: string;
  imageAltText?: string;
  image2?: string;
  imageAltText2?: string;
  audio?: string;
  audio2?: string;
  tipFront?: string;
  tipBack?: string;
  categories?: string;
}

export class DialogCardsPapiJoCreator extends ContentCreator<H5PDialogCardsPapiJoContent> {
  constructor(
    h5pPackage: H5pPackage,
    private data: DialogCardsPapiJoCsvRow[],
    private playMode: DialogCardsPapiJoPlayMode,
    sourcePath: string
  ) {
    super(h5pPackage, sourcePath);
  }

  public setTitle(title: string) {
    this.h5pPackage.h5pMetadata.title = title;
    this.h5pPackage.addMetadata(this.h5pPackage.h5pMetadata);
  }

  protected contentObjectFactory(): H5PDialogCardsPapiJoContent {
    return new H5PDialogCardsPapiJoContent();
  }

  protected async addContent(
    contentObject: H5PDialogCardsPapiJoContent
  ): Promise<void> {
    contentObject.dialogs = [];

    let imageCounter = 0;
    let audioCounter = 0;

    for (const line of this.data) {
      const card: H5PDialogCardsPapiJoDialog = {
        text: line.front,
        answer: line.back,
        imageMedia: {},
        audioMedia: {},
        tips: {},
      };

      if (line.image) {
        const image = await this.addImage(line.image, imageCounter++);
        if (image) {
          card.imageMedia.image = image;
        }
      }
      if (line.imageAltText) {
        card.imageMedia.imageAltText = line.imageAltText;
      }
      if (line.image2) {
        const image = await this.addImage(line.image2, imageCounter++);
        if (image) {
          card.imageMedia.image2 = image;
        }
      }
      if (line.imageAltText2) {
        card.imageMedia.imageAltText2 = line.imageAltText2;
      }
      if (line.audio) {
        const audio = await this.addAudio(line.audio, audioCounter++);
        if (audio) {
          card.audioMedia.audio = [audio];
        }
      }
      if (line.audio2) {
        const audio = await this.addAudio(line.audio2, audioCounter++);
        if (audio) {
          card.audioMedia.audio2 = [audio];
        }
      }
      if (line.tipFront) {
        card.tips.front = line.tipFront;
      }
      if (line.tipBack) {
        card.tips.back = line.tipBack;
      }
      if (line.categories) {
        card.itemCategories = line.categories;
        contentObject.enableCategories = true;
      }

      contentObject.dialogs.push(card);
    }
  }

  protected addSettings(contentObject: H5PDialogCardsPapiJoContent) {
    contentObject.behaviour = {
      filterByCategories: "noFilter",
      playMode: this.playMode,
      allowedPlayModes: {
        normalMode: true,
        browseSideBySide: true,
        matchMode: true,
        matchRepetition: true,
        selfCorrectionMode: true,
      },
      noTextOnCards: false,
      hideTurnButton: false,
      enableRetry: true,
      scaleTextNotCard: false,
      noDupeFrontPicToBack: false,
      cardsOrderChoice: "normal",
      enableCardsNumber: false,
      cardsSideChoice: "frontFirst",
      penalty: 0,
      passPercentage: 100,
    };
  }

  private async addImage(source: string, counter: number): Promise<H5pImage> {
    try {
      const result = this.isRemote(source)
        ? await H5pImage.fromDownload(source)
        : await H5pImage.fromLocalFile(path.join(this.sourcePath, source));
      const filename = `images/${counter}${result.extension}`;
      this.h5pPackage.addContentFile(filename, result.buffer);
      result.image.path = filename;
      console.log(`Added image from ${source}. (${result.buffer.byteLength} bytes)`);
      return result.image;
    } catch (error) {
      console.error(error);
      return undefined;
    }
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
