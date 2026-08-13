// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelActions, PanelViewModel } from "../src/ui/panel";

interface PanelRecord {
  actions: PanelActions;
  updates: PanelViewModel[];
  messages: [string, boolean | undefined, boolean | undefined][];
  visible: boolean;
  destroyed: boolean;
}

const panelHarness = vi.hoisted(() => ({ records: [] as PanelRecord[] }));

vi.mock("../src/ui/panel", () => ({
  LoopPanel: class {
    readonly record: PanelRecord;

    constructor(_player: HTMLElement, actions: PanelActions) {
      this.record = { actions, updates: [], messages: [], visible: true, destroyed: false };
      panelHarness.records.push(this.record);
    }

    update(model: PanelViewModel): void {
      this.record.updates.push(structuredClone(model));
    }

    showMessage(message: string, error?: boolean, ad?: boolean): void {
      this.record.messages.push([message, error, ad]);
    }

    hide(): void {
      this.record.visible = false;
    }

    show(): void {
      this.record.visible = true;
    }

    get visible(): boolean {
      return this.record.visible;
    }

    destroy(): void {
      this.record.destroyed = true;
    }
  }
}));

import { YtLooperController } from "../src/content/controller";
import { captureLoopRequestUrl } from "../src/sharing/early-capture";
import { buildSharedLoopUrl } from "../src/sharing/loop-links";
import { createDefaultState, type StoredState } from "../src/platform/storage";

interface ControllerHarness {
  controller: YtLooperController;
  player: HTMLElement;
  video: HTMLVideoElement;
  memory: Record<string, unknown>;
  writeText: ReturnType<typeof vi.fn>;
}

function savedState(): StoredState {
  const state = createDefaultState();
  state.bookmarks.push({
    id: "bookmark-1",
    name: "Chorus",
    folderId: null,
    videoId: "abc123XYZ_-",
    videoTitle: "Song",
    start: 10,
    end: 15,
    rate: 0.75,
    createdAt: 1
  });
  return state;
}

async function setupController(
  initialState: StoredState = createDefaultState(),
  url = "/watch?v=abc123XYZ_-",
  readyState = 0,
  duration = 60
): Promise<ControllerHarness> {
  history.replaceState({}, "", url);
  document.title = "Song - YouTube";
  document.body.innerHTML = '<div id="movie_player"><video class="html5-main-video"></video></div>';
  const player = document.querySelector<HTMLElement>("#movie_player")!;
  const video = document.querySelector<HTMLVideoElement>("video")!;
  Object.defineProperties(video, {
    duration: { configurable: true, value: duration },
    readyState: { configurable: true, value: readyState },
    play: { configurable: true, value: vi.fn().mockResolvedValue(undefined) }
  });
  const memory: Record<string, unknown> = { ytLooperStateV3: structuredClone(initialState) };
  vi.stubGlobal("browser", {
    storage: {
      local: {
        get: vi.fn(async (keys: string | string[]) => {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            requested
              .filter((key) => key in memory)
              .map((key) => [key, structuredClone(memory[key])])
          );
        }),
        set: vi.fn(async (items: Record<string, unknown>) => {
          Object.assign(memory, structuredClone(items));
        })
      }
    }
  });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  vi.stubGlobal(
    "requestAnimationFrame",
    vi.fn(() => 1)
  );
  vi.stubGlobal("cancelAnimationFrame", vi.fn());
  const controller = new YtLooperController();
  await controller.start();
  return { controller, player, video, memory, writeText };
}

function panel(): PanelRecord {
  return panelHarness.records.at(-1)!;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 220));
}

function replacePlayer(
  duration = 60,
  readyState = 1
): {
  player: HTMLElement;
  video: HTMLVideoElement;
} {
  document.body.innerHTML = '<div id="movie_player"><video class="html5-main-video"></video></div>';
  const player = document.querySelector<HTMLElement>("#movie_player")!;
  const video = document.querySelector<HTMLVideoElement>("video")!;
  Object.defineProperties(video, {
    duration: { configurable: true, value: duration },
    readyState: { configurable: true, value: readyState },
    play: { configurable: true, value: vi.fn().mockResolvedValue(undefined) }
  });
  return { player, video };
}

