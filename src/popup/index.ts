import {
  MAX_LOOP_TIME_SECONDS,
  MIN_LOOP_SECONDS,
  clampRate,
  normalizeLoopTime,
  validateSegment
} from "../core/loop-engine";
import type { CurrentLoopSnapshot } from "../content/controller";
import { createDefaultBookmarkName, formatLoopTime } from "../library/bookmark-names";
import {
  bookmarkMatchesParameters,
  buildBookmarkUrl,
  resolveBookmarkForLoop,
  type BookmarkChanges,
  type BookmarkPatch
} from "../library/bookmarks";
import { localizeDocument, t } from "../platform/i18n";
import { copyText } from "../platform/clipboard";
import { buildSharedLoopUrl } from "../sharing/loop-links";
import {
  createDefaultState,
  LIBRARY_STORAGE_KEY,
  loadStoredStateOrThrow,
  type StoredBookmark,
  type StoredFolder,
  type StoredState
} from "../platform/storage";
import { mutateStoredState } from "../platform/storage-coordinator";

interface BrowserTab {
  id?: number;
}
interface PopupExtensionApi {
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<BrowserTab[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    create(properties: { url: string }): Promise<BrowserTab>;
  };
  storage?: {
    onChanged?: {
      addListener(listener: (changes: Record<string, unknown>, areaName: string) => void): void;
      removeListener(listener: (changes: Record<string, unknown>, areaName: string) => void): void;
    };
  };
}

const ROOT_ID = "__root__";
const ACTIVE_TAB_TIMEOUT_MS = 1500;
const STORAGE_TIMEOUT_MS = 1500;
const POPUP_OPERATION_TIMEOUT_MS = 6500;
const extensionGlobal = globalThis as typeof globalThis & {
  browser?: PopupExtensionApi;
  chrome?: PopupExtensionApi;
};
const extensionApi = extensionGlobal.browser ?? extensionGlobal.chrome;

const currentCard = element<HTMLElement>("current-card");
const appHeader = document.querySelector<HTMLElement>(".app-header")!;
const appMain = document.querySelector<HTMLElement>("main")!;
const currentSummary = element<HTMLParagraphElement>("current-summary");
const showWidgetButton = element<HTMLButtonElement>("show-widget");
const shareCurrentButton = element<HTMLButtonElement>("share-current");
const saveStatus = element<HTMLParagraphElement>("save-status");
const currentContext = element<HTMLElement>("current-context");
const currentBadge = element<HTMLButtonElement>("current-badge");
const currentBookmarkName = element<HTMLElement>("current-bookmark-name");
const unsavedStateGlyph = element<SVGElement>("unsaved-state-glyph");
const savedCurrentIcon = element<SVGElement>("saved-current-icon");
const savedDirtyIcon = element<SVGElement>("saved-dirty-icon");
const currentBookmarkAction = element<HTMLButtonElement>("current-bookmark-action");
const saveCurrentGlyph = element<SVGElement>("save-current-glyph");
const updateCurrentGlyph = element<SVGElement>("update-current-glyph");
const currentParametersGlyph = element<SVGElement>("current-parameters-glyph");
const libraryTree = element<HTMLDivElement>("library-tree");
const bookmarkCount = element<HTMLSpanElement>("bookmark-count");
const libraryStatus = element<HTMLParagraphElement>("library-status");
const editorModal = element<HTMLElement>("editor-modal");
const editorSheet = element<HTMLElement>("editor-sheet");
const modalBackdrop = element<HTMLButtonElement>("modal-backdrop");
const editorHeading = element<HTMLElement>("editor-heading");
const editorKicker = element<HTMLElement>("editor-kicker");
const editorForm = element<HTMLFormElement>("editor-form");
const editorName = element<HTMLInputElement>("editor-name");
const editorStart = element<HTMLInputElement>("editor-start");
const editorEnd = element<HTMLInputElement>("editor-end");
const editorRate = element<HTMLInputElement>("editor-rate");
const editorFolder = element<HTMLSelectElement>("editor-folder");
const editorStatus = element<HTMLParagraphElement>("editor-status");
const closeEditor = element<HTMLButtonElement>("close-editor");
const deleteBookmarkButton = element<HTMLButtonElement>("delete-bookmark");
const openBookmarkButton = element<HTMLButtonElement>("open-bookmark");
const submitEditorButton = element<HTMLButtonElement>("submit-editor");
const submitEditorLabel = element<HTMLElement>("submit-editor-label");
const editorSubmitMark = element<SVGPathElement>("editor-submit-mark");

let storedState: StoredState = createDefaultState();
let currentLoop: CurrentLoopSnapshot = { available: false };
let activeTabId: number | null = null;
let selectedBookmarkId: string | null = null;
let creatingParentId: string | null | undefined;
let editorMode: "create" | "edit" | null = null;
let editorBaseline: BookmarkChanges | null = null;
let modalCloseTimer: number | null = null;
let storageLoadSequence = 0;
let pendingFolderDeleteId: string | null = null;
let modalReturnFocus: HTMLElement | null = null;
const expandedFolderIds = new Set<string>([ROOT_ID]);
const pendingPopupActions = new Set<string>();

