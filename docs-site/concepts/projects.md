# Projects & Albums

A **project** owns a generation workflow, output settings, draft and execution records, and a durable result collection. Project data is user-scoped and stored in PostgreSQL; media is stored under the user's project prefix in the configured object store.

## Project Types

Choose the type according to the output you want:

| Project type | Output | Common settings |
| :--- | :--- | :--- |
| **Text** | Generated text | System prompt, temperature, maximum tokens |
| **Image** | Generated images | Aspect ratio, quality, format, background |
| **Video** | Generated video | Duration, resolution, sound, format |
| **Audio** | Speech or music, depending on model | Voice/speaker or music mode, output format |

Available controls come from the selected model profile. A project also stores a default provider/model, description, filename prefix, shuffle setting, and workflow.

## Project Management

The Projects screen supports search, pagination, and active/archived/all filters. You can:

- Create, edit, and permanently delete projects.
- Archive a project to remove it from the default active view, then restore it later.
- Duplicate a project by starting a new project with an existing workflow as the source.
- Rename project folders from the project list.

Archiving is organizational; it does not delete jobs, media, exports, or storage. Deleting a project removes its workflow records, jobs, album records, project objects, and associated export tasks/files. Move individual album items to the recycle bin when you need a recoverable deletion.

## Project Workspace Tabs

### Draft

Drafts are resolved workflow combinations that have not started. Each stores its prompt, media contexts, provider/model choice, output options, filename, and workflow snapshot. Start one, a selection, or every draft.

### Queue

Pending, processing, and failed jobs appear in Queue. You can inspect resolved prompts and contexts, retry failures, delete records, or operate on a selection. See [Queue & Concurrency](/concepts/queue).

### Done

Done holds completed job records. It is useful for inspecting or reusing the exact configuration that produced a result. Removing a completed job record is separate from deleting the corresponding durable album item.

### Album, Texts, or Audios

The final tab is named for the project modality. It contains durable `AlbumItem` records created by generation or direct upload:

- Image and video projects provide visual browsing and a lightbox/player.
- Text projects show generated text and its prompt/context; multiple text results can be compared.
- Audio projects provide audio result controls.

The collection supports selection, page-size choices, filename changes, tagging, export, copy-to-library, move-to-project, workflow reuse, and recycle-bin deletion. The active tab, page, and supported filters live in URL search parameters, so navigation and shared links can preserve the same view.

## Tagging Album Items

Every album item carries a free-form list of tags, the same shape libraries use on their items. Tags are how a finished album is organised after the fact — by campaign, round, subject, or whatever the work needs — without moving anything between projects.

Tag a single item with the tag control beside its filename (media cards) or in its row (text and audio lists). To tag many at once, use **Tag Selected** / **Tag All** in the toolbar; that dialog offers three operations:

- **Add** — the given tags are added, existing tags are kept.
- **Remove** — only the given tags are taken away.
- **Replace** — the items end up with exactly the given tags; an empty list clears them.

With nothing selected, a batch applies to every item the current filters select, not just the page on screen — so filtering to one tag and adding another retags that whole slice in one action.

The toolbar's tag filter lists every tag in the album with how many items carry it. Selecting more than one tag can mean either **Match All** (an item must carry every selected tag, the default) or **Match Any** (at least one), switchable in the same dropdown. The selection lives in the `albumTags` and `albumTagMatch` search parameters, so a filtered view can be linked or bookmarked. Clicking a tag chip on an item filters to that tag.

Tags follow the item: they survive a move to the recycle bin and a restore, they are written into project bundles and read back on import, and they are copied onto the resulting library items when album items are copied to a library.

Tags are normalised on write — trimmed, de-duplicated case-insensitively, capped at 64 characters each and 30 per item — so a stray space or a difference in capitalisation cannot split one tag into two entries in the filter list.

## Moving Results to Another Project

Select album items and choose **Move to Project** to hand them to a different project of the same type. Unlike copying to a library, this is a move: the items leave the album they came from.

