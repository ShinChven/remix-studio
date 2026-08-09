# Changelog

All notable changes to Remix Studio are documented here by version number.

## [Unreleased]

### Added

- **Job Tools for the Assistant and MCP**: The tool registry could build a project but not run one — jobs appeared only as a count on `get_project`, so drafting and starting generation stayed a UI-only errand. Three tools close that gap. `draft_jobs` stages drafts the same way the project viewer's queue button does: it runs the project's own workflow through the remix engine (honouring shuffle, tag filters, and disabled items), resolves the referenced libraries, and writes each combination as a draft carrying the project's provider, model, generation settings, and a filename built from the prompt's tags and titles — up to 200 per call. `start_jobs` moves drafts into the queue oldest first, either all of them or the number asked for, and hands them to the generation queue. `get_project_job_counts` reports drafts, pending, processing, completed, failed, and album totals in one read. Both writes are confirmation-gated with summaries that name the project and the count, and the storage quota is checked before drafting and before starting, exactly as the REST routes do. Drafts append rather than replace: the bulk project save deletes any draft missing from the list it is given, so the new tools go through a dedicated append path instead.
- **Batch Set Post Text**: Campaign Batch Actions could only fill post text through the model — useful when each post needs its own wording, wasteful when they should all carry the same caption. A **Set Text** action next to AI Generate takes one block of text and writes it to every selected post in a single request, with no provider, prompt, or background task involved. Existing text on those posts is replaced, and posts that no longer exist are reported as skipped the way the other batch operations report them.

### Fixed

- **Drawing on a Workflow Image Changed Its Dimensions**: Saving from the workflow image editor without cropping first — which is every draw-only edit — wrote the picture back at an inflated, arbitrary size. With no crop selected the export fell back to the image's natural width and height but then scaled those by the ratio between the natural and on-screen sizes anyway, so a 1024×1536 reference shown at 405px wide came back as 2589×3880, upscaled and re-encoded. The export rectangle is now resolved once: no crop means the natural size used as-is, and a real crop is scaled up from screen pixels, rounded to whole pixels, and clamped to the image so a selection dragged past an edge cannot ask for pixels that do not exist. Cropped saves keep the dimensions the toolbar reports instead of landing a pixel or two off.

## [1.20.0] - 2026-08-08

### Added

