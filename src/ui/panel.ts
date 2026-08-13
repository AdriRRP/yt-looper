import type { LoopState } from "../core/loop-engine";
import { localizeDocument, t } from "../platform/i18n";
import { PanelCollapseState } from "./panel-collapse";

export interface PanelActions {
  setStartNow(): void;
  setEndNow(): void;
  setStart(value: number | null): void;
  setEnd(value: number | null): void;
  adjustStart(delta: number): void;
  adjustEnd(delta: number): void;
  setRate(value: number): void;
  toggleLoop(): void;
  dismiss(): void;
  detachBookmark(): void;
  shareLoop(): Promise<boolean>;
  saveCurrentLoop(): Promise<boolean>;
  updateBookmarkParameters(): Promise<"updated" | "duplicate" | "missing">;
}

export interface PanelViewModel extends LoopState {
  adPlaying: boolean;
  canSave: boolean;
  canShare: boolean;
  savedBookmarkId: string | null;
  savedBookmarkName: string;
  parametersMatch: boolean;
}

const styles = `
  :host {
    all: initial;
    position: absolute;
    z-index: 2147483646;
    top: 10px;
    right: 10px;
    color: #f7f7f7;
    font-family: Roboto, Arial, sans-serif;
    font-size: 12px;
    line-height: 1.25;
    pointer-events: auto;
  }
  :host([data-hidden="true"]) { display: none !important; }
  * { box-sizing: border-box; }
  button, input { font: inherit; }
  button { cursor: pointer; }
  .panel {
    width: 268px;
    overflow: hidden;
    border: 1px solid rgba(255, 255, 255, .15);
    border-radius: 11px;
    background: rgba(18, 18, 18, .94);
    box-shadow: 0 7px 24px rgba(0, 0, 0, .42);
    backdrop-filter: blur(10px);
  }
  .header {
    display: flex;
    min-height: 34px;
    align-items: center;
    gap: 5px;
    padding: 5px 7px;
  }
  .brand {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 6px;
    min-width: 0;
    border: 0;
    padding: 0;
    color: inherit;
    background: transparent;
    text-align: left;
  }
  .mark {
    display: grid;
    width: 22px;
    height: 22px;
    flex: 0 0 auto;
    place-items: center;
    border-radius: 6px;
    background: #d10f2f;
    color: white;
    font-size: 15px;
    font-weight: 700;
  }
  .brand-copy { min-width: 0; }
  .title { font-weight: 700; }
  .summary {
    display: block;
    overflow: hidden;
    color: #b5b5b8;
    font-size: 10px;
    font-variant-numeric: tabular-nums;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .header-button {
    display: grid;
    width: 24px;
    height: 24px;
    place-items: center;
    border: 0;
    border-radius: 6px;
    color: #c8c9cc;
    background: transparent;
  }
  .header-button:hover { background: rgba(255, 255, 255, .1); }
  .dismiss { display: grid; color: white; background: #d10f2f; }
  .dismiss:hover { background: #b90d2a; }
  .share-header { color: white; background: #2f7df6; }
  .share-header:hover { background: #4a90ff; }
  .share-header[hidden] { display: none; }
  .share-glyph { width: 14px; height: 14px; overflow: visible; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .collapse { color: white; background: #6757d9; }
  .collapse:hover { background: #7969ec; }
  .collapse-glyph { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 2; stroke-linecap: round; stroke-linejoin: round; transition: transform .18s ease; }
  .body { padding: 1px 8px 8px; }
  .panel[data-collapsed="true"] { width: 166px; }
  .panel[data-collapsed="true"] .body { display: none; }
  .panel[data-collapsed="true"] .collapse-glyph { transform: rotate(180deg); }
  .panel[data-collapsed="true"] .dismiss { display: none; }
  .panel[data-ad="true"] .body { display: none; }
  .ad-loading {
    display: grid;
    min-height: 132px;
    place-items: center;
    align-content: center;
    gap: 10px;
    border-top: 1px solid rgba(255, 255, 255, .08);
    padding: 18px 12px 20px;
    color: #c9cacf;
    font-size: 10px;
    text-align: center;
  }
  .ad-loading[hidden] { display: none; }
  .ad-spinner {
    width: 25px;
    height: 25px;
    border: 2.5px solid rgba(255, 255, 255, .16);
    border-top-color: #ff5b70;
    border-radius: 50%;
    animation: ad-spin .75s linear infinite;
  }
  @keyframes ad-spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .ad-spinner { animation: none; border-top-color: #ff5b70; }
  }
  .time-row {
    display: grid;
    grid-template-columns: 14px 1fr auto;
    align-items: center;
    gap: 5px;
    margin: 5px 0;
  }
  .point { color: #ff8190; font-weight: 800; }
  input {
    width: 100%;
    min-width: 0;
    height: 28px;
    border: 1px solid #44464b;
    border-radius: 7px;
    padding: 0 7px;
    color: white;
    background: #242529;
    font-variant-numeric: tabular-nums;
  }
  input:focus { border-color: #ff5b70; }
  button:focus-visible, input:focus-visible { outline: 2px solid #8db7ff; outline-offset: 2px; }
  .button-group { display: flex; gap: 3px; }
  .small-button, .capture-button, .action-button {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    border: 0;
    border-radius: 7px;
    color: #f5f5f5;
    background: #34363b;
  }
  .small-button, .capture-button { width: 26px; height: 28px; padding: 0; }
  .small-button:hover, .capture-button:hover, .action-button:hover { background: #484a50; }
  .capture-icon {
    width: 10px;
    height: 10px;
    border: 1.5px solid currentColor;
    border-radius: 50%;
    box-shadow: inset 0 0 0 2px #34363b;
    background: currentColor;
  }
  .settings-row {
    display: grid;
    grid-template-columns: auto 1fr;
    align-items: center;
    gap: 7px;
    margin: 7px 0;
  }
  .action-row { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 5px; }
  .action-row:has(.persist-button[hidden]) { grid-template-columns: 1fr; }
  .action-button { height: 31px; padding: 0 8px; font-weight: 700; }
  .persist-button { width: 38px; padding: 0; }
  .persist-button[hidden] { display: none; }
  .persist-button[data-mode="update"] { color: #1e1609; background: #f0a43c; }
  .persist-button[data-mode="update"]:hover { background: #ffb957; }
  .persist-button[data-mode="current"] { color: #14251b; background: #79d39c; cursor: default; }
  .persist-button:disabled { opacity: .72; }
  .loop-button { background: #d10f2f; }
  .loop-button:hover { background: #b90d2a; }
  .loop-button[data-enabled="true"] { color: #181818; background: #e4e4e4; }
  .persist-icon { display: grid; place-items: center; }
  .persist-icon[hidden] { display: none; }
  .persist-icon svg, .state-glyph { width: 16px; height: 16px; overflow: visible; fill: none; stroke: currentColor; stroke-width: 1.8; stroke-linecap: round; stroke-linejoin: round; }
  .state-glyph[hidden] { display: none; }
  .saved-check .state-glyph { width: 11px; height: 11px; }
  .loop-glyph { font-size: 17px; line-height: 1; }
  .saved-banner {
    display: flex;
    min-width: 0;
    align-items: center;
    gap: 6px;
    margin: 3px 0 7px;
    border: 1px solid rgba(121, 211, 156, .28);
    border-radius: 8px;
    padding: 5px 7px;
    color: #bce9cd;
    background: rgba(58, 151, 94, .14);
  }
  .saved-banner[hidden] { display: none; }
  .saved-banner[data-dirty="true"] { border-color: rgba(240, 164, 60, .4); color: #ffd9a1; background: rgba(240, 164, 60, .14); }
  .saved-banner strong { min-width: 0; flex: 1; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
  .saved-detach {
    display: grid;
    width: 18px;
    height: 18px;
    flex: 0 0 auto;
    place-items: center;
    border: 0;
    border-radius: 5px;
    padding: 0;
    color: #ff8b9a;
    background: rgba(255, 41, 69, .12);
    font-size: 14px;
    line-height: 1;
  }
  .saved-detach:hover { color: white; background: #ff2945; }
  .saved-check { display: grid; width: 15px; height: 15px; flex: 0 0 auto; place-items: center; border-radius: 50%; color: #132319; background: #79d39c; font-size: 10px; font-weight: 900; }
  .saved-banner[data-dirty="true"] .saved-check { color: #271a08; background: #f0a43c; }
  .status {
    min-height: 14px;
    margin-top: 4px;
    color: #9fa1a6;
    font-size: 9px;
    text-align: center;
  }
  .status[data-error="true"] { color: #ff8190; }
  .status[data-ad="true"] { color: #ffd166; }
`;

