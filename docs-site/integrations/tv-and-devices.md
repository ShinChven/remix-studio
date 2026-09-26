# TV, WebDAV & DLNA

Your project albums can be watched on a TV or opened from a file manager, in three ways. All three are read-only, and each device only sees the projects you choose for it: every active project (including ones you create later), or a fixed list. Manage everything under **Account → TV & devices**.

| | TV mode | WebDAV | DLNA |
| :--- | :--- | :--- | :--- |
| **Works on** | Any TV or device with a web browser | Finder, Windows Explorer, Infuse, rclone, TV file managers | The TV's own photo & video app |
| **Install** | Nothing (optional LG app) | Nothing | Nothing |
| **Sign-in** | Link once with a code | User name + token | None (local network only) |
| **Network** | Anywhere the server is reachable | Anywhere the server is reachable | Same local network, host networking |
| **Best for** | Slideshows, tags, videos with a remote | Browsing and copying files | "It just shows up on the TV" |

## TV mode

A full-screen viewer made for remote controls: albums as a grid, filters for photos, videos and tags, slideshows with adjustable speed, and video playback.

1. On the TV, open `https://<your-server>/tv` in the web browser.
2. The TV shows a QR code and an 8-character code. Scan the QR code with your phone, or open `https://<your-server>/link` and type the code.
3. Sign in if asked, pick the projects the TV may show, and press **Link TV**.

The TV remembers the link. To unlink it, use **Settings → Unlink this TV** on the TV, or remove it under **Account → TV & devices**.

### Remote control

| Key | Albums and grids | Viewer |
| :--- | :--- | :--- |
| Arrows | Move focus | ◀ ▶ previous / next, ▲ ▼ show details |
| OK | Open | Show or hide details; play or pause a video |
| ▶ / ❚❚ | In an album, start a slideshow from the focused item | Start or pause the slideshow |
| Back | Go back | Close the viewer |
| Channel ▲ ▼ | Scroll a page | |

The LG Magic Remote pointer works too: point to focus, click to open, and click the viewer to advance.

TV mode is built for old TV browsers as well as new ones: it targets the browser engine of LG webOS 4 (2018) and later, and needs nothing beyond what comparable TV browsers offer. Photos are shown from their 2048-pixel rendition, which every TV decodes quickly. Videos play in the TV's own player, so the TV must support the video's codec; H.264 MP4, which most providers return, plays everywhere.

::: tip Media links
Images and videos are loaded straight from storage with presigned links, exactly as the web app does. If the web app shows your media in a browser on the same network as the TV, TV mode will too. If not, check `S3_PUBLIC_ENDPOINT`.
:::

### Install as an LG TV app

TV mode can also sit on the webOS home screen as its own app. The app only opens your server's `/tv` page, so it never needs updating when Remix Studio does.

1. Put the TV in developer mode with LG's **Developer Mode** app and install the webOS TV CLI from [LG's developer site](https://webostv.developer.lge.com/).
2. Build the app with your server address:

   ```bash
   node scripts/package-webos.mjs --url https://remix.example.com
   ares-package dist/webos-app
   ares-install --device tv io.remixstudio.tv_1.0.0_all.ipk
   ```

## WebDAV

The albums appear as a read-only network drive: one folder per project, one file per album item, named by date and prompt (`20260925-143012_a-cat-on-the-moon_1a2b3c4d.png`). Files are the originals.

1. Under **Account → TV & devices → WebDAV**, add an access token and copy it. It is shown only once.
2. Connect to `https://<your-server>/dav/` with any user name and the token as the password.

| Client | How |
| :--- | :--- |
| macOS Finder | **Go → Connect to Server…**, enter the address |
| Windows Explorer | **This PC → Map network drive**, enter the address. Windows only sends passwords over HTTPS. |
| Infuse, Kodi | Add a WebDAV share |
| rclone | `rclone config` → WebDAV, vendor "other" |
| TV file managers | Add a WebDAV network location, where the app supports it |

## DLNA

DLNA puts a media server on your local network that TVs find by themselves: it appears as a source in the TV's photo and video app (on LG, **Photo & Video**; on Samsung, **Media**). Inside it are **Recent** and one folder per project; a project with tagged items also has a **Tags** folder.

DLNA is off by default and needs:

- **The same local network.** Discovery uses UDP multicast, which does not cross routers or the internet. Remix Studio has to run on a machine in your home network, such as a NAS.
- **Host networking.** Docker's default bridge network does not forward multicast. Start the app with the DLNA override (Linux hosts only):

  ```bash
  docker compose -f docker-compose.yml -f docker-compose.dlna.yml --profile app up -d
  ```

  Outside Docker, set `DLNA_ENABLED=true`.

Then add a DLNA server under **Account → TV & devices → DLNA**. Its name is what the TV shows. You can run several, for example one per family member with different projects.

::: warning DLNA has no passwords
Anyone on your local network can browse a DLNA server. Remix Studio serves DLNA on its own port (`DLNA_HTTP_PORT`), which a reverse proxy should never publish, and answers only direct requests from private and directly connected addresses. Inside your network there is no further protection, so limit each server's projects if that matters.
:::

If the TV does not list the server:

- Check that **Account → TV & devices** says *Announcing on* with an address on the TV's network. If there are several interfaces, pick the right one with `DLNA_INTERFACES`.
- Make sure the host firewall lets the local network reach UDP port 1900 and the DLNA port (`DLNA_HTTP_PORT`, by default the app's port + 1, e.g. 3001).
- Some TVs rescan only when their media app opens: close and reopen it.
