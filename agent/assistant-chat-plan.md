# Built-in Assistant Chat — Implementation Plan

Status: **Draft, rewritten for standalone assistant runtime.**
Date: 2026-04-19.
Owner: TBD.

---

## 1. Goal

Add an in-app **Assistant** that behaves like a real chatbot for the signed-in user:

- direct conversational turns
- local conversation history
- direct provider calls per turn
- access to Remix Studio's existing MCP-backed capabilities for libraries, projects, storage, and future workflow actions

The assistant is **not** part of the generation queue. It is a separate runtime optimized for synchronous chat and tool use.

Three hard requirements:

1. **Standalone chat runtime.** Do not route assistant turns through the existing project/job generation queue.
2. **Reuse shared platform pieces.** Reuse provider credentials and reuse MCP tool handlers. Do not duplicate tool logic.
3. **Loop-safe.** The assistant must enforce strict iteration, timeout, repetition, and confirmation controls.

---

## 2. Core Decision

This assistant should be built as a new subsystem under `server/assistant/`.

It should:

- reuse provider records and decrypted API keys from the existing provider repository
- call provider SDKs or provider HTTP APIs directly for each chat turn
- invoke local MCP tool handlers in-process
- persist assistant conversations separately from project jobs

It should **not**:

- use the existing generation queue
- reuse the one-shot `TextGenerator` interface as the main assistant abstraction
- call our own `/mcp` HTTP endpoint from inside the app
- depend on LangChain for v1

---

## 3. Why This Shape

- The existing queue is designed for asynchronous project generation and polling. Chat is a synchronous turn loop with message history and tool feedback.
- The existing `TextGenerator` abstraction is one-shot prompt-in/text-out. The assistant needs multi-message context, tool calls, tool results, and stop reasons.
- MCP is already the right action layer for libraries and workflow organization. The missing piece is a shared in-process tool registry.
- Reusing provider credentials keeps one source of truth for secrets and provider configuration.

---

## 4. Scope

### In scope for v1

- `/assistant` page in the app shell
- create/select assistant conversation
- send user message and receive assistant reply
- choose one configured text-capable provider/model per conversation
- tool use via shared MCP handlers
- confirmation flow for sensitive or high-impact tools
- server-side circuit breaker rules
- basic conversation persistence

### Out of scope for v1

- token streaming UI
- multimodal input
- voice
- cross-conversation search
- collaboration/sharing
- advanced agent planning modes
- exposing cost analytics in the UI

---

## 5. Architecture Overview

```text
Browser
  /assistant
    -> POST /api/assistant/conversations/:id/messages

server/assistant/
  routes.ts
  assistant-runner.ts
  chat-provider-factory.ts
  providers/
    openai.ts
    anthropic.ts
    google.ts
    grok.ts
    types.ts
  conversation-repository.ts
  policy.ts
  circuit-config.ts
  confirmation.ts

server/mcp/
  tool-definitions.ts      <- new shared tool registry
  mcp-server.ts            <- thin transport adapter

server/db/
  provider-repository.ts   <- reused for credentials
  repository.ts            <- reused by MCP tool handlers
```

Assistant turn lifecycle:

1. Load conversation and message history.
2. Resolve selected provider and model.
3. Load provider credentials from existing storage.
4. Call provider directly through assistant-specific chat adapter.
5. If tool calls are requested, invoke shared MCP handlers in-process.
6. Feed tool results back into the model.
7. Persist final assistant output and tool events.

---

## 6. Separation From Existing Generation System

This is the main architectural rule:

- `server/generators/` remains for project generation and queued jobs.
- `server/assistant/` is the standalone chatbot runtime.

We may still share small utilities, such as:

- provider credential lookup
- provider URL safety checks
- model catalog lookup

But the assistant should not share:

- queue scheduling
- detached polling
- job state transitions
- project generation abstractions

Rationale: forcing chat through the queue would make chat slower, harder to reason about, and harder to control.

---

