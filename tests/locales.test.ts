import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

interface LocaleMessage {
  message: string;
  placeholders?: Record<string, unknown>;
}

type LocaleCatalog = Record<string, LocaleMessage>;

function catalog(locale: string): LocaleCatalog {
  return JSON.parse(
    readFileSync(resolve(process.cwd(), `_locales/${locale}/messages.json`), "utf8")
  ) as LocaleCatalog;
}

describe("locale catalog parity", () => {
  it("keeps Spanish and English keys, placeholders and non-empty messages aligned", () => {
    const english = catalog("en");
    const spanish = catalog("es");
    expect(Object.keys(spanish).sort()).toEqual(Object.keys(english).sort());
    for (const key of Object.keys(english)) {
      expect(english[key]?.message.trim(), `${key} in English`).not.toBe("");
      expect(spanish[key]?.message.trim(), `${key} in Spanish`).not.toBe("");
      expect(Object.keys(spanish[key]?.placeholders ?? {}).sort(), `${key} placeholders`).toEqual(
        Object.keys(english[key]?.placeholders ?? {}).sort()
      );
    }
  });
});