const panelMarkup = `
  <section class="panel" data-collapsed="false" aria-label="YT Looper">
    <header class="header">
      <button class="brand" type="button" data-action="collapse">
        <span class="mark">∞</span>
        <span class="brand-copy"><span class="title">YT Looper</span><span class="summary">1×</span></span>
      </button>
      <button class="header-button share-header" type="button" data-action="share" data-i18n-aria-label="shareLoop" data-i18n-title="shareLoop"><svg class="share-glyph" viewBox="0 0 24 24" aria-hidden="true"><circle cx="18" cy="5" r="2.5"></circle><circle cx="6" cy="12" r="2.5"></circle><circle cx="18" cy="19" r="2.5"></circle><path d="m8.2 10.8 7.6-4.5M8.2 13.2l7.6 4.5"></path></svg></button>
      <button class="header-button dismiss" type="button" data-action="dismiss" data-i18n-aria-label="widgetHide" data-i18n-title="widgetHide">×</button>
      <button class="header-button collapse" type="button" data-action="collapse" data-i18n-aria-label="widgetMinimize"><svg class="collapse-glyph" viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 14.5 5.5-5 5.5 5"></path></svg></button>
    </header>
    <div class="ad-loading" role="status" aria-live="polite" hidden>
      <span class="ad-spinner" aria-hidden="true"></span>
      <span data-i18n="waitingForAd">Esperando a que termine el anuncio…</span>
    </div>
    <div class="body">
      <div class="saved-banner" data-dirty="false" hidden><span class="saved-check"><svg class="state-glyph saved-current-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="m6.5 12.5 3.5 3.5 7.5-8"></path></svg><svg class="state-glyph saved-dirty-icon" viewBox="0 0 24 24" aria-hidden="true" hidden><path d="m14.8 5.2 4 4M5 19l3.8-.8L18 8.9a1.8 1.8 0 0 0-4-4L4.8 14Z"></path><path d="m12.8 7.2 4 4"></path></svg></span><strong class="saved-banner-name"></strong><button class="saved-detach" type="button" data-action="detach" data-i18n-aria-label="detachSavedLoop" data-i18n-title="detachSavedLoop">×</button></div>
      <div class="time-row">
        <span class="point">A</span>
        <input data-field="start" type="number" min="0" step="0.001" placeholder="0.000" aria-label="A">
        <div class="button-group">
          <button class="small-button" type="button" data-action="start-back" data-i18n-title="widgetStartBack" aria-label="− A">−</button>
          <button class="capture-button" type="button" data-action="start-now" data-i18n-title="widgetSetStart" data-i18n-aria-label="widgetSetStart"><span class="capture-icon"></span></button>
          <button class="small-button" type="button" data-action="start-forward" data-i18n-title="widgetStartForward" aria-label="+ A">+</button>
        </div>
      </div>
      <div class="time-row">
        <span class="point">B</span>
        <input data-field="end" type="number" min="0" step="0.001" placeholder="0.000" aria-label="B">
        <div class="button-group">
          <button class="small-button" type="button" data-action="end-back" data-i18n-title="widgetEndBack" aria-label="− B">−</button>
          <button class="capture-button" type="button" data-action="end-now" data-i18n-title="widgetSetEnd" data-i18n-aria-label="widgetSetEnd"><span class="capture-icon"></span></button>
          <button class="small-button" type="button" data-action="end-forward" data-i18n-title="widgetEndForward" aria-label="+ B">+</button>
        </div>
      </div>
      <div class="settings-row">
        <label for="ytl-rate" data-i18n="speed">Velocidad</label>
        <input id="ytl-rate" data-field="rate" type="number" min="0.25" max="4" step="0.05" value="1">
      </div>
      <div class="action-row">
        <button class="action-button persist-button" type="button" data-action="persist" data-mode="save" data-i18n-aria-label="widgetSave" data-i18n-title="widgetSave"><span class="persist-icon persist-save-icon"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21Z"></path><path d="M12 7v6M9 10h6"></path></svg></span><span class="persist-icon persist-update-icon" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 4.8A1.8 1.8 0 0 1 7.8 3h8.4A1.8 1.8 0 0 1 18 4.8V21l-6-3.8L6 21Z"></path><path d="M12 6.5v7M9.5 11l2.5 2.5 2.5-2.5"></path></svg></span><span class="persist-icon persist-current-icon" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8"></circle><path d="m8.5 12 2.3 2.3 4.8-5"></path></svg></span></button>
        <button class="action-button loop-button" type="button" data-action="toggle" data-enabled="false"><span class="loop-glyph">↻</span><span class="loop-label"></span></button>
      </div>
      <div class="status" role="status"></div>
    </div>
  </section>
`;

