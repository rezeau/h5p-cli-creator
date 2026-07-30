const crypto = require("crypto");
const fs = require("fs");
const http = require("http");
const JSZip = require("jszip");
const path = require("path");

const imageBytes = fs.readFileSync(path.join(__dirname, "image1.jpg"));
const audioBytes = fs.readFileSync(path.join(__dirname, "sound.mp3"));
const flashcardsPackageBytes = fs.readFileSync(
  path.join(__dirname, "..", "content-type-cache", "H5P.Flashcards.h5p")
);
const dialogcardsPapiJoPackageBytes = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "content-type-cache",
    "H5P.DialogcardsPapiJo.h5p"
  )
);
const guessItPackageBytes = fs.readFileSync(
  path.join(__dirname, "..", "content-type-cache", "H5P.GuessIt.h5p")
);
let customPackageFixtures;

function sha256(bytes) {
  return crypto.createHash("sha256").update(bytes).digest("hex").toUpperCase();
}

async function modifyPackage(
  sourceBytes,
  libraryPath,
  modify,
  explicitDirectoryEntry
) {
  const zip = await JSZip.loadAsync(sourceBytes);
  await modify(zip, libraryPath);
  for (const entryName of Object.keys(zip.files)) {
    if (zip.files[entryName].dir) {
      delete zip.files[entryName];
    }
  }
  if (explicitDirectoryEntry) {
    zip.file(explicitDirectoryEntry, null, {
      createFolders: false,
      dir: true,
    });
  }
  return zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
    compressionOptions: { level: 1 },
  });
}

async function changeLibraryDefinition(sourceBytes, property, value) {
  const libraryPath = "H5P.DialogcardsPapiJo-1.17/library.json";
  return modifyPackage(sourceBytes, libraryPath, async (zip) => {
    const definition = JSON.parse(await zip.file(libraryPath).async("text"));
    definition[property] = value;
    zip.file(libraryPath, JSON.stringify(definition));
  });
}

async function createCustomPackageFixtures() {
  const fixtures = {
    dialogcardsPapiJo: dialogcardsPapiJoPackageBytes,
    guessIt: guessItPackageBytes,
    wrongLibrary: await changeLibraryDefinition(
      dialogcardsPapiJoPackageBytes,
      "machineName",
      "H5P.WrongLibrary"
    ),
    wrongMajor: await changeLibraryDefinition(
      dialogcardsPapiJoPackageBytes,
      "majorVersion",
      2
    ),
    wrongMinor: await changeLibraryDefinition(
      dialogcardsPapiJoPackageBytes,
      "minorVersion",
      18
    ),
    wrongPatch: await changeLibraryDefinition(
      dialogcardsPapiJoPackageBytes,
      "patchVersion",
      2
    ),
    notRunnable: await changeLibraryDefinition(
      dialogcardsPapiJoPackageBytes,
      "runnable",
      0
    ),
    missingSemantics: await modifyPackage(
      dialogcardsPapiJoPackageBytes,
      "H5P.DialogcardsPapiJo-1.17/semantics.json",
      async (zip) => zip.remove("H5P.DialogcardsPapiJo-1.17/semantics.json")
    ),
    incompatibleH5p: await modifyPackage(
      dialogcardsPapiJoPackageBytes,
      "h5p.json",
      async (zip) =>
        zip.file(
          "h5p.json",
          JSON.stringify({
            mainLibrary: "H5P.WrongLibrary",
            preloadedDependencies: [],
          })
        )
    ),
    missingPreloaded: await modifyPackage(
      dialogcardsPapiJoPackageBytes,
      "H5P.DialogcardsPapiJo-1.17/library.json",
      async (zip) => zip.remove("FontAwesome-4.5")
    ),
    missingEditor: await modifyPackage(
      dialogcardsPapiJoPackageBytes,
      "H5P.DialogcardsPapiJo-1.17/library.json",
      async (zip) => zip.remove("H5PEditor.VerticalTabs-1.3")
    ),
    explicitDirectoryEntry: await modifyPackage(
      dialogcardsPapiJoPackageBytes,
      "H5PEditor.VerticalTabs-1.3/styles/",
      async () => undefined,
      "H5PEditor.VerticalTabs-1.3/styles/"
    ),
  };
  fixtures.hashes = Object.keys(fixtures).reduce((hashes, name) => {
    hashes[name] = sha256(fixtures[name]);
    return hashes;
  }, {});
  return fixtures;
}

function sendBytes(response, statusCode, contentType, bytes) {
  response.writeHead(statusCode, {
    "Content-Length": bytes.length,
    "Content-Type": contentType,
  });
  response.end(bytes);
}

