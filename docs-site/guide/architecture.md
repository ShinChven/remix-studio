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
| Auth | Email/password, JWT sessions, admin roles, 2FA (TOTP), and passkeys (WebAuthn) |

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
   ┌──────────┼──────────┐
   ▼          ▼          ▼
  Text      Image    Audio / Video
   └──────────┼──────────┘
              ▼
        Campaign Posts
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
| Projects & Albums | Compose workflows; hold generated media | [Projects](/concepts/projects) |
| Workflow engine | Expand inputs into permutations or shuffle samples | [Workflows](/concepts/workflows) |
| Assistant | Plan and operate workflows in chat | [Assistant](/concepts/assistant) |
| Providers | AI backends with encrypted credentials | [Providers](/concepts/providers) |
| Queue | Recoverable, provider-grouped job execution | [Queue](/concepts/queue) |
| Exports & Delivery | ZIP archives and external delivery | [Exports](/concepts/exports) |
| Storage | S3-compatible buckets and usage tracking | [Storage](/concepts/storage) |
| Campaigns | Social posts, scheduling, and channels | [Campaigns](/concepts/campaigns) |
| Selling | Publish export packages to Gumroad | [Selling Exports](/concepts/selling-exports) |
| MCP | Account-scoped automation over HTTP | [MCP](/integrations/mcp) |

## Repository Structure

```text
remix-studio/
├── agent/       # System overview notes for AI agents and developers
├── chrome-extension/  # Browser importer extension
├── docker/      # Compose templates, env examples, backup/restore scripts
├── docs/        # Operational guides (also published here)
├── prisma/      # Prisma schema and migrations
├── public/      # Static assets
├── server/      # API, auth, storage, queue, generators, MCP, assistant
├── src/         # React application
├── server.ts    # Local server entry point
└── docker-compose.yml
```
