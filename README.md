# Remix Studio — AI-Native Content Operations for Humans and Agents

[![Latest Release](https://img.shields.io/github/v/release/ShinChven/remix-studio?style=flat-square)](https://github.com/ShinChven/remix-studio/releases)
[![Documentation](https://img.shields.io/badge/docs-online-0f766e?style=flat-square)](https://shinchven.github.io/remix-studio/)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker&style=flat-square)](https://github.com/ShinChven/remix-studio/pkgs/container/remix-studio)
[![MCP](https://img.shields.io/badge/MCP-agent%20ready-2563eb?style=flat-square)](https://shinchven.github.io/remix-studio/integrations/mcp)
[![License: MIT](https://img.shields.io/badge/license-MIT-7c3aed?style=flat-square)](LICENSE)

Remix Studio gives creators, teams, and AI agents a shared, self-hosted environment for multimodal generation and social campaigns. Operate the same live workspace through the project studio, the built-in tool-using assistant, or external MCP clients such as Claude and Codex.

One account-scoped tool layer powers both AI control surfaces. The assistant and connected agents can work directly with libraries, projects, workflows, albums, models, storage, campaigns, and posts.

![Remix Studio AI workspace for agent-controlled content generation and campaign operations](assets/screenshot.jpg)

## One Workspace, Three Control Surfaces

| Control surface | Role |
| --- | --- |
| **Project Studio** | Precise hands-on control over libraries, workflows, drafts, queues, results, exports, and campaigns |
| **Built-in Assistant** | Persistent, multimodal chat that can inspect the workspace and take confirmed actions using your chosen AI provider and model |
| **MCP Server** | The same core tools exposed to external agents over streamable HTTP, authenticated with OAuth 2.0 + PKCE or personal access tokens |

The assistant can bind projects and libraries as context, work with images and voice input, use reusable prompt skills, and preserve conversations. Both agent paths can discover current data instead of reasoning over a stale prompt: they can curate libraries, inspect albums and files, find usable models, assemble project workflows, and prepare campaigns and scheduled posts.

```mermaid
flowchart LR
    H["Human"] --> UI["Project Studio"]
    H --> A["Built-in Assistant"]
    G["Claude · Codex · Other Agents"] --> M["MCP"]
    A --> T["Shared account-scoped tools"]
    M --> T
    UI --> W["Live Workspace"]
    T --> W
    W --> E["Combination / Shuffle Engine"]
    E --> Q["Recoverable Provider Queues"]
    Q --> O["Text · Image · Video · Audio · ComfyUI · Civitai"]
    O --> D["Albums · Exports · Campaigns · Releases"]
```

## From Intent to Distribution

- **Build reusable knowledge** — Organize prompts, images, video, and audio in typed libraries with titles, tags, search, import/export, browser capture, and mobile sharing.
- **Direct the system in natural language** — Ask the assistant or an MCP agent to inspect what already exists, create or refine libraries, assemble multimodal projects, and prepare campaign posts.
- **Compose at scale** — Mix fixed inputs with library-backed choices. Run the Cartesian product for exhaustive coverage or use shuffle mode for bounded exploration: 3 subjects × 4 styles × 2 references becomes 24 reviewable drafts.
- **Review before execution** — Remix Studio separates composition from provider calls. Inspect resolved prompts, media contexts, model settings, and workflow snapshots, then queue only the drafts worth running.
- **Run resiliently across providers** — Model profiles drive valid controls for text, image, video, audio, and music workflows. Database-backed jobs, per-provider concurrency, detached polling, restart recovery, retries, and live project updates keep batches moving, and a browser notification says when a project's queue is done.
- **Bring your own pipeline** — Batch an API-format ComfyUI workflow on a GPU you host, or generate images and videos with any checkpoint and LoRA on Civitai; every input combines and shuffles like a regular workflow step.
- **Organise results** — Results inherit the tags of the library items they came from, a vision model can tag albums and libraries for you, and **Copy ID for AI** hands the assistant or an agent the exact item you mean.
- **Turn output into operations** — Keep results in durable albums, reuse prior configurations, edit and export assets, add watermarks, release archives to connected drives such as Google Drive and OneDrive, publish products to storefronts, or schedule campaigns for X and Threads.
- **Move whole projects around** — Package a project's settings, workflow, album, and media into a single ZIP, then import it back as a new project on any deployment.
- **Watch it anywhere** — Browse albums on the living-room TV, in a file manager over WebDAV, or in a TV's own media app over DLNA, read-only and per device.

## Human Control Where It Matters

Agent access stays powerful without becoming opaque. Read tools execute directly; writes pause for a human-readable review. The in-app assistant supports per-conversation tool approvals, while external MCP writes use a two-step preview and confirmation hash bound to the exact arguments. Destructive actions remain explicitly gated.

Every tool enforces user ownership. Provider credentials and connected-service tokens are encrypted at rest, stored files are shared through temporary owned URLs, and the multi-user application includes roles, invite-based registration, storage limits, TOTP 2FA, and passkeys.

## Self-Hosted by Design

Run Remix Studio with PostgreSQL, S3-compatible object storage, and Docker. Bring your own model providers, credentials, storage, social applications, and deployment secrets. Install the web app as a PWA and use it in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, or French.

## Documentation

Find detailed setup, configuration, and operations guidance on the [documentation site](https://shinchven.github.io/remix-studio/).

- [Architecture](https://shinchven.github.io/remix-studio/guide/architecture) and [why Remix Studio is different](https://shinchven.github.io/remix-studio/guide/why-different)
- [Built-in assistant](https://shinchven.github.io/remix-studio/concepts/assistant) and [MCP integration](https://shinchven.github.io/remix-studio/integrations/mcp)
- [Workflows and combinations](https://shinchven.github.io/remix-studio/concepts/workflows) and [supported AI workflows](https://shinchven.github.io/remix-studio/concepts/supported-workflows)
- [Providers and models](https://shinchven.github.io/remix-studio/concepts/providers), [campaigns](https://shinchven.github.io/remix-studio/concepts/campaigns), and [exports](https://shinchven.github.io/remix-studio/concepts/exports)
- [Projects and albums](https://shinchven.github.io/remix-studio/concepts/projects), including ComfyUI and Civitai projects, auto-tagging and notifications
- [TV, WebDAV & DLNA](https://shinchven.github.io/remix-studio/integrations/tv-and-devices)
- [Local development](https://shinchven.github.io/remix-studio/guide/local-development) or [Docker deployment](https://shinchven.github.io/remix-studio/guide/docker-deployment)
- [What's new](https://shinchven.github.io/remix-studio/whats-new) in each release

## Community and License

Report bugs and request features through [GitHub Issues](https://github.com/ShinChven/remix-studio/issues). Released under the [MIT License](LICENSE).
