# Built-in Assistant Multi-Agent Swarm — Design & Implementation Plan

Status: **Implemented (Phases 1–3)**
Date: 2026-11-28
Related: [assistant-chat-plan.md](./assistant-chat-plan.md)

---

## 1. Goal

Extend the built-in Remix Studio assistant (`server/assistant/`, `src/v2/pages/AssistantPage.tsx`) so a single user conversation can fan out and coordinate multiple specialized agents ("swarm") in parallel, while preserving:

1. **Single conversational entry point** — the user still interacts with one Coordinator thread.
2. **Existing safety guarantees** — confirmation gating for mutations, per-entity write safety, and bounded circuit breakers.
3. **Resilient live UX** — detached execution and `?since=seq` reconnectability via `AssistantTurnHub`.
4. **Cost & latency efficiency** — static cacheable prompt prefixes (KV cache) and optional model heterogeneity (stronger model for Coordinator, faster/cheaper model for parallel workers).

---

## 2. High-Value Use Cases in Remix Studio

- **Parallel fan-out / sharding:** Generating or rewriting 100–200 prompts across themes, drafting localized/platform-specific social posts for multiple campaigns, or auditing/tagging multiple albums simultaneously.
- **Role-specialized workflows:**
  - **Coordinator:** Plans work, spawns workers, tracks progress, synthesizes the final response.
  - **Prompt Engineer:** Curates and drafts text libraries / prompt batches.
  - **Workflow Builder:** Inspects models/libraries and prepares project workflows & draft jobs.
  - **Copywriter:** Writes and schedules campaign posts across X / Threads.
  - **Reviewer / QA:** Audits outputs against user constraints before write confirmation.
- **Model mixing:** Pairing a frontier reasoning model as Coordinator with fast/low-cost models (e.g. Flash / Mini / Haiku) for worker shards.

---

## 3. Recommended Topology: Coordinator + Workers (with Optional Shared Blackboard)

Start with a **Hub-and-Spoke (Coordinator + Specialist Workers)** model backed by a lightweight shared board, rather than unconstrained peer-to-peer messaging:

- The user talks to the **Coordinator** (the main `AssistantConversation` transcript).
- When Swarm Mode is enabled, the Coordinator receives swarm meta-tools:
  - `spawn_workers` — spawns 1..N workers in parallel with `{ name, role, brief, modelConfigId?, toolScope: 'read' | 'propose' | 'write' }`.
  - `message_worker` — sends follow-up instructions to a waiting/paused worker.
  - `wait_for_workers` / `get_swarm_status` — collects worker results and live status.
  - `stop_worker` — cancels a specific worker.
- Workers run in isolated transcripts (`swarmAgentId`) and return concise handoff summaries to the Coordinator so the Coordinator's context window stays compact.

---

## 4. Runtime Architecture (`server/assistant/`)

### 4.1 Reuse `AssistantRunner` as the Worker Loop

Avoid building a second LLM/tool loop. Parameterize `AssistantRunner` (`server/assistant/assistant-runner.ts`) to accept an optional execution context:

- `systemPromptOverride?: string` — static base system prompt + role instructions (kept static per worker for KV cache hits).
- `allowedToolNames?: Set<string>` / `toolScope?: 'read' | 'propose' | 'write'` — restricts worker capabilities (e.g., read-only for researchers/reviewers).
- `providerOverride?: { providerId: string; modelConfigId: string }` — allows workers to run on a different configured provider/model than the Coordinator.
- `swarmAgentId?: string` — isolates persisted messages and confirmations to that worker.
- `abortSignal?: AbortSignal` — linked to the parent Coordinator turn so pressing **Stop** cancels the entire swarm cleanly.

### 4.2 Add `SwarmOrchestrator` (`server/assistant/swarm-orchestrator.ts`)

Responsibilities:
- Manage the lifecycle of an `AssistantSwarmRun` and its `AssistantSwarmAgent` rows.
- Enforce a **per-swarm concurrency pool** (e.g. `MAX_CONCURRENT_WORKERS = 4`, queuing extra shards) independent of `PER_USER_CONCURRENT = 2` so provider rate limits aren't tripped.
- Enforce **aggregate swarm budgets** (total iterations, total tool calls, wall-clock timeout) across all workers combined.
- Maintain **per-entity write locks** (in-memory mutex keyed by `project:<id>`, `library:<id>`, `post:<id>`, `campaign:<id>`) to prevent concurrent mutation races—especially for full-replacement tools like `update_project` (`workflowItems`).
- Forward worker status events to the parent conversation's `AssistantTurnHub` stream.

---

## 5. Solving Write Confirmations & Mutation Safety

In single-agent mode, a confirmation-gated tool pauses the entire turn (`awaiting_confirmation`). In a swarm, naively pausing the whole swarm per tool call creates approval fatigue and race conditions.

### Strategy

1. **Default workers to `read` or `propose` mode (Phase 1):**
   - Workers read libraries, projects, albums, and campaigns, then return structured drafts/proposals to the Coordinator.
   - The Coordinator presents one unified plan and performs batched writes itself (or delegates to a single writer worker).
