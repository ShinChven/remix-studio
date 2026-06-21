# Changelog

All notable changes to Remix Studio are documented here by version number.

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
