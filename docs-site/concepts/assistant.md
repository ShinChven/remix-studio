# Multi-Agent Assistant

Remix Studio 2.0 includes a persistent, multimodal **Multi-Agent Assistant** for planning, coordinating parallel specialist teams, and operating the workspace with interactive **MCP Apps**. It shares the same account-scoped tool registry as the [MCP server](/integrations/mcp), pairing in-app confirmation and team orchestration with conversation persistence.

## Requirements and Model Selection

The assistant does not use a hidden global model credential. Create a provider in Remix Studio, then choose an assistant-capable text model in the floating composer or **Assistant Settings**.

The assistant runtime currently supports provider records of these types:

- **Google AI**
- **OpenAI**
- **Claude (Anthropic)**
- **Alibaba Cloud**
- **Kimi (Moonshot AI)**
- **MiniMax**
- **APIMart**

Other provider families may generate project assets without being available as an assistant chat model. Saved provider credentials belong to the user, are decrypted only on the server, and respect URL-safety validation for endpoint overrides.

Your default assistant provider and model are saved on your account, while each conversation stores the provider/model pair it uses.

## Single-Agent Turns and Multi-Agent Swarms

Work directly with a single coordinator turn, or launch a **Multi-Agent Swarm** when a task benefits from parallel specialists:

- **Slash commands & Presets** — Type `/agents` (or `/swarm`) in the composer, or pick a built-in team preset such as **Prompt Batch Shards**, **Campaign Copy & QA**, or **Workspace Audit Team**.
- **Coordinator & Parallel Workers** — The coordinator assigns scoped briefs to named specialist workers that run concurrently and share intermediate findings on a conversation **blackboard**.
- **Scoped Worker Permissions** — Each worker runs with an explicit tool scope (`read` for read-only inspection, `propose` for drafting and proposing changes) so parallel agents stay safe and predictable.
- **Agent Side Panel & Interactive Architecture Graph** — Inspect active and completed swarm runs in the flat **Agent Side Panel**. An interactive **Multi-Agent Architecture Graph** visualizes the coordinator, workers, and live states; click any node to open its Dialog inspector with brief, scope, tool calls, and output.
- **Multi-Step Task Tracker** — For multi-phase requests, the assistant maintains a live step checklist (`update_steps`) showing pending, active, and completed milestones.

## Interactive MCP Apps in Chat

