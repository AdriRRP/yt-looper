import { readdir, readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseDocument } from "yaml";

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

const paths = (await filesRecursively(".github")).filter((path) =>
  [".yml", ".yaml"].includes(extname(path))
);
const failures = [];
for (const path of paths) {
  const source = await readFile(path, "utf8");
  const document = parseDocument(source, { prettyErrors: true, uniqueKeys: true });
  for (const error of document.errors) {
    failures.push(`${path}: ${error.message}`);
  }
  if (/permissions:\s*write-all/u.test(source)) {
    failures.push(`${path}: workflows must not grant write-all permissions`);
  }
  for (const match of source.matchAll(/uses:\s*([^\s#]+)/gu)) {
    const reference = match[1];
    if (reference.startsWith("./")) {
      continue;
    }
    // Anchors and bounded repetitions keep action-reference validation linear.
    // eslint-disable-next-line security/detect-unsafe-regex
    if (!/@(?:[a-f0-9]{40}|v\d+(?:\.\d+){0,2})$/iu.test(reference)) {
      failures.push(
        `${path}: action reference is not an immutable SHA or version tag: ${reference}`
      );
    }
  }
}

if (failures.length > 0) {
  throw new Error(`YAML validation failed:\n- ${failures.join("\n- ")}`);
}
console.log(`YAML validation passed for ${paths.length} files.`);
