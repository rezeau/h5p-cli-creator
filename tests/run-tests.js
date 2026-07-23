const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawn, spawnSync } = require("child_process");
const JSZip = require("jszip");
const { H5pPackage } = require("../dist/h5p-package");

const projectRoot = path.resolve(__dirname, "..");
const cliPath = path.join(projectRoot, "dist", "index.js");
const fixturesPath = path.join(__dirname, "fixtures");
const httpFixtureServerPath = path.join(__dirname, "http-fixture-server.js");
const imageFixturePath = path.join(__dirname, "image1.jpg");
const audioFixturePath = path.join(__dirname, "sound.mp3");

function assertTemporaryOutputPath(outputArchivePath) {
  if (!outputArchivePath) {
    return;
  }
  const relativePath = path.relative(
    path.resolve(os.tmpdir()),
    path.resolve(outputArchivePath)
  );
  assert.ok(
    relativePath &&
      !relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== ".." &&
      !path.isAbsolute(relativePath),
    `Test output must remain under the operating-system temporary directory: ${outputArchivePath}`
  );
}

function createCliResult(result, outputArchivePath) {
  assertTemporaryOutputPath(outputArchivePath);
  return {
    status: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    outputArchivePath,
  };
}

function runCli(args, cwd, outputArchivePath) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cwd || projectRoot,
    encoding: "utf8",
  });
  const cliResult = createCliResult(result, outputArchivePath);

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
  return cliResult;
}

function runCliExpectFailure(args, cwd, outputArchivePath) {
  const result = spawnSync(process.execPath, [cliPath, ...args], {
    cwd: cwd || projectRoot,
    encoding: "utf8",
  });

  assert.notStrictEqual(
    result.status,
    0,
    `Expected CLI to fail, but it exited successfully.\n${result.stdout}\n${result.stderr}`
  );
  return createCliResult(result, outputArchivePath);
}

function combinedCliOutput(result) {
  return `${result.stdout}\n${result.stderr}`;
}

function startHttpFixtureServer() {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [httpFixtureServerPath], {
      cwd: projectRoot,
      stdio: ["pipe", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    let settled = false;

    const startupTimeout = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill();
      reject(
        new Error(
          `HTTP fixture server did not report a port in time.\n${stderr}`
        )
      );
    }, 5000);

    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (data) => {
      stderr += data;
    });
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (data) => {
      if (settled) {
        return;
      }
      stdout += data;
      const newlineIndex = stdout.indexOf("\n");
      if (newlineIndex === -1) {
        return;
      }

      let startup;
      try {
        startup = JSON.parse(stdout.slice(0, newlineIndex));
      } catch (error) {
        settled = true;
        clearTimeout(startupTimeout);
        child.kill();
        reject(
          new Error(
            `HTTP fixture server reported invalid startup data: ${stdout}`
          )
        );
        return;
      }

      if (!Number.isInteger(startup.port) || startup.port <= 0) {
        settled = true;
        clearTimeout(startupTimeout);
        child.kill();
        reject(
          new Error(
            `HTTP fixture server reported an invalid port: ${startup.port}`
          )
        );
        return;
      }
      settled = true;
      clearTimeout(startupTimeout);
      resolve({
        baseUrl: `http://127.0.0.1:${startup.port}`,
        child,
        getStderr: () => stderr,
      });
    });
    child.once("error", (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(startupTimeout);
      reject(error);
    });
    child.once("exit", (code, signal) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(startupTimeout);
      reject(
        new Error(
          `HTTP fixture server exited during startup with code ${code} ` +
            `and signal ${signal}.\n${stderr}`
        )
      );
    });
  });
}

function stopHttpFixtureServer(fixtureServer) {
  if (!fixtureServer || fixtureServer.child.exitCode !== null) {
    return Promise.resolve();
  }

  return new Promise((resolve, reject) => {
    const { child } = fixtureServer;
    let timedOut = false;
    const shutdownTimeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, 5000);

    child.once("exit", (code, signal) => {
      clearTimeout(shutdownTimeout);
      if (timedOut) {
        reject(new Error("HTTP fixture server did not shut down in time."));
        return;
      }
      if (code === 0 || signal === "SIGTERM") {
        resolve();
        return;
      }
      reject(
        new Error(
          `HTTP fixture server exited with code ${code} and signal ${signal}.` +
            `\n${fixtureServer.getStderr()}`
        )
      );
    });
    child.stdin.end("shutdown\n");
  });
}

