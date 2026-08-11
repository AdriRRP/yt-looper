import { describe, expect, it } from "vitest";
import {
  addBookmark,
  addFolder,
  buildBookmarkUrl,
  deleteFolder,
  findEquivalentBookmark,
  resolveBookmarkForLoop,
  updateBookmark
} from "../src/library/bookmarks";
import { createDefaultState } from "../src/platform/storage";

describe("bookmark library", () => {
  it("creates folders and moves their bookmarks to the root when deleted", () => {
    const state = createDefaultState();
    const folder = addFolder(state, "  Canciones  ");
    const bookmark = addBookmark(state, {
      name: "  Estribillo  ",
      folderId: folder.id,
      videoId: "video123",
      videoTitle: "Canción",
      start: 12.5,
      end: 18,
      rate: 0.75
    });

    expect(folder.name).toBe("Canciones");
    expect(folder.parentId).toBeNull();
    expect(bookmark.name).toBe("Estribillo");
    deleteFolder(state, folder.id);
    expect(state.folders).toHaveLength(0);
    expect(state.bookmarks[0]?.folderId).toBeNull();
  });

  it("detects equivalent saved parameters without matching their name or folder", () => {
    const state = createDefaultState();
    const folder = addFolder(state, "Primera carpeta");
    const bookmark = addBookmark(state, {
      name: "Primera toma",
      folderId: folder.id,
      videoId: "same-video",
      videoTitle: "Canción",
      start: 10,
      end: 15,
      rate: 0.75
    });

    expect(
      findEquivalentBookmark(state, {
        videoId: "same-video",
        start: 10.01,
        end: 15.01,
        rate: 0.75
      })?.id
    ).toBe(bookmark.id);

    updateBookmark(state, bookmark.id, {
      name: "Nombre definitivo del usuario",
      folderId: null,
      start: 10,
      end: 15,
      rate: 0.75
    });
    expect(state.bookmarks[0]?.name).toBe("Nombre definitivo del usuario");
    expect(resolveBookmarkForLoop(state, bookmark.id, null)?.name).toBe(
      "Nombre definitivo del usuario"
    );
    expect(
      resolveBookmarkForLoop(
        state,
        undefined,
        {
          videoId: "same-video",
          start: 10,
          end: 15,
          rate: 0.75
        },
        bookmark.id
      )
    ).toBeNull();
    expect(
      findEquivalentBookmark(state, {
        videoId: "same-video",
        start: 10,
        end: 15,
        rate: 0.75
      })?.id
    ).toBe(bookmark.id);
    expect(
      findEquivalentBookmark(state, {
        videoId: "same-video",
        start: 11,
        end: 15,
        rate: 0.75
      })
    ).toBeNull();
  });

  it("supports nested folders and safely reparents their contents", () => {
    const state = createDefaultState();
    const parent = addFolder(state, "Guitarra");
    const child = addFolder(state, "Solos", parent.id);
    const bookmark = addBookmark(state, {
      name: "Solo final",
      folderId: child.id,
      videoId: "video123",
      videoTitle: "Canción",
      start: 20,
      end: 25,
      rate: 0.8
    });

    deleteFolder(state, child.id);
    expect(state.bookmarks.find((item) => item.id === bookmark.id)?.folderId).toBe(parent.id);
    updateBookmark(state, bookmark.id, {
      name: "Solo lento",
      folderId: null,
      start: 19.5,
      end: 26,
      rate: 0.65
    });
    expect(state.bookmarks[0]).toMatchObject({
      name: "Solo lento",
      folderId: null,
      start: 19.5,
      end: 26,
      rate: 0.65
    });
  });

  it("builds a direct YouTube URL that identifies the saved fragment", () => {
    const state = createDefaultState();
    const bookmark = addBookmark(state, {
      name: "Solo",
      folderId: null,
      videoId: "abc_123",
      videoTitle: "Canción",
      start: 42.8,
      end: 51.2,
      rate: 1.25
    });

    const url = new URL(buildBookmarkUrl(bookmark));
    expect(url.origin + url.pathname).toBe("https://www.youtube.com/watch");
    expect(url.searchParams.get("v")).toBe("abc_123");
    expect(url.searchParams.get("t")).toBe("42");
    expect(url.searchParams.get("ytl_bookmark")).toBe(bookmark.id);
  });
});
