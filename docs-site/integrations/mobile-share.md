# Mobile Share (PWA)

On Android and other mobile platforms, Remix Studio acts as a **Progressive Web App (PWA) share target**. Once installed to your home screen, it appears in the system **share sheet**, so you can send an image, text, or link from any app straight into Remix Studio — the mobile equivalent of the desktop [browser extension](/integrations/chrome-extension).

## What You Can Share

The share target accepts:

- **Images** — one or more image files (the manifest accepts `image/*`).
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
2. The app's **service worker** intercepts that request, stashes the files and metadata (title, text, URL) in a temporary cache, and redirects to the in-app **`/share`** screen.
3. The Share screen reads the cached payload and forwards it to the **Import** view (`/import`) — the same destination used by the [browser extension](/integrations/chrome-extension).
4. From there you choose the target **library** or **project**, and the content is imported.

Because the hand-off goes through a one-shot cache that is cleared on each new share, only your most recently shared payload is held, and it is consumed as soon as the Import view picks it up.

## Requirements & Notes

- The app is configured with `display: standalone` and registers a service worker (`sw.js`), so it installs and runs like a native app.
- Share-target support depends on the platform and browser. **Android Chrome** is the primary supported path; iOS Safari does not currently support the Web Share Target API, so on iOS use the app in the browser and import manually or via the desktop extension.
- You must be **signed in** for the import to land in your account.

## Related

- [Browser Extension](/integrations/chrome-extension) — the desktop equivalent.
- [Libraries & Prompts](/concepts/libraries) and [Projects & Albums](/concepts/projects) — where shared content lands.
