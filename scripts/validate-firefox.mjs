import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { promisify } from "node:util";

const execute = promisify(execFile);
const manifest = JSON.parse(await readFile("dist/firefox/manifest.json", "utf8"));
const { stdout } = await execute(
  process.execPath,
  [
    "scripts/run-web-ext.mjs",
    "lint",
    "--source-dir",
    "dist/firefox",
    "--no-input",
    "--output",
    "json"
  ],
  { encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }
);
const report = JSON.parse(stdout);
const errors = report.errors ?? [];
const notices = report.notices ?? [];
const warnings = report.warnings ?? [];

const intentionalDesktopOnlyWarning = (warning) =>
  warning.code === "KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION" &&
  !("gecko_android" in (manifest.browser_specific_settings ?? {})) &&
  manifest.browser_specific_settings?.gecko?.strict_min_version === "140.0" &&
  manifest.browser_specific_settings?.gecko?.data_collection_permissions?.required?.length === 1 &&
  manifest.browser_specific_settings.gecko.data_collection_permissions.required[0] === "none";

const unexpectedWarnings = warnings.filter((warning) => !intentionalDesktopOnlyWarning(warning));
if (errors.length > 0 || notices.length > 0 || unexpectedWarnings.length > 0) {
  throw new Error(
    `Firefox validation failed:\n${JSON.stringify(
      { errors, notices, warnings: unexpectedWarnings },
      null,
      2
    )}`
  );
}

console.log(
  `Firefox desktop validation passed (${report.metadata?.totalScannedFileSize ?? 0} bytes scanned).`
);
if (warnings.length > 0) {
  console.log(
    "The known Android-only minimum-version diagnostic was classified explicitly; this product intentionally omits gecko_android."
  );
}
