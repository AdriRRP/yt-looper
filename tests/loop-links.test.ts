import { describe, expect, it } from "vitest";
import {
  buildSharedLoopUrl,
  decodeSharedLoop,
  encodeSharedLoop,
  readSharedLoopFromUrl,
  SHARED_LOOP_PARAMETER,
  sharedLoopFitsDuration
} from "../src/sharing/loop-links";

const loop = {
  videoId: "dQw4w9WgXcQ",
  start: 12.5,
  end: 18.75,
  rate: 0.75
};

describe("shared loop links", () => {
  it("round-trips a minimal versioned payload in a compatible YouTube query URL", () => {
    const sharedUrl = buildSharedLoopUrl(loop, "query");
    expect(sharedUrl).not.toBeNull();

    const url = new URL(sharedUrl!);
    expect(url.origin + url.pathname).toBe("https://www.youtube.com/watch");
    expect(url.searchParams.get("v")).toBe(loop.videoId);
    expect(url.searchParams.get("t")).toBe("12");
    expect(readSharedLoopFromUrl(url)).toEqual({
      v: 2,
      i: loop.videoId,
      a: loop.start,
      b: loop.end,
      r: loop.rate
    });
  });

  it("uses a fragment for canonical links and reads it back", () => {
    const sharedUrl = buildSharedLoopUrl(loop);
    const url = new URL(sharedUrl!);
    expect(url.searchParams.has(SHARED_LOOP_PARAMETER)).toBe(false);
    expect(url.hash).toMatch(/^#ytl=/u);
    expect(readSharedLoopFromUrl(url)).toMatchObject({ a: 12.5, b: 18.75, r: 0.75 });
  });

  it("prefers a valid query payload when both locations are present", () => {
    const queryUrl = new URL(buildSharedLoopUrl(loop, "query")!);
    const fragmentPayload = encodeSharedLoop({ ...loop, start: 30, end: 35 })!;
    queryUrl.hash = `${SHARED_LOOP_PARAMETER}=${fragmentPayload}`;
    expect(readSharedLoopFromUrl(queryUrl)?.a).toBe(12.5);
  });

  it("does not encode cosmetic names or folder metadata", () => {
    const encoded = encodeSharedLoop(loop)!;
    expect(decodeSharedLoop(encoded)).toEqual({
      v: 2,
      a: 12.5,
      b: 18.75,
      r: 0.75
    });
    expect(
      atob(
        encoded
          .replaceAll("-", "+")
          .replaceAll("_", "/")
          .padEnd(Math.ceil(encoded.length / 4) * 4, "=")
      )
    ).not.toMatch(/name|folder|title|dQw4w9WgXcQ/iu);
  });

  it("reads legacy v1 links and ignores optional or unknown fields", () => {
    const legacy = base64Url({
      v: 1,
      i: loop.videoId,
      a: loop.start,
      b: loop.end,
      r: loop.rate,
      url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ",
      futureMetadata: { label: "practice" }
    });
    expect(
      readSharedLoopFromUrl(`https://www.youtube.com/watch?v=${loop.videoId}&t=12#ytl=${legacy}`)
    ).toEqual({
      v: 1,
      i: loop.videoId,
      a: loop.start,
      b: loop.end,
      r: loop.rate
    });
  });

  it("derives the video identity from the URL for v2 payloads with extra fields", () => {
    const encoded = base64Url({ v: 2, a: 4, b: 9, r: 1.25, url: "ignored", label: "Solo" });
    expect(
      readSharedLoopFromUrl(`https://www.youtube.com/watch?v=${loop.videoId}#ytl=${encoded}`)
    ).toMatchObject({ v: 2, i: loop.videoId, a: 4, b: 9, r: 1.25 });
  });

  it.each([
    ["malformed Base64URL", "%%%"],
    ["unsupported version", base64Url({ v: 3, a: 1, b: 2, r: 1 })],
    ["legacy payload without video id", base64Url({ v: 1, a: 1, b: 2, r: 1 })],
    ["invalid video id", base64Url({ v: 1, i: "bad", a: 1, b: 2, r: 1 })],
    ["negative A", base64Url({ v: 1, i: loop.videoId, a: -1, b: 2, r: 1 })],
    ["reversed points", base64Url({ v: 1, i: loop.videoId, a: 3, b: 2, r: 1 })],
    ["non-finite-like value", base64Url({ v: 1, i: loop.videoId, a: null, b: 2, r: 1 })],
    ["speed below range", base64Url({ v: 1, i: loop.videoId, a: 1, b: 2, r: 0.1 })],
    ["speed above range", base64Url({ v: 1, i: loop.videoId, a: 1, b: 2, r: 5 })],
    [
      "finite values beyond the supported timeline",
      base64Url({ v: 2, a: 1e306, b: 1.1e306, r: 1 })
    ],
    ["oversized payload", "a".repeat(513)]
  ])("rejects %s", (_case, encoded) => {
    expect(decodeSharedLoop(encoded)).toBeNull();
  });

  it("uses the destination video for v2 and rejects mismatched legacy IDs or foreign hosts", () => {
    const encoded = encodeSharedLoop(loop)!;
    expect(
      readSharedLoopFromUrl(`https://www.youtube.com/watch?v=9bZkp7q19f0&ytl=${encoded}`)
    ).toMatchObject({ i: "9bZkp7q19f0", a: 12.5, b: 18.75, r: 0.75 });
    const legacy = base64Url({ v: 1, i: loop.videoId, a: 12.5, b: 18.75, r: 0.75 });
    expect(
      readSharedLoopFromUrl(`https://www.youtube.com/watch?v=9bZkp7q19f0&ytl=${legacy}`)
    ).toBeNull();
    expect(
      readSharedLoopFromUrl(`https://example.com/watch?v=${loop.videoId}&ytl=${encoded}`)
    ).toBeNull();
  });

  it("ignores malformed URLs safely", () => {
    expect(readSharedLoopFromUrl("not a URL")).toBeNull();
    expect(
      readSharedLoopFromUrl(`https://www.youtube.com/watch?v=${loop.videoId}&ytl=bad`)
    ).toBeNull();
  });

  it("requires B to fit the real video duration once metadata is known", () => {
    const payload = decodeSharedLoop(encodeSharedLoop(loop)!)!;
    expect(sharedLoopFitsDuration(payload, 18.75)).toBe(true);
    expect(sharedLoopFitsDuration(payload, 18.7)).toBe(false);
    expect(sharedLoopFitsDuration(payload, Number.POSITIVE_INFINITY)).toBe(true);
  });
});

function base64Url(value: unknown): string {
  return btoa(JSON.stringify(value)).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}
