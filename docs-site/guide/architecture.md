# Architecture

Remix Studio is a single product made of several cooperating subsystems. This page is a high-level map; each subsystem has its own page under [Concepts](/concepts/workflows).

## Stack at a Glance

| Layer | Technology |
| :--- | :--- |
| Assistant orchestration | In-app assistant runner + shared MCP tool registry |
| Frontend | React 19 + Vite + React Router |
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
   ┌──────────┴───────────┐
   ▼                      ▼
Built-in Assistant   External Agent / Third-Party AI
   │                      │  OAuth 2.0 + PKCE / PAT
   │                      ▼
   │                 MCP Protocol (/mcp)
   └──────────┬───────────┘
              ▼
        Shared Tool Layer
   ┌──────────┼──────────────────────────┐
   ▼          ▼            ▼              ▼
Libraries  Projects &   Albums /     Direct Inputs
           Workflow     Models /     (inline values)
           Settings     Storage
              │
              ▼
           Workflow ◄── reusable inputs from libraries
              │     ◄── pinned / manually entered inputs
              ▼
   Permutation / Shuffle Engine
              ▼
       Background Queue
              ▼
       Provider Execution
              │
   ┌──────────┼──────────┬──────────────┐
   ▼          ▼          ▼              ▼
  Text      Image  Audio / Video ComfyUI / Civitai
   └──────────┼──────────┴──────────────┘
              ▼
       Album (results)
              │
   ┌──────────┼──────────┬──────────────┐
   ▼          ▼          ▼              ▼
Exports   Campaign  TV / WebDAV  Live updates &
            Posts     / DLNA      notifications
              │
              ▼
      Scheduling Timeline
              ▼
        Social Channels
```

The same **shared tool layer** backs both the in-app assistant and the MCP server, so chat orchestration and external automation stay aligned.

## Subsystem Reference

| Subsystem | What it does | Page |
| :--- | :--- | :--- |
| Libraries | Reusable text/image/video/audio inputs | [Libraries](/concepts/libraries) |
| Projects & Albums | Compose workflows; hold generated media; run ComfyUI and Civitai projects | [Projects](/concepts/projects) |
| Workflow engine | Expand inputs into permutations or shuffle samples | [Workflows](/concepts/workflows) |
| Assistant | Plan and operate workflows in chat | [Assistant](/concepts/assistant) |
| Providers | AI backends with encrypted credentials | [Providers](/concepts/providers) |
| Queue | Recoverable, provider-grouped job execution; the ComfyUI runner and detached pollers | [Queue](/concepts/queue) |
| Exports & Delivery | ZIP archives and external delivery | [Exports](/concepts/exports) |
| Storage | S3-compatible buckets and usage tracking | [Storage](/concepts/storage) |
| Campaigns | Social posts, scheduling, and channels | [Campaigns](/concepts/campaigns) |
| Selling | Publish export packages to Gumroad | [Selling Exports](/concepts/selling-exports) |
| MCP | Account-scoped automation over HTTP | [MCP](/integrations/mcp) |
| Media sharing | Read-only album access for TVs, file managers and media apps | [TV, WebDAV & DLNA](/integrations/tv-and-devices) |
| Live updates | Pages refetch what another tab, the assistant or an MCP client changed | [Live Updates](/concepts/projects#live-updates) |

## Repository Structure

```text
remix-studio/
├── agent/       # Design notes for AI agents and developers
├── chrome-extension/  # Browser importer extension
├── docker/      # Compose templates, env examples, backup/restore scripts
├── docs/        # Operational guides (also published here)
├── docs-site/   # This documentation site (VitePress)
├── prisma/      # Prisma schema and migrations
├── public/      # Static assets
├── scripts/     # TV-mode build and LG webOS packaging
├── server/      # API, auth, storage, queue, generators, MCP, assistant, live feeds, media sharing
├── src/         # React application (src/tv holds TV mode)
├── webos/       # LG webOS app wrapper for TV mode
├── server.ts    # Server entry point
├── docker-compose.yml       # Local services, and the app behind the `app` profile
└── docker-compose.dlna.yml  # Host-network override for DLNA
```
