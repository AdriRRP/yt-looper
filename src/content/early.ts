import { captureLoopRequestUrl } from "../sharing/early-capture";

const captureCurrentLocation = (): void => {
  captureLoopRequestUrl(location.href);
};

captureCurrentLocation();
for (const eventName of ["yt-navigate-start", "yt-navigate-finish", "popstate", "hashchange"]) {
  window.addEventListener(eventName, captureCurrentLocation, { capture: true });
}
