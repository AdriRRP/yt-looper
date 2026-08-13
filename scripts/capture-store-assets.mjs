import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";
import { chromium } from "@playwright/test";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const port = 4180;
const baseUrl = `http://127.0.0.1:${port}`;
const output = resolve(root, "store-assets");
const visualSources = [
  "_locales/en/messages.json",
  "_locales/es/messages.json",
  "assets/icons/icon-128.png",
  "fixtures/content-mock.js",
  "fixtures/popup-mock.js",
  "fixtures/youtube-watch.html",
  "popup/popup.css",
  "popup/popup.html",
  "src/platform/i18n.ts",
  "src/popup/index.ts",
  "src/ui/panel.ts"
];

await execute(process.execPath, ["scripts/build.mjs", "--browser=chrome"], { cwd: root });
await mkdir(resolve(output, "screenshots/es"), { recursive: true });
await mkdir(resolve(output, "screenshots/en"), { recursive: true });
await mkdir(resolve(output, "promotional"), { recursive: true });

const server = spawn(
  process.execPath,
  ["scripts/fixture-server.mjs", "--browser=chrome", String(port)],
  { cwd: root, stdio: "inherit" }
);

async function waitForServer() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(`${baseUrl}/__fixture-browser`);
      if (response.ok) return;
    } catch {
      // The child process is still starting.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 100));
  }
  throw new Error("Store asset fixture did not start.");
}

const browser = await chromium.launch({ headless: true });
try {
  await waitForServer();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  for (const locale of ["es", "en"]) {
    const language = locale === "en" ? "&lang=en" : "";
    await page.goto(`${baseUrl}/watch?v=fixtureVid1${language}`);
    await page.locator("#yt-looper-root [data-action=collapse]").last().click();
    await page.locator("#yt-looper-root [data-field=start]").fill("1.234");
    await page.locator("#yt-looper-root [data-field=end]").fill("2.345");
    await page.locator("#yt-looper-root [data-field=rate]").fill("0.75");
    await page.locator("#yt-looper-root [data-action=toggle]").click();
    await page.screenshot({
      path: resolve(output, `screenshots/${locale}/01-video-widget.png`),
      animations: "disabled"
    });

    const popupPath = locale === "en" ? "popup-fixture-en.html" : "popup-fixture.html";
    await page.goto(`${baseUrl}/${popupPath}?linked=1&match=1`);
    await page.addStyleTag({
      content: `
        html { min-width: 1280px; min-height: 800px; background: radial-gradient(circle at 25% 15%, #303968, #151724 48%, #090a0e); }
        body { margin: 42px auto !important; zoom: 1.55; border: 1px solid #3a3d46; border-radius: 14px; box-shadow: 0 28px 90px rgba(0, 0, 0, .58); }
        .modal-layer { left: 50% !important; transform: translateX(-50%); }
      `
    });
    await page.locator('.folder-row[data-folder-id="practice"] .tree-label').click();
    await page.screenshot({
      path: resolve(output, `screenshots/${locale}/02-library.png`),
      animations: "disabled"
    });
    await page.locator('[data-bookmark-id="saved-fragment"] .tree-label').click();
    await page.locator('#editor-modal[data-open="true"]').waitFor();
    await page.screenshot({
      path: resolve(output, `screenshots/${locale}/03-editor.png`),
      animations: "disabled"
    });
  }

  const icon = (await readFile(resolve(root, "assets/icons/icon-128.png"))).toString("base64");
  for (const [name, width, height] of [
    ["small-promo", 440, 280],
    ["marquee", 1400, 560]
  ]) {
    await page.setViewportSize({ width, height });
    await page.setContent(`
      <style>
        * { box-sizing: border-box; }
        html, body { width: 100%; height: 100%; margin: 0; overflow: hidden; }
        body { display: grid; place-items: center; color: white; background: radial-gradient(circle at 28% 18%, #4855a1, #1a1e38 48%, #090a10); font-family: Inter, system-ui, sans-serif; }
        main { display: flex; align-items: center; gap: ${width > 500 ? 42 : 20}px; }
        img { width: ${width > 500 ? 180 : 94}px; height: ${width > 500 ? 180 : 94}px; filter: drop-shadow(0 18px 28px rgba(0,0,0,.38)); }
        strong { display: block; font-size: ${width > 500 ? 72 : 34}px; letter-spacing: -.04em; }
        span { display: block; margin-top: 8px; color: #a9c7ff; font-size: ${width > 500 ? 32 : 18}px; font-weight: 700; letter-spacing: .14em; }
      </style>
      <main><img src="data:image/png;base64,${icon}" alt=""><div><strong>YT Looper</strong><span>A · B · ∞</span></div></main>
    `);
    await page.screenshot({
      path: resolve(output, `promotional/${name}.png`),
      animations: "disabled"
    });
  }
} finally {
  await browser.close();
  server.kill("SIGTERM");
}

const sourceHash = createHash("sha256");
for (const path of visualSources) {
  sourceHash.update(path);
  sourceHash.update("\0");
  sourceHash.update(await readFile(resolve(root, path)));
}
await writeFile(
  resolve(output, "generated-assets.json"),
  `${JSON.stringify({ schemaVersion: 1, visualSources, sha256: sourceHash.digest("hex") }, null, 2)}\n`,
  "utf8"
);

console.log(`Marketplace assets captured in ${output}.`);
