// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  findYouTubeContext,
  getVideoIdFromUrl,
  isAdPlaying,
  observeYouTubeNavigation
} from "../src/sites/youtube";

beforeEach(() => {
  history.replaceState({}, "", "/watch?v=video-1");
  document.body.innerHTML = '<div id="movie_player"><video class="html5-main-video"></video></div>';
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("YouTube adapter integration", () => {
  it("finds a complete watch context and rejects incomplete pages", () => {
    expect(findYouTubeContext()).toMatchObject({ videoId: "video-1" });
    document.querySelector("video")!.remove();
    expect(findYouTubeContext()).toBeNull();
    document.body.innerHTML = '<video class="html5-main-video"></video>';
    expect(findYouTubeContext()).toBeNull();
    history.replaceState({}, "", "/feed/subscriptions");
    expect(findYouTubeContext()).toBeNull();
    expect(getVideoIdFromUrl("https://youtube.com/watch")).toBeNull();
  });

  it("reports both advertising states", () => {
    const player = document.querySelector<HTMLElement>("#movie_player")!;
    expect(isAdPlaying(player)).toBe(false);
    player.classList.add("ad-showing");
    expect(isAdPlaying(player)).toBe(true);
  });

  it("debounces navigation events and stops all observation", async () => {
    vi.useFakeTimers();
    const onChange = vi.fn();
    const stop = observeYouTubeNavigation(onChange);
    document.dispatchEvent(new Event("yt-navigate-finish"));
    document.dispatchEvent(new Event("yt-page-data-updated"));
    window.dispatchEvent(new PopStateEvent("popstate"));
    vi.advanceTimersByTime(79);
    expect(onChange).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onChange).toHaveBeenCalledOnce();

    const wrapper = document.createElement("div");
    wrapper.innerHTML = '<video class="html5-main-video"></video>';
    document.body.append(wrapper);
    await vi.runAllTicks();
    vi.advanceTimersByTime(80);
    expect(onChange).toHaveBeenCalledTimes(2);

    stop();
    document.dispatchEvent(new Event("yt-navigate-finish"));
    wrapper.remove();
    await vi.runAllTicks();
    vi.advanceTimersByTime(100);
    expect(onChange).toHaveBeenCalledTimes(2);
  });
});
