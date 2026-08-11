// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { LoopPanel, type PanelActions } from "../src/ui/panel";

const actions: PanelActions = {
  setStartNow: () => undefined,
  setEndNow: () => undefined,
  setStart: () => undefined,
  setEnd: () => undefined,
  adjustStart: () => undefined,
  adjustEnd: () => undefined,
  setRate: () => undefined,
  toggleLoop: () => undefined,
  dismiss: () => undefined,
  detachBookmark: () => undefined,
  shareLoop: async () => true,
  saveCurrentLoop: async () => true,
  updateBookmarkParameters: async () => "updated"
};

afterEach(() => document.body.replaceChildren());

describe("automated accessibility gates", () => {
  it("keeps the popup free of detectable structural accessibility violations", async () => {
    document.open();
    document.write(readFileSync(resolve(process.cwd(), "popup/popup.html"), "utf8"));
    document.close();
    const results = await axe.run(document, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
  });

  it("keeps the injected video widget accessible in shadow DOM", async () => {
    document.body.innerHTML = '<div id="player"></div>';
    const panel = new LoopPanel(document.querySelector("#player")!, actions, true);
    panel.update({
      start: 1,
      end: 2,
      enabled: false,
      rate: 1,
      preservesPitch: true,
      adPlaying: false,
      canSave: true,
      canShare: true,
      savedBookmarkId: null,
      savedBookmarkName: "",
      parametersMatch: false
    });
    const results = await axe.run(document, {
      rules: { "color-contrast": { enabled: false } }
    });
    expect(results.violations).toEqual([]);
    panel.destroy();
  });
});
