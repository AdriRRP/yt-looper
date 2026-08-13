// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CurrentLoopSnapshot } from "../src/content/controller";
import type { StoredState } from "../src/platform/storage";

const popupHtml = readFileSync(resolve(process.cwd(), "popup/popup.html"), "utf8");

interface PopupHarness {
  memory: Record<string, unknown>;
  storageListeners: ((changes: Record<string, unknown>, areaName: string) => void)[];
  sendMessage: ReturnType<typeof vi.fn>;
  createTab: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
  storageSet: ReturnType<typeof vi.fn>;
}

const bookmark = (
  id: string,
  name: string,
  start: number,
  end: number,
  folderId: string | null = null
) => ({
  id,
  name,
  folderId,
  videoId: "abc123XYZ_-",
  videoTitle: "Song",
  start,
  end,
  rate: 1,
  createdAt: 1
});

const state = (): StoredState => ({
  version: 3,
  settings: { rate: 1 },
  loops: {},
  folders: [
    { id: "songs", name: "Songs", parentId: null, createdAt: 1 },
    { id: "solos", name: "Solos", parentId: "songs", createdAt: 2 }
  ],
  bookmarks: [
    bookmark("saved-1", "Chorus", 10, 15, "songs"),
    bookmark("saved-2", "Solo", 20, 25, "solos")
  ]
});

async function loadPopup(
  snapshot: CurrentLoopSnapshot,
  initialState = state(),
  options: {
    sendError?: boolean;
    noActiveTab?: boolean;
    hangMessage?: boolean;
    hangStorage?: boolean;
    storageError?: boolean;
  } = {}
): Promise<PopupHarness> {
  vi.resetModules();
  if (options.hangMessage || options.hangStorage) {
    vi.useFakeTimers();
  }
  document.open();
  document.write(popupHtml);
  document.close();
  const memory: Record<string, unknown> = {
    ytLooperStateV3: structuredClone(initialState),
    ytLooperRuntimeV1: {
      version: 1,
      settings: structuredClone(initialState.settings),
      loops: structuredClone(initialState.loops)
    },
    ytLooperLibraryV1: {
      version: 1,
      folders: structuredClone(initialState.folders),
      bookmarks: structuredClone(initialState.bookmarks)
    },
    ytLooperStorageLayoutV1: 1
  };
  const storageGet = vi.fn(async (keys: string | string[]) => {
    if (options.hangStorage) {
      return new Promise<Record<string, unknown>>(() => undefined);
    }
    if (options.storageError) {
      throw new Error("Storage unavailable");
    }
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      requested.filter((key) => key in memory).map((key) => [key, structuredClone(memory[key])])
    );
  });
  const storageSet = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(memory, structuredClone(items));
  });
  const storageListeners: ((changes: Record<string, unknown>, areaName: string) => void)[] = [];
  const sendMessage = vi.fn(async (_tabId: number, message: { type: string }) => {
    if (options.hangMessage) {
      return new Promise<never>(() => undefined);
    }
    if (options.sendError) {
      throw new Error("No content script");
    }
    return message.type === "get-current-loop" ? structuredClone(snapshot) : true;
  });
  const createTab = vi.fn().mockResolvedValue({ id: 9 });
  vi.stubGlobal("browser", {
    storage: {
      local: { get: storageGet, set: storageSet },
      onChanged: {
        addListener: vi.fn((listener) => storageListeners.push(listener)),
        removeListener: vi.fn((listener) => {
          const index = storageListeners.indexOf(listener);
          if (index >= 0) {
            storageListeners.splice(index, 1);
          }
        })
      }
    },
    tabs: {
      query: vi.fn().mockResolvedValue(options.noActiveTab ? [{}] : [{ id: 7 }]),
      sendMessage,
      create: createTab
    }
  });
  const writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText }
  });
  vi.spyOn(window, "close").mockImplementation(() => undefined);
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0);
    return 1;
  });
  const module = await import("../src/popup/index");
  if (options.hangMessage || options.hangStorage) {
    await vi.advanceTimersByTimeAsync(1600);
  }
  await module.popupReady;
  return { memory, storageListeners, sendMessage, createTab, writeText, storageSet };
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
}