export const popupReady = initialize();

async function initialize(): Promise<void> {
  localizeDocument();
  render();
  attachEventListeners();
  const [, current] = await Promise.all([refreshStoredState(), getCurrentLoop()]);
  currentLoop = current.snapshot;
  activeTabId = current.tabId;
  render();
}

function attachEventListeners(): void {
  currentBadge.addEventListener("click", onCurrentBadgeClick);
  currentBookmarkAction.addEventListener("click", onCurrentActionClick);
  editorForm.addEventListener("submit", onSubmitEditor);
  editorName.addEventListener("invalid", (event) => {
    event.preventDefault();
    showEditorValidation("invalidEditorName");
  });
  for (const input of [editorStart, editorEnd]) {
    input.addEventListener("invalid", (event) => {
      event.preventDefault();
      showEditorValidation("invalidEditorBounds", [String(MAX_LOOP_TIME_SECONDS)]);
    });
  }
  editorRate.addEventListener("invalid", (event) => {
    event.preventDefault();
    showEditorValidation("invalidEditorRate");
  });
  closeEditor.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);
  deleteBookmarkButton.addEventListener("click", onDeleteSelectedBookmark);
  openBookmarkButton.addEventListener("click", () =>
    runPopupAction(openSelectedBookmark, editorStatus)
  );
  showWidgetButton.addEventListener("click", () => runPopupAction(showVideoWidget, saveStatus));
  shareCurrentButton.addEventListener("click", () => runPopupAction(shareCurrentLoop, saveStatus));
  document.addEventListener("keydown", onDocumentKeyDown);
  extensionApi?.storage?.onChanged?.addListener(onStorageChanged);
  window.addEventListener("pagehide", () => {
    extensionApi?.storage?.onChanged?.removeListener(onStorageChanged);
  });
}

function onStorageChanged(changes: Record<string, unknown>, areaName: string): void {
  if (areaName !== "local" || !(LIBRARY_STORAGE_KEY in changes)) {
    return;
  }
  runPopupAction(refreshStoredState, libraryStatus);
}

async function refreshStoredState(): Promise<void> {
  const sequence = ++storageLoadSequence;
  const request = loadStoredStateOrThrow();
  try {
    const latestState = await withTimeout(request, STORAGE_TIMEOUT_MS);
    applyLatestStoredState(latestState, sequence);
  } catch (error) {
    if (sequence === storageLoadSequence) {
      showPopupError(libraryStatus, error, "libraryLoadFailed");
    }
    void request.then(
      (latestState) => applyLatestStoredState(latestState, sequence),
      () => undefined
    );
  }
}

function applyLatestStoredState(latestState: StoredState, sequence: number): void {
  if (sequence !== storageLoadSequence) {
    return;
  }
  storedState = latestState;
  if (
    pendingFolderDeleteId &&
    !storedState.folders.some((folder) => folder.id === pendingFolderDeleteId)
  ) {
    pendingFolderDeleteId = null;
  }
  libraryStatus.textContent = "";
  libraryStatus.dataset.error = "false";
  if (selectedBookmarkId && !selectedBookmark()) {
    closeModal();
  }
  renderTree();
  renderCurrentLoop();
}

async function getCurrentLoop(): Promise<{ snapshot: CurrentLoopSnapshot; tabId: number | null }> {
  if (!extensionApi) {
    return { snapshot: { available: false }, tabId: null };
  }
  try {
    const [activeTab] = await withTimeout(
      extensionApi.tabs.query({ active: true, currentWindow: true }),
      ACTIVE_TAB_TIMEOUT_MS
    );
    if (activeTab?.id === undefined) {
      return { snapshot: { available: false }, tabId: null };
    }
    const response = await withTimeout(
      extensionApi.tabs.sendMessage(activeTab.id, {
        type: "get-current-loop"
      }),
      ACTIVE_TAB_TIMEOUT_MS
    );
    return { snapshot: response as CurrentLoopSnapshot, tabId: activeTab.id };
  } catch {
    return { snapshot: { available: false }, tabId: null };
  }
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(
      () => reject(new Error("Extension message timed out.")),
      timeoutMs
    );
    void promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    );
  });
}

interface PopupActionOptions {
  key?: string;
  controls?: (HTMLInputElement | HTMLButtonElement | HTMLSelectElement)[];
}

function runPopupAction(
  action: () => Promise<void>,
  statusElement: HTMLParagraphElement,
  options: PopupActionOptions = {}
): void {
  if (options.key && pendingPopupActions.has(options.key)) {
    return;
  }
  const controlStates =
    options.controls?.map((control) => [control, control.disabled] as const) ?? [];
  if (options.key) {
    pendingPopupActions.add(options.key);
  }
  for (const [control] of controlStates) {
    control.disabled = true;
  }
  let actionPromise: Promise<void>;
  try {
    actionPromise = action();
  } catch (error) {
    actionPromise = Promise.reject(error instanceof Error ? error : new Error(String(error)));
  }
  void withTimeout(actionPromise, POPUP_OPERATION_TIMEOUT_MS)
    .catch((error: unknown) => showPopupError(statusElement, error))
    .finally(() => {
      if (options.key) {
        pendingPopupActions.delete(options.key);
      }
      for (const [control, wasDisabled] of controlStates) {
        control.disabled = wasDisabled;
      }
    });
}

