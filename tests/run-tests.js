const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const JSZip = require("jszip");
const { H5pPackage } = require("../dist/h5p-package");

const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "dist", "index.js");
const fixturesPath = path.join(__dirname, "fixtures");

function runCli(args, cwd) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cwd || projectRoot,
    encoding: "utf8",
  });

  if (result.status !== 0) {
    throw new Error(
      [
        `CLI failed with exit code ${result.status}.`,
        result.stdout,
        result.stderr,
      ]
        .filter(Boolean)
        .join("\n")
    );
  }
}

function runCliExpectFailure(args, cwd) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cwd || projectRoot,
    encoding: "utf8",
  });

  assert.notStrictEqual(
    result.status,
    0,
    `Expected CLI to fail, but it exited successfully.\n${result.stdout}\n${result.stderr}`
  );
  return `${result.stdout}\n${result.stderr}`;
}

async function loadPackage(packagePath) {
  assert.ok(fs.existsSync(packagePath), `Expected output package ${packagePath}`);
  return JSZip.loadAsync(fs.readFileSync(packagePath));
}

async function readJson(zip, entryPath) {
  const entry = zip.file(entryPath);
  assert.ok(entry, `Expected ${entryPath} in generated package`);
  return JSON.parse(await entry.async("text"));
}

function assertDependency(metadata, machineName, majorVersion, minorVersion) {
  const dependency = metadata.preloadedDependencies.find(
    (candidate) => candidate.machineName === machineName
  );
  assert.ok(dependency, `Expected dependency ${machineName}`);
  assert.strictEqual(String(dependency.majorVersion), String(majorVersion));
  assert.strictEqual(String(dependency.minorVersion), String(minorVersion));
}

