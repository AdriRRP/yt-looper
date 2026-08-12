# Install the ZIP on Safari for macOS

[Español](/AdriRRP/yt-looper/wiki/Instalacion-Safari-ES) ·
[Back to welcome](/AdriRRP/yt-looper/wiki/Welcome-EN)

> **Important:** Safari accepts this ZIP as a temporary development extension. It is removed when
> Safari quits or after 24 hours. Permanent installation requires a signed macOS app distributed
> through Apple's supported workflow.

## Download

1. Open [Releases](https://github.com/AdriRRP/yt-looper/releases) and select the latest version.
2. Under **Assets**, download `yt-looper-safari-vX.Y.Z.zip`.
3. Safari can select the ZIP directly. If that fails, extract it and select the folder containing
   `manifest.json`.
4. Optionally compare its hash with `SHA256SUMS`.

If no release is listed yet, the project has not published its first public package.

## Show developer settings

1. Open **Safari → Settings → Advanced**.
2. Enable **Show features for web developers**.
3. Open the new **Developer** settings tab.
4. Enable **Allow unsigned extensions**. macOS may request authentication.

## Add the extension

1. Under **Safari → Settings → Developer**, click **Add Temporary Extension…**.
2. Select `yt-looper-safari-vX.Y.Z.zip` or its extracted folder.
3. In **Settings → Extensions**, enable YT Looper if necessary.
4. Allow access to `youtube.com` when Safari asks.
5. Open or reload a regular YouTube video.

**Allow unsigned extensions** also resets when Safari quits, so it may need to be enabled again in
the next session.

## Verify the download

```bash
shasum -a 256 yt-looper-safari-vX.Y.Z.zip
```

Compare the result with the matching line in `SHA256SUMS`.

## Official reference

Apple describes temporary loading and its limits in
[Running your Safari web extension](https://developer.apple.com/documentation/safariservices/running-your-safari-web-extension).

For permission or missing-icon problems, see
[Troubleshooting and privacy](/AdriRRP/yt-looper/wiki/Troubleshooting-and-privacy-EN).
