# Remix Studio

[![Self-Hosted](https://img.shields.io/badge/self--hosted-ready-111111?style=flat-square)](./README.md)
[![Multimodal](https://img.shields.io/badge/AI-multimodal-0f766e?style=flat-square)](./README.md)
[![MCP](https://img.shields.io/badge/MCP-supported-2563eb?style=flat-square)](./README.md#mcp-support)
[![React 19](https://img.shields.io/badge/React-19-149eca?style=flat-square)](./README.md#architecture-at-a-glance)
[![Hono](https://img.shields.io/badge/Hono-Node.js-e36002?style=flat-square)](./README.md#architecture-at-a-glance)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Prisma-336791?style=flat-square)](./README.md#architecture-at-a-glance)
[![S3 Compatible](https://img.shields.io/badge/Storage-S3%20compatible-16a34a?style=flat-square)](./README.md#deployment)
[![i18n](https://img.shields.io/badge/i18n-English%20%7C%20%E7%AE%80%E4%BD%93%E4%B8%AD%E6%96%87%20%7C%20%E7%B9%81%E9%AB%94%E4%B8%AD%E6%96%87%20%7C%20%E6%97%A5%E6%9C%AC%E8%AA%9E%20%7C%20%ED%95%9C%EA%B5%AD%EC%96%B4%20%7C%20Fran%C3%A7ais-7c3aed?style=flat-square)](./README.md#what-remix-studio-does)

Remix Studio is a self-hosted multimodal AI workspace for managing text, image, video, and audio generation workflows in one place. You can save prompt fragments and reference assets into reusable libraries, combine them into large sets of prompt variations, create drafts in bulk, and run those batches through a background queue instead of generating one by one. It also includes provider management, asset storage, export tools, and MCP access for prompt and library operations, so clients like Claude and Codex can help organize content around your workflows while generation itself continues to run through the app.

![Remix Studio screenshot](assets/screenshot.jpg)

## What Remix Studio Does

- Manage text, image, video, and audio generation projects in one workspace
- Save reusable prompt fragments and reference assets in libraries
- Combine workflow steps and library items into many prompt permutations automatically
- Create drafts in bulk, then run all or selected jobs instead of generating one by one
- Queue generation jobs for background processing with per-provider concurrency control
- Store AI provider credentials, model configurations, and custom model aliases
- Review outputs in-app and export finished assets as ZIP archives
- Deliver finished exports to external storage like Google Drive
- Store generated assets in S3-compatible storage such as AWS S3 or MinIO
- Support authenticated access with admin controls, 2FA, and passkeys
- Provide a localized UI with built-in i18n support for English, Simplified Chinese, Traditional Chinese, Japanese, Korean, and French
- Expose MCP tools for prompt and library operations

## Core Workflow

1. Save prompt fragments, styles, subjects, and reference assets into reusable libraries.
2. Build a project workflow by mixing direct inputs with one or more libraries.
3. Let Remix Studio expand those inputs into combinations, then create drafts in batches.
4. Run all or selected drafts through the queue with provider-level concurrency limits.
5. Review outputs, retry failures, and export finished results.
6. Optionally deliver exports to Google Drive.

## Supported Workflows

- **Text to text**: Standard LLM generation
- **Text to image**: Prompt-based image generation
- **Text to video**: Prompt-based video generation
- **Text to audio**: Scripted text-to-speech generation with Gemini TTS
- **Image to text**: Describe or analyze images (multimodal)
- **Image to image**: Stylize or transform images
- **Image to video**: Animate images into video
- **Video to video**: Transform or edit videos using reference video context
- **Audio to video**: Generate video using reference audio context (e.g. for lip-sync or music)

## Current Supported Models

These are the built-in model profiles currently included in the app.

| Provider | Text Models | Image Models | Video Models | Audio Models |
| :--- | :--- | :--- | :--- | :--- |
| **Google AI** | `Gemini 3 Flash`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite` | `nano banana 2` | `Veo 3.1`, `Veo 3.1 Lite` | `Gemini 3.1 Flash TTS Preview`, `Gemini 2.5 Flash Preview TTS`, `Gemini 2.5 Pro Preview TTS` |
| **Vertex AI** | `Gemini 3 Flash`, `Gemini 3.1 Pro`, `Gemini 3.1 Flash Lite` | `nano banana 2` | - | `Gemini 3.1 Flash TTS Preview`, `Gemini 2.5 Flash Preview TTS`, `Gemini 2.5 Pro Preview TTS` |
| **OpenAI** | `GPT-5.4`, `GPT-5.4 Mini`, `GPT-5.4 Nano` | `GPT Image 1.5`, `GPT Image 1 Mini` | `Sora 2`, `Sora 2 Pro` | - |
| **Grok** | `Grok 4.20`, `Grok 4.1 Fast` | `Grok Imagine`, `Grok Imagine Pro` | `Grok Imagine Video` | - |
| **Claude** | `Claude Opus 4.7`, `Claude Sonnet 4.6`, `Claude Haiku 4.5` | - | - | - |
| **RunningHub** | - | `nano banana 2` | `Seedance 2.0 Ref` | - |
| **BytePlus** | - | `Seedream 5.0 Lite`, `Seedream 4.5`, `Seedream 4.0`, `Seedream 3.0 T2I`, `Seededit 3.0 I2I` | `Seedance 1.5 Pro`, `Seedance 1.0 Pro`, `Seedance 1.0 Pro Fast` | - |
| **Kling AI** | - | `Kling Image O1`, `Kling V3 Omni`, `Kling V3 Standard`, `Kling V2.1 Standard`, `Kling V2 Standard`, `Kling V1.5 Standard`, `Kling V1 Standard` | `Kling Video O1`, `Kling V3 Omni Video` | - |
| **Black Forest Labs** | - | `Flux 2 Max`, `Flux 2 Pro (Preview)`, `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Klein 9B (Preview)`, `Flux 2 Klein 9B`, `Flux 2 Klein 4B` | - | - |
| **Replicate** | - | `Flux 2 Pro`, `Flux 2 Flex`, `Flux 2 Max` | `Seedance 2.0 Fast`, `Seedance 2.0` | - |

## MCP Support

Remix Studio exposes an MCP server at `/mcp` for authenticated, account-scoped access to prompt and library tooling. It currently supports operations around prompt libraries, prompts, storage usage, and album summaries.

Clients can connect with OAuth 2.0 or a personal access token. Manage both in `Account -> MCP`. OAuth metadata is available at `/.well-known/oauth-authorization-server` and `/.well-known/oauth-protected-resource`; related endpoints are `/register`, `/authorize`, and `/token`.

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

Replace `http://localhost:3000` with your deployed origin. All tools are user-scoped, use the `mcp:tools` OAuth scope, and currently include `list_libraries`, `create_library`, `create_prompt`, `search_library_items`, `get_storage_usage`, and `list_albums`.

## Architecture At a Glance

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

### 3. Build and start the full stack

```bash
docker compose --profile app --env-file .env.docker up -d --build
```

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

- See [design/system-overview.md](design/system-overview.md) for the stack, auth model, queue behavior, providers, libraries, exports, storage model, and repository structure
- See [docker/README.md](docker/README.md) for compose templates and deployment layouts
- See [UPGRADING.md](UPGRADING.md) for migration and compatibility notes

## Notes

- This repository is aimed at local, self-hosted, or cloud-hosted deployments under your own control
- The app auto-creates a default admin user if `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are provided and the user does not already exist
- Storage is implemented against S3-compatible APIs, so MinIO works well for development and AWS S3 works for deployment
- For host-based local development with `docker compose up -d postgres minio` and `npm run dev`, MinIO should be reached at `http://localhost:9000`
- For Docker deployment, use `docker compose --profile app --env-file .env.docker up -d --build` so the app receives container-network addresses instead of your host-based `.env` values

## Scripts

- `npm run dev`: start the development server
- `npm run build`: build frontend and server bundles
- `npm run start`: run the production server from the built output
- `npm run lint`: run TypeScript type checking

## License

MIT. See [LICENSE](LICENSE).

## Custom Development

If you want to adapt Remix Studio for a specific workflow or internal use case, you can contact the author for custom development work.

## Hire Me

Based in New Zealand. Available for full-stack product development and AI integration work, including internal tools, workflow automation, and custom AI features.