function showPopupError(
  statusElement: HTMLParagraphElement,
  error: unknown,
  messageKey = "operationFailed"
): void {
  console.warn("YT Looper popup operation failed.", error);
  statusElement.textContent = t(messageKey);
  statusElement.dataset.error = "true";
}

function showEditorValidation(messageKey: string, substitutions: string[] = []): void {
  editorStatus.textContent = t(messageKey, substitutions);
  editorStatus.dataset.error = "true";
}

function render(): void {
  renderCurrentLoop();
  renderTree();
  if (editorMode) {
    renderEditor();
  }
}

function renderCurrentLoop(): void {
  currentCard.hidden = !currentLoop.available;
  if (!currentLoop.available) {
    return;
  }

  showWidgetButton.hidden = currentLoop.widgetVisible !== false;
  shareCurrentButton.hidden = true;
  currentSummary.hidden = false;
  saveStatus.textContent = "";
  saveStatus.dataset.error = "false";
  currentContext.hidden = true;
  if (!currentLoop.valid || currentLoop.start === undefined || currentLoop.end === undefined) {
    currentSummary.textContent = t("currentNeedsPoints");
    return;
  }

  const parameters = currentLoop.videoId
    ? {
        videoId: currentLoop.videoId,
        start: currentLoop.start,
        end: currentLoop.end,
        rate: currentLoop.rate ?? 1
      }
    : null;
  const linkedBookmark = resolveBookmarkForLoop(
    storedState,
    currentLoop.bookmarkId,
    parameters,
    currentLoop.detachedBookmarkId
  );
  const sharedUrl = parameters ? buildSharedLoopUrl(parameters) : null;
  shareCurrentButton.hidden = sharedUrl === null;
  currentContext.hidden = false;
  currentSummary.hidden = true;
  const defaultName = createDefaultBookmarkName(
    currentLoop.videoTitle ?? t("fragmentDefault"),
    currentLoop.start,
    currentLoop.end
  );
  if (linkedBookmark && parameters) {
    currentLoop.bookmarkId = linkedBookmark.id;
    currentLoop.bookmarkName = linkedBookmark.name;
    currentBookmarkName.textContent = linkedBookmark.name;
    currentBadge.setAttribute("aria-label", t("editNamedFragment", [linkedBookmark.name]));
    const parametersMatch = bookmarkMatchesParameters(linkedBookmark, parameters);
    currentContext.dataset.state = parametersMatch ? "saved" : "dirty";
    unsavedStateGlyph.toggleAttribute("hidden", true);
    savedCurrentIcon.toggleAttribute("hidden", !parametersMatch);
    savedDirtyIcon.toggleAttribute("hidden", parametersMatch);
    currentBookmarkAction.disabled = parametersMatch;
    currentBookmarkAction.dataset.mode = parametersMatch ? "current" : "update";
    saveCurrentGlyph.toggleAttribute("hidden", true);
    updateCurrentGlyph.toggleAttribute("hidden", parametersMatch);
    currentParametersGlyph.toggleAttribute("hidden", !parametersMatch);
    const updateLabel = t(parametersMatch ? "parametersUpToDate" : "updateParameters");
    currentBookmarkAction.setAttribute("aria-label", updateLabel);
    currentBookmarkAction.title = updateLabel;
    return;
  }
  delete currentLoop.bookmarkId;
  delete currentLoop.bookmarkName;
  currentContext.dataset.state = "unsaved";
  currentBookmarkName.textContent = defaultName;
  currentBadge.setAttribute("aria-label", t("saveNamedFragment", [defaultName]));
  unsavedStateGlyph.toggleAttribute("hidden", false);
  savedCurrentIcon.toggleAttribute("hidden", true);
  savedDirtyIcon.toggleAttribute("hidden", true);
  currentBookmarkAction.disabled = false;
  currentBookmarkAction.dataset.mode = "save";
  saveCurrentGlyph.toggleAttribute("hidden", false);
  updateCurrentGlyph.toggleAttribute("hidden", true);
  currentParametersGlyph.toggleAttribute("hidden", true);
  currentBookmarkAction.setAttribute("aria-label", t("saveFragment"));
  currentBookmarkAction.title = t("saveFragment");
}

function renderTree(): void {
  libraryTree.replaceChildren();
  bookmarkCount.textContent = t(
    storedState.bookmarks.length === 1 ? "fragmentCount" : "fragmentsCount",
    [String(storedState.bookmarks.length)]
  );
  const foldersByParent = groupByParent(storedState.folders, (folder) => folder.parentId);
  const bookmarksByParent = groupByParent(storedState.bookmarks, (bookmark) => bookmark.folderId);
  libraryTree.append(createFolderNode(null, foldersByParent, bookmarksByParent, new Set()));
}

