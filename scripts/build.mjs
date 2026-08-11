import { cp, mkdir, readFile, rm } from "node:fs/promises";
import { context } from "esbuild";

const watch = process.argv.includes("--watch");
const browserArgument = process.argv.find((argument) => argument.startsWith("--browser="));
const browserName = browserArgument?.split("=")[1] ?? "firefox";
const browserBuilds = {
  firefox: {
    manifest: "manifests/firefox.json",
    target: "firefox109"
  },
  chrome: {
    manifest: "manifests/chrome.json",
    target: "chrome109"
  },
  safari: {
    manifest: "manifests/safari.json",
    target: "safari15.4"
  }
};
const browserBuild = browserBuilds[browserName];
if (!browserBuild) {
  throw new Error(`Unsupported browser build: ${browserName}`);
}
const outputDirectory = `dist/${browserName}`;

const localeEntries = await Promise.all(
  ["es", "en"].map(async (locale) => {
    const messages = JSON.parse(await readFile(`_locales/${locale}/messages.json`, "utf8"));
    return [locale, Object.keys(messages).sort()];
  })
);
const [referenceLocale, referenceKeys] = localeEntries[0];
for (const [locale, keys] of localeEntries.slice(1)) {
  if (
    keys.length !== referenceKeys.length ||
    keys.some((key, index) => key !== referenceKeys[index])
  ) {
    throw new Error(`Locale ${locale} does not contain the same messages as ${referenceLocale}.`);
  }
}

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(outputDirectory, { recursive: true });
await cp(browserBuild.manifest, `${outputDirectory}/manifest.json`);
await cp("popup/popup.html", `${outputDirectory}/popup.html`);
await cp("popup/popup.css", `${outputDirectory}/popup.css`);
await cp("assets/icons", `${outputDirectory}/icons`, { recursive: true });
await cp("_locales", `${outputDirectory}/_locales`, { recursive: true });

const buildContext = await context({
  entryPoints: {
    early: "src/content/early.ts",
    content: "src/content/index.ts",
    popup: "src/popup/index.ts"
  },
  outdir: outputDirectory,
  entryNames: "[name]",
  bundle: true,
  format: "iife",
  platform: "browser",
  target: [browserBuild.target],
  sourcemap: watch ? "inline" : false,
  minify: !watch,
  legalComments: "none",
  logLevel: "info"
});

if (watch) {
  await buildContext.watch();
  console.log(`Watching the ${browserName} extension sources…`);
} else {
  await buildContext.rebuild();
  await buildContext.dispose();
}
