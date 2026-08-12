# Install the ZIP on Firefox

[Español](/AdriRRP/yt-looper/wiki/Instalacion-Firefox-ES) ·
[Back to welcome](/AdriRRP/yt-looper/wiki/Welcome-EN)

> **Important:** an unsigned ZIP is loaded as a temporary add-on and disappears when Firefox
> restarts. Permanent installation will require a Mozilla-signed release.

## Download

1. Open [Releases](https://github.com/AdriRRP/yt-looper/releases) and select the latest version.
2. Under **Assets**, download `yt-looper-firefox-vX.Y.Z.zip`.
3. Optionally download `SHA256SUMS` and compare the SHA-256 before installing.
4. Extract the ZIP to a folder that will remain available for the session.

If no release is listed yet, the project has not published its first public package. Do not use the
Chrome or Safari ZIP because each package contains a browser-specific manifest.

## Load temporarily

1. Enter `about:debugging#/runtime/this-firefox` in the address bar.
2. Click **Load Temporary Add-on…**.
3. Select `manifest.json` from the extracted folder.
4. Open a regular YouTube video and confirm that YT Looper appears.
5. If its icon is inside the extensions menu, pin it to the toolbar for quick library access.

Firefox keeps the add-on only until the next restart. To reload the same build during the session,
return to `about:debugging` and click **Reload**.

## Private windows

Firefox disables extensions in private browsing by default. If required, open `about:addons`, select
YT Looper, and enable **Run in Private Windows**.

## Verify the download

macOS or Linux:

```bash
shasum -a 256 yt-looper-firefox-vX.Y.Z.zip
```

Windows PowerShell:

```powershell
Get-FileHash .\yt-looper-firefox-vX.Y.Z.zip -Algorithm SHA256
```

Compare the result with the matching line in `SHA256SUMS`.

## Official reference

Mozilla documents this process in
[Your first extension](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/Your_first_WebExtension#installing).

If the widget does not appear, see
[Troubleshooting and privacy](/AdriRRP/yt-looper/wiki/Troubleshooting-and-privacy-EN).
