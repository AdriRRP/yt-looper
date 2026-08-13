import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const requiredImages = new Map([
  ["store-assets/promotional/small-promo.png", [440, 280]],
  ["store-assets/promotional/marquee.png", [1400, 560]],
  ["store-assets/screenshots/es/01-video-widget.png", [1280, 800]],
  ["store-assets/screenshots/es/02-library.png", [1280, 800]],
  ["store-assets/screenshots/es/03-editor.png", [1280, 800]],
  ["store-assets/screenshots/en/01-video-widget.png", [1280, 800]],
  ["store-assets/screenshots/en/02-library.png", [1280, 800]],
  ["store-assets/screenshots/en/03-editor.png", [1280, 800]]
]);

for (const [path, [expectedWidth, expectedHeight]] of requiredImages) {
  const image = await readFile(path);
  if (image.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a") {
    throw new Error(`${path} is not a PNG image.`);
  }
  const width = image.readUInt32BE(16);
  const height = image.readUInt32BE(20);
  if (width !== expectedWidth || height !== expectedHeight) {
    throw new Error(`${path} is ${width}x${height}; expected ${expectedWidth}x${expectedHeight}.`);
  }
  if ([4, 6].includes(image[25])) {
    throw new Error(`${path} contains an alpha channel, which App Store screenshots reject.`);
  }
}

const generated = JSON.parse(await readFile("store-assets/generated-assets.json", "utf8"));
if (
  generated?.schemaVersion !== 1 ||
  !Array.isArray(generated.visualSources) ||
  typeof generated.sha256 !== "string"
) {
  throw new Error("Marketplace asset provenance is invalid.");
}
const sourceHash = createHash("sha256");
for (const path of generated.visualSources) {
  sourceHash.update(path);
  sourceHash.update("\0");
  sourceHash.update(await readFile(path));
}
if (sourceHash.digest("hex") !== generated.sha256) {
  throw new Error("Marketplace screenshots are stale; run npm run store:assets.");
}

for (const locale of ["ES", "EN"]) {
  const listing = await readFile(`store-assets/LISTING_${locale}.md`, "utf8");
  const summary = listing.match(/^- (?:Resumen|Summary):\s*\n?\s*`([^`]+)`/mu)?.[1];
  if (!summary || summary.length > 132) {
    throw new Error(`Marketplace ${locale} summary is missing or exceeds 132 characters.`);
  }
}
await readFile("PRIVACY.md", "utf8");

console.log(
  `Marketplace contract passed (${requiredImages.size} current opaque PNG assets, bilingual copy and privacy policy).`
);
