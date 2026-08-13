import { clampRate, normalizeLoopTime, validateSegment } from "../core/loop-engine";

export interface StoredLoop {
  start: number;
  end: number;
}

export interface StoredFolder {
  id: string;
  name: string;
  parentId: string | null;
  createdAt: number;
}

export interface StoredBookmark {
  id: string;
  name: string;
  folderId: string | null;
  videoId: string;
  videoTitle: string;
  start: number;
  end: number;
  rate: number;
  createdAt: number;
}

export interface StoredState {
  version: 3;
  settings: {
    rate: number;
  };
  loops: Record<string, StoredLoop>;
  folders: StoredFolder[];
  bookmarks: StoredBookmark[];
}

interface VersionTwoFolder {
  id: string;
  name: string;
  createdAt: number;
}

interface VersionTwoBookmark extends StoredBookmark {
  preservesPitch?: boolean;
}

interface VersionTwoState {
  version: 2;
  settings?: { rate?: number; preservesPitch?: boolean };
  loops?: Record<string, StoredLoop>;
  folders?: VersionTwoFolder[];
  bookmarks?: VersionTwoBookmark[];
}

interface VersionOneState {
  version: 1;
  settings?: { rate?: number; preservesPitch?: boolean };
  loops?: Record<string, StoredLoop>;
}

interface RuntimeStateV1 {
  version: 1;
  settings: StoredState["settings"];
  loops: StoredState["loops"];
}

interface LibraryStateV1 {
  version: 1;
  folders: StoredFolder[];
  bookmarks: StoredBookmark[];
}

interface StorageArea {
  get(key: string | string[]): Promise<Record<string, unknown>>;
  set(items: Record<string, unknown>): Promise<void>;
}

interface ExtensionApi {
  storage?: {
    local?: StorageArea;
  };
}

const STORAGE_KEY = "ytLooperStateV3";
const VERSION_TWO_STORAGE_KEY = "ytLooperStateV2";
const VERSION_ONE_STORAGE_KEY = "ytLooperStateV1";
const RUNTIME_STORAGE_KEY = "ytLooperRuntimeV1";
export const LIBRARY_STORAGE_KEY = "ytLooperLibraryV1";
const STORAGE_LAYOUT_KEY = "ytLooperStorageLayoutV1";
const STORAGE_LAYOUT_VERSION = 1;
const MAX_SAVED_LOOPS = 250;
let updateQueue: Promise<void> = Promise.resolve();

interface StorageChange {
  oldValue?: unknown;
  newValue?: unknown;
}

export type StorageChanges = Record<string, StorageChange>;

export const createDefaultState = (): StoredState => ({
  version: 3,
  settings: { rate: 1 },
  loops: {},
  folders: [],
  bookmarks: []
});

function storageArea(): StorageArea | null {
  const extensionGlobal = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };
  return extensionGlobal.browser?.storage?.local ?? extensionGlobal.chrome?.storage?.local ?? null;
}

function validRate(rate: unknown): number {
  return Number.isFinite(rate) ? clampRate(Number(rate)) : 1;
}

function record(candidate: unknown): Record<string, unknown> | null {
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null;
}

function boundedString(candidate: unknown, maximumLength: number): string | null {
  if (typeof candidate !== "string") {
    return null;
  }
  const value = candidate.trim();
  return value.length > 0 && value.length <= maximumLength ? value : null;
}

function timestamp(candidate: unknown): number {
  return Number.isFinite(candidate) && Number(candidate) >= 0 ? Number(candidate) : 0;
}

function finiteNumber(candidate: unknown): number {
  return Number.isFinite(candidate) ? Number(candidate) : Number.NaN;
}

function normalizeLoops(candidate: unknown): Record<string, StoredLoop> {
  const value = record(candidate);
  if (!value) {
    return {};
  }
  const entries: [string, StoredLoop][] = [];
  for (const [videoId, rawLoop] of Object.entries(value)) {
    const loop = record(rawLoop);
    const normalizedVideoId = boundedString(videoId, 128);
    if (!loop || !normalizedVideoId) {
      continue;
    }
    const start = normalizeLoopTime(finiteNumber(loop.start));
    const end = normalizeLoopTime(finiteNumber(loop.end));
    if (validateSegment(start, end).valid) {
      entries.push([normalizedVideoId, { start, end }]);
    }
  }
  return Object.fromEntries(entries.slice(-MAX_SAVED_LOOPS));
}