function groupByParent<T>(
  items: T[],
  parentId: (item: T) => string | null
): Map<string | null, T[]> {
  const groups = new Map<string | null, T[]>();
  for (const item of items) {
    const key = parentId(item);
    const group = groups.get(key);
    if (group) {
      group.push(item);
    } else {
      groups.set(key, [item]);
    }
  }
  return groups;
}

function createFolderNode(
  folder: StoredFolder | null,
  foldersByParent: Map<string | null, StoredFolder[]>,
  bookmarksByParent: Map<string | null, StoredBookmark[]>,
  ancestors: Set<string>
): HTMLElement {
  const folderId = folder?.id ?? ROOT_ID;
  const node = document.createElement("div");
  node.className = "tree-node";
  node.setAttribute("role", "listitem");
  const parentId = folder?.id ?? null;
  const childrenFolders = foldersByParent.get(parentId) ?? [];
  const bookmarks = bookmarksByParent.get(parentId) ?? [];
  const hasChildren = childrenFolders.length > 0 || bookmarks.length > 0;
  const expanded = expandedFolderIds.has(folderId);

  const row = document.createElement("div");
  row.className = "tree-row folder-row";
  row.dataset.folderId = folder?.id ?? "";
  row.dataset.folderName = folder?.name ?? t("library");
  const locationName = folder?.name ?? t("library").toLocaleLowerCase();
  const toggle = iconButton(
    "",
    t(expanded ? "collapseFolder" : "expandFolder", [locationName]),
    "tree-toggle"
  );
  toggle.dataset.expanded = String(expanded);
  toggle.dataset.empty = String(!hasChildren);
  toggle.setAttribute("aria-expanded", String(expanded));
  toggle.addEventListener("click", () => toggleFolder(folderId));
  const icon = document.createElement("span");
  icon.className = `folder-icon${folder ? "" : " root-icon"}`;
  const label = document.createElement("button");
  label.type = "button";
  label.className = "tree-label";
  label.textContent = folder?.name ?? t("library");
  label.addEventListener("click", () => toggleFolder(folderId));
  const actions = document.createElement("div");
  actions.className = "tree-actions";
  const add = iconButton("+", t("createFolderInside", [folder?.name ?? t("library")]));
  add.addEventListener("click", () => beginFolderCreation(folder?.id ?? null));
  actions.append(add);
  if (folder) {
    const confirming = pendingFolderDeleteId === folder.id;
    const remove = iconButton(
      confirming ? "✓" : "×",
      t(confirming ? "confirmDeleteFolder" : "deleteFolder", [folder.name]),
      "icon-button danger-icon"
    );
    remove.dataset.confirm = String(confirming);
    remove.addEventListener("click", () => {
      if (!confirming) {
        pendingFolderDeleteId = folder.id;
        libraryStatus.textContent = t("confirmDeleteFolder", [folder.name]);
        libraryStatus.dataset.error = "false";
        renderTree();
        return;
      }
      runPopupAction(() => removeFolder(folder.id), libraryStatus, {
        key: `delete-folder:${folder.id}`,
        controls: [remove]
      });
    });
    actions.append(remove);
  }
  row.append(toggle, icon, label, actions);
  node.append(row);

  if (creatingParentId === (folder?.id ?? null)) {
    node.append(createSubfolderForm(folder?.id ?? null));
  }

  if (expanded) {
    const children = document.createElement("div");
    children.className = "tree-children";
    children.setAttribute("role", "list");
    const nextAncestors = new Set(ancestors);
    if (folder) {
      nextAncestors.add(folder.id);
    }
    for (const childFolder of childrenFolders) {
      if (!nextAncestors.has(childFolder.id)) {
        children.append(
          createFolderNode(childFolder, foldersByParent, bookmarksByParent, nextAncestors)
        );
      }
    }
    for (const bookmark of bookmarks) {
      children.append(createBookmarkNode(bookmark));
    }
    if (!hasChildren && creatingParentId !== (folder?.id ?? null)) {
      const empty = document.createElement("div");
      empty.className = "empty-tree";
      empty.setAttribute("role", "listitem");
      empty.textContent = t("emptyFolder");
      children.append(empty);
    }
    node.append(children);
  }
  return node;
}

function createBookmarkNode(bookmark: StoredBookmark): HTMLElement {
  const row = document.createElement("div");
  row.className = `tree-row bookmark-row${selectedBookmarkId === bookmark.id ? " selected" : ""}`;
  row.dataset.bookmarkId = bookmark.id;
  row.setAttribute("role", "listitem");
  makeBookmarkDraggable(row, bookmark.id);
  const spacer = document.createElement("span");
  const icon = document.createElement("span");
  icon.className = "loop-icon";
  icon.textContent = "∞";
  const label = document.createElement("button");
  label.type = "button";
  label.className = "tree-label";
  const title = document.createElement("span");
  title.textContent = bookmark.name;
  const metadata = document.createElement("small");
  metadata.textContent = `${formatLoopTime(bookmark.start)}–${formatLoopTime(bookmark.end)} · ${bookmark.rate}×`;
  label.append(title, metadata);
  label.addEventListener("click", () => {
    if (row.dataset.suppressClick !== "true") {
      selectBookmark(bookmark.id);
    }
  });
  const actions = document.createElement("div");
  actions.className = "tree-actions";
  const play = iconButton("▶", `${t("open")}: ${bookmark.name}`);
  play.addEventListener("click", () => runPopupAction(() => openBookmark(bookmark), libraryStatus));
  actions.append(play);
  row.append(spacer, icon, label, actions);
  return row;
}

