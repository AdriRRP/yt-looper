# Troubleshooting, limits, and privacy

[Español](/AdriRRP/yt-looper/wiki/Ayuda-y-privacidad-ES) ·
[Welcome](/AdriRRP/yt-looper/wiki/Welcome-EN)

## The widget does not appear

1. Confirm that the URL is a regular `https://www.youtube.com/watch?...` page.
2. Reload the tab if the extension was installed or updated while YouTube was already open.
3. Confirm that YT Looper is enabled and has permission for `youtube.com`.
4. If it was closed with the X, open the popup and click **Show panel**.
5. With no A/B points, starting collapsed is expected.

## Only a spinner is visible

YouTube is playing or finishing an advertisement. YT Looper waits so it does not seek within or
change the speed of the ad. Controls return when YouTube restores the main video.

## Saving is unavailable

- A and B must form a valid range, with B after A.
- The same video, A, B, and speed combination can only be stored once.
- A green badge means the loop is already saved.
- An orange badge offers an update action for A, B, and speed.
- Use the badge X to detach it and create a new fragment without deleting the original.

## A shortcut does not work

Try the equivalent widget control. The operating system, browser, or another extension may reserve
the combination. On macOS, use **Option (⌥)** rather than looking for a key labelled Alt.

## A shared link does not load its loop

- Confirm that YT Looper is installed and enabled.
- Open the complete link, including the `#ytl=…` fragment.
- Do not manually edit the payload; invalid values are rejected for safety.
- If YouTube was already open, try pasting the link into a new tab.

## The ZIP will not install permanently

This is expected for unsigned packages:

- Firefox removes temporary add-ons after restart.
- Chrome loads the folder in developer mode.
- Safari removes temporary extensions when it quits or after 24 hours.

See the dedicated instructions for [Firefox](/AdriRRP/yt-looper/wiki/Install-Firefox-EN),
[Chrome](/AdriRRP/yt-looper/wiki/Install-Chrome-EN), or
[Safari](/AdriRRP/yt-looper/wiki/Install-Safari-EN).

## Privacy

YT Looper collects no telemetry, browsing history, video content, or personal information, and it
does not upload the library to a server. Loops, names, and folders are stored in the extension's
local browser storage. Shared links are generated locally and contain only a format version, A, B,
and speed. The video identifier remains in YouTube's normal `v` parameter.

The extension requests YouTube access to locate and control its video player. It does not download
remote code.

## Report a problem

Open a [GitHub issue](https://github.com/AdriRRP/yt-looper/issues) with the browser, browser
version, YT Looper version, an example URL, and reproduction steps. Do not publish private data or
links you do not want to share publicly.
