# Chrome Web Store — Submission Answers

Use the following text to fill the submission form. All statements apply to v0.0.1.

## Single Purpose
- Quickly stash tabs locally to read later and unclutter your browser.

## Single Purpose Description
- Tab Stash saves the current tab(s) to a local list on your device (IndexedDB), lets you search, tag, and restore them, and can optionally close tabs you just saved. It works offline, does not sync, and never contacts external servers.

## Permission Justifications
- tabs: Needed to read the active tab’s URL/title when you choose to stash, query open tabs to show New/Stashed status, close already‑stashed tabs on command, and open or focus a tab when restoring. No broad host permissions are requested and no content scripts are injected.
- storage: Used only for local settings (e.g., close‑after‑stash, options). Saved items live in IndexedDB; nothing is sent off the device.
- sidePanel: Required to display the optional Side Panel UI where users can stash and view counts while browsing.

## Remote Code
- No, I am not using remote code.
- Justification: All JS/CSS/assets are bundled with the extension. No external <script> tags, no dynamic eval/Function, and no code loaded from the network.

## Data Usage Disclosure (Public)
- Tab Stash does not collect, transmit, sell, or share any user data. All processing is local. Saved items (URL, title, status, tags, timestamps) are stored only in your browser (IndexedDB/chrome.storage.local). No analytics, no trackers, no third‑party services.
- Selection on the form: choose “No data is collected.” Do not select any categories.

## Privacy Policy URL
- https://github.com/iannuttall/tab-stash/blob/main/docs/privacy.md

## Contact
- Issues: https://github.com/iannuttall/tab-stash/issues
- Contact: https://x.com/iannuttall
