export interface H5pPackageVersion {
  major: number;
  minor: number;
  patch: number;
}

export interface H5pPackageSource {
  machineName: string;
  version: H5pPackageVersion;
  cacheFilename: string;
  downloadUrl: string;
  expectedLibraryDirectory: string;
  sha256: string;
}

export const customPackageSources: ReadonlyArray<H5pPackageSource> = [
  {
    machineName: "H5P.DialogcardsPapiJo",
    version: {
      major: 1,
      minor: 17,
      patch: 1
    },
    cacheFilename: "H5P.DialogcardsPapiJo.h5p",
    downloadUrl:
      "https://github.com/rezeau/h5p-dialogcards-papijo/releases/download/" +
      "v1.17.1/H5P.DialogcardsPapiJo-1.17.1.h5p",
    expectedLibraryDirectory: "H5P.DialogcardsPapiJo-1.17",
    sha256:
      "E6AE57451E3A898D3693871C149F2528523DFDD869D0A6F84EE5347D7CDA38EB"
  },
  {
    machineName: "H5P.GuessIt",
    version: {
      major: 1,
      minor: 7,
      patch: 0
    },
    cacheFilename: "H5P.GuessIt.h5p",
    downloadUrl:
      "https://github.com/rezeau/h5p-guessit-papijo/releases/download/" +
      "v1.7.0/H5P.GuessIt-1.7.0.h5p",
    expectedLibraryDirectory: "H5P.GuessIt-1.7",
    sha256:
      "04B987E8C20D2E76FD21DC8A4CDF5926FF3E20AC889BE9A98CB75872B57A968A"
  }
];
