# Remix Studio

[![Latest Release](https://img.shields.io/github/v/release/ShinChven/remix-studio?style=flat-square)](https://github.com/ShinChven/remix-studio/releases)
[![Docker Image](https://img.shields.io/badge/docker-ghcr.io-blue?logo=docker&style=flat-square)](https://github.com/ShinChven/remix-studio/pkgs/container/remix-studio)
[![Self-Hosted](https://img.shields.io/badge/self--hosted-ready-111111?style=flat-square)](./README.md)
[![Gemini Assistant](https://img.shields.io/badge/Gemini-powered%20assistant-0f766e?style=flat-square)](./README.md)
[![Batch Generation](https://img.shields.io/badge/Batch-permutation%20engine-15803d?style=flat-square)](./README.md)
[![Multimodal](https://img.shields.io/badge/AI-multimodal-0f766e?style=flat-square)](./README.md)
[![MCP](https://img.shields.io/badge/MCP-supported-2563eb?style=flat-square)](./README.md#mcp-support)
[![React 19](https://img.shields.io/badge/React-19-149eca?style=flat-square)](./README.md#architecture-at-a-glance)
[![Hono](https://img.shields.io/badge/Hono-Node.js-e36002?style=flat-square)](./README.md#architecture-at-a-glance)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-336791?style=flat-square)](./README.md#architecture-at-a-glance)
[![S3 Compatible](https://img.shields.io/badge/Storage-S3%20compatible-16a34a?style=flat-square)](./README.md#deployment)
[![i18n](https://img.shields.io/badge/i18n-English%20%7C%20%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87%20%7C%20%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87%20%7C%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%7C%20%ED%95%9C%EA%B5%AD%EC%96%B4%20%7C%20Fran%C3%A7ais-7c3aed?style=flat-square)](./README.md#what-remix-studio-is-for)

Remix Studio is a self-hosted AI assistant workspace for orchestration, batch content generation, and social campaign planning, with a built-in assistant powered by Gemini models. Instead of prompting one asset at a time, you build workflows from reusable libraries plus direct text, image, video, and audio inputs, then let the app expand those inputs into draft sets you can run as full combination sweeps or randomized samples.

It combines four layers in one product: an in-app assistant for planning and operating workflows, a project system for composing workflows from library-backed and direct inputs, a campaign workspace for scheduling and publishing social posts, and a background execution stack for queueing, storing, exporting, and delivering results. The same shared tool layer also powers MCP access, so clients like Claude and Codex can help create libraries, inspect albums and model availability, and assemble projects around the same workflow model used in the UI.

This project is built with **Google AI Studio** and **Antigravity**.

![Remix Studio screenshot](assets/screenshot.jpg)

## What Remix Studio Is For

- Run text, image, video, and audio generation projects from one workspace
- Store reusable prompt fragments and reusable media inputs in text, image, video, and audio libraries
- Turn workflow inputs into large draft sets by enumerating combinations across library-backed and direct inputs
- Switch to shuffle mode when you want exploratory sampling instead of exhaustive combinations
- Create drafts in bulk, then queue only the runs you want to execute
- Manage provider credentials, model profiles, custom aliases, and provider-level concurrency limits
- Review generated outputs in-app, retry failures, and export finished results as ZIP archives
- Plan social campaigns, generate post copy in batches, attach reusable media, and schedule posts across connected channels
- Deliver completed export packages to external destinations such as Google Drive
- Keep generated assets in S3-compatible storage such as AWS S3 or MinIO
- Operate the system through the UI, the in-app assistant, or external MCP clients
- Protect access with auth, admin controls, 2FA, passkeys, and user storage limits
- Use the app in English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French

## Why It Feels Different

- **Assistant-first orchestration**: the built-in assistant can inspect libraries, album summaries, model availability, and storage status, then prepare project mutations behind explicit confirmation.
- **Combination engine**: workflows are built from reusable inputs, then expanded into draft permutations instead of forcing you to handcraft each prompt variant.
- **Campaign workspace**: campaign timelines connect generated copy, reusable media, scheduling, post history, and social channel delivery in the same app.
- **Batch execution**: generation runs through a recoverable queue with provider-specific concurrency and detached polling for async providers.
- **Self-hosted control**: providers, storage, exports, auth, and automation all stay in your own deployment.

## Combination-Driven Workflow

If you have 3 subject prompts, 4 style prompts, and 2 reference-image sets, Remix Studio can turn that into 24 drafts from one workflow before you send anything to a provider. When `shuffle` is enabled, the same workflow can sample from those libraries instead of enumerating the full Cartesian product.

## Core Workflow

```mermaid
flowchart TD
    U((User))

    U --> A[Built-in Assistant]
    U --> X[External Agent / Third-Party AI]
    X -->|OAuth 2.0 + PKCE / PAT| M[MCP Protocol]

    subgraph ToolsLayer [Shared Tool Layer]
        A --> T{Shared Tools}
        M --> T

        T --> L[(Libraries)]
        T --> P[Projects And Workflow Settings]
        T --> R[Albums / Models / Storage]
        T --> D[Direct Inputs / Inline Values]
    end

    subgraph ProjectFlow [Project Execution]
        P --> W[Workflow]
        L -.->|Reusable inputs from libraries| W
        D -.->|Pinned or manually entered text / image / audio / video| W
    end

    subgraph Execution [Generation Pipeline]
        W --> C[Permutation / Shuffle Engine]
        C --> B[Background Queue]
        B --> E[Provider Execution]
    end

    subgraph Outputs [Outputs]
        E --> TXT[Text]
        E --> IMG[Image]
        E --> MED[Audio / Video]
    end

    subgraph Campaigns [Campaign Planning]
        TXT --> CPOST[Campaign Posts]
        IMG --> CPOST
        MED --> CPOST
        CPOST --> SCH[Scheduling Timeline]
        SCH --> SOC[Social Channels]
    end
```

1. Save prompt fragments, tags, and media inputs into reusable libraries.
2. Use the built-in assistant or an external MCP client to query the same shared tool layer.
3. Read libraries, album summaries, model availability, and storage status before changing project settings.
4. Build a project manually or let an assistant assemble and confirm a workflow for you.
5. Mix direct inputs with library-backed inputs across text, image, video, and audio slots.
6. Expand the workflow into draft permutations, or sample it with shuffle mode.
7. Queue all or selected drafts with provider-level concurrency limits.
8. Review outputs, retry failures, export archives, and optionally deliver them to Google Drive.
9. Turn generated copy and media into campaign posts, schedule them on a timeline, and publish through connected social channels.

## Supported Workflows

- **Text to text**: Standard LLM generation
- **Text to image**: Prompt-based image generation
- **Text to video**: Prompt-based video generation
- **Text to audio**: Scripted text-to-speech generation (TTS)
- **Text to music**: Prompt-based music generation (e.g. with Lyria models)
- **Image to text**: Describe or analyze images (multimodal)
- **Image to image**: Stylize or transform images using reference images
- **Image to video**: Animate images into video
- **Image to music**: Generate music using reference image context
- **Video to video**: Transform or edit videos using reference video context
- **Audio to video**: Generate video using reference audio context (e.g. for lip-sync or music)

## Built-In Model Profiles

These are the model profiles currently bundled with the app.

| Provider | Text Models | Image Models | Video Models | Audio Models |
| :--- | :--- | :--- | :--- | :--- |
| **Google AI** | `Gemini 3 Flash`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite`, `Gemma 4` | `nano banana 2` | `Veo 3.1`, `Veo 3.1 Lite` | `Gemini 3.1 Flash TTS`, `Gemini 2.5 Flash TTS`, `Gemini 2.5 Pro TTS`, `Lyria 3 Clip`, `Lyria 3 Pro` |
| **Vertex AI** | `Gemini 3 Flash`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite` | `nano banana 2` | - | `Gemini 3.1 Flash TTS`, `Gemini 2.5 Flash TTS`, `Gemini 2.5 Pro TTS`, `Lyria 3 Clip`, `Lyria 3 Pro` |
| **OpenAI** | `GPT-5.4`, `GPT-5.4 Mini`, `GPT-5.4 Nano` | `GPT Image 2`, `GPT Image 1.5`, `GPT Image 1 Mini` | `Sora 2`, `Sora 2 Pro` | - |
| **Grok** | `Grok 4.20`, `Grok 4.1 Fast` | `Grok Imagine`, `Grok Imagine Pro` | `Grok Imagine Video` | - |
| **Claude** | `Claude Opus 4.7`, `Claude Sonnet 4.6`, `Claude Haiku 4.5` | - | - | - |
| **Alibaba Cloud DashScope** | `Qwen3.6 Max`, `Qwen3.6 Plus`, `Qwen3.6 Flash`, `Qwen3.6 VL Max`, `Qwen3.6 VL Plus` | - | - | - |
| **RunningHub** | - | `nano banana 2`, `Qwen Image 2 Pro` | `Seedance 2.0 Global`, `Seedance 2.0 Global Multimodal Reference` | - |
| **BytePlus** | - | `Seedream 5.0 Lite`, `Seedream 4.5`, `Seedream 4.0`, `Seedream 3.0 T2I`, `Seededit 3.0 I2I` | `Seedance 1.5 Pro`, `Seedance 1.0 Pro`, `Seedance 1.0 Pro Fast` | - |
| **Kling AI** | - | `Kling Image O1`, `Kling V3 Omni`, `Kling V3 Standard`, `Kling V2.1 Standard`, `Kling V2 Standard`, `Kling V1.5 Standard`, `Kling V1 Standard` | `Kling Video O1`, `Kling V3 Omni Video` | - |
| **Black Forest Labs** | - | `Flux 2 Max`, `Flux 2 Pro (Preview)`, `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Klein 9B (Preview)`, `Flux 2 Klein 9B`, `Flux 2 Klein 4B` | - | - |
| **Replicate** | - | `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Max` | `Seedance 2.0 Fast`, `Seedance 2.0` | - |

## MCP Support

Remix Studio exposes an MCP server at `/mcp` for authenticated, account-scoped automation. External MCP clients can work with libraries, prompts, storage summaries, album summaries, model discovery, direct workflow inputs, and workflow-backed project creation and updates. The in-app assistant uses the same shared tool registry, so chat orchestration and MCP automation stay aligned.

Available MCP capabilities include:

- Create libraries and create text prompts, including batch prompt creation
- Search library items across libraries or browse a single library with pagination and tag filters
- Update a single text prompt's content, title, or tags with `update_prompt`
- Delete a single text prompt from a text library with `delete_prompt`
- Inspect storage usage, albums, libraries, library items, and usable model/provider pairings
- Create and update workflow-backed projects

Write and destructive tools are confirmation-gated. Prompt deletion is scoped to one item in a text library and requires an explicit confirmed tool call.

Clients can connect with OAuth 2.0 authorization code flow, with PKCE supported, or with a personal access token. Manage both in `Account -> MCP`. OAuth metadata is available at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`; related endpoints are `/register`, `/authorize`, and `/token`.

Example:

```json
{
  "mcpServers": {
    "remix-studio": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": {
        "Authorization": "Bearer YOUR_MCP_TOKEN"
      }
    }
  }
}
```

Replace `http://localhost:3000` with your deployed origin. All tools are user-scoped and use the `mcp:tools` OAuth scope. See `server/mcp/tool-definitions.ts` for the full tool catalog.

## Architecture At a Glance

- Assistant orchestration: in-app assistant runner + shared MCP tool registry
- Frontend: React 19 + Vite
- Server: Hono on Node.js
- Database: PostgreSQL via Prisma
- Storage: S3-compatible object storage, including MinIO
- Media tooling: Sharp plus video processing dependencies
- Auth: email/password, JWT sessions, admin roles, 2FA, and passkeys

## Deployment

Remix Studio is designed for self-hosted and cloud-hosted deployments. It works with S3-compatible object storage, so you can deploy it against AWS S3, MinIO, or another compatible provider.

- For local development, Docker Compose can run PostgreSQL and MinIO
- For cloud or production-style deployments, point the app at your own PostgreSQL database and S3-compatible storage
- Docker images are published to GHCR from `.github/workflows/docker.yml`
- Release images use SemVer tags, while the moving `latest` tag points only at the newest release
- See [docker/README.md](docker/README.md) for compose templates and deployment layouts
- See [UPGRADING.md](UPGRADING.md) for migration and compatibility notes

## Local Development

### Requirements

- Node.js 20+
- Docker with Docker Compose, for running local PostgreSQL and MinIO
- At least one provider API key

### 1. Clone the repository

```bash
git clone https://github.com/ShinChven/remix-studio.git
cd remix-studio
```

### 2. Start local services

```bash
docker compose up -d postgres minio
```

This starts PostgreSQL on `5432` and MinIO on `9000` with the console on `9001`.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

`.env.example` is for host-based local development, where the app runs with `npm run dev` on your machine instead of inside Docker Compose.

If you run `npm run dev` on your host machine, point storage at the host-published MinIO port:

```env
S3_ENDPOINT=http://localhost:9000
```

Use `http://minio:9000` only when the app itself is running inside Docker Compose on the same Docker network.

For self-hosted or production-style deployments, point the same storage settings at your S3-compatible object storage instead. AWS S3 works, and MinIO also works as long as the endpoint and credentials are configured correctly.

You should set at least:

- `DATABASE_URL`
- `S3_ENDPOINT`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- `S3_EXPORT_BUCKET`
- `AWS_REGION`
- `PROVIDER_ENCRYPTION_KEY`
- `JWT_SECRET`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

`PROVIDER_ENCRYPTION_KEY` must be a 64-character hex string.

Do not change `PROVIDER_ENCRYPTION_KEY` after providers have been created unless you are also re-encrypting the stored provider credentials. Existing provider API keys in the database are encrypted with this value, so changing it later can make those saved credentials unreadable.

If you previously ran an older version of the app with a longer key value, the app may have been using only the first 64 hex characters. Keep that same effective 64-character value when upgrading, or existing provider credentials may fail to decrypt.

Optional:

- `S3_PUBLIC_ENDPOINT`, if stored objects need to be served through a different public base URL than the internal server-side endpoint

Generate an encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Run database migrations

For a brand new local development database, run:

```bash
npx prisma migrate dev
```

If the database already exists and you only want to apply committed migrations safely, run:

```bash
npx prisma migrate deploy
```

Use `migrate deploy` when pulling new changes into an existing environment. `migrate dev` is intended for development workflows that create or reconcile migrations and may prompt for a reset when the database history has drifted.

### 6. Start the app

```bash
npm run dev
```

The app runs at [http://localhost:3000](http://localhost:3000).

## Docker Deployment

Use a separate environment file for containerized deployments so your local `.env` can keep using host addresses like `localhost`.

### 1. Clone the repository

```bash
git clone https://github.com/ShinChven/remix-studio.git
cd remix-studio
```

### 2. Create the Docker deployment environment file

```bash
cp .env.docker.example .env.docker
```

For the bundled PostgreSQL + MinIO stack, keep these container-network addresses:

```env
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/remix_studio
S3_ENDPOINT=http://minio:9000
```

Before starting the stack, set real values for:

- `PROVIDER_ENCRYPTION_KEY`
- `JWT_SECRET`
- `DEFAULT_ADMIN_PASSWORD`
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, if you do not want the default MinIO credentials

`PROVIDER_ENCRYPTION_KEY` must be a 64-character hex string.

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 3. Start the full stack from the published GHCR image

```bash
docker compose -f docker/compose.minio.yml --env-file .env.docker up -d
```

The compose templates default to `ghcr.io/shinchven/remix-studio:latest`, which tracks the newest release image. For pinned release deployments, set `REMIX_STUDIO_IMAGE` in `.env.docker` to a version tag such as `ghcr.io/shinchven/remix-studio:1.5.0`.

This starts:

- `app` on `3000`
- `postgres` on `5432`
- `minio` API on `9000`
- `minio` console on `9001`

The application container runs `prisma migrate deploy` on startup before launching the server.

### 4. View logs

```bash
docker compose --profile app --env-file .env.docker logs -f app
```

### 5. Stop the stack

```bash
docker compose --profile app --env-file .env.docker down
```

If you prefer AWS S3 or another external S3-compatible service, point `S3_ENDPOINT`, `S3_PUBLIC_ENDPOINT`, bucket names, and credentials at that storage instead. Leave `S3_ENDPOINT` empty only when you want the AWS SDK to use its default AWS S3 endpoint behavior.

## At a Glance

- See [docs/X_PLATFORM_SETUP.md](docs/X_PLATFORM_SETUP.md) for X (Twitter) platform API configuration
- See [agent/system-overview.md](agent/system-overview.md) for the stack, auth model, queue behavior, providers, libraries, exports, storage model, and repository structure
- See [docker/README.md](docker/README.md) for compose templates and deployment layouts
- See [UPGRADING.md](UPGRADING.md) for migration and compatibility notes

## Notes

- This repository is aimed at local, self-hosted, or cloud-hosted deployments under your own control
- The app auto-creates a default admin user if `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are provided and the user does not already exist
- Storage is implemented against S3-compatible APIs, so MinIO works well for development and AWS S3 works for deployment
- For host-based local development with `docker compose up -d postgres minio` and `npm run dev`, MinIO should be reached at `http://localhost:9000`
- For Docker deployment, use a compose template under `docker/` so the app runs from the published GHCR image and receives container-network addresses instead of your host-based `.env` values

## Scripts

- `npm run dev`: start the development server
- `npm run build`: build frontend and server bundles
- `npm run start`: run the production server from the built output
- `npm run lint`: run TypeScript type checking

## Docker Image Release

```bash
npm version 1.0.0
git push origin main --tags
```

## Paid Support

If your team needs professional assistance with deployment, cloud infrastructure setup, or enterprise-grade scaling of Remix Studio, paid support and consultancy are available. 

Please contact the author for inquiries regarding:
- Private cloud/on-premise deployment
- Custom storage provider integration
- Performance optimization and scaling

## License

MIT. See [LICENSE](LICENSE).
