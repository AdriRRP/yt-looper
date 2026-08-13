# Marketplace listing — English

## Identity

- Name: `YT Looper`
- Category: Productivity
- Summary:
  `Loop precise A/B sections of YouTube videos at a custom speed and keep a local loop library.`
- Website: `https://github.com/AdriRRP/yt-looper`
- Support: `https://github.com/AdriRRP/yt-looper/issues`
- Privacy: `https://github.com/AdriRRP/yt-looper/blob/main/PRIVACY.md`

## Description

Practice music, languages, dance or any video detail by repeating exactly the section you need. Mark
A and B, choose a speed from 0.25× to 4×, and YT Looper preserves pitch while playing the section.

- Compact on-video widget and keyboard shortcuts.
- Local library with names, nested folders, editing and drag-and-drop organization.
- Shareable loop links with no account or server.
- Independent per-tab playback and concurrency-safe updates between windows.
- Automatic control suspension during advertisements.
- English and Spanish UI with no analytics, advertising or data transmission.

Every saved fragment remains in the browser's local extension storage. The extension operates only
on YouTube watch pages.

## Single purpose and permissions

Single purpose: create, play, organize and share precise A/B sections of YouTube videos at a custom
speed.

- `storage`: locally retains preferences, A/B points and the library created by the user.
- `activeTab`: lets the popup inspect and restore the widget in the active YouTube tab after an
  explicit user action.
- `clipboardWrite`: copies a generated loop link only when the user selects Share.
- `https://www.youtube.com/*`: injects the A/B controller exclusively into YouTube pages.
- Remote code: no; all executable JavaScript is included in the package.
- Data processed locally: video identifier and title, A/B points, speed, names and folders required
  for the user's library.
- Data transmitted, shared or collected off-device: none.

## Reviewer notes

Open any regular YouTube video. The widget remains collapsed until A or B is marked. Use its capture
buttons or `Alt/Option+Shift+A`, `Alt/Option+Shift+B` and `Alt/Option+Shift+L`. The toolbar button
opens the library. No account, payment or external setup is required.
