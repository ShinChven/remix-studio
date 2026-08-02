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
- Active Google Drive or store-delivery progress.
- Delete, Drive upload, and sell actions when eligible.

Download URLs are presigned when the task is read and expire after 24 hours. Reload the page to obtain a new URL; the archive itself is not deleted merely because a link expires.

Deleting an export removes both its database task and its export-bucket object. It does not delete the source album items.

## Image Watermark Settings

The watermark screen previews the first selected image and configures text, position, padding, font size, opacity, and color. Settings are stored per user and are saved when the export starts.

The selected scope and raw/optimized choice are carried into the watermark screen. Watermarking creates processed bytes for the archive; it does not overwrite the album originals.

## Google Drive Delivery

Connect Google Drive from the Exports/Account flow. A completed export can then be submitted to the delivery queue.

The delivery worker:

1. Loads the completed ZIP from the export bucket.
2. Refreshes Google credentials when needed.
3. Uses a resumable upload and records transferred/total bytes.
4. Stores the returned external ID/URL on completion.

Disconnecting Drive clears the stored refresh token. It does not remove files already uploaded to Drive.

## Store Delivery

When a supported store is connected, a completed archive can become a digital product. Product publishing uses the same delivery-task infrastructure but adds product metadata, cover processing, file upload, and publish phases.

See [Selling Exports](/concepts/selling-exports).

## Failure and Recovery

Export and delivery tasks store attempts, claim/heartbeat state, and error text. Worker loops can reclaim stale tasks after a process interruption. A failed task remains visible for diagnosis; create a new export or delivery after correcting the underlying storage, credential, or remote-service problem.

Source album files must remain available until export processing completes. Deleting source objects while a task is running can cause the archive to fail.

## Related

- [Storage](/concepts/storage) — two buckets, quota accounting, and endpoints.
- [Projects & Albums](/concepts/projects) — selecting source results.
- [Selling Exports](/concepts/selling-exports) — Gumroad product publishing.