The action opens a confirmation page rather than a dialog, so what is about to happen is visible in full on any screen size. It lists the selected items, their combined size, and what travels with them:

- The album items and their generated files, thumbnails and optimized versions.
- The job record behind each item, so the Done history follows the result.
- The reusable workflow snapshot on that job and the reference media it points at, so **Reuse workflow** keeps working in the destination project.

Pick the destination on the same page — an existing project of the same type, searchable by name, or a new project created on the spot. A new project inherits this project's type and generation settings, since the results were produced under them.

Files are copied into the destination project's storage folder before the records move, and a name already taken there is given a numbered variant so nothing is overwritten. A file the source project still points at — a reference shared with a workflow step or with a job that stayed behind — is left in place, so both sides keep working. A job that is still running does not move; its album item does, and the job stays with the project its worker is writing into.

## Copying Results to a Library

Copy selected results or the entire collection into a compatible library. You may create a library from the dialog or append to an existing library of the project output type.

For generated media, choose:

- **Optimized** — smaller derived asset when available.
- **Raw** — original generated/uploaded asset.

Copying creates library items; it does not move or delete the album results.

## Exports

Export selected album items or the full collection as a named ZIP. For supported assets, choose raw or optimized versions. Image projects can open the watermark configuration screen before queueing the archive.

Exports run outside the generation queue in their own persistent worker and appear on the global Exports page. See [Exports & Delivery](/concepts/exports).

To move a whole project rather than its results, use **Export Project** on the project card's menu. That produces a project bundle — settings, workflow, album, and media in one ZIP — which the Projects page can import back as a new project via the import button in its header. See [Project Bundles](/concepts/exports#project-bundles).

## Reusing Configuration

Job rows retain a workflow snapshot and resolved generation settings. The **Reuse configuration** action restores those settings into the project editor so a prior result or failure can be used as the starting point for new drafts.

The same action is available from the results themselves, so you can pick a setup by looking at the finished piece instead of a job row:

- Album, text, and audio entries each carry a **Reuse workflow** control that resolves the settings through the job that produced them.
- The image lightbox offers the same control (shortcut `R`), and closes on confirmation so you land on the restored workflow.

Reuse changes the current editable workflow/settings only after confirmation; it does not alter the old job or album item.

The snapshot lives on the job record. When it is missing — the Done record was deleted, or the job predates workflow snapshots — the workflow is rebuilt from the result's own prompt and media references instead. A rebuilt workflow reproduces that single result rather than the recipe that varied it, and the confirmation says so before replacing anything. Only a result with neither a prompt nor references reports that no workflow is available.

## Orphan Files

An **orphan** is an object under a project's storage prefix that is no longer referenced by a workflow item, job, album item, or protected trash record. Uploads, retries, edits, and interrupted operations can leave such objects behind.

The Project Orphans screen:

1. Lists every object below the user's project prefix.
2. Collects storage keys still referenced by direct media workflow steps, job outputs/contexts, album outputs/contexts, and trash items for that project.
3. Reports stored objects outside that referenced set, with preview and size where possible.

Selected orphans can be deleted in a batch.

::: danger
Orphan cleanup deletes directly from object storage and cannot be undone. It does not use the recycle bin. Trash records are included in the protected reference set, so valid recycle-bin media is not reported as orphaned.
:::

Use orphan cleanup when project usage is unexpectedly high after many uploads, retries, or edits. It is not a routine replacement for deleting visible album items through Trash.

## Live Updates

An authenticated WebSocket project hub publishes job, album, trash, and project changes. The viewer refreshes the relevant data when events arrive and falls back to periodic refresh while work is processing if a live connection is unavailable.

The connection validates the user, account status, project ownership, and session version. It does not expose another user's project events.

## Related

- [Workflows & Combinations](/concepts/workflows) — how drafts are composed.
- [Recycle Bin](/concepts/trash) — recoverable album deletion.
- [Libraries & Prompts](/concepts/libraries) — reusable inputs and result copying.
