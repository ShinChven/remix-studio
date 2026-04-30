# Changelog

All notable changes to Remix Studio are documented here by version number.

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

[1.2.0]: https://github.com/ShinChven/remix-studio/compare/v1.1.1...v1.2.0
[1.1.1]: https://github.com/ShinChven/remix-studio/compare/v1.1.0...v1.1.1
[1.1.0]: https://github.com/ShinChven/remix-studio/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/ShinChven/remix-studio/releases/tag/v1.0.0
