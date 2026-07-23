# h5p-cli-creator

This is a command line utility that allows you to mass create H5P content from input files using the command line. It is written in TypeScript and runs on NodeJS, meaning it's platform independent. It supports *Flashcards*, *Dialog Cards*, *Dialog Cards Papi Jo*, and *GuessIt*. You can use the infrastructure provided here to add functionality for other content types. Pull requests are welcomed!

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

Creates sentence-mode `H5P.GuessIt` 1.6 content. To create a Wordle-mode activity instead, use `--mode=wordle`, for example:

`node ./dist/index.js guessit ./tests/fixtures/guessit-wordle-regression.csv ./guessit-wordle.h5p -n="Guess the words" --mode=wordle --max-tries=8`

### GuessIt CSV columns

The GuessIt importer uses this structure:

```csv
item;tip;audio
"OpenAI creates helpful tools";Four words;../sound.mp3
```

`item` is required. `tip` and `audio` are optional. Audio can be a local path relative to the CSV file or an HTTP/HTTPS URL.

Sentence mode accepts any non-empty item. Wordle mode requires a single word containing 4 to 8 letters supported by GuessIt 1.6; spaces, digits, punctuation, and unsupported characters are rejected before a package is created.

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

The `content-type-cache` directory contains pinned H5P packages used by the commands, including the custom `H5P.GuessIt` library bundle. A pinned package can be either a complete content package or a library bundle. Keeping these packages in the repository makes output reproducible and allows the CLI to work offline. If a package is absent, the loader can attempt to download its machine name from the H5P Hub.

A `development-packages` directory may be used for versioned H5P library bundles while adding or upgrading content types. Library bundles do not need to contain `h5p.json` or `content/content.json`; the package loader can create the required metadata from the runnable library and its dependency graph. Once an integration is approved, its production bundle belongs in `content-type-cache` and the redundant development copy can be removed.

Run `npm test` after changing a cached package, a development package, or content-generation code.

## Coding conventions
All classes that exist in the actual H5P libraries or content types start with `H5p`, e.g. `H5pImage`. All classes that are part of the creator and don't exist in external libraries or content types don't start with this prefix.
