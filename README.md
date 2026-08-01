# h5p-cli-creator

This is a command line utility that allows you to mass create H5P content from input files using the command line. It is written in TypeScript and runs on NodeJS, meaning it's platform independent. It supports *Flashcards*, *Dialog Cards*, *Dialog Cards Papi Jo*, and *GuessIt*. You can use the infrastructure provided here to add functionality for other content types. Pull requests are welcomed!

## Automatic H5P library retrieval

When a required package is absent from `content-type-cache`, official H5P libraries such as Flashcards and Dialog Cards are retrieved through the H5P Hub fallback. The custom `H5P.DialogcardsPapiJo` and `H5P.GuessIt` libraries are retrieved from pinned GitHub Release assets instead.

| Library | Retrieval source |
|----------|------------------|
| Flashcards | Official H5P Hub |
| Dialog Cards | Official H5P Hub |
| Dialog Cards Papi Jo | Pinned GitHub Release |
| GuessIt | Pinned GitHub Release |

Downloads are validated, including pinned SHA-256 checksums for the custom packages, and then cached locally. Later runs reuse valid cached packages without downloading them again, allowing conversions to work offline. See [H5P package sources](#h5p-package-sources) for pinned versions, checksums, and troubleshooting.

## Node.js support

This project supports Node.js 22 from version 22.13.0 onward and Node.js 24. Node.js 22 is the preferred version for local development and is recorded in `.nvmrc`.

Check the active versions before installing or running the project:

* `node --version`
* `npm --version`

If you use a Node version manager that supports `.nvmrc`, run `nvm use` from the repository directory to select Node.js 22. Run `npm install` or `npm ci` only while using one of the supported Node.js versions.

## Run
* Install [NodeJS](https://nodejs.org/)
* [clone this repository](https://help.github.com/articles/cloning-a-repository/) into a directory on your computer
* Execute these commands from the command line at the directory you've cloned into:
* `npm install` to install dependencies
* `npm run build` to transpile typescript to javascript
* `node ./dist/index.js --help` to get help
* `node ./dist/index.js flashcards --help` to get help for creating flashcards
* `node ./dist/index.js dialogcards --help` to get help for creating Dialog Cards
* `node ./dist/index.js dialogcardsPapiJo --help` to get help for creating Dialog Cards Papi Jo
* `node ./dist/index.js guessit --help` to get help for creating GuessIt activities

## CSV input file encoding

All input CSV files should be saved as **UTF-8 without BOM**. A UTF-8 byte order mark (BOM) can become part of the first column heading and prevent the importer from recognizing that column correctly.

When exporting CSV from a spreadsheet or text editor, select an option named `UTF-8`, `UTF-8 without BOM`, or `UTF-8 (no BOM)`. Avoid options explicitly named `UTF-8 with BOM` or `UTF-8-BOM`.

## Full and minimal H5P packages

Every command supports:

* `--package-mode=full` — includes the content and all H5P libraries. This is the default and preserves the previous behavior.
* `--package-mode=minimal` — includes only `h5p.json` and the `content/` folder, including any generated `content/images/` and `content/audios/` files.

> **IMPORTANT LIMITATION:** A minimal package is not self-contained. The destination platform must already have every library and matching major/minor version declared in `h5p.json`. If any dependency is missing, the minimal package will not import or run correctly.

This is especially important for the custom `H5P.DialogcardsPapiJo` and `H5P.GuessIt` libraries. Install a full package or the appropriate library bundle on the destination platform before importing minimal packages. Use full mode when transferring content to an unknown platform, installing a content type for the first time, or creating a portable archive.

Minimal mode keeps the complete `preloadedDependencies` list in `h5p.json`; only the physical library directories are omitted. The command also prints the dependency warning whenever minimal mode is used.

Example:

`node ./dist/index.js guessit ./tests/fixtures/guessit-wordle-regression.csv ./guessit-minimal.h5p --mode=wordle --package-mode=minimal`

## Example calls
`node ./dist/index.js flashcards ./tests/flash1.csv ./outputfile.h5p -l=de -t="Meine Karteikarten" --description="\"Schreibe die Übersetzungen in das Eingabefeld.\""`

Reads the file `flash1.csv` in the `tests` directory and outputs a h5p file with the filename `outputfile.h5p` in the current directory. The language strings will be set to German, the title 'Meine Karteikarten' and the description displayed when studying the flashcards will be 'Schreibe die Übersetzungen in das Eingabefeld.'

`node ./dist/index.js dialogcards ./tests/dialog1.csv ./outputfile.h5p -l=de -n="Meine Karteikarten" -m="repetition"`

Reads the file `dialog1.csv` in the `tests` directory and outputs a h5p file with the filename `outputfile.h5p` in the current directory. The language strings will be set to German and the title to 'Meine Karteikarten'.

`node ./dist/index.js dialogcardsPapiJo ./tests/h6c4.csv ./outputfile.h5p -l=fr -n="Dialog Cards Papi Jo" -m="selfCorrectionMode"`

Reads the file `h6c4.csv` in the `tests` directory and outputs a h5p file with the filename `outputfile.h5p` in the current directory. The language strings will be set to French and the title to 'Dialog Cards Papi Jo'. The play mode will be set to self-correction.

`node ./dist/index.js guessit ./tests/fixtures/guessit-sentences.csv ./guessit-sentences.h5p -n="Guess the sentences" --description="Enter the missing sentence"`

Creates sentence-mode `H5P.GuessIt` 1.8.0 content. To create a Wordle-mode activity instead, use `--mode=wordle`, for example:

`node ./dist/index.js guessit ./tests/fixtures/guessit-wordle-regression.csv ./guessit-wordle.h5p -n="Guess the words" --mode=wordle --max-tries=8`

### GuessIt CSV columns

The GuessIt importer uses this structure:

```csv
item;tip;audio
"OpenAI creates helpful tools";Four words;../sound.mp3
```

`item` is required. `tip` and `audio` are optional. Audio can be a local path relative to the CSV file or an HTTP/HTTPS URL.

Sentence mode accepts any non-empty item. Wordle mode requires a single word containing 4 to 8 letters supported by GuessIt 1.8.0; spaces, digits, punctuation, and unsupported characters are rejected before a package is created.

GuessIt options include:

* `--mode=sentence|wordle`
* `--case-sensitive` for sentence mode
* `--max-tries=6` (an even number of at least 6) for Wordle mode
* `--random` to randomize imported items
* `--show-solutions` for sentence mode
* `--item-count-choice` to let learners choose the number of items
* `--audio-display=correct|always`

This command creates the custom `H5P.GuessIt` content type. It does not create the unrelated standard `H5P.GuessTheAnswer` content type.

### Dialog Cards Papi Jo CSV columns

Dialog Cards Papi Jo 1.17.1 remains compatible with the original CSV structure:

```csv
front;back;image
```

It also supports separate media and information for both sides of each card:

```csv
front;back;image;imageAltText;image2;imageAltText2;audio;audio2;tipFront;tipBack;categories
```

`image` and `audio` apply to the front; `image2` and `audio2` apply to the back. Media values can be local paths relative to the CSV file or HTTP/HTTPS URLs. Multiple categories must be separated with commas and no spaces. All columns except `front` are optional.

Available play modes are `normalMode`, `browseSideBySide`, `matchMode`, `matchRepetition`, `selfCorrectionMode`, and `user`.

## H5P package sources

The `content-type-cache` directory contains pinned H5P packages used by the commands. Package lookup is cache-first and case-insensitive. If a matching cache file exists, it is authoritative and no network request or automatic refresh is performed.

When an official package is absent, the loader retains its existing H5P Hub fallback. The following third-party packages instead have versioned, checksum-pinned GitHub Release sources:

- `H5P.DialogcardsPapiJo` 1.17.1 is stored as `content-type-cache/H5P.DialogcardsPapiJo.h5p` and retrieved from the [v1.17.1 release](https://github.com/rezeau/h5p-dialogcards-papijo/releases/tag/v1.17.1), with SHA-256 `E6AE57451E3A898D3693871C149F2528523DFDD869D0A6F84EE5347D7CDA38EB`.
- `H5P.GuessIt` 1.8.0 is stored as `content-type-cache/H5P.GuessIt.h5p` and retrieved from the [v1.8.0 release](https://github.com/rezeau/h5p-guessit-papijo/releases/tag/v1.8.0), with SHA-256 `5B99436701E52BF22794F4A256A39CB88862F644EE2D0D7DD7C1136EAB857AEB`.

Downloads use bounded redirects, a timeout, and a maximum response size. A package is written to a temporary file in the cache directory, then its checksum, ZIP structure, library identity and version, runnable metadata, semantics, and dependency graph are validated before it is published atomically under the canonical cache filename. Failed downloads and validations leave no cache entry. A successfully cached package is reused on later runs, including offline runs.

### Refreshing a cached package

Valid cached packages are not refreshed automatically. If a cached package is obsolete or corrupt, remove the relevant file from `content-type-cache` and run the command again. The package will be retrieved again from its configured H5P Hub or pinned GitHub Release source.

A pinned package can be either a complete content package or a library bundle. Keeping packages in the repository makes output reproducible and allows the CLI to work offline.

A `development-packages` directory may be used for versioned H5P library bundles while adding or upgrading content types. Library bundles do not need to contain `h5p.json` or `content/content.json`; the package loader can create the required metadata from the runnable library and its dependency graph. Once an integration is approved, its production bundle belongs in `content-type-cache` and the redundant development copy can be removed.

Run `npm test` after changing a cached package, a development package, or content-generation code.

## Coding conventions
All classes that exist in the actual H5P libraries or content types start with `H5p`, e.g. `H5pImage`. All classes that are part of the creator and don't exist in external libraries or content types don't start with this prefix.