- **Project Bundles (Export & Import a Whole Project)**: A project can now be packaged into one portable ZIP and brought back later, or into another Remix Studio installation. **Export Project** on a project card's menu builds the bundle through the existing export worker, so it lands on the **Exports** page — marked *Project Bundle* — where it can be downloaded, released to a drive, or sold like any other archive. The bundle holds a `project.json` manifest (settings, workflow, album metadata) and a `media/` directory carrying every file those reference — originals, optimized versions, and thumbnails — with each storage key rewritten to its path inside the archive, so nothing about the exporting installation's bucket layout leaks into it. A file referenced twice (a library image pinned in the workflow that is also an album item's context) is stored once. Importing is on the Exports page: pick or drop a `.zip` and it streams straight into storage, then a background worker validates the manifest, checks the unpacked media against the storage quota, creates a **new** project — the original's id is never reused, so a bundle can be imported beside its source — unpacks the media, and rewrites every reference to the new keys. Progress is reported per file and the finished entry links to the imported project. Import tasks use the same claim/heartbeat/reap machinery as exports, and the uploaded ZIP is deleted once the import ends either way. Jobs are not carried over: bundles hold finished work, not generation history.
- **Releases**: The store settings screen is now **Releases**, a sub-page of Exports at `/exports/releases` reached from the link in the Exports header, and it holds every destination a finished export can go to — cloud drives as well as storefronts. Google Drive moved here from the Exports header, and it is no longer a single slot: any number of drives can be connected, including several accounts on the same provider. **OneDrive** (Microsoft Graph, resumable upload sessions) joins Google Drive as a supported drive. Releasing an export asks which drive to use when more than one is connected, and the release history now covers drive uploads alongside storefront publishes. Existing Google Drive connections are migrated automatically; the old `/exports/stores` and `/exports/uploads` paths redirect to the new pages.
- **Kimi (Moonshot AI) Provider**: Added Kimi as a provider type, bundled with the `Kimi K3` text profile — a 1M-token context window with native vision, so reference images can be attached to a text workflow. Kimi speaks the OpenAI Chat Completions protocol, so the text generator and chat adapter reuse the OpenAI implementations against `https://api.moonshot.ai/v1`; the API URL can be overridden to reach the mainland China endpoint. Kimi providers are also accepted by the in-app assistant, and the provider screen lists the account's models. The K2 series and `moonshot-v1` models are deliberately not bundled: K2 was discontinued in May 2026, and `kimi-k2.5` plus the `moonshot-v1` family are already closed to new accounts ahead of their August 31, 2026 sunset.
- **Seedance 2.5 Video (BytePlus)**: Added the Dreamina Seedance 2.5 model (`dreamina-seedance-2-5-260628`) and generalized the BytePlus video generator to the Seedance 2.x request surface. Alongside the existing image frame roles, a job can now carry `reference_video` and `reference_audio` items; whenever a video or audio reference is present — or more than two images are supplied — the request switches to omni-reference mode and every image is sent as a plain reference. Reference caps follow the tier (2.5: 30 images, 10 videos, 10 audios; 2.0: 9 / 3 / 3). Audio generation now follows the project's sound setting instead of being hardcoded for Seedance 1.5 Pro, and the 2.x family passes the seed through and disables the watermark.
- **Content Edits in `batch_update_library_items`**: The batch MCP tool only accepted a title and tags, so rewriting the text of several library items meant one `update_library_item` call each — which the assistant would take literally, reporting that it could not update the rest and handing back a half-finished job. Each entry now takes an optional `content` field. The approval prompt for both update tools also names the item count and the fields being changed instead of "Run write tool", and the assistant's bulk-work guidance covers edits as well as creations.
- **Reuse a Workflow from the Album**: Reusing a configuration no longer means hunting for the right row in Done. Album, text, and audio entries now carry their own reuse control, and the image lightbox has one too (shortcut `R`), so a setup can be picked while looking at the finished piece. The settings are resolved through the job behind the item, the same confirmation applies before the project workflow is replaced, and the lightbox closes once it is. When no snapshot was stored for a result — its Done record was deleted, or the job predates snapshots — the workflow is rebuilt from the result's own prompt and media references, and the confirmation states that the rebuild reproduces that one result rather than the recipe that varied it.

### Fixed

- **Cropped Image References on Phones**: The workflow image preview forced every reference into a 16:9 tile with `object-cover`. That reads well in the narrow desktop panel, but on a phone the panel is full width and portrait references — the common case — were cropped to a thin horizontal slice. Below `lg` the preview now scales the image to fit on a neutral backdrop, capped at 50vh, and carries an explicit expand button since the hover affordance does nothing on touch. Desktop and the expanded grid view keep their compact tiles.
- **Text Library Actions Hidden Behind Hover**: Text library rows hid their copy, tag, edit, and delete buttons behind a hover state from the `sm` breakpoint up. The actions are now visible at every breakpoint.
- **Reuse Reporting "No Longer Available" on Untouched Results**: Adding a second batch of drafts erased the workflow snapshot of every draft, pending, and failed job already in the project, so results those jobs went on to produce could not be reused even though nothing had been deleted. Job lists are served without the snapshot (only the configuration endpoint includes it), and the bulk project save was writing that absence back to the database as `null`. Bulk saves now leave the snapshot alone unless the client actually sends one. Snapshots are also stored as bare storage keys rather than the presigned URLs the client was holding, so a reused workflow does not carry links that have since expired.

### Removed

- **MEGA Drive Releases**: MEGA has been dropped as a release destination. It has no OAuth API, so a connection could only be made by storing the account's email and password — MEGA derives the account master key from the password, so it is needed in full on every upload. Unlike an OAuth token, that secret cannot be scoped to a folder, cannot be revoked without changing the password, and grants the holder the whole account. Google Drive and OneDrive, which both authorize over OAuth, remain. Any existing MEGA connections are deleted on upgrade along with their stored passwords, queued MEGA releases are marked failed, and past MEGA releases stay listed in Release History.

### Changed

- **Interface Flicker and Repaint Cost**: Moving the pointer across the app caused visible flicker in Chrome on macOS and a milder version in Safari. Two compositing problems were behind it: `html, body` used a fixed-attachment gradient, which the compositor cannot cache, so every `backdrop-filter` layer above it was re-read and re-blurred from the main thread on each repaint — and the app shell never scrolls its body, so the fixed attachment bought nothing. Meanwhile Tailwind's `transition-all` includes the filter properties, so hovering any of the 67 elements that also carried `backdrop-blur-*` animated the blur radius itself, re-rasterizing the whole blurred region frame by frame — worst on the full-height sidebar and assistant panel. A `transition-ui` utility (Tailwind's default property list minus the filter properties) now covers those elements, and a pointless `will-change: transform` on the Starfield canvas is gone. Backdrop blur has since been dropped from entity cards, the main layout, the album tab, the recycle bin, and the orphaned-files page, with background opacities raised to keep the same contrast. Progress bars across Exports, the queue monitor, and campaign detail render at full width and animate a left-origin `scaleX` instead of their `width`, so a progress tick no longer forces layout and paint.
- **Documentation**: The README was rewritten around AI-native content operations, and the docs site was audited end to end — the model matrix and feature mindmap now list Kimi and Seedance 2.5, and the guides were expanded and corrected against the current behaviour.
- **Media Picker Works on a Phone**: Picking a workflow image opened a dialog built for a desktop window: a fixed `88vh` box whose header, source controls, filter row, and footer stacked into roughly 560px of permanent chrome, leaving about one and a half tiles visible in a single-column grid on a 390px screen. On phones the picker is now a full-height sheet with a compact header, the source kind and source list share one row, sorting and search share the next, and the tile grid is two columns with the badges and file-path line dropped, so around six references are in view at once. Tiles honour their declared aspect ratio instead of stretching to the image's natural height, the footer respects the home indicator, and the type and source-kind filters are hidden when there is only one of them to pick. From `md` the picker is unchanged.
- **Dialogs Fit Small Screens**: Several dialogs were sized only for a desktop viewport. The prompt editor and project preview now fill the phone screen instead of floating in a `80/85vh` box, the workflow library selector, model selector, and tag editor use `dvh` heights so browser chrome cannot push their buttons out of reach, and the duplicate, copy/move, export-filename, and prompt-limit dialogs scroll rather than clip when they outgrow a short viewport. Phone padding, title sizes, and footer buttons were tightened across the same set, and footers clear the home indicator. Desktop layouts are unchanged.
- **Compact Page Headers on Phones**: Page headers were sized for the desktop layout and pushed the actual content of a screen well below the fold on a phone. The shared header now uses a smaller title, tighter back link, and denser description below `md`, and the gap between it and the first content block shrank on the pages that stack their sections. The screens with hand-built headers follow the same rhythm: Import & Export drops its badge and oversized display title, the provider form's sticky bar keeps its title and buttons on one row, and Storage, Custom Models, two-factor setup, and the library editor's chips all scale down. Page padding on phones drops from 24px to 16px. Desktop layouts are unchanged.
- **Headers Scroll Away on Phones**: The library editor and the orphaned-files cleanup kept their header on screen permanently and scrolled only the list beneath it, so a fixed band of title, description, and controls ate a quarter of a phone screen. On phones the whole page now scrolls and the header leaves with it, while the list's selection toolbar still pins to the top; from `lg` the pinned-header layout is unchanged. The Recycle Bin's pinned toolbar also stays on one row instead of stacking — roughly half its previous height — hiding the item totals only while a selection is active, and the prompt editor's header is tighter on small screens.

