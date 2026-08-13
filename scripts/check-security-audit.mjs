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
const productionAudit = spawnSync("npm", ["audit", "--omit=dev", "--json"], {
  encoding: "utf8"
});
if (!productionAudit.stdout) {
  throw new Error(`npm production audit produced no JSON output.\n${productionAudit.stderr}`);
}
const productionReport = JSON.parse(productionAudit.stdout);
if (productionReport.error || productionReport.message) {
  throw new Error(
    `npm production audit failed: ${productionReport.message ?? productionReport.error?.summary ?? "unknown error"}`
  );
}
const productionSevere = Object.values(productionReport.vulnerabilities ?? {}).filter(
  (finding) => finding.severity === "high" || finding.severity === "critical"
);
if (productionSevere.length > 0) {
  throw new Error(
    `Production vulnerabilities cannot be allowlisted:\n${productionSevere.map((finding) => `- ${finding.name} (${finding.severity})`).join("\n")}`
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

function dependencyPaths(node, target, prefix = []) {
  const paths = [];
  for (const [name, dependency] of Object.entries(node.dependencies ?? {})) {
    const path = [...prefix, name];
    if (name === target) {
      paths.push(path.join(">"));
    }
    paths.push(...dependencyPaths(dependency, target, path));
  }
  return paths;
}

for (const entry of policy.entries) {
  const dependencyTree = spawnSync("npm", ["ls", entry.package, "--all", "--json"], {
    encoding: "utf8"
  });
  if (!dependencyTree.stdout) {
    throw new Error(`Could not inspect allowlisted dependency path ${entry.path}.`);
  }
  const actualPaths = dependencyPaths(JSON.parse(dependencyTree.stdout), entry.package);
  if (!actualPaths.includes(entry.path)) {
    throw new Error(
      `Allowlisted path moved for ${entry.advisory}: expected ${entry.path}; found ${actualPaths.join(", ") || "none"}.`
    );
  }
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
