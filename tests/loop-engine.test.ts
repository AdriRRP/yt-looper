import { describe, expect, it } from "vitest";
import {
  LoopEngine,
  MAX_PLAYBACK_RATE,
  MIN_PLAYBACK_RATE,
  clampRate,
  validateSegment,
  type LoopMedia
} from "../src/core/loop-engine";

class FakeMedia extends EventTarget implements LoopMedia {
  currentTime = 0;
  duration = 100;
  paused = false;
  playbackRate = 1;
  preservesPitch = true;
}

describe("validateSegment", () => {
  it("requires both loop points", () => {
    expect(validateSegment(null, 10).valid).toBe(false);
    expect(validateSegment(1, null).valid).toBe(false);
  });

  it("rejects an inverted or tiny segment", () => {
    expect(validateSegment(3, 2).valid).toBe(false);
    expect(validateSegment(2, 2.01).valid).toBe(false);
  });

  it("accepts a valid segment", () => {
    expect(validateSegment(2, 3, 10)).toEqual({ valid: true });
  });
});

describe("LoopEngine", () => {
  it("jumps back to A after reaching B", () => {
    const media = new FakeMedia();
    const engine = new LoopEngine(media, { autoMonitor: false });
    engine.setSegment(2, 5);
    expect(engine.setEnabled(true).valid).toBe(true);

    media.currentTime = 5.02;
    expect(engine.checkNow()).toBe(true);
    expect(media.currentTime).toBe(2);
    engine.destroy();
  });

  it("does not jump while blocked by an ad", () => {
    const media = new FakeMedia();
    let blocked = true;
    const engine = new LoopEngine(media, { autoMonitor: false, shouldBlock: () => blocked });
    engine.setSegment(2, 5);
    engine.setEnabled(true);
    media.currentTime = 6;

    expect(engine.checkNow()).toBe(false);
    expect(media.currentTime).toBe(6);
    blocked = false;
    expect(engine.checkNow()).toBe(true);
    expect(media.currentTime).toBe(2);
    engine.destroy();
  });

  it("applies bounded playback and pitch settings", () => {
    const media = new FakeMedia();
    const engine = new LoopEngine(media, { autoMonitor: false });

    expect(engine.setRate(99)).toBe(MAX_PLAYBACK_RATE);
    expect(media.playbackRate).toBe(MAX_PLAYBACK_RATE);
    expect(clampRate(0.01)).toBe(MIN_PLAYBACK_RATE);
    engine.setPreservesPitch(false);
    expect(media.preservesPitch).toBe(false);
    engine.destroy();
  });
});
