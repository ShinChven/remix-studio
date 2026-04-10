# Remix Studio

Remix Studio is a self-hosted workspace for managing AI image generation projects.

It combines a React frontend with a Hono server, PostgreSQL via Prisma, and S3-compatible storage. The project is built around a practical workflow: store provider credentials, organize prompts and libraries, run generation jobs, review results, and export finished assets.

![Remix Studio screenshot](assets/screenshot.jpg)

## What It Does

- Manage image generation providers and their API credentials
- Organize projects, prompt libraries, and related assets
- Run image generation through multiple providers
- Queue pending generation jobs for background processing
- Control per-provider parallelism with configurable concurrency limits
- Store generated images in S3 or MinIO
- Export project outputs as ZIP archives
- Support authenticated access with admin controls, 2FA, and passkeys

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

Use Docker Compose for local development to run only PostgreSQL and MinIO.

This starts PostgreSQL on `5432` and MinIO on `9000` with the console on `9001` by default.

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

Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5. Run database migrations

```bash
npx prisma migrate dev
```

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
- Docker images are published to GHCR from `.github/workflows/docker.yml`

## MCP Support

Remix Studio exposes an MCP server at `/mcp` for authenticated, account-scoped access to a small set of tools. It currently covers prompt libraries, prompts, storage usage, and project album summaries, not the full app API.

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

## Notes

- This repository is aimed at local or self-hosted use. Production deployment is possible, but it still requires you to make your own decisions around secrets, storage, database operations, and infrastructure.
- The app auto-creates a default admin user if `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are provided and the user does not already exist.
- Storage is implemented against S3-compatible APIs, so MinIO works well for development.
- For host-based local development with `docker compose up -d postgres minio` and `npm run dev`, MinIO should be reached at `http://localhost:9000`.
- For Docker deployment, use `docker compose --profile app --env-file .env.docker up -d --build` so the app receives container-network addresses instead of your host-based `.env` values.

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
