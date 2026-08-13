import { chromium, expect, test } from "@playwright/test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const require = createRequire(import.meta.url);
const axePath = require.resolve("axe-core/axe.min.js");

async function expectNoAccessibilityViolations(
  page: import("@playwright/test").Page
): Promise<void> {
  await page.addScriptTag({ path: axePath });
  const violations = await page.evaluate(async () => {
    const axe = (
      globalThis as typeof globalThis & {
        axe: {
          run(): Promise<{
            violations: {
              id: string;
              impact: string | null;
              nodes: { target: string[]; failureSummary?: string }[];
            }[];
          }>;
        };
      }
    ).axe;
    return (await axe.run()).violations.map(({ id, impact, nodes }) => ({ id, impact, nodes }));
  });
  expect(violations).toEqual([]);
}

test.beforeEach(async ({ page, browserName }) => {
  const expectedBundle =
    browserName === "webkit" ? "safari" : browserName === "chromium" ? "chrome" : "firefox";
  const response = await page.request.get("/__fixture-browser");
  expect(await response.text()).toBe(expectedBundle);
});

test("loads the packaged Chromium MV3 extension with its real worker and storage", async ({
  browserName
}) => {
  test.skip(browserName !== "chromium", "The packaged-extension smoke test uses Chromium MV3.");
  const extensionPath = resolve("dist/chrome");
  const manifestPath = join(extensionPath, "manifest.json");
  const originalManifest = await readFile(manifestPath, "utf8");
  const manifest = JSON.parse(originalManifest) as {
    content_scripts: { matches: string[] }[];
  };
  for (const script of manifest.content_scripts) {
    script.matches.push("http://127.0.0.1:4173/*");
  }
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  const profile = await mkdtemp(join(tmpdir(), "yt-looper-e2e-"));
  let context: Awaited<ReturnType<typeof chromium.launchPersistentContext>> | null = null;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: "chromium",
      headless: true,
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${extensionPath}`,
        `--load-extension=${extensionPath}`,
        "--host-resolver-rules=MAP www.youtube.com 127.0.0.1",
        "--no-proxy-server"
      ]
    });
    const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent("serviceworker"));
    const page = context.pages()[0] ?? (await context.newPage());
    await page.goto("http://127.0.0.1:4173/watch?v=fixtureVid1&native=1");
    await expect(page.locator("#yt-looper-root")).toBeAttached();
    const secondPage = await context.newPage();
    await secondPage.goto("http://127.0.0.1:4173/watch?v=fixtureVid2&native=1");
    await expect(secondPage.locator("#yt-looper-root")).toBeAttached();
    await secondPage.bringToFront();
    await secondPage.locator("#yt-looper-root [data-action=collapse]").last().click();
    await secondPage.locator("#yt-looper-root [data-field=start]").fill("3.1");
    await secondPage.locator("#yt-looper-root [data-field=end]").fill("4.2");
    await secondPage.waitForTimeout(250);
    await page.bringToFront();
    await page.locator("#yt-looper-root [data-action=collapse]").last().click();
    await page.locator("#yt-looper-root [data-field=start]").fill("1.234");
    await page.locator("#yt-looper-root [data-field=end]").fill("2.345");
    await page.waitForTimeout(300);
    await page.locator("#yt-looper-root [data-action=persist]").click();
    await expect(page.locator("#yt-looper-root [data-action=persist]")).toHaveAttribute(
      "data-mode",
      "current"
    );

    const extensionId = new URL(worker.url()).hostname;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    await expect(popup.locator('.folder-row[data-folder-id=""]')).toBeVisible();
    const readPersistedState = async () =>
      popup.evaluate(async () => {
        const extensionChrome = (
          globalThis as typeof globalThis & {
            chrome: {
              storage: {
                local: {
                  get(key: string | string[]): Promise<Record<string, unknown>>;
                };
              };
            };
          }
        ).chrome;
        return extensionChrome.storage.local.get(["ytLooperRuntimeV1", "ytLooperLibraryV1"]);
      });
    await expect
      .poll(async () => {
        const state = await readPersistedState();
        const runtime = state.ytLooperRuntimeV1 as
          { loops: Record<string, { start: number; end: number }> } | undefined;
        return Object.keys(runtime?.loops ?? {}).sort();
      })
      .toEqual(["fixtureVid1", "fixtureVid2"]);
    const runtimeState = await readPersistedState();
    const persistedRuntime = runtimeState.ytLooperRuntimeV1 as
      { loops: Record<string, { start: number; end: number }> } | undefined;
    const persistedLibrary = runtimeState.ytLooperLibraryV1 as
      { bookmarks: { videoId: string }[] } | undefined;
    expect(persistedRuntime).toBeDefined();
    expect(persistedRuntime!.loops.fixtureVid1).toEqual({
      start: 1.234,
      end: 2.345
    });
    expect(persistedRuntime!.loops.fixtureVid2).toEqual({
      start: 3.1,
      end: 4.2
    });
    expect(persistedLibrary?.bookmarks).toEqual([
      expect.objectContaining({ videoId: "fixtureVid1" })
    ]);

    const sharedPayload = Buffer.from(JSON.stringify({ v: 2, a: 0.75, b: 2.25, r: 0.8 })).toString(
      "base64url"
    );
    const sharedPage = await context.newPage();
    await sharedPage.goto(
      `https://www.youtube.com:4176/watch?v=fixtureVid1&native=1&ytl=${sharedPayload}`
    );
    await expect(sharedPage.locator("#yt-looper-root")).toBeAttached();
    await sharedPage.locator("video").evaluate((video) => {
      video.dispatchEvent(new Event("loadedmetadata"));
    });
    await expect(sharedPage.locator("#yt-looper-root .panel")).toHaveAttribute(
      "data-collapsed",
      "false"
    );
    await expect(sharedPage.locator("#yt-looper-root [data-field=start]")).toHaveValue("0.750");
    await expect(sharedPage.locator("#yt-looper-root [data-field=end]")).toHaveValue("2.250");
    await expect(sharedPage.locator("#yt-looper-root [data-field=rate]")).toHaveValue("0.8");
    await expect(sharedPage.locator("#yt-looper-root [data-action=toggle]")).toHaveAttribute(
      "data-enabled",
      "true"
    );
  } finally {
    await context?.close();
    await writeFile(manifestPath, originalManifest);
    await rm(profile, { recursive: true, force: true });
  }
});

