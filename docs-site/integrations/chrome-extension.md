# Browser Extension

Remix Studio ships a **browser importer extension** (`Remix Studio Importer`) that sends images and text from any web page straight into your Remix Studio [library](/concepts/libraries) or [project](/concepts/projects).

## What It Does

From any page, you can capture content and push it into your workspace:

- **Images** — send a picture into an image library or a project.
- **Text** — send selected text into a text library.

The extension adds **right-click context menu** actions and uses an options page to point at your Remix Studio instance.

## Installing (Unpacked)

The extension lives in the `chrome-extension/` directory of the repository. It is a Manifest V3 extension.

1. Open `chrome://extensions` in a Chromium-based browser.
2. Enable **Developer mode**.
3. Click **Load unpacked** and select the `chrome-extension/` folder.
4. Open the extension's **Options** page and enter your Remix Studio URL and access details.

## In-App Import

The app also has an **Extension Import** view that receives content sent from the extension, so imported items land in the right library or project.

## Permissions

The extension requests `contextMenus`, `storage`, `activeTab`, and `scripting`, with host access to pages so it can read the image or text you choose to send.
