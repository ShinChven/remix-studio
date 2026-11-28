# Architecture

Remix Studio 2.0 is a single product made of cooperating subsystems. This page is a high-level map; each subsystem has its own page under [Concepts](/concepts/workflows).

## Stack at a Glance

| Layer | Technology |
| :--- | :--- |
| Multi-Agent Orchestration | Coordinator + parallel swarm workers (`SwarmOrchestrator`), shared blackboard, step tracker, `ask_user`, batch completion watcher, and shared MCP tool registry |
| Interactive MCP Views | Self-contained sandboxed HTML views (`src/mcp-apps` → `dist/mcp-apps`) rendered via `ui://` resources in-app and in MCP clients |
| Frontend | React 19 + Vite + React Router (rebuilt Material 3 Expressive UI at `/`) |
| Server | Hono on Node.js |
| Database | PostgreSQL via Prisma |
| Storage | S3-compatible object storage (AWS S3, MinIO, Cloudflare R2, GCS, Alibaba OSS) |
| Media tooling | Sharp plus video processing dependencies (ffmpeg/ffprobe) |
| Live updates | WebSockets (`ws`): a per-project job feed and a per-user change feed at `/api/live` |
| Notifications | Web Push with the server's own VAPID key pair (`web-push`) |
| Media sharing | TV mode (a standalone esbuild bundle for TV browsers), WebDAV at `/dav/`, and an optional DLNA/UPnP server |
| Auth | Email/password, Google sign-in, JWT sessions, admin roles, 2FA (TOTP), and passkeys (WebAuthn) |

## How the Pieces Fit Together

```
                  User
                    │
   ┌────────────────┴─────────────────┐
   ▼                                  ▼
Multi-Agent Assistant         External Agent / MCP Client
   │  (Swarms · Step Tracker          │  OAuth 2.0 + PKCE / PAT
   │   ask_user · Inline MCP Apps)    ▼
   │                            MCP Protocol (/mcp + ui:// Apps)
   └────────────────┬─────────────────┘
                    ▼
          Shared Tool Layer & MCP Apps
   ┌──────────┼──────────────────────────┐
   ▼          ▼            ▼              ▼
Libraries  Projects &   Albums /     Direct Inputs
& Skills   Workflow     Batches /    (inline values)
           Settings     Storage
              │
              ▼
           Workflow ◄── reusable inputs from libraries
              │     ◄── pinned / manually entered inputs
              ▼
   Permutation / Shuffle Engine
              ▼
       Background Queue & Job Batches
              ▼
       Provider Execution
              │
   ┌──────────┼──────────┬──────────────┐
   ▼          ▼          ▼              ▼
  Text      Image  Audio / Video ComfyUI / Civitai
   └──────────┼──────────┴──────────────┘
              ▼
       Album (results) ──► Batch Completion Auto-Resume
              │
   ┌──────────┼──────────┬──────────────┐
   ▼          ▼          ▼              ▼
Exports   Campaign  TV / WebDAV  Live updates &
            Posts     / DLNA      notifications
              │
              ▼
      Scheduling Timeline
              │
              ▼
        Social Channels
```

The same **shared tool layer** and **MCP Apps** views back both the built-in Multi-Agent Assistant and the `/mcp` server, so in-app orchestration and external automation stay aligned.

## Subsystem Reference

| Subsystem | What it does | Page |
| :--- | :--- | :--- |
| Libraries | Reusable text/image/video/audio inputs | [Libraries](/concepts/libraries) |
| Projects & Albums | Compose workflows; hold generated media; rescale images; run ComfyUI and Civitai projects | [Projects](/concepts/projects) |
| Workflow engine | Expand inputs into permutations or shuffle samples | [Workflows](/concepts/workflows) |
| Multi-Agent Assistant | Single-agent turns, `/agents` swarms, step tracking, and inline MCP Apps | [Multi-Agent Assistant](/concepts/assistant) |
| Providers | AI backends with encrypted credentials | [Providers](/concepts/providers) |
| Queue | Recoverable, provider-grouped job execution; tracked batches; ComfyUI runner and detached pollers | [Queue](/concepts/queue) |
| Exports & Delivery | ZIP archives and external delivery | [Exports](/concepts/exports) |
| Storage | S3-compatible buckets and usage tracking | [Storage](/concepts/storage) |
| Campaigns | Social posts, scheduling, and channels | [Campaigns](/concepts/campaigns) |
| Selling | Publish export packages to Gumroad | [Selling Exports](/concepts/selling-exports) |
| MCP & MCP Apps | Account-scoped automation and `ui://` views over HTTP | [MCP & MCP Apps](/integrations/mcp) |
| Media sharing | Read-only album access for TVs, file managers and media apps | [TV, WebDAV & DLNA](/integrations/tv-and-devices) |
| Live updates | Pages refetch what another tab, the assistant or an MCP client changed | [Live Updates](/concepts/projects#live-updates) |

## Repository Structure

```text
remix-studio/
├── agent/             # Design notes for AI agents and developers
├── chrome-extension/  # Browser importer extension
├── docker/            # Compose templates, env examples, backup/restore scripts
├── docs/              # Operational guides (also published here)
├── docs-site/         # This documentation site (VitePress)
├── prisma/            # Prisma schema and migrations
├── public/            # Static assets
├── scripts/           # MCP Apps build, TV-mode build, LG webOS packaging, checks
├── server/            # API, auth, storage, queue, generators, MCP + MCP Apps, multi-agent assistant, live feeds
├── src/
│   ├── m3/            # Material 3 Expressive component kit & dynamic color system
│   ├── v2/            # Rebuilt Material 3 Expressive studio application served at /
│   ├── mcp-apps/      # Sandboxed interactive MCP App views (ui://remix-studio/*)
│   └── tv/            # Standalone TV mode interface
├── webos/             # LG webOS app wrapper for TV mode
├── server.ts          # Server entry point
├── docker-compose.yml       # Local services, and the app behind the `app` profile
└── docker-compose.dlna.yml  # Host-network override for DLNA
```
