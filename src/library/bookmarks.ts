import type { StoredBookmark, StoredFolder, StoredState } from "../platform/storage";

export interface BookmarkInput {
  name: string;
  folderId: string | null;
  videoId: string;
  videoTitle: string;
  start: number;
  end: number;
  rate: number;
}

export interface BookmarkChanges {
  name: string;
  folderId: string | null;
  start: number;
  end: number;
  rate: number;
}

export interface FragmentParameters {
  videoId: string;
  start: number;
  end: number;
  rate: number;
}

const TIME_TOLERANCE_SECONDS = 0.02;
const RATE_TOLERANCE = 0.001;

export function bookmarkMatchesParameters(
  bookmark: StoredBookmark,
  parameters: FragmentParameters
): boolean {
  return (
    bookmark.videoId === parameters.videoId &&
    Math.abs(bookmark.start - parameters.start) <= TIME_TOLERANCE_SECONDS &&
    Math.abs(bookmark.end - parameters.end) <= TIME_TOLERANCE_SECONDS &&
    Math.abs(bookmark.rate - parameters.rate) <= RATE_TOLERANCE
  );
}

function createId(): string {
  return crypto.randomUUID();
}

export function addFolder(
  state: StoredState,
  name: string,
  parentId: string | null = null
): StoredFolder {
  const folder: StoredFolder = {
    id: createId(),
    name: name.trim(),
    parentId,
    createdAt: Date.now()
  };
  state.folders.push(folder);
  return folder;
}

export function deleteFolder(state: StoredState, folderId: string): void {
  const folder = state.folders.find((candidate) => candidate.id === folderId);
  if (!folder) {
    return;
  }
  state.folders = state.folders.filter((candidate) => candidate.id !== folderId);
  for (const child of state.folders) {
    if (child.parentId === folderId) {
      child.parentId = folder.parentId;
    }
  }
  for (const bookmark of state.bookmarks) {
    if (bookmark.folderId === folderId) {
      bookmark.folderId = folder.parentId;
    }
  }
}

export function addBookmark(state: StoredState, input: BookmarkInput): StoredBookmark {
  const bookmark: StoredBookmark = {
    id: createId(),
    name: input.name.trim(),
    folderId: input.folderId,
    videoId: input.videoId,
    videoTitle: input.videoTitle,
    start: input.start,
    end: input.end,
    rate: input.rate,
    createdAt: Date.now()
  };
  state.bookmarks.push(bookmark);
  return bookmark;
}

export function updateBookmark(
  state: StoredState,
  bookmarkId: string,
  changes: BookmarkChanges
): StoredBookmark | null {
  const bookmark = state.bookmarks.find((candidate) => candidate.id === bookmarkId);
  if (!bookmark) {
    return null;
  }
  bookmark.name = changes.name.trim();
  bookmark.folderId = changes.folderId;
  bookmark.start = changes.start;
  bookmark.end = changes.end;
  bookmark.rate = changes.rate;
  return bookmark;
}

export function deleteBookmark(state: StoredState, bookmarkId: string): void {
  state.bookmarks = state.bookmarks.filter((bookmark) => bookmark.id !== bookmarkId);
}

export function findEquivalentBookmark(
  state: StoredState,
  parameters: FragmentParameters,
  excludeBookmarkId?: string
): StoredBookmark | null {
  return (
    state.bookmarks.find(
      (bookmark) =>
        bookmark.id !== excludeBookmarkId && bookmarkMatchesParameters(bookmark, parameters)
    ) ?? null
  );
}

export function resolveBookmarkForLoop(
  state: StoredState,
  bookmarkId: string | undefined,
  parameters: FragmentParameters | null,
  ignoredBookmarkId?: string
): StoredBookmark | null {
  const bookmarkById =
    bookmarkId && bookmarkId !== ignoredBookmarkId
      ? (state.bookmarks.find((bookmark) => bookmark.id === bookmarkId) ?? null)
      : null;
  return (
    bookmarkById ??
    (parameters ? findEquivalentBookmark(state, parameters, ignoredBookmarkId) : null)
  );
}

export function buildBookmarkUrl(bookmark: StoredBookmark): string {
  const url = new URL("https://www.youtube.com/watch");
  url.searchParams.set("v", bookmark.videoId);
  url.searchParams.set("t", String(Math.max(0, Math.floor(bookmark.start))));
  url.searchParams.set("ytl_bookmark", bookmark.id);
  return url.toString();
}
