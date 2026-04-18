# Built-in Assistant Chat — Implementation Plan

Status: **Draft, awaiting approval before implementation.**
Author: Claude (planning agent), 2026-04-19.
Owner: TBD.

---

## 1. Goal

Add an in-app **Assistant** that lets the signed-in user chat with one of the project's existing text-capable AI providers. The assistant is wired to Remix Studio's existing **MCP tools** (libraries, projects, storage, etc.) so it can act on the user's behalf — orchestrate library content, draft prompts, propose project workflows, and help with future features we add.

Three hard requirements:

1. **Built-in.** Reuse the existing provider/credential system in `server/generators/` and the existing MCP tool implementations in `server/mcp/mcp-server.ts`. No new external API surface for tools.
2. **Loop-safe circuit.** The agent must not be able to recurse infinitely or burn the provider quota. Strict iteration budget, repetition detection, hard wall-clock timeout, and per-user concurrency limit.
3. **UI shape.** A new **Assistant** menu item in the left sidebar opens a `/assistant` page. Layout: left sidebar (existing menu, ~64–72 px collapsed / 256 px expanded), center is the chat UI, right is the conversation history panel **with the same width as the left sidebar** (collapsing in lockstep on small viewports).

---

## 2. Why this shape

- **Reuse of providers** keeps credentials/encryption/quota in one place. We already decrypt API keys via `ProviderRepository.getDecryptedApiKey`, so the assistant doesn't need a separate secret store.
- **Reuse of MCP tool handlers** keeps a single source of truth for "what the agent can do." A new tool added to MCP automatically becomes available to the assistant. (We *do not* tunnel through the HTTP MCP transport — too much overhead and OAuth doesn't fit the in-app session. We extract the tool handlers into a shared registry. See §5.)
- **Anchoring to the existing layout** (sidebar nav, `MainLayout.tsx`) reuses auth gating, mobile collapse, and the glassmorphism design language.

---

## 3. Out of scope (for v1)

- Streaming token-by-token UI. v1 returns each assistant turn as a single message after tools settle. (Streaming hooks designed but deferred — see §11.)
- Multimodal input (images/audio). v1 is text-only chat. (The assistant *can* surface library images via tool results.)
- Cross-conversation search.
- Sharing or exporting conversations.
- Voice / TTS.
- Cost telemetry / per-conversation token accounting (we'll log it server-side but not expose it in v1).

---

## 4. Architecture overview

```
┌─────────────────────────────────────────────────────────────────┐
│ Browser                                                         │
│  ┌───────────┐  ┌───────────────────────┐  ┌────────────────┐  │
│  │ Sidebar   │  │ Chat (center column)  │  │ Conv. history  │  │
│  │ (MainLay- │  │ messages, composer    │  │ list + new btn │  │
│  │  out)     │  │                       │  │                │  │
│  └───────────┘  └─────────┬─────────────┘  └────────┬───────┘  │
│                           │ POST /api/assistant/...           │
└───────────────────────────┼───────────────────────────────────┘
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│ server/assistant/                                               │
│  routes.ts          ── HTTP endpoints (cookie-auth, same as     │
│                       other /api/ routes)                       │
│  conversation-      ── CRUD on AssistantConversation /          │
│   repository.ts        AssistantMessage                         │
│  assistant-runner.ts── orchestration loop:                      │
│                       1. load history                           │
│                       2. call provider (via text-generator)     │
│                       3. if tool_use → invoke local tool, loop  │
│                       4. apply circuit breaker rules            │
│  tool-registry.ts   ── adapts MCP tool definitions to local     │
│                       Tool[] for the LLM, runs handlers         │
│                       in-process                                │
│  providers/         ── thin wrappers per provider type that     │
│   openai.ts            translate tools ↔ each SDK's tool API    │
│   anthropic.ts                                                  │
│   google.ts                                                     │
│   grok.ts                                                       │
└────────────────────┬────────────────────────────────────────────┘
                     ▼
   server/generators/  ←── existing text generators (re-used,
   server/mcp/         ←── existing tool handlers (extracted)
   server/db/          ←── existing repositories
```

The assistant runner is the only new "loop." Every other piece (providers, tools, persistence) is delegated to existing subsystems.

---

## 5. Tool registry: extracting MCP handlers for in-process reuse

### Problem

`server/mcp/mcp-server.ts` defines all tool handlers inline inside `createMcpServerInstance(...)`. They're tightly bound to the MCP SDK's `server.registerTool(...)` API. To call them from the assistant we'd otherwise have to either:

- (a) Call our own `/mcp` endpoint over HTTP using a synthetic Bearer token — wasteful and forces OAuth-shaped auth onto an in-session user.
- (b) Duplicate the handler logic inside the assistant — bad, drifts.

### Solution

Refactor the tool definitions out of `mcp-server.ts` into a shared module:

- New file: `server/mcp/tool-definitions.ts`.
- Exports `function buildAssistantToolset(deps): ToolDefinition[]` where `ToolDefinition` is:

  ```ts
  interface ToolDefinition {
    name: string;
    title: string;
    description: string;
    inputSchema: z.ZodObject<any>; // already used today
    annotations: { readOnlyHint: boolean; destructiveHint: boolean; ... };
    handler: (userId: string, input: any) => Promise<{ text: string; isError?: boolean }>;
  }
  ```

- `mcp-server.ts` becomes a thin adapter: it iterates `buildAssistantToolset(...)` and calls `server.registerTool(name, { description, inputSchema, annotations }, (input) => def.handler(userId, input))`. The HTTP MCP behavior is unchanged.
- The assistant runner calls `def.handler(userId, input)` directly. No HTTP, no OAuth.

### Tool surface for v1

We expose **the read-only tools by default** plus the write tools the user opts into per-conversation:

| Tool | v1 default | Notes |
|---|---|---|
| `list_libraries`, `list_all_libraries` | exposed | safe |
| `get_library_items` | exposed | safe |
| `search_library_items` | exposed | safe |
| `list_albums` | exposed | safe |
| `get_storage_usage` | exposed | safe |
| `list_available_models` | exposed | safe |
| `create_library` | exposed (write) | low-risk creation |
| `create_prompt`, `batch_create_prompts` | exposed (write) | bounded by `max=100` |
| `create_project_with_workflow` | **gated** | requires explicit user confirmation in chat — see §7.4 |

The `create_project_with_workflow` tool's existing description already mandates user confirmation. The runner enforces this by intercepting tool calls of this name and inserting a confirmation step (the model proposes, the UI surfaces a "Confirm / Edit / Cancel" affordance, and only on confirm does the runner execute the tool). Implementation detail in §7.4.

### Future extensibility

When we add new MCP tools later, they get reflected automatically in the assistant. A capability-tag system (`category: 'read' | 'mutate' | 'destructive'`) is added to `ToolDefinition` so the runner can apply policy without hand-curating per-tool lists.

---

## 6. Provider adapters

The current `TextGenerator` interface only emits `{ ok, text }`. For tool use we need round-trip messages. We add a parallel interface:

```ts
// server/assistant/providers/types.ts
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolCall { id: string; name: string; arguments: unknown; }

export interface ChatRequest {
  modelId: string;
  messages: ChatMessage[];
  tools?: ToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface ChatResponse {
  text: string;          // assistant-visible text portion (may be empty if pure tool call)
  toolCalls: ToolCall[]; // empty when the model decided to stop
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
  usage?: { inputTokens: number; outputTokens: number };
}

export interface ChatProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}
```

One adapter per supported family, in `server/assistant/providers/`:

| File | Provider type | SDK function |
|---|---|---|
| `openai.ts` | `OpenAI`, `Grok` (OpenAI-compatible) | `client.chat.completions.create({ tools, tool_choice: 'auto' })` |
| `anthropic.ts` | `Claude` | `client.messages.create({ tools, tool_choice })` |
| `google.ts` | `GoogleAI`, `VertexAI` | `@google/genai` `generateContent` with `tools.functionDeclarations` |

These adapters **reuse credential lookup via `ProviderRepository.getDecryptedApiKey(userId, providerId)`** and accept the model id (e.g. `claude-sonnet-4-6`) from `PROVIDER_MODELS_MAP` filtered by `category === 'text'`.

We pick one provider per conversation: stored on `AssistantConversation` as `(providerId, modelConfigId)`. The user picks at conversation creation; can be changed later.

### Why not extend `TextGenerator`

`TextGenerator` is shaped for one-shot prompt-in/text-out generation used by the project queue. Bolting tool messages onto it would distort that interface for the queue. Cleaner to add a sibling interface in `server/assistant/providers/`.

---

## 7. Assistant runner & circuit breaker

The runner is the only place in the codebase that loops over LLM ↔ tool calls. **All loop-prevention rules live here.**

### 7.1 Per-turn loop

```ts
async function runAssistantTurn(ctx: TurnContext): Promise<void> {
  const start = Date.now();
  let iterations = 0;
  let toolBudget = MAX_TOOL_CALLS;        // total tool calls in this turn
  const recentCalls = new SlidingWindow(); // for repetition detection

  while (true) {
    if (++iterations > MAX_ITERATIONS)        throw new CircuitOpen('iter');
    if (Date.now() - start > MAX_WALL_CLOCK)  throw new CircuitOpen('time');
    ctx.signal.throwIfAborted();

    const resp = await ctx.provider.chat({ ... });
    appendAssistantMessage(resp);

    if (resp.stopReason === 'end_turn' || resp.toolCalls.length === 0) {
      return;
    }

    if (resp.toolCalls.length > MAX_PARALLEL_TOOLS) throw new CircuitOpen('parallel');
    if (toolBudget - resp.toolCalls.length < 0)     throw new CircuitOpen('budget');
    toolBudget -= resp.toolCalls.length;

    for (const call of resp.toolCalls) {
      if (recentCalls.isRepeat(call)) throw new CircuitOpen('repeat');
      recentCalls.push(call);

      // Guard: confirm-required tools (see §7.4)
      if (TOOL_REGISTRY.requiresConfirmation(call.name)
          && !ctx.confirmationToken?.matches(call)) {
        await stageConfirmationRequest(call);
        return; // turn ends; UI shows confirm UI; user re-submits with token
      }

      const result = await TOOL_REGISTRY.invoke(ctx.userId, call, ctx.signal);
      appendToolMessage(call.id, call.name, result);
    }
  }
}
```

### 7.2 Constants (initial values, tunable)

```
MAX_ITERATIONS       = 8     // assistant↔tool round trips per user turn
MAX_TOOL_CALLS       = 16    // total tool invocations per turn
MAX_PARALLEL_TOOLS   = 4     // tools in a single assistant message
MAX_WALL_CLOCK_MS    = 60_000
RECENT_CALL_WINDOW   = 6     // last N calls for repeat detection
PROVIDER_TIMEOUT_MS  = 30_000 // single LLM call
TOOL_TIMEOUT_MS      = 15_000 // single tool invocation
PER_USER_CONCURRENT  = 2     // simultaneous in-flight turns per user
```

All constants live in `server/assistant/circuit-config.ts` and are env-overridable for ops tuning.

### 7.3 Repetition detector

`SlidingWindow.isRepeat(call)` hashes `(name, JSON.stringify(args sorted))` and considers it a repeat if the *exact* same hash appeared **≥ 2 times** in the last `RECENT_CALL_WINDOW` calls. This catches the common failure where the model retries the same `search_library_items({query: "x"})` indefinitely. Model retries with *different* args are allowed.

### 7.4 Confirmation gate for `create_project_with_workflow`

The MCP tool's existing description already says "ask for explicit user confirmation before calling." We enforce it server-side:

1. Runner sees `create_project_with_workflow(args)` requested.
2. Instead of executing, runner stores the proposal as a `pending_tool_call` row attached to the assistant message and returns the turn.
3. Frontend renders the proposal as a **confirmation card** (project name, model, workflow summary, all options) with **Run / Edit / Cancel** buttons.
4. On **Run**, frontend POSTs `/api/assistant/conversations/:id/turns/:turnId/confirm` with the `pending_tool_call.id`. The runner re-enters the turn with a `confirmationToken` matching that id, which lets the runner skip the gate for that specific call.
5. On **Edit**, the user types changes; the runner re-invokes the LLM with the user's edit message, which produces a revised proposal.
6. On **Cancel**, the pending call is dropped.

This pattern is reusable for any future high-impact mutation tool.

### 7.5 Per-user concurrency

A simple in-process map `Map<userId, number>` enforces `PER_USER_CONCURRENT`. Excess requests get **429** with retry-after. (We don't need cross-process coordination for v1; if we later run multi-instance, lift this into Redis/DB.)

### 7.6 Failure semantics

When the circuit opens:

- The current turn is marked `status: 'circuit_open'` with `circuitReason` (`iter`, `time`, `parallel`, `budget`, `repeat`).
- The user sees a system-styled message in the chat: "Stopped — the assistant exceeded the *X* limit. You can try a more specific prompt." with a `Resume` action that starts a fresh turn (no auto-retry).
- All tool results that *did* complete remain part of the conversation history.
- Server logs include `userId`, conversation id, turn id, reason, iteration count, last 3 tool names — enough for ops to spot pathological prompts.

---

## 8. Database schema

New Prisma models in `prisma/schema.prisma`:

```prisma
model AssistantConversation {
  id            String   @id @default(uuid())
  userId        String
  title         String?  // null until first turn auto-titles it
  providerId    String?  // FK to Provider; null = "default available"
  modelConfigId String?  // ID from PROVIDER_MODELS_MAP[type], category=text
  systemPrompt  String?  @db.Text
  createdAt     DateTime @default(now())
  updatedAt     DateTime @default(now()) @updatedAt
  archived      Boolean  @default(false)

  user     User                 @relation(fields: [userId], references: [id], onDelete: Cascade)
  messages AssistantMessage[]
  turns    AssistantTurn[]

  @@index([userId, updatedAt])
}

model AssistantTurn {
  id              String   @id @default(uuid())
  conversationId  String
  status          String   @default("running") // running | completed | circuit_open | error | awaiting_confirm
  circuitReason   String?  // 'iter' | 'time' | 'parallel' | 'budget' | 'repeat' | null
  iterations      Int      @default(0)
  toolCallCount   Int      @default(0)
  startedAt       DateTime @default(now())
  completedAt     DateTime?
  errorMessage    String?  @db.Text

  conversation AssistantConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  messages     AssistantMessage[]

  @@index([conversationId, startedAt])
}

model AssistantMessage {
  id             String   @id @default(uuid())
  conversationId String
  turnId         String?
  role           String   // 'user' | 'assistant' | 'tool' | 'system'
  content        String   @db.Text   // for user/assistant text and system markers
  toolCalls      Json?    // [{ id, name, arguments }] for assistant turns that requested tools
  toolCallId     String?  // for role='tool', references the assistant tool_call id
  toolName       String?  // for role='tool'
  toolStatus     String?  // 'pending' | 'completed' | 'error' | 'awaiting_confirm'
  inputTokens    Int?
  outputTokens   Int?
  createdAt      DateTime @default(now())

  conversation AssistantConversation @relation(fields: [conversationId], references: [id], onDelete: Cascade)
  turn         AssistantTurn?         @relation(fields: [turnId], references: [id], onDelete: SetNull)

  @@index([conversationId, createdAt])
  @@index([turnId])
}
```

Add the back-relations to `User`:

```prisma
assistantConversations AssistantConversation[]
```

A migration goes in `prisma/migrations/`. No data backfill needed.

**Why `AssistantTurn`?** Each user message starts a turn. The turn aggregates the (possibly many) assistant messages and tool round-trips that result. This is what we display as a single "exchange" in the UI and what circuit-breaker stats hang off of.

---

## 9. HTTP API

All endpoints live in `server/routes/assistant.ts`, protected by `authMiddleware` (cookie-based JWT, same as the rest of the app — *not* MCP OAuth).

| Method | Path | Purpose |
|---|---|---|
| `GET`    | `/api/assistant/conversations`                          | List user's conversations (paginated, sorted by updatedAt desc). |
| `POST`   | `/api/assistant/conversations`                          | Create a new conversation. Body: `{ providerId?, modelConfigId?, systemPrompt? }`. |
| `GET`    | `/api/assistant/conversations/:id`                      | Fetch conversation metadata + recent messages. |
| `PATCH`  | `/api/assistant/conversations/:id`                      | Rename, archive, change provider/model. |
| `DELETE` | `/api/assistant/conversations/:id`                      | Delete (cascades messages/turns). |
| `POST`   | `/api/assistant/conversations/:id/turns`                | Submit a user message → triggers a turn. Body: `{ content }`. Returns the turn's final state once the runner returns (or 202 + poll for v1.5; see §11). |
| `POST`   | `/api/assistant/conversations/:id/turns/:turnId/confirm`| Approve a pending tool call. Body: `{ toolCallId }`. |
| `POST`   | `/api/assistant/conversations/:id/turns/:turnId/cancel` | Cancel a pending tool call or abort an in-flight turn. |
| `GET`    | `/api/assistant/options`                                | List user's text-capable providers + models (filtered to `category: 'text'`, only providers with stored API keys). |

Response shapes mirror the Prisma models with `BigInt` and `Date` normalized.

### Auth-flow note

- `authMiddleware` already drives `c.get('user').userId`. No new auth code.
- Errors use the existing convention (`{ error: 'message' }`) so toast handling in `src/api.ts` works as-is.

---

## 10. Frontend

### 10.1 Routing

In `src/App.tsx`, add:

```tsx
import { Assistant } from './pages/Assistant.tsx';
// inside <Route path="/" element={<MainLayout />}>:
<Route path="assistant" element={<Assistant />} />
```

### 10.2 Sidebar entry

In `src/components/MainLayout.tsx`, add a `NavItem` between Dashboard and Projects (or wherever the team prefers):

```tsx
import { Sparkles } from 'lucide-react'; // or MessageSquare

<NavItem
  to="/assistant"
  icon={<Sparkles className="w-5 h-5 flex-shrink-0" />}
  label={t('sidebar.assistant')}
  isActive={location.pathname === '/assistant'}
  isCollapsed={isCollapsed}
  onClick={() => setIsMobileMenuOpen(false)}
/>
```

Add the i18n key `sidebar.assistant` to all locale files in `src/locales/` (en, fr, ja, ko, zh-CN, zh-TW). English: `"Assistant"`.

### 10.3 Page layout

`src/pages/Assistant.tsx` renders a 3-column flex inside `MainLayout`'s `<Outlet />`:

```
┌── (already provided by MainLayout) ──┐ ┌── ChatColumn ──────────────┐ ┌── HistoryColumn ─┐
│ left sidebar nav (collapsible)      │ │ flex-1, scroll on overflow │ │ same width rules │
│ width: lg:w-64 (open) / lg:w-20     │ │ messages list              │ │ as left sidebar  │
└─────────────────────────────────────┘ │ composer at bottom         │ │ list of convos   │
                                         └────────────────────────────┘ └──────────────────┘
```

The right pane mirrors the left sidebar's width tokens for symmetry. We'll lift the collapsed/expanded width into a constant `SIDE_W = { open: 'w-64', collapsed: 'w-20' }` so both sides reference one source of truth. Behavior:

- Desktop (`lg`+): both side panes visible. Right pane has its own collapse toggle (independent of the left sidebar's collapse) so the user can run history-only or chat-only.
- Tablet (`md`): right pane hidden by default; reopened via a header button.
- Mobile: right pane is a slide-over (same pattern as the existing mobile sidebar backdrop).

### 10.4 Components

New components in `src/components/Assistant/`:

| File | Responsibility |
|---|---|
| `AssistantPage.tsx`           | Page shell, fetches conversation list and current conversation, owns layout. |
| `ConversationHistoryPanel.tsx`| Right column. List of past conversations, "New conversation" button, rename/archive/delete actions. |
| `ChatColumn.tsx`              | Center column. Message list, composer, model selector, status banners (e.g. circuit-open). |
| `MessageBubble.tsx`           | User / assistant / tool / system message rendering with `react-markdown` + `remark-gfm`. |
| `ToolCallCard.tsx`            | Renders a tool invocation: header with tool name, collapsible args, expandable result, status pill. |
| `ConfirmActionCard.tsx`       | Specialized card for `awaiting_confirm` tool calls (esp. `create_project_with_workflow`) with Run / Edit / Cancel. |
| `ModelPicker.tsx`             | Dropdown sourced from `GET /api/assistant/options`. |
| `Composer.tsx`                | Multiline textarea, ⌘+Enter to send, character count, disabled while a turn is running. |

### 10.5 State management

- React local state inside `AssistantPage`. No new global store needed.
- One in-flight request per conversation (matches server's per-user `PER_USER_CONCURRENT` but provides better UX).
- Optimistic insertion of the user's message; replaced by server data once the turn returns.

### 10.6 API client

Extend `src/api.ts` with `fetchAssistantConversations`, `createAssistantConversation`, `getAssistantConversation`, `sendAssistantTurn`, `confirmAssistantToolCall`, etc. Reuse `apiFetch` so refresh-token interception works.

### 10.7 Design language

Follow `agent/glassmorphism-design-spec.md`:

- Conversation list items: §2.2 secondary glass card.
- Composer container: §2.1 primary glass card.
- Tool call cards: §2.4 chip styling for the status pill, §2.2 card for the body.
- All side panes: existing `bg-white/10 dark:bg-black/10 backdrop-blur-3xl` from `MainLayout.tsx`.

---

## 11. Streaming (planned for v1.1, designed-in for v1)

v1 returns a turn synchronously after `runAssistantTurn` resolves. To keep the UI responsive when tool calls take time, the server returns 202 + a turn id, and the frontend polls `GET /api/assistant/conversations/:id/turns/:turnId` every 750 ms until status leaves `running`/`awaiting_confirm`.

For v1.1 we swap the polling for an SSE/WebSocket stream from the runner that emits `{ type: 'message_delta' | 'tool_call_started' | 'tool_call_completed' | 'turn_completed' | 'circuit_open', ... }` events. The DB schema and runner architecture already support this — we just don't ship the transport in v1.

---

## 12. Loop-prevention summary

To make the "no infinite agent loop" guarantee easy to audit:

1. **Hard iteration cap** (`MAX_ITERATIONS=8`).
2. **Tool budget** (`MAX_TOOL_CALLS=16`).
3. **Parallel tool cap** (`MAX_PARALLEL_TOOLS=4`).
4. **Wall-clock timeout** (`MAX_WALL_CLOCK_MS=60s`).
5. **Single-call timeouts** for both LLM calls and tool calls.
6. **Repetition detection** on `(toolName, args)` hash.
7. **Per-user concurrency cap** (max 2 in-flight turns).
8. **AbortSignal** plumbed end-to-end so user-initiated cancel reaches both the LLM SDK and any in-flight tool.
9. **Confirmation gate** for the highest-impact tool (`create_project_with_workflow`).
10. **Read-vs-mutate tool tagging** — write-tools that we don't trust the model with autonomously can be flipped to "confirm-required" without code changes to the runner.

---

## 13. Implementation phases

Each phase is independently mergeable. After each phase, the system continues to compile and existing features still work. Numbers are rough effort estimates for one engineer.

### Phase 0 — Decision & spec lock (≤ 1 day)
- Stakeholders review this plan, agree on tool surface, circuit constants, and UI shape.
- Pick the v1 default provider/model behavior (auto-pick first text-capable provider vs. force the user to pick).

### Phase 1 — Tool registry refactor (1–2 days)
- Extract MCP tool handlers into `server/mcp/tool-definitions.ts`.
- Refactor `mcp-server.ts` to consume the registry.
- Add `category: 'read' | 'mutate'` and `requiresConfirmation: boolean` to each definition.
- **Deliverable: zero behavior change to the existing MCP HTTP endpoint.** Verified by `mcp:inspect`.

### Phase 2 — DB schema & repositories (1 day)
- Add Prisma models (§8) and migration.
- Add `AssistantConversationRepository` to `server/db/`.
- Unit-test repository CRUD.

### Phase 3 — Provider adapters (2 days)
- `server/assistant/providers/` for OpenAI/Grok, Anthropic, Google.
- Smoke-test each adapter with `tools=[]` against a canned prompt.
- Add tool-call round-trip test against a real provider for at least one (Anthropic recommended — best tool-use semantics).

### Phase 4 — Runner & circuit breaker (2–3 days)
- Implement `assistant-runner.ts` with all circuit rules.
- Unit tests for each circuit reason: iter/time/parallel/budget/repeat.
- Integration test: full turn that uses `list_libraries` then `search_library_items`.

### Phase 5 — HTTP routes (1 day)
- Implement `server/routes/assistant.ts`.
- Wire into `server.ts` like the other routers.
- Manual test against the dev server using curl + cookie.

### Phase 6 — Frontend (3–4 days)
- Add menu item, route, and `Assistant` page.
- Build chat UI, history panel, model picker, tool cards, confirm card.
- i18n keys for all 6 locales (English first; provide placeholders for the rest with a TODO note).
- QA on desktop/tablet/mobile breakpoints.

### Phase 7 — Polish & ops (1–2 days)
- Server logs for circuit events.
- Structured error messages on the chat for each circuit reason.
- README/docs entry pointing here.
- Optional: an admin metric for "circuit_open events per day" (deferred unless someone asks).

**Total: ~10–14 engineering days for v1.**

---

## 14. Open questions for review

1. **Default provider/model.** When the user opens Assistant for the first time, do we auto-pick (e.g. first available `Claude` then `OpenAI` then `GoogleAI`) or force a setup step? Forcing a setup step is more honest about cost.
2. **Quota.** Do we want any per-day token quota at the assistant level, or rely entirely on the provider key's own billing? v1 ships with provider-only quota; opening a discussion if anyone wants in-app caps.
3. **Conversation soft-cap.** Should we hard-cap the conversation length (e.g. 200 messages) or just paginate the history sent to the LLM (e.g. last N messages + a rolling summary of older ones)? v1 plan: send the last 30 messages plus the system prompt, no summarization yet.
4. **Confirm-gate scope.** Right now only `create_project_with_workflow` is gated. Should `create_library` and `batch_create_prompts` also gate? They're low risk but visible to the user. Default proposed: don't gate; rely on the assistant's own confirmation prose. Easy to flip later via the registry tag.
5. **Right pane width parity.** The user asked for the right pane to match the left sidebar's width. Current proposal: it tracks the *left sidebar's collapsed/expanded state visually* (always equal width), but has its **own** collapse toggle. Confirm whether the user wants strict mirroring (both collapse together) or independent collapse with equal widths only when both are open.
6. **History panel: persistence vs. session-only.** v1 plan persists conversations indefinitely (until deleted by user). Confirm.

---

## 15. Files touched (summary)

**New:**

- `server/assistant/circuit-config.ts`
- `server/assistant/assistant-runner.ts`
- `server/assistant/conversation-repository.ts`
- `server/assistant/tool-registry.ts`
- `server/assistant/providers/types.ts`
- `server/assistant/providers/openai.ts`
- `server/assistant/providers/anthropic.ts`
- `server/assistant/providers/google.ts`
- `server/mcp/tool-definitions.ts`
- `server/routes/assistant.ts`
- `prisma/migrations/<ts>_add_assistant/migration.sql`
- `src/pages/Assistant.tsx`
- `src/components/Assistant/AssistantPage.tsx`
- `src/components/Assistant/ChatColumn.tsx`
- `src/components/Assistant/ConversationHistoryPanel.tsx`
- `src/components/Assistant/MessageBubble.tsx`
- `src/components/Assistant/ToolCallCard.tsx`
- `src/components/Assistant/ConfirmActionCard.tsx`
- `src/components/Assistant/ModelPicker.tsx`
- `src/components/Assistant/Composer.tsx`

**Modified:**

- `server/mcp/mcp-server.ts` — consume the new tool-definitions module instead of defining handlers inline.
- `server.ts` — mount `/api/assistant/...` router.
- `prisma/schema.prisma` — new models + back-relations on `User`.
- `src/App.tsx` — `/assistant` route.
- `src/components/MainLayout.tsx` — sidebar nav item.
- `src/api.ts` — assistant API client functions.
- `src/locales/*.json` — `sidebar.assistant` plus chat-page strings.

**Untouched:**

- `server/generators/*` — text generators stay as-is for the project queue.
- `server/queue/*` — no interaction.
- The existing MCP HTTP endpoint and OAuth flow.

---

## 16. Decision needed

Greenlight on this plan (with answers to the open questions in §14) before any implementation work. If we want to ship a thinner v0 first, the cleanest cut is **Phase 1 + 2 + 3 + 4 + 5 + 6** with no streaming and only the read-only tools — that's still useful (the assistant can summarize libraries and propose project setups in chat), and we layer in write-tools and confirmation cards in v1.1.
