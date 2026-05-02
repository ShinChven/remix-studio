# Changelog

All notable changes to Remix Studio are documented here by version number.

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