2. **Per-worker pause + Batched Confirmation Queue (Phase 2):**
   - When a write-capable worker hits a confirmation-gated tool, **only that worker** transitions to `awaiting_confirmation`; sibling workers keep running.
   - All pending worker confirmations surface together in a grouped approval bar ("Approve All" or per-item Confirm/Cancel) tagged with the requesting worker's name.
   - Acquiring the entity mutex before executing a confirmed mutation guarantees serialized writes to the same project/library/post.

---

## 6. Database Schema Additions (`prisma/schema.prisma`)

> Always generate standard Prisma migrations (`prisma migrate dev`), never `prisma db push`.

1. **`AssistantSwarmRun`** (child of `AssistantConversation`):
   - `id`, `conversationId`, `goal`, `status` (`running` | `awaiting_confirmation` | `completed` | `stopped` | `failed`), `createdAt`, `completedAt`.
2. **`AssistantSwarmAgent`** (child of `AssistantSwarmRun`):
   - `id`, `swarmRunId`, `name` (e.g. `prompt-writer-1`), `role`, `brief`, `providerId`, `modelConfigId`, `toolScope`, `status` (`queued` | `running` | `waiting` | `awaiting_confirmation` | `completed` | `failed` | `stopped`), `summary`, `inputTokens`, `outputTokens`, `createdAt`, `updatedAt`.
3. **Optional `swarmAgentId String?` foreign key** on existing tables:
   - `AssistantMessage`: `swarmAgentId == null` stays on the Coordinator transcript; worker messages are isolated by `swarmAgentId` while keeping full persistence, MCP App frames, and token tracking.
   - `AssistantPendingConfirmation`: links a pending confirmation to the specific worker that proposed it.

---

## 7. Streaming & Reattach (`server/assistant/assistant-turn-hub.ts`)

Keep the existing single NDJSON stream per `conversationId` so reloads and mobile disconnects continue to work via `?since=seq`:

- Extend `AssistantStatusEvent` with optional `swarmRunId`, `agentId`, and `agentName` fields on existing events (`provider_call_started`, `tool_call_started`, `tool_call_finished`, `confirmation_required`).
- Add swarm lifecycle events:
  - `swarm_started`
  - `agent_spawned`
  - `agent_status_changed`
  - `agent_completed`
  - `swarm_completed`
- Increase `MAX_BUFFERED_FRAMES` if needed (or coalesce high-frequency worker thinking frames) so reconnecting clients can reconstruct the live roster state.

---

## 8. Frontend UX (`src/v2/pages/AssistantPage.tsx`)

Transform the existing right sidebar from a chat-history list into a general-purpose **Agent Side Panel** (useful in both single-agent and swarm sessions), and move conversation history into a lightweight **Quick History Search Dialog**.

### 8.1 Header Bar & Quick History Search Dialog (`ChatHistoryDialog`)

- **Header (`v2-chat__header`)**: Move `+ New Chat` and History Search out of the right `SideSheet` header into the main chat header so they remain 1-click accessible even when the Agent Panel is collapsed:
  - `+ New` button (navigates to `/assistant`).
  - `History` search icon button (opens `ChatHistoryDialog`). **Do not** bind `⌘K` / `Ctrl+K`, as that shortcut is already reserved for Remix Studio's system-wide search.
  - `Settings` icon button (links to `/assistant/settings`).
  - `Agent Panel` toggle (`right_panel_open` / `right_panel_close`) with a live `Badge` count when workers are running or confirmations are pending.
- **Quick History Search Dialog (`src/v2/components/assistant/ChatHistoryDialog.tsx`)**:
  - M3 `Dialog` with an auto-focused search input.
  - **Empty query:** Displays the 15–20 most recent conversations (`fetchAssistantConversations`), highlighting the active chat, with relative timestamps and hover actions for **Rename** and **Delete** (confirmed via `ConfirmDialog`, never `window.confirm`).
  - **With query:** Debounced `searchAssistantConversations(q, 1, 15)` matching both titles and message content.
  - **Keyboard support:** `↑` / `↓` to navigate results, `Enter` to open `/assistant/:id`, `Esc` to close.
  - **Footer:** `+ New chat` on the left and **`Open full history →`** on the right linking to `/assistant/history` (`src/v2/pages/ChatHistory.tsx`).

### 8.2 Generalized Agent Side Panel (`AgentSidePanel`)

Replace `conversationsPanel` inside the existing right `SideSheet` (`src/v2/components/assistant/AgentSidePanel.tsx`), widened from `300px` to `340px–360px` when docked (`≥1200px`) and modal on narrower viewports. Organize the panel into **3 M3 `Tabs`** so it provides value in every conversation, not only swarm runs:

