import { describe, expect, it } from "vitest";
import { getLoopRequestKey, selectInitialLoop } from "../src/content/initial-loop";
import type { StoredBookmark } from "../src/platform/storage";

const bookmark: StoredBookmark = {
  id: "bookmark-1",
  name: "Nombre cosmético",
  folderId: null,
  videoId: "dQw4w9WgXcQ",
  videoTitle: "Vídeo",
  start: 20,
  end: 25,
  rate: 0.8,
  createdAt: 1
};

describe("initial loop selection", () => {
  it("gives a shared link priority over a local bookmark and remembered loop", () => {
    expect(
      selectInitialLoop(
        { v: 2, i: "dQw4w9WgXcQ", a: 3, b: 8, r: 0.65 },
        bookmark,
        { start: 40, end: 50 },
        1.25
      )
    ).toEqual({ start: 3, end: 8, rate: 0.65, source: "shared" });
  });

  it("uses the bookmark before remembered state", () => {
    expect(selectInitialLoop(null, bookmark, { start: 40, end: 50 }, 1.25)).toEqual({
      start: 20,
      end: 25,
      rate: 0.8,
      source: "bookmark"
    });
  });

  it("applies the default speed only to remembered A/B points", () => {
    expect(selectInitialLoop(null, undefined, { start: 40, end: 50 }, 1.25)).toEqual({
      start: 40,
      end: 50,
      rate: 1.25,
      source: "remembered"
    });
    expect(selectInitialLoop(null, undefined, undefined, 1.25)).toBeNull();
  });

  it("tracks only loop-relevant navigation parameters", () => {
    expect(getLoopRequestKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=12&ytl=one")).toBe(
      "one|"
    );
    expect(getLoopRequestKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ#ytl=two")).toBe("two|");
    expect(
      getLoopRequestKey("https://www.youtube.com/watch?v=dQw4w9WgXcQ&ytl_bookmark=local")
    ).toBe("|local");
    expect(getLoopRequestKey("not a url")).toBe("|");
  });
});
