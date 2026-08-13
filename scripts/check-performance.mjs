import { performance } from "node:perf_hooks";
import { spawnSync } from "node:child_process";
import { build } from "esbuild";

const buildStart = performance.now();
const buildResult = spawnSync("node", ["scripts/build.mjs", "--browser=firefox"], {
  cwd: new URL("..", import.meta.url),
  encoding: "utf8"
});
const buildMs = performance.now() - buildStart;
if (buildResult.status !== 0) {
  throw new Error(`Performance build failed.\n${buildResult.stderr}`);
}

const harness = await build({
  stdin: {
    contents: `
      import { addBookmark, findEquivalentBookmark } from "./src/library/bookmarks.ts";
      import { LoopEngine } from "./src/core/loop-engine.ts";
      import { createDefaultState, loadStoredState } from "./src/platform/storage.ts";
      import { decodeSharedLoop, encodeSharedLoop } from "./src/sharing/loop-links.ts";
      export async function run() {
        const loop = { videoId: "dQw4w9WgXcQ", start: 12.5, end: 18.75, rate: 0.75 };
        for (let index = 0; index < 50_000; index += 1) {
          const encoded = encodeSharedLoop(loop);
          if (!encoded || !decodeSharedLoop(encoded)) throw new Error("codec failure");
        }
        const state = createDefaultState();
        for (let index = 0; index < 1_000; index += 1) {
          addBookmark(state, { name: String(index), folderId: null, videoId: "dQw4w9WgXcQ", videoTitle: "Video", start: index, end: index + 1, rate: 1 });
        }
        for (let index = 0; index < 1_000; index += 1) {
          if (!findEquivalentBookmark(state, { videoId: "dQw4w9WgXcQ", start: index, end: index + 1, rate: 1 })) throw new Error("lookup failure");
        }
        const folders = Array.from({ length: 10_000 }, (_, index) => ({
          id: "folder-" + index,
          name: "Folder " + index,
          parentId: index === 0 ? null : "folder-" + (index - 1),
          createdAt: index
        }));
        globalThis.browser = {
          storage: {
            local: {
              async get() {
                return {
                  ytLooperStorageLayoutV1: 1,
                  ytLooperLibraryV1: { version: 1, folders, bookmarks: [] }
                };
              },
              async set() {}
            }
          }
        };
        const normalized = await loadStoredState();
        if (normalized.folders.length !== folders.length) throw new Error("folder normalization failure");
        class Media extends EventTarget {
          currentTime = 0;
          duration = 100;
          paused = false;
          playbackRate = 1;
          preservesPitch = true;
        }
        const media = new Media();
        const engine = new LoopEngine(media, { autoMonitor: false });
        engine.setSegment(10, 11);
        engine.setEnabled(true);
        for (let index = 0; index < 500_000; index += 1) {
          media.currentTime = index % 2 === 0 ? 10.5 : 11;
          engine.checkNow();
        }
        engine.destroy();
      }
    `,
    resolveDir: new URL("..", import.meta.url).pathname,
    sourcefile: "performance-harness.ts",
    loader: "ts"
  },
  bundle: true,
  format: "esm",
  platform: "node",
  write: false
});
const moduleUrl = `data:text/javascript;base64,${Buffer.from(harness.outputFiles[0].text).toString("base64")}`;
const { run } = await import(moduleUrl);
const operationsStart = performance.now();
await run();
const operationsMs = performance.now() - operationsStart;

const limits = { buildMs: 15_000, operationsMs: 3_000 };
console.log(`Firefox build: ${buildMs.toFixed(1)} ms`);
console.log(`Loop/codec/library stress scenario: ${operationsMs.toFixed(1)} ms`);
if (buildMs > limits.buildMs || operationsMs > limits.operationsMs) {
  throw new Error(
    `Performance budget exceeded: ${JSON.stringify({ buildMs, operationsMs, limits })}`
  );
}
console.log("Performance budgets passed.");
