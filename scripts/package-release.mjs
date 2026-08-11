import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, resolve } from "node:path";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";

import { verifyReleaseVersion } from "./release-version.mjs";

const execute = promisify(execFile);
const BROWSERS = ["firefox", "chrome", "safari"];
const root = resolve(import.meta.dirname, "..");
const releaseDirectory = resolve(root, "artifacts/release");

export function artifactFilename(browser, version) {
  if (!BROWSERS.includes(browser)) {
    throw new Error(`Unsupported browser: ${browser}`);
  }
  return `yt-looper-${browser}-v${version}.zip`;
}

async function run(command, arguments_) {
  const { stdout, stderr } = await execute(command, arguments_, {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  if (stdout.trim()) console.log(stdout.trim());
  if (stderr.trim()) console.error(stderr.trim());
  return stdout;
}

async function sha256(path) {
  const content = await readFile(path);
  return createHash("sha256").update(content).digest("hex");
}

async function describeAsset(path, extra = {}) {
  return {
    ...extra,
    file: basename(path),
    sha256: await sha256(path),
    size: (await stat(path)).size
  };
}

export async function packageRelease() {
  const version = await verifyReleaseVersion({ root });
  await rm(releaseDirectory, { recursive: true, force: true });
  await mkdir(releaseDirectory, { recursive: true });

  const archives = [];
  for (const browser of BROWSERS) {
    await run(process.execPath, [resolve(root, "scripts/build.mjs"), `--browser=${browser}`]);
    const filename = artifactFilename(browser, version);
    await run(resolve(root, "node_modules/.bin/web-ext"), [
      "build",
      "--source-dir",
      resolve(root, `dist/${browser}`),
      "--artifacts-dir",
      releaseDirectory,
      "--filename",
      filename,
      "--overwrite-dest",
      "--no-input"
    ]);
    archives.push(await describeAsset(resolve(releaseDirectory, filename), { browser }));
  }

  const sbomPath = resolve(releaseDirectory, "sbom.spdx.json");
  const { stdout: sbom } = await execute("npm", ["sbom", "--sbom-format", "spdx"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024
  });
  JSON.parse(sbom);
  await writeFile(sbomPath, sbom, "utf8");
  const sbomAsset = await describeAsset(sbomPath);

  const manifestPath = resolve(releaseDirectory, "release-manifest.json");
  await writeFile(
    manifestPath,
    `${JSON.stringify(
      { schemaVersion: 1, product: "yt-looper", version, archives, sbom: sbomAsset },
      null,
      2
    )}\n`,
    "utf8"
  );

  const checksumPaths = [
    ...archives.map(({ file }) => resolve(releaseDirectory, file)),
    sbomPath,
    manifestPath
  ].sort();
  const checksums = await Promise.all(
    checksumPaths.map(async (path) => `${await sha256(path)}  ${basename(path)}`)
  );
  await writeFile(resolve(releaseDirectory, "SHA256SUMS"), `${checksums.join("\n")}\n`, "utf8");

  console.log(`Release ${version} packaged in ${releaseDirectory}:`);
  for (const { file } of archives) console.log(`- ${file}`);
  return { version, archives };
}

async function main() {
  const version = await verifyReleaseVersion({ root });
  if (process.argv.includes("--print-filenames")) {
    for (const browser of BROWSERS) console.log(artifactFilename(browser, version));
    return;
  }
  if (process.argv.length !== 2) {
    throw new Error("Usage: package-release.mjs [--print-filenames]");
  }
  await packageRelease();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