## 7. Shared MCP Tool Registry

### Current problem

Today tool handlers are defined inline inside `server/mcp/mcp-server.ts`. That couples business logic to the MCP transport layer.

### Refactor

Create `server/mcp/tool-definitions.ts` as the single source of truth for tools.

Proposed shape:

```ts
export interface AssistantToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  annotations: {
    readOnlyHint: boolean;
    destructiveHint: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
  category: 'read' | 'mutate' | 'destructive';
  requiresConfirmation?: boolean;
  handler: (userId: string, input: unknown) => Promise<{
    text: string;
    isError?: boolean;
  }>;
}
```

Then:

- `mcp-server.ts` registers these definitions with the MCP SDK
- `assistant-runner.ts` invokes the same handlers directly

This avoids:

- duplicated tool code
- internal HTTP round-trips
- synthetic auth flows inside the app

### v1 tool surface

Default tools:

- `list_libraries`
- `list_all_libraries`
- `get_library_items`
- `search_library_items`
- `list_albums`
- `get_storage_usage`
- `list_available_models`
- `create_library`
- `create_prompt`
- `batch_create_prompts`

Confirmation-gated tool:

- `create_project_with_workflow`

Later we can expose more tools once policy tags and confirmation rules are stable.

---

## 8. Assistant-Specific Provider Layer

The assistant needs a separate chat abstraction.

Do not extend the existing one-shot `TextGenerator` interface into a chat protocol. It is used for a different workload and would become awkward fast.

Create:

```ts
export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; toolCallId: string; name: string; content: string };

export interface ToolCall {
  id: string;
  name: string;
  arguments: unknown;
}

export interface ChatRequest {
  modelId: string;
  messages: ChatMessage[];
  tools: AssistantToolDefinition[];
  temperature?: number;
  maxTokens?: number;
  abortSignal?: AbortSignal;
}

export interface ChatResponse {
  text: string;
  toolCalls: ToolCall[];
  stopReason: 'end_turn' | 'tool_use' | 'max_tokens' | 'error';
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
  };
}

export interface ChatProvider {
  chat(req: ChatRequest): Promise<ChatResponse>;
}
```

Provider adapter files:

- `server/assistant/providers/openai.ts`
- `server/assistant/providers/anthropic.ts`
- `server/assistant/providers/google.ts`
- `server/assistant/providers/grok.ts`

Shared behavior:

- resolve provider config from existing provider repository
- reuse decrypted API key lookup
- reuse safe API URL validation
- map internal tool definitions into each provider's tool-call schema
- normalize provider responses into `ChatResponse`

### Provider selection

Each conversation stores:

- `providerId`
- `modelConfigId`

The selected provider/model must be text-capable. This is validated on conversation creation and update.

---

## 9. Assistant Runner

`assistant-runner.ts` is the only component allowed to loop between model and tools.

Pseudo-flow:

```ts
while (true) {
  enforceCircuitRules();

  const response = await provider.chat({
    modelId,
    messages,
    tools,
    abortSignal,
  });

  persistAssistantResponse(response);

  if (!response.toolCalls.length) {
    return finalResponse;
  }

  for (const call of response.toolCalls) {
    enforcePolicy(call);

    if (requiresConfirmation(call) && !confirmationSatisfied(call)) {
      persistPendingConfirmation(call);
      return confirmationRequest;
    }

    const result = await invokeTool(call);
    persistToolResult(call, result);
    messages.push(toToolMessage(call, result));
  }
}
```

Responsibilities:

- load and normalize conversation history
- call the selected provider
- enforce tool policy
- invoke tools
- persist messages and tool events
- stop on final assistant output or circuit open

---

## 10. Circuit Breaker Rules

All limits are enforced server-side.

Initial defaults:

```text
MAX_ITERATIONS       = 8
MAX_TOOL_CALLS       = 16
MAX_PARALLEL_TOOLS   = 4
MAX_WALL_CLOCK_MS    = 60000
PROVIDER_TIMEOUT_MS  = 30000
TOOL_TIMEOUT_MS      = 15000
RECENT_CALL_WINDOW   = 6
PER_USER_CONCURRENT  = 2
```

