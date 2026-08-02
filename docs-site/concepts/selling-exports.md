# Selling Exports

A completed [export archive](/concepts/exports) can be attached to a digital product and published to a connected store. Store publishing runs through the same persistent delivery worker used by Google Drive, with additional product and cover phases.

## Supported Store

The current store adapter is **Gumroad**. Configure `GUMROAD_CLIENT_ID`, `GUMROAD_CLIENT_SECRET`, and optionally `GUMROAD_SCOPE`, then connect under **Exports → Stores**.

The OAuth redirect is:

```text
${APP_URL}/api/stores/gumroad/callback
```

The connected profile and encrypted access token are stored per user. Disconnecting attempts to revoke the remote token and removes the local connection; it does not delete products already created on Gumroad.

## Prerequisites

To open the sell flow:

- The export must belong to the signed-in user.
- Its status must be `completed`.
- The export-bucket object must still exist.
- At least one active store connection must be available.

Deleting the export before publishing finishes can make the delivery task fail because the ZIP is its source file.

## Product Fields

| Field | Behavior |
| :--- | :--- |
| Store | Connected Gumroad account |
| Title | Required; prefilled from the ZIP/project name and limited to 200 characters in the UI |
| Price | Non-negative amount converted to integer cents; the current screen uses USD |
| Description | Optional product copy |
| Tags | Comma-separated in the UI; the server keeps at most 30 non-empty tags |
| Taxonomy ID | Optional Gumroad taxonomy/category identifier |
| Covers | Up to eight owned image album items, in drag-reorderable order |
| Publish immediately | Queue remote upload/product creation now; otherwise retain only the local draft record |

Creating the local draft stores a snapshot of the export, metadata, cover choices, and watermark settings. If **Publish immediately** is enabled, a delivery task is then queued and the product enters `publishing`.

## Cover Selection

Covers can come from owned album images. For each cover choose:

- **Raw** — original image object.
- **Optimized** — optimized/thumbnail source when available, with fallback to the original.

Cover order in Remix Studio becomes the order sent to Gumroad. Unsupported or missing album items are skipped by validation/processing rather than granting access to an arbitrary storage key.

## Cover Watermarking

The sell screen uses the per-user image watermark controls: text, position, padding, font size, opacity, and color. The chosen configuration is copied into each cover-selection record when the product is created.

During delivery, enabled covers are processed into temporary JPEG objects in the export bucket and those processed bytes are uploaded as listing covers. Source album images are not overwritten.

## Publishing Pipeline

For an immediate publish, the delivery worker:

1. Verifies the completed export and store/product ownership.
2. Presigns a Gumroad multipart upload.
3. Streams the ZIP from the export bucket in 100 MB upload parts while recording byte progress.
4. Completes and verifies the remote upload.
5. Creates the Gumroad product with title, price, description, tags, taxonomy, and uploaded file.
6. Processes and uploads covers in order.
7. Enables the product when immediate publishing was requested.
8. Stores the remote product ID, file URL, short URL, and final status.

Product status moves through `draft`, `publishing`, `published`, or `failed`. Delivery phase/progress is also displayed on the Exports page.

## Failures and Upload History

Failures store both the product error and delivery-task error. Correct the store credentials, export availability, metadata, or remote Gumroad issue before trying again.

**Exports → Upload History** records successful and failed attempts with the platform, title, remote ID/URL, and error at the time of upload. Disconnecting a store or later deleting a local product does not erase the historical event automatically.

::: warning
Publishing is an external side effect. Deleting a Remix Studio record does not unpublish or refund a Gumroad product. Manage existing listings, customers, and refunds in Gumroad.
:::

## Related

- [Exports & Delivery](/concepts/exports) — source archives and worker behavior.
- [Configuration Reference](/guide/configuration) — Gumroad OAuth variables.
- [Storage](/concepts/storage) — source archive and temporary cover objects.
