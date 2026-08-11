import { access, readFile } from "node:fs/promises";

const buildDirectory = new URL("../dist/chrome/", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", buildDirectory), "utf8"));
const errors = [];

function assert(condition, message) {
  if (!condition) {
    errors.push(message);
  }
}

async function assertFile(relativePath, description) {
  try {
    await access(new URL(relativePath, buildDirectory));
  } catch {
    errors.push(`${description} is missing: ${relativePath}`);
  }
}

assert(manifest.manifest_version === 3, "Chrome must use Manifest V3.");
assert(Number(manifest.minimum_chrome_version) >= 109, "Chrome 109+ must be declared.");
assert(
  !("browser_specific_settings" in manifest),
  "Chrome manifest contains Firefox-only settings."
);
assert(manifest.action?.default_popup === "popup.html", "Chrome popup entry is invalid.");
assert(
  ["storage", "activeTab", "clipboardWrite"].every((permission) =>
    manifest.permissions?.includes(permission)
  ),
  "Chrome manifest is missing a required permission."
);

await assertFile(manifest.action?.default_popup, "Popup");
for (const script of manifest.content_scripts ?? []) {
  for (const relativePath of script.js ?? []) {
    await assertFile(relativePath, "Content script");
  }
}
for (const [size, relativePath] of Object.entries(manifest.icons ?? {})) {
  await assertFile(relativePath, `Icon ${size}`);
  try {
    const icon = await readFile(new URL(relativePath, buildDirectory));
    assert(icon.subarray(0, 8).toString("hex") === "89504e470d0a1a0a", `Icon ${size} is not PNG.`);
    assert(icon.readUInt32BE(16) === Number(size), `Icon ${size} has the wrong width.`);
    assert(icon.readUInt32BE(20) === Number(size), `Icon ${size} has the wrong height.`);
  } catch {
    // Missing-file error is already reported above.
  }
}

if (errors.length > 0) {
  throw new Error(`Chrome extension validation failed:\n- ${errors.join("\n- ")}`);
}

console.log("Chrome MV3 validation passed.");
