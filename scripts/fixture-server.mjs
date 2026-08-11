import { createServer } from "node:http";
import { readFile } from "node:fs/promises";

const port = Number(process.argv[2] ?? 4173);
const routes = new Map([
  ["/content.js", ["dist/firefox/content.js", "text/javascript; charset=utf-8"]],
  ["/content-mock.js", ["fixtures/content-mock.js", "text/javascript; charset=utf-8"]],
  ["/popup.html", ["dist/firefox/popup.html", "text/html; charset=utf-8"]],
  ["/popup.css", ["dist/firefox/popup.css", "text/css; charset=utf-8"]],
  ["/popup.js", ["dist/firefox/popup.js", "text/javascript; charset=utf-8"]],
  ["/popup-mock.js", ["fixtures/popup-mock.js", "text/javascript; charset=utf-8"]],
  ["/icons/icon.svg", ["dist/firefox/icons/icon.svg", "image/svg+xml"]],
  ["/favicon.ico", [null, "image/x-icon"]]
]);

const server = createServer(async (request, response) => {
  const pathname = new URL(request.url ?? "/", `http://${request.headers.host}`).pathname;
  if (pathname === "/popup-fixture.html" || pathname === "/popup-fixture-en.html") {
    try {
      const popup = await readFile("dist/firefox/popup.html", "utf8");
      const englishMessages = pathname.endsWith("-en.html")
        ? JSON.parse(await readFile("_locales/en/messages.json", "utf8"))
        : null;
      const localeMock = englishMessages
        ? `<script>globalThis.__ytLooperFixtureMessages = ${JSON.stringify(englishMessages)}</script>`
        : "";
      const body = popup.replace(
        '<script src="popup.js" defer></script>',
        `${localeMock}<script src="/popup-mock.js"></script><script src="/popup.js" defer></script>`
      );
      response.writeHead(200, {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store"
      });
      response.end(body);
      return;
    } catch (error) {
      response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      response.end(String(error));
      return;
    }
  }
  const [file, contentType] = routes.get(pathname) ?? [
    "fixtures/youtube-watch.html",
    "text/html; charset=utf-8"
  ];

  if (!file) {
    response.writeHead(204);
    response.end();
    return;
  }

  try {
    const body = await readFile(file);
    response.writeHead(200, {
      "Content-Type": contentType,
      "Cache-Control": "no-store"
    });
    response.end(body);
  } catch (error) {
    response.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
    response.end(String(error));
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`YT Looper fixture: http://127.0.0.1:${port}/watch?v=fixtureVid1`);
});
