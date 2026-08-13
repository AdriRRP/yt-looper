import { YtLooperController } from "./controller";
import type { StorageChanges } from "../platform/storage";

const SHUTDOWN_EVENT = "yt-looper:shutdown-existing-instance";
document.dispatchEvent(new CustomEvent(SHUTDOWN_EVENT));
const controller = new YtLooperController();
void controller.start();
document.addEventListener(SHUTDOWN_EVENT, () => controller.destroy(), { once: true });

interface RuntimeMessageApi {
  runtime?: {
    onMessage?: {
      addListener(
        listener: (
          message: unknown,
          sender: unknown,
          sendResponse: (response: unknown) => void
        ) => boolean | undefined
      ): void;
    };
  };
  storage?: {
    onChanged?: {
      addListener(listener: (changes: StorageChanges, areaName: string) => void): void;
      removeListener(listener: (changes: StorageChanges, areaName: string) => void): void;
    };
  };
}

const extensionGlobal = globalThis as typeof globalThis & {
  browser?: RuntimeMessageApi;
  chrome?: RuntimeMessageApi;
};
const runtime = extensionGlobal.browser?.runtime ?? extensionGlobal.chrome?.runtime;
const storageChanges =
  extensionGlobal.browser?.storage?.onChanged ?? extensionGlobal.chrome?.storage?.onChanged;
let pendingStorageChanges: StorageChanges = {};
let storageChangeTimer: number | null = null;
const onStorageChanged = (changes: StorageChanges, areaName: string): void => {
  if (areaName !== "local") {
    return;
  }
  pendingStorageChanges = { ...pendingStorageChanges, ...changes };
  if (storageChangeTimer !== null) {
    window.clearTimeout(storageChangeTimer);
  }
  storageChangeTimer = window.setTimeout(() => {
    const latestChanges = pendingStorageChanges;
    pendingStorageChanges = {};
    storageChangeTimer = null;
    controller.applyStoredStateChanges(latestChanges);
  }, 75);
};
const onVisibilityChange = (): void => {
  if (document.visibilityState === "hidden") {
    controller.flushPendingState();
  }
};
const onPageHide = (): void => controller.flushPendingState();
storageChanges?.addListener(onStorageChanged);
document.addEventListener("visibilitychange", onVisibilityChange);
window.addEventListener("pagehide", onPageHide);
document.addEventListener(
  SHUTDOWN_EVENT,
  () => {
    storageChanges?.removeListener(onStorageChanged);
    document.removeEventListener("visibilitychange", onVisibilityChange);
    window.removeEventListener("pagehide", onPageHide);
    if (storageChangeTimer !== null) {
      window.clearTimeout(storageChangeTimer);
    }
  },
  { once: true }
);
runtime?.onMessage?.addListener((message, _sender, sendResponse) => {
  if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "get-current-loop"
  ) {
    sendResponse(controller.getCurrentLoop());
  } else if (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === "show-widget"
  ) {
    sendResponse({ shown: controller.showWidget() });
  }
  return false;
});
