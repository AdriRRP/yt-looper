// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CurrentLoopSnapshot } from "../src/content/controller";
import type { StoredState } from "../src/platform/storage";

const popupHtml = readFileSync(resolve(process.cwd(), "popup/popup.html"), "utf8");

interface PopupHarness {
  memory: Record<string, unknown>;
  sendMessage: ReturnType<typeof vi.fn>;
  createTab: ReturnType<typeof vi.fn>;
  writeText: ReturnType<typeof vi.fn>;
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
  options: { sendError?: boolean; noActiveTab?: boolean } = {}
): Promise<PopupHarness> {
  vi.resetModules();
  document.open();
  document.write(popupHtml);
  document.close();
  const memory: Record<string, unknown> = { ytLooperStateV3: structuredClone(initialState) };
  const storageGet = vi.fn(async (keys: string | string[]) => {
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      requested.filter((key) => key in memory).map((key) => [key, structuredClone(memory[key])])
    );
  });
  const storageSet = vi.fn(async (items: Record<string, unknown>) => {
    Object.assign(memory, structuredClone(items));
  });
  const sendMessage = vi.fn(async (_tabId: number, message: { type: string }) => {
    if (options.sendError) {
      throw new Error("No content script");
    }
    return message.type === "get-current-loop" ? structuredClone(snapshot) : true;
  });
  const createTab = vi.fn().mockResolvedValue({ id: 9 });
  vi.stubGlobal("browser", {
    storage: { local: { get: storageGet, set: storageSet } },
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
  await module.popupReady;
  return { memory, sendMessage, createTab, writeText };
}

function byId<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

function submit(form: HTMLFormElement): void {
  form.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
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
    const chorusRow = document.querySelector<HTMLElement>('[data-bookmark-id="saved-1"]')!;
    chorusRow.querySelector<HTMLButtonElement>(".tree-label")!.click();
    const editorForm = byId<HTMLFormElement>("editor-form");
    byId<HTMLInputElement>("editor-start").value = "5";
    byId<HTMLInputElement>("editor-end").value = "5.01";
    submit(editorForm);
    expect(byId("editor-status").textContent).toContain("0.05");

    byId<HTMLInputElement>("editor-start").value = "20";
    byId<HTMLInputElement>("editor-end").value = "25";
    submit(editorForm);
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

  it("creates and cancels nested folders, opens loops, and safely reparents deleted contents", async () => {
    const harness = await loadPopup({ available: false });
    const songsLabel = [...document.querySelectorAll<HTMLElement>(".folder-row")]
      .find((row) => row.dataset.folderId === "songs")!
      .querySelector<HTMLButtonElement>(".tree-label")!;
    songsLabel.click();
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
    await settle();
    const library = harness.memory.ytLooperLibraryV1 as StoredState;
    expect(library.folders.find((folder) => folder.id === "solos")?.parentId).toBeNull();
    expect(library.bookmarks.find((item) => item.id === "saved-1")?.folderId).toBeNull();
  });

  it("moves a loop by pointer drag and ignores cancelled or irrelevant gestures", async () => {
    const harness = await loadPopup({ available: false });
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
    expect(duplicateHarness.memory.ytLooperLibraryV1).toBeUndefined();
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
