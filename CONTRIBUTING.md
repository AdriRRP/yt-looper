# Contributing

Thanks for helping improve YT Looper. Keep changes focused on a concrete user workflow and preserve
Firefox, Chrome and Safari behavior unless the pull request explicitly documents a platform
exception.

## Development workflow

Use Node 24 and npm 11. Install the exact toolchain and run the full local gate:

```bash
npm ci
npm run check:full
```

During development, `npm run check:quick` gives faster feedback. Add or update tests for every
behavior change, including a failure path or interaction with existing state when relevant. UI
changes must remain keyboard usable, pass the accessibility test and provide English and Spanish
messages.

Do not add extension permissions, telemetry, remote code, network transmission or a stored-data
migration without describing the security/privacy impact. Never weaken a quality threshold to make a
change pass; fix the regression or explain and review a deliberate policy change.

Use conventional, imperative commit subjects where practical. Pull requests should explain
user-visible behavior, verification and risk. Generated `dist`, `coverage`, `artifacts` and
`safari-app` content is not committed.

## Release process

Update the package and all browser manifest versions together, update release notes, and run
`npm run check:full`. Push an annotated `vX.Y.Z` tag only after protected-branch checks pass. The
release workflow rebuilds from the tag and publishes packages, checksums, SBOM and provenance.
