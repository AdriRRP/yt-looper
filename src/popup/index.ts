import { MIN_LOOP_SECONDS, clampRate } from "../core/loop-engine";
import type { CurrentLoopSnapshot } from "../content/controller";
import { createDefaultBookmarkName, formatLoopTime } from "../library/bookmark-names";
import {
  addBookmark,
  addFolder,
  bookmarkMatchesParameters,
  buildBookmarkUrl,
  deleteBookmark,
  deleteFolder,
  findEquivalentBookmark,
  resolveBookmarkForLoop,
  updateBookmark
} from "../library/bookmarks";
import { localizeDocument, t } from "../platform/i18n";
import { copyText } from "../platform/clipboard";
import { buildSharedLoopUrl } from "../sharing/loop-links";
import {
  createDefaultState,
  loadStoredState,
  updateStoredState,
  type StoredBookmark,
  type StoredFolder,
  type StoredState
} from "../platform/storage";

interface BrowserTab {
  id?: number;
}
interface PopupExtensionApi {
  tabs: {
    query(query: { active: boolean; currentWindow: boolean }): Promise<BrowserTab[]>;
    sendMessage(tabId: number, message: unknown): Promise<unknown>;
    create(properties: { url: string }): Promise<BrowserTab>;
  };
}

const ROOT_ID = "__root__";
const extensionGlobal = globalThis as typeof globalThis & {
  browser?: PopupExtensionApi;
  chrome?: PopupExtensionApi;
};
const extensionApi = extensionGlobal.browser ?? extensionGlobal.chrome;

const currentCard = element<HTMLElement>("current-card");
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
const submitEditorLabel = element<HTMLElement>("submit-editor-label");
const editorSubmitMark = element<SVGPathElement>("editor-submit-mark");

let storedState: StoredState = createDefaultState();
let currentLoop: CurrentLoopSnapshot = { available: false };
let activeTabId: number | null = null;
let selectedBookmarkId: string | null = null;
let creatingParentId: string | null | undefined;
let editorMode: "create" | "edit" | null = null;
let modalCloseTimer: number | null = null;
const expandedFolderIds = new Set<string>([ROOT_ID]);

export const popupReady = initialize();

async function initialize(): Promise<void> {
  localizeDocument();
  storedState = await loadStoredState();
  for (const folder of storedState.folders) {
    expandedFolderIds.add(folder.id);
  }
  const current = await getCurrentLoop();
  currentLoop = current.snapshot;
  activeTabId = current.tabId;
  render();
  currentBadge.addEventListener("click", onCurrentBadgeClick);
  currentBookmarkAction.addEventListener("click", onCurrentActionClick);
  editorForm.addEventListener("submit", onSubmitEditor);
  closeEditor.addEventListener("click", closeModal);
  modalBackdrop.addEventListener("click", closeModal);
  deleteBookmarkButton.addEventListener("click", onDeleteSelectedBookmark);
  openBookmarkButton.addEventListener("click", () => void openSelectedBookmark());
  showWidgetButton.addEventListener("click", () => void showVideoWidget());
  shareCurrentButton.addEventListener("click", () => void shareCurrentLoop());
  document.addEventListener("keydown", onDocumentKeyDown);
}

async function getCurrentLoop(): Promise<{ snapshot: CurrentLoopSnapshot; tabId: number | null }> {
  if (!extensionApi) {
    return { snapshot: { available: false }, tabId: null };
  }
  try {
    const [activeTab] = await extensionApi.tabs.query({ active: true, currentWindow: true });
    if (activeTab?.id === undefined) {
      return { snapshot: { available: false }, tabId: null };
    }
    const response = await extensionApi.tabs.sendMessage(activeTab.id, {
      type: "get-current-loop"
    });
    return { snapshot: response as CurrentLoopSnapshot, tabId: activeTab.id };
  } catch {
    return { snapshot: { available: false }, tabId: null };
  }
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
  libraryTree.append(createFolderNode(null));
}