function makeBookmarkDraggable(row: HTMLElement, bookmarkId: string): void {
  let pointerId: number | null = null;
  let originX = 0;
  let originY = 0;
  let dragging = false;

  const clearDropTargets = (): void => {
    for (const target of libraryTree.querySelectorAll(".drop-target")) {
      target.classList.remove("drop-target");
    }
  };
  const dropTargetAt = (x: number, y: number): HTMLElement | null =>
    document.elementFromPoint(x, y)?.closest<HTMLElement>(".folder-row") ?? null;
  const finish = (event: PointerEvent, cancelled: boolean): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    const target = dragging && !cancelled ? dropTargetAt(event.clientX, event.clientY) : null;
    if (dragging) {
      row.dataset.suppressClick = "true";
      window.setTimeout(() => delete row.dataset.suppressClick, 0);
    }
    row.classList.remove("dragging");
    clearDropTargets();
    document.removeEventListener("pointermove", onPointerMove);
    document.removeEventListener("pointerup", onPointerUp);
    document.removeEventListener("pointercancel", onPointerCancel);
    pointerId = null;
    dragging = false;
    if (target) {
      runPopupAction(
        () =>
          moveBookmarkToFolder(
            bookmarkId,
            target.dataset.folderId === "" ? null : (target.dataset.folderId ?? null),
            target.dataset.folderName ?? t("library")
          ),
        libraryStatus,
        { key: `move-bookmark:${bookmarkId}` }
      );
    }
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (pointerId !== event.pointerId) {
      return;
    }
    if (!dragging && Math.hypot(event.clientX - originX, event.clientY - originY) >= 5) {
      dragging = true;
      row.classList.add("dragging");
    }
    if (!dragging) {
      return;
    }
    event.preventDefault();
    clearDropTargets();
    dropTargetAt(event.clientX, event.clientY)?.classList.add("drop-target");
  };
  const onPointerUp = (event: PointerEvent): void => finish(event, false);
  const onPointerCancel = (event: PointerEvent): void => finish(event, true);

  row.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || (event.target as Element | null)?.closest(".tree-actions")) {
      return;
    }
    pointerId = event.pointerId;
    originX = event.clientX;
    originY = event.clientY;
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onPointerUp);
    document.addEventListener("pointercancel", onPointerCancel);
  });
}

async function moveBookmarkToFolder(
  bookmarkId: string,
  folderId: string | null,
  folderName: string
): Promise<void> {
  const bookmark = storedState.bookmarks.find((candidate) => candidate.id === bookmarkId);
  if (!bookmark || bookmark.folderId === folderId) {
    return;
  }
  const result = await mutateStoredState({
    operation: "move-bookmark",
    bookmarkId,
    folderId
  });
  storedState = result.state;
  if (result.status === "missing") {
    render();
    return;
  }
  expandAncestors(folderId);
  render();
  libraryStatus.textContent = t("movedToFolder", [folderName]);
  libraryStatus.dataset.error = "false";
}

function createSubfolderForm(parentId: string | null): HTMLFormElement {
  const form = document.createElement("form");
  form.className = "subfolder-form";
  const input = document.createElement("input");
  input.type = "text";
  input.maxLength = 50;
  input.required = true;
  input.placeholder = t("newFolderName");
  input.setAttribute("aria-label", t("newFolderName"));
  const confirm = iconButton("✓", t("createFolder"));
  confirm.type = "submit";
  const cancel = iconButton("×", t("cancel"), "icon-button close-button");
  cancel.type = "button";
  cancel.addEventListener("click", () => {
    creatingParentId = undefined;
    renderTree();
  });
  form.append(input, confirm, cancel);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    runPopupAction(() => createSubfolder(parentId, input.value), libraryStatus, {
      key: `create-folder:${parentId ?? ROOT_ID}`,
      controls: [input, confirm, cancel]
    });
  });
  queueMicrotask(() => input.focus());
  return form;
}

