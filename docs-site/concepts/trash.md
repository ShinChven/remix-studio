# Recycle Bin (Trash)

Deleting media in Remix Studio is **soft delete** first: items move to a per-user **recycle bin** instead of being destroyed immediately. This gives you a safety net to recover from accidental deletes before the space is reclaimed.

## What Goes to Trash

[Album](/concepts/projects) media items (generated outputs and uploads) are moved to the recycle bin when deleted, individually or in bulk. Trashed items keep their image, thumbnail, and optimized variants so they can be previewed and restored intact.

## Restoring

- **Restore a single item** back to its project album.
- **Restore in batch** — select multiple trashed items and restore them together.

## Permanent Deletion

When you are sure, remove items for good:

- **Delete a single item** permanently.
- **Delete in batch** — permanently remove a selected set.
- **Empty trash** — permanently remove everything in the recycle bin at once.

::: warning
Permanent deletion and emptying the trash cannot be undone — the underlying objects are removed from storage.
:::

## Trash & Storage

Trashed items **still count toward your storage usage** until they are permanently deleted. Storage reporting breaks usage into projects, libraries, archives, and recycle-bin categories, so you can see how much space the recycle bin is holding and empty it to reclaim quota. See [Storage](/concepts/storage).

## Live Updates

Trash and restore actions publish project events through the live hub, so album views update in real time without a manual refresh. See [Projects & Albums](/concepts/projects).

## Related

- [Projects & Albums](/concepts/projects) — where items are trashed from and restored to.
- [Storage](/concepts/storage) — how recycle-bin contents count against your quota.
- [Exports & Delivery](/concepts/exports) — packaging the media you keep.
