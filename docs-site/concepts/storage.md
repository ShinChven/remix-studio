# Storage

Remix Studio uses **S3-compatible object storage** for generated media and archives, and tracks usage against each user's limit.

## Two Buckets

| Bucket | Env var | Holds |
| :--- | :--- | :--- |
| Main | `S3_BUCKET` | Project images, workflow assets, library images, and related media |
| Export | `S3_EXPORT_BUCKET` | Completed ZIP [export](/concepts/exports) archives |

For local development, the recommended backend is **MinIO** running via Docker Compose. For deployment, point the app at AWS S3, Cloudflare R2, Google Cloud Storage, Alibaba Cloud OSS, or another S3-compatible service. See [Storage Providers](/guide/storage-providers).

## Usage Tracking

Storage analysis reports total usage against each user's storage limit, broken down into:

- **Projects** — album media and workflow assets.
- **Libraries** — reusable library images and media.
- **Archives** — completed export ZIPs.
- **Recycle bin** — deleted items pending purge.

This usage is checked before [enqueuing generation jobs](/concepts/queue) and before creating [exports](/concepts/exports), so users cannot exceed their quota.

## Recycle Bin (Trash)

Deleted items move to a recycle bin and continue to count toward usage until purged, so you can recover from accidental deletes before reclaiming the space. See [Recycle Bin (Trash)](/concepts/trash) for restoring, batch deletion, and emptying the bin.

## Public Endpoints & Presigned URLs

When a social platform or external store needs to fetch media, Remix Studio supplies **time-limited presigned URLs**. If you serve downloads through a different hostname than the internal endpoint, set `S3_PUBLIC_ENDPOINT` (and `S3_EXPORT_PUBLIC_ENDPOINT`).

::: warning
For [campaign](/concepts/campaigns) publishing, the public endpoint must be reachable from the public internet, because the social platform fetches the media server-side.
:::

## Related

- [Storage Providers](/guide/storage-providers) — provider-specific configuration.
- [Configuration Reference](/guide/configuration) — every storage environment variable.
