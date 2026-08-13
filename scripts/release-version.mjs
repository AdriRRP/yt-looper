import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { format } from "prettier";

const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u;
const MANIFESTS = ["firefox", "chrome", "safari"];

function parseArguments(arguments_) {
  const positional = [];
  let root = process.cwd();
  let tag;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--root") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--root requires a path");
      root = resolve(value);
      index += 1;
    } else if (argument === "--tag") {
      const value = arguments_[index + 1];
      if (!value || value.startsWith("--")) throw new Error("--tag requires a vX.Y.Z value");
      tag = value;
      index += 1;
    } else {
      positional.push(argument);
    }
  }

  return { positional, root, tag };
}

function assertVersion(version, label = "version") {
  if (typeof version !== "string" || !VERSION_PATTERN.test(version)) {
    throw new Error(`${label} must use the X.Y.Z numeric format; received ${String(version)}`);
  }
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function loadVersionFiles(root) {
  const paths = {
    package: resolve(root, "package.json"),
    lock: resolve(root, "package-lock.json"),
    manifests: Object.fromEntries(
      MANIFESTS.map((browser) => [browser, resolve(root, `manifests/${browser}.json`)])
    )
  };
  const [packageMetadata, lock, ...manifests] = await Promise.all([
    readJson(paths.package),
    readJson(paths.lock),
    ...MANIFESTS.map((browser) => readJson(paths.manifests[browser]))
  ]);

  if (typeof lock.packages?.[""] !== "object") {
    throw new Error("package-lock.json does not contain the root package entry");
  }

  return {
    paths,
    documents: {
      package: packageMetadata,
      lock,
      manifests: Object.fromEntries(MANIFESTS.map((browser, index) => [browser, manifests[index]]))
    }
  };
}

function versionEntries(documents) {
  return [
    ["package.json", documents.package.version],
    ["package-lock.json", documents.lock.version],
    ["package-lock.json root package", documents.lock.packages[""].version],
    ...MANIFESTS.map((browser) => [
      `manifests/${browser}.json`,
      documents.manifests[browser].version
    ])
  ];
}

export async function verifyReleaseVersion({ root = process.cwd(), tag } = {}) {
  const { documents } = await loadVersionFiles(root);
  const entries = versionEntries(documents);
  for (const [label, version] of entries) {
    assertVersion(version, label);
  }

  const version = entries[0][1];
  const mismatches = entries.filter(([, candidate]) => candidate !== version);
  if (mismatches.length > 0) {
    const details = entries.map(([label, candidate]) => `${label}=${candidate}`).join(", ");
    throw new Error(`release versions are not synchronized: ${details}`);
  }

  if (tag !== undefined) {
    if (tag !== `v${version}`) {
      throw new Error(`release tag ${tag} does not match synchronized version v${version}`);
    }
  }

  return version;
}

export async function prepareReleaseVersion(version, { root = process.cwd() } = {}) {
  assertVersion(version);
  const { paths, documents } = await loadVersionFiles(root);

  documents.package.version = version;
  documents.lock.version = version;
  documents.lock.packages[""].version = version;
  for (const browser of MANIFESTS) {
    documents.manifests[browser].version = version;
  }

  const files = [
    [paths.package, documents.package],
    [paths.lock, documents.lock],
    ...MANIFESTS.map((browser) => [paths.manifests[browser], documents.manifests[browser]])
  ];
  await Promise.all(
    files.map(async ([path, document]) => {
      const content =
        path === paths.lock
          ? `${JSON.stringify(document, null, 2)}\n`
          : await format(JSON.stringify(document), { parser: "json" });
      await writeFile(path, content, "utf8");
    })
  );
  await verifyReleaseVersion({ root });
  return files.map(([path]) => path);
}

async function main() {
  const { positional, root, tag } = parseArguments(process.argv.slice(2));
  const [command, version] = positional;

  if (command === "verify" && positional.length === 1) {
    const verifiedVersion = await verifyReleaseVersion({ root, tag });
    console.log(`Release version ${verifiedVersion} is synchronized${tag ? ` with ${tag}` : ""}.`);
    return;
  }

  if (command === "prepare" && positional.length === 2) {
    if (tag !== undefined) throw new Error("--tag can only be used with the verify command");
    const files = await prepareReleaseVersion(version, { root });
    console.log(`Prepared release version ${version} in ${files.length} files.`);
    return;
  }

  throw new Error(
    "Usage: release-version.mjs verify [--tag vX.Y.Z] [--root PATH] | prepare X.Y.Z [--root PATH]"
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
