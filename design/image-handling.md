# Image Upload & Loading Guide

This document is the authoritative reference for how images are uploaded, stored, and displayed
in this application. **All AI agents and developers MUST read this before touching any image-related code.**

---

## Architecture Overview

Images are stored in **MinIO (S3-compatible object storage)**. The database (DynamoDB) stores only
the **S3 key** (a path string like `userId/projectId/filename.png`). Signed URLs are generated
on-demand by the server when returning data to the client.

```
Upload flow:   Browser → POST /api/images → MinIO (stores file) → returns { key, url }
Display flow:  Server API response → presigns key → client renders <img src={signedUrl}>
```

---

## ❌ DELETED: The `/api/images/view` Proxy

**This endpoint no longer exists. Do not recreate it.**

It was a legacy auth-proxied image server. Browser `<img>` tags do not send `Authorization`
headers — they only send cookies. This caused `{"error":"Invalid token"}` for most users.
It has been permanently removed. The route does not exist in `server/routes/images.ts`.

```ts
// ❌ WRONG — endpoint is gone, will 404
<img src={`/api/images/view?key=${encodeURIComponent(key)}`} />

// ❌ WRONG — imageDisplayUrl() logs an error and returns the bare key unchanged if you pass a key.
//            Do not pass bare S3 keys to imageDisplayUrl().
<img src={imageDisplayUrl(key)} />
```

`imageDisplayUrl()` in `src/api.ts` is now a **strict passthrough** — it logs an error to the
console if it receives a bare S3 key and returns it unchanged. It will never route to a proxy.

---

## ✅ Correct Pattern: Always Use Presigned MinIO URLs

All image URLs surfaced to the frontend must be presigned MinIO URLs. Presigned URLs:
- Are directly accessible by the browser (no auth headers needed)
- Expire after 1 hour (default — configurable in `S3Storage.getPresignedUrl`)
- Start with `http://` or `https://`

---

## Image Upload

### Frontend API — `saveImage(base64, scopeId)`

```ts
// src/api.ts
export async function saveImage(base64: string, scopeId: string): Promise<{ key: string; url: string }>
```

- `base64`: full data URI (`data:image/png;base64,...`)
- `scopeId`: project ID or library ID — used to namespace the S3 key
- Returns:
  - `key` — the raw S3 key (store this in DynamoDB)
  - `url` — a presigned MinIO URL (use this for immediate display)

### Upload Locations in the Codebase

| Component | Where | What's stored |
|---|---|---|
| `ProjectViewer.tsx` | Workflow image input (`handleImageUpload`) | `url` stored in `WorkflowItem.value` |
| `LibraryEditor.tsx` | Image library upload (`handleImageUpload`) | `key` stored in DB, `url` used for UI state |

> **Important:** `ProjectViewer` stores the presigned `url` (not the `key`) in the workflow item
> because the workflow item value is loaded directly without a server re-signing step.
> `LibraryEditor` stores the `key` in the DB because the server re-signs it on every `GET /api/libraries` call.

---

## Image Display (Server-Side Signing)

The server signs S3 keys before returning them to the client. **Never return a bare S3 key to the frontend.**

### Where Signing Happens

| Route | File | Signing method |
|---|---|---|
| `GET /api/projects` | `server/routes/projects.ts` | `signProjectImages()` → presigns `job.imageUrl` and `album[].imageUrl` |
| `GET /api/projects/:id` | `server/routes/projects.ts` | same as above |
| `GET /api/libraries` | `server/routes/libraries.ts` | `signLibraryImages()` → presigns image library item `content` fields |
| `GET /api/libraries/:id` | `server/routes/libraries.ts` | same as above |
| `GET /api/libraries/:id/items` | `server/routes/libraries.ts` | same as above |
| `GET /api/trash` | `server/routes/trash.ts` | presigns `item.imageUrl` |
| `POST /api/images` | `server/routes/images.ts` | presigns the uploaded key and returns it as `url` |

### Signing Utility

```ts
// server/routes/projects.ts
async function presignIfKey(value: string, storage: S3Storage): Promise<string> {
  if (value && !value.startsWith('http') && !value.startsWith('data:')) {
    return storage.getPresignedUrl(value); // expires in 3600s by default
  }
  return value; // already a URL or data URI — pass through
}
```

Use this pattern when adding new routes that return image data.

---

## Queue Manager (Server-Side Generation)

When the AI generates images, `server/queue/queue-manager.ts`:
1. Calls the provider to get raw PNG bytes
2. Optionally converts to JPEG/WebP using `sharp`
3. Saves to MinIO via `storage.save(key, bytes, mimeType)` — returns the **S3 key**
4. Stores the key in `AlbumItem.imageUrl` in DynamoDB
5. The key is presigned when fetched via `GET /api/projects/:id`

---

## `imageContexts` in Jobs

Workflow image items (type `'image'`) are stored in `job.imageContexts` when a job is created.
These can be:
- Presigned MinIO URLs (starting with `http`) — fetched by the queue manager via HTTP
- S3 keys (bare paths) — read directly from storage by the queue manager
- Base64 data URIs — stripped and used directly

The queue manager handles all three cases. See `executeJob()` in `queue-manager.ts`.

---

## Summary Rules

1. **Store keys in DB. Serve presigned URLs to the client.**
2. **Never use `/api/images/view?key=...` for `<img>` tags.**
3. **Never use `imageDisplayUrl()` on bare S3 keys** — it routes to the proxy.
4. **When uploading, use the returned `url` for immediate display.** Use the returned `key` to persist to DB.
5. **When adding a new GET route that returns images, call `getPresignedUrl()` before sending to client.**
