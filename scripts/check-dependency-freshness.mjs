import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const policy = JSON.parse(
  await readFile(new URL("../.dependency-policy.json", import.meta.url), "utf8")
);
const result = spawnSync("npm", ["outdated", "--json"], { encoding: "utf8" });
if (!result.stdout.trim()) {
  if (result.status === 0) {
    console.log("Dependency freshness passed: every direct dependency is current.");
    process.exit(0);
  }
  throw new Error(`npm outdated failed.\n${result.stderr}`);
}

const outdated = JSON.parse(result.stdout);
const today = new Date().toISOString().slice(0, 10);
const exceptions = new Map(policy.allowOutdated.map((entry) => [entry.package, entry]));
const failures = [];
for (const [name, versions] of Object.entries(outdated)) {
  if (versions.current !== versions.wanted) {
    failures.push(`${name}: lockfile has ${versions.current}, wanted ${versions.wanted}`);
    continue;
  }
  const exception = exceptions.get(name);
  if (!exception) {
    failures.push(`${name}: ${versions.current} → ${versions.latest}`);
  } else if (exception.expires < today) {
    failures.push(`${name}: freshness exception expired on ${exception.expires}`);
  }
}

const staleExceptions = [...exceptions.keys()].filter((name) => !(name in outdated));
if (staleExceptions.length > 0) {
  failures.push(`remove stale freshness exceptions: ${staleExceptions.join(", ")}`);
}
if (failures.length > 0) {
  throw new Error(`Dependency freshness failed:\n- ${failures.join("\n- ")}`);
}

console.log(
  `Dependency freshness passed with ${Object.keys(outdated).length} documented, time-bounded compatibility exception(s).`
);