async function testFlashcards(tempPath) {
  const outputPath = path.join(tempPath, "flashcards.h5p");
  runCli([
    "flashcards",
    path.join(fixturesPath, "flashcards-local.csv"),
    outputPath,
    "-t",
    "Regression Flashcards",
    "--description",
    "Regression description",
  ], tempPath);

  const zip = await loadPackage(outputPath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");

  assert.strictEqual(metadata.title, "Regression Flashcards");
  assert.strictEqual(metadata.mainLibrary, "H5P.Flashcards");
  assertDependency(metadata, "H5P.Flashcards", 1, 5);
  assert.ok(zip.file("H5P.Flashcards-1.5/library.json"));

  assert.strictEqual(content.description, "Regression description");
  assert.strictEqual(content.caseSensitive, false);
  assert.strictEqual(content.showSolutionsRequiresInput, true);
  assert.strictEqual(content.cards.length, 2);
  assert.deepStrictEqual(
    {
      text: content.cards[0].text,
      answer: content.cards[0].answer,
      tip: content.cards[0].tip,
    },
    {
      text: "Question; including a delimiter",
      answer: "Answer 1",
      tip: "Helpful tip",
    }
  );
  assert.strictEqual(content.cards[0].image.path, "images/0.jpg");
  assert.strictEqual(content.cards[0].image.mime, "image/jpeg");
  assert.ok(content.cards[0].image.width > 0);
  assert.ok(content.cards[0].image.height > 0);
  assert.ok(zip.file("content/images/0.jpg"));
}

async function testDialogCards(tempPath) {
  const outputPath = path.join(tempPath, "dialogcards.h5p");
  runCli([
    "dialogcards",
    path.join(fixturesPath, "dialogcards-local.csv"),
    outputPath,
    "-n",
    "Regression Dialog Cards",
    "-m",
    "normal",
  ], tempPath);

  const zip = await loadPackage(outputPath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");

  assert.strictEqual(metadata.title, "Regression Dialog Cards");
  assert.strictEqual(metadata.mainLibrary, "H5P.Dialogcards");
  assertDependency(metadata, "H5P.Dialogcards", 1, 8);
  assert.ok(zip.file("H5P.Dialogcards-1.8/library.json"));

  assert.strictEqual(content.mode, "normal");
  assert.deepStrictEqual(content.behaviour, {
    disableBackwardsNavigation: false,
    randomCards: true,
    scaleTextNotCard: false,
  });
  assert.strictEqual(content.dialogs.length, 2);
  assert.strictEqual(content.dialogs[0].text, "Front 1");
  assert.strictEqual(content.dialogs[0].answer, "Back 1");
  assert.strictEqual(content.dialogs[0].image.path, "images/0.jpg");
  assert.ok(Array.isArray(content.dialogs[0].audio));
  assert.strictEqual(content.dialogs[0].audio[0].path, "audios/0.mp3");
  assert.strictEqual(content.dialogs[0].audio[0].mime, "audio/mpeg");
  assert.ok(zip.file("content/images/0.jpg"));
  assert.ok(zip.file("content/audios/0.mp3"));
}

async function testDialogCardsPapiJo(tempPath) {
  const outputPath = path.join(tempPath, "dialogcards-papijo.h5p");
  runCli([
    "dialogcardsPapiJo",
    path.join(fixturesPath, "dialogcards-papijo-legacy.csv"),
    outputPath,
    "-n",
    "Regression Dialog Cards Papi Jo",
    "-m",
    "selfCorrectionMode",
  ], tempPath);

  const zip = await loadPackage(outputPath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");

  assert.strictEqual(metadata.title, "Regression Dialog Cards Papi Jo");
  assert.strictEqual(metadata.mainLibrary, "H5P.DialogcardsPapiJo");
  assertDependency(metadata, "H5P.DialogcardsPapiJo", 1, 17);
  assert.ok(zip.file("H5P.DialogcardsPapiJo-1.17/library.json"));

  assert.deepStrictEqual(content.dialogs, [
    {
      text: "Front 1",
      answer: "Back 1",
      imageMedia: {},
      audioMedia: {},
      tips: {},
    },
    {
      text: "Front 2",
      answer: "Back 2",
      imageMedia: {},
      audioMedia: {},
      tips: {},
    },
  ]);
  assert.strictEqual(content.enableCategories, false);
  assert.strictEqual(content.info, false);
  assert.deepStrictEqual(content.behaviour, {
    filterByCategories: "noFilter",
    playMode: "selfCorrectionMode",
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
  });
  assert.strictEqual(content.answer, "Turn");
  assert.strictEqual(content.retry, "Retry");
}

async function testDialogCardsPapiJoMedia(tempPath) {
  const outputPath = path.join(tempPath, "dialogcards-papijo-media.h5p");
  runCli([
    "dialogcardsPapiJo",
    path.join(fixturesPath, "dialogcards-papijo-local.csv"),
    outputPath,
    "-n",
    "Dialog Cards Papi Jo Media",
    "-m",
    "browseSideBySide",
  ], tempPath);

  const zip = await loadPackage(outputPath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");
  const firstCard = content.dialogs[0];

  assert.strictEqual(metadata.title, "Dialog Cards Papi Jo Media");
  assertDependency(metadata, "H5P.DialogcardsPapiJo", 1, 17);
  assert.strictEqual(content.behaviour.playMode, "browseSideBySide");
  assert.strictEqual(content.enableCategories, true);
  assert.strictEqual(firstCard.imageMedia.image.path, "images/0.jpg");
  assert.strictEqual(firstCard.imageMedia.imageAltText, "Front image");
  assert.strictEqual(firstCard.imageMedia.image2.path, "images/1.jpg");
  assert.strictEqual(firstCard.imageMedia.imageAltText2, "Back image");
  assert.strictEqual(firstCard.audioMedia.audio[0].path, "audios/0.mp3");
  assert.strictEqual(firstCard.audioMedia.audio[0].mime, "audio/mpeg");
  assert.strictEqual(firstCard.audioMedia.audio2[0].path, "audios/1.mp3");
  assert.strictEqual(firstCard.audioMedia.audio2[0].mime, "audio/mpeg");
  assert.deepStrictEqual(firstCard.tips, {
    front: "Front tip",
    back: "Back tip",
  });
  assert.strictEqual(firstCard.itemCategories, "history,greek");
  assert.ok(zip.file("content/images/0.jpg"));
  assert.ok(zip.file("content/images/1.jpg"));
  assert.ok(zip.file("content/audios/0.mp3"));
  assert.ok(zip.file("content/audios/1.mp3"));
}

async function testLibraryBundle(tempPath) {
  const h5pPackage = await H5pPackage.createFromHub("h5p.guessit", "en");

  assert.strictEqual(h5pPackage.h5pMetadata.mainLibrary, "H5P.GuessIt");
  assert.strictEqual(h5pPackage.h5pMetadata.title, "Guess It");
  assert.deepStrictEqual(h5pPackage.h5pMetadata.embedTypes, ["iframe"]);
  assertDependency(h5pPackage.h5pMetadata, "H5P.GuessIt", 1, 6);
  assertDependency(h5pPackage.h5pMetadata, "H5P.Timer", 0, 4);
  assertDependency(h5pPackage.h5pMetadata, "H5P.Question", 1, 5);
  assertDependency(h5pPackage.h5pMetadata, "H5P.Audio", 1, 5);

  h5pPackage.clearContent();
  h5pPackage.addMainContentFile(JSON.stringify({ questions: [] }));
  const outputPath = path.join(tempPath, "guessit-library-bundle.h5p");
  await h5pPackage.savePackage(outputPath);

  const zip = await loadPackage(outputPath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");
  assert.strictEqual(metadata.mainLibrary, "H5P.GuessIt");
  assert.deepStrictEqual(content, { questions: [] });
  assert.ok(zip.file("H5P.GuessIt-1.6/library.json"));
  assert.ok(zip.file("H5P.Timer-0.4/library.json"));
  assert.ok(zip.file("H5P.Question-1.5/library.json"));

}

async function testGuessItSentences(tempPath) {
  const outputPath = path.join(tempPath, "guessit-sentences.h5p");
  runCli([
    "guessit",
    path.join(fixturesPath, "guessit-sentences.csv"),
    outputPath,
    "-n",
    "Regression GuessIt Sentences",
    "--description",
    "Guess the imported sentences",
    "--case-sensitive",
    "--random",
    "--show-solutions",
    "--item-count-choice",
    "--audio-display",
    "always",
  ], tempPath);

  const zip = await loadPackage(outputPath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");

  assert.strictEqual(metadata.title, "Regression GuessIt Sentences");
  assert.strictEqual(metadata.mainLibrary, "H5P.GuessIt");
  assertDependency(metadata, "H5P.GuessIt", 1, 6);
  assert.ok(zip.file("H5P.GuessIt-1.6/library.json"));

  assert.strictEqual(content.info, false);
  assert.strictEqual(content.description, "Guess the imported sentences");
  assert.strictEqual(content.wordle, false);
  assert.strictEqual(content.playMode, "availableSentences");
  assert.strictEqual(content.playModeW, "availableSentences");
  assert.strictEqual(content.enableAudio, true);
  assert.strictEqual(content.questions.length, 2);
  assert.deepStrictEqual(content.questionsW, []);
  assert.strictEqual(content.questions[0].sentence, "OpenAI creates helpful tools");
  assert.strictEqual(content.questions[0].tip, "Four words");
  assert.strictEqual(content.questions[0].audio[0].path, "audios/0.mp3");
  assert.strictEqual(content.questions[0].audio[0].mime, "audio/mpeg");
  assert.ok(zip.file("content/audios/0.mp3"));
  assert.deepStrictEqual(content.behaviour, {
    caseSensitive: true,
    enableNumChoice: false,
    enableItemCountChoice: true,
    enableSolutionsButton: true,
    enableEndGameButton: false,
    numRounds: 1,
    maxTries: 6,
    displayAudio: "always",
    listGuessedSentences: false,
    listGuessedAudioAndTips: "none",
    sentencesOrder: "random",
  });
  assert.strictEqual(typeof content.confirmEndGame, "object");
  assert.strictEqual(typeof content.confirmResetGame, "object");
}

async function testGuessItWordle(tempPath) {
  const outputPath = path.join(tempPath, "guessit-wordle.h5p");
  runCli([
    "guessit",
    path.join(fixturesPath, "guessit-wordle.csv"),
    outputPath,
    "-n",
    "Regression GuessIt Wordle",
    "--mode",
    "wordle",
    "--max-tries",
    "8",
  ], tempPath);

  const zip = await loadPackage(outputPath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");

  assert.strictEqual(metadata.title, "Regression GuessIt Wordle");
  assertDependency(metadata, "H5P.GuessIt", 1, 6);
  assert.strictEqual(content.wordle, true);
  assert.deepStrictEqual(content.questions, []);
  assert.strictEqual(content.questionsW.length, 2);
  assert.strictEqual(content.questionsW[0].sentence, "Paris");
  assert.strictEqual(content.questionsW[1].sentence, "École");
  assert.strictEqual(content.questionsW[0].audio[0].path, "audios/0.mp3");
  assert.strictEqual(content.behaviour.caseSensitive, false);
  assert.strictEqual(content.behaviour.maxTries, 8);
  assert.strictEqual(content.behaviour.listGuessedSentences, true);
  assert.ok(zip.file("content/audios/0.mp3"));
}

async function testGuessItValidation(tempPath) {
  const outputPath = path.join(tempPath, "invalid-wordle.h5p");
  const output = runCliExpectFailure([
    "guessit",
    path.join(fixturesPath, "guessit-invalid-wordle.csv"),
    outputPath,
    "--mode",
    "wordle",
  ], tempPath);

  assert.match(output, /Wordle items must contain 4 to 8 supported letters/);
  assert.strictEqual(fs.existsSync(outputPath), false);
}

async function testPackageErrors(tempPath) {
  await assert.rejects(
    H5pPackage.createFromFile(
      "content-type-cache/H5P.GuessIt.h5p",
      "H5P.DoesNotExist",
      "en"
    ),
    /no h5p\.json and no runnable library matching H5P\.DoesNotExist/
  );

  await assert.rejects(
    H5pPackage.createFromFile(
      "content-type-cache/H5P.GuessIt.h5p",
      "H5P.GuessIt",
      "zz"
    ),
    /Language file zz\.json not found for library H5P\.GuessIt 1\.6/
  );

  const emptyArchive = new JSZip();
  const emptyArchivePath = path.join(tempPath, "empty.h5p");
  fs.writeFileSync(
    emptyArchivePath,
    await emptyArchive.generateAsync({ type: "nodebuffer" })
  );
  await assert.rejects(
    H5pPackage.createFromFile(emptyArchivePath, "H5P.Empty", "en"),
    /no h5p\.json and no runnable library matching H5P\.Empty/
  );

  await assert.rejects(
    H5pPackage.createFromFile(
      "content-type-cache/H5P.Flashcards.h5p",
      "H5P.Dialogcards",
      "en"
    ),
    /main library H5P\.Flashcards does not match requested content type H5P\.Dialogcards/
  );

  await assert.rejects(
    H5pPackage.createFromFile(
      "content-type-cache/does-not-exist.h5p",
      "H5P.Missing",
      "en"
    ),
    /H5P package file not found:/
  );
}

async function runTest(name, test, tempPath) {
  await test(tempPath);
  console.log(`PASS ${name}`);
}

async function main() {
  const tempPath = fs.mkdtempSync(
    path.join(os.tmpdir(), "h5p-cli-creator-tests-")
  );

  try {
    await runTest("Flashcards 1.5 importer", testFlashcards, tempPath);
    await runTest("Dialog Cards 1.8 importer", testDialogCards, tempPath);
    await runTest(
      "Dialog Cards Papi Jo 1.17 legacy CSV importer",
      testDialogCardsPapiJo,
      tempPath
    );
    await runTest(
      "Dialog Cards Papi Jo 1.17 media importer",
      testDialogCardsPapiJoMedia,
      tempPath
    );
    await runTest("GuessIt cached library bundle loader", testLibraryBundle, tempPath);
    await runTest("GuessIt sentence importer", testGuessItSentences, tempPath);
    await runTest("GuessIt Wordle importer", testGuessItWordle, tempPath);
    await runTest("GuessIt CSV validation", testGuessItValidation, tempPath);
    await runTest("Package validation errors", testPackageErrors, tempPath);
    console.log("All regression tests passed.");
  } finally {
    fs.rmSync(tempPath, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
