import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { resolve } from "node:path";

const bundleArgument = process.argv.find((argument) => argument.startsWith("--bundle-id="));
const outputArgument = process.argv.find((argument) => argument.startsWith("--output="));
const bundleIdentifier = bundleArgument?.slice("--bundle-id=".length).trim();
const outputDirectory = resolve(outputArgument?.slice("--output=".length) || "safari-app");
const extensionDirectory = resolve("dist/safari");

// Anchored reverse-DNS validation has bounded, non-overlapping repetitions.
// eslint-disable-next-line security/detect-unsafe-regex
if (!bundleIdentifier || !/^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+$/.test(bundleIdentifier)) {
  throw new Error(
    "Provide a reverse-DNS bundle identifier, for example: " +
      "npm run safari:project -- --bundle-id=com.example.ytlooper"
  );
}

try {
  await access(extensionDirectory);
} catch {
  throw new Error("Safari build not found. Run npm run build:safari first.");
}

const child = spawn(
  "xcrun",
  [
    "safari-web-extension-packager",
    extensionDirectory,
    "--project-location",
    outputDirectory,
    "--app-name",
    "YT Looper",
    "--bundle-identifier",
    bundleIdentifier,
    "--swift",
    "--macos-only",
    "--copy-resources",
    "--no-open",
    "--no-prompt"
  ],
  { stdio: "inherit" }
);

const exitCode = await new Promise((resolveExit, reject) => {
  child.once("error", reject);
  child.once("exit", (code) => resolveExit(code ?? 1));
});

if (exitCode !== 0) {
  throw new Error(
    "Safari project generation failed. Install full Xcode and select it with xcode-select first."
  );
}

console.log(`Safari macOS project created at ${outputDirectory}`);