function writeTemporaryCsv(tempPath, filename, content) {
  const csvPath = path.join(tempPath, filename);
  assertTemporaryOutputPath(csvPath);
  fs.writeFileSync(csvPath, content, "utf8");
  return csvPath;
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

async function assertZipFileBytes(zip, entryPath, expectedBytes) {
  const entry = zip.file(entryPath);
  assert.ok(entry, `Expected ${entryPath} in generated package`);
  const actualBytes = await entry.async("nodebuffer");
  assert.deepStrictEqual(
    actualBytes,
    expectedBytes,
    `Expected ${entryPath} to preserve the fixture bytes`
  );
}

function expectedLibraryEntry(dependency) {
  return (
    `${dependency.machineName}-${dependency.majorVersion}.` +
    `${dependency.minorVersion}/library.json`
  );
}

async function assertFullPackage(packagePath, expectedMedia = {}) {
  const zip = await loadPackage(packagePath);
  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");

  assert.strictEqual(
    typeof metadata.mainLibrary,
    "string",
    "Full package must declare a main library"
  );
  assert.ok(
    Array.isArray(metadata.preloadedDependencies),
    "Full package must declare preloaded dependencies"
  );

  const mainDependency = metadata.preloadedDependencies.find(
    (dependency) =>
      dependency.machineName.toLowerCase() ===
      metadata.mainLibrary.toLowerCase()
  );
  assert.ok(
    mainDependency,
    `Expected main library ${metadata.mainLibrary} in preloadedDependencies`
  );

  const archiveEntries = new Map(
    Object.keys(zip.files).map((entryName) => [
      entryName.toLowerCase(),
      entryName,
    ])
  );
  for (const dependency of metadata.preloadedDependencies) {
    const expectedEntry = expectedLibraryEntry(dependency);
    const actualEntry = archiveEntries.get(expectedEntry.toLowerCase());
    assert.ok(
      actualEntry,
      `Expected declared dependency ${dependency.machineName} ` +
        `${dependency.majorVersion}.${dependency.minorVersion} at ${expectedEntry}`
    );
    const libraryDefinition = await readJson(zip, actualEntry);
    assert.strictEqual(
      libraryDefinition.machineName.toLowerCase(),
      dependency.machineName.toLowerCase(),
      `Expected ${actualEntry} to define ${dependency.machineName}`
    );
    assert.strictEqual(
      String(libraryDefinition.majorVersion),
      String(dependency.majorVersion),
      `Expected ${actualEntry} to match the declared major version`
    );
    assert.strictEqual(
      String(libraryDefinition.minorVersion),
      String(dependency.minorVersion),
      `Expected ${actualEntry} to match the declared minor version`
    );
  }

  for (const [entryPath, expectedBytes] of Object.entries(expectedMedia)) {
    await assertZipFileBytes(zip, entryPath, expectedBytes);
  }

  return { zip, metadata, content };
}

function assertDependency(metadata, machineName, majorVersion, minorVersion) {
  const dependency = metadata.preloadedDependencies.find(
    (candidate) => candidate.machineName === machineName
  );
  assert.ok(dependency, `Expected dependency ${machineName}`);
  assert.strictEqual(String(dependency.majorVersion), String(majorVersion));
  assert.strictEqual(String(dependency.minorVersion), String(minorVersion));
}

function assertGuessItDevelopmentArtifactsAbsent(zip) {
  const entries = Object.keys(zip.files);
  assert.strictEqual(
    entries.some((entry) => entry.startsWith("H5P.GuessIt-1.6/tests/")),
    false,
    "GuessIt output must not contain its library test directory"
  );
  assert.strictEqual(zip.file("H5P.GuessIt-1.6/AGENTS.md"), null);
  assert.strictEqual(
    zip.file("H5P.GuessIt-1.6/WORDLE-FRENCH-ACCENTS.md"),
    null
  );
}

async function assertMinimalPackage(packagePath, expectedMedia = {}) {
  const zip = await loadPackage(packagePath);
  const entries = Object.keys(zip.files);
  const unexpectedEntries = entries.filter(
    (entry) =>
      entry !== "h5p.json" &&
      entry !== "content/" &&
      !entry.startsWith("content/")
  );
  assert.deepStrictEqual(
    unexpectedEntries,
    [],
    `Minimal package contains unexpected entries: ${unexpectedEntries.join(", ")}`
  );
  assert.strictEqual(
    entries.some((entry) => /\/library\.json$/i.test(entry)),
    false,
    "Minimal package must not contain H5P libraries"
  );

  const metadata = await readJson(zip, "h5p.json");
  const content = await readJson(zip, "content/content.json");
  assert.ok(
    metadata.preloadedDependencies.some(
      (dependency) => dependency.machineName === metadata.mainLibrary
    ),
    "Minimal h5p.json must retain the main library dependency"
  );
  for (const [entryPath, expectedBytes] of Object.entries(expectedMedia)) {
    await assertZipFileBytes(zip, entryPath, expectedBytes);
  }
  return { zip, metadata, content };
}

async function testFlashcards(tempPath) {
  const outputPath = path.join(tempPath, "flashcards.h5p");
  const cliResult = runCli(
    [
      "flashcards",
      path.join(fixturesPath, "flashcards-local.csv"),
      outputPath,
      "-t",
      "Regression Flashcards",
      "--description",
      "Regression description",
      "--package-mode",
      "full",
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(cliResult.status, 0);
  assert.strictEqual(cliResult.outputArchivePath, outputPath);
  const { zip, metadata, content } = await assertFullPackage(outputPath, {
    "content/images/0.jpg": fs.readFileSync(imageFixturePath),
  });

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
  const cliResult = runCli(
    [
      "dialogcards",
      path.join(fixturesPath, "dialogcards-local.csv"),
      outputPath,
      "-n",
      "Regression Dialog Cards",
      "-m",
      "normal",
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(cliResult.status, 0);
  const { zip, metadata, content } = await assertFullPackage(outputPath, {
    "content/images/0.jpg": fs.readFileSync(imageFixturePath),
    "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
  });

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
  const cliResult = runCli(
    [
      "dialogcardsPapiJo",
      path.join(fixturesPath, "dialogcards-papijo-legacy.csv"),
      outputPath,
      "-n",
      "Regression Dialog Cards Papi Jo",
      "-m",
      "selfCorrectionMode",
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(cliResult.status, 0);
  const { zip, metadata, content } = await assertFullPackage(outputPath);

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
  const cliResult = runCli(
    [
      "dialogcardsPapiJo",
      path.join(fixturesPath, "dialogcards-papijo-local.csv"),
      outputPath,
      "-n",
      "Dialog Cards Papi Jo Media",
      "-m",
      "browseSideBySide",
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(cliResult.status, 0);
  const { zip, metadata, content } = await assertFullPackage(outputPath, {
    "content/images/0.jpg": fs.readFileSync(imageFixturePath),
    "content/images/1.jpg": fs.readFileSync(imageFixturePath),
    "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
    "content/audios/1.mp3": fs.readFileSync(audioFixturePath),
  });
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

  const { zip, metadata, content } = await assertFullPackage(outputPath);
  assert.strictEqual(metadata.mainLibrary, "H5P.GuessIt");
  assert.deepStrictEqual(content, { questions: [] });
  assert.ok(zip.file("H5P.GuessIt-1.6/library.json"));
  assert.ok(zip.file("H5P.Timer-0.4/library.json"));
  assert.ok(zip.file("H5P.Question-1.5/library.json"));
  assertGuessItDevelopmentArtifactsAbsent(zip);

}

async function testGuessItSentences(tempPath) {
  const outputPath = path.join(tempPath, "guessit-sentences.h5p");
  const cliResult = runCli(
    [
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
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(cliResult.status, 0);
  const { zip, metadata, content } = await assertFullPackage(outputPath, {
    "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
  });

  assert.strictEqual(metadata.title, "Regression GuessIt Sentences");
  assert.strictEqual(metadata.mainLibrary, "H5P.GuessIt");
  assertDependency(metadata, "H5P.GuessIt", 1, 6);
  assert.ok(zip.file("H5P.GuessIt-1.6/library.json"));
  assertGuessItDevelopmentArtifactsAbsent(zip);

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
  const cliResult = runCli(
    [
      "guessit",
      path.join(fixturesPath, "guessit-wordle-regression.csv"),
      outputPath,
      "-n",
      "Regression GuessIt Wordle",
      "--mode",
      "wordle",
      "--max-tries",
      "8",
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(cliResult.status, 0);
  const { zip, metadata, content } = await assertFullPackage(outputPath, {
    "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
  });

  assert.strictEqual(metadata.title, "Regression GuessIt Wordle");
  assertDependency(metadata, "H5P.GuessIt", 1, 6);
  assertGuessItDevelopmentArtifactsAbsent(zip);
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

async function testRemoteFlashcards(tempPath, fixtureServer) {
  const csvPath = writeTemporaryCsv(
    tempPath,
    "flashcards-remote.csv",
    [
      "question;answer;tip;image",
      `Remote question;Remote answer;Remote tip;${fixtureServer.baseUrl}/image.jpg`,
      "",
    ].join("\n")
  );
  const outputPath = path.join(tempPath, "flashcards-remote.h5p");
  const result = runCli(
    ["flashcards", csvPath, outputPath, "-t", "Remote Flashcards"],
    tempPath,
    outputPath
  );

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Downloaded image from .*\/image\.jpg/);
  assert.strictEqual(result.stderr, "");
  const { content } = await assertFullPackage(outputPath, {
    "content/images/0.jpg": fs.readFileSync(imageFixturePath),
  });
  assert.strictEqual(content.cards[0].image.path, "images/0.jpg");
  assert.strictEqual(content.cards[0].image.mime, "image/jpeg");
}

async function testRemoteDialogCards(tempPath, fixtureServer) {
  const csvPath = writeTemporaryCsv(
    tempPath,
    "dialogcards-remote.csv",
    [
      "front;back;image;audio",
      `Remote front;Remote back;${fixtureServer.baseUrl}/image.jpg?fixture=dialog;` +
        `${fixtureServer.baseUrl}/redirect-audio.mp3`,
      "",
    ].join("\n")
  );
  const outputPath = path.join(tempPath, "dialogcards-remote.h5p");
  const result = runCli(
    ["dialogcards", csvPath, outputPath, "-n", "Remote Dialog Cards"],
    tempPath,
    outputPath
  );

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Downloaded image from .*fixture=dialog/);
  assert.match(result.stdout, /Downloaded audio from .*redirect-audio\.mp3/);
  assert.strictEqual(result.stderr, "");

  // Current behaviour treats the URL query string as part of the extension.
  const imagePath = "images/0.jpg?fixture=dialog";
  const { content } = await assertFullPackage(outputPath, {
    [`content/${imagePath}`]: fs.readFileSync(imageFixturePath),
    "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
  });
  assert.strictEqual(content.dialogs[0].image.path, imagePath);
  assert.strictEqual(content.dialogs[0].image.mime, "image/jpeg");
  assert.strictEqual(content.dialogs[0].audio[0].path, "audios/0.mp3");
  assert.strictEqual(content.dialogs[0].audio[0].mime, "audio/mpeg");
}

async function testRemoteDialogCardsPapiJo(tempPath, fixtureServer) {
  const csvPath = writeTemporaryCsv(
    tempPath,
    "dialogcards-papijo-remote.csv",
    [
      "front;back;image;imageAltText;image2;imageAltText2;audio;audio2;tipFront;tipBack;categories",
      `Remote front;Remote back;${fixtureServer.baseUrl}/image;Front remote image;` +
        `${fixtureServer.baseUrl}/redirect-image.jpg;Back remote image;` +
        `${fixtureServer.baseUrl}/audio.mp3?fixture=papijo;` +
        `${fixtureServer.baseUrl}/audio.mp3;Front tip;Back tip;remote`,
      "",
    ].join("\n")
  );
  const outputPath = path.join(tempPath, "dialogcards-papijo-remote.h5p");
  const result = runCli(
    [
      "dialogcardsPapiJo",
      csvPath,
      outputPath,
      "-n",
      "Remote Dialog Cards Papi Jo",
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Added image from .*\/image\./);
  assert.match(result.stdout, /Added image from .*redirect-image\.jpg/);
  assert.match(result.stdout, /Added audio from .*fixture=papijo/);
  assert.strictEqual(result.stderr, "");

  // Current behaviour keeps extensionless media extensionless and includes
  // query strings in generated archive paths.
  const frontAudioPath = "audios/0.mp3?fixture=papijo";
  const { content } = await assertFullPackage(outputPath, {
    "content/images/0": fs.readFileSync(imageFixturePath),
    "content/images/1.jpg": fs.readFileSync(imageFixturePath),
    [`content/${frontAudioPath}`]: fs.readFileSync(audioFixturePath),
    "content/audios/1.mp3": fs.readFileSync(audioFixturePath),
  });
  const card = content.dialogs[0];
  assert.strictEqual(card.imageMedia.image.path, "images/0");
  assert.strictEqual(card.imageMedia.image.mime, "image/jpeg");
  assert.strictEqual(card.imageMedia.image2.path, "images/1.jpg");
  assert.strictEqual(card.imageMedia.image2.mime, "image/jpeg");
  assert.strictEqual(card.audioMedia.audio[0].path, frontAudioPath);
  assert.strictEqual(card.audioMedia.audio[0].mime, "audio/mpeg");
  assert.strictEqual(card.audioMedia.audio2[0].path, "audios/1.mp3");
  assert.strictEqual(card.audioMedia.audio2[0].mime, "audio/mpeg");
}

async function testRemoteGuessItSentences(tempPath, fixtureServer) {
  const csvPath = writeTemporaryCsv(
    tempPath,
    "guessit-sentences-remote.csv",
    [
      "item;tip;audio",
      `Remote media is deterministic;Remote sentence;${fixtureServer.baseUrl}/audio`,
      "",
    ].join("\n")
  );
  const outputPath = path.join(tempPath, "guessit-sentences-remote.h5p");
  const result = runCli(
    ["guessit", csvPath, outputPath, "-n", "Remote GuessIt Sentences"],
    tempPath,
    outputPath
  );

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Added audio from .*\/audio\./);
  assert.strictEqual(result.stderr, "");
  const { content } = await assertFullPackage(outputPath, {
    "content/audios/0": fs.readFileSync(audioFixturePath),
  });
  assert.strictEqual(content.questions[0].audio[0].path, "audios/0");
  assert.strictEqual(content.questions[0].audio[0].mime, "audio/mpeg");
}

async function testRemoteGuessItWordle(tempPath, fixtureServer) {
  const csvPath = writeTemporaryCsv(
    tempPath,
    "guessit-wordle-remote.csv",
    [
      "item;tip;audio",
      `Media;Remote Wordle audio;${fixtureServer.baseUrl}/redirect-audio.mp3`,
      "",
    ].join("\n")
  );
  const outputPath = path.join(tempPath, "guessit-wordle-remote.h5p");
  const result = runCli(
    [
      "guessit",
      csvPath,
      outputPath,
      "--mode",
      "wordle",
      "-n",
      "Remote GuessIt Wordle",
    ],
    tempPath,
    outputPath
  );

  assert.strictEqual(result.status, 0);
  assert.match(result.stdout, /Added audio from .*redirect-audio\.mp3/);
  assert.strictEqual(result.stderr, "");
  const { content } = await assertFullPackage(outputPath, {
    "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
  });
  assert.strictEqual(content.questionsW[0].audio[0].path, "audios/0.mp3");
  assert.strictEqual(content.questionsW[0].audio[0].mime, "audio/mpeg");
}

function assertMediaFailureResult(result, expectedError) {
  assert.strictEqual(
    result.status,
    0,
    "Current media-failure behaviour should still create a package"
  );
  assert.ok(
    fs.existsSync(result.outputArchivePath),
    "Expected package creation to continue after a media failure"
  );
  assert.match(result.stdout, /Stored full H5P package at/);
  assert.match(result.stderr, expectedError);
}

async function testRemoteMediaFailures(tempPath, fixtureServer) {
  const flashcardsCsvPath = writeTemporaryCsv(
    tempPath,
    "flashcards-remote-404.csv",
    [
      "question;answer;tip;image",
      `Missing image;Still packaged;;${fixtureServer.baseUrl}/status/404`,
      "",
    ].join("\n")
  );
  const flashcardsOutputPath = path.join(
    tempPath,
    "flashcards-remote-404.h5p"
  );
  const flashcardsResult = runCli(
    ["flashcards", flashcardsCsvPath, flashcardsOutputPath],
    tempPath,
    flashcardsOutputPath
  );
  assertMediaFailureResult(flashcardsResult, /status code 404/i);
  const flashcardsPackage = await assertFullPackage(flashcardsOutputPath);
  assert.strictEqual(flashcardsPackage.content.cards[0].image, undefined);
  assert.strictEqual(
    Object.keys(flashcardsPackage.zip.files).some((entry) =>
      entry.startsWith("content/images/")
    ),
    false
  );

  const dialogCardsCsvPath = writeTemporaryCsv(
    tempPath,
    "dialogcards-remote-500.csv",
    [
      "front;back;image;audio",
      `Server error;Still packaged;;${fixtureServer.baseUrl}/status/500`,
      "",
    ].join("\n")
  );
  const dialogCardsOutputPath = path.join(
    tempPath,
    "dialogcards-remote-500.h5p"
  );
  const dialogCardsResult = runCli(
    ["dialogcards", dialogCardsCsvPath, dialogCardsOutputPath],
    tempPath,
    dialogCardsOutputPath
  );
  assertMediaFailureResult(dialogCardsResult, /status code 500/i);
  const dialogCardsPackage = await assertFullPackage(dialogCardsOutputPath);
  assert.strictEqual(dialogCardsPackage.content.dialogs[0].audio, undefined);
  assert.strictEqual(
    Object.keys(dialogCardsPackage.zip.files).some((entry) =>
      entry.startsWith("content/audios/")
    ),
    false
  );

  const papiJoCsvPath = writeTemporaryCsv(
    tempPath,
    "dialogcards-papijo-connection-failure.csv",
    [
      "front;back;image",
      `Connection failure;Still packaged;${fixtureServer.baseUrl}/connection-failure`,
      "",
    ].join("\n")
  );
  const papiJoOutputPath = path.join(
    tempPath,
    "dialogcards-papijo-connection-failure.h5p"
  );
  const papiJoResult = runCli(
    ["dialogcardsPapiJo", papiJoCsvPath, papiJoOutputPath],
    tempPath,
    papiJoOutputPath
  );
  assertMediaFailureResult(
    papiJoResult,
    /socket hang up|ECONNRESET|connection reset/i
  );
  const papiJoPackage = await assertFullPackage(papiJoOutputPath);
  assert.strictEqual(
    papiJoPackage.content.dialogs[0].imageMedia.image,
    undefined
  );
  assert.strictEqual(
    Object.keys(papiJoPackage.zip.files).some((entry) =>
      entry.startsWith("content/images/")
    ),
    false
  );
}

async function testMinimalPackages(tempPath) {
  const cases = [
    {
      name: "Flashcards",
      output: "flashcards-minimal.h5p",
      args: [
        "flashcards",
        path.join(fixturesPath, "flashcards-local.csv"),
      ],
      expectedMedia: {
        "content/images/0.jpg": fs.readFileSync(imageFixturePath),
      },
    },
    {
      name: "Dialog Cards",
      output: "dialogcards-minimal.h5p",
      args: [
        "dialogcards",
        path.join(fixturesPath, "dialogcards-local.csv"),
      ],
      expectedMedia: {
        "content/images/0.jpg": fs.readFileSync(imageFixturePath),
        "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
      },
    },
    {
      name: "Dialog Cards Papi Jo",
      output: "dialogcards-papijo-minimal.h5p",
      args: [
        "dialogcardsPapiJo",
        path.join(fixturesPath, "dialogcards-papijo-local.csv"),
      ],
      expectedMedia: {
        "content/images/0.jpg": fs.readFileSync(imageFixturePath),
        "content/images/1.jpg": fs.readFileSync(imageFixturePath),
        "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
        "content/audios/1.mp3": fs.readFileSync(audioFixturePath),
      },
    },
    {
      name: "GuessIt sentence mode",
      output: "guessit-sentence-minimal.h5p",
      args: [
        "guessit",
        path.join(fixturesPath, "guessit-sentences.csv"),
      ],
      expectedMedia: {
        "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
      },
    },
    {
      name: "GuessIt Wordle mode",
      output: "guessit-minimal.h5p",
      args: [
        "guessit",
        path.join(fixturesPath, "guessit-wordle-regression.csv"),
        "--mode",
        "wordle",
      ],
      expectedMedia: {
        "content/audios/0.mp3": fs.readFileSync(audioFixturePath),
      },
    },
  ];

  for (const testCase of cases) {
    const outputPath = path.join(tempPath, testCase.output);
    const cliResult = runCli(
      [
        ...testCase.args,
        outputPath,
        "--package-mode",
        "minimal",
      ],
      tempPath,
      outputPath
    );
    assert.strictEqual(cliResult.status, 0);
    assert.strictEqual(cliResult.outputArchivePath, outputPath);
    await assertMinimalPackage(outputPath, testCase.expectedMedia);
  }
}

async function testPackageModeValidation(tempPath) {
  const outputPath = path.join(tempPath, "invalid-package-mode.h5p");
  const result = runCliExpectFailure(
    [
      "flashcards",
      path.join(fixturesPath, "flashcards-local.csv"),
      outputPath,
      "--package-mode",
      "unsupported",
    ],
    tempPath,
    outputPath
  );

  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.outputArchivePath, outputPath);
  assert.match(combinedCliOutput(result), /Invalid values|Choices:/);
  assert.strictEqual(fs.existsSync(outputPath), false);
}

async function testGuessItValidation(tempPath) {
  const outputPath = path.join(tempPath, "invalid-wordle.h5p");
  const result = runCliExpectFailure(
    [
      "guessit",
      path.join(fixturesPath, "guessit-invalid-wordle.csv"),
      outputPath,
      "--mode",
      "wordle",
    ],
    tempPath,
    outputPath
  );

  assert.notStrictEqual(result.status, 0);
  assert.strictEqual(result.outputArchivePath, outputPath);
  assert.match(
    combinedCliOutput(result),
    /Wordle items must contain 4 to 8 supported letters/
  );
  assert.strictEqual(fs.existsSync(outputPath), false);
}

async function testPackageErrors(tempPath) {
  const malformedArchivePath = path.join(tempPath, "malformed.h5p");
  fs.writeFileSync(malformedArchivePath, "This is not a ZIP archive.");
  await assert.rejects(
    H5pPackage.createFromFile(
      malformedArchivePath,
      "H5P.Malformed",
      "en"
    ),
    /Could not open H5P package .*malformed\.h5p:/
  );

  const malformedMetadataArchive = new JSZip();
  malformedMetadataArchive.file("h5p.json", "{ invalid JSON");
  const malformedMetadataPath = path.join(
    tempPath,
    "malformed-metadata.h5p"
  );
  fs.writeFileSync(
    malformedMetadataPath,
    await malformedMetadataArchive.generateAsync({ type: "nodebuffer" })
  );
  await assert.rejects(
    H5pPackage.createFromFile(
      malformedMetadataPath,
      "H5P.MalformedMetadata",
      "en"
    ),
    /Invalid h5p\.json:/
  );

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
  let fixtureServer;

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
    fixtureServer = await startHttpFixtureServer();
    await runTest(
      "Flashcards remote image importer",
      (path) => testRemoteFlashcards(path, fixtureServer),
      tempPath
    );
    await runTest(
      "Dialog Cards remote media importer",
      (path) => testRemoteDialogCards(path, fixtureServer),
      tempPath
    );
    await runTest(
      "Dialog Cards Papi Jo remote media importer",
      (path) => testRemoteDialogCardsPapiJo(path, fixtureServer),
      tempPath
    );
    await runTest(
      "GuessIt sentence remote audio importer",
      (path) => testRemoteGuessItSentences(path, fixtureServer),
      tempPath
    );
    await runTest(
      "GuessIt Wordle remote audio importer",
      (path) => testRemoteGuessItWordle(path, fixtureServer),
      tempPath
    );
    await runTest(
      "Remote media failure behaviour",
      (path) => testRemoteMediaFailures(path, fixtureServer),
      tempPath
    );
    await runTest("Minimal packages for all importers", testMinimalPackages, tempPath);
    await runTest("Package mode validation", testPackageModeValidation, tempPath);
    await runTest("GuessIt CSV validation", testGuessItValidation, tempPath);
    await runTest("Package validation errors", testPackageErrors, tempPath);
    console.log("All regression tests passed.");
  } finally {
    try {
      await stopHttpFixtureServer(fixtureServer);
    } finally {
      fs.rmSync(tempPath, { recursive: true, force: true });
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
