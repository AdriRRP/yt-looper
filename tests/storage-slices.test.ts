import { afterEach, describe, expect, it, vi } from "vitest";
import { loadStoredState, updateStoredState } from "../src/platform/storage";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("isolated storage slices", () => {
  it.each(["browser", "chrome"] as const)(
    "prevents playback writes from reverting a rename through the %s namespace",
    async (apiNamespace) => {
      const memory: Record<string, unknown> = {
        ytLooperStateV3: {
          version: 3,
          settings: { rate: 1 },
          loops: {},
          folders: [],
          bookmarks: [
            {
              id: "bookmark-1",
              name: "Nombre original",
              folderId: null,
              videoId: "dQw4w9WgXcQ",
              videoTitle: "Vídeo",
              start: 10,
              end: 15,
              rate: 1,
              createdAt: 1
            }
          ]
        }
      };
      const writes: Record<string, unknown>[] = [];
      vi.stubGlobal(apiNamespace, {
        storage: {
          local: {
            async get(keys: string | string[]) {
              const requested = Array.isArray(keys) ? keys : [keys];
              return Object.fromEntries(
                requested.filter((key) => key in memory).map((key) => [key, memory[key]])
              );
            },
            async set(items: Record<string, unknown>) {
              writes.push(items);
              Object.assign(memory, items);
            }
          }
        }
      });

      await updateStoredState((state) => {
        state.bookmarks[0]!.name = "Nombre definitivo";
      });
      expect(Object.keys(writes.at(-1)!)).toEqual(["ytLooperLibraryV1"]);

      writes.length = 0;
      await updateStoredState((state) => {
        state.loops.dQw4w9WgXcQ = { start: 11, end: 16 };
      });
      expect(Object.keys(writes.at(-1)!)).toEqual(["ytLooperRuntimeV1"]);

      const reloaded = await loadStoredState();
      expect(reloaded.bookmarks[0]?.name).toBe("Nombre definitivo");
      expect(reloaded.loops.dQw4w9WgXcQ).toEqual({ start: 11, end: 16 });
    }
  );
});