Required protections:

- iteration limit per user turn
- total tool-call budget per turn
- parallel tool-call cap per model response
- wall-clock timeout for the whole turn
- timeout for a single provider call
- timeout for a single tool call
- per-user concurrent turn cap
- repetition detection for identical tool calls

Repetition detection rule:

- hash `(tool name + normalized args)`
- if the same hash appears repeatedly inside the recent window, stop the run

Failure behavior:

- persist the partial trace
- return a safe assistant-visible error such as "I stopped because this request hit a safety limit"

---

## 11. Confirmation Policy

Some tools must not execute on model intent alone.

v1 requires explicit user confirmation for:

- `create_project_with_workflow`

Flow:

1. Model proposes the tool call.
2. Runner does not execute it yet.
3. Server stores a pending confirmation payload.
4. UI shows `Confirm`, `Edit`, or `Cancel`.
5. Only a confirmed resubmission can execute that exact tool payload.

The confirmation token must be bound to:

- conversation id
- tool name
- normalized args
- expiration timestamp

This prevents the model from smuggling in a different action after the user confirms.

---

## 12. Persistence Model

Add assistant-specific persistence. Do not overload job tables.

Proposed entities:

- `AssistantConversation`
- `AssistantMessage`
- `AssistantToolEvent` or an equivalent structured message subtype

Minimum conversation fields:

- `id`
- `userId`
- `title`
- `providerId`
- `modelConfigId`
- `createdAt`
- `updatedAt`
- `archivedAt?`

Minimum message fields:

- `id`
- `conversationId`
- `role`
- `content`
- `toolName?`
- `toolCallId?`
- `toolArgsJson?`
- `toolResultJson?`
- `status?`
- `createdAt`

This preserves a useful execution trace without mixing it with queued generation records.

---

## 13. API Surface

New authenticated routes under `/api/assistant`:

- `GET /api/assistant/conversations`
- `POST /api/assistant/conversations`
- `GET /api/assistant/conversations/:id`
- `POST /api/assistant/conversations/:id/messages`
- `POST /api/assistant/conversations/:id/confirm`
- `PATCH /api/assistant/conversations/:id`

All routes use normal in-app session auth, not MCP auth and not OAuth bearer flows.

---

## 14. UI Shape

Add an **Assistant** item to the left navigation and a new `/assistant` page.

Layout:

- left: existing app sidebar
- center: chat transcript and composer
- right: conversation history panel

Behavior:

- right panel width matches the left sidebar width target
- both side panels collapse cleanly on smaller viewports
- confirmation requests render as explicit action cards inside the conversation
- conversation creation includes provider/model selection

v1 can return one complete assistant message after tools settle. Streaming can be added later.

---

## 15. Implementation Order

1. Extract shared MCP tool definitions from `server/mcp/mcp-server.ts`.
2. Add assistant database schema and repository.
3. Add assistant provider types and provider adapters.
4. Build assistant runner with circuit breaker and confirmation logic.
5. Add assistant API routes.
6. Add `/assistant` UI and conversation management.
7. Add logging and basic operational metrics.

---

## 16. Risks

- Provider tool-calling APIs differ materially. The normalization layer must stay narrow and explicit.
- If tool handlers return only loose text, model behavior may be less reliable than with structured results.
- Without strict circuit rules, tool recursion and quota burn are easy failure modes.
- Mixing assistant state with project/job state would create long-term maintenance drag. Keep them separate.

---

## 17. Recommendation

Build the assistant as a **standalone chatbot runtime** with:

- direct provider calls
- shared provider credentials
- shared MCP tool handlers
- assistant-specific persistence
- assistant-specific policy and circuit control

Do not build v1 on top of the generation queue.
Do not make LangChain a required dependency for v1.
