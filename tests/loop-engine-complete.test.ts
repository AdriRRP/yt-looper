import { afterEach, describe, expect, it, vi } from "vitest";
import {
  LoopEngine,
  MAX_LOOP_TIME_SECONDS,
  clampRate,
  normalizeLoopTime,
  validateSegment,
  type LoopMedia
} from "../src/core/loop-engine";

class TestMedia extends EventTarget implements LoopMedia {
  currentTime = 0;
  duration = 30;
  paused = false;
  playbackRate = 1;
  preservesPitch = true;
  frameCallback?: () => void;
  requestVideoFrameCallback = vi.fn((callback: () => void) => {
    this.frameCallback = callback;
    return 17;
  });
  cancelVideoFrameCallback = vi.fn();
}

afterEach(() => vi.unstubAllGlobals());

describe("complete loop engine behavior", () => {
  it("reports every validation reason and accepts live streams", () => {
    expect(validateSegment(null, null)).toEqual({ valid: false, reason: "missing" });
    expect(validateSegment(Number.NaN, 2)).toEqual({ valid: false, reason: "invalid" });
    expect(validateSegment(-1, 2)).toEqual({ valid: false, reason: "invalid" });
    expect(validateSegment(2, Number.POSITIVE_INFINITY)).toEqual({
      valid: false,
      reason: "invalid"
    });
    expect(validateSegment(2, 2.01)).toEqual({ valid: false, reason: "tooShort" });
    expect(validateSegment(2, 31, 30)).toEqual({ valid: false, reason: "outOfRange" });
    expect(validateSegment(2, 31, Number.POSITIVE_INFINITY)).toEqual({ valid: true });
  });

  it("normalizes rates, times and invalid numeric input", () => {
    const media = new TestMedia();
    const engine = new LoopEngine(media, { autoMonitor: false });
    expect(clampRate(Number.NaN)).toBe(1);
    expect(clampRate(2)).toBe(2);
    expect(normalizeLoopTime(0.1 + 0.2)).toBe(0.3);
    expect(normalizeLoopTime(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(normalizeLoopTime(1e306)).toBe(1e306);
    expect(validateSegment(1e306, 1.1e306)).toEqual({ valid: false, reason: "invalid" });
    expect(validateSegment(MAX_LOOP_TIME_SECONDS - 1, MAX_LOOP_TIME_SECONDS)).toEqual({
      valid: true
    });
    engine.setSegment(0.1 + 0.2, 1.1 + 0.2);
    expect(engine.state).toMatchObject({ start: 0.3, end: 1.3 });
    engine.setStart(-5);
    engine.setEnd(100);
    expect(engine.state).toMatchObject({ start: 0, end: 30 });
    engine.setStart(Number.NaN);
    expect(engine.state.start).toBeNull();
    media.duration = Number.POSITIVE_INFINITY;
    engine.setEnd(100);
    expect(engine.state.end).toBe(100);
    engine.destroy();
  });

  it("refuses invalid activation and disables an active loop when edited invalid", () => {
    const media = new TestMedia();
    const engine = new LoopEngine(media, { autoMonitor: false });
    expect(engine.setEnabled(true)).toEqual({ valid: false, reason: "missing" });
    engine.setSegment(2, 5);
    expect(engine.setEnabled(true)).toEqual({ valid: true });
    engine.setEnd(2);
    expect(engine.state.enabled).toBe(false);
    expect(engine.checkNow()).toBe(false);
    engine.destroy();
  });

  it("reacts to timeupdate and removes the listener on destroy", () => {
    const media = new TestMedia();
    const engine = new LoopEngine(media, { autoMonitor: false });
    engine.setSegment(3, 5);
    engine.setEnabled(true);
    media.currentTime = 6;
    media.dispatchEvent(new Event("timeupdate"));
    expect(media.currentTime).toBe(3);
    engine.destroy();
    media.currentTime = 6;
    media.dispatchEvent(new Event("timeupdate"));
    expect(media.currentTime).toBe(6);
  });

  it("does not mutate playback settings while blocked and reapplies them later", () => {
    const media = new TestMedia();
    let blocked = true;
    const engine = new LoopEngine(media, { autoMonitor: false, shouldBlock: () => blocked });
    engine.setRate(1.5);
    engine.setPreservesPitch(false);
    expect(media.playbackRate).toBe(1);
    expect(media.preservesPitch).toBe(true);
    engine.applyPlaybackSettings();
    expect(media.playbackRate).toBe(1);
    blocked = false;
    engine.applyPlaybackSettings();
    expect(media.playbackRate).toBe(1.5);
    expect(media.preservesPitch).toBe(false);
    engine.destroy();
  });

  it("uses and cancels video frame callbacks", () => {
    const media = new TestMedia();
    const engine = new LoopEngine(media);
    engine.setSegment(2, 4);
    engine.setEnabled(true);
    expect(media.requestVideoFrameCallback).toHaveBeenCalledOnce();
    media.currentTime = 4;
    media.frameCallback?.();
    expect(media.currentTime).toBe(2);
    expect(media.requestVideoFrameCallback).toHaveBeenCalledTimes(2);
    engine.setEnabled(false);
    expect(media.cancelVideoFrameCallback).toHaveBeenCalledWith(17);
    engine.destroy();
  });

  it("falls back to animation frames and ignores stale callbacks", () => {
    const callbacks = new Map<number, FrameRequestCallback>();
    const request = vi.fn((callback: FrameRequestCallback) => {
      callbacks.set(9, callback);
      return 9;
    });
    const cancel = vi.fn();
    vi.stubGlobal("requestAnimationFrame", request);
    vi.stubGlobal("cancelAnimationFrame", cancel);
    const media = new TestMedia();
    delete (media as LoopMedia).requestVideoFrameCallback;
    delete (media as LoopMedia).cancelVideoFrameCallback;
    const engine = new LoopEngine(media);
    engine.setSegment(2, 4);
    engine.setEnabled(true);
    expect(request).toHaveBeenCalledOnce();
    engine.setEnabled(false);
    expect(cancel).toHaveBeenCalledWith(9);
    callbacks.get(9)?.(0);
    expect(request).toHaveBeenCalledOnce();
    engine.destroy();
  });
});
