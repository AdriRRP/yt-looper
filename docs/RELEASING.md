# Releasing YT Looper

GitHub Releases are built from a verified commit or tag. The workflow packages Firefox, Chrome and
Safari once, then passes the exact same bundle to the publication job. Marketplace submission is a
separate future phase and is not part of this workflow.

## Dry run

Run a complete release rehearsal from the GitHub Actions **Release** workflow with `dry_run` enabled
and no `release_tag`. It runs the full quality gate and exposes a downloadable workflow artifact for
14 days without creating a GitHub Release.

From the CLI:

```bash
gh workflow run Release --ref main -f dry_run=true
```

The artifact contains three uniquely named browser ZIPs, an SPDX SBOM, a machine-readable release
manifest and `SHA256SUMS`.

## Prepare a version

Start from an up-to-date `main` branch and choose a numeric `X.Y.Z` version:

```bash
npm ci
npm run release:prepare -- 0.12.0
npm run release:verify
npm run check:full
```

`release:prepare` updates `package.json`, the root package entries in `package-lock.json`, and all
three browser manifests together. Commit and push those changes, then wait for every required check
on `main` to pass.

## Publish

Create and push an annotated tag that exactly matches the synchronized version:

```bash
git tag -a v0.12.0 -m "Release v0.12.0"
git push origin v0.12.0
```

The tag workflow verifies the `vX.Y.Z` identity before doing any expensive work. It then uploads
build provenance and creates the GitHub Release with:

- `yt-looper-firefox-vX.Y.Z.zip`
- `yt-looper-chrome-vX.Y.Z.zip`
- `yt-looper-safari-vX.Y.Z.zip`
- `sbom.spdx.json`
- `release-manifest.json`
- `SHA256SUMS`

The ZIPs are developer/distribution packages; GitHub publication does not replace browser-store
signing or notarization.

## Retry or repair

If publication fails after a valid tag exists, rerun the workflow manually with `dry_run` disabled
and the exact `release_tag`:

```bash
gh workflow run Release -f dry_run=false -f release_tag=v0.12.0
```

The workflow checks out that tag, verifies its version, rebuilds the release bundle and safely
creates or updates the matching GitHub Release. Existing assets with the same names are replaced so
a partial failed attempt can be repaired without creating another tag.