## [1.19.0] - 2026-08-02

### Added

- **Claude Opus 5**: Added Claude Opus 5 to the Claude provider's text models, with a 1M-token prompt limit and 128K max output. Like Fable 5, Opus 4.8, and Sonnet 5, it accepts only the default temperature.
- **Hide Disabled Workflow Items**: The project workflow's three-dot menu can now hide disabled items, with a count of how many are hidden, and the `H` key toggles them from anywhere in the project view (the menu entry shows the shortcut). The choice is saved with the project, so it carries across reloads and devices. Hiding is view-only — drag-and-drop reordering still uses each item's real position.
- **Signed File URLs for MCP & Assistant**: Added a `get_file_urls` tool that turns internal storage keys — from albums, libraries, and campaign post media — into temporary presigned URLs so connected agents can actually view, fetch, or download a file, with an optional `download` mode that returns a save-as link. Keys are only signed when they still belong to the authenticated user's own media; anything else is refused with a reason.
- **Album Item Browsing over MCP**: Added a `get_album_items` tool that pages through one project's album and returns each item's prompt, format, aspect ratio, size, and storage keys, so an agent can pick a specific generated image before requesting a URL for it.
- **Numbered Pagination**: Replaced previous/next-only controls across projects, libraries, exports, store uploads, chats, users, campaigns, scheduled posts, and project tabs with a shared page-number navigator. It includes first/last jumps and compact ellipsis controls that skip five pages at a time.
- **Assistant Truncation Recovery**: The assistant can now detect responses or tool arguments cut off by a model's output limit and ask the model to continue automatically. Bulk tasks also have higher iteration and tool-call ceilings, longer provider timeouts, clearer batch progress, and the correct completion-token parameter for OpenAI reasoning models.

### Changed

- **Mobile Pagination & Library Editing**: Pagination now uses larger touch targets and a compact phone layout, surrounding status rows can wrap instead of overflowing, and the Library Editor uses the shared navigator. Text library rows stack their title and preview on small screens and keep their actions accessible without hover.
- **Dashboard Navigation**: Recent Projects, Libraries, and Campaigns headings now link to their full list pages, with hover and chevron cues that make the navigation discoverable.
- **Documentation**: Refined the user-facing What's New history, documented the new MCP album and file URL tools, and expanded the MCP OAuth and model-maintenance notes.

### Fixed

- **Gemini Batch Tool Calls in the Assistant**: Assistant turns that ran several tools at once — creating a run of campaign posts, for example — died mid-batch on Gemini 3.5 Flash Lite. Gemini issues an id with each parallel function call and, from 3.5 onwards, rejects the follow-up turn unless every function response carries the id back; the adapter was dropping them. Those ids are now kept with the tool call and echoed on both the replayed call and its response. Two calls to the same tool with identical arguments are also no longer merged into one, so a batch containing repeats still creates every item.
- **Flash Lite Stopping Part-Way Through a Batch**: Flash Lite models default to minimal thinking, which is tuned for one-shot extraction rather than multi-step tool loops. The assistant now asks for a medium thinking level on those models whenever tools are available, so they work through a batch instead of trailing off.
- **Session Refresh Reliability**: Concurrent refreshes from multiple browser tabs and refresh responses lost to a network interruption no longer sign the user out. Session rotation now keeps a short-lived recovery chain, retries safely inside a grace window, and logs de-identified rejection reasons for diagnosis.
- **OAuth Refresh Reliability**: MCP and other OAuth clients can recover when a rotated refresh-token response is lost. Token rotation is now transactional, permits a short replay grace window, detects reuse outside that window, revokes the affected chain, and returns safe diagnostic error codes.
- **Mobile Assistant Drawer**: The conversation drawer now starts below the fixed app header on phones, keeping search and new-chat controls visible.
- **Drafts Added from Fullscreen Workflow**: After workflow items are successfully added as drafts, the expanded workflow now closes so the newly created drafts are visible immediately; a failed request leaves the workflow view unchanged.

