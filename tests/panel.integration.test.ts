// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LoopPanel, type PanelActions, type PanelViewModel } from "../src/ui/panel";

const baseModel = (changes: Partial<PanelViewModel> = {}): PanelViewModel => ({
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
  parametersMatch: false,
  ...changes
});

function actionSpies(): PanelActions {
  return {
    setStartNow: vi.fn(),
    setEndNow: vi.fn(),
    setStart: vi.fn(),
    setEnd: vi.fn(),
    adjustStart: vi.fn(),
    adjustEnd: vi.fn(),
    setRate: vi.fn(),
    toggleLoop: vi.fn(),
    dismiss: vi.fn(),
    detachBookmark: vi.fn(),
    shareLoop: vi.fn().mockResolvedValue(true),
    saveCurrentLoop: vi.fn().mockResolvedValue(true),
    updateBookmarkParameters: vi.fn().mockResolvedValue("updated")
  };
}

function shadow(): ShadowRoot {
  return document.querySelector<HTMLElement>("#yt-looper-root")!.shadowRoot!;
}

function button(action: string): HTMLButtonElement {
  return shadow().querySelector<HTMLButtonElement>(`[data-action="${action}"]`)!;
}

function click(action: string): void {
  button(action).click();
}

beforeEach(() => {
  document.body.innerHTML = '<div id="player"></div>';
});

afterEach(() => {
  vi.useRealTimers();
  document.body.replaceChildren();
});

