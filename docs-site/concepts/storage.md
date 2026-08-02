# Storage

Remix Studio stores record metadata in PostgreSQL and media bytes in S3-compatible object storage. Both are required for a complete, usable deployment.

## Buckets

| Bucket | Environment variable | Contents |
| :--- | :--- | :--- |
| Main | `S3_BUCKET` | Project workflow assets, generated album media, job contexts, library media, campaign media, thumbnails, and optimized variants |
| Export | `S3_EXPORT_BUCKET` | Completed ZIP export archives |

If `S3_EXPORT_BUCKET` is omitted, the server derives an export bucket by appending `-exports` to the main bucket name. Buckets can be auto-created when `S3_AUTO_CREATE_BUCKET=true`; managed production storage is usually pre-created with auto-creation disabled.

## Object Keys and Ownership

Stored objects use user/project/library/campaign-scoped prefixes. Database routes still verify ownership before reading, copying, signing, or deleting a key; possession of a guessed key is not sufficient authorization.

Media records may reference:

- An original object.
- An optimized display object.
- A thumbnail.
- Context objects used to produce a job or album item.

Deleting a visible record therefore may involve several keys. Orphan analysis compares stored project keys with every known reference so unreferenced leftovers can be removed deliberately.

## Storage Analysis and Limits

Each user has a byte limit (5 GB by default for a newly created database record, unless changed by an admin). Account storage analysis reports:

- **Projects** — project workflow assets, jobs, and album media.
- **Libraries** — reusable media items.
- **Archives** — ZIPs in the export bucket.
- **Recycle bin** — soft-deleted project album media.

The sidebar periodically refreshes total usage; the Account storage view provides the detailed analysis.

Quota guards currently use estimates:

- Starting generation reserves an estimate of about 25 MB for every job that will be pending.
- Creating an export estimates from the selected source asset sizes before adding the archive.

The checks reduce accidental overage but do not make the object store itself enforce a hard quota. Provider output sizes and concurrent operations can differ from estimates.

## Recycle Bin and Permanent Deletion

Deleting an album item first creates a trash record containing its metadata and leaves its objects available for restoration. Trash therefore continues to count toward usage.

Permanent deletion or Empty Trash removes the referenced storage objects and the trash records. Library deletion and project-orphan cleanup do not use this recycle-bin flow.

See [Recycle Bin](/concepts/trash).

## Internal and Public Endpoints

`S3_ENDPOINT` is the endpoint the Remix Studio server uses for S3 API calls. In a container network it may be private, such as `http://minio:9000`.

`S3_PUBLIC_ENDPOINT` controls URLs returned to browsers or external services when the public route differs from the internal route. The export bucket can use a separate `S3_EXPORT_PUBLIC_ENDPOINT`. The corresponding `*_PUBLIC_CUSTOM_DOMAIN` flags tell URL construction whether that endpoint is a bucket-specific custom domain rather than a path-style S3 endpoint.

Remix Studio normally returns time-limited presigned URLs instead of making a bucket public.

::: warning
Social platforms fetch campaign media from their own servers. The main public endpoint and signed object URL must therefore be reachable from the public internet. A Docker-only hostname such as `minio` will not work for X or Threads.
:::

## Storage Provider Compatibility

The storage client uses S3 APIs and supports AWS S3, MinIO, Cloudflare R2, Google Cloud Storage interoperability, Alibaba Cloud OSS, and other sufficiently compatible services. Endpoint format, region, credentials, path/custom-domain behavior, and bucket-creation policy vary.

See [Storage Providers](/guide/storage-providers) before deploying to a managed service.

## Backup Implications

A database dump contains storage keys and metadata, not object bytes. A complete backup needs:

1. PostgreSQL.
2. The main bucket.
3. The export bucket if completed archives must be retained.
4. Deployment secrets, especially `PROVIDER_ENCRYPTION_KEY`.

Restore the database and buckets from a consistent point in time where possible. See [Backup & Restore](/operations/backup-and-restore).

## Related

- [Configuration Reference](/guide/configuration) — endpoint and bucket variables.
- [Exports & Delivery](/concepts/exports) — archive storage.
- [Projects & Albums](/concepts/projects) — orphan analysis.
