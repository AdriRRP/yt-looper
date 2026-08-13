import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyStorageChanges,
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

  it("repairs corrupt slices without allowing invalid records or folder cycles to brick the UI", async () => {
    installStorage({
      ytLooperStateV3: createDefaultState(),
      ytLooperRuntimeV1: {
        version: 1,
        settings: { rate: 99 },
        loops: {
          valid: { start: 1.0004, end: 2.0004 },
          huge: { start: 1e306, end: 1.1e306 },
          broken: { start: null, end: 2 }
        }
      },
      ytLooperLibraryV1: {
        version: 1,
        folders: [
          null,
          { id: "a", name: "A", parentId: "b", createdAt: 1 },
          { id: "b", name: "B", parentId: "a", createdAt: 2 },
          { id: "a", name: "Duplicate", parentId: null, createdAt: 3 }
        ],
        bookmarks: [
          {
            id: "good",
            name: "Good",
            folderId: "missing",
            videoId: "video",
            videoTitle: "Video",
            start: 1.0004,
            end: 2.0004,
            rate: 99,
            createdAt: 1
          },
          { id: "bad", name: "Bad", videoId: "video", videoTitle: "Video", start: 2, end: 1 }
        ]
      }
    });

    const repaired = await loadStoredState();
    expect(repaired.settings.rate).toBe(4);
    expect(repaired.loops).toEqual({ valid: { start: 1, end: 2 } });
    expect(repaired.folders).toHaveLength(2);
    expect(repaired.folders.some((folder) => folder.parentId === null)).toBe(true);
    expect(repaired.bookmarks).toEqual([
      expect.objectContaining({ id: "good", folderId: null, start: 1, end: 2, rate: 4 })
    ]);
  });

  it("applies storage change payloads directly without a profile-wide reread", () => {
    const initial = createDefaultState();
    const updated = applyStorageChanges(initial, {
      ytLooperRuntimeV1: {
        newValue: {
          version: 1,
          settings: { rate: 0.75 },
          loops: { song: { start: 1, end: 2 } }
        }
      },
      ytLooperLibraryV1: {
        newValue: {
          version: 1,
          folders: [{ id: "folder", name: "Folder", parentId: null, createdAt: 1 }],
          bookmarks: []
        }
      }
    });

    expect(updated).toMatchObject({
      settings: { rate: 0.75 },
      loops: { song: { start: 1, end: 2 } },
      folders: [{ id: "folder" }]
    });
    expect(initial).toEqual(createDefaultState());
  });

  it("resets deleted split slices and never resurrects a stale compatibility snapshot", async () => {
    const initial = createDefaultState();
    initial.settings.rate = 2;
    initial.loops.song = { start: 1, end: 2 };
    initial.folders.push({ id: "stale", name: "Stale", parentId: null, createdAt: 1 });
    initial.bookmarks.push({
      id: "stale-bookmark",
      name: "Stale",
      folderId: "stale",
      videoId: "abc123XYZ_-",
      videoTitle: "Video",
      start: 1,
      end: 2,
      rate: 1,
      createdAt: 1
    });
    installStorage({
      ytLooperStateV3: initial,
      ytLooperStorageLayoutV1: 1,
      ytLooperRuntimeV1: { version: 1, settings: { rate: 0.75 }, loops: {} }
    });

    await expect(loadStoredState()).resolves.toMatchObject({
      settings: { rate: 0.75 },
      loops: {},
      folders: [],
      bookmarks: []
    });

    const changed = applyStorageChanges(initial, {
      ytLooperRuntimeV1: { oldValue: {}, newValue: undefined },
      ytLooperLibraryV1: { oldValue: {}, newValue: undefined }
    });
    expect(changed).toEqual(createDefaultState());
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
    const defaults = createDefaultState();
    const storage = installStorage({
      ytLooperStateV3: defaults,
      ytLooperRuntimeV1: { version: 1, settings: defaults.settings, loops: defaults.loops },
      ytLooperLibraryV1: {
        version: 1,
        folders: defaults.folders,
        bookmarks: defaults.bookmarks
      },
      ytLooperStorageLayoutV1: 1
    });
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

  it("aborts an update after a failed read instead of overwriting storage with defaults", async () => {
    const initial = createDefaultState();
    initial.folders.push({ id: "safe", name: "Keep me", parentId: null, createdAt: 1 });
    const storage = installStorage({ ytLooperStateV3: initial });
    storage.get.mockRejectedValueOnce(new Error("temporary read failure"));

    await expect(
      updateStoredState((current) => {
        current.settings.rate = 2;
      })
    ).rejects.toThrow("temporary read failure");
    expect(storage.set).not.toHaveBeenCalled();
    expect(storage.memory.ytLooperStateV3).toEqual(initial);

    await expect(
      updateStoredState((current) => {
        current.settings.rate = 1.5;
      })
    ).resolves.toMatchObject({ folders: [{ id: "safe" }], settings: { rate: 1.5 } });
  });
});