export class LoopPanel {
  readonly #host: HTMLDivElement;
  readonly #root: ShadowRoot;
  readonly #actions: PanelActions;
  readonly #collapseState: PanelCollapseState;
  #model: PanelViewModel = {
    start: null,
    end: null,
    enabled: false,
    rate: 1,
    preservesPitch: true,
    adPlaying: false,
    canSave: false,
    canShare: false,
    savedBookmarkId: null,
    savedBookmarkName: "",
    parametersMatch: false
  };
  #messageTimer: number | null = null;

  constructor(player: HTMLElement, actions: PanelActions, hasInitialParameters: boolean) {
    this.#actions = actions;
    this.#collapseState = new PanelCollapseState(hasInitialParameters);
    document.getElementById("yt-looper-root")?.remove();
    this.#host = document.createElement("div");
    this.#host.id = "yt-looper-root";
    this.#root = this.#host.attachShadow({ mode: "open" });
    const style = document.createElement("style");
    style.textContent = styles;
    const parsedPanel = new DOMParser().parseFromString(panelMarkup, "text/html");
    this.#root.append(style);
    for (const node of [...parsedPanel.body.childNodes]) {
      this.#root.append(document.importNode(node, true));
    }
    localizeDocument(this.#root);
    this.#root.addEventListener("click", this.#onClick);
    this.#root.addEventListener("input", this.#onInput);
    this.#root.addEventListener("keydown", this.#stopInputShortcutPropagation);
    this.#root.addEventListener("keyup", this.#stopInputShortcutPropagation);
    this.#root.addEventListener("keypress", this.#stopInputShortcutPropagation);
    this.#setCollapsed(this.#collapseState.collapsed);
    player.append(this.#host);
    this.#setDefaultStatus();
  }

  update(model: PanelViewModel): void {
    this.#model = model;
    const panel = this.#element<HTMLElement>(".panel");
    const startInput = this.#element<HTMLInputElement>('[data-field="start"]');
    const endInput = this.#element<HTMLInputElement>('[data-field="end"]');
    const rateInput = this.#element<HTMLInputElement>('[data-field="rate"]');
    const loopButton = this.#element<HTMLButtonElement>('[data-action="toggle"]');
    const loopLabel = this.#element<HTMLElement>(".loop-label");
    const loopGlyph = this.#element<HTMLElement>(".loop-glyph");
    const shareButton = this.#element<HTMLButtonElement>('[data-action="share"]');
    const adLoading = this.#element<HTMLElement>(".ad-loading");
    const savedBanner = this.#element<HTMLElement>(".saved-banner");
    const savedBannerName = this.#element<HTMLElement>(".saved-banner-name");
    const savedCurrentIcon = this.#element<SVGElement>(".saved-current-icon");
    const savedDirtyIcon = this.#element<SVGElement>(".saved-dirty-icon");
    const persistButton = this.#element<HTMLButtonElement>('[data-action="persist"]');
    const persistSaveIcon = this.#element<HTMLElement>(".persist-save-icon");
    const persistUpdateIcon = this.#element<HTMLElement>(".persist-update-icon");
    const persistCurrentIcon = this.#element<HTMLElement>(".persist-current-icon");
    const summary = this.#element<HTMLElement>(".summary");

    this.#setCollapsed(this.#collapseState.syncParameters(model.start, model.end));

    if (this.#root.activeElement !== startInput) {
      startInput.value = model.start === null ? "" : model.start.toFixed(3);
    }
    if (this.#root.activeElement !== endInput) {
      endInput.value = model.end === null ? "" : model.end.toFixed(3);
    }
    if (this.#root.activeElement !== rateInput) {
      rateInput.value = String(Number(model.rate.toFixed(2)));
    }
    loopButton.dataset.enabled = String(model.enabled);
    loopLabel.textContent = t(model.enabled ? "widgetStop" : "widgetActivate");
    loopGlyph.textContent = model.enabled ? "■" : "↻";
    summary.textContent = `${Number(model.rate.toFixed(2))}× · ${model.enabled ? t("loopActivated") : t("loopStopped")}`;
    panel.dataset.ad = String(model.adPlaying);
    panel.setAttribute("aria-busy", String(model.adPlaying));
    adLoading.hidden = !model.adPlaying;
    shareButton.hidden = !model.canShare || model.adPlaying;

    const hasLinkedBookmark = Boolean(model.savedBookmarkId && model.savedBookmarkName);
    const dirty = hasLinkedBookmark && !model.parametersMatch;
    savedBanner.hidden = !hasLinkedBookmark;
    savedBanner.dataset.dirty = String(dirty);
    savedBannerName.textContent = model.savedBookmarkName;
    savedCurrentIcon.toggleAttribute("hidden", dirty);
    savedDirtyIcon.toggleAttribute("hidden", !dirty);

    persistButton.hidden = !model.canSave && !hasLinkedBookmark;
    persistButton.disabled = !model.canSave || (hasLinkedBookmark && model.parametersMatch);
    const persistMode = !hasLinkedBookmark ? "save" : dirty ? "update" : "current";
    persistButton.dataset.mode = persistMode;
    persistSaveIcon.hidden = persistMode !== "save";
    persistUpdateIcon.hidden = persistMode !== "update";
    persistCurrentIcon.hidden = persistMode !== "current";
    const persistLabel = t(
      persistMode === "save"
        ? "widgetSave"
        : persistMode === "update"
          ? "updateParameters"
          : "parametersUpToDate"
    );
    persistButton.setAttribute("aria-label", persistLabel);
    persistButton.title = persistLabel;

    if (model.adPlaying) {
      this.showMessage(t("pausedDuringAd"), false, true);
    }
  }

  showMessage(message: string, error = false, ad = false): void {
    const status = this.#element<HTMLElement>(".status");
    status.textContent = message;
    status.dataset.error = String(error);
    status.dataset.ad = String(ad);
    if (this.#messageTimer !== null) {
      window.clearTimeout(this.#messageTimer);
    }
    if (!ad) {
      this.#messageTimer = window.setTimeout(() => this.#setDefaultStatus(), 2200);
    }
  }

  hide(): void {
    this.#host.dataset.hidden = "true";
  }

  show(): void {
    delete this.#host.dataset.hidden;
  }

  get visible(): boolean {
    return this.#host.dataset.hidden !== "true";
  }

  destroy(): void {
    if (this.#messageTimer !== null) {
      window.clearTimeout(this.#messageTimer);
    }
    this.#root.removeEventListener("click", this.#onClick);
    this.#root.removeEventListener("input", this.#onInput);
    this.#root.removeEventListener("keydown", this.#stopInputShortcutPropagation);
    this.#root.removeEventListener("keyup", this.#stopInputShortcutPropagation);
    this.#root.removeEventListener("keypress", this.#stopInputShortcutPropagation);
    this.#host.remove();
  }

  readonly #onClick = (event: Event): void => {
    const button = (event.target as Element | null)?.closest<HTMLButtonElement>(
      "button[data-action]"
    );
    if (!button) {
      return;
    }
    switch (button.dataset.action) {
      case "collapse":
        this.#toggleCollapsed();
        break;
      case "dismiss":
        this.#actions.dismiss();
        break;
      case "detach":
        this.#actions.detachBookmark();
        break;
      case "share":
        void this.#shareLoop();
        break;
      case "start-now":
        this.#actions.setStartNow();
        break;
      case "end-now":
        this.#actions.setEndNow();
        break;
      case "start-back":
        this.#actions.adjustStart(-0.1);
        break;
      case "start-forward":
        this.#actions.adjustStart(0.1);
        break;
      case "end-back":
        this.#actions.adjustEnd(-0.1);
        break;
      case "end-forward":
        this.#actions.adjustEnd(0.1);
        break;
      case "toggle":
        this.#actions.toggleLoop();
        break;
      case "persist":
        void this.#persistLoop();
        break;
    }
  };

  readonly #onInput = (event: Event): void => {
    const input = event.target;
    if (!(input instanceof HTMLInputElement)) {
      return;
    }
    switch (input.dataset.field) {
      case "start":
        this.#actions.setStart(this.#numberOrNull(input.value));
        break;
      case "end":
        this.#actions.setEnd(this.#numberOrNull(input.value));
        break;
      case "rate":
        this.#actions.setRate(input.valueAsNumber);
        break;
    }
  };

  readonly #stopInputShortcutPropagation = (event: Event): void => {
    if (event.target instanceof HTMLInputElement) {
      event.stopPropagation();
    }
  };

  #toggleCollapsed(): void {
    this.#setCollapsed(this.#collapseState.toggle());
  }

  #setCollapsed(collapsed: boolean): void {
    const panel = this.#element<HTMLElement>(".panel");
    panel.dataset.collapsed = String(collapsed);
    const collapseButton = this.#element<HTMLButtonElement>(".collapse");
    collapseButton.setAttribute("aria-label", t(collapsed ? "widgetExpand" : "widgetMinimize"));
    collapseButton.title = t(collapsed ? "widgetExpand" : "widgetMinimize");
  }

  async #persistLoop(): Promise<void> {
    try {
      if (!this.#model.savedBookmarkId) {
        const saved = await this.#actions.saveCurrentLoop();
        this.showMessage(t(saved ? "savedFragment" : "duplicateFragment"), !saved);
        return;
      }
      const result = await this.#actions.updateBookmarkParameters();
      this.showMessage(
        t(
          result === "updated"
            ? "parametersUpdated"
            : result === "duplicate"
              ? "duplicateFragment"
              : "loopUnavailable"
        ),
        result !== "updated"
      );
    } catch (error) {
      console.warn("YT Looper could not persist the loop.", error);
      this.showMessage(t("operationFailed"), true);
    }
  }

  async #shareLoop(): Promise<void> {
    try {
      const copied = await this.#actions.shareLoop();
      this.showMessage(t(copied ? "linkCopied" : "copyFailed"), !copied);
    } catch (error) {
      console.warn("YT Looper could not share the loop.", error);
      this.showMessage(t("operationFailed"), true);
    }
  }

  #setDefaultStatus(): void {
    const status = this.#element<HTMLElement>(".status");
    status.textContent = t("shortcutsHint");
    status.dataset.error = "false";
    status.dataset.ad = "false";
  }

  #element<T extends Element>(selector: string): T {
    const element = this.#root.querySelector<T>(selector);
    if (!element) {
      throw new Error(`YT Looper panel element not found: ${selector}`);
    }
    return element;
  }

  #numberOrNull(value: string): number | null {
    if (value.trim() === "") {
      return null;
    }
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
  }
}
