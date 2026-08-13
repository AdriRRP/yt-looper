import {
  addBookmark,
  addFolder,
  deleteBookmark,
  deleteFolder,
  findEquivalentBookmark,
  updateBookmark,
  type BookmarkInput,
  type BookmarkPatch
} from "../library/bookmarks";
import {
  MAX_LOOP_TIME_SECONDS,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  normalizeLoopTime,
  validateSegment
} from "../core/loop-engine";
import { updateStoredState, type StoredLoop, type StoredState } from "./storage";

export const STORAGE_MUTATION_MESSAGE = "yt-looper:storage-mutation";
const STORAGE_COORDINATOR_TIMEOUT_MS = 5000;
const RETRY_REQUEST_ID_TTL_MS = 60_000;
const retryRequestIds = new Map<string, { requestId: string; expiresAt: number }>();
const inFlightMutations = new Map<string, Promise<StorageMutationResult>>();

interface MutableLoopParameters {
  start: number;
  end: number;
  rate: number;
}

export type StorageMutation =
  | { operation: "set-rate"; rate: number }
  | { operation: "set-loop"; videoId: string; loop: StoredLoop | null }
  | { operation: "create-folder"; name: string; parentId: string | null }
  | { operation: "delete-folder"; folderId: string }
  | { operation: "create-bookmark"; input: BookmarkInput }
  | { operation: "move-bookmark"; bookmarkId: string; folderId: string | null }
  | {
      operation: "update-bookmark-parameters";
      bookmarkId: string;
      parameters: MutableLoopParameters;
    }
  | { operation: "update-bookmark"; bookmarkId: string; changes: BookmarkPatch }
  | { operation: "delete-bookmark"; bookmarkId: string };

type StorageMutationStatus = "created" | "updated" | "deleted" | "duplicate" | "missing";

export interface StorageMutationResult {
  state: StoredState;
  status: StorageMutationStatus;
  entityId?: string;
}

export interface StorageMutationRequest {
  type: typeof STORAGE_MUTATION_MESSAGE;
  requestId?: string;
  mutation: StorageMutation;
}

interface StorageMutationSuccess {
  ok: true;
  result: StorageMutationResult;
}

interface StorageMutationFailure {
  ok: false;
  error: string;
}

export type StorageMutationResponse = StorageMutationSuccess | StorageMutationFailure;

interface RuntimeApi {
  sendMessage?(message: unknown): Promise<unknown>;
}

interface ExtensionApi {
  runtime?: RuntimeApi;
}

function runtimeApi(): RuntimeApi | null {
  const extensionGlobal = globalThis as typeof globalThis & {
    browser?: ExtensionApi;
    chrome?: ExtensionApi;
  };
  return extensionGlobal.browser?.runtime ?? extensionGlobal.chrome?.runtime ?? null;
}

function folderExists(state: StoredState, folderId: string | null): boolean {
  return folderId === null || state.folders.some((folder) => folder.id === folderId);
}

function safeFolderId(state: StoredState, folderId: string | null): string | null {
  return folderExists(state, folderId) ? folderId : null;
}

