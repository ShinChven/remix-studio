# What Is Remix Studio

Remix Studio 2.0 is a **self-hosted Material 3 Expressive AI workspace** for multi-agent orchestration, batch content generation, and social campaign planning. Work hands-on in the rebuilt Material 3 Studio, collaborate with the built-in **Multi-Agent Assistant** and inline **MCP Apps**, or connect external MCP clients using your own OpenAI, Claude, Google AI, Alibaba Cloud, Kimi, MiniMax, or APIMart providers.

Instead of prompting one asset at a time, you build workflows from reusable libraries plus direct text, image, video, and audio inputs, then expand those inputs into draft sets you can run as full combination sweeps or randomized samples.

It combines four layers in one product:

- A **Multi-Agent Assistant** with `/agents` swarms, inline **MCP Apps**, step tracking, web search, and batch auto-resume.
- A **project system** for composing workflows from library-backed and direct inputs.
- A **campaign workspace** for scheduling and publishing social posts.
- A **background execution stack** for queueing, tracked generation batches, storing, exporting, and delivering results.

The same shared tool layer and five `ui://` MCP App views also power external [MCP access](/integrations/mcp), so clients like Claude and Codex work against the exact same live workspace as the studio UI.

> Built with **Google AI Studio** and **Antigravity**.

<div class="light-only">

![Remix Studio 2.0 screenshot (light mode)](/Screenshot-light.jpg)

</div>
<div class="dark-only">

![Remix Studio 2.0 screenshot (dark mode)](/Screenshot-dark.jpg)

</div>

## What Remix Studio Is For

- Operate the completely rebuilt **Material 3 Expressive** interface with dynamic tonal palettes, customizable theme extraction, `Cmd/Ctrl+K` global search (with `@` settings jump), and virtualized queues.
- Orchestrate single-agent turns or `/agents` multi-agent swarms with parallel specialist workers, a shared blackboard, interactive architecture graph, and multi-step task tracker.
- View interactive **MCP Apps** (`media-grid`, `project-preview`, `generation-batch`, `queue-monitor`, `post-preview`) inline inside assistant conversations and compatible external MCP clients.
- Run text, image, video, and audio generation projects from one workspace.
- Batch your own ComfyUI workflows on an instance you host, or generate images and videos with any checkpoint and LoRA on Civitai.
- Store reusable prompt fragments and reusable media inputs in text, image, video, and audio libraries, plus dedicated reusable assistant skills.
- Turn workflow inputs into large draft sets by enumerating combinations across library-backed and direct inputs, or sample with shuffle mode.
- Create drafts in bulk, queue selected runs as tracked generation batches, and let the assistant auto-resume when a batch completes.
- Manage provider credentials, model profiles, custom aliases, and provider-level concurrency limits.
- Review generated outputs in-app, rescale album images, quick-watermark single images, retry failures, and export finished results as ZIP archives.
- Tag results by hand, inherit tags from the library items they came from, or let a vision model tag albums and libraries for you.
- Get browser notifications when a project's queue finishes, and see live changes made by agents or other tabs without reloading.
- Watch albums on a TV, or open them in a file manager over WebDAV or a TV's own media app over DLNA.
- Plan social campaigns, generate post copy in batches, attach reusable media, and schedule posts across X and Threads.
- Release completed export packages to connected drives (Google Drive, OneDrive) and storefronts.
- Keep generated assets in S3-compatible storage such as AWS S3 or MinIO, protected with auth, admin controls, TOTP 2FA, passkeys, and user storage quotas.
- Use the app in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French.

## The Core Workflow

1. Save prompt fragments, tags, and media inputs into reusable [libraries](/concepts/libraries), and save recurring prompt templates as [skills](/concepts/assistant#skills).
2. Use the [Multi-Agent Assistant](/concepts/assistant) or an external [MCP client](/integrations/mcp) to inspect the workspace through the shared tool layer and inline MCP Apps—paste an item's **Copy ID for AI** reference or click **Start chat with AI** to point an agent at the exact item you mean.
3. Let single-agent turns or `/agents` swarms read libraries, album summaries, model availability, and storage status before preparing project edits.
4. Build a [project](/concepts/projects) manually or ask the assistant to assemble and confirm a workflow for you.
5. Mix direct inputs with library-backed inputs across text, image, video, and audio slots.
6. Expand the workflow into draft permutations, or sample it with [shuffle mode](/concepts/workflows).
7. Queue all or selected drafts as a tracked batch with provider-level [concurrency limits](/concepts/queue).
8. Review outputs in the [album](/concepts/projects#album-texts-or-audios) (or inline in the `media-grid` and `generation-batch` MCP Apps), tag, rescale, retry failures, [export archives](/concepts/exports), and optionally release them to a connected drive or storefront.
9. Turn generated copy and media into [campaign posts](/concepts/campaigns), schedule them on a timeline, and publish through connected social channels.

## Where to Go Next

- New here? Start with [Why It Feels Different](/guide/why-different).
- Want to run it? Jump to [Local Development](/guide/local-development) or [Docker Deployment](/guide/docker-deployment).
- Curious how orchestration works? Read [Multi-Agent Assistant](/concepts/assistant) and [Workflows & Combinations](/concepts/workflows).
