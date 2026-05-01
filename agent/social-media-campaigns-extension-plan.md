# Social Media Campaigns: Extension Plan (Campaign Feature Parity)

This document extends the existing social media campaigns implementation (see `social-media-campaigns-plan.md`, `social-media-campaigns-ui-plan.md`, `social-media-campaign-agent-orchestration.md`, `x-api-v2-integration-plan.md`, and `social-media-campaigns-todo.md` Phases 1–6) to reach feature parity with the Pilot Banana reference implementation **for the campaign experience only**.

Scope is strictly the in-campaign post management surface. Out-of-scope features from Pilot Banana (standalone Prompt templates library, separate AI Tasks queue page, dedicated Channels page, Post History pages, Stats dashboard, BatchCreate page, alternate auth flows, multi-platform OAuth beyond X) are explicitly **not** included.

---

## 1. Goal

Bring `src/pages/CampaignDetail.tsx` to parity with Pilot Banana's `CampaignProfile.tsx` so that, inside a single campaign, a user can:
- Filter, sort, and search posts within the campaign.
- Multi-select posts and apply batch operations (schedule, unschedule, AI-generate text, send now, delete).
- Send an individual post immediately (manual publish), reusing the existing `PostManager` fan-out pathway.
- Run a one-shot AI text generation across selected posts via an inline modal (no prompt template library, no separate AI Tasks page).

All work layers on the existing schema, repositories, workers, and `ISocialChannel` abstraction. No Prisma migrations are required.

---

## 2. Non-Goals

The following Pilot Banana features are **explicitly excluded** from this extension:
- Prompt templates CRUD (`Prompts.tsx`, `PromptForm.tsx`, `Prompt` table).
- Standalone AI Tasks queue page (`AiTasks.tsx`, `AiTask` table). Inline AI generation runs synchronously or via the existing assistant pipeline; results land directly on the post's `textContent`.
- Dedicated Channels management page (`Channels.tsx`). The current settings-based connect/disconnect flow remains.
- Campaign / Global Post History pages (`CampaignHistory.tsx`, `GlobalHistory.tsx`).
- Stats dashboard endpoint and UI tile.
- BatchCreate drag-drop multi-file page.
- Pilot Banana auth, login logs, passkeys, access tokens, users admin pages.
- LinkedIn / Facebook / Instagram OAuth + publishers (X-only per `x-api-v2-integration-plan.md`).
- EmojiAvatar / AvatarPicker components.

These may be considered later but are not part of this extension.

---

## 3. Backend Additions

All new routes go in `server/routes/posts.ts`. No new database tables. No changes to existing routes.

### 3.1 `POST /api/posts/batch-schedule`
- **Body:** `{ items: Array<{ postId: string; scheduledAt: string /* ISO */ }> }`
- **Action:** For each post owned by the authenticated user, set `scheduledAt` and `status = 'scheduled'`. Validate each post belongs to the user. Reject any post whose attached `PostMedia` are not all `ready` (preserves the existing media-readiness gate).
- **Response:** `{ updated: number; skipped: Array<{ postId: string; reason: string }> }`

### 3.2 `POST /api/posts/batch-unschedule`
- **Body:** `{ postIds: string[] }`
- **Action:** For each owned post currently in `scheduled` status, revert to `draft` and clear `scheduledAt`. Posts already in `completed` or `failed` are skipped.
- **Response:** `{ updated: number; skipped: Array<{ postId: string; reason: string }> }`

### 3.3 `POST /api/posts/:id/send`
- **Body:** none.
- **Action:** Manual immediate publish. Validates ownership and that media is `ready`. Marks the post `completed` and inserts `PostExecution` records for each linked `SocialAccount` on the parent campaign with `nextAttemptAt = NOW()`, exactly mirroring the `PostManager` fan-out logic. Returns the created executions so the UI can poll their status.
- **Response:** the post with its newly created `executions` included.
- **Notes:** This shares logic with `PostManager.fanOut()`. Refactor that method (if not already) to expose a pure `fanOutPost(postId)` helper that both the scheduler and this endpoint call. Concurrency: use `SELECT … FOR UPDATE` on the post row to avoid double-fan-out if the scheduler picks it up at the same moment.

