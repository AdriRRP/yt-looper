export const MIN_LOOP_SECONDS = 0.05;
export const MIN_PLAYBACK_RATE = 0.25;
export const MAX_PLAYBACK_RATE = 4;

export interface LoopMedia extends EventTarget {
  currentTime: number;
  duration: number;
  paused: boolean;
  playbackRate: number;
  preservesPitch?: boolean;
  requestVideoFrameCallback?: (callback: () => void) => number;
  cancelVideoFrameCallback?: (handle: number) => void;
}

export interface LoopState {
  start: number | null;
  end: number | null;
  enabled: boolean;
  rate: number;
  preservesPitch: boolean;
}

export interface LoopValidation {
  valid: boolean;
  reason?: "missing" | "invalid" | "tooShort" | "outOfRange";
}

interface LoopEngineOptions {
  shouldBlock?: () => boolean;
  autoMonitor?: boolean;
}

export function clampRate(rate: number): number {
  if (!Number.isFinite(rate)) {
    return 1;
  }

  return Math.min(MAX_PLAYBACK_RATE, Math.max(MIN_PLAYBACK_RATE, rate));
}

export function validateSegment(
  start: number | null,
  end: number | null,
  duration = Number.POSITIVE_INFINITY
): LoopValidation {
  if (start === null || end === null) {
    return { valid: false, reason: "missing" };
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0) {
    return { valid: false, reason: "invalid" };
  }

  if (end - start < MIN_LOOP_SECONDS) {
    return { valid: false, reason: "tooShort" };
  }

  if (Number.isFinite(duration) && end > duration + 0.01) {
    return { valid: false, reason: "outOfRange" };
  }

  return { valid: true };
}

export class LoopEngine {
  readonly #media: LoopMedia;
  readonly #shouldBlock: () => boolean;
  readonly #autoMonitor: boolean;
  #state: LoopState = {
    start: null,
    end: null,
    enabled: false,
    rate: 1,
    preservesPitch: true
  };
  #scheduledHandle: number | null = null;
  #scheduledWithVideo = false;
  #generation = 0;

  constructor(media: LoopMedia, options: LoopEngineOptions = {}) {
    this.#media = media;
    this.#shouldBlock = options.shouldBlock ?? (() => false);
    this.#autoMonitor = options.autoMonitor ?? true;
    this.#media.addEventListener("timeupdate", this.#onTimeUpdate);
  }

  get state(): Readonly<LoopState> {
    return { ...this.#state };
  }

  setStart(value: number | null): void {
    this.#state.start = this.#normalizeTime(value);
    this.#disableIfInvalid();
  }

  setEnd(value: number | null): void {
    this.#state.end = this.#normalizeTime(value);
    this.#disableIfInvalid();
  }

  setSegment(start: number | null, end: number | null): void {
    this.#state.start = this.#normalizeTime(start);
    this.#state.end = this.#normalizeTime(end);
    this.#disableIfInvalid();
  }

  validation(): LoopValidation {
    return validateSegment(this.#state.start, this.#state.end, this.#media.duration);
  }

  setEnabled(enabled: boolean): LoopValidation {
    if (enabled) {
      const validation = this.validation();
      if (!validation.valid) {
        this.#state.enabled = false;
        return validation;
      }
    }

    this.#state.enabled = enabled;
    this.#generation += 1;
    this.#cancelScheduledCheck();

    if (enabled && this.#autoMonitor) {
      this.#scheduleCheck(this.#generation);
    }

    return { valid: true };
  }

  setRate(rate: number): number {
    const normalizedRate = clampRate(rate);
    this.#state.rate = normalizedRate;
    if (!this.#shouldBlock()) {
      this.#media.playbackRate = normalizedRate;
    }
    return normalizedRate;
  }

  setPreservesPitch(preservesPitch: boolean): void {
    this.#state.preservesPitch = preservesPitch;
    if (!this.#shouldBlock() && "preservesPitch" in this.#media) {
      this.#media.preservesPitch = preservesPitch;
    }
  }

  applyPlaybackSettings(): void {
    if (this.#shouldBlock()) {
      return;
    }
    this.#media.playbackRate = this.#state.rate;
    if ("preservesPitch" in this.#media) {
      this.#media.preservesPitch = this.#state.preservesPitch;
    }
  }

  checkNow(): boolean {
    if (!this.#state.enabled || this.#shouldBlock()) {
      return false;
    }

    const validation = this.validation();
    if (!validation.valid || this.#state.start === null || this.#state.end === null) {
      this.setEnabled(false);
      return false;
    }

    if (this.#media.currentTime >= this.#state.end) {
      this.#media.currentTime = this.#state.start;
      return true;
    }

    return false;
  }

  destroy(): void {
    this.setEnabled(false);
    this.#media.removeEventListener("timeupdate", this.#onTimeUpdate);
  }

  readonly #onTimeUpdate = (): void => {
    this.checkNow();
  };

  #normalizeTime(value: number | null): number | null {
    if (value === null || !Number.isFinite(value)) {
      return null;
    }

    const duration = this.#media.duration;
    const upperBound = Number.isFinite(duration) ? duration : Number.POSITIVE_INFINITY;
    return Math.min(upperBound, Math.max(0, value));
  }

  #disableIfInvalid(): void {
    if (this.#state.enabled && !this.validation().valid) {
      this.setEnabled(false);
    }
  }

  #scheduleCheck(generation: number): void {
    if (!this.#state.enabled || generation !== this.#generation) {
      return;
    }

    const callback = (): void => {
      this.#scheduledHandle = null;
      if (!this.#state.enabled || generation !== this.#generation) {
        return;
      }
      this.checkNow();
      this.#scheduleCheck(generation);
    };

    if (typeof this.#media.requestVideoFrameCallback === "function") {
      this.#scheduledWithVideo = true;
      this.#scheduledHandle = this.#media.requestVideoFrameCallback(callback);
      return;
    }

    this.#scheduledWithVideo = false;
    this.#scheduledHandle = requestAnimationFrame(callback);
  }

  #cancelScheduledCheck(): void {
    if (this.#scheduledHandle === null) {
      return;
    }

    if (this.#scheduledWithVideo && typeof this.#media.cancelVideoFrameCallback === "function") {
      this.#media.cancelVideoFrameCallback(this.#scheduledHandle);
    } else {
      cancelAnimationFrame(this.#scheduledHandle);
    }
    this.#scheduledHandle = null;
  }
}