function normalizeFolders(candidate: unknown): StoredFolder[] {
  if (!Array.isArray(candidate)) {
    return [];
  }
  const folders: StoredFolder[] = [];
  const ids = new Set<string>();
  for (const rawFolder of candidate) {
    const folder = record(rawFolder);
    const id = boundedString(folder?.id, 128);
    const name = boundedString(folder?.name, 50);
    if (!folder || !id || !name || ids.has(id)) {
      continue;
    }
    ids.add(id);
    folders.push({
      id,
      name,
      parentId: typeof folder.parentId === "string" ? folder.parentId : null,
      createdAt: timestamp(folder.createdAt)
    });
  }

  const byId = new Map(folders.map((folder) => [folder.id, folder]));
  for (const folder of folders) {
    if (!folder.parentId || !byId.has(folder.parentId) || folder.parentId === folder.id) {
      folder.parentId = null;
    }
  }

  const visitState = new Map<string, "visiting" | "visited">();
  for (const folder of folders) {
    if (visitState.has(folder.id)) {
      continue;
    }
    const path: StoredFolder[] = [];
    let cursor: StoredFolder | undefined = folder;
    while (cursor && !visitState.has(cursor.id)) {
      visitState.set(cursor.id, "visiting");
      path.push(cursor);
      cursor = cursor.parentId ? byId.get(cursor.parentId) : undefined;
    }
    if (cursor && visitState.get(cursor.id) === "visiting") {
      cursor.parentId = null;
    }
    for (const visitedFolder of path) {
      visitState.set(visitedFolder.id, "visited");
    }
  }
  return folders;
}

function normalizeBookmarks(candidate: unknown, folders: StoredFolder[]): StoredBookmark[] {
  if (!Array.isArray(candidate)) {
    return [];
  }
  const folderIds = new Set(folders.map((folder) => folder.id));
  const bookmarkIds = new Set<string>();
  const bookmarks: StoredBookmark[] = [];
  for (const rawBookmark of candidate) {
    const bookmark = record(rawBookmark);
    const id = boundedString(bookmark?.id, 128);
    const name = boundedString(bookmark?.name, 80);
    const videoId = boundedString(bookmark?.videoId, 128);
    const videoTitle = boundedString(bookmark?.videoTitle, 500);
    if (!bookmark || !id || !name || !videoId || !videoTitle || bookmarkIds.has(id)) {
      continue;
    }
    const start = normalizeLoopTime(finiteNumber(bookmark.start));
    const end = normalizeLoopTime(finiteNumber(bookmark.end));
    if (!validateSegment(start, end).valid) {
      continue;
    }
    bookmarkIds.add(id);
    const requestedFolderId = typeof bookmark.folderId === "string" ? bookmark.folderId : null;
    bookmarks.push({
      id,
      name,
      folderId: requestedFolderId && folderIds.has(requestedFolderId) ? requestedFolderId : null,
      videoId,
      videoTitle,
      start,
      end,
      rate: validRate(bookmark.rate),
      createdAt: timestamp(bookmark.createdAt)
    });
  }
  return bookmarks;
}

function normalizeLibrary(
  foldersCandidate: unknown,
  bookmarksCandidate: unknown
): Pick<StoredState, "folders" | "bookmarks"> {
  const folders = normalizeFolders(foldersCandidate);
  return { folders, bookmarks: normalizeBookmarks(bookmarksCandidate, folders) };
}

function normalizeState(candidate: Partial<StoredState> | undefined): StoredState {
  if (candidate?.version !== 3) {
    return createDefaultState();
  }

  const library = normalizeLibrary(candidate.folders, candidate.bookmarks);
  return {
    version: 3,
    settings: { rate: validRate(candidate.settings?.rate) },
    loops: normalizeLoops(candidate.loops),
    ...library
  };
}