## [1.18.0] - 2026-07-24

### Added

- **New Text Models**: Added Gemini 3.6 Flash and Gemini 3.5 Flash Lite (Google AI & Vertex AI), the GPT-5.6 family — GPT-5.6, GPT-5.6 Terra, and GPT-5.6 Luna (OpenAI), Claude Sonnet 5 (Claude), and Grok 4.5 (Grok). The default Gemini text model is now Gemini 3.6 Flash.
- **New Image Models**: Added nano banana Pro, Seedream 5.0 Pro, Seedream V5 Pro, and Wan 2.7 Pro to the RunningHub provider, and nano banana 2 Lite to the Google AI and Vertex AI providers.
- **Auto Aspect Ratio**: RunningHub's nano banana 2 now offers an "auto" aspect ratio option that lets the model pick the output ratio itself.
- **Image Version Selection**: When picking album images in the media picker, you can now choose between the optimized version and the original file.
- **Media Picker Aspect Ratio Filtering**: Album images and videos in the media picker can now be filtered by one or more aspect ratios, with item counts shown for each available ratio.
- **Save to Library**: Added a save-to-library button to text and image workflow items.
- **Cover Image Reordering**: Cover images on the sell/export page can now be reordered.
- **Text Library JSON Import/Export**: Added a lossless JSON mode for text library import and export, so prompts containing newlines, colons, or list-like lines survive round-trips intact; the plain-text format remains available.

### Changed

- **Project Tab Data Loading**: Reworked how the project tabs (Draft, Queue, Done, Album) load and cache their data. Album pages and completed jobs are fetched on demand per tab and cached across tab switches, deleting album items updates the album, its counts, and pagination instantly without waiting for a server refetch, and the Draft canvas keeps its own always-loaded preview of the newest album items so it appears as soon as the project opens. Confirmation dialogs now show progress and block double-submission while their action is running.
- **Library Editor**: Updated the Library Editor's typography, refined its toolbar styling, and internationalized the timestamp labels.
- **Package Registry**: Lockfiles now resolve packages from registry.npmjs.org instead of npmmirror.com.

### Fixed

- **Lightbox Deletion Refresh**: The album lightbox now switches to the next image immediately after deleting the current one, instead of keeping a stale image on screen.
- **Wan 2.7 Prompt Length**: Prompts longer than Wan 2.7's 2048-character limit are now truncated before submission instead of failing the job.
- **Image Editor Coordinates**: Drawing and cropping in the workflow image editor now land exactly under the cursor — edits are composed in the image's natural pixel space, so saved results are no longer offset or downscaled.
- **Mobile Assistant Buttons**: Message copy/edit and attachment-remove buttons in the assistant are now visible on touch devices instead of requiring hover.

## [1.17.1] - 2026-07-10

### Changed

- **Case-Insensitive Tag Matching**: Library tag filtering now matches tags case-insensitively, in both the filtering logic and tag selection UI.
- **Pagination**: The pagination bar in the project Album and Done tabs is hidden when all items fit on a single page.

### Fixed

- **Light Mode Theming**: Fixed a wide range of light mode issues across pages and modals — colored action buttons now always use white labels, controls over dark image overlays stay visible, leftover dark-only text colors and hover states received light equivalents, and the login card is consistently styled over its dark backdrop.
- **Light Mode Shadows**: Softened the heavy black shadows on selection toolbars and filter dropdowns in light mode to match the rest of the interface.
- **Draft Canvas Centering**: The empty draft canvas is now vertically centered in the tab area instead of sitting at the top.
- **Fullscreen Workflow Cards**: Workflow item cards now fill their grid cells properly in the fullscreen workflow view — text content expands with inner scrolling, and images and videos fill the remaining card height instead of overflowing.
- **Library Hover Border**: Removed the harsh border that appeared when hovering library item cards in light mode.

## [1.17.0] - 2026-07-05

### Added

- **Fullscreen Workflow View**: Added a fullscreen toggle button to the workflow panel header, next to the assistant button. It expands the workflow across the entire project view, hiding the Draft, Queue, Done, and Album area, and lays out all workflow items in a grid of equal-sized, individually scrollable cards. Toggling again restores the split view.
- **Slideshow Wake Lock**: Added the `useWakeLock` hook to prevent the screen from going to sleep during ImageLightbox slideshows.

### Changed

- **Model Availability Documentation**: Restructured model documentation into category-specific tables, added a provider summary matrix, and expanded the Chat Assistant capabilities section.

### Fixed

- **Posts Route**: Removed a failed status check that prevented correctly skipping posts in the posts route.

## [1.16.1] - 2026-06-22

### Added

- **Immersive Fullscreen Slideshow**: In fullscreen the image now fills the entire screen and the on-screen controls fade away after a few seconds without mouse or keyboard activity, reappearing the instant you interact.
- **Confirmation Keyboard Shortcuts**: The image deletion confirmation can now be dismissed with Escape, and pressing D again cancels it.

### Fixed

- **Delete Confirmation in Fullscreen**: Fixed the deletion confirmation dialog not appearing while viewing an image in fullscreen.

## [1.16.0] - 2026-06-22

### Added

