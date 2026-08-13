import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyStorageMutation,
  isStorageMutationRequest,
  mutateStoredState,
  STORAGE_MUTATION_MESSAGE,
  type StorageMutationResponse
} from "../src/platform/storage-coordinator";
import { createDefaultState, loadStoredState, type StoredState } from "../src/platform/storage";

interface MemoryStorage {
  memory: Record<string, unknown>;
  writes: Record<string, unknown>[];
}

function installStorage(initialState: StoredState = createDefaultState()): MemoryStorage {
  const memory: Record<string, unknown> = { ytLooperStateV3: structuredClone(initialState) };
  const writes: Record<string, unknown>[] = [];
  vi.stubGlobal("browser", {
    storage: {
      local: {
        async get(keys: string | string[]) {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            requested
              .filter((key) => key in memory)
              .map((key) => [key, structuredClone(memory[key])])
          );
        },
        async set(items: Record<string, unknown>) {
          writes.push(structuredClone(items));
          Object.assign(memory, structuredClone(items));
        }
      }
    }
  });
  return { memory, writes };
}

function bookmarkInput(start = 10, end = 15) {
  return {
    name: "Chorus",
    folderId: null,
    videoId: "abc123XYZ_-",
    videoTitle: "Song",
    start,
    end,
    rate: 1
  };
}