test("creates and activates a precise loop without leaking video shortcuts", async ({ page }) => {
  await page.goto("/watch?v=fixtureVid1");
  const panel = page.locator("#yt-looper-root .panel");
  await expect(panel).toHaveAttribute("data-collapsed", "true");
  await page.locator("#yt-looper-root [data-action=collapse]").last().click();

  const start = page.locator("#yt-looper-root [data-field=start]");
  const end = page.locator("#yt-looper-root [data-field=end]");
  await start.fill("1.234");
  await end.fill("2.345");
  await expect(start).toHaveValue("1.234");
  await expect(end).toHaveValue("2.345");
  await start.evaluate((input) => {
    input.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: "a",
        code: "KeyA",
        bubbles: true,
        composed: true
      })
    );
  });
  await expect(page.locator("#shortcut-probe")).toContainText("0");

  await page.locator("#yt-looper-root [data-action=toggle]").click();
  await expect(page.locator("#yt-looper-root [data-action=toggle]")).toHaveAttribute(
    "data-enabled",
    "true"
  );
  await expectNoAccessibilityViolations(page);
});

test("blocks loop controls with an accessible ad status", async ({ page }) => {
  await page.goto("/watch?v=fixtureVid1&linked=1&ytl_bookmark=saved-fragment&ad=1");
  const panel = page.locator("#yt-looper-root .panel");
  await expect(panel).toHaveAttribute("data-ad", "true");
  await expect(panel).toHaveAttribute("aria-busy", "true");
  await expect(page.locator("#yt-looper-root .ad-loading")).toBeVisible();
  await page.locator("#toggle-ad").click();
  await expect(panel).toHaveAttribute("data-ad", "false");
  await expect(page.locator("#yt-looper-root .ad-loading")).toBeHidden();
  await expect(panel).toHaveAttribute("data-collapsed", "false");
  await expect(page.locator("#yt-looper-root [data-action=toggle]")).toBeVisible();
});

