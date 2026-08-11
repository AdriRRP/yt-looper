import { describe, expect, it } from "vitest";
import { getVideoIdFromUrl, isAdPlaying } from "../src/sites/youtube";

describe("getVideoIdFromUrl", () => {
  it("extracts IDs from regular YouTube watch URLs", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/watch?v=abc123&t=10")).toBe("abc123");
  });

  it("keeps unsupported pages outside the MVP", () => {
    expect(getVideoIdFromUrl("https://www.youtube.com/shorts/abc123")).toBeNull();
    expect(getVideoIdFromUrl("not a URL")).toBeNull();
  });
});

describe("isAdPlaying", () => {
  it("tracks YouTube's ad-showing player class", () => {
    const player = {
      classList: { contains: (name: string) => name === "ad-showing" }
    } as unknown as HTMLElement;
    expect(isAdPlaying(player)).toBe(true);
  });
});
