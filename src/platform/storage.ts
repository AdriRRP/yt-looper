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
const LIBRARY_STORAGE_KEY = "ytLooperLibraryV1";
const MAX_SAVED_LOOPS = 250;
let updateQueue: Promise<void> = Promise.resolve();

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
  return Number.isFinite(rate) ? Number(rate) : 1;
}

function normalizeState(candidate: Partial<StoredState> | undefined): StoredState {
  if (candidate?.version !== 3) {
    return createDefaultState();
  }

  return {
    version: 3,
    settings: { rate: validRate(candidate.settings?.rate) },
    loops: candidate.loops && typeof candidate.loops === "object" ? candidate.loops : {},
    folders: Array.isArray(candidate.folders)
      ? candidate.folders.map((folder) => ({ ...folder, parentId: folder.parentId ?? null }))
      : [],
    bookmarks: Array.isArray(candidate.bookmarks) ? candidate.bookmarks : []
  };
}

function migrateVersionTwo(candidate: VersionTwoState): StoredState {
  const state = createDefaultState();
  state.settings.rate = validRate(candidate.settings?.rate);
  state.loops = candidate.loops && typeof candidate.loops === "object" ? candidate.loops : {};
  state.folders = Array.isArray(candidate.folders)
    ? candidate.folders.map((folder) => ({ ...folder, parentId: null }))
    : [];
  state.bookmarks = Array.isArray(candidate.bookmarks)
    ? candidate.bookmarks.map(({ preservesPitch, ...bookmark }) => {
        void preservesPitch;
        return bookmark;
      })
    : [];
  return state;
}

function migrateVersionOne(candidate: VersionOneState): StoredState {
  const state = createDefaultState();
  state.settings.rate = validRate(candidate.settings?.rate);
  state.loops = candidate.loops && typeof candidate.loops === "object" ? candidate.loops : {};
  return state;
}

export async function loadStoredState(): Promise<StoredState> {
  const storage = storageArea();
  if (!storage) {
    return createDefaultState();
  }

  try {
    const result = await storage.get([
      STORAGE_KEY,
      VERSION_TWO_STORAGE_KEY,
      VERSION_ONE_STORAGE_KEY,
      RUNTIME_STORAGE_KEY,
      LIBRARY_STORAGE_KEY
    ]);
    const current = result[STORAGE_KEY] as Partial<StoredState> | undefined;
    let state: StoredState;
    if (current?.version === 3) {
      state = normalizeState(current);
    } else {
      const versionTwo = result[VERSION_TWO_STORAGE_KEY] as VersionTwoState | undefined;
      const versionOne = result[VERSION_ONE_STORAGE_KEY] as VersionOneState | undefined;
      if (versionTwo?.version === 2) {
        state = migrateVersionTwo(versionTwo);
        await saveStoredState(state);
      } else if (versionOne?.version === 1) {
        state = migrateVersionOne(versionOne);
        await saveStoredState(state);
      } else {
        state = createDefaultState();
      }
    }
    const runtime = result[RUNTIME_STORAGE_KEY] as RuntimeStateV1 | undefined;
    if (runtime?.version === 1) {
      state.settings = { rate: validRate(runtime.settings?.rate) };
      state.loops = runtime.loops && typeof runtime.loops === "object" ? runtime.loops : {};
    }
    const library = result[LIBRARY_STORAGE_KEY] as LibraryStateV1 | undefined;
    if (library?.version === 1) {
      state.folders = Array.isArray(library.folders)
        ? library.folders.map((folder) => ({ ...folder, parentId: folder.parentId ?? null }))
        : [];
      state.bookmarks = Array.isArray(library.bookmarks) ? library.bookmarks : [];
    }
    return state;
  } catch (error) {
    console.warn("YT Looper could not load its saved state.", error);
    return createDefaultState();
  }
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
      [LIBRARY_STORAGE_KEY]: library
    });
  } catch (error) {
    console.warn("YT Looper could not save its state.", error);
  }
}

export function updateStoredState(mutator: (state: StoredState) => void): Promise<StoredState> {
  let resolveResult!: (state: StoredState) => void;
  let rejectResult!: (reason: unknown) => void;
  const result = new Promise<StoredState>((resolve, reject) => {
    resolveResult = resolve;
    rejectResult = reject;
  });

  updateQueue = updateQueue.then(async () => {
    try {
      const state = await loadStoredState();
      const previousRuntime = JSON.stringify(runtimeState(state));
      const previousLibrary = JSON.stringify(libraryState(state));
      mutator(state);
      await saveChangedSlices(state, previousRuntime, previousLibrary);
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
  previousLibrary: string
): Promise<void> {
  const storage = storageArea();
  if (!storage) {
    return;
  }
  const runtime = runtimeState(state);
  const library = libraryState(state);
  const changes: Record<string, unknown> = {};
  if (JSON.stringify(runtime) !== previousRuntime) {
    changes[RUNTIME_STORAGE_KEY] = runtime;
  }
  if (JSON.stringify(library) !== previousLibrary) {
    changes[LIBRARY_STORAGE_KEY] = library;
  }
  if (Object.keys(changes).length > 0) {
    await storage.set(changes);
  }
}