test("edits a saved loop in a focus-contained modal", async ({ page }) => {
  await page.goto("/popup-fixture.html?linked=1&match=1");
  await page.locator("#current-badge").click();
  const modal = page.locator("#editor-modal");
  await expect(modal).toHaveAttribute("data-open", "true");
  await expect(page.locator("main")).toHaveAttribute("inert", "");
  await expect(page.locator("#editor-sheet")).toHaveCSS("opacity", "1");
  await expectNoAccessibilityViolations(page);
  await page.locator("#editor-name").fill("Solo definitivo");
  await page.locator("#submit-editor").click();
  await expect(page.locator("#current-bookmark-name")).toHaveText("Solo definitivo");
  await expect(modal).toHaveAttribute("data-open", "true");
  await page.keyboard.press("Escape");
  await expect(modal).not.toHaveAttribute("data-open", "true");
});

test("localizes the document language and lazily expands nested folders", async ({ page }) => {
  await page.goto("/popup-fixture-en.html?linked=1");
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.locator("#library-tree")).toHaveAttribute("role", "list");
  await expect(page.locator("[data-bookmark-id=saved-fragment]")).toHaveCount(0);
  await page.locator('.folder-row[data-folder-id="practice"] .tree-label').click();
  await expect(page.locator("[data-bookmark-id=saved-fragment]")).toBeVisible();
  await expectNoAccessibilityViolations(page);
});

test("deduplicates rapid folder creation and rejects an unpersistable loop edit", async ({
  page
}) => {
  await page.goto("/popup-fixture.html?linked=1&match=1");
  await page.locator('.folder-row[data-folder-id=""] .tree-actions button').click();
  const form = page.locator(".subfolder-form");
  await form.locator("input").fill("Rápida");
  await form.evaluate((element) => {
    element.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
    element.dispatchEvent(new SubmitEvent("submit", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator('.folder-row[data-folder-name="Rápida"]')).toHaveCount(1);

  await page.locator('.folder-row[data-folder-id="practice"] .tree-label').click();
  await page.locator('[data-bookmark-id="saved-fragment"] .tree-label').click();
  await page.locator("#editor-start").fill("31536001");
  await page.locator("#editor-end").fill("31536002");
  await page.locator("#submit-editor").click();
  await expect(page.locator("#editor-status")).toContainText("entre 0");
  await page.reload();
  await page.locator('.folder-row[data-folder-id="practice"] .tree-label').click();
  await expect(page.locator('[data-bookmark-id="saved-fragment"]')).toHaveCount(1);
});

test("decodes a compact shared link and applies the loop", async ({ page }) => {
  const payload = Buffer.from(JSON.stringify({ v: 2, a: 1.234, b: 2.345, r: 0.75 })).toString(
    "base64url"
  );
  await page.goto(`/watch?v=fixtureVid1&youtubeHost=1&ytl=${payload}`);
  await expect(page.locator("#yt-looper-root .panel")).toHaveAttribute("data-collapsed", "false");
  await expect(page.locator("#yt-looper-root [data-field=start]")).toHaveValue("1.234");
  await expect(page.locator("#yt-looper-root [data-field=end]")).toHaveValue("2.345");
  await expect(page.locator("#yt-looper-root [data-field=rate]")).toHaveValue("0.75");
  await expect(page.locator("#yt-looper-root [data-action=toggle]")).toHaveAttribute(
    "data-enabled",
    "true"
  );
});