beforeEach(() => {
  panelHarness.records.length = 0;
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe("content controller use cases", () => {
  it("reports a background persistence failure without breaking the active widget", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = await setupController();
    const storageSet = (
      globalThis as typeof globalThis & {
        browser: { storage: { local: { set: ReturnType<typeof vi.fn> } } };
      }
    ).browser.storage.local.set;
    storageSet.mockRejectedValueOnce(new Error("quota"));

    panel().actions.setRate(0.8);
    await settle();

    expect(panel().messages.at(-1)).toEqual([
      "No se pudo completar la operación. Inténtalo de nuevo.",
      true,
      undefined
    ]);
    expect(warning).toHaveBeenCalled();
    expect(harness.controller.getCurrentLoop()).toMatchObject({ available: true, rate: 0.8 });
    harness.controller.destroy();
  });

  it("coordinates marking, adjusting, playback, persistence, sharing and widget visibility", async () => {
    const { controller, player, video, memory, writeText } = await setupController();
    expect(controller.getCurrentLoop()).toMatchObject({
      available: true,
      videoId: "abc123XYZ_-",
      videoTitle: "Song",
      valid: false
    });
    expect(controller.refresh()).toBeUndefined();
    panel().actions.toggleLoop();
    expect(panel().messages.at(-1)?.[0]).toContain("Marca primero");

    video.currentTime = 10;
    panel().actions.setStartNow();
    video.currentTime = 15;
    panel().actions.setEndNow();
    panel().actions.adjustStart(-0.1);
    panel().actions.adjustStart(0.1);
    panel().actions.adjustEnd(-0.1);
    panel().actions.adjustEnd(0.1);
    panel().actions.setRate(0.75);
    await settle();
    expect(controller.getCurrentLoop()).toMatchObject({
      start: 10,
      end: 15,
      rate: 0.75,
      valid: true
    });
    expect(video.playbackRate).toBe(0.75);

    panel().actions.toggleLoop();
    expect(controller.getCurrentLoop().valid).toBe(true);
    panel().actions.toggleLoop();
    await expect(panel().actions.shareLoop()).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining("#ytl="));

    await expect(panel().actions.saveCurrentLoop()).resolves.toBe(true);
    const snapshot = controller.getCurrentLoop();
    expect(snapshot.bookmarkName).toContain("Song");
    panel().actions.detachBookmark();
    expect(controller.getCurrentLoop()).toMatchObject({
      detachedBookmarkId: snapshot.bookmarkId
    });
    await expect(panel().actions.saveCurrentLoop()).resolves.toBe(false);

    panel().actions.dismiss();
    expect(controller.getCurrentLoop().widgetVisible).toBe(false);
    expect(controller.showWidget()).toBe(true);
    expect(controller.getCurrentLoop().widgetVisible).toBe(true);

    player.classList.add("ad-showing");
    video.playbackRate = 1.5;
    video.dispatchEvent(new Event("ratechange"));
    await settle();
    expect(panel().updates.at(-1)?.adPlaying).toBe(true);
    player.classList.remove("ad-showing");
    await settle();
    expect(panel().messages.some(([message]) => message === "Loop listo")).toBe(true);

    video.playbackRate = 1.25;
    video.dispatchEvent(new Event("ratechange"));
    await settle();
    expect((memory.ytLooperRuntimeV1 as { settings: { rate: number } }).settings.rate).toBe(1.25);
    video.dispatchEvent(new Event("loadedmetadata"));
    await controller.reloadStoredState();
    controller.destroy();
    expect(panel().destroyed).toBe(true);
    expect(controller.getCurrentLoop()).toEqual({ available: false });
    expect(controller.showWidget()).toBe(false);
  });

  it("supports Mac/PC shortcuts, ignores typing and persists combined A/B actions", async () => {
    const { controller, video, memory } = await setupController();
    video.currentTime = 4;
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyA",
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    video.currentTime = 8;
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyB",
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyL",
        altKey: true,
        shiftKey: true,
        bubbles: true,
        cancelable: true
      })
    );
    await settle();
    expect(controller.getCurrentLoop()).toMatchObject({ start: 4, end: 8, valid: true });
    expect((memory.ytLooperRuntimeV1 as { loops: Record<string, unknown> }).loops).toHaveProperty(
      "abc123XYZ_-"
    );

    const input = document.createElement("input");
    document.body.append(input);
    video.currentTime = 12;
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        code: "KeyA",
        altKey: true,
        shiftKey: true,
        bubbles: true
      })
    );
    expect(controller.getCurrentLoop().start).toBe(4);
    document.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyA", repeat: true, altKey: true, shiftKey: true })
    );
    document.dispatchEvent(
      new KeyboardEvent("keydown", { code: "KeyZ", altKey: true, shiftKey: true })
    );
    controller.destroy();
  });

  it("loads and activates a bookmark link once metadata is ready", async () => {
    const initial = savedState();
    const { controller, video } = await setupController(
      initial,
      "/watch?v=abc123XYZ_-&ytl_bookmark=bookmark-1",
      1
    );
    expect(controller.getCurrentLoop()).toMatchObject({
      start: 10,
      end: 15,
      rate: 0.75,
      bookmarkId: "bookmark-1",
      bookmarkName: "Chorus"
    });
    expect(video.currentTime).toBe(10);
    expect(video.play).toHaveBeenCalledOnce();
    expect(panel().messages.some(([message]) => message.includes("Chorus"))).toBe(true);
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(video.play).toHaveBeenCalledOnce();

    panel().actions.setEnd(16);
    await expect(panel().actions.updateBookmarkParameters()).resolves.toBe("updated");
    controller.destroy();
  });

  it("rejects an out-of-range shared request and consumes its early URL", async () => {
    const sharedUrl = buildSharedLoopUrl({
      videoId: "abc123XYZ_-",
      start: 5,
      end: 20,
      rate: 1
    })!;
    expect(captureLoopRequestUrl(sharedUrl)).toBe(true);
    const { controller } = await setupController(
      createDefaultState(),
      "/watch?v=abc123XYZ_-",
      1,
      10
    );
    expect(controller.getCurrentLoop()).toMatchObject({
      available: true,
      shared: true,
      valid: false
    });
    expect(controller.getCurrentLoop()).not.toHaveProperty("start");
    expect(panel().messages.some(([message, error]) => message.includes("fuera") && error)).toBe(
      true
    );
    controller.destroy();
  });

  it("preserves a shared request when YouTube replaces a transient video element", async () => {
    const sharedUrl = buildSharedLoopUrl({
      videoId: "abc123XYZ_-",
      start: 10,
      end: 15,
      rate: 0.75
    })!;
    expect(captureLoopRequestUrl(sharedUrl)).toBe(true);
    const { controller, memory } = await setupController(
      createDefaultState(),
      "/watch?v=abc123XYZ_-",
      1,
      5
    );
    expect(controller.getCurrentLoop()).toMatchObject({ shared: true, valid: false });

    const replacement = replacePlayer();
    controller.refresh();
    expect(controller.getCurrentLoop()).toMatchObject({
      shared: true,
      start: 10,
      end: 15,
      rate: 0.75,
      valid: true
    });
    expect(replacement.video.currentTime).toBe(10);
    expect(replacement.video.play).toHaveBeenCalledOnce();
    await expect(panel().actions.saveCurrentLoop()).resolves.toBe(true);
    expect((memory.ytLooperLibraryV1 as StoredState).bookmarks[0]).toMatchObject({
      videoId: "abc123XYZ_-",
      start: 10,
      end: 15,
      rate: 0.75
    });
    controller.destroy();
  });

  it("does not reapply a handled shared request after the user changes the loop", async () => {
    const sharedUrl = buildSharedLoopUrl({
      videoId: "abc123XYZ_-",
      start: 10,
      end: 15,
      rate: 0.75
    })!;
    expect(captureLoopRequestUrl(sharedUrl)).toBe(true);
    const { controller } = await setupController(createDefaultState(), undefined, 1);
    panel().actions.setStart(20);
    panel().actions.setEnd(25);
    await settle();

    replacePlayer();
    controller.refresh();
    expect(controller.getCurrentLoop()).toMatchObject({
      shared: false,
      start: 20,
      end: 25,
      valid: true
    });
    controller.destroy();
  });

  it("replaces a pending request during SPA navigation and never applies it to another video", async () => {
    const firstUrl = buildSharedLoopUrl({
      videoId: "abc123XYZ_-",
      start: 10,
      end: 15,
      rate: 0.75
    })!;
    expect(captureLoopRequestUrl(firstUrl)).toBe(true);
    const { controller } = await setupController(createDefaultState(), undefined, 1);

    history.replaceState({}, "", "/watch?v=dQw4w9WgXcQ");
    const secondUrl = buildSharedLoopUrl({
      videoId: "dQw4w9WgXcQ",
      start: 30,
      end: 36,
      rate: 1.25
    })!;
    expect(captureLoopRequestUrl(secondUrl)).toBe(true);
    const replacement = replacePlayer();
    controller.refresh();
    expect(controller.getCurrentLoop()).toMatchObject({
      videoId: "dQw4w9WgXcQ",
      shared: true,
      start: 30,
      end: 36,
      rate: 1.25,
      valid: true
    });
    expect(replacement.video.currentTime).toBe(30);
    controller.destroy();
  });

  it("preserves a library request when YouTube replaces a transient video element", async () => {
    expect(
      captureLoopRequestUrl("https://www.youtube.com/watch?v=abc123XYZ_-&ytl_bookmark=bookmark-1")
    ).toBe(true);
    const { controller } = await setupController(savedState(), "/watch?v=abc123XYZ_-", 1, 5);
    expect(controller.getCurrentLoop()).toMatchObject({ bookmarkId: "bookmark-1", valid: false });

    const replacement = replacePlayer();
    controller.refresh();
    expect(controller.getCurrentLoop()).toMatchObject({
      bookmarkId: "bookmark-1",
      bookmarkName: "Chorus",
      start: 10,
      end: 15,
      rate: 0.75,
      valid: true
    });
    expect(replacement.video.currentTime).toBe(10);
    expect(replacement.video.play).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it("defers a shared request while an ad is active and applies it after the ad", async () => {
    const sharedUrl = buildSharedLoopUrl({
      videoId: "abc123XYZ_-",
      start: 10,
      end: 15,
      rate: 0.75
    })!;
    expect(captureLoopRequestUrl(sharedUrl)).toBe(true);
    history.replaceState({}, "", "/watch?v=abc123XYZ_-");
    document.title = "Song - YouTube";
    const { player, video } = replacePlayer(60, 0);
    player.classList.add("ad-showing");
    const memory: Record<string, unknown> = { ytLooperStateV3: createDefaultState() };
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: vi.fn(async () => structuredClone(memory)),
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(memory, items))
        }
      }
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const controller = new YtLooperController();
    await controller.start();
    video.dispatchEvent(new Event("loadedmetadata"));
    expect(video.currentTime).toBe(0);
    expect(video.play).not.toHaveBeenCalled();

    player.classList.remove("ad-showing");
    await settle();
    expect(controller.getCurrentLoop()).toMatchObject({
      shared: true,
      start: 10,
      end: 15,
      rate: 0.75,
      valid: true
    });
    expect(video.currentTime).toBe(10);
    expect(video.play).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it("keeps an ad-delayed request pending when the ad duration is shorter than B", async () => {
    const sharedUrl = buildSharedLoopUrl({
      videoId: "abc123XYZ_-",
      start: 10,
      end: 15,
      rate: 0.75
    })!;
    expect(captureLoopRequestUrl(sharedUrl)).toBe(true);
    history.replaceState({}, "", "/watch?v=abc123XYZ_-");
    const { player, video } = replacePlayer(5, 1);
    player.classList.add("ad-showing");
    const memory: Record<string, unknown> = { ytLooperStateV3: createDefaultState() };
    vi.stubGlobal("browser", {
      storage: {
        local: {
          get: vi.fn(async () => structuredClone(memory)),
          set: vi.fn(async (items: Record<string, unknown>) => Object.assign(memory, items))
        }
      }
    });
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn(() => 1)
    );
    vi.stubGlobal("cancelAnimationFrame", vi.fn());
    const controller = new YtLooperController();
    await controller.start();

    player.classList.remove("ad-showing");
    await settle();
    expect(controller.getCurrentLoop()).toMatchObject({ shared: true, valid: false });
    expect(video.play).not.toHaveBeenCalled();

    const replacement = replacePlayer();
    controller.refresh();
    expect(controller.getCurrentLoop()).toMatchObject({
      shared: true,
      start: 10,
      end: 15,
      rate: 0.75,
      valid: true
    });
    expect(replacement.video.currentTime).toBe(10);
    expect(replacement.video.play).toHaveBeenCalledOnce();
    controller.destroy();
  });

  it("detaches on navigation and remains inert when destroyed before startup completes", async () => {
    const { controller } = await setupController();
    history.replaceState({}, "", "/feed/subscriptions");
    controller.refresh();
    expect(controller.getCurrentLoop()).toEqual({ available: false });
    expect(panel().destroyed).toBe(true);
    controller.destroy();
    controller.refresh();

    const delayed = new YtLooperController();
    const starting = delayed.start();
    delayed.destroy();
    await starting;
    expect(delayed.getCurrentLoop()).toEqual({ available: false });
  });
});
