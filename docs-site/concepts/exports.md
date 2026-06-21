# Exports & Delivery

Remix Studio packages generated album media into downloadable **ZIP archives**, and can deliver completed packages to external destinations.

## Creating Exports

- Exports are created from project [album](/concepts/projects) items.
- Export tasks run in the **background** and move through `pending`, `processing`, `completed`, or `failed` states.
- Completed archives are stored in a **separate export bucket** (`S3_EXPORT_BUCKET`).
- Export creation performs a runtime [storage](/concepts/storage) quota check before uploading the ZIP archive.

## The Archive Page

The **Archive / Exports** page shows export status across projects and lets you:

- Download completed ZIPs.
- Delete export records.
- Track failed exports.

## Watermarking

Album exports support **watermarking** via a configuration panel, with a backend watermark utility applied during processing. The same watermark capability extends to product listing covers when [selling exports](/concepts/selling-exports).

## External Delivery

Completed export packages can be delivered to external destinations such as **Google Drive**, handled by a background delivery queue. The delivery queue also performs the automated image processing used for watermarking covers.

## Selling Exports

Beyond downloads and delivery, a finished export can be published as a paid product to a connected store. See [Selling Exports](/concepts/selling-exports).

## Related

- [Storage](/concepts/storage) — where archives are stored and how they count toward quota.
- [Queue & Concurrency](/concepts/queue) — exports and deliveries run as background tasks.
