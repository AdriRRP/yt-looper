# Safari development

YT Looper ships a desktop Safari Manifest V3 build that shares its TypeScript, popup, content
scripts, storage format, localization and tests with Firefox and Chrome.

Safari's Manifest V3 package declares the coordinator with `background.scripts`. Safari treats MV3
background pages as nonpersistent, and this form follows Apple's Safari manifest guidance while
keeping the same event-driven coordinator behavior as Firefox and Chrome.

## Temporary installation

Build the extension:

```bash
npm run build:safari
```

In Safari 17 or later:

1. Open **Safari → Settings → Developer**.
2. If the Developer tab is missing, enable web developer features from Safari's Advanced settings.
3. Choose **Add Temporary Extension…**.
4. Select `dist/safari` or `artifacts/safari/yt_looper-<version>.zip`.
5. Enable YT Looper and allow access to `youtube.com` when Safari requests it.

Safari removes temporary extensions when Safari quits or after 24 hours. Use **Reload** in the
extension settings after rebuilding.

## Native macOS wrapper

Permanent installation and distribution require a containing macOS app. Install full Xcode, make it
the active developer directory, and generate a macOS-only Swift project:

```bash
sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
npm run safari:project -- --bundle-id=com.example.ytlooper
```

After the project exists, preserve its signing and Xcode settings while refreshing only the built
extension resources with:

```bash
npm run safari:sync
```

Replace `com.example.ytlooper` with a bundle identifier belonging to the selected Apple Developer
team. By default the generated project is written to `safari-app`; use `--output=/absolute/path` to
choose another location.

The generator copies the built resources into the Xcode project, creates no mobile target, and does
not overwrite an existing project automatically. Select a Development Team for both the app and
extension targets before building in Xcode.

## Distribution

The temporary ZIP is for development only. Public distribution requires signing the containing app
and delivering it through the Mac App Store or as a Developer ID-signed and notarized app.

The Safari build requests only local extension storage, access to the active tab, clipboard writes,
and the explicit `https://www.youtube.com/*` host permission.
