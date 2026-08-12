# Install the ZIP on Chrome

[Español](/AdriRRP/yt-looper/wiki/Instalacion-Chrome-ES) ·
[Back to welcome](/AdriRRP/yt-looper/wiki/Welcome-EN)

Chrome can load the extracted package in developer mode. It remains available across restarts while
the folder is kept in place and the extension is not removed from `chrome://extensions`.

## Download and extract

1. Open [Releases](https://github.com/AdriRRP/yt-looper/releases) and select the latest version.
2. Under **Assets**, download `yt-looper-chrome-vX.Y.Z.zip`.
3. Extract it. `manifest.json` must be at the root of the resulting folder.
4. Optionally verify its hash using `SHA256SUMS`.

If no release is listed yet, the project has not published its first public package.

## Load in Chrome

1. Enter `chrome://extensions` in the address bar.
2. Enable **Developer mode** in the top-right corner.
3. Click **Load unpacked**.
4. Select the folder containing `manifest.json`, not the ZIP or a parent folder.
5. Open the extensions puzzle menu and pin YT Looper to the toolbar.
6. Open a regular YouTube video. Reload once if the tab was already open during installation.

To update manually, replace the folder contents with a new release and click YT Looper's reload icon
on `chrome://extensions`.

## Verify the download

macOS or Linux:

```bash
shasum -a 256 yt-looper-chrome-vX.Y.Z.zip
```

Windows PowerShell:

```powershell
Get-FileHash .\yt-looper-chrome-vX.Y.Z.zip -Algorithm SHA256
```

Compare the result with the matching line in `SHA256SUMS`.

## Official reference

Google documents local loading in
[Load an unpacked extension](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world#load-unpacked).

If Chrome reports a manifest error, confirm that the Chrome ZIP was used and see
[Troubleshooting and privacy](/AdriRRP/yt-looper/wiki/Troubleshooting-and-privacy-EN).
