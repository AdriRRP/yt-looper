# Shared loop links

## Current format: self-contained URL

Use a canonical YouTube URL with a versioned Base64URL payload:

```text
https://www.youtube.com/watch?v=VIDEO_ID&t=12#ytl=BASE64URL_PAYLOAD
```

Decoded payload:

```json
{
  "v": 2,
  "a": 12.5,
  "b": 18.75,
  "r": 0.75
}
```

The regular `v` query parameter identifies the video, so repeating that identifier inside the
payload would be redundant. The `t` parameter provides a useful fallback for people without YT
Looper. The extension reads `ytl`, validates it and activates the loop. The shared loop is not added
to the library automatically; the regular save action remains available.

The decoder also accepts legacy version 1 payloads containing `i`. It verifies that `i` matches
YouTube's `v` parameter, strips unknown optional properties and normalizes both versions before use.

The fragment is canonical because it does not need to be sent to YouTube's servers. Firefox and
YouTube may still normalize it away during startup, so a minimal `document_start` content script
captures both shared loops and local bookmark requests before YouTube runs. The main controller
retains that request across advertisements and replacement video elements until it can be applied to
the main video. The decoder also accepts the query form for backwards compatibility.

A UUID is not needed for this model. Base64URL is an encoding, not encryption, and the payload
remains user-readable and editable.

## UUID alternative

A short opaque URL such as `https://example.com/l/UUID` requires a backend mapping the UUID to
video, A, B and speed. It enables shorter links, revocation, mutable links and optional analytics,
but introduces hosting, privacy, abuse prevention and availability concerns. It should be a later
optional service, not a dependency of the core sharing feature.

## Import rules

On an initial YouTube page load, use this precedence:

1. Valid shared `ytl` payload.
2. Local `ytl_bookmark` reference.
3. Last loop remembered for the video.

After video metadata is available:

1. Verify payload version and maximum encoded length.
2. Accept only a canonical YouTube video ID from the destination URL, not an arbitrary embedded
   destination.
3. Require finite values, `A >= 0`, `B > A`, the minimum loop duration and `B <= video.duration`.
4. Require speed to be inside the supported range.
5. Seek to A, apply speed and pitch preservation, and activate the loop.
6. Show a distinct “Shared loop” state with a save option; never save to the library implicitly.

Malformed or unsupported payloads should be ignored safely while the underlying YouTube URL
continues to work normally.

## Sharing interface

Add a share icon to the video widget and toolbar popup. On click:

1. Validate the current loop.
2. Build the canonical URL and copy it to the clipboard.
3. Show a short confirmation.

The payload should not contain a title or folder. Those are private library metadata and are not
required to reproduce the loop.

## Cross-browser impact

The codec and URL recognition are browser-independent. They use URL parsing, JSON and Base64URL
only. Browser-specific work is limited to manifests, packaging and clipboard behavior.

Desktop priorities:

1. Firefox.
2. Chrome, Edge and other Chromium browsers with a separate Manifest V3 build.
3. Safari through Safari Web Extension packaging and App Store distribution.

Mobile is outside the current product scope. Links still degrade to an ordinary YouTube URL there,
starting near A through the standard `t` parameter.