function renderEditor(): void {
  editorSheet.dataset.mode = editorMode ?? "edit";
  editorStatus.textContent = "";
  editorStatus.dataset.error = "false";
  deleteBookmarkButton.replaceChildren(createTrashGlyph(), document.createTextNode(t("delete")));
  deleteBookmarkButton.dataset.confirm = "false";
  if (editorMode === "create") {
    editorBaseline = null;
    if (!currentLoop.valid || currentLoop.start === undefined || currentLoop.end === undefined) {
      closeModal();
      return;
    }
    editorHeading.textContent = t("saveFragment");
    editorKicker.textContent = t("reviewFragment");
    editorName.value = createDefaultBookmarkName(
      currentLoop.videoTitle ?? t("fragmentDefault"),
      currentLoop.start,
      currentLoop.end
    );
    editorStart.value = String(normalizeLoopTime(currentLoop.start));
    editorEnd.value = String(normalizeLoopTime(currentLoop.end));
    editorRate.value = String(currentLoop.rate ?? 1);
    editorStart.readOnly = true;
    editorEnd.readOnly = true;
    editorRate.readOnly = true;
    renderFolderSelect(editorFolder, "");
    deleteBookmarkButton.hidden = true;
    openBookmarkButton.hidden = true;
    submitEditorLabel.textContent = t("saveFragment");
    editorSubmitMark.setAttribute("d", "M12 7v6M9 10h6");
    return;
  }
  const bookmark = selectedBookmark();
  if (!bookmark) {
    closeModal();
    return;
  }
  editorHeading.textContent = t("editFragment");
  editorKicker.textContent = t("fragmentDetails");
  editorName.value = bookmark.name;
  editorStart.value = String(normalizeLoopTime(bookmark.start));
  editorEnd.value = String(normalizeLoopTime(bookmark.end));
  editorRate.value = String(bookmark.rate);
  editorStart.readOnly = false;
  editorEnd.readOnly = false;
  editorRate.readOnly = false;
  renderFolderSelect(editorFolder, bookmark.folderId ?? "");
  editorBaseline = {
    name: bookmark.name,
    folderId: bookmark.folderId,
    start: bookmark.start,
    end: bookmark.end,
    rate: bookmark.rate
  };
  deleteBookmarkButton.hidden = false;
  openBookmarkButton.hidden = false;
  submitEditorLabel.textContent = t("saveChanges");
  editorSubmitMark.setAttribute("d", "m9 10 2 2 4-4");
}

function renderFolderSelect(select: HTMLSelectElement, selectedValue: string): void {
  const fragment = document.createDocumentFragment();
  fragment.append(option(t("rootLibrary"), ""));
  const foldersByParent = groupByParent(storedState.folders, (folder) => folder.parentId);
  const stack = [...(foldersByParent.get(null) ?? [])]
    .reverse()
    .map((folder) => ({ folder, depth: 1 }));
  const visited = new Set<string>();
  while (stack.length > 0) {
    const entry = stack.pop();
    if (!entry || visited.has(entry.folder.id)) {
      continue;
    }
    visited.add(entry.folder.id);
    const visibleDepth = Math.min(entry.depth, 8);
    const depthMarker = `${"— ".repeat(visibleDepth)}${entry.depth > visibleDepth ? "… " : ""}`;
    fragment.append(option(`${depthMarker}${entry.folder.name}`, entry.folder.id));
    const children = foldersByParent.get(entry.folder.id) ?? [];
    for (let index = children.length - 1; index >= 0; index -= 1) {
      stack.push({ folder: children[index]!, depth: entry.depth + 1 });
    }
  }
  select.replaceChildren(fragment);
  select.value = [...select.options].some((item) => item.value === selectedValue)
    ? selectedValue
    : "";
}

function toggleFolder(folderId: string): void {
  pendingFolderDeleteId = null;
  if (expandedFolderIds.has(folderId)) {
    expandedFolderIds.delete(folderId);
  } else {
    expandedFolderIds.add(folderId);
  }
  renderTree();
}

function beginFolderCreation(parentId: string | null): void {
  pendingFolderDeleteId = null;
  creatingParentId = parentId;
  expandedFolderIds.add(parentId ?? ROOT_ID);
  renderTree();
}

async function createSubfolder(parentId: string | null, name: string): Promise<void> {
  if (!name.trim()) {
    return;
  }
  const result = await mutateStoredState({ operation: "create-folder", name, parentId });
  storedState = result.state;
  creatingParentId = undefined;
  render();
}

async function removeFolder(folderId: string): Promise<void> {
  selectedBookmarkId = null;
  const result = await mutateStoredState({ operation: "delete-folder", folderId });
  storedState = result.state;
  pendingFolderDeleteId = null;
  expandedFolderIds.delete(folderId);
  render();
}

function selectBookmark(bookmarkId: string | null): void {
  if (!bookmarkId) {
    closeModal();
    return;
  }
  openEditModal(bookmarkId);
}

function selectedBookmark(): StoredBookmark | null {
  return storedState.bookmarks.find((bookmark) => bookmark.id === selectedBookmarkId) ?? null;
}

function onCurrentBadgeClick(): void {
  if (currentContext.dataset.state === "unsaved") {
    openCreateModal();
    return;
  }
  if (currentLoop.bookmarkId) {
    openEditModal(currentLoop.bookmarkId);
  }
}

function onCurrentActionClick(): void {
  if (currentBookmarkAction.dataset.mode === "save") {
    openCreateModal();
  } else if (currentBookmarkAction.dataset.mode === "update") {
    runPopupAction(onUpdateCurrentBookmark, saveStatus, {
      key: "update-current-bookmark",
      controls: [currentBookmarkAction]
    });
  }
}

function openCreateModal(): void {
  editorMode = "create";
  selectedBookmarkId = null;
  editorBaseline = null;
  showModal();
}

