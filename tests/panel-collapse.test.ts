import { describe, expect, it } from "vitest";
import { PanelCollapseState } from "../src/ui/panel-collapse";

describe("panel initial collapse", () => {
  it("starts collapsed when a new video has no A/B parameters", () => {
    const state = new PanelCollapseState(false);
    expect(state.collapsed).toBe(true);
    expect(state.syncParameters(null, null)).toBe(true);
  });

  it("starts expanded when a remembered or shared loop exists", () => {
    const state = new PanelCollapseState(true);
    expect(state.collapsed).toBe(false);
    expect(state.syncParameters(10, 15)).toBe(false);
  });

  it("expands once when the first point is marked", () => {
    const state = new PanelCollapseState(false);
    expect(state.syncParameters(10, null)).toBe(false);
    expect(state.syncParameters(null, null)).toBe(false);
  });

  it("respects manual collapse choices after initialization", () => {
    const state = new PanelCollapseState(false);
    expect(state.toggle()).toBe(false);
    expect(state.toggle()).toBe(true);
    expect(state.syncParameters(10, null)).toBe(true);
  });
});
