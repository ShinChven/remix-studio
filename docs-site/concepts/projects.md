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

Generation and editing can leave behind files that are no longer referenced by any album item. The **Project Orphans** view detects and lets you delete these orphan files to reclaim storage.

## Live Updates

Projects use a live hub (WebSocket) so generation progress and album changes appear in the UI in real time without manual refresh.

## Sharing

Album views can be shared via URL, and a dedicated **Share** page exposes selected content.

## Related

- [Exports & Delivery](/concepts/exports) — package album media into ZIP archives.
- [Campaigns](/concepts/campaigns) — turn project outputs into scheduled social posts.
- [Storage](/concepts/storage) — how project media counts against your quota.