function openEditModal(bookmarkId: string): void {
  if (!storedState.bookmarks.some((bookmark) => bookmark.id === bookmarkId)) {
    return;
  }
  editorMode = "edit";
  selectedBookmarkId = bookmarkId;
  renderTree();
  showModal();
}

function showModal(): void {
  if (modalCloseTimer !== null) {
    window.clearTimeout(modalCloseTimer);
    modalCloseTimer = null;
  }
  renderEditor();
  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  appHeader.inert = true;
  appMain.inert = true;
  editorModal.hidden = false;
  window.requestAnimationFrame(() => {
    editorModal.dataset.open = "true";
    window.requestAnimationFrame(() => editorName.focus());
  });
}

function closeModal(): void {
  delete editorModal.dataset.open;
  editorMode = null;
  selectedBookmarkId = null;
  editorBaseline = null;
  appHeader.inert = false;
  appMain.inert = false;
  renderTree();
  const returnFocus = modalReturnFocus;
  modalReturnFocus = null;
  queueMicrotask(() => {
    if (returnFocus?.isConnected) {
      returnFocus.focus();
    } else {
      libraryTree.querySelector<HTMLButtonElement>("button")?.focus();
    }
  });
  if (modalCloseTimer !== null) {
    window.clearTimeout(modalCloseTimer);
  }
  modalCloseTimer = window.setTimeout(() => {
    editorModal.hidden = true;
    modalCloseTimer = null;
  }, 210);
}

function onDocumentKeyDown(event: KeyboardEvent): void {
  if (event.key === "Escape" && !editorModal.hidden) {
    event.preventDefault();
    closeModal();
    return;
  }
  if (event.key === "Tab" && !editorModal.hidden) {
    const focusable = [
      ...editorSheet.querySelectorAll<HTMLElement>("button, input, select")
    ].filter((item) => !item.hasAttribute("disabled") && !item.hidden && item.tabIndex !== -1);
    const first = focusable[0];
    const last = focusable.at(-1);
    if (!first || !last) {
      return;
    }
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }
}

function onSubmitEditor(event: SubmitEvent): void {
  event.preventDefault();
  if (editorMode === "create") {
    runPopupAction(onSaveBookmark, editorStatus, {
      key: "editor-submit",
      controls: [submitEditorButton]
    });
  } else {
    runPopupAction(onUpdateBookmark, editorStatus, {
      key: "editor-submit",
      controls: [submitEditorButton]
    });
  }
}

async function onSaveBookmark(): Promise<void> {
  if (
    !currentLoop.valid ||
    !currentLoop.videoId ||
    currentLoop.start === undefined ||
    currentLoop.end === undefined
  ) {
    return;
  }
  const name = editorName.value.trim();
  if (!name) {
    return;
  }
  const result = await mutateStoredState({
    operation: "create-bookmark",
    input: {
      name,
      folderId: editorFolder.value || null,
      videoId: currentLoop.videoId,
      videoTitle: currentLoop.videoTitle ?? t("youtubeVideo"),
      start: currentLoop.start,
      end: currentLoop.end,
      rate: currentLoop.rate ?? 1
    }
  });
  storedState = result.state;
  if (result.status !== "created" || !result.entityId) {
    editorStatus.textContent = t("alreadySaved");
    editorStatus.dataset.error = "true";
    return;
  }
  const createdId = result.entityId;
  currentLoop.bookmarkId = createdId;
  currentLoop.bookmarkName = name;
  expandAncestors(editorFolder.value || null);
  closeModal();
  render();
  saveStatus.textContent = t("savedFragment");
}

async function onUpdateCurrentBookmark(): Promise<void> {
  if (
    !currentLoop.bookmarkId ||
    !currentLoop.videoId ||
    currentLoop.start === undefined ||
    currentLoop.end === undefined
  ) {
    return;
  }
  const bookmark = storedState.bookmarks.find(
    (candidate) => candidate.id === currentLoop.bookmarkId
  );
  if (!bookmark) {
    delete currentLoop.bookmarkId;
    delete currentLoop.bookmarkName;
    renderCurrentLoop();
    return;
  }
  const rate = clampRate(currentLoop.rate ?? 1);
  const result = await mutateStoredState({
    operation: "update-bookmark-parameters",
    bookmarkId: bookmark.id,
    parameters: {
      start: currentLoop.start,
      end: currentLoop.end,
      rate
    }
  });
  storedState = result.state;
  if (result.status === "duplicate") {
    saveStatus.textContent = t("duplicateFragment");
    saveStatus.dataset.error = "true";
    return;
  }
  if (result.status === "missing") {
    delete currentLoop.bookmarkId;
    delete currentLoop.bookmarkName;
    renderCurrentLoop();
    return;
  }
  saveStatus.textContent = t("parametersUpdated");
  saveStatus.dataset.error = "false";
  renderTree();
  renderCurrentLoop();
  saveStatus.textContent = t("parametersUpdated");
}

