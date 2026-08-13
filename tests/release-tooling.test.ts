import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const repositoryRoot = fileURLToPath(new URL("../", import.meta.url));
const versionScript = join(repositoryRoot, "scripts/release-version.mjs");
const packageScript = join(repositoryRoot, "scripts/package-release.mjs");
const temporaryDirectories: string[] = [];

function execute(script: string, arguments_: string[] = []) {
  return spawnSync(process.execPath, [script, ...arguments_], {
    cwd: repositoryRoot,
    encoding: "utf8"
  });
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function makeReleaseFixture(version = "0.11.0"): string {
  const root = mkdtempSync(join(tmpdir(), "yt-looper-release-"));
  temporaryDirectories.push(root);
  mkdirSync(join(root, "manifests"));
  writeJson(join(root, "package.json"), { name: "fixture", version });
  writeJson(join(root, "package-lock.json"), {
    name: "fixture",
    version,
    lockfileVersion: 3,
    packages: { "": { name: "fixture", version } }
  });
  for (const browser of ["firefox", "chrome", "safari"]) {
    writeJson(join(root, `manifests/${browser}.json`), { name: "Fixture", version });
  }
  return root;
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

describe("release version tooling", () => {
  it("verifies the repository version against its release tag", () => {
    const { version } = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
      version: string;
    };
    const result = execute(versionScript, ["verify", "--tag", `v${version}`]);
    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`Release version ${version} is synchronized with v${version}.`);
  });

  it("prepares package, lockfile and every browser manifest together", () => {
    const root = makeReleaseFixture();
    const result = execute(versionScript, ["prepare", "1.2.3", "--root", root]);
    expect(result.status).toBe(0);

    const paths = [
      "package.json",
      "package-lock.json",
      "manifests/firefox.json",
      "manifests/chrome.json",
      "manifests/safari.json"
    ];
    for (const path of paths) {
      const document = JSON.parse(readFileSync(join(root, path), "utf8")) as { version: string };
      expect(document.version).toBe("1.2.3");
    }
    const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8")) as {
      packages: Record<string, { version: string }>;
    };
    expect(lock.packages[""]?.version).toBe("1.2.3");
    expect(readFileSync(join(root, "package-lock.json"), "utf8")).toContain(
      '"packages": {\n    "": {'
    );
  });

  it("keeps prepared JSON compatible with the repository formatter", () => {
    const root = makeReleaseFixture();
    writeJson(join(root, "manifests/firefox.json"), {
      name: "Fixture",
      version: "0.11.0",
      permissions: ["storage", "activeTab", "clipboardWrite"]
    });

    const result = execute(versionScript, ["prepare", "1.2.3", "--root", root]);
    expect(result.status).toBe(0);
    expect(readFileSync(join(root, "manifests/firefox.json"), "utf8")).toContain(
      '"permissions": ["storage", "activeTab", "clipboardWrite"]'
    );
  });

  it("rejects inconsistent files before a release", () => {
    const root = makeReleaseFixture();
    writeJson(join(root, "manifests/safari.json"), { name: "Fixture", version: "0.12.0" });
    const result = execute(versionScript, ["verify", "--root", root]);
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("release versions are not synchronized");
  });

  it("rejects invalid versions and tags that do not identify the candidate", () => {
    const root = makeReleaseFixture();
    const invalidVersion = execute(versionScript, ["prepare", "1.2.3-beta.1", "--root", root]);
    expect(invalidVersion.status).not.toBe(0);
    expect(invalidVersion.stderr).toContain("must use the X.Y.Z numeric format");

    const wrongTag = execute(versionScript, ["verify", "--tag", "v9.9.9", "--root", root]);
    expect(wrongTag.status).not.toBe(0);
    expect(wrongTag.stderr).toContain("does not match synchronized version");
  });

  it("requires values for release identity options", () => {
    const missingTag = execute(versionScript, ["verify", "--tag"]);
    expect(missingTag.status).not.toBe(0);
    expect(missingTag.stderr).toContain("--tag requires a vX.Y.Z value");

    const missingRoot = execute(versionScript, ["verify", "--root"]);
    expect(missingRoot.status).not.toBe(0);
    expect(missingRoot.stderr).toContain("--root requires a path");
  });
});

describe("release packaging contract", () => {
  it("uses a unique, browser-qualified archive name for every package", () => {
    const { version } = JSON.parse(readFileSync(join(repositoryRoot, "package.json"), "utf8")) as {
      version: string;
    };
    const result = execute(packageScript, ["--print-filenames"]);
    expect(result.status).toBe(0);
    expect(result.stdout.trim().split("\n")).toEqual([
      `yt-looper-firefox-v${version}.zip`,
      `yt-looper-chrome-v${version}.zip`,
      `yt-looper-safari-v${version}.zip`
    ]);
  });

  it("keeps verification, packaging and publication in separate jobs", () => {
    const workflow = readFileSync(join(repositoryRoot, ".github/workflows/release.yml"), "utf8");
    expect(workflow).toContain("workflow_dispatch:");
    expect(workflow).toContain("dry_run:");
    expect(workflow).toMatch(/\n {2}verify:\n/u);
    expect(workflow).toMatch(/\n {2}browser-flows:\n/u);
    expect(workflow).toMatch(/\n {2}package:\n/u);
    expect(workflow).toMatch(/\n {2}publish:\n/u);
    expect(workflow).toContain("if: needs.verify.outputs.dry_run != 'true'");
    expect(workflow).toContain("actions/upload-artifact@");
    expect(workflow).toContain("actions/download-artifact@");
    expect(workflow).toContain("verified-browser-builds-v");
    expect(workflow).toContain("npm run release:package -- --prebuilt");
  });

  it("generates the SBOM deterministically from the committed lockfile", () => {
    const script = readFileSync(packageScript, "utf8");
    expect(script).toContain('["sbom", "--package-lock-only", "--sbom-format", "spdx"]');
    expect(script).toContain('["archive", "--format=zip", `--output=${sourcePath}`, "HEAD"]');
  });
});
