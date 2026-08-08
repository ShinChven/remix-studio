# Exports & Delivery

Exports package project album results into named ZIP archives. Archive creation and external delivery use persistent database task rows and separate background workers, so they continue independently of the browser and the generation queue.

## Creating an Archive

From a project's final-results tab:

1. Select specific items, or leave the selection empty to target the full album.
2. Enter a package name.
3. Choose the **raw** or **optimized** asset version where the modality supports both.
4. For an image project, optionally open the watermark screen.
5. Queue the export and follow it on **Exports**.

The server verifies project ownership and resolves the selected album records. Before creating a task it estimates the ZIP size from the chosen asset versions and checks the user's storage quota.

Watermarking is currently restricted to image projects. When enabled with non-empty text, each selected image is processed and stored in the ZIP as JPEG.

## Export Task Lifecycle

| State | Meaning |
| :--- | :--- |
| `pending` | Waiting for an export worker |
| `processing` | Files are being read, processed, and appended to the archive |
| `completed` | ZIP uploaded to the export bucket |
| `failed` | Task stopped with an error |

Workers claim tasks in the database, heartbeat while processing, and can reclaim abandoned work after a stale claim. Progress records the number of album items appended.

The final archive is stored in `S3_EXPORT_BUCKET`, separate from project/library objects in `S3_BUCKET`. Its size counts toward the user's archive quota category.

## Raw and Optimized Versions

When **optimized** is selected, the worker prefers the item's optimized object and falls back to the original if no optimized version exists. **Raw** uses the original output object.

Thumbnails are previews and are not the source of a normal archive. Filename metadata is sanitized for the ZIP, and duplicate entry names are disambiguated.

## The Exports Page

The global page lists exports across projects and shows:

- Queue/archiving progress.
- Completed size and a download action.
- Failure messages.
- Active drive or storefront release progress.
- Delete, drive release, and sell actions when eligible.

Download URLs are presigned when the task is read and expire after 24 hours. Reload the page to obtain a new URL; the archive itself is not deleted merely because a link expires.

Deleting an export removes both its database task and its export-bucket object. It does not delete the source album items.

## Project Bundles

An album export packages results. A **project bundle** packages the project itself — its settings, workflow, album metadata, and every media file those reference — into one portable ZIP that can be imported back later, or into a different Remix Studio installation.

Export one from the **Projects** page: open a project card's menu and choose **Export Project**. The bundle is built by the same export worker and appears on the Exports page marked *Project Bundle*, so it can be downloaded, released to a drive, or sold like any other archive.

### Bundle Layout

| Path | Contents |
| :--- | :--- |
| `project.json` | Manifest: format version, project settings, workflow items, album items |
| `media/…` | One entry per referenced storage object (originals, optimized, thumbnails) |

Every storage key inside the manifest is rewritten to its `media/…` path, so the archive is self-contained and carries nothing about the exporting installation's bucket layout. Files referenced more than once — a library image pinned in the workflow that is also an album item's context — are stored once and referenced by both.

Bundles carry finished work, not generation history: queued and completed **job** rows are not included. A media file that has gone missing from storage is skipped, and the manifest is trimmed to match.

### Importing

On the **Exports** page, use **Import Project** (or drop a `.zip` onto the panel). The archive is streamed straight into the export bucket, then a background worker unpacks it:

1. Reads and validates `project.json`, rejecting archives that are not project bundles or were written by a newer format version.
2. Checks the unpacked media against the storage quota before writing anything.
3. Creates a **new** project — the source project's id is never reused, so importing a bundle beside its original is safe.
4. Uploads each referenced media file into the new project's storage prefix and rewrites every reference to the new key.
5. Writes the workflow and album rows.

Progress is shown per file on the Exports page, and the finished entry links straight to the imported project. Import tasks use the same claim/heartbeat/reap machinery as exports, so an interrupted worker's task is retried. The uploaded ZIP is deleted once the import finishes, whether it succeeded or failed.

Imported album items stand alone — they keep their prompt, settings, and media, but not a link back to the job that produced them.

Bundle uploads are a single request body. If a reverse proxy sits in front of the app, its request-size limit (for example nginx's `client_max_body_size`) has to allow the largest bundle you intend to import.

## Image Watermark Settings

The watermark screen previews the first selected image and configures text, position, padding, font size, opacity, and color. Settings are stored per user and are saved when the export starts.

The selected scope and raw/optimized choice are carried into the watermark screen. Watermarking creates processed bytes for the archive; it does not overwrite the album originals.

## Drive Releases

Drives are connected on the **Releases** page — a sub-page of Exports at `/exports/releases`, reachable from the link in the Exports header. Google Drive, OneDrive, and MEGA are supported, and you can connect as many accounts as you like — several Google Drives side by side is fine.

A completed export can then be released to any of them. When more than one drive is connected, the upload action asks which one to use; with a single drive it goes straight there.

The delivery worker:

1. Loads the completed ZIP from the export bucket.
2. Refreshes the connection's credentials when needed (and marks the connection expired if that fails, so the UI can prompt for a reconnect).
3. Streams the archive to the provider in resumable chunks and records transferred/total bytes.
4. Stores the returned external ID/URL on completion and writes a release-history row.

Removing a connection deletes its stored credentials. It does not remove files already uploaded to that drive.

Google Drive and OneDrive authorize over OAuth. MEGA has no OAuth API, so it is connected with the account's email and password (plus a two-factor code when enabled); the password is stored encrypted because MEGA's key derivation needs it on every sign-in.

## Storefront Releases

When a supported storefront is connected, a completed archive can become a digital product. Product publishing uses the same delivery-task infrastructure but adds product metadata, cover processing, file upload, and publish phases.

See [Selling Exports](/concepts/selling-exports).

## Failure and Recovery

Export and delivery tasks store attempts, claim/heartbeat state, and error text. Worker loops can reclaim stale tasks after a process interruption. A failed task remains visible for diagnosis; create a new export or delivery after correcting the underlying storage, credential, or remote-service problem.

Source album files must remain available until export processing completes. Deleting source objects while a task is running can cause the archive to fail.

## Related

- [Storage](/concepts/storage) — two buckets, quota accounting, and endpoints.
- [Projects & Albums](/concepts/projects) — selecting source results.
- [Selling Exports](/concepts/selling-exports) — Gumroad product publishing.
