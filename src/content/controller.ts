import { LoopEngine, MIN_LOOP_SECONDS, type LoopValidation } from "../core/loop-engine";
import {
  addBookmark,
  bookmarkMatchesParameters,
  findEquivalentBookmark
} from "../library/bookmarks";
import { createDefaultBookmarkName } from "../library/bookmark-names";
import { t } from "../platform/i18n";
import { copyText } from "../platform/clipboard";
import { loadStoredState, updateStoredState, type StoredState } from "../platform/storage";
import {
  findYouTubeContext,
  isAdPlaying,
  observeYouTubeNavigation,
  type YouTubeContext
} from "../sites/youtube";
import { LoopPanel, type PanelActions } from "../ui/panel";
import {
  buildSharedLoopUrl,
  readSharedLoopFromUrl,
  sharedLoopFitsDuration
} from "../sharing/loop-links";
import { getLoopRequestKey, selectInitialLoop } from "./initial-loop";
import {
  consumeCapturedLoopRequestUrl,
  peekCapturedLoopRequestUrl
} from "../sharing/early-capture";

interface ActiveSession extends YouTubeContext {
  engine: LoopEngine;
  panel: LoopPanel;
  adObserver: MutationObserver;
  onRateChange: () => void;
  onLoadedMetadata: () => void;
  render: () => void;
  sharedLoop: boolean;
  requestKey: string;
}

export interface CurrentLoopSnapshot {
  available: boolean;
  videoId?: string;
  videoTitle?: string;
  start?: number;
  end?: number;
  rate?: number;
  valid?: boolean;
  widgetVisible?: boolean;
  bookmarkId?: string;
  bookmarkName?: string;
  shared?: boolean;
  detachedBookmarkId?: string;
}

export class YtLooperController {
  #storedState: StoredState | null = null;
  #active: ActiveSession | null = null;
  #stopNavigationObserver: (() => void) | null = null;
  #linkedBookmarkId: string | null = null;
  #detachedBookmarkId: string | null = null;
  readonly #dismissedVideoIds = new Set<string>();
  #destroyed = false;

