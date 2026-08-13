# Quality engineering

YT Looper treats the Firefox, Chrome and Safari packages as three builds of one product. A change is
releasable only when the same source, storage schema and behavioral contracts pass every automated
gate.

## Enforced gates

`npm run check` is the deterministic, offline-friendly CI gate. It performs:

- Prettier verification and ESLint strict type-aware analysis.
- Stylelint, HTMLHint and Markdown linting.
- Strict TypeScript compilation with unused and unchecked-index checks.
- The complete Vitest suite with V8 coverage thresholds.
- Knip dead-code and unused-dependency analysis.
- Firefox `web-ext` lint plus Chrome and Safari manifest/package validation.
- Production builds for all desktop targets and raw/gzip bundle budgets.
- Two-pass reproducible-build verification and a complete release-package rehearsal.
- Store-asset dimensions/freshness, bilingual listing and privacy-policy validation.
- A hot-path and 10,000-folder normalization stress benchmark.

`npm run check:full` adds registry-dependent controls:

- High/critical vulnerability rejection with explicit, expiring exceptions.
- npm registry signature verification.
- lockfile and direct-dependency freshness enforcement.

`npm run test:e2e` exercises the built product in Chromium, Firefox and WebKit. It covers precise
A/B input and shortcut isolation, advertisement transitions, accessible modal editing, lazy folder
rendering and localization. Chromium additionally loads the packaged MV3 extension with its real
service worker, opens two tabs concurrently and verifies runtime and library persistence through the
native extension storage API. CI runs each browser in an independent required job, and the release
workflow repeats all three before packaging.

Current minimum coverage is 90% for statements, lines and functions and 85% for branches. Coverage
includes the controller, popup and video widget; only the tiny bootstrap entry points are excluded
because their behavior is covered through the controller contract and manifest tests.

## Multi-tab consistency

Live playback remains local to each content-script controller: every tab has its own video element,
enabled flag and frame loop. Persisted library, remembered A/B points and the preferred rate are
shared by the browser profile. Popup and content contexts submit typed mutation commands to one
non-persistent background coordinator, which serializes read-modify-write operations and performs
duplicate and existence checks inside that queue.

The test suite starts simultaneous mutations, checks duplicate saves and stale edits, combines
runtime and library writes, and reloads the background entry point while preserving storage. The
message listener keeps its asynchronous response channel open, so Chrome and Safari service workers
and Firefox's MV3 event page can finish an accepted write before becoming idle.

Editor saves are field-level patches against the latest persisted bookmark. A rename made from a
stale popup therefore preserves a folder move or parameter update made in another window. Failed
reads abort mutations before any write, coordinator calls have bounded waits, and the popup renders
a recoverable empty tree with localized feedback if Safari storage stalls.

## Security model

The extension has no server, analytics, remote code or data collection. New shared-link payloads
contain only a schema version, A, B and playback speed; the video ID remains in YouTube's normal
URL. Payloads are length-bounded and validated before use, and legacy links remain supported.

Security exceptions live in `.security-audit-allowlist.json`. Each entry names the advisory, exact
development-only dependency path, rationale and expiry. The audit fails when an exception expires,
disappears, or a new high/critical advisory appears. Product/runtime vulnerabilities are never
allowlisted.

Firefox is intentionally desktop-only, so its manifest omits `gecko_android`. Mozilla's validator
currently checks the desktop `strict_min_version` against Android's later data-consent support and
emits one Android-only diagnostic. `validate-firefox.mjs` classifies only that exact warning when
the manifest still declares desktop 140+, no data collection and no Android target; every other
warning, notice or error fails the gate.

## Performance and size budgets

Production JavaScript is minified for every browser. `npm run size` rejects a browser package above
225 kB raw or 100 kB gzip and also enforces entry-specific limits. `npm run perf` rejects a Firefox
build above 15 seconds or the combined loop-engine, shared-link codec and 1,000-bookmark stress
scenario above 3 seconds.

These are regression alarms, not hardware-neutral UX measurements. Before a store release, manually
verify CPU usage during sustained playback, a very short loop, an advertisement transition and
YouTube SPA navigation.

## GitHub controls

The repository includes least-privilege workflows for CI, CodeQL, dependency review, OpenSSF
Scorecard and tagged releases. Every third-party action is pinned to an immutable commit SHA with
its release tag documented inline; Dependabot updates npm and those pins weekly. Tagged releases
rerun the full gate and three-browser flows, package all browsers, generate an SPDX SBOM and SHA-256
checksums, create build-provenance attestations and publish the artifacts.

Recommended protected-branch checks:

- `Quality gate (Node 24)`
- `Supported runtime (Node 22)`
- `Dependencies and registry security`
- `Real browser flows (chromium)`
- `Real browser flows (firefox)`
- `Real browser flows (webkit)`
- `JavaScript and TypeScript analysis`
- `Review dependency changes`

Require pull requests, one approving review, dismissal of stale approvals, resolved conversations,
linear history and branches up to date before merge.
