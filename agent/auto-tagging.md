# Auto-Tagging

A vision-capable text model writes tags for album items and library items. This note covers where the pieces live and the invariants that are easy to break.

## Settings

- One `AutoTagSetting` row per user: `providerId`, `modelConfigId`, `concurrencyLimit` (1–16, default 2; bounds in `AUTO_TAG_CONCURRENCY_LIMIT`, `src/types.ts`).
- No provider means auto-tagging is off. Deleting the provider sets `providerId` to null (`onDelete: SetNull`) rather than deleting the row.
- `resolveAutoTagSettings` (`server/services/auto-tag/settings.ts`) is the only reader. It reports a deleted provider, a provider that cannot read images, or a removed custom model as unset, so nothing downstream has to handle a dangling choice.
- "Can read images" is `IMAGE_INPUT_TEXT_PROVIDER_TYPES` in `src/types.ts`: the provider types whose text generator forwards `refImagesBase64`. Keep it in step with `server/generators/*-text-generator.ts`.
- UI: the Auto-tagging card in Account → Preferences (`src/pages/Account.tsx`). Routes: `GET`/`PUT /api/settings/auto-tag`.

## The queue

`AutoTagQueue` (`server/services/auto-tag/queue.ts`) is in memory.

- **Concurrency is per user**, across all of that user's albums and libraries. `pump()` reads the limit and the model again each time it starts items, so a change in Preferences applies to items that have not started yet.
- **A run belongs to one scope**: one project's album or one library. Queuing items into an idle scope starts a new run and clears the old failures. Queuing into a busy scope adds to the current run and skips items already waiting or in flight.
- **Failures stay listed** until they are retried (`/retry`) or dismissed (`/cancel`). A finished run without failures is forgotten after 10 minutes.
- **Restarts drop the queue.** This is deliberate. Tags are only ever added, and the start dialog's "skip items that already have tags" (on by default) turns a rerun into a resume.
- **A hung request** frees its slot after 120 s and counts as failed.

## Tagging one item

- **Input:** an image item sends its thumbnail (falling back to the optimized file, then the original), re-encoded as a PNG of at most 768 px. Every text generator labels images `image/png`, and some providers check the label against the bytes. A text item sends its text (library: title + content), cut to 8,000 characters. Video and audio are refused (`albumItemAutoTagKind`, `libraryAutoTagKind`).
- **Prompt** (`prompt.ts`): asks for 5–10 tags as a JSON array, in the interface language the browser sent. It lists the collection's 40 most-used tags (re-read every 30 s during a run) as vocabulary to reuse, plus the item's own tags so they are not repeated. `parseAutoTagReply` also accepts fenced JSON or a plain list.
- **Writing:** tags are merged into what the item has *at write time*, so edits made while the model was answering are kept. Album items go through `updateAlbumItemsTags` and emit `album.tagged`; library items emit a `library` resource change. Both pages already refetch on those events, debounced.
- **Origin:** the queue runs after the request that started it has ended, so its live events carry no origin and reach every tab, including the one that started the run.

## Routes

Defined in `server/routes/auto-tag.ts`:

- `POST /api/projects/:id/album/auto-tag`: `itemIds`, or `allAlbumItems` plus the album filters. Options: `onlyUntagged`, `language`.
- `POST /api/libraries/:id/auto-tag`: `itemIds`, or `all` plus `q`/`filterTags`. Same options.
- `GET …/auto-tag` returns the run status; `POST …/auto-tag/retry` and `POST …/auto-tag/cancel` act on the run.
- Cancel is a `POST` because `DELETE /api/projects/:id/album/:itemId` is registered first and would match `DELETE …/album/auto-tag`.
- Starting a run while auto-tagging is off returns `409` with `code: 'auto_tag_off'`.
