import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const policy = JSON.parse(
  await readFile(new URL("../.security-audit-allowlist.json", import.meta.url), "utf8")
);
const audit = spawnSync("npm", ["audit", "--json"], { encoding: "utf8" });
if (!audit.stdout) {
  throw new Error(`npm audit produced no JSON output.\n${audit.stderr}`);
}

const report = JSON.parse(audit.stdout);
if (report.error || report.message) {
  throw new Error(
    `npm audit could not retrieve a vulnerability report: ${report.message ?? report.error?.summary ?? "unknown error"}`
  );
}
const severe = Object.values(report.vulnerabilities ?? {}).filter(
  (finding) => finding.severity === "high" || finding.severity === "critical"
);
const today = new Date().toISOString().slice(0, 10);
const expired = policy.entries.filter((entry) => entry.expires < today);
if (expired.length > 0) {
  throw new Error(
    `Security exceptions expired:\n${expired.map((entry) => `- ${entry.advisory} (${entry.package})`).join("\n")}`
  );
}

const allowedAdvisories = new Set(policy.entries.map((entry) => entry.advisory));
const allowedPackages = new Set([
  ...policy.entries.map((entry) => entry.package),
  "addons-linter",
  "web-ext"
]);
const foundAdvisories = new Set();
for (const finding of severe) {
  if (!allowedPackages.has(finding.name)) {
    throw new Error(`Unaccepted ${finding.severity} vulnerability in ${finding.name}.`);
  }
  for (const cause of finding.via) {
    if (typeof cause === "object" && cause.url) {
      const advisory = new URL(cause.url).pathname.split("/").at(-1);
      if (advisory) {
        foundAdvisories.add(advisory);
        if (!allowedAdvisories.has(advisory)) {
          throw new Error(`Unaccepted advisory ${advisory} in ${finding.name}.`);
        }
      }
    } else if (typeof cause === "string" && !allowedPackages.has(cause)) {
      throw new Error(`Unaccepted transitive vulnerability ${cause} in ${finding.name}.`);
    }
  }
}

const stale = [...allowedAdvisories].filter((advisory) => !foundAdvisories.has(advisory));
if (stale.length > 0) {
  throw new Error(
    `Remove resolved security exceptions:\n${stale.map((id) => `- ${id}`).join("\n")}`
  );
}

console.log(
  `Security audit passed: ${severe.length} high/critical package findings are covered by ${foundAdvisories.size} time-bounded development-only exceptions.`
);
