# Media Sharing: TV Mode, WebDAV and DLNA

Read-only access to project albums from TVs and file managers. User docs:
`docs-site/integrations/tv-and-devices.md`.

## Pieces

| Path | Role |
| :--- | :--- |
| `server/media-share/catalog.ts` | `MediaCatalog`: projects → folders, album items → files. Scope (`null` = every active project, or explicit ids), stable folder/file names, tag lists, update stamps. Every protocol goes through it. |
| `server/media-share/device-auth.ts` | `MediaDevice` tokens (`rsm_…`, SHA-256 stored). A token opens only its own kind (`tv` / `webdav`); DLNA servers are addressed by id. |
| `server/media-share/media-stream.ts` | Relays S3 objects with single byte ranges, ETag/304 and extra headers. Used by WebDAV and DLNA; TV mode uses presigned URLs like the web app. |
| `server/media-share/media-router.ts` | `/api/media-devices` (manage), `/api/media-pairings/:code` (approve a TV), `/api/tv/*` (pairing + TV API). |
| `server/media-share/webdav-router.ts` | `/dav/`: OPTIONS, PROPFIND, GET, HEAD. Basic auth, password = token. |
| `server/media-share/dlna/` | `DlnaService` (its own HTTP listener on `DLNA_HTTP_PORT`, routes under `/dlna/:id/`: SOAP, eventing, media), `ssdp.ts` (discovery), `content-directory.ts` (object tree + DIDL-Lite), `xml.ts` (descriptions, SCPDs). |
| `server/media-share/tv-app.ts` | Serves `/tv`; builds `src/tv` with esbuild on request in development, reads `dist/tv` in production. |
| `src/tv/` | The TV page: vanilla TypeScript, no React/Tailwind. Built by `scripts/build-tv.mjs` as an IIFE for Chromium 53. |
| `src/components/media-share/`, `src/pages/LinkTv.tsx` | Account → TV & devices tab and the `/link` approval page. |

## Rules

- Keep `src/tv` framework-free and within Chromium 53: flexbox without `gap`, no CSS grid, no library methods newer than the polyfills in `src/tv/polyfills.ts`. `node -e` + `acorn` parsing `dist/tv/tv.js` as ES2016 is a quick check.
- DLNA object ids: `0`, `recent`, `p:<projectId>`, `pt:<projectId>` (Tags), `t:<projectId>:<base64url tag>`, `i:<itemId>`. `childCount` must be exact; some TVs page by it.
- File names come from `fileNameFor` and end with the first 8 hex chars of the item id, which `findItemByFileName` resolves. Changing the format breaks clients' cached paths.
- Duplicate project names are disambiguated by creation order, never activity, so a folder's name does not change when another project gets new items.
- DLNA never shares the main port: a reverse proxy in front of `PORT` would make every request look local. It answers only direct (no forwarding headers) `isLocalPeer` requests, and only when `DLNA_ENABLED` is set. SSDP ignores M-SEARCH from non-local sources.
