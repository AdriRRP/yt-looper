import type { SharedLoopPayload } from "../sharing/loop-links";
import { SHARED_LOOP_PARAMETER } from "../sharing/loop-links";
import type { StoredBookmark, StoredLoop } from "../platform/storage";

export interface InitialLoopSelection {
  start: number;
  end: number;
  rate: number;
  source: "shared" | "bookmark" | "remembered";
}

export function selectInitialLoop(
  sharedLoop: SharedLoopPayload | null,
  bookmark: StoredBookmark | undefined,
  rememberedLoop: StoredLoop | undefined,
  defaultRate: number
): InitialLoopSelection | null {
  if (sharedLoop) {
    return {
      start: sharedLoop.a,
      end: sharedLoop.b,
      rate: sharedLoop.r,
      source: "shared"
    };
  }
  if (bookmark) {
    return {
      start: bookmark.start,
      end: bookmark.end,
      rate: bookmark.rate,
      source: "bookmark"
    };
  }
  if (rememberedLoop) {
    return {
      ...rememberedLoop,
      rate: defaultRate,
      source: "remembered"
    };
  }
  return null;
}

export function getLoopRequestKey(input: string | URL): string {
  try {
    const url = input instanceof URL ? input : new URL(input);
    const sharedPayload =
      url.searchParams.get(SHARED_LOOP_PARAMETER) ??
      new URLSearchParams(url.hash.replace(/^#/, "")).get(SHARED_LOOP_PARAMETER) ??
      "";
    return `${sharedPayload}|${url.searchParams.get("ytl_bookmark") ?? ""}`;
  } catch {
    return "|";
  }
}