function migrateVersionTwo(candidate: VersionTwoState): StoredState {
  const state = createDefaultState();
  state.settings.rate = validRate(candidate.settings?.rate);
  state.loops = normalizeLoops(candidate.loops);
  const library = normalizeLibrary(
    Array.isArray(candidate.folders)
      ? candidate.folders.map((folder) => ({ ...folder, parentId: null }))
      : [],
    candidate.bookmarks
  );
  state.folders = library.folders;
  state.bookmarks = library.bookmarks;
  return state;
}

function migrateVersionOne(candidate: VersionOneState): StoredState {
  const state = createDefaultState();
  state.settings.rate = validRate(candidate.settings?.rate);
  state.loops = normalizeLoops(candidate.loops);
  return state;
}

interface StoredStateSnapshot {
  state: StoredState;
  layoutReady: boolean;
}

async function readStoredStateSnapshot(): Promise<StoredStateSnapshot> {
  const storage = storageArea();
  if (!storage) {
    return { state: createDefaultState(), layoutReady: false };
  }

  const result = await storage.get([
    STORAGE_KEY,
    VERSION_TWO_STORAGE_KEY,
    VERSION_ONE_STORAGE_KEY,
    RUNTIME_STORAGE_KEY,
    LIBRARY_STORAGE_KEY,
    STORAGE_LAYOUT_KEY
  ]);
  const layoutReady = result[STORAGE_LAYOUT_KEY] === STORAGE_LAYOUT_VERSION;
  const current = result[STORAGE_KEY] as Partial<StoredState> | undefined;
  let state: StoredState;
  let migratedLegacyState = false;
  if (layoutReady) {
    // Once the split layout exists, ignore the compatibility snapshot. This
    // prevents a deleted split slice from resurrecting stale monolithic data.
    state = createDefaultState();
  } else if (current?.version === 3) {
    state = normalizeState(current);
    migratedLegacyState = true;
  } else {
    const versionTwo = result[VERSION_TWO_STORAGE_KEY] as VersionTwoState | undefined;
    const versionOne = result[VERSION_ONE_STORAGE_KEY] as VersionOneState | undefined;
    if (versionTwo?.version === 2) {
      state = migrateVersionTwo(versionTwo);
      migratedLegacyState = true;
    } else if (versionOne?.version === 1) {
      state = migrateVersionOne(versionOne);
      migratedLegacyState = true;
    } else {
      state = createDefaultState();
    }
  }
  const runtime = result[RUNTIME_STORAGE_KEY] as RuntimeStateV1 | undefined;
  if (runtime?.version === 1) {
    state.settings = { rate: validRate(runtime.settings?.rate) };
    state.loops = normalizeLoops(runtime.loops);
  }
  const library = result[LIBRARY_STORAGE_KEY] as LibraryStateV1 | undefined;
  if (library?.version === 1) {
    const normalizedLibrary = normalizeLibrary(library.folders, library.bookmarks);
    state.folders = normalizedLibrary.folders;
    state.bookmarks = normalizedLibrary.bookmarks;
  }
  const migrationPersisted = migratedLegacyState ? await persistMigrationSafely(state) : false;
  return { state, layoutReady: layoutReady || migrationPersisted };
}

export function applyStorageChanges(state: StoredState, changes: StorageChanges): StoredState {
  const next: StoredState = {
    ...state,
    settings: { ...state.settings },
    loops: { ...state.loops },
    folders: [...state.folders],
    bookmarks: [...state.bookmarks]
  };
  if (RUNTIME_STORAGE_KEY in changes) {
    const runtime = record(changes[RUNTIME_STORAGE_KEY]?.newValue);
    if (runtime?.version === 1) {
      next.settings = { rate: validRate(record(runtime.settings)?.rate) };
      next.loops = normalizeLoops(runtime.loops);
    } else {
      const defaults = createDefaultState();
      next.settings = defaults.settings;
      next.loops = defaults.loops;
    }
  }
  if (LIBRARY_STORAGE_KEY in changes) {
    const library = record(changes[LIBRARY_STORAGE_KEY]?.newValue);
    if (library?.version === 1) {
      const normalizedLibrary = normalizeLibrary(library.folders, library.bookmarks);
      next.folders = normalizedLibrary.folders;
      next.bookmarks = normalizedLibrary.bookmarks;
    } else {
      next.folders = [];
      next.bookmarks = [];
    }
  }
  return next;
}

