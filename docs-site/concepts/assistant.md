# The Assistant

Remix Studio ships with a built-in **assistant** that can plan and operate workflows in chat. It is the "assistant-first" half of the product: you describe what you want, and it inspects your workspace and prepares changes for you.

## What It Can Do

The assistant uses the same **shared tool layer** as the [MCP integration](/integrations/mcp), so it can:

- Inspect [libraries](/concepts/libraries), album summaries, [model availability](/concepts/models), and [storage](/concepts/storage) status.
- Create libraries and prompts, including batch creation.
- Assemble and update [workflow-backed projects](/concepts/projects).
- Prepare project mutations behind **explicit confirmation** — write and destructive actions are confirmation-gated.

## Confirmation Model

The assistant does not silently mutate your workspace. Write and destructive tool calls surface a confirmation step (an approved-tools flow), so you stay in control of what actually changes.

## Model Providers

The assistant is powered by Gemini models by default, and the assistant runner supports multiple backends — Google, Anthropic, OpenAI, Grok, and Alibaba Cloud — selectable in assistant settings.

## Chat History & Settings

- **Chat History** keeps your previous assistant conversations.
- **Assistant Settings** controls the model, behavior, and approved tools. Navigation preserves return paths so backing out lands you where you started.

## Assistant vs. MCP

| | In-App Assistant | [MCP Clients](/integrations/mcp) |
| :--- | :--- | :--- |
| Where it runs | Inside Remix Studio | External clients (Claude, Codex, …) |
| Tool layer | Shared registry | Shared registry |
| Auth | Your logged-in session | OAuth 2.0 / personal access token |
| Confirmation | Approved-tools flow | Confirmation-gated write/destructive tools |

Because both use the same registry, chat orchestration and external automation stay aligned.
