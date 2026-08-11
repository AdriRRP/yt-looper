import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDefaultState,
  loadStoredState,
  saveStoredState,
  updateStoredState
} from "../src/platform/storage";

interface MemoryStorage {
  memory: Record<string, unknown>;
  writes: Record<string, unknown>[];
  get: ReturnType<typeof vi.fn>;
  set: ReturnType<typeof vi.fn>;
}

function installStorage(
  initial: Record<string, unknown> = {},
  namespace: "browser" | "chrome" = "browser"
): MemoryStorage {
  const memory = structuredClone(initial);
  const writes: Record<string, unknown>[] = [];
  const get = vi.fn(async (keys: string | string[]) => {
    const requested = Array.isArray(keys) ? keys : [keys];
    return Object.fromEntries(
      requested.filter((key) => key in memory).map((key) => [key, memory[key]])
    );
  });
  const set = vi.fn(async (items: Record<string, unknown>) => {
    writes.push(structuredClone(items));
    Object.assign(memory, structuredClone(items));
  });
  vi.stubGlobal(namespace, { storage: { local: { get, set } } });
  return { memory, writes, get, set };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("storage lifecycle and migrations", () => {
  it("returns isolated defaults without an extension storage API", async () => {
    await expect(loadStoredState()).resolves.toEqual(createDefaultState());
    await expect(saveStoredState(createDefaultState())).resolves.toBeUndefined();
    const updated = await updateStoredState((state) => {
      state.settings.rate = 1.5;
    });
    expect(updated.settings.rate).toBe(1.5);
  });

  it("normalizes a current state and lets split slices win", async () => {
    installStorage({
      ytLooperStateV3: {
        version: 3,
        settings: { rate: Number.NaN },
        loops: null,
        folders: [{ id: "old", name: "Old", createdAt: 1 }],
        bookmarks: "broken"
      },
      ytLooperRuntimeV1: {
        version: 1,
        settings: { rate: 0.5 },
        loops: { video: { start: 1, end: 2 } }
      },
      ytLooperLibraryV1: {
        version: 1,
        folders: [{ id: "folder", name: "Folder", parentId: null, createdAt: 1 }],
        bookmarks: []
      }
    });
    await expect(loadStoredState()).resolves.toMatchObject({
      settings: { rate: 0.5 },
      loops: { video: { start: 1, end: 2 } },
      folders: [{ id: "folder", parentId: null }],
      bookmarks: []
    });
  });

  it("migrates version two, removes pitch preferences and persists version three", async () => {
    const storage = installStorage({
      ytLooperStateV2: {
        version: 2,
        settings: { rate: 1.25, preservesPitch: false },
        loops: { song: { start: 2, end: 4 } },
        folders: [{ id: "f", name: "Songs", createdAt: 1 }],
        bookmarks: [
          {
            id: "b",
            name: "Part",
            folderId: "f",
            videoId: "song",
            videoTitle: "Song",
            start: 2,
            end: 4,
            rate: 1.25,
            createdAt: 1,
            preservesPitch: false
          }
        ]
      }
    });
    const state = await loadStoredState();
    expect(state).toMatchObject({ version: 3, settings: { rate: 1.25 } });
    expect(state.folders[0]?.parentId).toBeNull();
    expect(state.bookmarks[0]).not.toHaveProperty("preservesPitch");
    expect(storage.writes[0]).toHaveProperty("ytLooperStateV3");
  });

  it("migrates version one and tolerates failed reads", async () => {
    installStorage({
      ytLooperStateV1: {
        version: 1,
        settings: { rate: 0.8 },
        loops: { song: { start: 3, end: 7 } }
      }
    });
    await expect(loadStoredState()).resolves.toMatchObject({
      version: 3,
      settings: { rate: 0.8 },
      loops: { song: { start: 3, end: 7 } }
    });
    vi.unstubAllGlobals();
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubGlobal("chrome", {
      storage: { local: { get: vi.fn().mockRejectedValue(new Error("read")) } }
    });
    await expect(loadStoredState()).resolves.toEqual(createDefaultState());
    expect(warning).toHaveBeenCalled();
  });

  it("bounds legacy loop history and survives failed saves", async () => {
    const storage = installStorage();
    const state = createDefaultState();
    for (let index = 0; index < 260; index += 1) {
      state.loops[`video-${index}`] = { start: index, end: index + 1 };
    }
    await saveStoredState(state);
    const legacy = storage.writes[0]!.ytLooperStateV3 as { loops: Record<string, unknown> };
    const runtime = storage.writes[0]!.ytLooperRuntimeV1 as { loops: Record<string, unknown> };
    expect(Object.keys(legacy.loops)).toHaveLength(250);
    expect(Object.keys(runtime.loops)).toHaveLength(250);
    expect(legacy.loops).not.toHaveProperty("video-0");

    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    storage.set.mockRejectedValueOnce(new Error("quota"));
    await expect(saveStoredState(state)).resolves.toBeUndefined();
    expect(warning).toHaveBeenCalled();
  });

  it("serializes combined updates and writes only changed slices", async () => {
    const storage = installStorage({ ytLooperStateV3: createDefaultState() });
    const first = updateStoredState((state) => {
      state.settings.rate = 1.25;
    });
    const second = updateStoredState((state) => {
      state.folders.push({ id: "f", name: "Folder", parentId: null, createdAt: 1 });
    });
    await Promise.all([first, second]);
    expect(storage.writes[0]).toEqual({
      ytLooperRuntimeV1: { version: 1, settings: { rate: 1.25 }, loops: {} }
    });
    expect(storage.writes[1]).toEqual({
      ytLooperLibraryV1: {
        version: 1,
        folders: [{ id: "f", name: "Folder", parentId: null, createdAt: 1 }],
        bookmarks: []
      }
    });
    const writesBeforeNoop = storage.writes.length;
    await updateStoredState(() => undefined);
    expect(storage.writes).toHaveLength(writesBeforeNoop);
  });

  it("rejects a failed mutator without poisoning later updates", async () => {
    installStorage({ ytLooperStateV3: createDefaultState() }, "chrome");
    await expect(
      updateStoredState(() => {
        throw new Error("bad mutation");
      })
    ).rejects.toThrow("bad mutation");
    await expect(
      updateStoredState((state) => {
        state.settings.rate = 2;
      })
    ).resolves.toMatchObject({ settings: { rate: 2 } });
  });
});
