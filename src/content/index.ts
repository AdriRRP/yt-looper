import { YtLooperController } from "./controller";

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
      addListener(listener: () => void): void;
      removeListener(listener: () => void): void;
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
const onStorageChanged = (): void => {
  void controller.reloadStoredState();
};
storageChanges?.addListener(onStorageChanged);
document.addEventListener(SHUTDOWN_EVENT, () => storageChanges?.removeListener(onStorageChanged), {
  once: true
});
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