describe("video widget integration", () => {
  it("starts compact without parameters and expands when A is first selected", () => {
    const actions = actionSpies();
    const panel = new LoopPanel(document.querySelector("#player")!, actions, false);
    expect(shadow().querySelector<HTMLElement>(".panel")!.dataset.collapsed).toBe("true");
    panel.update(baseModel({ start: 2 }));
    expect(shadow().querySelector<HTMLElement>(".panel")!.dataset.collapsed).toBe("false");
    click("collapse");
    expect(shadow().querySelector(".collapse")!.getAttribute("aria-label")).toBe("Expandir");
    click("collapse");
    expect(shadow().querySelector(".collapse")!.getAttribute("aria-label")).toBe("Minimizar");
    panel.destroy();
  });

  it("routes every video action to its controller contract", () => {
    const actions = actionSpies();
    const panel = new LoopPanel(document.querySelector("#player")!, actions, true);
    for (const action of [
      "start-now",
      "end-now",
      "start-back",
      "start-forward",
      "end-back",
      "end-forward",
      "toggle",
      "dismiss",
      "detach"
    ])
      click(action);
    expect(actions.setStartNow).toHaveBeenCalledOnce();
    expect(actions.setEndNow).toHaveBeenCalledOnce();
    expect(actions.adjustStart).toHaveBeenNthCalledWith(1, -0.1);
    expect(actions.adjustStart).toHaveBeenNthCalledWith(2, 0.1);
    expect(actions.adjustEnd).toHaveBeenNthCalledWith(1, -0.1);
    expect(actions.adjustEnd).toHaveBeenNthCalledWith(2, 0.1);
    expect(actions.toggleLoop).toHaveBeenCalledOnce();
    expect(actions.dismiss).toHaveBeenCalledOnce();
    expect(actions.detachBookmark).toHaveBeenCalledOnce();
    panel.destroy();
  });

  it("routes A, B and speed inputs while insulating YouTube shortcuts", () => {
    const actions = actionSpies();
    const panel = new LoopPanel(document.querySelector("#player")!, actions, true);
    const start = shadow().querySelector<HTMLInputElement>('[data-field="start"]')!;
    const end = shadow().querySelector<HTMLInputElement>('[data-field="end"]')!;
    const rate = shadow().querySelector<HTMLInputElement>('[data-field="rate"]')!;
    start.value = "1.25";
    start.dispatchEvent(new Event("input", { bubbles: true }));
    end.value = "";
    end.dispatchEvent(new Event("input", { bubbles: true }));
    rate.value = "0.75";
    rate.dispatchEvent(new Event("input", { bubbles: true }));
    expect(actions.setStart).toHaveBeenCalledWith(1.25);
    expect(actions.setEnd).toHaveBeenCalledWith(null);
    expect(actions.setRate).toHaveBeenCalledWith(0.75);
    const outerKeyListener = vi.fn();
    document.addEventListener("keydown", outerKeyListener);
    start.dispatchEvent(new KeyboardEvent("keydown", { bubbles: true, composed: true, key: "k" }));
    expect(outerKeyListener).not.toHaveBeenCalled();
    document.removeEventListener("keydown", outerKeyListener);
    panel.destroy();
  });

  it("renders enabled, saved, dirty, advertising and share states coherently", () => {
    const actions = actionSpies();
    const panel = new LoopPanel(document.querySelector("#player")!, actions, true);
    panel.update(
      baseModel({
        start: 1,
        end: 3,
        rate: 0.75,
        enabled: true,
        canSave: true,
        canShare: true,
        savedBookmarkId: "saved-1",
        savedBookmarkName: "Estribillo",
        parametersMatch: true
      })
    );
    expect(button("toggle").dataset.enabled).toBe("true");
    expect(shadow().querySelector(".loop-label")!.textContent).toBe("Detener loop");
    expect(shadow().querySelector(".summary")!.textContent).toContain("0.75×");
    expect(shadow().querySelector<HTMLElement>(".saved-banner")!.hidden).toBe(false);
    expect(shadow().querySelector(".saved-banner-name")!.textContent).toBe("Estribillo");
    expect(button("persist").dataset.mode).toBe("current");
    expect(button("persist").disabled).toBe(true);

    panel.update(
      baseModel({
        start: 1,
        end: 4,
        canSave: true,
        savedBookmarkId: "saved-1",
        savedBookmarkName: "Estribillo",
        parametersMatch: false,
        adPlaying: true,
        canShare: true
      })
    );
    expect(shadow().querySelector<HTMLElement>(".saved-banner")!.dataset.dirty).toBe("true");
    expect(button("persist").dataset.mode).toBe("update");
    expect(button("share").hidden).toBe(true);
    expect(shadow().querySelector<HTMLElement>(".ad-loading")!.hidden).toBe(false);
    expect(shadow().querySelector<HTMLElement>(".panel")!.getAttribute("aria-busy")).toBe("true");
    expect(shadow().querySelector<HTMLElement>(".status")!.dataset.ad).toBe("true");
    panel.destroy();
  });

  it("saves, updates and shares with success and failure feedback", async () => {
    vi.useFakeTimers();
    const actions = actionSpies();
    const panel = new LoopPanel(document.querySelector("#player")!, actions, true);
    panel.update(baseModel({ start: 1, end: 2, canSave: true, canShare: true }));
    click("persist");
    click("share");
    await vi.runAllTicks();
    expect(actions.saveCurrentLoop).toHaveBeenCalledOnce();
    expect(actions.shareLoop).toHaveBeenCalledOnce();
    expect(shadow().querySelector(".status")!.textContent).toBe("Enlace del loop copiado.");

    vi.mocked(actions.shareLoop).mockResolvedValue(false);
    panel.update(
      baseModel({
        start: 1,
        end: 2,
        canSave: true,
        savedBookmarkId: "one",
        savedBookmarkName: "Loop",
        parametersMatch: false
      })
    );
    vi.mocked(actions.updateBookmarkParameters).mockResolvedValue("duplicate");
    click("persist");
    click("share");
    await vi.runAllTicks();
    expect(shadow().querySelector<HTMLElement>(".status")!.dataset.error).toBe("true");
    vi.advanceTimersByTime(2200);
    expect(shadow().querySelector(".status")!.textContent).toContain("⌥/Alt");
    panel.destroy();
  });

  it("hides, restores, destroys and replaces an existing widget safely", () => {
    const first = new LoopPanel(document.querySelector("#player")!, actionSpies(), false);
    first.hide();
    expect(first.visible).toBe(false);
    first.show();
    expect(first.visible).toBe(true);
    const second = new LoopPanel(document.querySelector("#player")!, actionSpies(), false);
    expect(document.querySelectorAll("#yt-looper-root")).toHaveLength(1);
    second.destroy();
    expect(document.querySelector("#yt-looper-root")).toBeNull();
  });
});