function expandFolder(folderId: string): void {
  const row = document.querySelector<HTMLElement>(`.folder-row[data-folder-id="${folderId}"]`);
  const toggle = row?.querySelector<HTMLButtonElement>(".tree-toggle");
  if (toggle?.dataset.expanded === "false") {
    row!.querySelector<HTMLButtonElement>(".tree-label")!.click();
  }
}

function revealBookmark(bookmarkId: "saved-1" | "saved-2"): void {
  expandFolder("songs");
  if (bookmarkId === "saved-2") {
    expandFolder("solos");
  }
}

function pointerEvent(type: string, properties: Record<string, number>): Event {
  const event = new Event(type, { bubbles: true, cancelable: true });
  for (const [key, value] of Object.entries(properties)) {
    Object.defineProperty(event, key, { value });
  }
  return event;
}

async function settle(): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, 0));
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("popup use cases", () => {
  it("renders the root library even when Safari tab messaging never answers", async () => {
    await loadPopup({ available: false }, state(), { hangMessage: true });
    expect(document.querySelector('.folder-row[data-folder-id=""]')).not.toBeNull();
    expect(byId("bookmark-count").textContent).toBe("2 fragmentos");
    expect(byId("current-card").hidden).toBe(true);
  });

  it("renders a recoverable library state when Safari storage never answers", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await loadPopup({ available: false }, state(), { hangStorage: true });

    expect(document.querySelector('.folder-row[data-folder-id=""]')).not.toBeNull();
    expect(byId("bookmark-count").textContent).toBe("0 fragmentos");
    expect(byId("library-status").textContent).toContain("No se pudo cargar");
    expect(byId("library-status").dataset.error).toBe("true");
    expect(warning).toHaveBeenCalled();
  });

  it("renders a saved current loop, shares it, restores the widget and edits its title", async () => {
    const harness = await loadPopup({
      available: true,
      videoId: "abc123XYZ_-",
      videoTitle: "Song",
      start: 10,
      end: 15,
      rate: 1,
      valid: true,
      widgetVisible: false,
      bookmarkId: "saved-1",
      bookmarkName: "Chorus"
    });
    expect(byId("current-card").hidden).toBe(false);
    expect(byId("current-context").dataset.state).toBe("saved");
    expect(byId("current-bookmark-name").textContent).toBe("Chorus");
    expect(byId<HTMLButtonElement>("current-bookmark-action").disabled).toBe(true);
    expect(byId("bookmark-count").textContent).toBe("2 fragmentos");

    byId<HTMLButtonElement>("share-current").click();
    await settle();
    expect(harness.writeText).toHaveBeenCalledWith(expect.stringContaining("ytl="));
    expect(byId("save-status").textContent).toBe("Enlace del loop copiado.");

    byId<HTMLButtonElement>("show-widget").click();
    await settle();
    expect(harness.sendMessage).toHaveBeenCalledWith(7, { type: "show-widget" });
    expect(byId<HTMLButtonElement>("show-widget").hidden).toBe(true);

    byId<HTMLButtonElement>("current-badge").click();
    expect(byId("editor-modal").hidden).toBe(false);
    expect(byId<HTMLInputElement>("editor-name").value).toBe("Chorus");
    byId<HTMLInputElement>("editor-name").value = "Final Chorus";
    submit(byId<HTMLFormElement>("editor-form"));
    await settle();
    expect(byId("current-bookmark-name").textContent).toBe("Final Chorus");
    const library = harness.memory.ytLooperLibraryV1 as StoredState;
    expect(library.bookmarks.find((item) => item.id === "saved-1")?.name).toBe("Final Chorus");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(byId("editor-modal").dataset.open).toBeUndefined();
    byId<HTMLButtonElement>("current-badge").click();
    expect(byId("editor-modal").dataset.open).toBe("true");
  });

  it("validates editing, prevents duplicates, moves folders and deletes with confirmation", async () => {
    const harness = await loadPopup({ available: false });
    revealBookmark("saved-1");
    const chorusRow = document.querySelector<HTMLElement>('[data-bookmark-id="saved-1"]')!;
    chorusRow.querySelector<HTMLButtonElement>(".tree-label")!.click();
    const editorForm = byId<HTMLFormElement>("editor-form");
    byId<HTMLInputElement>("editor-start").value = "5";
    byId<HTMLInputElement>("editor-end").value = "5.01";
    submit(editorForm);
    expect(byId("editor-status").textContent).toContain("0.05");
    await settle();

    byId<HTMLInputElement>("editor-start").value = "20";
    byId<HTMLInputElement>("editor-end").value = "25";
    submit(editorForm);
    await settle();
    expect(byId("editor-status").textContent).toContain("Ya existe");

    byId<HTMLInputElement>("editor-start").value = "11";
    byId<HTMLInputElement>("editor-end").value = "16";
    byId<HTMLInputElement>("editor-rate").value = "99";
    byId<HTMLSelectElement>("editor-folder").value = "solos";
    submit(editorForm);
    await settle();
    expect(byId("editor-status").textContent).toBe("Cambios guardados.");
    const library = harness.memory.ytLooperLibraryV1 as StoredState;
    expect(library.bookmarks.find((item) => item.id === "saved-1")).toMatchObject({
      folderId: "solos",
      start: 11,
      end: 16,
      rate: 4
    });

    byId<HTMLButtonElement>("delete-bookmark").click();
    expect(byId("delete-bookmark").textContent).toContain("Confirmar");
    byId<HTMLButtonElement>("delete-bookmark").click();
    await settle();
    expect((harness.memory.ytLooperLibraryV1 as StoredState).bookmarks).toHaveLength(1);
  });

  it("shows canonical A/B values for legacy floating-point artifacts without a redundant write", async () => {
    const initial = state();
    initial.bookmarks[0]!.start = 0.1 + 0.2;
    initial.bookmarks[0]!.end = 1.1 + 0.2;
    const harness = await loadPopup({ available: false }, initial);

    revealBookmark("saved-1");
    document.querySelector<HTMLElement>('[data-bookmark-id="saved-1"] .tree-label')!.click();
    expect(byId<HTMLInputElement>("editor-start").value).toBe("0.3");
    expect(byId<HTMLInputElement>("editor-end").value).toBe("1.3");
    submit(byId<HTMLFormElement>("editor-form"));
    await settle();

    expect(byId("editor-status").textContent).toBe("Cambios guardados.");
    expect(harness.storageSet).not.toHaveBeenCalled();
  });

  it("creates and cancels nested folders, opens loops, and safely reparents deleted contents", async () => {
    const harness = await loadPopup({ available: false });
    expect(document.querySelector('[data-bookmark-id="saved-1"]')).toBeNull();
    const songsLabel = [...document.querySelectorAll<HTMLElement>(".folder-row")]
      .find((row) => row.dataset.folderId === "songs")!
      .querySelector<HTMLButtonElement>(".tree-label")!;
    songsLabel.click();
    expect(document.querySelector('[data-bookmark-id="saved-1"]')).not.toBeNull();
    [...document.querySelectorAll<HTMLElement>(".folder-row")]
      .find((row) => row.dataset.folderId === "songs")!
      .querySelector<HTMLButtonElement>(".tree-label")!
      .click();
    expect(document.querySelector('[data-bookmark-id="saved-1"]')).toBeNull();
    [...document.querySelectorAll<HTMLElement>(".folder-row")]
      .find((row) => row.dataset.folderId === "songs")!
      .querySelector<HTMLButtonElement>(".tree-label")!
      .click();
    const rootAdd = document.querySelector<HTMLButtonElement>(
      '.folder-row[data-folder-id=""] .tree-actions button'
    )!;
    rootAdd.click();
    let form = document.querySelector<HTMLFormElement>(".subfolder-form")!;
    submit(form);
    expect(document.querySelector(".subfolder-form")).not.toBeNull();
    await settle();
    form.querySelector<HTMLInputElement>("input")!.value = "Practice";
    submit(form);
    await settle();
    expect(document.querySelector(".tree")!.textContent).toContain("Practice");

    const practiceRow = [...document.querySelectorAll<HTMLElement>(".folder-row")].find(
      (row) => row.dataset.folderName === "Practice"
    )!;
    practiceRow.querySelectorAll<HTMLButtonElement>(".tree-actions button")[0]!.click();
    form = document.querySelector<HTMLFormElement>(".subfolder-form")!;
    form.querySelector<HTMLButtonElement>(".close-button")!.click();
    expect(document.querySelector(".subfolder-form")).toBeNull();

    const play = document.querySelector<HTMLButtonElement>(
      '[data-bookmark-id="saved-1"] .tree-actions button'
    )!;
    play.click();
    await settle();
    expect(harness.createTab).toHaveBeenCalledWith({
      url: expect.stringContaining("ytl_bookmark=saved-1")
    });
    expect(window.close).toHaveBeenCalled();

    const songsRemove = [...document.querySelectorAll<HTMLElement>(".folder-row")]
      .find((row) => row.dataset.folderId === "songs")!
      .querySelectorAll<HTMLButtonElement>(".tree-actions button")[1]!;
    songsRemove.click();
    [...document.querySelectorAll<HTMLElement>(".folder-row")]
      .find((row) => row.dataset.folderId === "songs")!
      .querySelectorAll<HTMLButtonElement>(".tree-actions button")[1]!
      .click();
    await settle();
    const library = harness.memory.ytLooperLibraryV1 as StoredState;
    expect(library.folders.find((folder) => folder.id === "solos")?.parentId).toBeNull();
    expect(library.bookmarks.find((item) => item.id === "saved-1")?.folderId).toBeNull();
  });

  it("moves a loop by pointer drag and ignores cancelled or irrelevant gestures", async () => {
    const harness = await loadPopup({ available: false });
    revealBookmark("saved-2");
    const row = document.querySelector<HTMLElement>('[data-bookmark-id="saved-2"]')!;
    const root = document.querySelector<HTMLElement>('.folder-row[data-folder-id=""]')!;
    Object.defineProperty(document, "elementFromPoint", {
      configurable: true,
      value: vi.fn(() => root)
    });
    row.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 4,
        button: 0,
        clientX: 0,
        clientY: 0
      })
    );
    document.dispatchEvent(
      pointerEvent("pointermove", {
        pointerId: 4,
        clientX: 10,
        clientY: 0
      })
    );
    expect(row.classList.contains("dragging")).toBe(true);
    document.dispatchEvent(
      pointerEvent("pointerup", {
        pointerId: 4,
        clientX: 10,
        clientY: 0
      })
    );
    await settle();
    expect(
      (harness.memory.ytLooperLibraryV1 as StoredState).bookmarks.find(
        (item) => item.id === "saved-2"
      )?.folderId
    ).toBeNull();

    const movedRow = document.querySelector<HTMLElement>('[data-bookmark-id="saved-2"]')!;
    movedRow.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 5,
        button: 0,
        clientX: 0,
        clientY: 0
      })
    );
    document.dispatchEvent(
      pointerEvent("pointercancel", {
        pointerId: 5,
        clientX: 10,
        clientY: 0
      })
    );
    movedRow.dispatchEvent(
      pointerEvent("pointerdown", {
        pointerId: 6,
        button: 1,
        clientX: 0,
        clientY: 0
      })
    );
  });

  it("refreshes an open popup after another tab changes the library", async () => {
    const harness = await loadPopup({ available: false });
    expect(byId("bookmark-count").textContent).toBe("2 fragmentos");

    const updated = state();
    updated.bookmarks.push(bookmark("external", "From another window", 30, 35));
    harness.memory.ytLooperLibraryV1 = {
      version: 1,
      folders: updated.folders,
      bookmarks: updated.bookmarks
    };
    harness.storageListeners[0]?.({ ytLooperLibraryV1: { newValue: true } }, "local");
    await settle();

    expect(byId("bookmark-count").textContent).toBe("3 fragmentos");
    expect(document.querySelector(".tree")?.textContent).toContain("From another window");
    window.dispatchEvent(new Event("pagehide"));
    expect(harness.storageListeners).toHaveLength(0);
  });

  it("preserves remote folder and parameter changes when a stale editor only renames", async () => {
    const harness = await loadPopup({ available: false });
    revealBookmark("saved-1");
    document.querySelector<HTMLElement>('[data-bookmark-id="saved-1"] .tree-label')!.click();
    byId<HTMLInputElement>("editor-name").value = "Renamed locally";

    const updated = state();
    const remoteBookmark = updated.bookmarks.find((item) => item.id === "saved-1")!;
    remoteBookmark.folderId = "solos";
    remoteBookmark.start = 12;
    remoteBookmark.end = 18;
    remoteBookmark.rate = 0.75;
    harness.memory.ytLooperLibraryV1 = {
      version: 1,
      folders: updated.folders,
      bookmarks: updated.bookmarks
    };
    harness.storageListeners[0]?.({ ytLooperLibraryV1: { newValue: true } }, "local");
    await settle();

    submit(byId<HTMLFormElement>("editor-form"));
    await settle();
    const saved = (harness.memory.ytLooperLibraryV1 as StoredState).bookmarks.find(
      (item) => item.id === "saved-1"
    );
    expect(saved).toMatchObject({
      name: "Renamed locally",
      folderId: "solos",
      start: 12,
      end: 18,
      rate: 0.75
    });
  });

  it("saves a new current loop through the review modal", async () => {
    const initial = state();
    const harness = await loadPopup(
      {
        available: true,
        videoId: "abc123XYZ_-",
        videoTitle: "Song",
        start: 30,
        end: 35,
        rate: 0.75,
        valid: true,
        widgetVisible: true
      },
      initial
    );
    expect(byId("current-context").dataset.state).toBe("unsaved");
    expect(byId("current-bookmark-name").textContent).toContain("Song");
    byId<HTMLButtonElement>("current-badge").click();
    expect(byId("editor-sheet").dataset.mode).toBe("create");
    expect(byId<HTMLInputElement>("editor-start").readOnly).toBe(true);
    byId<HTMLInputElement>("editor-name").value = "   ";
    submit(byId<HTMLFormElement>("editor-form"));
    expect(byId("editor-modal").hidden).toBe(false);
    await settle();
    byId<HTMLInputElement>("editor-name").value = "Outro practice";
    byId<HTMLSelectElement>("editor-folder").value = "songs";
    submit(byId<HTMLFormElement>("editor-form"));
    await settle();
    expect(byId("current-bookmark-name").textContent).toBe("Outro practice");
    expect(byId("current-context").dataset.state).toBe("saved");
    expect((harness.memory.ytLooperLibraryV1 as StoredState).bookmarks).toHaveLength(3);
  });

  it("quick-updates modified parameters and rejects a duplicate combination", async () => {
    const initial = state();
    const harness = await loadPopup(
      {
        available: true,
        videoId: "abc123XYZ_-",
        videoTitle: "Song",
        start: 11,
        end: 16,
        rate: 1,
        valid: true,
        bookmarkId: "saved-1",
        bookmarkName: "Chorus"
      },
      initial
    );
    expect(byId("current-context").dataset.state).toBe("dirty");
    byId<HTMLButtonElement>("current-bookmark-action").click();
    await settle();
    expect(byId("save-status").textContent).toBe("Parámetros del fragmento actualizados.");
    expect((harness.memory.ytLooperLibraryV1 as StoredState).bookmarks[0]).toMatchObject({
      start: 11,
      end: 16
    });

    const duplicateHarness = await loadPopup(
      {
        available: true,
        videoId: "abc123XYZ_-",
        videoTitle: "Song",
        start: 20,
        end: 25,
        rate: 1,
        valid: true,
        bookmarkId: "saved-1",
        bookmarkName: "Chorus"
      },
      initial
    );
    byId<HTMLButtonElement>("current-bookmark-action").click();
    await settle();
    expect(byId("save-status").textContent).toContain("Ya existe");
    expect(duplicateHarness.storageSet).not.toHaveBeenCalled();
  });

  it("keeps the library useful when no content script or valid loop is available", async () => {
    await loadPopup({ available: true, valid: false, widgetVisible: true });
    expect(byId("current-summary").textContent).toContain("Marca A y B");
    expect(byId("current-context").hidden).toBe(true);
    byId<HTMLButtonElement>("close-editor").click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
  });

  it("handles missing video identity, messaging errors and tabs without IDs", async () => {
    await loadPopup({
      available: true,
      start: 1,
      end: 2,
      rate: 1,
      valid: true
    });
    expect(byId<HTMLButtonElement>("share-current").hidden).toBe(true);
    expect(byId("current-bookmark-name").textContent).toContain("Fragmento");

    await loadPopup({ available: true }, state(), { sendError: true });
    expect(byId("current-card").hidden).toBe(true);
    await loadPopup({ available: true }, state(), { noActiveTab: true });
    expect(byId("current-card").hidden).toBe(true);
  });

  it("reports clipboard failure without exposing an unhandled popup error", async () => {
    const harness = await loadPopup({
      available: true,
      videoId: "abc123XYZ_-",
      start: 1,
      end: 2,
      rate: 1,
      valid: true
    });
    harness.writeText.mockRejectedValue(new Error("denied"));
    Object.defineProperty(document, "execCommand", {
      configurable: true,
      value: vi.fn(() => false)
    });
    byId<HTMLButtonElement>("share-current").click();
    await settle();
    expect(byId("save-status").textContent).toBe("No se pudo copiar el enlace.");
    expect(byId("save-status").dataset.error).toBe("true");
  });

  it("reports storage mutation failures in the modal and keeps the library intact", async () => {
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const harness = await loadPopup({ available: false });
    revealBookmark("saved-1");
    document.querySelector<HTMLElement>('[data-bookmark-id="saved-1"] .tree-label')!.click();
    byId<HTMLInputElement>("editor-name").value = "Should not persist";
    harness.storageSet.mockRejectedValueOnce(new Error("quota exceeded"));

    submit(byId<HTMLFormElement>("editor-form"));
    await settle();
    expect(byId("editor-status").textContent).toContain("No se pudo completar");
    expect(byId("editor-status").dataset.error).toBe("true");
    expect((harness.memory.ytLooperStateV3 as StoredState).bookmarks[0]?.name).toBe("Chorus");
    expect(warning).toHaveBeenCalled();
  });

  it("initializes safely without extension APIs and fails fast on malformed markup", async () => {
    vi.resetModules();
    vi.unstubAllGlobals();
    document.open();
    document.write(popupHtml);
    document.close();
    const module = await import("../src/popup/index");
    await module.popupReady;
    expect(byId("current-card").hidden).toBe(true);

    vi.resetModules();
    document.open();
    document.write("<!doctype html><body></body>");
    document.close();
    await expect(import("../src/popup/index")).rejects.toThrow("Popup element not found");
  });
});