Tool results that carry an [MCP App](/integrations/mcp#interactive-views-mcp-apps) view render directly inline beneath the tool row inside a sandboxed iframe rather than dumping raw JSON:

| View | Triggered by | What it shows |
| :--- | :--- | :--- |
| **Media Grid** (`media-grid`) | `get_album_items`, `get_library_items`, `create_prompt`, `batch_create_prompts` | Thumbnail grid with tag filters, paging, text cards, and a full-size lightbox viewer |
| **Project Overview** (`project-preview`) | `get_project`, `create_project_with_workflow`, `update_project`, `draft_jobs`, `get_project_job_counts` | Project configuration, workflow steps, and draft/queue/album counts |
| **Generation Batch** (`generation-batch`) | `start_jobs`, `get_generation_batch` | Live progress and generated outputs for a batch of jobs started together |
| **Queue Monitor** (`queue-monitor`) | `get_queue_status` | Live queue totals, provider slot usage, and per-project/provider rows |
| **Post Preview** (`post-preview`) | `get_post` | Campaign post text, media, schedule, and per-account publishing status |

The view bridge synchronizes your Material 3 theme colors, light/dark mode, and locale automatically. When reopening older conversations, stored tool results are replayed with freshly signed presigned media URLs.

## Generation Batch Tracking & Auto-Resume

When the assistant starts generation jobs via `start_jobs`, Remix Studio creates a tracked **Job Batch** (`get_generation_batch`) and displays its live progress in the **Generation Batch** MCP App view.

A server-side **Batch Completion Watcher** monitors tracked batches and automatically resumes the assistant conversation when all jobs in the batch complete or fail—so the assistant can inspect results, tag album items, or prepare campaign posts without waiting on you to nudge it.

## Planning, Grounding, Questions, and Context

- **Web Search Grounding** — Toggle Web Search in the composer when using Google AI, OpenAI, or Anthropic providers to ground answers in live web results.
- **Anthropic Extended Thinking** — Reasoning traces from Anthropic thinking models appear as quiet, collapsible thought pills inline in the assistant turn.
- **Interactive Questions (`ask_user`)** — When requirements are ambiguous, the assistant can pause (`awaiting_input`) and open an interactive question panel inside the composer supporting single-choice, multi-choice, and free-text answers.
- **KV Prompt Caching** — Prompt caching is enabled across supported assistant providers to reduce latency and token cost on multi-turn and multi-agent runs.
- **Segmented Context Usage Dialog** — Click the context usage ring next to the model chip to inspect the model's context window, latest reply tokens, conversation totals, and a category-by-category breakdown (system prompt, tool definitions per tool, user messages, assistant replies, tool results, and images).

## Workspace Context

The assistant reads live account-scoped workspace data through tools rather than relying on a stale copy in the prompt:

- Libraries, paginated/searchable library items, or a single item by ID.
- Storage totals and category breakdowns.
- Project workflows, album summaries, album items with tags and filenames, or a single item with its full prompt/text.
- Per-project job counts, tracked generation batches, and cross-project queue status.
- Usable provider/model pairings.
- Social accounts, campaigns, posts, post text, and post media metadata.

Bind workspace context directly in the composer: type `@` to mention a library, project, campaign, or post, or paste a reference copied with **Copy ID for AI** (`library:<libraryId>/item:<itemId>`, `project:<projectId>/album-item:<itemId>`, or `campaign:<campaignId>/post:<postId>`). **Start chat with AI**, next to **Copy ID for AI**, opens a fresh conversation with that reference pre-filled.

The composer also accepts image attachments and paste (including Gboard image/GIF/sticker insertion on Android Chrome), plus browser audio recording transcribed via a configured Google AI provider.

## Skills

Assistant skills are reusable prompt templates stored in their own per-user table (`AssistantSkill`), completely separate from your regular text libraries. Manage them under **Assistant Settings → Skills**, then type a backtick (`` ` ``) in the composer to search and insert one.

Both the Multi-Agent Assistant and external MCP clients can also manage skills with `list_skills`, `create_skill`, `update_skill`, and `delete_skill` (write/destructive calls require confirmation). Skills never bypass server permissions or tool approval rules.

## Tools and What They Can Change

The assistant can:

- Create and describe libraries, and add/update/delete prompts or metadata.
- Create projects with complete workflows (regular and Civitai; ComfyUI projects are configured in the studio) and update existing projects.
- Tag album items and rename album files, one at a time or in bulk.
- Stage draft jobs from a project's workflow, start a tracked generation batch, and monitor or clear failed jobs.
- Export a project's album or a whole project bundle.
- Create and update campaigns and posts, attach owned media, and schedule posts.

Workspace changes made by the assistant or an MCP client appear automatically in open studio pages without reloading — see [Live Updates](/concepts/projects#live-updates).

File-upload tools (`create_upload`, `add_files_to_library`, `create_posts_from_files`) remain exclusive to external MCP clients, as the browser assistant works with existing library/album media and composer attachments.

Browse the full tool catalog and input schemas under **Assistant Settings → Tools**.

## Confirmation and Approval Modes

Tools are categorized as read, write, or destructive:

- **Read tools** execute directly without confirmation.
- **Write tools** pause and show a human-readable summary plus exact arguments.
- **Destructive tools** require explicit confirmation every time and cannot be auto-approved.

For eligible write tools, you can approve a single call or approve that tool for the rest of the current conversation. Approvals are scoped per conversation and editable in the tool-approvals dialog.

::: warning
Approving a write tool lets later calls to that tool in the same conversation run without prompting again. Review approved tools whenever a conversation changes purpose.
:::

## Turns Survive a Refresh

A turn runs on the server, independent of the browser tab that started it. Reload the page, lock your phone, or lose connectivity mid-run, and the conversation reattaches automatically—replaying missed events, updating the active progress line, and preserving any pending confirmation or `ask_user` prompt.

**Stop** (which replaces **Send** while running) halts the turn cleanly at the next safe point, cancelling in-flight model calls and unstarted tool calls and recording **Stopped at your request.** so you can message immediately.

## Resources

The right-hand sidebar (alongside the Agent Side Panel) lists what a conversation has **changed**—one compact row per created or modified library, project, campaign, or post with the latest tool beneath it. Each row links directly into the studio and can be inserted into the composer as an `@` mention.

## Conversation History

Messages, thought pills, tool calls, MCP App payloads, swarm runs, token counts, and pending confirmations persist separately from generation jobs. **Chat History** lets you search, reopen, archive, or delete past conversations (deleting a conversation does not revert workspace changes already executed).

## Assistant vs. MCP

| | Multi-Agent Assistant | External MCP client |
| :--- | :--- | :--- |
| Interface | Remix Studio `/assistant` workspace | Claude, Codex, or another MCP client |
| Authentication | Logged-in Remix Studio session | OAuth 2.0 + PKCE or personal access token |
| Orchestration | Single-agent turns & `/agents` multi-agent swarms | Driven by the external client |
| Interactive views | Inline sandboxed MCP Apps (`ui://`) | Inline MCP Apps in compliant hosts |
| Write confirmation | In-app confirmation; per-conversation approvals & worker scopes | Two-call preview and hash-confirmation protocol |
| Conversation storage | Stored by Remix Studio | Managed by the external client |

Both paths enforce user ownership in every handler.

## Related

- [MCP & MCP Apps](/integrations/mcp) — authentication, external confirmation protocol, and `ui://` views.
- [Libraries & Prompts](/concepts/libraries) — reusable data.
- [Campaigns](/concepts/campaigns) — campaign and post tools available to agents.
