import { afterEach, describe, expect, it } from "vitest";
import {
  captureLoopRequestUrl,
  consumeCapturedLoopRequestUrl,
  peekCapturedLoopRequestUrl
} from "../src/sharing/early-capture";
import { buildSharedLoopUrl } from "../src/sharing/loop-links";

afterEach(() => {
  consumeCapturedLoopRequestUrl();
});

describe("early loop URL capture", () => {
  it("keeps a valid shared fragment until the controller consumes it", () => {
    const url = buildSharedLoopUrl({
      videoId: "dQw4w9WgXcQ",
      start: 12.5,
      end: 18.75,
      rate: 0.75
    })!;
    expect(captureLoopRequestUrl(url)).toBe(true);
    expect(peekCapturedLoopRequestUrl()).toBe(url);
    expect(consumeCapturedLoopRequestUrl()).toBe(url);
    expect(peekCapturedLoopRequestUrl()).toBeNull();
  });

  it("also protects local bookmark links from YouTube URL normalization", () => {
    const url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ&ytl_bookmark=bookmark-1";
    expect(captureLoopRequestUrl(url)).toBe(true);
    expect(peekCapturedLoopRequestUrl()).toBe(url);
  });

  it("does not retain ordinary, foreign or malformed URLs", () => {
    expect(captureLoopRequestUrl("https://www.youtube.com/watch?v=dQw4w9WgXcQ")).toBe(false);
    expect(captureLoopRequestUrl("https://example.com/watch?v=dQw4w9WgXcQ&ytl_bookmark=x")).toBe(
      false
    );
    expect(captureLoopRequestUrl("not a URL")).toBe(false);
  });
});