export async function applyStorageMutation(
  mutation: StorageMutation,
  requestId: string = crypto.randomUUID()
): Promise<StorageMutationResult> {
  if (
    !isStorageMutation(mutation) ||
    typeof requestId !== "string" ||
    requestId.trim().length === 0 ||
    requestId.length > 128
  ) {
    throw new Error("The storage mutation is invalid.");
  }
  let status: StorageMutationStatus = "updated";
  let entityId: string | undefined;
  const state = await updateStoredState((latestState) => {
    switch (mutation.operation) {
      case "set-rate":
        latestState.settings.rate = mutation.rate;
        break;
      case "set-loop":
        if (mutation.loop) {
          latestState.loops[mutation.videoId] = {
            start: normalizeLoopTime(mutation.loop.start),
            end: normalizeLoopTime(mutation.loop.end)
          };
        } else {
          delete latestState.loops[mutation.videoId];
        }
        break;
      case "create-folder": {
        const existingFolder = latestState.folders.find((folder) => folder.id === requestId);
        if (existingFolder) {
          status = "created";
          entityId = existingFolder.id;
          break;
        }
        const folder = addFolder(
          latestState,
          mutation.name,
          safeFolderId(latestState, mutation.parentId),
          requestId
        );
        status = "created";
        entityId = folder.id;
        break;
      }
      case "delete-folder":
        if (!latestState.folders.some((folder) => folder.id === mutation.folderId)) {
          status = "missing";
          break;
        }
        deleteFolder(latestState, mutation.folderId);
        status = "deleted";
        entityId = mutation.folderId;
        break;
      case "create-bookmark": {
        const existingBookmark = latestState.bookmarks.find(
          (bookmark) => bookmark.id === requestId
        );
        if (existingBookmark) {
          status = "created";
          entityId = existingBookmark.id;
          break;
        }
        if (findEquivalentBookmark(latestState, mutation.input)) {
          status = "duplicate";
          break;
        }
        const bookmark = addBookmark(
          latestState,
          {
            ...mutation.input,
            folderId: safeFolderId(latestState, mutation.input.folderId)
          },
          requestId
        );
        status = "created";
        entityId = bookmark.id;
        break;
      }
      case "move-bookmark": {
        const bookmark = latestState.bookmarks.find(
          (candidate) => candidate.id === mutation.bookmarkId
        );
        if (!bookmark) {
          status = "missing";
          break;
        }
        bookmark.folderId = safeFolderId(latestState, mutation.folderId);
        entityId = bookmark.id;
        break;
      }
      case "update-bookmark-parameters": {
        const bookmark = latestState.bookmarks.find(
          (candidate) => candidate.id === mutation.bookmarkId
        );
        if (!bookmark) {
          status = "missing";
          break;
        }
        if (
          findEquivalentBookmark(
            latestState,
            { videoId: bookmark.videoId, ...mutation.parameters },
            mutation.bookmarkId
          )
        ) {
          status = "duplicate";
          break;
        }
        bookmark.start = normalizeLoopTime(mutation.parameters.start);
        bookmark.end = normalizeLoopTime(mutation.parameters.end);
        bookmark.rate = mutation.parameters.rate;
        entityId = bookmark.id;
        break;
      }
      case "update-bookmark": {
        const bookmark = latestState.bookmarks.find(
          (candidate) => candidate.id === mutation.bookmarkId
        );
        if (!bookmark) {
          status = "missing";
          break;
        }
        const changes: BookmarkPatch = {
          ...mutation.changes,
          ...(mutation.changes.folderId === undefined
            ? {}
            : { folderId: safeFolderId(latestState, mutation.changes.folderId) })
        };
        const merged = {
          name: changes.name ?? bookmark.name,
          folderId: changes.folderId === undefined ? bookmark.folderId : changes.folderId,
          start: normalizeLoopTime(changes.start ?? bookmark.start),
          end: normalizeLoopTime(changes.end ?? bookmark.end),
          rate: changes.rate ?? bookmark.rate
        };
        if (!validBookmarkChanges(merged)) {
          throw new Error("The bookmark update is invalid.");
        }
        if (
          findEquivalentBookmark(
            latestState,
            { videoId: bookmark.videoId, start: merged.start, end: merged.end, rate: merged.rate },
            mutation.bookmarkId
          )
        ) {
          status = "duplicate";
          break;
        }
        updateBookmark(latestState, mutation.bookmarkId, changes);
        entityId = bookmark.id;
        break;
      }
      case "delete-bookmark":
        if (!latestState.bookmarks.some((bookmark) => bookmark.id === mutation.bookmarkId)) {
          status = "missing";
          break;
        }
        deleteBookmark(latestState, mutation.bookmarkId);
        status = "deleted";
        entityId = mutation.bookmarkId;
        break;
    }
  });
  return entityId ? { state, status, entityId } : { state, status };
}

