# Browser Extension

Remix Studio ships a **browser importer extension** (`Remix Studio Importer`) that sends images and text from any web page straight into your Remix Studio [library](/concepts/libraries) or [project](/concepts/projects).

## What It Does

From any page, you can capture content and push it into your workspace:

- **Images** — send a picture into an image library or a project.
- **Text** — send selected text into a text library.

The extension adds **right-click context menu** actions and uses an options page to point at your Remix Studio instance.

## Where to Get It

The extension is a Manifest V3 extension. There is no Chrome Web Store listing — you install it manually from one of two sources:

### Option A — Download from GitHub Releases (recommended)

Every tagged release attaches a packaged **`remix-studio-chrome-extension.zip`** to the [GitHub Releases](https://github.com/ShinChven/remix-studio/releases) page (look under each release's **Assets**).

1. Download `remix-studio-chrome-extension.zip` from the latest release.
2. Unzip it to a folder you can keep around.
3. Open `chrome://extensions` in a Chromium-based browser (Chrome, Edge, Brave, …).
4. Enable **Developer mode** (top-right toggle).
5. Click **Load unpacked** and select the unzipped folder.

### Option B — Load from the repository

The extension source also lives in the [`chrome-extension/`](https://github.com/ShinChven/remix-studio/tree/main/chrome-extension) directory of the repository, so you can load it straight from a checkout:

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `chrome-extension/` folder.

## Configuring It

After loading, open the extension's **Options** page and enter your Remix Studio URL and access details so it knows where to send content.

## In-App Import

The app also has an **Extension Import** view that receives content sent from the extension, so imported items land in the right library or project.

## Permissions

The extension requests `contextMenus`, `storage`, `activeTab`, and `scripting`, with host access to pages so it can read the image or text you choose to send.

## On Mobile?

The browser extension is for desktop Chromium browsers. On Android (and other mobile platforms), use the **system share sheet** instead — Remix Studio is an installable PWA that registers as a share target. See [Mobile Share (PWA)](/integrations/mobile-share).
