# Recycle Bin (Trash)

Trash provides recoverable deletion for project album results. It is user-scoped and preserves enough album metadata and storage references to restore an item to its original project.

## What Uses Trash

Deleting one or several album items from a project moves them to Trash. A trash record keeps:

- Original project ID and name.
- Prompt or generated text.
- Image, video, and audio context references.
- Original, optimized, and thumbnail storage keys.
- Provider/model and output metadata.
- Size, duration, and resolution where applicable.

Deleting a library, an entire project, an export, a job record, or a project orphan follows a different path and is not recoverable here.

## Restore

Restore one item or select several for batch restore. The database recreates the album records in their original projects and removes the corresponding trash records. Project live events notify open viewers.

Restoration depends on the project and referenced objects still existing. Deleting the whole project or manually removing bucket objects can make a trash record unrestorable.

## Permanent Deletion

Trash supports:

- Permanent deletion of one item.
- Batch permanent deletion of selected items.
- **Empty Trash** for every item owned by the current user.

Permanent deletion gathers the original, optimized, thumbnail, and context keys that belong to the trash records, deletes the objects, then removes the records.

::: danger
Permanent deletion cannot be undone. Verify your selection and backups before using batch delete or Empty Trash.
:::

## Storage Accounting

Moving an item to Trash does not reclaim its bytes because the underlying objects remain available. Trash is shown as a separate category in account storage analysis and counts against the user's limit until permanently deleted.

Project orphan analysis treats trash references as live, so valid trashed objects are not incorrectly offered as orphans.

## Working Safely

- Use Trash for visible album items you may need to recover.
- Use Project Orphans only for unreferenced storage leftovers.
- Remove completed job records separately when you only want to clear execution history.
- Empty Trash only after confirming no project/campaign/export workflow still depends on those results outside Remix Studio.

## Related

- [Projects & Albums](/concepts/projects) — album deletion and orphan cleanup.
- [Storage](/concepts/storage) — quota categories and object variants.
