# What Is Remix Studio

Remix Studio is a **self-hosted AI assistant workspace** for orchestration, batch content generation, and social campaign planning, with a built-in assistant powered by Gemini models. Instead of prompting one asset at a time, you build workflows from reusable libraries plus direct text, image, video, and audio inputs, then let the app expand those inputs into draft sets you can run as full combination sweeps or randomized samples.

It combines four layers in one product:

- An **in-app assistant** for planning and operating workflows.
- A **project system** for composing workflows from library-backed and direct inputs.
- A **campaign workspace** for scheduling and publishing social posts.
- A **background execution stack** for queueing, storing, exporting, and delivering results.

The same shared tool layer also powers [MCP access](/integrations/mcp), so clients like Claude and Codex can help create libraries, inspect albums and model availability, and assemble projects around the same workflow model used in the UI.

> Built with **Google AI Studio** and **Antigravity**.

![Remix Studio screenshot](/screenshot.jpg)

## What Remix Studio Is For

- Run text, image, video, and audio generation projects from one workspace.
- Store reusable prompt fragments and reusable media inputs in text, image, video, and audio libraries.
- Turn workflow inputs into large draft sets by enumerating combinations across library-backed and direct inputs.
- Switch to shuffle mode when you want exploratory sampling instead of exhaustive combinations.
- Create drafts in bulk, then queue only the runs you want to execute.
- Manage provider credentials, model profiles, custom aliases, and provider-level concurrency limits.
- Review generated outputs in-app, retry failures, and export finished results as ZIP archives.
- Plan social campaigns, generate post copy in batches, attach reusable media, and schedule posts across connected channels.
- Deliver completed export packages to external destinations such as Google Drive.
- Keep generated assets in S3-compatible storage such as AWS S3 or MinIO.
- Operate the system through the UI, the in-app assistant, or external MCP clients.
- Protect access with auth, admin controls, 2FA, passkeys, and user storage limits.
- Use the app in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French.

## The Core Workflow

1. Save prompt fragments, tags, and media inputs into reusable [libraries](/concepts/libraries).
2. Use the built-in [assistant](/concepts/assistant) or an external [MCP client](/integrations/mcp) to query the same shared tool layer.
3. Read libraries, album summaries, model availability, and storage status before changing project settings.
4. Build a [project](/concepts/projects) manually or let an assistant assemble and confirm a workflow for you.
5. Mix direct inputs with library-backed inputs across text, image, video, and audio slots.
6. Expand the workflow into draft permutations, or sample it with [shuffle mode](/concepts/workflows).
7. Queue all or selected drafts with provider-level [concurrency limits](/concepts/queue).
8. Review outputs, retry failures, [export archives](/concepts/exports), and optionally deliver them to Google Drive.
9. Turn generated copy and media into [campaign posts](/concepts/campaigns), schedule them on a timeline, and publish through connected social channels.

## Where to Go Next

- New here? Start with [Why It Feels Different](/guide/why-different).
- Want to run it? Jump to [Local Development](/guide/local-development) or [Docker Deployment](/guide/docker-deployment).
- Curious how it works? Read [Workflows & Combinations](/concepts/workflows).