async function onUpdateBookmark(): Promise<void> {
  const bookmark = selectedBookmark();
  if (!bookmark || !editorBaseline) {
    return;
  }
  const start = normalizeLoopTime(editorStart.valueAsNumber);
  const end = normalizeLoopTime(editorEnd.valueAsNumber);
  const rate = clampRate(editorRate.valueAsNumber);
  const segmentValidation = validateSegment(start, end);
  if (!editorName.value.trim() || !segmentValidation.valid) {
    showEditorValidation(
      segmentValidation.reason === "tooShort" ? "invalidEditorSegment" : "invalidEditorBounds",
      [String(segmentValidation.reason === "tooShort" ? MIN_LOOP_SECONDS : MAX_LOOP_TIME_SECONDS)]
    );
    return;
  }
  const name = editorName.value.trim();
  const folderId = editorFolder.value || null;
  const changes: BookmarkPatch = {};
  if (name !== editorBaseline.name) changes.name = name;
  if (folderId !== editorBaseline.folderId) changes.folderId = folderId;
  if (start !== editorBaseline.start) changes.start = start;
  if (end !== editorBaseline.end) changes.end = end;
  if (rate !== editorBaseline.rate) changes.rate = rate;
  if (Object.keys(changes).length === 0) {
    editorStatus.textContent = t("changesSaved");
    editorStatus.dataset.error = "false";
    return;
  }
  const result = await mutateStoredState({
    operation: "update-bookmark",
    bookmarkId: bookmark.id,
    changes
  });
  storedState = result.state;
  if (result.status === "duplicate") {
    editorStatus.textContent = t("duplicateFragment");
    editorStatus.dataset.error = "true";
    return;
  }
  if (result.status === "missing") {
    closeModal();
    render();
    return;
  }
  const updatedBookmark = result.state.bookmarks.find((candidate) => candidate.id === bookmark.id);
  expandAncestors(updatedBookmark?.folderId ?? null);
  if (currentLoop.bookmarkId === bookmark.id) {
    currentLoop.bookmarkName = updatedBookmark?.name ?? name;
  }
  render();
  editorStatus.textContent = t("changesSaved");
}

async function shareCurrentLoop(): Promise<void> {
  if (!currentLoop.videoId || currentLoop.start === undefined || currentLoop.end === undefined) {
    return;
  }
  const url = buildSharedLoopUrl({
    videoId: currentLoop.videoId,
    start: currentLoop.start,
    end: currentLoop.end,
    rate: currentLoop.rate ?? 1
  });
  const copied = url ? await copyText(url) : false;
  saveStatus.textContent = t(copied ? "linkCopied" : "copyFailed");
  saveStatus.dataset.error = String(!copied);
}

function onDeleteSelectedBookmark(): void {
  const bookmark = selectedBookmark();
  if (!bookmark) {
    return;
  }
  if (deleteBookmarkButton.dataset.confirm !== "true") {
    deleteBookmarkButton.dataset.confirm = "true";
    deleteBookmarkButton.replaceChildren(
      createTrashGlyph(),
      document.createTextNode(t("confirmDelete"))
    );
    return;
  }
  runPopupAction(
    async () => {
      const result = await mutateStoredState({
        operation: "delete-bookmark",
        bookmarkId: bookmark.id
      });
      storedState = result.state;
      closeModal();
      render();
    },
    editorStatus,
    { key: "delete-bookmark", controls: [deleteBookmarkButton] }
  );
}

async function openSelectedBookmark(): Promise<void> {
  const bookmark = selectedBookmark();
  if (bookmark) {
    await openBookmark(bookmark);
  }
}

async function openBookmark(bookmark: StoredBookmark): Promise<void> {
  if (!extensionApi) {
    return;
  }
  await extensionApi.tabs.create({ url: buildBookmarkUrl(bookmark) });
  window.close();
}

async function showVideoWidget(): Promise<void> {
  if (!extensionApi || activeTabId === null) {
    return;
  }
  await extensionApi.tabs.sendMessage(activeTabId, { type: "show-widget" });
  currentLoop.widgetVisible = true;
  showWidgetButton.hidden = true;
}

function expandAncestors(folderId: string | null): void {
  expandedFolderIds.add(ROOT_ID);
  const visited = new Set<string>();
  let currentId = folderId;
  while (currentId && !visited.has(currentId)) {
    visited.add(currentId);
    expandedFolderIds.add(currentId);
    currentId = storedState.folders.find((folder) => folder.id === currentId)?.parentId ?? null;
  }
}

function iconButton(text: string, label: string, className = "icon-button"): HTMLButtonElement {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = text;
  button.setAttribute("aria-label", label);
  button.title = label;
  return button;
}

function createTrashGlyph(): HTMLSpanElement {
  const glyph = document.createElement("span");
  glyph.className = "trash-glyph";
  glyph.setAttribute("aria-hidden", "true");
  return glyph;
}

function option(label: string, value: string): HTMLOptionElement {
  const item = document.createElement("option");
  item.textContent = label;
  item.value = value;
  return item;
}

function element<T extends Element>(id: string): T {
  const found = document.getElementById(id);
  if (!found) {
    throw new Error(`Popup element not found: ${id}`);
  }
  return found as unknown as T;
}
