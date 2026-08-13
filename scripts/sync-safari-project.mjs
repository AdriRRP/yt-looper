import { access, cp, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";

const projectArgument = process.argv.find((argument) => argument.startsWith("--project="));
const projectDirectory = resolve(
  projectArgument?.slice("--project=".length) || "safari-app/YT Looper"
);
const buildDirectory = resolve("dist/safari");
const resourcesDirectory = resolve(projectDirectory, "YT Looper Extension/Resources");
const projectFile = resolve(projectDirectory, "YT Looper.xcodeproj/project.pbxproj");

try {
  await Promise.all([access(buildDirectory), access(resourcesDirectory), access(projectFile)]);
} catch {
  throw new Error(
    "Safari project not found. Generate it first with npm run safari:project -- --bundle-id=com.example.ytlooper."
  );
}

const project = await readFile(projectFile, "utf8");
if (!project.includes("background.js in Resources")) {
  throw new Error(
    "The Xcode extension target does not include background.js. Regenerate the project before syncing."
  );
}

await rm(resourcesDirectory, { recursive: true, force: true });
await cp(buildDirectory, resourcesDirectory, { recursive: true });
console.log(`Safari extension resources synchronized at ${resourcesDirectory}`);