const server = http.createServer((request, response) => {
  const requestUrl = new URL(request.url, "http://127.0.0.1");

  switch (requestUrl.pathname) {
    case "/image.jpg":
    case "/image":
      sendBytes(response, 200, "image/jpeg", imageBytes);
      return;
    case "/audio.mp3":
    case "/audio":
      sendBytes(response, 200, "audio/mpeg", audioBytes);
      return;
    case "/redirect-image.jpg":
      response.writeHead(302, { Location: "/image.jpg" });
      response.end();
      return;
    case "/redirect-audio.mp3":
      response.writeHead(302, { Location: "/audio.mp3" });
      response.end();
      return;
    case "/status/404":
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Fixture not found.");
      return;
    case "/status/500":
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Fixture server error.");
      return;
    case "/connection-failure":
      request.socket.destroy();
      return;
    case "/hub/v1/content-types/H5P.Flashcards":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        flashcardsPackageBytes
      );
      return;
    case "/hub/v1/content-types/H5P.InvalidZip":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        Buffer.from("This is not a ZIP archive.")
      );
      return;
    case "/hub/v1/content-types/H5P.Html":
      sendBytes(
        response,
        200,
        "text/html; charset=utf-8",
        Buffer.from("<!doctype html><html><body>Error</body></html>")
      );
      return;
    case "/hub/v1/content-types/H5P.Status404":
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Hub package not found.");
      return;
    case "/hub/v1/content-types/H5P.Status500":
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Hub package server error.");
      return;
    case "/hub/v1/content-types/H5P.ConnectionReset":
      request.socket.destroy();
      return;
    case "/hub/v1/content-types/H5P.Timeout":
      setTimeout(() => {
        if (!response.destroyed) {
          sendBytes(
            response,
            200,
            "application/octet-stream",
            flashcardsPackageBytes
          );
        }
      }, 250);
      return;
    case "/hub/v1/content-types/H5P.DialogcardsPapiJo":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.dialogcardsPapiJo
      );
      return;
    case "/custom/dialogcards-papijo.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.dialogcardsPapiJo
      );
      return;
    case "/custom/guessit.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.guessIt
      );
      return;
    case "/custom/redirect-dialogcards-papijo.h5p":
      response.writeHead(302, {
        Location: "/custom/dialogcards-papijo.h5p",
      });
      response.end();
      return;
    case "/custom/wrong-library.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.wrongLibrary
      );
      return;
    case "/custom/wrong-major.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.wrongMajor
      );
      return;
    case "/custom/wrong-minor.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.wrongMinor
      );
      return;
    case "/custom/wrong-patch.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.wrongPatch
      );
      return;
    case "/custom/not-runnable.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.notRunnable
      );
      return;
    case "/custom/missing-semantics.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.missingSemantics
      );
      return;
    case "/custom/incompatible-h5p.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.incompatibleH5p
      );
      return;
    case "/custom/missing-preloaded.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.missingPreloaded
      );
      return;
    case "/custom/missing-editor.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.missingEditor
      );
      return;
    case "/custom/explicit-directory-entry.h5p":
      sendBytes(
        response,
        200,
        "application/octet-stream",
        customPackageFixtures.explicitDirectoryEntry
      );
      return;
    case "/custom/html":
      sendBytes(
        response,
        200,
        "text/html; charset=utf-8",
        Buffer.from("<!doctype html><html><body>Error</body></html>")
      );
      return;
    case "/custom/status/404":
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Custom package not found.");
      return;
    case "/custom/status/500":
      response.writeHead(500, { "Content-Type": "text/plain" });
      response.end("Custom package server error.");
      return;
    case "/custom/connection-reset":
      request.socket.destroy();
      return;
    default:
      response.writeHead(404, { "Content-Type": "text/plain" });
      response.end("Unknown fixture endpoint.");
  }
});

let shuttingDown = false;

function shutDown() {
  if (shuttingDown) {
    return;
  }
  shuttingDown = true;
  process.stdin.destroy();
  server.close((error) => {
    if (error) {
      console.error(error);
      process.exitCode = 1;
    }
  });
}

process.stdin.setEncoding("utf8");
process.stdin.on("data", (data) => {
  if (data.split(/\r?\n/).includes("shutdown")) {
    shutDown();
  }
});
process.on("SIGTERM", shutDown);
process.on("SIGINT", shutDown);

server.on("error", (error) => {
  console.error(error);
  process.exitCode = 1;
});

createCustomPackageFixtures()
  .then((fixtures) => {
    customPackageFixtures = fixtures;
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      process.stdout.write(
        `${JSON.stringify({
          port: address.port,
          packageHashes: customPackageFixtures.hashes,
        })}\n`
      );
    });
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