beforeEach(() => {
  installStorage();
  vi.spyOn(crypto, "randomUUID")
    .mockReturnValueOnce("00000000-0000-4000-8000-000000000001")
    .mockReturnValue("00000000-0000-4000-8000-000000000002");
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("profile-wide storage coordinator", () => {
  it("serializes simultaneous tabs and atomically prevents duplicate bookmarks", async () => {
    const [first, second] = await Promise.all([
      applyStorageMutation({ operation: "create-bookmark", input: bookmarkInput() }),
      applyStorageMutation({ operation: "create-bookmark", input: bookmarkInput() })
    ]);

    expect([first.status, second.status].sort()).toEqual(["created", "duplicate"]);
    expect((await loadStoredState()).bookmarks).toHaveLength(1);
  });

  it("coalesces identical in-flight UI mutations into one coordinator request", async () => {
    const state = createDefaultState();
    let resolveRequest!: (response: StorageMutationResponse) => void;
    const sendMessage = vi.fn(
      () =>
        new Promise<StorageMutationResponse>((resolve) => {
          resolveRequest = resolve;
        })
    );
    vi.stubGlobal("browser", { runtime: { sendMessage } });
    const mutation = { operation: "create-folder", name: "Practice", parentId: null } as const;
    const first = mutateStoredState(mutation);
    const second = mutateStoredState(mutation);
    expect(sendMessage).toHaveBeenCalledTimes(1);
    resolveRequest({ ok: true, result: { state, status: "created", entityId: "folder" } });
    await expect(Promise.all([first, second])).resolves.toEqual([
      { state, status: "created", entityId: "folder" },
      { state, status: "created", entityId: "folder" }
    ]);
  });

  it("replays a timed-out creation idempotently by persistent entity id", async () => {
    const requestId = "00000000-0000-4000-8000-000000000099";
    const mutation = { operation: "create-folder", name: "Practice", parentId: null } as const;
    const first = await applyStorageMutation(mutation, requestId);
    const replay = await applyStorageMutation(mutation, requestId);

    expect(first).toMatchObject({ status: "created", entityId: requestId });
    expect(replay).toMatchObject({ status: "created", entityId: requestId });
    expect((await loadStoredState()).folders).toEqual([
      expect.objectContaining({ id: requestId, name: "Practice" })
    ]);
  });

  it("merges independent operations from tabs and windows without lost updates", async () => {
    const operations = await Promise.all([
      applyStorageMutation({ operation: "set-rate", rate: 0.75 }),
      applyStorageMutation({
        operation: "set-loop",
        videoId: "tab-a-video",
        loop: { start: 1, end: 3 }
      }),
      applyStorageMutation({ operation: "create-folder", name: "Practice", parentId: null }),
      applyStorageMutation({ operation: "create-bookmark", input: bookmarkInput(20, 25) })
    ]);

    expect(operations).toHaveLength(4);
    await expect(loadStoredState()).resolves.toMatchObject({
      settings: { rate: 0.75 },
      loops: { "tab-a-video": { start: 1, end: 3 } },
      folders: [{ name: "Practice" }],
      bookmarks: [{ start: 20, end: 25 }]
    });
  });

  it("rejects invalid direct mutations before they can reach persistent storage", async () => {
    await expect(
      applyStorageMutation({ operation: "set-rate", rate: 10 } as never)
    ).rejects.toThrow("invalid");
    await expect(loadStoredState()).resolves.toMatchObject({ settings: { rate: 1 } });
  });

  it("revalidates stale popup actions inside their transaction", async () => {
    const created = await applyStorageMutation({
      operation: "create-bookmark",
      input: bookmarkInput()
    });
    const bookmarkId = created.entityId!;
    const duplicate = await applyStorageMutation({
      operation: "create-bookmark",
      input: bookmarkInput(20, 25)
    });
    const duplicateId = duplicate.entityId!;

    const collision = await applyStorageMutation({
      operation: "update-bookmark-parameters",
      bookmarkId,
      parameters: { start: 20, end: 25, rate: 1 }
    });
    expect(collision.status).toBe("duplicate");

    const removed = await applyStorageMutation({
      operation: "delete-bookmark",
      bookmarkId
    });
    expect(removed.status).toBe("deleted");
    await expect(
      applyStorageMutation({
        operation: "move-bookmark",
        bookmarkId,
        folderId: null
      })
    ).resolves.toMatchObject({ status: "missing" });
    await expect(
      applyStorageMutation({
        operation: "update-bookmark",
        bookmarkId,
        changes: { name: "Gone", folderId: null, start: 1, end: 2, rate: 1 }
      })
    ).resolves.toMatchObject({ status: "missing" });
    await expect(
      applyStorageMutation({ operation: "delete-bookmark", bookmarkId })
    ).resolves.toMatchObject({ status: "missing" });
    expect((await loadStoredState()).bookmarks.map((bookmark) => bookmark.id)).toEqual([
      duplicateId
    ]);
  });

  it("merges stale editor patches without reverting changes from another window", async () => {
    const folder = await applyStorageMutation({
      operation: "create-folder",
      name: "Solos",
      parentId: null
    });
    const created = await applyStorageMutation({
      operation: "create-bookmark",
      input: bookmarkInput()
    });
    const bookmarkId = created.entityId!;

    await applyStorageMutation({
      operation: "move-bookmark",
      bookmarkId,
      folderId: folder.entityId!
    });
    await applyStorageMutation({
      operation: "update-bookmark-parameters",
      bookmarkId,
      parameters: { start: 11, end: 16, rate: 0.75 }
    });
    const renamedFromStaleEditor = await applyStorageMutation({
      operation: "update-bookmark",
      bookmarkId,
      changes: { name: "Final chorus" }
    });

    expect(renamedFromStaleEditor.state.bookmarks[0]).toMatchObject({
      name: "Final chorus",
      folderId: folder.entityId,
      start: 11,
      end: 16,
      rate: 0.75
    });
  });

  it("safely reparents mutations whose target folder vanished concurrently", async () => {
    const folder = await applyStorageMutation({
      operation: "create-folder",
      name: "Temporary",
      parentId: null
    });
    const folderId = folder.entityId!;
    await applyStorageMutation({ operation: "delete-folder", folderId });

    const bookmark = await applyStorageMutation({
      operation: "create-bookmark",
      input: { ...bookmarkInput(), folderId }
    });
    expect(bookmark.state.bookmarks[0]?.folderId).toBeNull();
    await expect(
      applyStorageMutation({ operation: "delete-folder", folderId })
    ).resolves.toMatchObject({ status: "missing" });
  });

  it("updates, moves, clears and deletes existing entities through every command", async () => {
    const folder = await applyStorageMutation({
      operation: "create-folder",
      name: "Folder",
      parentId: null
    });
    const bookmark = await applyStorageMutation({
      operation: "create-bookmark",
      input: bookmarkInput()
    });
    const bookmarkId = bookmark.entityId!;

    await expect(
      applyStorageMutation({
        operation: "move-bookmark",
        bookmarkId,
        folderId: folder.entityId!
      })
    ).resolves.toMatchObject({ status: "updated", entityId: bookmarkId });
    await expect(
      applyStorageMutation({
        operation: "update-bookmark-parameters",
        bookmarkId,
        parameters: { start: 11, end: 16, rate: 0.75 }
      })
    ).resolves.toMatchObject({ status: "updated", entityId: bookmarkId });
    const renamed = await applyStorageMutation({
      operation: "update-bookmark",
      bookmarkId,
      changes: { name: "Final", folderId: null, start: 12, end: 17, rate: 0.8 }
    });
    expect(renamed.state.bookmarks[0]).toMatchObject({
      name: "Final",
      folderId: null,
      start: 12,
      end: 17,
      rate: 0.8
    });

    await applyStorageMutation({
      operation: "set-loop",
      videoId: "video",
      loop: { start: 1, end: 2 }
    });
    const cleared = await applyStorageMutation({
      operation: "set-loop",
      videoId: "video",
      loop: null
    });
    expect(cleared.state.loops).not.toHaveProperty("video");
    await expect(
      applyStorageMutation({ operation: "delete-folder", folderId: folder.entityId! })
    ).resolves.toMatchObject({ status: "deleted" });
  });

  it("uses runtime messaging in extension views and reports coordinator failures", async () => {
    const state = createDefaultState();
    const sendMessage = vi.fn().mockResolvedValue({
      ok: true,
      result: { state, status: "updated" }
    } satisfies StorageMutationResponse);
    vi.stubGlobal("browser", { runtime: { sendMessage } });

    await expect(mutateStoredState({ operation: "set-rate", rate: 1.25 })).resolves.toEqual({
      state,
      status: "updated"
    });
    expect(sendMessage).toHaveBeenCalledWith({
      type: STORAGE_MUTATION_MESSAGE,
      requestId: "00000000-0000-4000-8000-000000000001",
      mutation: { operation: "set-rate", rate: 1.25 }
    });

    sendMessage.mockResolvedValueOnce({ ok: false, error: "write failed" });
    await expect(mutateStoredState({ operation: "set-rate", rate: 2 })).rejects.toThrow(
      "write failed"
    );
    sendMessage.mockResolvedValueOnce(undefined);
    await expect(mutateStoredState({ operation: "set-rate", rate: 2 })).rejects.toThrow(
      "did not respond"
    );
  });

  it("times out a suspended coordinator instead of leaving callers pending", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("browser", {
      runtime: { sendMessage: vi.fn(() => new Promise<never>(() => undefined)) }
    });

    const mutation = mutateStoredState({ operation: "set-rate", rate: 1.25 });
    const expectation = expect(mutation).rejects.toThrow("timed out");
    await vi.advanceTimersByTimeAsync(5001);
    await expectation;
  });

  it("rejects unrelated and malformed runtime messages", () => {
    const request = (mutation: unknown): unknown => ({
      type: STORAGE_MUTATION_MESSAGE,
      mutation
    });
    const invalidMessages = [
      null,
      { type: "other" },
      { type: STORAGE_MUTATION_MESSAGE },
      {
        type: STORAGE_MUTATION_MESSAGE,
        requestId: "",
        mutation: { operation: "set-rate", rate: 1 }
      },
      {
        type: STORAGE_MUTATION_MESSAGE,
        requestId: "x".repeat(129),
        mutation: { operation: "set-rate", rate: 1 }
      },
      request(null),
      request({}),
      request({ operation: "unknown" }),
      request({ operation: "set-rate", rate: Number.NaN }),
      request({ operation: "set-rate", rate: 0.1 }),
      request({ operation: "set-loop", videoId: 1, loop: null }),
      request({ operation: "set-loop", videoId: " ", loop: null }),
      request({ operation: "set-loop", videoId: "video", loop: { start: 1 } }),
      request({ operation: "set-loop", videoId: "video", loop: { start: 1, end: Infinity } }),
      request({ operation: "set-loop", videoId: "video", loop: { start: 1, end: 1.01 } }),
      request({ operation: "create-folder", name: 1, parentId: null }),
      request({ operation: "create-folder", name: " ", parentId: null }),
      request({ operation: "create-folder", name: "Folder", parentId: 1 }),
      request({ operation: "delete-folder", folderId: null }),
      request({ operation: "delete-folder", folderId: "x".repeat(129) }),
      request({ operation: "create-bookmark", input: null }),
      request({ operation: "create-bookmark", input: { ...bookmarkInput(), start: "bad" } }),
      request({ operation: "create-bookmark", input: { ...bookmarkInput(), end: 5 } }),
      request({ operation: "create-bookmark", input: { ...bookmarkInput(), name: 1 } }),
      request({ operation: "create-bookmark", input: { ...bookmarkInput(), name: " " } }),
      request({ operation: "create-bookmark", input: { ...bookmarkInput(), folderId: 1 } }),
      request({ operation: "create-bookmark", input: { ...bookmarkInput(), videoId: 1 } }),
      request({ operation: "create-bookmark", input: { ...bookmarkInput(), videoTitle: 1 } }),
      request({ operation: "move-bookmark", bookmarkId: 1, folderId: null }),
      request({ operation: "move-bookmark", bookmarkId: " ", folderId: null }),
      request({ operation: "move-bookmark", bookmarkId: "bookmark", folderId: "x".repeat(129) }),
      request({ operation: "move-bookmark", bookmarkId: "bookmark", folderId: 1 }),
      request({ operation: "update-bookmark-parameters", bookmarkId: 1, parameters: {} }),
      request({ operation: "update-bookmark-parameters", bookmarkId: "bookmark" }),
      request({ operation: "update-bookmark", bookmarkId: 1, changes: {} }),
      request({ operation: "update-bookmark", bookmarkId: "bookmark", changes: null }),
      request({ operation: "update-bookmark", bookmarkId: "bookmark", changes: {} }),
      request({ operation: "update-bookmark", bookmarkId: "bookmark", changes: { name: " " } }),
      request({ operation: "update-bookmark", bookmarkId: "bookmark", changes: { rate: 9 } }),
      request({
        operation: "update-bookmark",
        bookmarkId: "bookmark",
        changes: { start: 31_536_001 }
      }),
      request({
        operation: "update-bookmark",
        bookmarkId: "bookmark",
        changes: { start: 31_536_000, end: 31_536_000.01 }
      }),
      request({ operation: "update-bookmark", bookmarkId: "bookmark", changes: { other: 1 } }),
      request({ operation: "delete-bookmark", bookmarkId: 1 })
    ];
    for (const message of invalidMessages) {
      expect(isStorageMutationRequest(message)).toBe(false);
    }

    const validMutations = [
      { operation: "set-rate", rate: 1 },
      { operation: "set-loop", videoId: "video", loop: null },
      { operation: "set-loop", videoId: "video", loop: { start: 1, end: 2 } },
      { operation: "create-folder", name: "Folder", parentId: null },
      { operation: "delete-folder", folderId: "folder" },
      { operation: "create-bookmark", input: bookmarkInput() },
      { operation: "move-bookmark", bookmarkId: "bookmark", folderId: "folder" },
      {
        operation: "update-bookmark-parameters",
        bookmarkId: "bookmark",
        parameters: { start: 1, end: 2, rate: 1 }
      },
      {
        operation: "update-bookmark",
        bookmarkId: "bookmark",
        changes: { name: "Name", folderId: null, start: 1, end: 2, rate: 1 }
      },
      { operation: "update-bookmark", bookmarkId: "bookmark", changes: { name: "Name" } },
      { operation: "delete-bookmark", bookmarkId: "bookmark" }
    ];
    for (const mutation of validMutations) {
      expect(isStorageMutationRequest(request(mutation))).toBe(true);
    }
    expect(
      isStorageMutationRequest({
        type: STORAGE_MUTATION_MESSAGE,
        mutation: { operation: "delete-bookmark", bookmarkId: "bookmark-1" }
      })
    ).toBe(true);
  });

  it("normalizes persisted loop precision and rejects invalid explicit request ids", async () => {
    const result = await applyStorageMutation({
      operation: "set-loop",
      videoId: "video",
      loop: { start: 1.23449, end: 2.34549 }
    });
    expect(result.state.loops.video).toEqual({ start: 1.234, end: 2.345 });
    await expect(applyStorageMutation({ operation: "set-rate", rate: 1 }, "")).rejects.toThrow(
      "invalid"
    );
  });
});