  async start(): Promise<void> {
    this.#storedState = await loadStoredState();
    if (this.#destroyed) {
      return;
    }
    this.#stopNavigationObserver = observeYouTubeNavigation(() => this.refresh());
    document.addEventListener("keydown", this.#onKeyDown);
    this.refresh();
  }

  refresh(): void {
    if (this.#destroyed || !this.#storedState) {
      return;
    }
    const context = findYouTubeContext();
    if (!context) {
      this.#detach();
      return;
    }
    const capturedRequestUrl = peekCapturedLoopRequestUrl();
    const requestUrl = capturedRequestUrl ?? location.href;
    const requestKey = getLoopRequestKey(requestUrl);
    const hasExplicitRequest = requestKey !== "|";
    if (
      this.#active?.video === context.video &&
      this.#active.videoId === context.videoId &&
      (!hasExplicitRequest || this.#active.requestKey === requestKey)
    ) {
      if (capturedRequestUrl && this.#active.requestKey === requestKey) {
        consumeCapturedLoopRequestUrl();
      }
      return;
    }
    this.#attach(context, requestKey, capturedRequestUrl);
  }

  getCurrentLoop(): CurrentLoopSnapshot {
    const active = this.#active;
    if (!active) {
      return { available: false };
    }
    const state = active.engine.state;
    const linkedBookmark = this.#storedState?.bookmarks.find(
      (bookmark) => bookmark.id === this.#linkedBookmarkId
    );
    return {
      available: true,
      videoId: active.videoId,
      videoTitle: this.#videoTitle(),
      rate: state.rate,
      valid: active.engine.validation().valid,
      widgetVisible: active.panel.visible,
      shared: active.sharedLoop,
      ...(state.start === null ? {} : { start: state.start }),
      ...(state.end === null ? {} : { end: state.end }),
      ...(linkedBookmark
        ? {
            bookmarkId: linkedBookmark.id,
            bookmarkName: linkedBookmark.name
          }
        : {}),
      ...(this.#detachedBookmarkId ? { detachedBookmarkId: this.#detachedBookmarkId } : {})
    };
  }

  showWidget(): boolean {
    if (!this.#active) {
      return false;
    }
    this.#dismissedVideoIds.delete(this.#active.videoId);
    this.#active.panel.show();
    return true;
  }

  async reloadStoredState(): Promise<void> {
    this.#storedState = await loadStoredState();
    this.#active?.render();
  }

  destroy(): void {
    this.#destroyed = true;
    this.#detach();
    this.#detachedBookmarkId = null;
    this.#stopNavigationObserver?.();
    this.#stopNavigationObserver = null;
    document.removeEventListener("keydown", this.#onKeyDown);
  }

  #attach(context: YouTubeContext, requestKey: string, capturedRequestUrl: string | null): void {
    this.#detach();
    const storedState = this.#storedState;
    if (!storedState) {
      return;
    }

    const blocked = (): boolean => isAdPlaying(context.player);
    const engine = new LoopEngine(context.video, { shouldBlock: blocked });
    const requestUrl = capturedRequestUrl ?? location.href;
    const decodedSharedLoop = readSharedLoopFromUrl(requestUrl);
    const sharedLoop = decodedSharedLoop?.i === context.videoId ? decodedSharedLoop : null;
    const requestedBookmarkId = new URL(requestUrl).searchParams.get("ytl_bookmark");
    if (capturedRequestUrl) {
      consumeCapturedLoopRequestUrl();
    }
    const requestedBookmark = sharedLoop
      ? undefined
      : storedState.bookmarks.find(
          (bookmark) => bookmark.id === requestedBookmarkId && bookmark.videoId === context.videoId
        );
    this.#linkedBookmarkId = requestedBookmark?.id ?? null;
    const initialLoop = selectInitialLoop(
      sharedLoop,
      requestedBookmark,
      storedState.loops[context.videoId],
      storedState.settings.rate
    );
    if (initialLoop) {
      engine.setSegment(initialLoop.start, initialLoop.end);
    }
    engine.setRate(initialLoop?.rate ?? storedState.settings.rate);
    engine.setPreservesPitch(true);

    // The render closure is created before the panel and invoked only after construction.
    // eslint-disable-next-line prefer-const
    let panel!: LoopPanel;
    const render = (): void => {
      const loopState = engine.state;
      const latestState = this.#storedState ?? storedState;
      const valid = engine.validation().valid;
      const detectedEquivalentBookmark =
        valid && loopState.start !== null && loopState.end !== null
          ? findEquivalentBookmark(latestState, {
              videoId: context.videoId,
              start: loopState.start,
              end: loopState.end,
              rate: loopState.rate
            })
          : null;
      const equivalentBookmark =
        detectedEquivalentBookmark?.id === this.#detachedBookmarkId
          ? null
          : detectedEquivalentBookmark;
      if (equivalentBookmark) {
        this.#linkedBookmarkId = equivalentBookmark.id;
      } else if (
        this.#linkedBookmarkId &&
        !latestState.bookmarks.some((bookmark) => bookmark.id === this.#linkedBookmarkId)
      ) {
        this.#linkedBookmarkId = null;
      }
      const linkedBookmark =
        latestState.bookmarks.find((bookmark) => bookmark.id === this.#linkedBookmarkId) ?? null;
      const parametersMatch = Boolean(
        linkedBookmark &&
        loopState.start !== null &&
        loopState.end !== null &&
        bookmarkMatchesParameters(linkedBookmark, {
          videoId: context.videoId,
          start: loopState.start,
          end: loopState.end,
          rate: loopState.rate
        })
      );
      panel.update({
        ...loopState,
        adPlaying: blocked(),
        canSave: valid,
        canShare:
          valid &&
          buildSharedLoopUrl({
            videoId: context.videoId,
            start: loopState.start ?? Number.NaN,
            end: loopState.end ?? Number.NaN,
            rate: loopState.rate
          }) !== null,
        savedBookmarkId: linkedBookmark?.id ?? null,
        savedBookmarkName: linkedBookmark?.name ?? "",
        parametersMatch
      });
    };

    const persistLoop = (): void => {
      const state = engine.state;
      this.#mutateStoredState((latestState) => {
        if (state.start !== null && state.end !== null && engine.validation().valid) {
          latestState.loops[context.videoId] = { start: state.start, end: state.end };
        } else {
          delete latestState.loops[context.videoId];
        }
      });
    };
    const setStart = (value: number | null): void => {
      engine.setStart(value);
      persistLoop();
      render();
    };
    const setEnd = (value: number | null): void => {
      engine.setEnd(value);
      persistLoop();
      render();
    };

    const actions: PanelActions = {
      setStartNow: () => {
        setStart(context.video.currentTime);
        panel.showMessage(t("pointAMarked"));
      },
      setEndNow: () => {
        setEnd(context.video.currentTime);
        panel.showMessage(t("pointBMarked"));
      },
      setStart,
      setEnd,
      adjustStart: (delta) => setStart((engine.state.start ?? context.video.currentTime) + delta),
      adjustEnd: (delta) => setEnd((engine.state.end ?? context.video.currentTime) + delta),
      setRate: (rate) => {
        const appliedRate = engine.setRate(rate);
        this.#mutateStoredState((latestState) => {
          latestState.settings.rate = appliedRate;
        });
        render();
        panel.showMessage(t("speedSet", [String(appliedRate)]));
      },
      toggleLoop: () => {
        const nextEnabled = !engine.state.enabled;
        const result = engine.setEnabled(nextEnabled);
        render();
        panel.showMessage(
          result.valid
            ? t(nextEnabled ? "loopActivated" : "loopStopped")
            : this.#validationMessage(result),
          !result.valid
        );
      },
      dismiss: () => {
        this.#dismissedVideoIds.add(context.videoId);
        panel.hide();
      },
      detachBookmark: () => {
        if (!this.#linkedBookmarkId) {
          return;
        }
        this.#detachedBookmarkId = this.#linkedBookmarkId;
        this.#linkedBookmarkId = null;
        render();
        panel.showMessage(t("bookmarkDetached"));
      },
      shareLoop: async () => {
        const loopState = engine.state;
        if (loopState.start === null || loopState.end === null || !engine.validation().valid) {
          return false;
        }
        const url = buildSharedLoopUrl({
          videoId: context.videoId,
          start: loopState.start,
          end: loopState.end,
          rate: loopState.rate
        });
        return url ? copyText(url) : false;
      },
      saveCurrentLoop: async () => {
        const loopState = engine.state;
        if (loopState.start === null || loopState.end === null || !engine.validation().valid) {
          return false;
        }
        let savedBookmarkId: string | null = null;
        const latestState = await updateStoredState((state) => {
          if (
            findEquivalentBookmark(state, {
              videoId: context.videoId,
              start: loopState.start!,
              end: loopState.end!,
              rate: loopState.rate
            })
          ) {
            return;
          }
          const bookmark = addBookmark(state, {
            name: createDefaultBookmarkName(
              this.#videoTitle() || t("fragmentDefault"),
              loopState.start!,
              loopState.end!
            ),
            folderId: null,
            videoId: context.videoId,
            videoTitle: this.#videoTitle(),
            start: loopState.start!,
            end: loopState.end!,
            rate: loopState.rate
          });
          savedBookmarkId = bookmark.id;
        });
        this.#storedState = latestState;
        if (savedBookmarkId) {
          this.#linkedBookmarkId = savedBookmarkId;
          this.#detachedBookmarkId = null;
        }
        render();
        return savedBookmarkId !== null;
      },
      updateBookmarkParameters: async () => {
        const bookmarkId = this.#linkedBookmarkId;
        const loopState = engine.state;
        if (
          !bookmarkId ||
          loopState.start === null ||
          loopState.end === null ||
          !engine.validation().valid
        ) {
          return "missing";
        }
        let result: "updated" | "duplicate" | "missing" = "missing";
        const latestState = await updateStoredState((state) => {
          const bookmark = state.bookmarks.find((candidate) => candidate.id === bookmarkId);
          if (!bookmark) {
            return;
          }
          if (
            findEquivalentBookmark(
              state,
              {
                videoId: context.videoId,
                start: loopState.start!,
                end: loopState.end!,
                rate: loopState.rate
              },
              bookmarkId
            )
          ) {
            result = "duplicate";
            return;
          }
          bookmark.start = loopState.start!;
          bookmark.end = loopState.end!;
          bookmark.rate = loopState.rate;
          result = "updated";
        });
        this.#storedState = latestState;
        if (result === "missing") {
          this.#linkedBookmarkId = null;
        }
        render();
        return result;
      }
    };

    panel = new LoopPanel(context.player, actions, initialLoop !== null);
    if (this.#dismissedVideoIds.has(context.videoId)) {
      panel.hide();
    }

    const onRateChange = (): void => {
      if (blocked() || Math.abs(context.video.playbackRate - engine.state.rate) < 0.001) {
        return;
      }
      const appliedRate = engine.setRate(context.video.playbackRate);
      this.#mutateStoredState((latestState) => {
        latestState.settings.rate = appliedRate;
      });
      render();
    };
    let bookmarkActivated = false;
    const onLoadedMetadata = (): void => {
      const sharedLoopInRange =
        !sharedLoop || sharedLoopFitsDuration(sharedLoop, context.video.duration);
      if (initialLoop && sharedLoopInRange) {
        engine.setSegment(initialLoop.start, initialLoop.end);
      } else if (!sharedLoopInRange) {
        engine.setSegment(null, null);
      }
      engine.applyPlaybackSettings();
      if ((requestedBookmark || sharedLoop) && !bookmarkActivated) {
        bookmarkActivated = true;
        if (!sharedLoopInRange) {
          panel.showMessage(t("validationOutOfRange"), true);
        } else {
          context.video.currentTime = sharedLoop?.a ?? requestedBookmark!.start;
          const enabled = engine.setEnabled(true);
          if (enabled.valid) {
            void context.video.play().catch(() => panel.showMessage(t("loopLoadedPressPlay")));
            panel.showMessage(
              sharedLoop ? t("sharedLoopLoaded") : t("bookmarkLoaded", [requestedBookmark!.name])
            );
          } else {
            panel.showMessage(this.#validationMessage(enabled), true);
          }
        }
      }
      render();
    };
    context.video.addEventListener("ratechange", onRateChange);
    context.video.addEventListener("loadedmetadata", onLoadedMetadata);

    let wasAdPlaying = blocked();
    const adObserver = new MutationObserver(() => {
      const adPlaying = blocked();
      if (wasAdPlaying && !adPlaying) {
        engine.applyPlaybackSettings();
        panel.showMessage(t("loopReady"));
      }
      wasAdPlaying = adPlaying;
      render();
    });
    adObserver.observe(context.player, { attributes: true, attributeFilter: ["class"] });

    this.#active = {
      ...context,
      engine,
      panel,
      adObserver,
      onRateChange,
      onLoadedMetadata,
      render,
      sharedLoop: Boolean(sharedLoop),
      requestKey
    };
    if (context.video.readyState >= HTMLMediaElement.HAVE_METADATA) {
      onLoadedMetadata();
    } else {
      render();
    }
  }

  #detach(): void {
    const active = this.#active;
    if (!active) {
      return;
    }
    active.adObserver.disconnect();
    active.video.removeEventListener("ratechange", active.onRateChange);
    active.video.removeEventListener("loadedmetadata", active.onLoadedMetadata);
    active.engine.destroy();
    active.panel.destroy();
    this.#active = null;
    this.#linkedBookmarkId = null;
    this.#detachedBookmarkId = null;
  }

  readonly #onKeyDown = (event: KeyboardEvent): void => {
    if (!this.#active || event.repeat || !event.altKey || !event.shiftKey) {
      return;
    }
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLTextAreaElement ||
      (target instanceof HTMLElement && target.isContentEditable)
    ) {
      return;
    }

    if (event.code === "KeyA") {
      event.preventDefault();
      this.#active.panel.showMessage(t("pointAMarked"));
      this.#active.engine.setStart(this.#active.video.currentTime);
    } else if (event.code === "KeyB") {
      event.preventDefault();
      this.#active.panel.showMessage(t("pointBMarked"));
      this.#active.engine.setEnd(this.#active.video.currentTime);
    } else if (event.code === "KeyL") {
      event.preventDefault();
      const nextEnabled = !this.#active.engine.state.enabled;
      const result = this.#active.engine.setEnabled(nextEnabled);
      this.#active.panel.showMessage(
        result.valid
          ? t(nextEnabled ? "loopActivated" : "loopStopped")
          : this.#validationMessage(result),
        !result.valid
      );
    } else {
      return;
    }

    const state = this.#active.engine.state;
    this.#active.render();
    if (state.start !== null && state.end !== null && this.#active.engine.validation().valid) {
      const videoId = this.#active.videoId;
      this.#mutateStoredState((latestState) => {
        latestState.loops[videoId] = { start: state.start!, end: state.end! };
      });
    }
  };

  #mutateStoredState(mutator: (state: StoredState) => void): void {
    void updateStoredState(mutator).then((state) => {
      this.#storedState = state;
      this.#active?.render();
    });
  }

  #videoTitle(): string {
    return document.title.replace(/\s*-\s*YouTube\s*$/i, "").trim();
  }

  #validationMessage(validation: LoopValidation): string {
    switch (validation.reason) {
      case "missing":
        return t("validationMissing");
      case "invalid":
        return t("validationInvalid");
      case "tooShort":
        return t("validationTooShort", [String(MIN_LOOP_SECONDS)]);
      case "outOfRange":
        return t("validationOutOfRange");
      default:
        return t("loopUnavailable");
    }
  }
}
