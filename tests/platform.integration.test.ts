// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.resetModules();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("localization", () => {
  it("uses extension translations, fallbacks, substitutions and localizes attributes", async () => {
    vi.stubGlobal("browser", {
      i18n: {
        getMessage: (key: string) => (key === "speed" ? "Speed!" : ""),
        getUILanguage: () => "en-GB"
      }
    });
    const { localizeDocument, t } = await import("../src/platform/i18n");
    expect(t("speed")).toBe("Speed!");
    expect(t("fragmentCount", ["3"])).toBe("3 fragmento");
    expect(t("unknown-key")).toBe("unknown-key");
    document.body.innerHTML = `
      <span data-i18n="speed"></span>
      <input data-i18n-placeholder="newFolderName">
      <button data-i18n-aria-label="closeEditor" data-i18n-title="closeEditor"></button>`;
    localizeDocument();
    expect(document.documentElement.lang).toBe("en-GB");
    expect(document.querySelector("span")!.textContent).toBe("Speed!");
    expect(document.querySelector("input")!.placeholder).toBe("Nombre de la carpeta");
    expect(document.querySelector("button")!.getAttribute("aria-label")).toBe("Cerrar editor");
    expect(document.querySelector("button")!.title).toBe("Cerrar editor");
  });
});

describe("clipboard", () => {
  it("uses the async clipboard when available", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { clipboard: { writeText } });
    const { copyText } = await import("../src/platform/clipboard");
    await expect(copyText("loop-url")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("loop-url");
  });

  it("falls back to a temporary textarea and reports the copy result", async () => {
    const writeText = vi.fn().mockRejectedValue(new Error("permission"));
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } });
    const execCommand = vi.fn().mockReturnValue(true);
    Object.defineProperty(document, "execCommand", { configurable: true, value: execCommand });
    const { copyText } = await import("../src/platform/clipboard");
    await expect(copyText("fallback-url")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });
});
