# What's New

What changed in each Remix Studio release. For the full technical record, see [`CHANGELOG.md`](https://github.com/ShinChven/remix-studio/blob/main/CHANGELOG.md) or the [GitHub Releases](https://github.com/ShinChven/remix-studio/releases) page.

::: tip Spotted a bug or have an idea?
Please open a ticket on [GitHub Issues](https://github.com/ShinChven/remix-studio/issues) — your reports and feature requests directly shape what ships next.
:::

---

## 1.18.0 — A wave of new models & snappier project tabs

*New text and image models across five providers, project tabs that load on demand and update instantly, and quality-of-life upgrades throughout the workspace.*

**Added**

- **New text models** — Gemini 3.6 Flash and Gemini 3.5 Flash Lite (Google AI & Vertex AI), the GPT-5.6 family (GPT-5.6, Terra, and Luna), Claude Sonnet 5, and Grok 4.5. The default Gemini text model is now Gemini 3.6 Flash.
- **New image models** — nano banana Pro, Seedream 5.0 Pro, Seedream V5 Pro, and Wan 2.7 Pro on RunningHub, plus nano banana 2 Lite on Google AI and Vertex AI.
- **Auto aspect ratio** — nano banana 2 on RunningHub gains an "auto" option that lets the model pick the output ratio itself.
- **Optimized or original** — When picking album images in the media picker, choose whether you want the optimized version or the original file.
- **Save to library** — Send a workflow item's text or image straight to a library with one click.
- **Reorder cover images** — Arrange product cover images in the order you want on the sell page.
- **Lossless library transfer** — Export and import text libraries as JSON, so prompts with newlines, colons, or list-like lines survive round-trips byte-for-byte. The simple plain-text format is still there.

**Improved**

- **Snappier project tabs** — The Draft, Queue, Done, and Album tabs now fetch their data on demand and cache what you've already seen. Deleting album items updates the album, its counts, and pagination instantly — no more waiting on a server refetch — and the draft canvas shows your newest images the moment the project opens.
- **Safer confirmations** — Confirmation dialogs show progress and prevent double-submission while their action is running.
- **Library editor polish** — Cleaner typography, a refined toolbar, and localized timestamps.

**Fixed**

- Deleting the current image in the album lightbox now shows the next image immediately instead of leaving a stale one on screen.
- Wan 2.7 prompts longer than the API's 2048-character limit are truncated instead of failing the job.
- Drawing and cropping in the image editor now land exactly where you point, and saved edits keep the image's full resolution.
- Assistant message and attachment buttons are now reachable on phones and tablets.

## 1.17.1 — Light mode polish

*A cleanup pass for light mode, plus tidier fullscreen workflow cards and smarter pagination.*

**Improved**

- **Case-insensitive tags** — Library tag filtering now matches tags regardless of case, so `Portrait` and `portrait` behave as one tag.
- **Smarter pagination** — The pagination bar in the Album and Done tabs stays out of the way when everything already fits on one page.

**Fixed**

- **Light mode, everywhere** — A full audit fixed unreadable labels on colored buttons, invisible controls over image overlays, leftover dark-only text and hover states, and an inconsistent login card.
- **Softer shadows** — Toolbars and filter dropdowns no longer cast heavy black shadows in light mode.
- **Centered draft canvas** — The empty draft canvas now sits in the middle of the tab instead of hugging the top.
- **Fullscreen workflow cards** — In the fullscreen workflow view, cards now fill their grid cells cleanly: text scrolls inside its card, and images and videos fill the available space.
- **Library hover border** — Removed the harsh border that flashed when hovering library items in light mode.

## 1.17.0 — Fullscreen workflow view & wake lock

*Give your workflow the whole screen, and keep your screen awake during slideshows.*

**Added**

- **Fullscreen workflow** — A new fullscreen button in the workflow panel header (next to the assistant button) expands the workflow across the entire project view, tucking away the Draft, Queue, Done, and Album tabs. Your workflow items spread out into a grid of equal-sized cards, each scrolling on its own when its content runs long. Click the button again to return to the split view.
- **Wake lock for slideshows** — Your screen will no longer go to sleep while playing an image slideshow in the lightbox.

**Improved**

- **Model availability docs** — The documentation for supported models (LLMs, Image, Video, Audio) has been restructured into category-specific tables with a new provider summary matrix.

**Fixed**

- Fixed an issue in the posts route where a failed status check prevented skipping posts correctly.

## 1.16.1 — A more immersive lightbox

*Fullscreen viewing gets out of the way, and the delete prompt plays nicely with it.*

**Added**

- **Immersive fullscreen** — In fullscreen, the image fills the whole screen and the controls fade away after a few seconds of inactivity. Move the mouse or press a key to bring them back.
- **Confirmation shortcuts** — Dismiss the image delete prompt with Escape, or press D again to cancel it.

**Fixed**

- The delete confirmation dialog now shows correctly while viewing an image in fullscreen.

## 1.16.0 — Image slideshow & a documentation site

*The image lightbox grows into a full viewer with slideshow playback, and the project gets its own documentation site.*

**Added**

- **Image slideshow** — Play through your images hands-free with play/pause controls and a circular countdown. The interval is adjustable and remembered for next time.
- **Slideshow transitions** — Choose how slides change: fade, slide, zoom, blur, or an Android-style ripple. Your choice is saved across sessions.
- **Fullscreen & keyboard shortcuts** — Toggle fullscreen and drive the lightbox from the keyboard (playback, fullscreen, delete, and interval adjustment), with hotkey hints shown on hover.
- **Documentation site** — These docs, published to GitHub Pages, covering guides, concepts, integrations, and operations.

## 1.15.0 — Edit images in place

*Crop and draw on your generated images without leaving the app.*

**Added**

- **Image editor** — A modal for cropping and drawing directly on workflow images, with a reset option to revert your edits.

**Improved**

- **Assistant settings navigation** — Returning from assistant settings now lands you back where you started.
- **Prompt editor** — Cleaner rendered markdown and a simplified, single-pane editing experience.

## 1.14.1 — Faster, smoother workflow building

*Get media into your workflow faster, and keep it stable under rapid edits.*

**Added**

- **Drag-and-drop into workflows** — Drop media files straight into the workflow list.
- **Paste support** — Paste text and media into the workflow with Cmd+V / Ctrl+V.
- **Auto-scroll** — The workflow list scrolls to the newest items automatically.

**Fixed**

- Resolved a memory leak when working with media items in long sessions.
- Fixed an issue where rapid workflow edits could collide and fail to save.

## 1.14.0 — Threads, watermarking & sharper campaigns

*Publish to Threads, protect your exports with watermarks, and work with more flexible libraries.*

**Added**

- **Threads support** — Connect Threads as a campaign channel and publish to it, with clear error messages when something goes wrong.
- **Album export watermarking** — Add watermarks to album exports from a dedicated settings panel.
- **Product cover watermarking** — Apply per-product watermarks to listing covers automatically.
- **Library tag match modes** — Filter libraries and workflows by matching *all* tags (AND) or *any* tag (OR).
- **Switch a workflow item's library** — Change the source library on an item without rebuilding it.
- **Album page size selector** — Control how many album items load at once.

**Improved**

- **Campaign media** now generates in the background with live status, so the UI stays responsive.
- **Shareable album views** — Album filters and sorting live in the URL, so views persist and can be shared.
- **Refreshed Library Preview** modal with a responsive layout.

## 1.13.0 — Live project updates

*Projects update themselves in real time as work completes.*

**Added**

- **Real-time project status** — Project pages update live over WebSockets, no manual refresh needed.
- **Social profile refresh** — Re-sync social account profiles and avatars, with automatic recovery when an image fails to load.

**Improved**

- More reliable job starts and reduced unnecessary background refreshing.

## 1.12.1 — Smoother project viewing

*A polish pass on the project viewer and album browsing.*

**Added**

- **Reuse historical job settings** loads workflow snapshots only when needed, keeping the viewer fast.

**Fixed**

- Album counts and thumbnails update immediately after deleting items.
- Steadier image lightbox navigation across project images.

## 1.12.0 — Pagination for big projects

*Large projects load quickly thanks to paginated albums and job history.*

**Added**

- **Paginated albums and completed jobs** with sorting controls in the Project Viewer.
- **Confirmation dialogs** now show loading state for slower actions.
- **Campaign schedule dates** surface in the campaign UI.

**Fixed**

- Completed jobs are no longer lost when partial project saves happen.
- Health checks no longer stall on startup, so containers report healthy promptly.

## 1.11.0 — Custom storage domains

*Serve exported assets from your own domain.*

**Added**

- **S3 custom domains** — Configure a public endpoint or custom domain for exported assets.

**Improved**

- Reusing a workflow now also restores the matching provider and model.

## 1.10.3 — More models, better watermarks

*New image models and cleaner watermark rendering.*

**Added**

- **New models** — Grok Imagine Pro and updated Google / Vertex Gemini configurations.
- **Job media in Completed tab** — See the context media behind each finished job.

**Improved**

- Watermarks render more consistently and position more accurately.
- Orphan projects display in a responsive grid.

## 1.10.2 — Send to chat & mobile sharing

*Bring content into Remix Studio from your browser and your phone.*

**Added**

- **Reuse a job's exact setup** — Restore a past job's full workflow snapshot and generation settings back into the active project.
- **Send to chat (browser extension)** — New right-click options send an image or text to the Assistant and start a new conversation.
- **Android share target** — The installed app appears in Android's share sheet; a `/share` page lets you save to a library/project or start a new chat.

## 1.10.1 — Smarter extension imports

*Imports remember your preferences.*

**Improved**

- The browser extension remembers separate destinations for text vs. image imports.

## 1.10.0 — Browser extension polish

*A more capable, more reliable browser import flow.*

**Added**

- **Smarter image names** — Imports pull a name from the image's `alt` text or URL.
- **Remembered destinations** — Your import destination is saved automatically.
- The browser extension is now attached to each release for easy download.

**Fixed**

- No more infinite loading when opening the import page without extension data.

**Improved**

- Refreshed import page design to match the rest of the workspace.

## 1.9.0 — Sell your exports

*Turn finished exports into products you can sell, plus a more capable assistant.*

**Added**

- **Digital store integration** — Connect Gumroad and manage products to sell your exports, with a publishing history view and a publish-immediately option.
- **Assistant tool approvals** — Manage which assistant tools are approved, per conversation.
- **New models** — GPT Image 2, GPT-5.5, and Grok 4.3.
- **Google Drive upload confirmation** before delivery.
- **Name-only search** for libraries and projects.

**Fixed**

- The command palette now closes with Escape.

**Improved**

- Page-based pagination for export tasks and a masonry album grid layout.

## 1.8.0 — Command palette

*Jump anywhere and create anything from the keyboard.*

**Added**

- **Command palette** — Navigate and create entities with ⌘K.

## 1.7.5 — Deeper campaign tooling

*A richer campaign workspace with analytics and batch watermarking.*

**Added**

- **Post detail view** with scheduling, AI generation, and management actions.
- **Campaign analytics** — Post status counts and summaries with URL-synced filtering.
- **Batch post watermarking** with a live preview.
- **Campaign assistant tools** for managing campaigns and posts via the assistant.
- **Universal media picker** for consistent asset selection across projects and campaigns.

**Fixed**

- Media display prefers full-resolution sources over thumbnails.
- Replaced browser confirm dialogs with the in-app confirmation dialog.

## 1.7.4 — Easier media selection

**Added**

- **Source filtering with search** in the media picker.

**Fixed**

- Posts can't execute when their campaign is inactive.
- Long campaign post links now truncate cleanly.

## 1.7.3 — Memory monitoring

**Added**

- **Server memory monitoring** endpoint, logging, and documentation.

**Improved**

- Refined campaign list layout.

## 1.7.2 — Bulk selection & reliability

**Added**

- **Shift-click range selection** for project jobs and media picker items.
- An architecture and capabilities mindmap.

**Fixed**

- More reliable batch uploads with per-item error handling.

## 1.7.1 — Theme polish

**Added**

- **Smooth theme transitions** with a circular ripple animation.
- Theme-aware thumbnail borders.

**Fixed**

- The UI now reliably follows your OS light/dark preference.

**Improved**

- Assistant provider settings auto-save on toggle.

## 1.7.0 — A media-first home

*A redesigned home and cards put your media front and center, with full campaign localization.*

**Added**

- **Media-focused home** with horizontal media carousels.
- **Redesigned project and library cards** with image backgrounds and quick-action menus.
- **Campaign localization** in English, French, Japanese, Korean, and Chinese (Simplified & Traditional).
- **Project deletion** directly from list and card menus.

**Fixed**

- Portrait image covers now crop from the top instead of the center.
- New installs default to the "System" theme.

**Improved**

- Renamed "Prompt Fragments" to "Items" throughout for clarity.

## 1.6.0 — Batch generation & polish

**Added**

- **Batch AI text generation** with live progress tracking.
- **Reasoning toggle** for the assistant, with reasoning tags stripped from generated posts.
- **Copy-to-clipboard** for library content and a clearer Queue Monitor.

**Improved**

- Consistent rounded corners across the UI.

## 1.5.3 — Backups & X (Twitter) rebrand

**Added**

- **Database backup and restore scripts** with automated retention.

**Improved**

- Migrated Twitter endpoints and branding to X.

::: warning
Versions 1.5.0 and 1.5.1 are known-broken — upgrade past them. See the [CHANGELOG](https://github.com/ShinChven/remix-studio/blob/main/CHANGELOG.md) for details.
:::

## 1.5.0 — Social campaigns arrive

*The first version of the campaign workspace for planning, scheduling, and publishing social posts.*

**Added**

- **Social campaign management** — Campaign lists, detail pages, history, channel configuration, scheduled posts, and post creation.
- **X/Twitter channel** integration for social posting.
- **Batch post creation, AI generation, and scheduling** flows.
- **Campaign media imports** from libraries and projects.
- **Campaign assistant tools.**

## 1.4.x — Queue monitoring

*Visibility into what the background queue is doing.*

**Added**

- **Queue Monitoring system** with a dedicated UI for tracking projects and providers.
- **Detailed generation options** (resolution, quality, aspect ratio) in the expanded job view.

**Fixed**

- Failed task errors are no longer cut off — click to expand the full message.

## 1.3.0 — Reliable queueing

**Added**

- **Concurrency slot management** and recovery of orphaned jobs.
- **Server-side library sorting** replacing manual drag-and-drop.

**Improved**

- Modernized the RunningHub video generator integration.

## 1.2.0 — More providers & bulk library actions

**Added**

- **Alibaba Cloud DashScope** provider support with Qwen models.
- **Batch copy and move** for library items.

**Fixed**

- Prevented an error on the assistant page when no providers are configured.

## 1.1.1 — Descriptions everywhere

**Added**

- **Descriptions** for projects and libraries.

**Improved**

- Cleaner project and library card layouts.

## 1.1.0 — Assistant & album improvements

**Added**

- **Assistant tools tab** with a capability overview.
- **Aspect ratio filtering** and scoped bulk operations for project albums.
- **Assistant chat history search** and library-specific chat triggers.

**Improved**

- Workflows trigger automatically after clearing failed jobs.

## 1.0.0 — Initial release

*The first release of Remix Studio — a self-hosted AI workspace for batch content generation.*

**Added**

- Self-hosted AI assistant workspace for orchestration and batch content generation.
- Project workflows built from reusable text, image, video, and audio libraries.
- Draft generation through combination and shuffle workflows.
- Background generation queue with provider-specific execution.
- Provider credential, model profile, alias, and concurrency management.
- S3-compatible storage and ZIP export workflows.
- Built-in assistant and MCP support for operating libraries, projects, albums, models, and storage.
- Authentication, admin controls, 2FA, passkeys, and user storage limits.
- A UI localized in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French.
