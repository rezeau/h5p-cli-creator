import { ContentCreator } from "./content-creator";
import { H5pPackage } from "./h5p-package";
import { H5PDialogCardsPapiJoContent } from "./models/h5p-dialog-cardsPapiJo-content";
import { H5pImage } from "./models/h5p-image";

export class DialogCardsPapiJoCreator extends ContentCreator<H5PDialogCardsPapiJoContent> {
  constructor(
    h5pPackage: H5pPackage,
    private data: Array<{
      front: string;
      back: string;
      image?: string;
    }>,
    private mode: "repetition" | "normal"
  ) {
    super(h5pPackage);
  }

  /**
   * Sets the description displayed when showing the flashcards.
   * @param description
   */
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
    contentObject.dialogs = new Array();

    let imageCounter = 0;

    for (const line of this.data) {
      const card = {
        text: line.front,
        answer: line.back
      };
      if (line.image) {
        try {
          let ret = await H5pImage.fromDownload(line.image);
          let filename = this.getFilenameForImage(
            imageCounter++,
            ret.extension
          );
          this.h5pPackage.addContentFile(filename, ret.buffer);
          ret.image.path = filename;
          card["image"] = ret.image;
          console.log(
            `Downloaded image from ${line.image}. (${ret.buffer.byteLength} bytes)`
          );
        } catch (exc) {
          console.error(exc);
          card["image"] = undefined;
        }
      }
      contentObject.dialogs.push(card);
    }
    contentObject.mode = this.mode;
  }

  protected addSettings(contentObject: H5PDialogCardsPapiJoContent) {
    contentObject.behaviour = {
      disableBackwardsNavigation: false,
      randomCards: true,
      scaleTextNotCard: false
    };
  }

  private getFilenameForImage(counter: number, extension: string) {
    return `images/${counter}.${extension}`;
  }
}
