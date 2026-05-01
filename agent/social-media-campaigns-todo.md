# Social Media Campaigns: Implementation Task Track

This document serves as the master checklist connecting the four core architecture and design documents for the Social Media Campaigns feature:
1.  **Core Architecture:** `agent/social-media-campaigns-plan.md`
2.  **Agent Orchestration:** `agent/social-media-campaign-agent-orchestration.md`
3.  **X API Integration:** `agent/x-api-v2-integration-plan.md`
4.  **UI/UX Design:** `agent/social-media-campaigns-ui-plan.md`

---

## Phase 1: Database & Core Infrastructure

*   [x] **1.1 Update Prisma Schema:** Add `SocialAccount`, `Campaign`, `Post`, `PostExecution`, and `PostMedia` models to `prisma/schema.prisma`. (Ref: *Core Architecture*)
*   [x] **1.2 Generate Prisma Client:** Run `npx prisma generate` to update the client. **DO NOT run `prisma migrate dev` or modify the database.**
*   [x] **1.3 Create Repositories:** Create Prisma repository layers for the new models (`CampaignRepository`, `SocialAccountRepository`, `PostRepository`).

## Phase 2: External API & Security (X v2 Integration)

*   [x] **2.1 Environment Setup:** Add X OAuth credentials (`X_CLIENT_ID`, `X_CLIENT_SECRET`, `PROVIDER_ENCRYPTION_KEY`) to `.env.example` and validation logic.
*   [x] **2.2 Social Channel Abstraction:** Implement `ISocialChannel` and `SocialChannelFactory` in `server/services/social/`. (Ref: *Core Architecture*)
*   [x] **2.3 X OAuth 2.0 PKCE Implementation:** Build the auth flow (generate `code_challenge`, handle redirects, exchange tokens, encrypt tokens at rest). (Ref: *X API Integration*)
*   [x] **2.4 Token Refresh Logic:** Implement automatic decryption and refresh logic for short-lived X access tokens.
*   [x] **2.5 X API v2 Image Upload:** Implement direct upload (`POST /2/media/upload`) for images. (Ref: *X API Integration*)
*   [x] **2.6 X API v2 Chunked Upload:** Implement the 4-step chunked upload (INIT, APPEND, FINALIZE, STATUS) for Videos/GIFs, respecting the 2MB chunk limit.
*   [x] **2.7 X API v2 Tweet Creation:** Implement the `POST /2/tweets` endpoint, attaching `media_ids`.

## Phase 3: Asynchronous Queues & Workers

*   [x] **3.1 Media Processing Worker:** Create `MediaProcessingPoller` to poll `PostMedia` where status is `pending`. (Ref: *Core Architecture*)
*   [x] **3.2 Image Optimization Pipeline:** Integrate `sharp` to resize images > 4096px and compress to target byte size (<4.7MB) for X. Save to S3 `campaigns/{id}/media/`. (Ref: *X API Integration*)
*   [x] **3.3 Thumbnail Generation:** Generate lightweight thumbnails during media processing for the UI.
*   [x] **3.4 PostManager Fan-out Trigger:** Create a `setInterval` worker to find `scheduled` posts, update status, and fan out to `PostExecution` records per connected account.
*   [x] **3.5 PostManager Execution Worker:** Create the worker that polls `PostExecution`, invokes the `ISocialChannel.publish()`, handles rate limits, and updates status (success/failed).
*   [x] **3.6 Retry & Backoff Strategy:** Implement the fast-retry backoff (1s, 2.5s, 5s) and `retry-after` header parsing for transient errors. (Ref: *Core Architecture*)

## Phase 4: AI Agent Orchestration

*   [x] **4.1 System Prompt Update:** Add campaign, post, and social account vocabulary to `ASSISTANT_SYSTEM_PROMPT` in `server/assistant/system-prompt.ts`. (Ref: *Agent Orchestration*)
*   [x] **4.2 Campaign Tools:** Implement `create_campaign`, `list_campaigns`, and `update_campaign` in `server/mcp/tool-definitions.ts`.
*   [x] **4.3 Post Tools:** Implement `create_post`, `get_post`, `update_post`, `add_media_to_post`, and `schedule_post`.
*   [x] **4.4 Social Account Tool:** Implement `list_social_accounts`.
*   [x] **4.5 Write Action Gating:** Ensure all mutation tools require user confirmation before execution.

## Phase 5: User Interface & Frontend

*   [x] **5.1 Navigation & Routing:** Add `/campaigns` and `/campaigns/:id` routes, and update the sidebar navigation. (Ref: *UI/UX Design*)
*   [x] **5.2 Settings > Social Integrations:** Build the UI panel to connect/disconnect X accounts and display active/expired status.
*   [x] **5.3 Campaigns Dashboard:** Build the list/grid view of campaigns with aggregated metrics.
*   [x] **5.4 Campaign Detail (Kanban):** Implement the board showing Drafts, Scheduled, Published, and Failed posts.
*   [x] **5.5 Post Composer Modal:** Build the text area, dynamic character counter (warn only, do not block), and timezone-aware date picker.
*   [x] **5.6 Media Picker & Async Indicators:** Build the UI to attach Library/Album items and display loading spinners while `PostMedia` is processing.
*   [x] **5.7 Granular Execution Reporting:** Build the per-channel status chips on published/failed posts, surfacing exact error messages and actionable "Retry" buttons.

## Phase 6: Code Audit & Verification

*   [x] **6.1 Security Audit:** Verify OAuth PKCE implementation, token encryption at rest, and strict tenant isolation in all database queries.
*   [x] **6.2 API Compliance Audit:** Ensure the X API integration exclusively uses v2 endpoints and adheres strictly to the defined media size and chunking limits (2MB chunks).
*   [x] **6.3 Concurrency Audit:** Review the `PostManager` and `MediaProcessingPoller` to confirm `SKIP LOCKED` is used correctly to prevent race conditions across worker instances.
*   [x] **6.4 Architectural Verification:** Audit the frontend and backend to ensure save-time validation is permissive (allowing mixed media) and send-time execution gracefully handles platform-specific rejections.