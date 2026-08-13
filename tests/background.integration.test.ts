import { afterEach, describe, expect, it, vi } from "vitest";
import { createDefaultState } from "../src/platform/storage";
import {
  STORAGE_MUTATION_MESSAGE,
  type StorageMutationResponse
} from "../src/platform/storage-coordinator";

type Listener = (
  message: unknown,
  sender: unknown,
  sendResponse: (response: StorageMutationResponse) => void
) => boolean | undefined;

function installBackgroundHarness(): {
  listeners: Listener[];
  memory: Record<string, unknown>;
} {
  const listeners: Listener[] = [];
  const memory: Record<string, unknown> = { ytLooperStateV3: createDefaultState() };
  vi.stubGlobal("browser", {
    runtime: {
      onMessage: {
        addListener(listener: Listener) {
          listeners.push(listener);
        }
      }
    },
    storage: {
      local: {
        async get(keys: string | string[]) {
          const requested = Array.isArray(keys) ? keys : [keys];
          return Object.fromEntries(
            requested.filter((key) => key in memory).map((key) => [key, memory[key]])
          );
        },
        async set(items: Record<string, unknown>) {
          Object.assign(memory, structuredClone(items));
        }
      }
    }
  });
  return { listeners, memory };
}

async function dispatch(listener: Listener, message: unknown): Promise<StorageMutationResponse> {
  return new Promise((resolve, reject) => {
    const keepAlive = listener(message, {}, resolve);
    if (keepAlive !== true) {
      reject(new Error("Background listener did not keep the async response channel alive."));
    }
  });
}

afterEach(() => {
  vi.resetModules();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("background storage event", () => {
  it("keeps the event alive, answers mutations and ignores unrelated messages", async () => {
    const harness = installBackgroundHarness();
    await import("../src/background/index");
    expect(harness.listeners).toHaveLength(1);
    const listener = harness.listeners[0]!;
    expect(listener({ type: "unrelated" }, {}, vi.fn())).toBe(false);

    await expect(
      dispatch(listener, {
        type: STORAGE_MUTATION_MESSAGE,
        mutation: { operation: "set-rate", rate: 0.8 }
      })
    ).resolves.toMatchObject({
      ok: true,
      result: { status: "updated", state: { settings: { rate: 0.8 } } }
    });
  });

  it("can be recreated after suspension and continues from persistent storage", async () => {
    const harness = installBackgroundHarness();
    await import("../src/background/index");
    await dispatch(harness.listeners[0]!, {
      type: STORAGE_MUTATION_MESSAGE,
      mutation: {
        operation: "set-loop",
        videoId: "first-tab",
        loop: { start: 2, end: 4 }
      }
    });

    vi.resetModules();
    harness.listeners.length = 0;
    await import("../src/background/index");
    const response = await dispatch(harness.listeners[0]!, {
      type: STORAGE_MUTATION_MESSAGE,
      mutation: {
        operation: "set-loop",
        videoId: "second-tab",
        loop: { start: 8, end: 12 }
      }
    });

    expect(response).toMatchObject({
      ok: true,
      result: {
        state: {
          loops: {
            "first-tab": { start: 2, end: 4 },
            "second-tab": { start: 8, end: 12 }
          }
        }
      }
    });
  });

  it("deduplicates repeated request ids while the worker remains alive", async () => {
    const harness = installBackgroundHarness();
    await import("../src/background/index");
    const message = {
      type: STORAGE_MUTATION_MESSAGE,
      requestId: "00000000-0000-4000-8000-000000000099",
      mutation: { operation: "create-folder", name: "Practice", parentId: null }
    };
    await dispatch(harness.listeners[0]!, message);
    await dispatch(harness.listeners[0]!, message);
    const library = harness.memory.ytLooperLibraryV1 as { folders: unknown[] };
    expect(library.folders).toHaveLength(1);
  });

  it("rejects reusing a request id for a different command", async () => {
    const harness = installBackgroundHarness();
    await import("../src/background/index");
    const requestId = "00000000-0000-4000-8000-000000000099";
    await dispatch(harness.listeners[0]!, {
      type: STORAGE_MUTATION_MESSAGE,
      requestId,
      mutation: { operation: "set-rate", rate: 0.75 }
    });
    await expect(
      dispatch(harness.listeners[0]!, {
        type: STORAGE_MUTATION_MESSAGE,
        requestId,
        mutation: { operation: "set-rate", rate: 1.25 }
      })
    ).resolves.toEqual({
      ok: false,
      error: "A storage request id was reused for a different mutation."
    });
  });

  it("bounds its in-memory idempotency cache", async () => {
    const harness = installBackgroundHarness();
    await import("../src/background/index");
    const listener = harness.listeners[0]!;
    for (let index = 0; index <= 512; index += 1) {
      await dispatch(listener, {
        type: STORAGE_MUTATION_MESSAGE,
        requestId: `request-${index}`,
        mutation: { operation: "set-rate", rate: index % 2 === 0 ? 0.75 : 1 }
      });
    }
    await expect(
      dispatch(listener, {
        type: STORAGE_MUTATION_MESSAGE,
        requestId: "request-0",
        mutation: { operation: "set-rate", rate: 1.25 }
      })
    ).resolves.toMatchObject({ ok: true, result: { state: { settings: { rate: 1.25 } } } });
  });

  it("returns a structured error while keeping later messages usable", async () => {
    const harness = installBackgroundHarness();
    await import("../src/background/index");
    const listener = harness.listeners[0]!;
    const failed = await dispatch(listener, {
      type: STORAGE_MUTATION_MESSAGE,
      mutation: { operation: "set-loop", videoId: "bad", loop: { start: 1, end: 2 } }
    });
    expect(failed.ok).toBe(true);

    const storage = (
      globalThis as typeof globalThis & { browser: { storage: { local: { set: unknown } } } }
    ).browser.storage.local;
    storage.set = vi.fn().mockRejectedValueOnce(new Error("quota"));
    const error = await dispatch(listener, {
      type: STORAGE_MUTATION_MESSAGE,
      mutation: { operation: "set-rate", rate: 2 }
    });
    expect(error).toEqual({ ok: false, error: "quota" });
  });
});
