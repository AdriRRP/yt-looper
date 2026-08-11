import { MAX_PLAYBACK_RATE, MIN_LOOP_SECONDS, MIN_PLAYBACK_RATE } from "../core/loop-engine";

export const SHARED_LOOP_PARAMETER = "ytl";
const SHARED_LOOP_VERSION = 1;
const MAX_ENCODED_PAYLOAD_LENGTH = 512;
const YOUTUBE_VIDEO_ID = /^[A-Za-z0-9_-]{11}$/;

export interface SharedLoopPayload {
  v: 1;
  i: string;
  a: number;
  b: number;
  r: number;
}

export interface SharedLoopInput {
  videoId: string;
  start: number;
  end: number;
  rate: number;
}

export type SharedLoopLocation = "query" | "fragment";

function createSharedLoopPayload(input: SharedLoopInput): SharedLoopPayload | null {
  const payload: SharedLoopPayload = {
    v: SHARED_LOOP_VERSION,
    i: input.videoId,
    a: input.start,
    b: input.end,
    r: input.rate
  };
  return isValidPayload(payload) ? payload : null;
}

export function encodeSharedLoop(input: SharedLoopInput): string | null {
  const payload = createSharedLoopPayload(input);
  if (!payload) {
    return null;
  }
  return base64UrlEncode(JSON.stringify(payload));
}

export function decodeSharedLoop(encoded: string): SharedLoopPayload | null {
  if (!encoded || encoded.length > MAX_ENCODED_PAYLOAD_LENGTH) {
    return null;
  }
  try {
    const candidate = JSON.parse(base64UrlDecode(encoded)) as unknown;
    return isValidPayload(candidate) ? candidate : null;
  } catch {
    return null;
  }
}

export function buildSharedLoopUrl(
  input: SharedLoopInput,
  location: SharedLoopLocation = "fragment"
): string | null {
  const encoded = encodeSharedLoop(input);
  if (!encoded) {
    return null;
  }
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", input.videoId);
  url.searchParams.set("t", String(Math.floor(input.start)));
  if (location === "fragment") {
    url.hash = new URLSearchParams({ [SHARED_LOOP_PARAMETER]: encoded }).toString();
  } else {
    url.searchParams.set(SHARED_LOOP_PARAMETER, encoded);
  }
  return url.toString();
}

export function readSharedLoopFromUrl(input: string | URL): SharedLoopPayload | null {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return null;
  }
  if (url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") {
    return null;
  }
  const encoded =
    url.searchParams.get(SHARED_LOOP_PARAMETER) ??
    new URLSearchParams(url.hash.replace(/^#/, "")).get(SHARED_LOOP_PARAMETER);
  if (!encoded) {
    return null;
  }
  const payload = decodeSharedLoop(encoded);
  return payload?.i === url.searchParams.get("v") ? payload : null;
}

export function sharedLoopFitsDuration(payload: SharedLoopPayload, duration: number): boolean {
  return !Number.isFinite(duration) || payload.b <= duration + 0.01;
}

function isValidPayload(candidate: unknown): candidate is SharedLoopPayload {
  if (!candidate || typeof candidate !== "object") {
    return false;
  }
  const payload = candidate as Partial<SharedLoopPayload>;
  return (
    payload.v === SHARED_LOOP_VERSION &&
    typeof payload.i === "string" &&
    YOUTUBE_VIDEO_ID.test(payload.i) &&
    isFiniteNumber(payload.a) &&
    payload.a >= 0 &&
    isFiniteNumber(payload.b) &&
    payload.b - payload.a >= MIN_LOOP_SECONDS &&
    isFiniteNumber(payload.r) &&
    payload.r >= MIN_PLAYBACK_RATE &&
    payload.r <= MAX_PLAYBACK_RATE
  );
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function base64UrlEncode(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/u, "");
}

function base64UrlDecode(value: string): string {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) {
    throw new Error("Invalid Base64URL payload");
  }
  const padded = value
    .replaceAll("-", "+")
    .replaceAll("_", "/")
    .padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}