- **Image Slideshow**: Added a slideshow mode to the image lightbox with play/pause controls, a circular interval countdown, and an adjustable interval that is remembered for next time.
- **Slideshow Transitions**: Added selectable transition effects between slides — fade, slide, zoom, blur, and an Android-style ripple — with the choice saved across sessions.
- **Lightbox Fullscreen & Shortcuts**: Added a fullscreen toggle and keyboard shortcuts to the image lightbox for playback, fullscreen, deletion, and adjusting the slideshow interval, with hotkey hints shown on hover.
- **Documentation Site**: Added a VitePress documentation site, published to GitHub Pages, covering guides, concepts, integrations, and operations.

## [1.15.0] - 2026-06-21

### Added

- **Image Editor**: Added an Image Editor modal for cropping and drawing directly on workflow images, including a reset option to revert edits.

### Changed

- **Assistant Settings Navigation**: Consolidated the assistant settings routes to use a query parameter for return paths, so navigating back lands you where you started.
- **Prompt Editor**: Removed the split view mode from the Prompt Editor and improved the styling of rendered markdown content.

## [1.14.1] - 2026-06-15

### Added

- **Drag-and-Drop Workflow Items**: Added the ability to drag and drop media files directly into the workflow list.
- **Workflow Paste Support**: Added support for pasting text and media files directly into the workflow using Cmd+V / Ctrl+V.
- **Auto-Scroll Workflow**: The workflow list now automatically scrolls to the bottom when new items are added.

### Changed

- **Orphan Files Layout**: Adjusted the responsive grid column counts and spacing in the Project Orphans view for better readability.

### Fixed

- **Workflow State Synchronization**: Optimized workflow state synchronization using functional updaters and implemented blob URL revocation to fix a memory leak with media items.
- **Database Concurrency Locks**: Fixed a race condition where rapid workflow updates could cause unique constraint violations by serializing updates with database locks.

## [1.14.0] - 2026-06-14

### Added

- **Threads Platform Support**: Integrated Threads as a campaign channel with a dedicated Threads channel implementation, unified platform icon and link logic, and OAuth connection status surfaced through UI toasts.
- **Threads Error Handling**: Added granular parsing of Threads API errors so connection and publishing problems are reported clearly.
- **Album Export Watermarking**: Added watermarking support for album exports with a new configuration panel and backend watermark utility.
- **Product Cover Watermarking**: Added per-product watermark settings for listing covers with automated image processing in the delivery queue.
- **Library Tag Match Mode**: Added an AND/OR tag match mode for library filtering and the workflow engine.
- **Workflow Library Switching**: Added the ability to change the source library on workflow items.
- **Album Page Size Selector**: Added a page size selector to the Album tab toolbar.
- **CLI Setup Guide**: Added a Claude Code and Codex CLI setup guide to the MCP Connections page.
- **Privacy Policy Page**: Added a privacy policy page to the public assets.
- **GHCR Image Cleanup**: Added a manual workflow to delete legacy SHA-tagged GHCR images.

### Changed

- **Async Campaign Media**: Migrated campaign media creation to asynchronous batch processing with status polling.
- **Campaign Batch Thumbnails**: Replaced the media button with a thumbnail preview for campaign batch actions.
- **Shareable Album Views**: Migrated album view state to URL search parameters so views persist and can be shared.
- **Library Preview Modal**: Refreshed the Library Preview modal with a responsive layout and updated design.

### Fixed

- **Stale Workflow Updates**: Fetch fresh project state before applying workflow updates to avoid overwriting concurrent changes.

## [1.13.0] - 2026-06-07

### Added

- **Project Live Updates**: Added real-time project status updates over WebSockets through a new project live hub publisher.
- **Social Profile Refresh**: Added social account profile refresh and automatic profile image synchronization when image loading fails.

### Changed

- **Project Job Start Flow**: Replaced global project updates with a targeted job start API to improve queue management reliability.
- **Project Live Refresh**: Added debounced and rate-limited project live refresh handling to reduce unnecessary data fetching.
- **Avatar Fallbacks**: Replaced remote DiceBear avatar fallback usage with a local SVG avatar generator utility.
- **X Platform Icons**: Replaced Lucide Twitter icon usage with a custom `XIcon` component across platform views.

## [1.12.1] - 2026-06-06

### Added

- **Lazy Job Configuration Loading**: Added a focused API endpoint and repository method for fetching a specific job configuration so workflow snapshots can load only when a job is reused.
- **Complete Album Media Migration**: Added repository support for fetching all project album items and expanded S3 key migration to cover all album media fields.

### Fixed

- **Project Viewer Split Regressions**: Restored affected project viewer, library, assistant, extension import, export, and media picker flows after the project data loading split.
- **Album Pagination Counts**: Updated album pagination and aspect ratio totals immediately after batch item deletion.
- **Image Lightbox Synchronization**: Improved index safety and state synchronization when navigating project images.

### Changed

- **Project Viewer Caching**: Added cache-based fetching with stale-time validation for album and completed job tabs.
- **Project Workflow Loading**: Decoupled project workflow fetching and standardized storage normalization logic for project form and project route payloads.
- **Post Count Lookup**: Optimized scheduled post count lookups with map-based aggregation and consistent local date formatting.
- **Job Filename Sanitization**: Centralized sanitized filename truncation logic for project job exports.
- **Architecture Diagram Docs**: Added Mermaid class definitions and styling to the architecture diagram in the README.

## [1.12.0] - 2026-06-04

