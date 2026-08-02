# What's New

What changed in each Remix Studio release. For the full technical record, see [`CHANGELOG.md`](https://github.com/ShinChven/remix-studio/blob/main/CHANGELOG.md) or the [GitHub Releases](https://github.com/ShinChven/remix-studio/releases) page.

::: tip Spotted a bug or have an idea?
Please open a ticket on [GitHub Issues](https://github.com/ShinChven/remix-studio/issues) — your reports and feature requests directly shape what ships next.
:::

---

## 1.19.0 — Smarter assistants & cleaner workflows

*Hide workflow clutter, let assistants work reliably through bigger batches, and move around long lists more easily on every screen size.*

**Added**

- **Hide disabled workflow items** — Use the workflow's three-dot menu or press `H` to hide or reveal disabled items. The menu shows how many are hidden, and your choice is saved with the project so it follows you across reloads and devices. Hidden items keep their real positions when you reorder the workflow.
- **Claude Opus 5** — The Claude provider now offers Opus 5 with a 1-million-token prompt limit and up to 128K output tokens.
- **Assistants can browse and fetch album files** — New MCP tools let the in-app assistant and connected agents page through a project's album, inspect image details, and turn internal media keys into temporary view or download links. Links are issued only for media owned by the signed-in user.
- **Numbered pagination** — Projects, libraries, exports, chats, campaigns, scheduled posts, administration pages, and project tabs now offer direct page-number navigation, first/last jumps, and compact five-page skips.
- **Automatic truncation recovery** — When a model reaches its output limit in the middle of a response or tool call, the assistant can now ask it to continue automatically. Larger bulk jobs also get more room to finish and clearer progress reporting.

**Improved**

- **Phone-friendly lists** — Pagination condenses to fit narrow screens, uses larger touch targets, and wraps cleanly beside page totals. Text library entries now show a useful two-line preview and keep edit actions available on touch devices.
- **Quicker dashboard navigation** — Select the Recent Projects, Libraries, or Campaigns heading to open the corresponding full list.
- **Clearer documentation** — Refreshed the release history and expanded the MCP and model-maintenance guides, including documentation for album browsing and temporary file URLs.

**Fixed**

- **Reliable Gemini batch work** — Gemini 3.5 Flash Lite now preserves every parallel tool-call ID and uses a more suitable thinking level for multi-step work, so campaign batches and repeated calls no longer fail or stop part-way through.
- **Fewer unexpected sign-outs** — Concurrent refreshes from multiple tabs and responses lost during a network interruption no longer end an otherwise valid browser session.
- **Resilient OAuth connections** — MCP and other OAuth clients can recover safely when a rotated refresh-token response is lost, while stale-token reuse is still detected and revoked.
- **Visible mobile chat controls** — The conversation drawer no longer slips underneath the fixed phone header, so search and new-chat buttons remain accessible.
- **Drafts visible after fullscreen work** — Adding workflow items as drafts now closes the expanded workflow after a successful save, taking you straight to the new drafts.

## 1.18.0 — A wave of new models & snappier project tabs

*New text and image models across five providers, project tabs that load on demand and update instantly, and quality-of-life upgrades throughout the workspace.*

**Added**

- **New text models** — Google AI and Vertex AI add Gemini 3.6 Flash and Gemini 3.5 Flash Lite; OpenAI adds GPT-5.6, GPT-5.6 Terra, and GPT-5.6 Luna; Anthropic adds Claude Sonnet 5; and xAI adds Grok 4.5. Gemini 3.6 Flash is now the default Gemini text model.
- **New image models** — RunningHub adds nano banana Pro, Seedream 5.0 Pro, Seedream V5 Pro, and Wan 2.7 Pro. Google AI and Vertex AI add nano banana 2 Lite.
- **Auto aspect ratio** — nano banana 2 on RunningHub gains an "auto" option that lets the model pick the output ratio itself.
- **Optimized or original** — When picking album images in the media picker, choose whether you want the optimized version or the original file.
- **Filter media by ratio** — Narrow album images and videos in the media picker to one or more aspect ratios, with counts for every available ratio.
- **Save to library** — Send a workflow item's text or image straight to a library with one click.
- **Reorder cover images** — Arrange product cover images in the order you want on the sell page.
- **Lossless library transfer** — Export and import text libraries as JSON, so prompts with newlines, colons, or list-like lines survive round-trips byte-for-byte. The simpler plain-text format remains available.

**Improved**

- **Faster project tabs** — The Draft, Queue, Done, and Album tabs load their content only when needed and remember content you've already viewed, making tab changes faster.
- **Instant album updates** — Deleting album items now updates the album, item counts, and pagination immediately.
- **Ready-to-view drafts** — The Draft canvas shows your newest images as soon as the project opens.
- **Safer confirmations** — Confirmation dialogs show progress and prevent double-submission while their action is running.
- **Library editor polish** — Cleaner typography, a refined toolbar, and localized timestamps.

**Fixed**

- Deleting the current image in the album lightbox now shows the next image immediately instead of leaving a stale one on screen.
- Wan 2.7 prompts longer than 2,048 characters are shortened to the supported limit instead of causing the job to fail.
- Drawing and cropping in the image editor now land exactly where you point, and saved edits keep the image's full resolution.
- Assistant message actions and attachment removal buttons are now visible and usable on phones and tablets.

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

- **Model availability docs** — Supported text, image, video, and audio models are now listed in separate tables, with a provider summary to make compatible services easier to compare.

**Fixed**

- Posts that should be skipped are now identified correctly during campaign processing.

## 1.16.1 — A more immersive lightbox

*Fullscreen viewing gets out of the way, and the delete prompt plays nicely with it.*

**Added**

- **Immersive fullscreen** — In fullscreen, the image fills the whole screen and the controls fade away after a few seconds of inactivity. Move the mouse or press a key to bring them back.
- **Confirmation shortcuts** — When the image delete prompt is open, press Escape or D again to close it without deleting the image.

**Fixed**

- The delete confirmation dialog now shows correctly while viewing an image in fullscreen.

## 1.16.0 — Image slideshow & a documentation site

*The image lightbox grows into a full viewer with slideshow playback, and the project gets its own documentation site.*

**Added**

- **Image slideshow** — Play through your images hands-free with play/pause controls and a circular countdown. The interval is adjustable and remembered for next time.
- **Slideshow transitions** — Choose how slides change: fade, slide, zoom, blur, or an Android-style ripple. Your choice is saved across sessions.
- **Fullscreen & keyboard shortcuts** — Toggle fullscreen and drive the lightbox from the keyboard (playback, fullscreen, delete, and interval adjustment), with hotkey hints shown on hover.
- **Documentation site** — A new documentation site provides guides to Remix Studio's concepts, integrations, deployment, and operation.

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

- **Real-time project status** — Project pages update automatically as work progresses, with no manual refresh needed.
- **Social profile refresh** — Re-sync social account profiles and avatars, with automatic recovery when an image fails to load.

**Improved**

- More reliable job starts and reduced unnecessary background refreshing.

## 1.12.1 — Smoother project viewing

*A polish pass on the project viewer and album browsing.*

**Improved**

- **Faster job reuse** — Details for a previous job load only when you choose to reuse it, keeping the project viewer responsive.

**Fixed**

- Album counts and thumbnails update immediately after deleting items.
- Fixed cases where navigating or deleting images in the project lightbox could show the wrong image or lose your position.

## 1.12.0 — Pagination for big projects

*Large projects load quickly thanks to paginated albums and job history.*

**Added**

- **Faster large projects** — Albums and completed jobs are split into pages, with controls for choosing how they are sorted.
- **Clearer confirmations** — Confirmation dialogs show when a slower action is still running.
- **Visible campaign dates** — Campaign pages now show their scheduled date range.

**Fixed**

- Completed jobs are no longer lost when partial project saves happen.
- **For administrators:** Server health checks no longer stall during startup, so containers report their status promptly.

## 1.11.0 — Custom storage domains

*Serve exported assets from your own domain.*

**Added**

- **S3 custom domains** — Self-hosting administrators can serve exported assets through a public S3 endpoint or their own domain.

**Improved**

- Reusing a workflow now also restores the matching provider and model.

## 1.10.3 — More models, better watermarks

*New image models and cleaner watermark rendering.*

**Added**

- **New and updated models** — Added Grok Imagine Pro and updated the Google AI and Vertex AI Gemini model profiles to Gemini 3.5 Flash.
- **Job media in Completed tab** — See the context media behind each finished job.

**Improved**

- Watermarks render more consistently and position more accurately.
- Orphan files—stored project files that are no longer connected to a live project item—now display in a responsive grid, making them easier to review and clean up.

## 1.10.2 — Send to chat & mobile sharing

*Bring content into Remix Studio from your browser and your phone.*

**Added**

- **Reuse a job's exact setup** — Restore a past job's full workflow snapshot and generation settings back into the active project.
- **Send to chat (browser extension)** — New right-click options send an image or text to the Assistant and start a new conversation.
- **Android share target** — The installed app now appears in Android's share sheet. Share text or media to save it to a library or project, or to start a new assistant conversation.

## 1.10.1 — Smarter extension imports

*Imports remember your preferences.*

**Improved**

- The browser extension remembers separate destinations for text vs. image imports.

## 1.10.0 — Browser extension polish

*A more capable, more reliable browser import flow.*

**Added**

- **Smarter image names** — Imported images use the description supplied by the source website when available, falling back to the image URL.
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
- **Assistant tool approvals** — For each assistant action that writes data, choose whether it should ask every time or run automatically in that conversation.
- **New models** — GPT Image 2, GPT-5.5, and Grok 4.3.
- **Google Drive delivery confirmation** — Review and confirm Google Drive uploads before delivery begins.
- **Focused search** — Search libraries and projects by name without matching their contents.

**Fixed**

- The command palette now closes with Escape.

**Improved**

- **Easier export browsing** — Export tasks are split into pages, and album images use a space-efficient masonry layout.

## 1.8.0 — Command palette

*Find or create core workspace items without leaving the keyboard.*

**Added**

- **Command palette** — Press ⌘K on macOS or Ctrl+K on Windows and Linux to find projects, libraries, and campaigns, or create a new one without leaving the keyboard.

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

*Find the right assets faster, while inactive campaigns remain safely paused.*

**Added**

- **Search and filter by source** — In the media picker, search your libraries and project albums to find the right source before choosing an item.

**Fixed**

- Posts in inactive campaigns are no longer processed or published.
- Long campaign post links now truncate cleanly.

## 1.7.3 — Memory monitoring

*New diagnostics help self-hosting administrators investigate server memory usage.*

**Added**

- **Server memory diagnostics** — Self-hosting administrators can inspect memory usage through a dedicated status endpoint and server logs. See [Memory Monitoring](/operations/memory-monitoring) for setup and interpretation guidance.

**Improved**

- Refined campaign list layout.

## 1.7.2 — Bulk selection & reliability

*Select long ranges of items more quickly and get clearer results from batch uploads.*

**Added**

- **Shift-click range selection** for project jobs and media picker items.
- **Architecture overview** — A new [architecture diagram](/guide/architecture) gives contributors and administrators an overview of Remix Studio's features and system structure.

**Fixed**

- More reliable batch uploads with per-item error handling.

## 1.7.1 — Theme polish

*Theme changes feel smoother and stay in sync with your device.*

**Added**

- **Smooth theme transitions** with a circular ripple animation.
- Theme-aware thumbnail borders.

**Fixed**

- The UI now reliably follows your OS light/dark preference.

**Improved**

- Enabling or disabling an assistant provider now saves immediately, without a separate Save action.

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

*Generate library text in batches, track its progress, and manage queue problems more easily.*

**Added**

- **Batch AI text generation** — Generate multiple text library items in one operation and follow progress while the batch runs.
- **Optional model reasoning** — Provider settings can request supported models' reasoning output, while internal reasoning markers are removed from generated campaign posts.
- **Faster library copying** — Copy library content to the clipboard with one click.
- **Clearer queue controls** — The Queue Monitor is easier to scan and now includes an action for clearing queued work.

**Improved**

- Consistent rounded corners across the UI.

## 1.5.3 — Backups & X (Twitter) rebrand

*New maintenance tools protect self-hosted data, while the social integration moves to X's current branding and endpoints.*

**Added**

- **Database backup and restore tools** — Self-hosting administrators can create and restore database backups, with optional automatic cleanup of older backups. See [Backup & Restore](/operations/backup-and-restore) for instructions.

**Improved**

- Migrated Twitter endpoints and branding to X.

::: warning
Versions 1.5.0 and 1.5.1 are known to be broken. Upgrade to version 1.5.2 or later before using campaign features. See the [CHANGELOG](https://github.com/ShinChven/remix-studio/blob/main/CHANGELOG.md) for technical details.
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

*Background generation recovers more reliably, and library ordering is consistent for everyone.*

**Added**

- **More reliable generation queues** — Provider concurrency limits are managed centrally, and interrupted jobs can be recovered instead of remaining stuck.
- **Consistent library sorting** — Libraries now use server-managed sorting instead of manual drag-and-drop, so item order stays consistent across sessions.

**Improved**

- Modernized the RunningHub video generator integration.

## 1.2.0 — More providers & bulk library actions

*Generate with Alibaba's Qwen models and organize multiple library items at once.*

**Added**

- **Alibaba Cloud DashScope** — Connect DashScope and use its supported Qwen models in Remix Studio.
- **Batch library actions** — Copy or move multiple library items in one operation.

**Fixed**

- Prevented an error on the assistant page when no providers are configured.

## 1.1.1 — Descriptions everywhere

*Add context to projects and libraries so they are easier to recognize and organize.*

**Added**

- **Project and library descriptions** — Add a description that appears alongside each project's or library's name.

**Improved**

- Cleaner project and library card layouts.

## 1.1.0 — Assistant & album improvements

*Find assistant conversations faster and manage large project albums more precisely.*

**Added**

- **Assistant tools overview** — See which workspace actions the assistant can perform.
- **More precise album selection** — Filter project albums by aspect ratio and limit bulk actions to the current selection.
- **Faster assistant access** — Search assistant conversation history or start a conversation from a specific library.

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
