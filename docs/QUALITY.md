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
- A deterministic build and hot-path stress benchmark.

`npm run check:full` adds registry-dependent controls:

- High/critical vulnerability rejection with explicit, expiring exceptions.
- npm registry signature verification.
- lockfile and direct-dependency freshness enforcement.

Current minimum coverage is 90% for statements, lines and functions and 85% for branches. Coverage
includes the controller, popup and video widget; only the tiny bootstrap entry points are excluded
because their behavior is covered through the controller contract and manifest tests.

## Security model

The extension has no server, analytics, remote code or data collection. Shared links contain only a
schema version, YouTube video ID, A, B and playback speed. Payloads are length-bounded and validated
before use.

Security exceptions live in `.security-audit-allowlist.json`. Each entry names the advisory, exact
development-only dependency path, rationale and expiry. The audit fails when an exception expires,
disappears, or a new high/critical advisory appears. Product/runtime vulnerabilities are never
allowlisted.

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
Scorecard and tagged releases. Dependabot updates npm and GitHub Actions weekly. Tagged releases
rerun the full gate, package all browsers, generate an SPDX SBOM and SHA-256 checksums, create
build-provenance attestations and publish the artifacts.

Recommended protected-branch checks:

- `Quality gate (Node 24)`
- `Supported runtime (Node 22)`
- `Dependencies and registry security`
- `JavaScript and TypeScript analysis`
- `Review dependency changes`

Require pull requests, one approving review, dismissal of stale approvals, resolved conversations,
linear history and branches up to date before merge.
