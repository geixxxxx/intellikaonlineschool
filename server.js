const http = require("http");
const fs = require("fs");
const path = require("path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = process.env.HOST || "127.0.0.1";
const ROOT = __dirname;

const MIME_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".webp": "image/webp"
};

const server = http.createServer((request, response) => {
  const url = new URL(request.url, `http://${request.headers.host}`);
  const safePath = decodeURIComponent(url.pathname === "/" ? "/index.html" : url.pathname);
  const filePath = path.normalize(path.join(ROOT, safePath));

  if (!filePath.startsWith(ROOT)) {
    send(response, 403, "Forbidden", "text/plain; charset=utf-8");
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      if (error.code === "ENOENT") {
        fs.readFile(path.join(ROOT, "index.html"), (fallbackError, fallbackContent) => {
          if (fallbackError) {
            send(response, 404, "Not found", "text/plain; charset=utf-8");
            return;
          }
          send(response, 200, fallbackContent, MIME_TYPES[".html"]);
        });
        return;
      }

      send(response, 500, "Internal server error", "text/plain; charset=utf-8");
      return;
    }

    const extension = path.extname(filePath).toLowerCase();
    send(response, 200, content, MIME_TYPES[extension] || "application/octet-stream");
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Intellika is running on http://${HOST}:${PORT}`);
});

function send(response, statusCode, body, contentType) {
  response.writeHead(statusCode, {
    "Content-Type": contentType,
    "Cache-Control": "no-store"
  });
  response.end(body);
}
