import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { promisify } from "node:util";

const execute = promisify(execFile);
const root = resolve(import.meta.dirname, "..");
const browsers = ["firefox", "chrome", "safari"];

async function buildAll() {
  for (const browser of browsers) {
    await execute(process.execPath, ["scripts/build.mjs", `--browser=${browser}`], {
      cwd: root,
      env: { ...process.env, NO_UPDATE_NOTIFIER: "1" }
    });
  }
}

async function filesBelow(directory, prefix = "") {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const relativePath = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      files.push(...(await filesBelow(resolve(directory, entry.name), relativePath)));
    } else if (entry.isFile()) {
      files.push(relativePath);
    }
  }
  return files;
}

async function buildHashes() {
  const hashes = new Map();
  for (const browser of browsers) {
    const directory = resolve(root, "dist", browser);
    for (const relativePath of await filesBelow(directory)) {
      const content = await readFile(resolve(directory, relativePath));
      hashes.set(`${browser}/${relativePath}`, createHash("sha256").update(content).digest("hex"));
    }
  }
  return hashes;
}

await buildAll();
const first = await buildHashes();
await buildAll();
const second = await buildHashes();

const firstFiles = [...first.keys()];
const secondFiles = [...second.keys()];
if (
  firstFiles.length !== secondFiles.length ||
  firstFiles.some((file, index) => file !== secondFiles[index])
) {
  throw new Error("Browser builds produced a different file set on the second pass.");
}

const changed = firstFiles.filter((file) => first.get(file) !== second.get(file));
if (changed.length > 0) {
  throw new Error(`Browser builds are not reproducible: ${changed.join(", ")}`);
}

console.log(`Reproducible browser builds verified (${first.size} files, two independent passes).`);
