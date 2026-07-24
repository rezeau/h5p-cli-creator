const fs = require("fs");
const http = require("http");
const path = require("path");

const imageBytes = fs.readFileSync(path.join(__dirname, "image1.jpg"));
const audioBytes = fs.readFileSync(path.join(__dirname, "sound.mp3"));
const flashcardsPackageBytes = fs.readFileSync(
  path.join(__dirname, "..", "content-type-cache", "H5P.Flashcards.h5p")
);

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

server.listen(0, "127.0.0.1", () => {
  const address = server.address();
  process.stdout.write(`${JSON.stringify({ port: address.port })}\n`);
});
