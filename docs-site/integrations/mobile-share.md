# Mobile Share (PWA)

On Android and other mobile platforms, Remix Studio acts as a **Progressive Web App (PWA) share target**. Once installed to your home screen, it appears in the system **share sheet**, so you can send an image, text, or link from any app straight into Remix Studio — the mobile equivalent of the desktop [browser extension](/integrations/chrome-extension).

## What You Can Share

The share target accepts:

- **Images** — the manifest can receive one or more `image/*` files, but the current Share screen hands off only the first image and warns when more were received.
- **Text** — selected text.
- **URLs** — a shared link.
- **Title** — the shared item's title, when the source app provides one.

## 1. Install Remix Studio as an App

Share targets only appear once the PWA is installed. On Android (Chrome), open the browser menu (⋮) and tap **Install app** / **Add to Home screen**.

For the full step-by-step on every platform, see [Install as an App (PWA)](/guide/install-pwa).

::: tip
Installability requires the app to be served over **HTTPS** (or `localhost`). A self-hosted deployment behind TLS works; plain-HTTP origins on a LAN may not offer installation.
:::

## 2. Share Into Remix Studio

1. In any app (Photos, a browser, a social app, …), tap the system **Share** button.
2. Choose **Remix Studio** from the share sheet.
3. Remix Studio opens and receives the shared content.

## 3. What Happens to Shared Content

Under the hood, the flow is:

1. The system posts the shared data to Remix Studio's `/share-target` endpoint.
2. The app's **service worker** intercepts that request, stashes the files and metadata (title, text, URL) in a temporary cache, and redirects to the in-app **`/share`** screen. Every posted field is read, whatever the sending app names it; a photo handed over as `application/octet-stream` takes its type from the file name; and when the browser's own form parser yields nothing — as it does on some Pixel phones — the worker parses the multipart body itself.
3. The Share screen reads the cached payload and presents the available destinations.
4. Choose **Save to Library or Project** to open the Import view (`/import`, the same destination used by the [browser extension](/integrations/chrome-extension)), or **Start a Chat** to place the content in the assistant composer.
5. The Import view offers only destinations matching the handoff type. Saving to a project appends a direct workflow input; it does not create an album result.

Only the most recent share is held. The Share screen reads it without deleting it, so a refresh, a back navigation or a second load while sign-in resolves still finds the image; the share is cleared once it has been used or cancelled, or after fifteen minutes. One Android share can reach the service worker more than once, and an empty repeat never replaces a usable share from the same launch. The hand-off to Import or Chat goes through the Cache API rather than session storage, whose ~5 MB quota a gallery photo can exceed.

When a share really is empty, the screen says what arrived — zero bytes from the sending app, or a file the browser could not open — and suggests sharing from the gallery, or saving the image first and sharing the saved copy.

::: warning Multiple images
Although Android may send several image files, Remix Studio currently previews and forwards only the first. Import the remaining images separately.
:::

## Requirements & Notes

- The app is configured with `display: standalone` and registers a service worker (`sw.js`), so it installs and runs like a native app.
- Share-target support depends on the platform and browser. **Android Chrome** is the primary supported path; iOS Safari does not currently support the Web Share Target API, so on iOS use the app in the browser and import manually or via the desktop extension.
- You must be **signed in** for the import to land in your account.
- Sharing into Chat fills the composer; it does not automatically send a model request.

## Related

- [Browser Extension](/integrations/chrome-extension) — the desktop equivalent.
- [Libraries & Prompts](/concepts/libraries) and [Projects & Albums](/concepts/projects) — where shared content lands.
