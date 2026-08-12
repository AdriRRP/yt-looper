import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

const directory = new URL("../wiki-assets/", import.meta.url).pathname;
const pageNames = [
  "Inicio-ES",
  "Welcome-EN",
  "Guia-de-uso-ES",
  "User-guide-EN",
  "Biblioteca-y-enlaces-ES",
  "Library-and-sharing-EN",
  "Instalacion-Firefox-ES",
  "Install-Firefox-EN",
  "Instalacion-Chrome-ES",
  "Install-Chrome-EN",
  "Instalacion-Safari-ES",
  "Install-Safari-EN",
  "Ayuda-y-privacidad-ES",
  "Troubleshooting-and-privacy-EN"
];
const files = (await readdir(directory)).filter((file) => file.endsWith(".md"));
const rawImagePrefix = "https://raw.githubusercontent.com/wiki/AdriRRP/yt-looper/";
const knownPages = new Set(pageNames);

const failures = [];
for (const file of files) {
  const source = await readFile(join(directory, file), "utf8");
  for (const match of source.matchAll(/\]\(([^)]+)\)/gu)) {
    const target = match[1];
    if (target.startsWith("http") || target.startsWith("#")) {
      continue;
    }
    if (target.startsWith("/AdriRRP/yt-looper/wiki/")) {
      const page = target.slice("/AdriRRP/yt-looper/wiki/".length).split("#")[0];
      if (knownPages.has(page)) continue;
    }
    if (target.startsWith(`${rawImagePrefix}screenshots/`)) {
      const localTarget = target.slice(rawImagePrefix.length);
      if (existsSync(join(directory, localTarget))) continue;
    }
    failures.push(`${file}: ${target}`);
  }
}

if (failures.length > 0) {
  throw new Error(`Broken internal wiki links:\n${failures.join("\n")}`);
}
console.log(`All wiki routes and images resolve across ${files.length} pages.`);
