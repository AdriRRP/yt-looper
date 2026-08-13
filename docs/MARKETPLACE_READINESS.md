# Marketplace readiness

The repository contains the upload ZIPs, bilingual listing copy, an externally publishable privacy
policy and store-ready images. The remaining work requires the owner's developer accounts,
agreements and final human submission choices; no marketplace credentials belong in the repository.

## Prepared and enforced

- Firefox, Chrome and Safari manifests use the same version and least-privilege product surface.
- Firefox declares `data_collection_permissions.required: [none]` and supports desktop Firefox 140+.
- Chrome and Safari contain raster icons through 128×128; no remote code is loaded.
- Spanish and English listing text includes descriptions, reviewer instructions, permission
  justifications, data declarations and stable support/privacy URLs.
- Each locale has three opaque 1280×800 screenshots. Chrome's required 440×280 promotional tile and
  optional 1400×560 marquee are included and dimension-checked by `npm run store:validate`.
- `npm run release:package -- --prebuilt` packages the exact builds already exercised by E2E. The
  release also includes checksums, an SPDX SBOM and a reviewable source archive for AMO.

## Firefox Add-ons (AMO)

1. Create or confirm the AMO developer account and accept the current distribution agreement.
2. Upload `yt-looper-firefox-vX.Y.Z.zip` as a listed extension.
3. Upload `yt-looper-source-vX.Y.Z.zip` because production JavaScript is bundled and minified.
4. Give reviewers the build command `npm ci && npm run build:firefox`, with Node 22 or 24 and
   npm 11.
5. Paste the locale listings, privacy URL and reviewer notes, then submit for signing and review.

Mozilla requires a Manifest V3 add-on ID, accurate built-in data declarations and reproducible
source for generated code. The current manifest and source package cover those technical
requirements.

## Chrome Web Store

1. Register the developer account, complete identity/contact details and enable two-step
   verification.
2. Create a new item and upload `yt-looper-chrome-vX.Y.Z.zip`.
3. Add both localized listings and screenshots, plus `promotional/small-promo.png`; the marquee is
   optional.
4. In Privacy practices, paste the single-purpose statement and each permission justification,
   select **no remote code**, disclose no collected data and add the privacy policy URL.
5. Choose public/unlisted visibility and regions, save the draft, run the dashboard preview, then
   submit for review.

## Safari / Mac App Store

Apple currently supports either the generated Xcode containing app or Safari Web Extension Packager
in App Store Connect. Both paths require Apple Developer Program membership.

1. Reserve the app name and create the macOS App Store Connect record using bundle ID
   `com.adrianramos.ytlooper` (or the final registered identifier) and a private SKU.
2. Upload the Safari extension ZIP through Safari Web Extension Packager, or archive/sign the
   generated Xcode containing app and upload that build.
3. Add the localized product text, privacy/support URLs, App Privacy answers and the prepared opaque
   1280×800 screenshots, which match Apple's current accepted 16:10 Mac size.
4. Exercise the build through TestFlight, complete export/compliance and content-rating questions,
   select the build and submit it for App Review.

## Official references checked on 13 August 2026

- [Mozilla add-on policies](https://extensionworkshop.com/documentation/publish/add-on-policies/)
- [Mozilla source-code submission](https://extensionworkshop.com/documentation/publish/source-code-submission/)
- [Firefox built-in data consent](https://extensionworkshop.com/documentation/develop/firefox-builtin-data-consent/)
- [Chrome image requirements](https://developer.chrome.com/docs/webstore/images)
- [Chrome privacy fields](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy)
- [Chrome Web Store publishing](https://developer.chrome.com/docs/webstore)
- [Safari Web Extension Packager](https://developer.apple.com/documentation/safariservices/packaging-and-distributing-safari-web-extensions-with-app-store-connect)
- [Safari extension distribution](https://developer.apple.com/documentation/safariservices/distributing-your-safari-web-extension)
- [App Store screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)
