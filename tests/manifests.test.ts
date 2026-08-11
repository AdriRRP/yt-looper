import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

interface ExtensionManifest {
  manifest_version: number;
  version: string;
  permissions: string[];
  content_scripts: {
    matches: string[];
    js: string[];
    run_at: string;
  }[];
  action: {
    default_popup: string;
    default_icon: string | Record<string, string>;
  };
  icons: Record<string, string>;
  minimum_chrome_version?: string;
  host_permissions?: string[];
  browser_specific_settings?: unknown;
}

function loadManifest(name: "firefox" | "chrome" | "safari"): ExtensionManifest {
  return JSON.parse(
    readFileSync(new URL(`../manifests/${name}.json`, import.meta.url), "utf8")
  ) as ExtensionManifest;
}

describe("browser manifests", () => {
  const firefox = loadManifest("firefox");
  const chrome = loadManifest("chrome");
  const safari = loadManifest("safari");

  it("keeps package and browser release versions synchronized", () => {
    const packageMetadata = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8")
    ) as { version: string };
    expect(firefox.version).toBe(packageMetadata.version);
    expect(chrome.version).toBe(packageMetadata.version);
    expect(safari.version).toBe(packageMetadata.version);
  });

  it("keeps shared functionality aligned across Firefox and Chrome", () => {
    expect(chrome.manifest_version).toBe(3);
    expect(chrome.version).toBe(firefox.version);
    expect(chrome.permissions).toEqual(firefox.permissions);
    expect(chrome.content_scripts).toEqual(firefox.content_scripts);
    expect(chrome.action.default_popup).toBe(firefox.action.default_popup);
  });

  it("keeps Safari product behavior aligned with the other desktop builds", () => {
    expect(safari.manifest_version).toBe(3);
    expect(safari.version).toBe(firefox.version);
    expect(safari.permissions).toEqual(firefox.permissions);
    expect(safari.content_scripts).toEqual(firefox.content_scripts);
    expect(safari.action.default_popup).toBe(firefox.action.default_popup);
  });

  it("requests only the explicit YouTube host in Safari MV3", () => {
    expect(safari.host_permissions).toEqual(["https://www.youtube.com/*"]);
    expect(safari.minimum_chrome_version).toBeUndefined();
    expect(safari.browser_specific_settings).toBeUndefined();
    expect(safari.icons).toEqual(chrome.icons);
    expect(safari.action.default_icon).toEqual(safari.icons);
  });

  it("uses Chrome-compatible raster icons and no Firefox-only settings", () => {
    expect(chrome.minimum_chrome_version).toBe("109");
    expect(chrome.browser_specific_settings).toBeUndefined();
    expect(chrome.icons).toEqual({
      "16": "icons/icon-16.png",
      "32": "icons/icon-32.png",
      "48": "icons/icon-48.png",
      "128": "icons/icon-128.png"
    });
    expect(chrome.action.default_icon).toEqual(chrome.icons);
  });

  for (const size of [16, 32, 48, 128]) {
    it(`ships a real ${size}×${size} PNG icon`, () => {
      const icon = readFileSync(new URL(`../assets/icons/icon-${size}.png`, import.meta.url));
      expect(icon.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
      expect(icon.readUInt32BE(16)).toBe(size);
      expect(icon.readUInt32BE(20)).toBe(size);
    });
  }
});