export async function mutateStoredState(mutation: StorageMutation): Promise<StorageMutationResult> {
  const fingerprint = JSON.stringify(mutation);
  const inFlight = inFlightMutations.get(fingerprint);
  if (inFlight) {
    return inFlight;
  }
  const mutationPromise = performStoredStateMutation(mutation, fingerprint);
  inFlightMutations.set(fingerprint, mutationPromise);
  try {
    return await mutationPromise;
  } finally {
    if (inFlightMutations.get(fingerprint) === mutationPromise) {
      inFlightMutations.delete(fingerprint);
    }
  }
}

async function performStoredStateMutation(
  mutation: StorageMutation,
  fingerprint: string
): Promise<StorageMutationResult> {
  const now = Date.now();
  for (const [candidate, pending] of retryRequestIds) {
    if (pending.expiresAt <= now) {
      retryRequestIds.delete(candidate);
    }
  }
  const pendingRequest = retryRequestIds.get(fingerprint);
  const requestId = pendingRequest?.requestId ?? crypto.randomUUID();
  const runtime = runtimeApi();
  if (!runtime?.sendMessage) {
    return applyStorageMutation(mutation, requestId);
  }
  try {
    const response = (await withCoordinatorTimeout(
      runtime.sendMessage({
        type: STORAGE_MUTATION_MESSAGE,
        requestId,
        mutation
      } satisfies StorageMutationRequest)
    )) as StorageMutationResponse | undefined;
    if (!response) {
      throw new Error("The storage coordinator did not respond.");
    }
    if (!response.ok) {
      throw new Error(response.error);
    }
    retryRequestIds.delete(fingerprint);
    return response.result;
  } catch (error) {
    if (error instanceof Error && error.message.includes("timed out")) {
      retryRequestIds.set(fingerprint, {
        requestId,
        expiresAt: Date.now() + RETRY_REQUEST_ID_TTL_MS
      });
    } else {
      retryRequestIds.delete(fingerprint);
    }
    throw error;
  }
}

