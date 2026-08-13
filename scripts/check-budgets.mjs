import { gzipSync } from "node:zlib";
import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

const browsers = ["firefox", "chrome", "safari"];
const perFileBudgets = {
  "content.js": 80_000,
  "popup.js": 60_000,
  "background.js": 25_000,
  "early.js": 5_000,
  "popup.css": 15_000,
  "popup.html": 8_000
};
const totalBudget = 225_000;
const gzipBudget = 100_000;
const failures = [];

async function filesRecursively(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map((entry) => {
        const path = join(directory, entry.name);
        return entry.isDirectory() ? filesRecursively(path) : path;
      })
    )
  ).flat();
}

for (const browser of browsers) {
  const directory = new URL(`../dist/${browser}/`, import.meta.url).pathname;
  const paths = await filesRecursively(directory);
  let total = 0;
  let compressed = 0;
  for (const path of paths) {
    const content = await readFile(path);
    total += content.byteLength;
    compressed += gzipSync(content, { level: 9 }).byteLength;
    const filename = path.split("/").at(-1);
    const budget = perFileBudgets[filename];
    if (budget && content.byteLength > budget) {
      failures.push(`${browser}/${filename}: ${content.byteLength} B > ${budget} B`);
    }
  }
  if (total > totalBudget) {
    failures.push(`${browser} total: ${total} B > ${totalBudget} B`);
  }
  if (compressed > gzipBudget) {
    failures.push(`${browser} gzip total: ${compressed} B > ${gzipBudget} B`);
  }
  console.log(`${browser}: ${total} B raw, ${compressed} B gzip`);
}

if (failures.length > 0) {
  throw new Error(`Bundle budgets exceeded:\n- ${failures.join("\n- ")}`);
}
console.log("Bundle budgets passed.");