### Added

- **Project Data Pagination**: Added server-side pagination and sorting for project albums and completed jobs, including reusable pagination controls in the Project Viewer.
- **Job Update Timestamps**: Added `updatedAt` tracking for jobs with a database migration to support more accurate job metadata and ordering.
- **Async Confirm Actions**: Added loading state and async action support to `ConfirmModal`.
- **Campaign Schedule Metadata**: Included campaign schedule date ranges in API responses and updated campaign UI display logic.

### Fixed

- **Done Job Preservation**: Prevented partial project job saves from removing completed job records that are now loaded through a separate paginated endpoint.
- **Completed Job Deletion**: Added a dedicated API and repository path for deleting individual project job records without using full project job synchronization.
- **Startup Healthchecks**: Deferred queue task recovery until after the server starts listening, preventing detached task recovery from blocking `/healthz` and marking containers unhealthy.

### Changed

- **Project Viewer Loading**: Refactored project workflow, queue jobs, completed jobs, and album data to load through focused API endpoints instead of a single large project payload.
- **Queue Recovery**: Kept task recovery as a background startup process while preserving detached polling and queue resumption behavior.

## [1.11.0] - 2026-05-30

### Added

- **S3 Custom Domains**: Added configuration variables and support for S3 export public endpoints and custom domains via environment variables.

### Changed

- **Workflow Reuse**: Updated workflow reuse logic to sync provider, model state, and navigation.

## [1.10.3] - 2026-05-26

### Added

- **Model Updates**: Added support for Grok Imagine Pro model and updated Google and Vertex Gemini model configurations to version 3.5 flash.
- **Completed Jobs Media**: Display job context media in the CompletedTab.

### Fixed

- **Extension Import**: Improved selection logic in ExtensionImport.

### Changed

- **Orphan Projects Layout**: Render all orphan projects in a responsive grid.
- **Watermarks**: Replaced sharp text rendering with SVG overlay to improve watermark positioning and rendering consistency.
- **Docker Fonts**: Installed additional system fonts and refreshed font cache in Dockerfile.

## [1.10.2] - 2026-05-17

### Added

- **Reuse Job Configuration**: Added the ability to restore a historical job's exact workflow snapshot and generation settings (model, provider, aspect ratio, etc.) back to the active project.
- **Workflow Snapshots**: Implemented database support for capturing and storing the raw JSON workflow structure at the moment of job creation.
- **Send to Chat (Chrome Extension)**: Added new context menu items "Send image to Remix Studio Chat" and "Send text to Remix Studio Chat" that open the Assistant page and pre-fill the composer to start a new conversation.
- **Android PWA Share Target**: The installed PWA now appears in the Android share sheet for text and images. A `/share` landing page lets the user pick between saving to a library/project or starting a new chat. Powered by a new service worker that intercepts the share POST and stashes the payload.

## [1.10.1] - 2026-05-17

### Changed

- **Extension Import**: Separate persistent destination preference by import type (text vs image).

## [1.10.0] - 2026-05-17

### Added

- **Extension Import Name Extraction**: Added Chrome Extension support for extracting imported image name from the `alt` tag or URL.
- **Extension Import Persistence**: Added automatic persistent configuration for the Chrome Extension import's destination selection via local storage.
- **Extension Release Asset**: Configured GitHub Actions to automatically zip and include the Chrome Extension as a release asset in the Docker workflow.

### Fixed

- **Extension Import Infinite Loading**: Fixed an issue where refreshing the Extension Import page without Chrome Extension data would result in an infinite loading state.

### Changed

- **Extension Import UI**: Updated the Chrome Extension Import page UI design language to match the workspace library creation layout.

## [1.9.0] - 2026-05-15

### Added

- **Digital Store Integration**: Introduced a digital store integration framework with Gumroad authentication and a product management system for selling exports, including database schema, API routes, and UI.
- **Store Upload History**: Added a store upload history page with tracking for product publishing activity.
- **Publish Immediately**: Added a publish-immediately toggle to product export configuration.
- **Assistant Tool Approvals**: Added persistent per-conversation tool approval management with backend support and a dedicated UI.
- **New Models**: Added GPT Image 2, GPT-5.5, and Grok 4.3 to the supported model configurations; reordered image generator quality options.
- **Google Drive Upload Confirmation**: Added a confirmation modal for Google Drive uploads and redesigned the exports header navigation.
- **Media Picker Source Locking**: Added `fixedSourceId` support to `UniversalMediaPicker` to restrict and pre-select a specific media source.
- **Name-Only Search**: Added a `nameOnly` filter to library and project search endpoints and repositories.

### Fixed

- **Command Palette**: Allow closing the command palette with the Escape key.

### Changed

- **Job State Integrity**: Protected server-controlled job states from client-driven overwrites and added S3 key migration support.
- **Export Pagination**: Replaced cursor-based pagination with page-based navigation for export tasks across server and UI layers.
- **Album Cover Presigning**: Injected main storage into `DeliveryManager` to handle album cover presigned URLs.
- **Album Grid Layout**: Migrated album cover and selection grids to a masonry layout using CSS columns.

## [1.8.0] - 2026-05-05

### Added

- **Command Palette**: Added command palette for navigation and entity creation with ⌘K shortcut.

## [1.7.5] - 2026-05-03

### Added

