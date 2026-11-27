# Built-in Assistant Multi-Agent Swarm — Design & Implementation Plan

Status: **Proposed (Design Draft)**
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

- **Opt-in Swarm Toggle** in `src/v2/components/assistant/Composer.tsx` + optional default **Worker Model** setting in `src/v2/pages/AssistantSettings.tsx` (allowing e.g. a strong Coordinator model + fast Worker model).
- **Inline Swarm Activity Card** in the Coordinator transcript:
  - Collapsible accordion (similar to `ChatThoughtAccordion`) showing each worker's name, role, status pill, current tool/step, and token usage.
- **Worker Inspector `SideSheet`:**
  - Clicking any worker pill opens a `SideSheet` rendering that worker's full transcript, tool calls, and MCP App frames without cluttering the main chat.
- **Batched Confirmation Bar (Phase 2):**
  - Displays pending confirmations grouped by worker with individual and batch Confirm/Cancel controls.
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

### Phase 1 — Delegated Subagents (Read & Draft Only)
- Schema migration: `AssistantSwarmRun`, `AssistantSwarmAgent`, `AssistantMessage.swarmAgentId`.
- Refactor `AssistantRunner` to support scoped worker runs + add `SwarmOrchestrator` with `read` / `propose` workers.
- Extend `AssistantTurnHub` events and add the inline Swarm Card + Worker Inspector `SideSheet`.
- *Outcome:* Zero confirmation/locking complexity; immediate parallel speedup for research, bulk prompt drafting, and campaign copywriting.

### Phase 2 — Write-Capable Workers + Batched Confirmations + Entity Locks
- Add `AssistantPendingConfirmation.swarmAgentId`.
- Per-worker pause/resume on confirmation + per-entity write mutex in `SwarmOrchestrator`.
- Grouped approval UI in `AssistantPage.tsx`.

### Phase 3 — Shared Blackboard & Reusable Swarm Presets
- Add a shared swarm scratchpad/artifact store so workers can pass structured outputs directly without routing everything through the Coordinator.
- Allow saving reusable swarm templates (roles, briefs, model pairings) alongside `src/lib/assistant-skills.ts`.
