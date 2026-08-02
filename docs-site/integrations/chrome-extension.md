# Browser Extension

The **Remix Studio Importer** is an unpacked Manifest V3 extension for Chromium-based desktop browsers. It adds context-menu actions that hand selected text or a page image to either the workspace importer or the assistant composer.

## Capture Actions

Right-click supported page content:

| Page content | Import action | Chat action |
| :--- | :--- | :--- |
| Image | **Send image to Remix Studio** | **Send image to Remix Studio Chat** |
| Selected text | **Send text to Remix Studio** | **Send text to Remix Studio Chat** |

For an image, the extension fetches the image URL, converts the bytes to a data URL, and tries to use the image's `alt` text as its name. If no alt text is available, it falls back to the URL filename.

For selected text, it copies the current selection. The extension captures one context-menu item per action; it is not a bulk page scraper.

## Installation

There is no Chrome Web Store listing. Install an unpacked copy:

### Release archive

1. Download `remix-studio-chrome-extension.zip` from a tagged [GitHub Release](https://github.com/ShinChven/remix-studio/releases).
2. Extract it to a directory that will remain on disk.
3. Open `chrome://extensions` (or the equivalent extension page in Edge/Brave).
4. Enable **Developer mode**.
5. Choose **Load unpacked** and select the extracted directory.

### Repository checkout

Follow the same browser steps but select the repository's `chrome-extension/` directory. After pulling extension changes, return to the extension page and press **Reload**.

## Configuration

Open the extension's **Options** page and enter only the Remix Studio origin, for example:

```text
https://studio.example.com
```

The option is stored with Chrome sync storage and defaults to `http://localhost:3000`. A trailing slash is removed. Do not include `/import`, `/assistant`, or another path.

The extension does not store a Remix Studio password or API token. It opens the configured site in a new tab, so that browser profile must already have—or complete—a normal Remix Studio login session.

## Import Destination Flow

The normal import action opens `/import`, where you can:

- Preview and name the captured item.
- Save text into a text library or text project.
- Save an image into an image library or image project.
- Create a compatible library/project from the import screen.

Saving to a library creates a new library item. Saving to a project uploads the image when needed and appends a new direct workflow step; it does not create a finished album result or start generation.

The screen remembers the most recent destination type and compatible destination ID separately for image and text imports.

## Assistant Flow

The Chat action opens `/assistant?from=extension`.

- Selected text becomes composer text.
- An image is compressed for assistant attachment, and its captured name can seed empty composer text.

The content is placed in the composer but is not automatically sent. Choose the provider/model, review the prompt/attachment, and send when ready.

## How the Handoff Works

1. The background service worker writes one payload to extension-local storage.
2. It opens the configured Remix Studio route.
3. The content script recognizes that exact configured origin/route and posts the payload into the page.
4. Remix Studio acknowledges receipt.
5. The extension clears the stored payload.

The content script retries the handoff briefly while the React application starts. Only one stored payload exists, so starting another import before the first is consumed replaces the earlier payload.

## Permissions and Security

The manifest requests:

- `contextMenus` — add capture actions.
- `storage` — save the configured origin and pending handoff.
- `activeTab` / `scripting` — interact with the page selected by the user.
- `<all_urls>` host access plus a content script on all pages — read image alt text and deliver the payload when the configured Remix Studio page opens.

The broad host permission also allows the background worker to fetch a chosen page image. Some sites block extension fetches, use authenticated blob URLs, or serve protected/short-lived URLs; those images may fail to import.

::: warning
Install only a trusted copy. Like any extension with all-site access, it can observe the pages covered by its content script. Review `manifest.json`, `background.js`, and `content.js` if you distribute a modified build.
:::

## Troubleshooting

- **No menu item**: reload the extension, then reload the page.
- **Wrong Remix Studio host**: correct the origin in Options; do not add a trailing path.
- **Login page opens**: sign in in the same browser profile, then repeat the capture.
- **No import data found**: the handoff was consumed, overwritten, or the configured origin did not match the opened page.
- **Image capture fails**: download the image locally and upload it in Remix Studio; the site may block cross-origin extension fetching.
- **Updated source does not run**: use **Reload** on `chrome://extensions`.

## Mobile Alternative

Desktop Chromium is the supported extension path. On Android, install Remix Studio as a PWA and use the system share sheet. See [Mobile Share](/integrations/mobile-share).