export function loadStoredStateOrThrow(): Promise<StoredState> {
  return readStoredStateSnapshot().then(({ state }) => state);
}

export async function loadStoredState(): Promise<StoredState> {
  try {
    return (await readStoredStateSnapshot()).state;
  } catch (error) {
    console.warn("YT Looper could not load its saved state.", error);
    return createDefaultState();
  }
}

async function persistMigrationSafely(state: StoredState): Promise<boolean> {
  try {
    await saveMigratedState(state);
    return true;
  } catch (error) {
    console.warn("YT Looper could not persist its migrated state.", error);
    return false;
  }
}

async function saveMigratedState(state: StoredState): Promise<void> {
  const storage = storageArea();
  if (!storage) {
    return;
  }
  await storage.set({
    [STORAGE_KEY]: {
      ...state,
      loops: Object.fromEntries(Object.entries(state.loops).slice(-MAX_SAVED_LOOPS))
    },
    [RUNTIME_STORAGE_KEY]: runtimeState(state),
    [LIBRARY_STORAGE_KEY]: libraryState(state),
    [STORAGE_LAYOUT_KEY]: STORAGE_LAYOUT_VERSION
  });
}

export async function saveStoredState(state: StoredState): Promise<void> {
  const storage = storageArea();
  if (!storage) {
    return;
  }

  const boundedLoops = Object.fromEntries(Object.entries(state.loops).slice(-MAX_SAVED_LOOPS));
  try {
    const runtime = runtimeState(state);
    const library = libraryState(state);
    await storage.set({
      [STORAGE_KEY]: {
        ...state,
        version: 3,
        loops: boundedLoops
      },
      [RUNTIME_STORAGE_KEY]: runtime,
      [LIBRARY_STORAGE_KEY]: library,
      [STORAGE_LAYOUT_KEY]: STORAGE_LAYOUT_VERSION
    });
  } catch (error) {
    console.warn("YT Looper could not save its state.", error);
  }
}

export function updateStoredState(mutator: (state: StoredState) => void): Promise<StoredState> {
  return enqueueStoredStateUpdate(mutator);
}

function enqueueStoredStateUpdate(mutator: (state: StoredState) => void): Promise<StoredState> {
  let resolveResult!: (state: StoredState) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<StoredState>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  updateQueue = updateQueue.then(async () => {
    try {
      const snapshot = await readStoredStateSnapshot();
      const state = snapshot.state;
      const previousRuntime = JSON.stringify(runtimeState(state));
      const previousLibrary = JSON.stringify(libraryState(state));
      mutator(state);
      await saveChangedSlices(state, previousRuntime, previousLibrary, snapshot.layoutReady);
      resolveResult(state);
    } catch (error) {
      rejectResult(error);
    }
  });

  return result;
}

function runtimeState(state: StoredState): RuntimeStateV1 {
  return {
    version: 1,
    settings: { ...state.settings },
    loops: Object.fromEntries(Object.entries(state.loops).slice(-MAX_SAVED_LOOPS))
  };
}

function libraryState(state: StoredState): LibraryStateV1 {
  return {
    version: 1,
    folders: state.folders,
    bookmarks: state.bookmarks
  };
}

async function saveChangedSlices(
  state: StoredState,
  previousRuntime: string,
  previousLibrary: string,
  layoutReady: boolean
): Promise<void> {
  const storage = storageArea();
  if (!storage) {
    return;
  }
  const runtime = runtimeState(state);
  const library = libraryState(state);
  const changes: Record<string, unknown> = {};
  if (!layoutReady || JSON.stringify(runtime) !== previousRuntime) {
    changes[RUNTIME_STORAGE_KEY] = runtime;
  }
  if (!layoutReady || JSON.stringify(library) !== previousLibrary) {
    changes[LIBRARY_STORAGE_KEY] = library;
  }
  if (!layoutReady) {
    changes[STORAGE_LAYOUT_KEY] = STORAGE_LAYOUT_VERSION;
  }
  if (Object.keys(changes).length > 0) {
    await storage.set(changes);
  }
}
