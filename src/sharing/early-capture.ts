import { readSharedLoopFromUrl } from "./loop-links";

const PENDING_REQUEST_KEY = "__ytLooperPendingRequestUrlV1";

type CaptureGlobal = typeof globalThis & {
  [PENDING_REQUEST_KEY]?: string;
};

export function captureLoopRequestUrl(input: string | URL): boolean {
  let url: URL;
  try {
    url = input instanceof URL ? input : new URL(input);
  } catch {
    return false;
  }
  if (url.hostname !== "www.youtube.com" && url.hostname !== "youtube.com") {
    return false;
  }
  const hasSharedLoop = readSharedLoopFromUrl(url) !== null;
  const hasBookmark = Boolean(url.searchParams.get("ytl_bookmark"));
  if (!hasSharedLoop && !hasBookmark) {
    return false;
  }
  (globalThis as CaptureGlobal)[PENDING_REQUEST_KEY] = url.toString();
  return true;
}

export function peekCapturedLoopRequestUrl(): string | null {
  return (globalThis as CaptureGlobal)[PENDING_REQUEST_KEY] ?? null;
}

export function consumeCapturedLoopRequestUrl(): string | null {
  const extensionGlobal = globalThis as CaptureGlobal;
  const captured = extensionGlobal[PENDING_REQUEST_KEY] ?? null;
  delete extensionGlobal[PENDING_REQUEST_KEY];
  return captured;
}