### 3.4 `POST /api/posts/batch-generate-text`
- **Body:** `{ postIds: string[]; promptText: string; includeImages?: boolean }`
- **Action:** For each owned post, call the existing assistant LLM service to produce `textContent` from `promptText` (and optionally the post's first attached `PostMedia` thumbnail, when `includeImages` is true). Update each post's `textContent` in place. Run sequentially with a small concurrency cap (e.g., 3) to respect provider rate limits.
- **Response:** `{ results: Array<{ postId: string; ok: boolean; text?: string; error?: string }> }`
- **Implementation notes:** Reuse the existing assistant LLM client used elsewhere in `server/assistant/`. Do **not** introduce a new `AiTask` table or background worker. Failure on one post must not abort the batch.

### 3.5 (Optional) Pagination / filtering on existing campaign post list
The current `GET /api/campaigns/:id` returns all posts inline. If post count is unbounded in practice, add `GET /api/campaigns/:id/posts?status=&search=&sort=&page=&pageSize=` returning paginated posts. Otherwise keep the inline list and filter/sort client-side. **Default: client-side**, revisit if real campaigns exceed ~200 posts.

---

## 4. Frontend Changes

All work is contained within `src/pages/CampaignDetail.tsx` plus a small number of new components under `src/components/`.

### 4.1 Post list controls (in `CampaignDetail.tsx`)
- Status filter pills: All / Draft / Scheduled / Posted / Failed (counts derived client-side from the existing `posts` array).
- Sort selector: Created (desc/asc), Scheduled (asc/desc).
- Search input (matches `textContent` substring, case-insensitive).
- Multi-select checkbox per post + select-all checkbox in header.

### 4.2 Batch action toolbar (new section in `CampaignDetail.tsx`)
Visible only when ≥1 post is selected. Buttons:
- **Schedule…** → opens `BatchScheduleModal`.
- **Unschedule** → calls `batch-unschedule` directly with confirmation.
- **AI generate…** → opens `BatchAiGenerateModal`.
- **Send now** → confirmation dialog, then loops `POST /api/posts/:id/send` per selected post (or a future `batch-send` if needed).
- **Delete** → confirmation dialog, then loops existing `DELETE /api/posts/:id`.

### 4.3 New components

**`src/components/BatchScheduleModal.tsx`**
- Single datetime picker (user's local timezone, converted to UTC on submit).
- Optional: stagger spacing input (e.g., "10 minutes between each post"), which computes `scheduledAt` per selected post.
- Submit calls `POST /api/posts/batch-schedule`.

**`src/components/BatchAiGenerateModal.tsx`**
- Textarea for the user's one-shot prompt.
- Checkbox: "Include first image as context" (sets `includeImages: true`).
- Submit calls `POST /api/posts/batch-generate-text`, shows per-post progress as results stream back.
- On finish, refresh the campaign so updated `textContent` is visible.

**`src/components/SendNowButton.tsx`** (or inline in the existing post row)
- Single-post "Send now" action. Confirmation → `POST /api/posts/:id/send` → toast + refresh.

### 4.4 API client additions in `src/api.ts`
- `batchSchedulePosts(items)`
- `batchUnschedulePosts(postIds)`
- `sendPostNow(postId)`
- `batchGeneratePostText(postIds, promptText, includeImages)`

All follow the existing `apiFetch` pattern (cookie auth, throws on non-2xx).

---

## 5. Files Touched

### New
- `src/components/BatchScheduleModal.tsx`
- `src/components/BatchAiGenerateModal.tsx`
- (Optionally) `src/components/SendNowButton.tsx` — or inline in `CampaignDetail.tsx` if trivial.

### Modified
- `server/routes/posts.ts` — four new endpoints.
- `server/services/post-manager.ts` — extract a reusable `fanOutPost(postId)` helper if not already present.
- `src/pages/CampaignDetail.tsx` — filter/sort/search controls, multi-select, batch toolbar, send-now wiring.
- `src/api.ts` — four new client functions.

### Unchanged
- `prisma/schema.prisma` (no migrations).
- All Phase 1–6 worker / OAuth / media-processing code.
- Settings, dashboards, libraries, projects.

Estimated total: ~6–8 files.

---

## 6. Implementation Order

1. **Backend first.** Add the four endpoints in `server/routes/posts.ts` and refactor `post-manager.ts` to expose `fanOutPost`. Verify each via curl or the existing test harness.
2. **API client.** Add the four wrappers to `src/api.ts`.
3. **Modals.** Build `BatchScheduleModal` and `BatchAiGenerateModal` in isolation.
4. **CampaignDetail.** Wire filter/sort/search/multi-select/batch toolbar, integrate the modals, add Send Now.
5. **Manual QA.** Walk through: select multiple drafts → batch-schedule → confirm worker picks them up → unschedule one → batch-AI-generate → send-now on one → verify `PostExecution` rows fan out and the existing UI reports per-channel status.

---

## 7. Acceptance Criteria

- A user can, inside a single campaign, filter posts by status, sort them, search by text, and select multiple posts.
- A user can batch-schedule, batch-unschedule, batch-AI-generate-text, and send-now selected posts.
- An individual post can be sent immediately and surfaces per-channel execution status as it does today for scheduled-then-fired posts.
- No Prisma migration is required.
- No new top-level pages, no new sidebar entries, no new database tables.
- Existing Phase 1–6 behavior (X OAuth, media processing, scheduling worker, retry/backoff, kanban, agent tools) is unaffected.

---

## 8. Todo Checklist (append to `social-media-campaigns-todo.md` as Phase 7)

```
## Phase 7: Campaign Detail Parity (Pilot Banana Extension)

*   [ ] **7.1 Refactor PostManager:** Extract a pure `fanOutPost(postId)` helper from the scheduling loop so it can be invoked by both the scheduler and the manual send endpoint.
*   [ ] **7.2 Backend — `POST /api/posts/batch-schedule`:** Bulk set `scheduledAt` + `status='scheduled'`, gated on media readiness.
*   [ ] **7.3 Backend — `POST /api/posts/batch-unschedule`:** Bulk revert `scheduled` → `draft`, clear `scheduledAt`.
*   [ ] **7.4 Backend — `POST /api/posts/:id/send`:** Manual immediate publish via `fanOutPost`.
*   [ ] **7.5 Backend — `POST /api/posts/batch-generate-text`:** One-shot LLM text generation across selected posts using the existing assistant client; in-place update of `textContent`.
*   [ ] **7.6 API Client:** Add `batchSchedulePosts`, `batchUnschedulePosts`, `sendPostNow`, `batchGeneratePostText` to `src/api.ts`.
*   [ ] **7.7 BatchScheduleModal:** Datetime picker + optional stagger; submits batch-schedule.
*   [ ] **7.8 BatchAiGenerateModal:** Prompt input + include-image flag; submits batch-generate-text and shows per-post results.
*   [ ] **7.9 CampaignDetail — filters/sort/search:** Status pills, sort selector, text search.
*   [ ] **7.10 CampaignDetail — multi-select & batch toolbar:** Per-row + select-all checkboxes, action toolbar (Schedule, Unschedule, AI Generate, Send Now, Delete).
*   [ ] **7.11 CampaignDetail — Send Now (single-post):** Per-row "Send now" action wired to the new endpoint.
*   [ ] **7.12 Manual QA:** End-to-end walkthrough per Section 6 step 5.
```
