# IdeaVault

**A privacy-first notes extension for Google Chrome.** Select text on any page, save it to a side panel, organize it, and search it later. Everything stays on your device.

> **Status: pre-launch.** IdeaVault is a productivity browser extension that is not yet published on the Chrome Web Store. This repository contains the complete source code under review.

## What it does

- Save any selected text with the right-click menu (**Save to IdeaVault**).
- Write manual notes directly in the Chrome side panel.
- Search notes by text or source URL.
- Export all notes as a local JSON backup.
- Light and dark themes that follow the system setting.

## Free and Pro

| Feature | Free | Pro |
|---|---|---|
| Notes | Up to 50 | Unlimited |
| Search and JSON export | Yes | Yes |
| Custom categories | No | Yes |
| Category filter | No | Yes |

Pro is a one-time digital product sold through **Lemon Squeezy** (Store ID `512524`, Product ID `1503410`, seller: NexusMediaLab). After purchase, the customer receives a license key by email and enters it in the side panel.

## How licensing works

IdeaVault has no backend of its own. License handling uses the public [Lemon Squeezy License API](https://docs.lemonsqueezy.com/api/license-api) directly from the extension:

1. **Activate**: the key is sent to `/v1/licenses/activate` together with a random instance name. The response is checked against our Store ID and Product ID, so keys from other products are rejected.
2. **Validate**: at most once every 24 hours, the key and instance ID are re-checked with `/v1/licenses/validate`. If the network is unavailable, Pro stays active.
3. **Deactivate**: the user can release the key from the panel (`/v1/licenses/deactivate`) and reuse it on another device.

Payments, receipts, and license issuing are handled entirely by Lemon Squeezy. The extension never sees payment details.

## Privacy

- Notes are stored only in `chrome.storage.local` on the user's device.
- No accounts, analytics, trackers, or remote servers operated by us.
- Notes are never uploaded or shared.
- The **only** network requests go to `api.lemonsqueezy.com`, when the user activates, validates, or deactivates a license. These requests contain only the license key and an instance ID.

## Permissions

| Permission | Why it is needed |
|---|---|
| `sidePanel` | Shows the notes interface in Chrome's side panel. |
| `contextMenus` | Adds the "Save to IdeaVault" right-click option. |
| `storage` | Saves notes, categories, and license state locally. |
| `https://api.lemonsqueezy.com/*` | License activation, validation, and deactivation. |

## Install for review (unpacked)

1. Clone or download this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder.
4. Click the IdeaVault toolbar icon to open the side panel.

Requires Chrome 116 or later (Manifest V3).

## Project structure

```
manifest.json   Extension manifest (MV3)
background.js   Service worker: context menu, note saving, deletion
panel.html      Side panel interface and styles
panel.js        Panel logic, categories, export, Lemon Squeezy licensing (see CONFIG)
icons/          Extension icons (16, 48, 128 px)
PRIVACY.md      Privacy policy
```

## Contact

NexusMediaLab, [nexusmedialab04@gmail.com]

## License

Copyright © 2026 NexusMediaLab. All rights reserved.