- **Campaign Post Detail**: Added a dedicated post detail view with scheduling controls, AI generation, and post management actions.
- **Campaign Analytics**: Added campaign post status counts, summary metadata, and URL-synced pagination and filtering.
- **Batch Watermarking**: Added configurable batch image post watermarking with a live preview.
- **Campaign MCP Tools**: Added campaign and post management MCP tools with assistant-side mutation handling.
- **Universal Media Picker**: Introduced a shared `UniversalMediaPicker` for standardized asset selection in project and campaign workflows.

### Fixed

- **Media Display**: Prioritized processed and source URLs over thumbnails when resolving media display assets.
- **Media Layout**: Improved truncation titles and flexible button spacing for media items.
- **Project Deletion Dialog**: Replaced browser-native project deletion confirmation with `ConfirmDialog`.

### Changed

- **Manual Sorting**: Removed the `LibraryItem` order column and implemented manual sorting for library and project picker lists.
- **Media Picker UX**: Streamlined single-item selection and optimized hook dependencies in `UniversalMediaPicker`.

## [1.7.4] - 2026-05-03

### Added

- **Media Source Filtering**: Added source filtering with search inputs to `MediaPickerModal`.

### Fixed

- **Campaign Execution Validation**: Added campaign status validation to prevent posts from executing when their campaign is inactive.
- **Campaign Link Layout**: Updated campaign post link styling to use truncation for long links.

### Changed

- **Provider Configuration**: Removed redundant `maxTokens` configuration from campaign execution flows.

## [1.7.3] - 2026-05-03

### Added

- **Memory Monitoring**: Added a server memory monitoring endpoint, logging, and dedicated documentation.

### Changed

- **Campaign List UI**: Refined campaign list item layout and related UI behavior.

## [1.7.2] - 2026-05-02

### Added

- **Feature Mindmap**: Added a Remix Studio architecture and capabilities mindmap.
- **Range Selection**: Added shift-click range selection for project jobs and media picker items.

### Fixed

- **Batch Upload Reliability**: Improved batch uploads with per-item error handling.
- **Media Thumbnails**: Updated media thumbnails to use top-aligned cropping.

### Changed

- **Campaign Batch Creation**: Refined batch campaign creation selection behavior and related campaign UI details.

## [1.7.1] - 2026-05-02

### Added

- **Smooth Theme Transitions**: Implemented circular ripple animation for theme switching using the browser's View Transitions API.
- **Theme-Aware Thumbnails**: Enhanced `ProjectCard` with theme-aware border styling.

### Fixed

- **Theme Synchronization**: Implemented automated system theme resolution and synchronization in `ThemeContext` to ensure the UI matches the OS preference.

### Changed

- **UX Refinement**: Replaced browser-native `window.confirm` with a custom `ConfirmDialog` for project deletions.
- **Provider Settings**: Updated assistant provider settings to auto-save on toggle, removing the manual save button.

## [1.7.0] - 2026-05-02

### Added

- **Media-Focused Home**: Replaced the legacy Dashboard with a modernized Home component featuring horizontal scrolling media carousels.
- **New Card Designs**: Completely redesigned `ProjectCard` and `LibraryCard` with image backgrounds, glassmorphism overlays, and quick-action context menus.
- **Geometric Fallbacks**: Implemented color-coded geometric placeholders (DiceBear) for projects and campaigns based on content type.
- **Campaign i18n**: Full internationalization support for the Campaigns module in English, French, Japanese, Korean, and Chinese (Simplified/Traditional).
- **Enhanced Media Picker**: Added aspect ratio filtering and bulk selection support to the `CampaignBatchCreate` media picker.
- **Project Deletion**: Added direct project deletion functionality from the project list and card menus.
- **Documentation**: Added dedicated `BACKUP_AND_RESTORE.md` documentation.

### Fixed

- **API Serialization**: Fixed a `TypeError: Do not know how to serialize a BigInt` in the campaign API response.
- **Image Alignment**: Fixed background cropping on portrait images by anchoring covers to the top.
- **Theme Persistence**: Set default theme to "System" for better user integration.

### Changed

- **Campaign API Optimization**: Implemented server-side aggregation for accurate post counts and S3 URL presigning for media covers.
- **UI Consistency**: Standardized padding and scrolling behavior across all main containers.
- **Terminology Refactor**: Renamed "Prompt Fragments" to "Items" across the codebase and localized strings for better clarity.
- **Layout Migration**: Moved export controls and statistics to the `PageHeader` actions slot for a cleaner interface.
- **User Management**: Redesigned the admin user filtering interface with modernized inputs.

## [1.6.0] - 2026-05-02

### Added

- Added `ConfirmDialog` component and replaced browser `window.confirm` with it for better UX.
- Implemented polling for batch AI text generation with status tracking and progress visualization.
- Added persistent prompt library integration and storage to `BatchAiGenerateModal`.
- Added `includeThoughts` toggle to assistant provider and automatic reasoning tag stripping from generated posts.
- Implemented polling for AI text generation status and integrated image processing for LLM context.
- Implemented paginated post fetching for campaigns.
- Added copy-to-clipboard functionality to library content.
- Added queue clear functionality and refactored the Queue Monitor UI.

### Changed

- Standardized UI component corners with a consistent `rounded-card` utility class.

## [1.5.3] - 2026-05-02

