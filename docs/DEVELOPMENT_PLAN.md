# Development plan

## Product principle

YT Looper should make marking and repeating a practice fragment faster than using YouTube's native
controls. The core interaction must remain local, immediate, keyboard-friendly, and unobtrusive.

## Milestone 1 — Firefox functional alpha

Status: completed in versions 0.1–0.3.

Scope:

- Regular `youtube.com/watch` pages on desktop Firefox.
- One saved A/B fragment per video.
- Custom rate between 0.25× and 4×.
- Always-on pitch preservation.
- Overlay controls and keyboard shortcuts.
- YouTube SPA navigation and ad suspension.
- Local-only WebExtension storage.
- Named fragment bookmarks, folders, and one-click loop restoration.
- Nested folder trees, fragment editing, and dismissible video controls.
- Self-contained shared-loop links that remain unsaved until the user chooses to save them.

Acceptance criteria:

- The overlay appears without reloading a regular watch page.
- A loop can be created in three actions: mark A, mark B, activate.
- Playback returns to A when it reaches B while playing.
- The loop does not seek inside a YouTube ad.
- Navigating to a second video replaces the active session without duplicate panels.
- Returning to a video restores A/B but does not unexpectedly activate playback.
- Disabling the loop stops frame monitoring.
- Type checks, unit tests, extension validation, and a production build pass.

## Milestone 2 — Firefox beta quality

Status: automated quality foundation completed in version 0.11.0; wider real-YouTube QA and store
submission remain.

- Verify regular videos, playlists, theater mode, fullscreen, live DVR, and private windows.
- [x] Add accessible focus states, semantic checks and keyboard-input isolation.
- [x] Add icons and a Spanish/English localization baseline.
- [x] Add integration fixtures for video replacement, ads, navigation, storage and popup workflows.
- [x] Add repeatable CPU/build stress tests and bundle-size budgets.
- [x] Enforce strict types, linting, dead-code detection and coverage thresholds.
- [x] Add CI, CodeQL, dependency review, Scorecard, Dependabot and release provenance.
- [x] Add bilingual store screenshots, promotional assets and marketplace metadata.
- [ ] Profile CPU usage during multi-hour playback in real browsers.
- Define a recovery strategy when YouTube changes its DOM.
- Package and submit a signed beta through AMO.

## Milestone 3 — Chrome

Status: implementation completed in version 0.10.0; store beta pending.

- [x] Add a Chrome MV3 manifest and independent build/package targets.
- [x] Share storage, popup, content scripts, localization and loop behavior with Firefox.
- [x] Add Chrome-compatible 16/32/48/128 PNG manifest icons.
- [x] Verify MV3 permissions, Promise-based storage and shared acceptance tests.
- [x] Serialize library and preference mutations across tabs, windows and worker restarts.
- [ ] Complete a wider Chrome QA matrix against real YouTube layouts.
- [x] Prepare Chrome Web Store metadata and privacy declarations.
- [ ] Publish a Chrome Web Store beta.

## Milestone 4 — Safari

Status: implementation and local Safari verification completed in version 0.11.0; store distribution
remains.

- [x] Audit WebExtension API and Manifest V3 compatibility for Safari 15.5+.
- [x] Add a Safari manifest, build, validation and temporary ZIP target.
- [x] Request an explicit YouTube host permission and reuse the shared storage format.
- [x] Prepare a macOS-only Xcode project generator.
- [x] Install full Xcode and run Apple's Safari Web Extension Packager.
- [x] Verify the core loop, storage, popup and YouTube permission flow in Safari on macOS.
- [x] Share the concurrency-safe background storage coordinator with Safari MV3.
- [ ] Complete a wider fullscreen, multi-window and long-playback Safari QA matrix.
- [x] Prepare macOS App Store Connect metadata and distribution assets.
- [ ] Submit a TestFlight/App Store beta.

## Later product candidates

- Loop count, inter-loop pause, and progressive speed practice.
- Timeline handles and frame-step controls.
- Import/export of fragment collections.
- Generic `<video>` support beyond YouTube.
- YouTube Shorts and embedded players.

These remain outside the functional alpha until the three-action A/B workflow is reliable.
