# Install as an App (PWA)

Remix Studio is a **Progressive Web App (PWA)**. You can install it to your computer or phone so it launches from its own icon in a standalone window — no browser tabs, address bar, or clutter — and on Android it registers in the system share sheet for [mobile sharing](/integrations/mobile-share).

There is nothing to download from an app store. Installation happens straight from your browser.

## What You Get

- A dedicated **app icon** on your dock, taskbar, Start menu, or home screen.
- A **standalone window** (`display: standalone`) that looks and feels like a native app.
- Its own window switching / app-switcher entry.
- On Android: Remix Studio appears as a **share target** so you can send images, text, and links into it.

## Requirements

::: tip
The install option only appears when the app is served over **HTTPS** (or `http://localhost` for development). A self-hosted deployment behind TLS qualifies; a plain-HTTP origin on a LAN usually will not offer installation.
:::

You should also **sign in** at least once so the installed app opens to your workspace.

---

## Desktop

### Chrome, Edge, Brave, and other Chromium browsers

1. Open your Remix Studio URL and sign in.
2. Look for the **install icon** (a monitor with a down-arrow, or ⊕) at the right end of the address bar.
   - No icon? Open the browser menu (⋮) → **Install Remix Studio…** / **Apps → Install this site as an app**.
3. Click **Install** and confirm.
4. Remix Studio opens in its own window and is added to your applications (Dock / Start menu / taskbar).

### Safari on macOS (Sonoma 14+)

1. Open Remix Studio in Safari and sign in.
2. From the menu bar choose **File → Add to Dock…**
3. Confirm the name and click **Add**.
4. Launch it from the Dock or Launchpad like any app.

### Firefox (desktop)

Desktop Firefox does **not** support installing PWAs out of the box. Use a Chromium browser or Safari to install, or simply run Remix Studio in a normal Firefox tab.

---

## Android

### Chrome (and Chromium browsers)

1. Open your Remix Studio URL in Chrome and sign in.
2. Open the browser menu (⋮) and tap **Install app** or **Add to Home screen**.
3. Confirm. Remix Studio is added to your home screen and app drawer.
4. Once installed, it also appears in the **share sheet** — see [Mobile Share (PWA)](/integrations/mobile-share).

### Firefox / Samsung Internet (Android)

These browsers also support **Add to Home screen** from their menus, though share-target behavior is best on Chrome.

---

## iOS & iPadOS

On iPhone and iPad, only **Safari** can install web apps.

1. Open Remix Studio in **Safari** and sign in.
2. Tap the **Share** button (the square with an up-arrow).
3. Scroll down and tap **Add to Home Screen**.
4. Confirm the name and tap **Add**.
5. Launch Remix Studio from its home-screen icon — it runs full-screen without Safari chrome.

::: warning
iOS/iPadOS does not support the Web Share **Target** API, so you cannot share *into* Remix Studio from other apps the way you can on Android. The installed app still works for everything else; import content via the [browser extension](/integrations/chrome-extension) on desktop or manually.
:::

---

## Uninstalling

- **Desktop (Chromium)**: open the installed app → menu (⋮) → **Uninstall Remix Studio**, or remove it from `chrome://apps`.
- **macOS Safari**: remove it from the Dock / Launchpad like any app.
- **Android**: long-press the icon → **Uninstall** / **Remove**.
- **iOS/iPadOS**: long-press the home-screen icon → **Remove App → Delete App**.

## Troubleshooting

| Symptom | Likely cause / fix |
| :--- | :--- |
| No install icon or menu item | The site must be served over HTTPS (or `localhost`). Check your reverse-proxy TLS setup. |
| "Install" missing in Chrome | It may already be installed — check `chrome://apps`. |
| Installed app shows a login screen each launch | Sign in once inside the installed app; sessions are per-app-context. |
| iOS won't show "Add to Home Screen" | You must use **Safari**, not Chrome/Firefox on iOS. |
| Updates don't appear | The service worker caches assets; fully close and reopen the app, or reload, to pick up a new version. |

## Related

- [Mobile Share (PWA)](/integrations/mobile-share) — share images, text, and links into Remix Studio on Android.
- [Accounts & Security](/guide/account-and-security) — signing in and sessions.