1. **`Activity` (Default tab)**
   - **Session & Agent Summary Card (always visible):** Active Coordinator provider/model, context window usage meter (`contextUsageTokens` + KV cache hit rate when available), and a quick **Swarm Mode** toggle.
   - **Pending Approvals (pinned when > 0):** Surfaces single-agent or batched Phase 2 swarm confirmations tagged with the requesting worker's name, offering **Approve All** and per-item **Confirm / Approve Tool / Cancel** controls.
   - **Live Execution & Swarm Roster:**
     - *Single-agent mode:* Live step / recent tool call timeline for the active turn.
     - *Swarm mode:* Coordinator status row + live Worker cards for the active `AssistantSwarmRun` (name, role, model badge, tool scope, status pill, live tool/thinking preview, token usage, and per-worker **Stop**), plus a collapsible section for earlier swarm runs in the same conversation.
   - **In-Panel Worker Inspector (drill-down):** Clicking any worker card transitions the panel in-place (`← <worker-name>`) instead of stacking a second `SideSheet`. Renders the collapsible assignment brief, worker status/tokens/stop control, and the worker's isolated transcript (`ChatThoughtAccordion`, tool `<details>` + `JsonView`, `Markdown`, MCP App frames, and any per-worker pending confirmation).
2. **`Resources` (with count badge)**
   - Houses the existing `ResourcePanel` (`src/v2/components/assistant/ResourcePanel.tsx`) showing Projects, Libraries, Campaigns, and Posts touched by the Coordinator or any worker, with quick preview, `@` mention, open link, and remove actions.
   - *(Phase 3)* Adds a **Shared Blackboard / Drafts** section for structured intermediate outputs shared between workers.
3. **`Tools` (Session Capabilities & Guardrails)**
   - **Session Auto-Approved Tools:** Inline list of tools auto-approved in this conversation with 1-click revoke (replaces/mirrors `ApprovedToolsDialog`).
   - **Connected MCP Servers:** Status indicators and active tool counts.
   - **Quick Skills:** Quick-insert list from `Assistant Skills` (`src/lib/assistant-skills.ts`) directly into the composer.
   - **Swarm Worker Model:** Quick selector for the default worker model when Swarm Mode is enabled.
   - **Full Settings Link:** `"Open full settings →"` navigating to `src/v2/pages/AssistantSettings.tsx` for full provider, skill, tool, and MCP management.

### 8.3 Main Transcript, Composer & i18n

- **Compact Inline Swarm Card** in the Coordinator transcript: Shows goal, worker count, and clickable worker status pills that open/focus that worker directly in the Agent Side Panel.
- **Opt-in Swarm Toggle** in `src/v2/components/assistant/Composer.tsx` (synced with the Agent Side Panel) + default **Worker Model** setting in `src/v2/pages/AssistantSettings.tsx` (e.g. strong Coordinator model + fast Worker model).
- Remember to update all 6 locales (`en`, `fr`, `ja`, `ko`, `zh-CN`, `zh-TW`) and verify with `npm run i18n:check`.

---

## 9. KV / Prompt Caching Prerequisite

Multi-agent swarms multiply LLM calls per user request, making prefix/KV caching essential before rolling out swarms:

- Keep `ASSISTANT_SYSTEM_PROMPT` (and worker system prompts) **100% static** — never interpolate changing timestamps into the system prompt.
- Attach deterministic per-message timestamps (`m.createdAt`) on user messages so historical prefixes remain byte-identical across iterations and turns.
- Send explicit `cache_control: { type: 'ephemeral' }` breakpoints on Anthropic (tools, system, conversation tail) and `prompt_cache_key` on OpenAI.
- Surface `cachedInputTokens` / `cacheCreationInputTokens` in provider usage and logs to verify cache hit rates.

---

## 10. Phased Rollout

### Phase 1 — Delegated Subagents (Read & Draft Only) & Agent Side Panel
- Schema migration: `AssistantSwarmRun`, `AssistantSwarmAgent`, `AssistantMessage.swarmAgentId`.
- Refactor `AssistantRunner` to support scoped worker runs + add `SwarmOrchestrator` with `read` / `propose` workers.
- Replace the right chat-history sidebar with the 3-tab `AgentSidePanel` (`Activity` | `Resources` | `Tools`, including in-panel Worker Inspector drill-down) and move history into `ChatHistoryDialog` from the header bar.
- Extend `AssistantTurnHub` events and add the compact inline Swarm Card in the Coordinator transcript.
- *Outcome:* Zero confirmation/locking complexity; immediate parallel speedup for research, bulk prompt drafting, and campaign copywriting, plus a permanently useful Agent Side Panel for both solo and swarm chats.

### Phase 2 — Write-Capable Workers + Batched Confirmations + Entity Locks
- Add `AssistantPendingConfirmation.swarmAgentId`.
- Per-worker pause/resume on confirmation + per-entity write mutex in `SwarmOrchestrator`.
- Pinned grouped approval controls in the `AgentSidePanel` `Activity` tab (and inline inside each worker's drill-down inspector).

### Phase 3 — Shared Blackboard & Reusable Swarm Presets
- Add a shared swarm scratchpad/artifact store surfaced under the `AgentSidePanel` `Resources` tab so workers can pass structured outputs directly without routing everything through the Coordinator.
- Allow saving reusable swarm templates (roles, briefs, model pairings) alongside `src/lib/assistant-skills.ts`.
