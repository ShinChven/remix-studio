# Projects & Albums

A **project** is the workspace where you compose a [workflow](/concepts/workflows), run it, and collect the results. Each project holds an **album** of generated and uploaded media.

## Project Management

- Create, read, update, and delete projects.
- Project types: **Image, Text, Video, Audio**.
- Project states: **active** and **archived**.
- Rename project folders.
- Duplicate or copy workflows from existing projects.

## The Album

The album is where a project's media lives:

- Upload images, videos, and audio directly to a project.
- Generated outputs land in the album when workflows run.
- Rename album items.
- Browse with a page-size selector and shareable views — album view state is stored in URL search parameters so views persist and can be shared.

## Running a Project

Running a project enqueues only the jobs marked `pending`. A storage-limit check runs before enqueuing. See [Queue & Concurrency](/concepts/queue) for execution details, and [Workflows](/concepts/workflows) for how drafts are produced.

## Orphan Files

An **orphan** is a file sitting in a project's storage folder that nothing in the project points to anymore. Generation, uploads, retries, and image editing can all leave behind objects that no longer belong to any live record — these silently consume your [storage](/concepts/storage) quota. The **Project Orphans** view finds them and lets you clean them up.

### How orphans are detected

Each project owns a folder in object storage (keyed by your user ID and the project ID). To find orphans, Remix Studio:

1. Lists **every file** under the project's storage folder.
2. Collects **every file key still referenced** by the project's database records:
   - **Workflow** image/video/audio inputs (value, thumbnail, optimized variants).
   - **Jobs** — output images plus any image, video, and audio context inputs.
   - **Album items** — output media plus their context inputs.
   - **Trash items** belonging to the project (so [recycle-bin](/concepts/trash) contents are protected).
3. Treats any stored file **not** in that referenced set as an orphan.

The view lists each orphan with a preview and its size, so you can see how much space they occupy.

### Cleaning up

You select which orphans to remove, and Remix Studio **permanently deletes** them from storage in a batch.

::: warning
Orphan deletion is permanent — these files are removed directly from object storage and do **not** go to the recycle bin. Because trashed items are excluded from orphan detection, emptying orphans will not touch anything you have in [Trash](/concepts/trash).
:::

### When to use it

- After heavy generation or many retries, to reclaim space that isn't tied to any album item.
- When [storage](/concepts/storage) usage looks higher than the media you can actually see in the project.

## Live Updates

Projects use a live hub (WebSocket) so generation progress and album changes appear in the UI in real time without manual refresh.

## Sharing

Album views can be shared via URL, and a dedicated **Share** page exposes selected content.

## Related

- [Exports & Delivery](/concepts/exports) — package album media into ZIP archives.
- [Campaigns](/concepts/campaigns) — turn project outputs into scheduled social posts.
- [Storage](/concepts/storage) — how project media counts against your quota.