### Added

- Added database backup and restore scripts with automated retention support.
- Added `APP_URL` and X (Twitter) OAuth environment variables to docker configurations.

### Changed

- Migrated all Twitter API endpoints and branding to X (formerly Twitter) domain.

## [1.5.2] - 2026-05-02

### Added

- Introduced PM2-based deployment upgrade workflow.

### Changed

- Automated Prisma migrations on container startup.

## [1.5.1] - 2026-05-02 (This version is broken)

### Added

- Added validation and security constraints to campaign and post MCP tools.

## [1.5.0] - 2026-05-02 (This version is broken)

### Added

- Added social campaign management with campaign lists, detail pages, history, channel configuration, scheduled posts, and post creation flows.
- Added backend campaign, post, social account, and post execution models with API routes and repository support.
- Added X/Twitter channel integration foundations for social posting workflows.
- Added batch campaign post creation, batch AI generation, and batch scheduling UI flows.
- Added campaign media imports from libraries and projects with associated storage cleanup.
- Added media storage tracking and scheduling timeline support for campaigns.
- Added MCP tool support for campaign-oriented workflows.

### Changed

- Updated the assistant system prompt and planning docs for social campaign orchestration.
- Added release and Docker image status badges to the README.

## [1.4.2] - 2026-05-01

### Added

- Enabled automated GitHub releases from the Docker workflow.

### Changed

- Updated README deployment and support guidance.
- Updated package metadata for the 1.4.2 release.

## [1.4.1] - 2026-05-01

### Fixed

- Fixed failed task error text being cut off in Queue Monitor by adding click-to-expand functionality.

### Added

- Added detailed generation options (resolution, quality, aspect ratio, etc.) to the expanded view of jobs in the Queue Monitor.

## [1.4.0] - 2026-05-01

### Added

- Introduced a comprehensive Queue Monitoring system with a dedicated UI for tracking projects and providers.
- Modularized internationalization files into domain-specific JSON schemas (admin, app, libraries, etc.) for better maintainability.

### Changed

- Migrated MCP connections to the assistant settings tab.

## [1.3.0] - 2026-05-01

### Added

- Implemented robust concurrency slot management and orphaned job reconciliation in `QueueManager`.
- Added server-side configurable sorting for library items, replacing manual drag-and-drop.

### Changed

- Modernized RunningHub video generator with improved API integration and endpoint management.
- Updated pinned state icon to use a filled Pin component.

## [1.2.0] - 2026-04-30

### Added

- Added Alibaba Cloud DashScope provider support, including Qwen model profiles.
- Added batch copy and move support for library items, with frontend dialog and backend API support.

### Fixed

- Prevented a null selection error in the assistant page when no providers are available.

## [1.1.1] - 2026-04-30

### Added

- Added description fields for projects and libraries, including database migrations and UI support.
- Added timestamp fields to the library schema.

### Changed

- Improved project and library card layouts.

## [1.1.0] - 2026-04-30

### Added

- Added an assistant settings tools tab with capability overview and list view.
- Added aspect ratio filtering for project albums.
- Added scoped selection support for album bulk operations.
- Added the `get_project` MCP tool and improved project update workflows with explicit assistant prompts.
- Added library-specific assistant chat triggers.
- Added assistant chat history search.
- Added timestamp fields to library items.

### Changed

- Trigger workflows automatically after clearing failed jobs.
- Updated Docker image handling so the default branch tracks the `latest` tag.
- Switched add buttons to icon-only variants.
- Extracted the library card into a reusable component.
- Updated album lightbox state to use album item IDs for more reactive deletion behavior.

## [1.0.0] - 2026-04-25

### Added

- Initial release of Remix Studio.
- Self-hosted AI assistant workspace for orchestration and batch content generation.
- Project workflows built from reusable text, image, video, and audio libraries.
- Draft generation through permutation and shuffle workflows.
- Background generation queue with provider-specific execution.
- Provider credential, model profile, custom alias, and concurrency management.
- S3-compatible asset storage and ZIP export workflows.
- Built-in assistant and MCP support for operating libraries, projects, albums, models, and storage.
- Authentication, admin controls, 2FA, passkeys, and user storage limits.
- Internationalized UI for English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French.

[1.7.1]: https://github.com/ShinChven/remix-studio/compare/v1.7.0...v1.7.1
[1.7.0]: https://github.com/ShinChven/remix-studio/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/ShinChven/remix-studio/compare/v1.5.3...v1.6.0
[1.5.3]: https://github.com/ShinChven/remix-studio/compare/v1.5.2...v1.5.3
[1.5.2]: https://github.com/ShinChven/remix-studio/compare/v1.5.1...v1.5.2
[1.5.1]: https://github.com/ShinChven/remix-studio/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/ShinChven/remix-studio/compare/v1.4.2...v1.5.0
[1.4.2]: https://github.com/ShinChven/remix-studio/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/ShinChven/remix-studio/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/ShinChven/remix-studio/compare/v1.3.0...v1.4.0
[1.3.0]: https://github.com/ShinChven/remix-studio/compare/v1.2.0...v1.3.0
[1.2.0]: https://github.com/ShinChven/remix-studio/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/ShinChven/remix-studio/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/ShinChven/remix-studio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ShinChven/remix-studio/releases/tag/v1.0.0