function createFolderNode(folder: StoredFolder | null): HTMLElement {
  const folderId = folder?.id ?? ROOT_ID;
  const node = document.createElement("div");
  node.className = "tree-node";
  const childrenFolders = storedState.folders.filter(
    (candidate) => candidate.parentId === (folder?.id ?? null)
  );
  const bookmarks = storedState.bookmarks.filter(
    (bookmark) => bookmark.folderId === (folder?.id ?? null)
  );
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
    const remove = iconButton("×", t("deleteFolder", [folder.name]), "icon-button danger-icon");
    remove.addEventListener("click", () => void removeFolder(folder.id));
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
    for (const childFolder of childrenFolders) {
      children.append(createFolderNode(childFolder));
    }
    for (const bookmark of bookmarks) {
      children.append(createBookmarkNode(bookmark));
    }
    if (!hasChildren && creatingParentId !== (folder?.id ?? null)) {
      const empty = document.createElement("div");
      empty.className = "empty-tree";
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
  play.addEventListener("click", () => void openBookmark(bookmark));
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
      void moveBookmarkToFolder(
        bookmarkId,
        target.dataset.folderId === "" ? null : (target.dataset.folderId ?? null),
        target.dataset.folderName ?? t("library")
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
  storedState = await updateStoredState((state) => {
    const latestBookmark = state.bookmarks.find((candidate) => candidate.id === bookmarkId);
    if (latestBookmark) {
      latestBookmark.folderId = folderId;
    }
  });
  expandAncestors(folderId);
  render();
  editorStatus.textContent = t("movedToFolder", [folderName]);
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
  form.addEventListener("submit", (event) => void createSubfolder(event, parentId, input.value));
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
    editorStart.value = String(currentLoop.start);
    editorEnd.value = String(currentLoop.end);
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
  editorStart.value = String(bookmark.start);
  editorEnd.value = String(bookmark.end);
  editorRate.value = String(bookmark.rate);
  editorStart.readOnly = false;
  editorEnd.readOnly = false;
  editorRate.readOnly = false;
  renderFolderSelect(editorFolder, bookmark.folderId ?? "");
  deleteBookmarkButton.hidden = false;
  openBookmarkButton.hidden = false;
  submitEditorLabel.textContent = t("saveChanges");
  editorSubmitMark.setAttribute("d", "m9 10 2 2 4-4");
}

function renderFolderSelect(select: HTMLSelectElement, selectedValue: string): void {
  select.replaceChildren(option(t("rootLibrary"), ""));
  appendFolderOptions(select, null, 0, new Set());
  select.value = [...select.options].some((item) => item.value === selectedValue)
    ? selectedValue
    : "";
}

function appendFolderOptions(
  select: HTMLSelectElement,
  parentId: string | null,
  depth: number,
  visited: Set<string>
): void {
  for (const folder of storedState.folders.filter((candidate) => candidate.parentId === parentId)) {
    if (visited.has(folder.id)) {
      continue;
    }
    visited.add(folder.id);
    select.append(option(`${"— ".repeat(depth + 1)}${folder.name}`, folder.id));
    appendFolderOptions(select, folder.id, depth + 1, visited);
  }
}

function toggleFolder(folderId: string): void {
  if (expandedFolderIds.has(folderId)) {
    expandedFolderIds.delete(folderId);
  } else {
    expandedFolderIds.add(folderId);
  }
  renderTree();
}

function beginFolderCreation(parentId: string | null): void {
  creatingParentId = parentId;
  expandedFolderIds.add(parentId ?? ROOT_ID);
  renderTree();
}

async function createSubfolder(event: Event, parentId: string | null, name: string): Promise<void> {
  event.preventDefault();
  if (!name.trim()) {
    return;
  }
  storedState = await updateStoredState((state) => addFolder(state, name, parentId));
  creatingParentId = undefined;
  render();
}

async function removeFolder(folderId: string): Promise<void> {
  selectedBookmarkId = null;
  storedState = await updateStoredState((state) => deleteFolder(state, folderId));
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
    void onUpdateCurrentBookmark();
  }
}

function openCreateModal(): void {
  editorMode = "create";
  selectedBookmarkId = null;
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
  renderTree();
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
  }
}

function onSubmitEditor(event: SubmitEvent): void {
  if (editorMode === "create") {
    void onSaveBookmark(event);
  } else {
    void onUpdateBookmark(event);
  }
}

async function onSaveBookmark(event: SubmitEvent): Promise<void> {
  event.preventDefault();
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
  let createdId = "";
  storedState = await updateStoredState((state) => {
    if (
      findEquivalentBookmark(state, {
        videoId: currentLoop.videoId!,
        start: currentLoop.start!,
        end: currentLoop.end!,
        rate: currentLoop.rate ?? 1
      })
    ) {
      return;
    }
    const bookmark = addBookmark(state, {
      name,
      folderId: editorFolder.value || null,
      videoId: currentLoop.videoId!,
      videoTitle: currentLoop.videoTitle ?? t("youtubeVideo"),
      start: currentLoop.start!,
      end: currentLoop.end!,
      rate: currentLoop.rate ?? 1
    });
    createdId = bookmark.id;
  });
  if (!createdId) {
    editorStatus.textContent = t("alreadySaved");
    editorStatus.dataset.error = "true";
    return;
  }
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
  if (
    findEquivalentBookmark(
      storedState,
      {
        videoId: currentLoop.videoId,
        start: currentLoop.start,
        end: currentLoop.end,
        rate
      },
      bookmark.id
    )
  ) {
    saveStatus.textContent = t("duplicateFragment");
    saveStatus.dataset.error = "true";
    return;
  }
  storedState = await updateStoredState((state) => {
    const latestBookmark = state.bookmarks.find((candidate) => candidate.id === bookmark.id);
    if (latestBookmark) {
      latestBookmark.start = currentLoop.start!;
      latestBookmark.end = currentLoop.end!;
      latestBookmark.rate = rate;
    }
  });
  saveStatus.textContent = t("parametersUpdated");
  saveStatus.dataset.error = "false";
  renderTree();
  renderCurrentLoop();
  saveStatus.textContent = t("parametersUpdated");
}

async function onUpdateBookmark(event: SubmitEvent): Promise<void> {
  event.preventDefault();
  const bookmark = selectedBookmark();
  if (!bookmark) {
    return;
  }
  const start = editorStart.valueAsNumber;
  const end = editorEnd.valueAsNumber;
  const rate = clampRate(editorRate.valueAsNumber);
  if (
    !editorName.value.trim() ||
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end - start < MIN_LOOP_SECONDS
  ) {
    editorStatus.textContent = t("invalidEditorSegment", [String(MIN_LOOP_SECONDS)]);
    editorStatus.dataset.error = "true";
    return;
  }
  if (
    findEquivalentBookmark(
      storedState,
      {
        videoId: bookmark.videoId,
        start,
        end,
        rate
      },
      bookmark.id
    )
  ) {
    editorStatus.textContent = t("duplicateFragment");
    editorStatus.dataset.error = "true";
    return;
  }
  storedState = await updateStoredState((state) => {
    updateBookmark(state, bookmark.id, {
      name: editorName.value,
      folderId: editorFolder.value || null,
      start,
      end,
      rate
    });
  });
  expandAncestors(editorFolder.value || null);
  if (currentLoop.bookmarkId === bookmark.id) {
    currentLoop.bookmarkName = editorName.value.trim();
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
  void (async () => {
    storedState = await updateStoredState((state) => deleteBookmark(state, bookmark.id));
    closeModal();
    render();
  })();
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