function withCoordinatorTimeout<T>(promise: Promise<T>): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = globalThis.setTimeout(
      () => reject(new Error("The storage coordinator timed out.")),
      STORAGE_COORDINATOR_TIMEOUT_MS
    );
    void promise.then(
      (value) => {
        globalThis.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

export function isStorageMutationRequest(message: unknown): message is StorageMutationRequest {
  return (
    typeof message === "object" &&
    message !== null &&
    "type" in message &&
    message.type === STORAGE_MUTATION_MESSAGE &&
    (!("requestId" in message) ||
      (typeof message.requestId === "string" &&
        message.requestId.length > 0 &&
        message.requestId.length <= 128)) &&
    "mutation" in message &&
    isStorageMutation(message.mutation)
  );
}

function isStorageMutation(candidate: unknown): candidate is StorageMutation {
  if (typeof candidate !== "object" || candidate === null || !("operation" in candidate)) {
    return false;
  }
  const command = candidate as Record<string, unknown>;
  switch (command.operation) {
    case "set-rate":
      return finiteRateProperty(command, "rate");
    case "set-loop":
      return (
        boundedNonEmptyStringProperty(command, "videoId", 128) &&
        "loop" in command &&
        (command.loop === null || validStoredLoop(command.loop))
      );
    case "create-folder":
      return (
        boundedNonEmptyStringProperty(command, "name", 50) &&
        nullableBoundedStringProperty(command, "parentId", 128)
      );
    case "delete-folder":
      return boundedNonEmptyStringProperty(command, "folderId", 128);
    case "create-bookmark":
      return "input" in command && validBookmarkInput(command.input);
    case "move-bookmark":
      return (
        boundedNonEmptyStringProperty(command, "bookmarkId", 128) &&
        nullableBoundedStringProperty(command, "folderId", 128)
      );
    case "update-bookmark-parameters":
      return (
        boundedNonEmptyStringProperty(command, "bookmarkId", 128) &&
        "parameters" in command &&
        validLoopParameters(command.parameters)
      );
    case "update-bookmark":
      return (
        boundedNonEmptyStringProperty(command, "bookmarkId", 128) &&
        "changes" in command &&
        validBookmarkChanges(command.changes)
      );
    case "delete-bookmark":
      return boundedNonEmptyStringProperty(command, "bookmarkId", 128);
    default:
      return false;
  }
}

function boundedNonEmptyStringProperty(
  candidate: Record<string, unknown>,
  property: string,
  maximumLength: number
): boolean {
  const value = candidate[property];
  return typeof value === "string" && value.trim().length > 0 && value.length <= maximumLength;
}

function nullableBoundedStringProperty(
  candidate: Record<string, unknown>,
  property: string,
  maximumLength: number
): boolean {
  return (
    candidate[property] === null ||
    boundedNonEmptyStringProperty(candidate, property, maximumLength)
  );
}

function finiteProperty(candidate: Record<string, unknown>, property: string): boolean {
  return Number.isFinite(candidate[property]);
}

function record(candidate: unknown): Record<string, unknown> | null {
  return typeof candidate === "object" && candidate !== null
    ? (candidate as Record<string, unknown>)
    : null;
}

function validStoredLoop(candidate: unknown): candidate is StoredLoop {
  const value = record(candidate);
  return Boolean(
    value &&
    finiteProperty(value, "start") &&
    finiteProperty(value, "end") &&
    validateSegment(value.start as number, value.end as number).valid
  );
}

function validLoopParameters(candidate: unknown): candidate is MutableLoopParameters {
  const value = record(candidate);
  return Boolean(value && validStoredLoop(value) && finiteRateProperty(value, "rate"));
}

function validBookmarkInput(candidate: unknown): candidate is BookmarkInput {
  const value = record(candidate);
  return Boolean(
    value &&
    validLoopParameters(value) &&
    boundedNonEmptyStringProperty(value, "name", 80) &&
    nullableBoundedStringProperty(value, "folderId", 128) &&
    boundedNonEmptyStringProperty(value, "videoId", 128) &&
    boundedNonEmptyStringProperty(value, "videoTitle", 500)
  );
}

function validBookmarkChanges(candidate: unknown): candidate is BookmarkPatch {
  const value = record(candidate);
  if (!value || Object.keys(value).length === 0) {
    return false;
  }
  const allowedProperties = new Set(["name", "folderId", "start", "end", "rate"]);
  if (Object.keys(value).some((property) => !allowedProperties.has(property))) {
    return false;
  }
  return (
    (!("name" in value) || boundedNonEmptyStringProperty(value, "name", 80)) &&
    (!("folderId" in value) || nullableBoundedStringProperty(value, "folderId", 128)) &&
    (!("start" in value) ||
      (Number.isFinite(value.start) &&
        Number(value.start) >= 0 &&
        Number(value.start) <= MAX_LOOP_TIME_SECONDS)) &&
    (!("end" in value) ||
      (Number.isFinite(value.end) &&
        Number(value.end) >= 0 &&
        Number(value.end) <= MAX_LOOP_TIME_SECONDS)) &&
    (!("rate" in value) || validRate(value.rate)) &&
    (!("start" in value) ||
      !("end" in value) ||
      validateSegment(Number(value.start), Number(value.end)).valid)
  );
}

function finiteRateProperty(candidate: Record<string, unknown>, property: string): boolean {
  return validRate(candidate[property]);
}

function validRate(candidate: unknown): boolean {
  return (
    Number.isFinite(candidate) &&
    Number(candidate) >= MIN_PLAYBACK_RATE &&
    Number(candidate) <= MAX_PLAYBACK_RATE
  );
}
