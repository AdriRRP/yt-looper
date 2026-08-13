import { execFile } from "node:child_process";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);

const portArgument = process.argv.slice(2).find((argument) => /^\d+$/.test(argument));
const port = Number(portArgument ?? 4173);
const useHttps = process.argv.includes("--https");
const browserArgument = process.argv.find((argument) => argument.startsWith("--browser="));
const browserName = browserArgument?.split("=")[1] ?? "firefox";
if (!["firefox", "chrome", "safari"].includes(browserName)) {
  throw new Error(`Unsupported fixture browser: ${browserName}`);
}
const buildDirectory = `dist/${browserName}`;
const routes = new Map([
  ["/content.js", [`${buildDirectory}/content.js`, "text/javascript; charset=utf-8"]],
  ["/content-mock.js", ["fixtures/content-mock.js", "text/javascript; charset=utf-8"]],
  ["/popup.html", [`${buildDirectory}/popup.html`, "text/html; charset=utf-8"]],
  ["/popup.css", [`${buildDirectory}/popup.css`, "text/css; charset=utf-8"]],
  ["/popup.js", [`${buildDirectory}/popup.js`, "text/javascript; charset=utf-8"]],
  ["/popup-mock.js", ["fixtures/popup-mock.js", "text/javascript; charset=utf-8"]],
  [
    "/icons/icon.svg",
    [
      browserName === "firefox"
        ? `${buildDirectory}/icons/icon.svg`
        : `${buildDirectory}/icons/icon-32.png`,
      browserName === "firefox" ? "image/svg+xml" : "image/png"
    ]
  ],
  ["/favicon.ico", [null, "image/x-icon"]]
]);

const handleRequest = async (request, response) => {
  const requestUrl = new URL(request.url ?? "/", `http://${request.headers.host}`);
  const { pathname } = requestUrl;
  if (pathname === "/__fixture-browser") {
    response.writeHead(200, {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store"
    });
    response.end(browserName);
    return;
  }
  if (pathname === "/watch") {
    try {
      let body = await readFile("fixtures/youtube-watch.html", "utf8");
      if (requestUrl.searchParams.get("native") === "1") {
        body = body
          .replace('<script src="/content-mock.js"></script>', "")
          .replace('<script src="/content.js"></script>', "");
      } else if (requestUrl.searchParams.get("lang") === "en") {
        const messages = JSON.parse(await readFile("_locales/en/messages.json", "utf8"));
        body = body.replace(
          '<script src="/content-mock.js"></script>',
          `<script>globalThis.__ytLooperFixtureMessages = ${JSON.stringify(messages)}</script><script src="/content-mock.js"></script>`
        );
      }
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
  if (pathname === "/popup-fixture.html" || pathname === "/popup-fixture-en.html") {
    try {
      const popup = await readFile(`${buildDirectory}/popup.html`, "utf8");
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
};

let server;
if (useHttps) {
  const certificateDirectory = resolve(".fixture-tls");
  const keyPath = resolve(certificateDirectory, "key.pem");
  const certificatePath = resolve(certificateDirectory, "certificate.pem");
  await mkdir(certificateDirectory, { recursive: true });
  await execute("openssl", [
    "req",
    "-x509",
    "-newkey",
    "rsa:2048",
    "-nodes",
    "-keyout",
    keyPath,
    "-out",
    certificatePath,
    "-subj",
    "/CN=www.youtube.com",
    "-addext",
    "subjectAltName=DNS:www.youtube.com,IP:127.0.0.1",
    "-days",
    "2"
  ]);
  server = createHttpsServer(
    { key: await readFile(keyPath), cert: await readFile(certificatePath) },
    handleRequest
  );
} else {
  server = createHttpServer(handleRequest);
}

server.listen(port, "127.0.0.1", () => {
  console.log(
    `YT Looper ${browserName} fixture: ${useHttps ? "https" : "http"}://127.0.0.1:${port}/watch?v=fixtureVid1`
  );
});
