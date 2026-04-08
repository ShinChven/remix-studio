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
- Support authenticated access and basic admin/user separation

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

For local development, point these values at the MinIO container started by Docker Compose.

For self-hosted or production-style deployments, point the same storage settings at your S3-compatible object storage instead. AWS S3 works, and MinIO also works as long as the endpoint and credentials are configured correctly.

You should set at least:

- `DATABASE_URL`
- `MINIO_ENDPOINT`
- `MINIO_ACCESS_KEY`
- `MINIO_SECRET_KEY`
- `MINIO_BUCKET`
- `MINIO_EXPORT_BUCKET`
- `PROVIDER_ENCRYPTION_KEY`
- `JWT_SECRET`
- `DEFAULT_ADMIN_EMAIL`
- `DEFAULT_ADMIN_PASSWORD`

`PROVIDER_ENCRYPTION_KEY` must be a 64-character hex string.

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

## Current Stack

- Frontend: React 19, Vite, React Router
- Server: Hono on Node.js
- Database: PostgreSQL with Prisma
- Object storage: S3-compatible storage, including MinIO
- Image processing: Sharp

## Queue and Concurrency

Remix Studio includes a server-side generation queue for image jobs.

- Running a project enqueues only jobs marked as `pending`
- The queue is global in-process and groups work by provider
- Each provider has its own configurable concurrency limit, so you can control how many jobs run in parallel for that provider
- Jobs are snapshotted into `processing` state before dispatch so the worker and poller operate on resolved metadata
- Providers that return a remote task ID are handed off to a detached poller, which checks status every 30 seconds until completion or failure
- On server startup, pending jobs are re-enqueued and interrupted processing jobs are recovered so work can continue after restarts
- A storage limit check runs before enqueuing pending jobs for a project

## Providers

Providers are the AI image backends that Remix Studio uses to run generation jobs.

- Each provider stores a name, type, encrypted API key, optional API URL override, and optional model configuration
- Providers can represent different services or endpoints, such as OpenAI-compatible, Google, Vertex AI, or other supported generators in the server
- A project can use a default provider, while individual jobs can override that provider when needed
- Each provider has its own concurrency setting, which controls how many jobs can run in parallel for that provider
- Model configuration is attached to the provider, so jobs can choose a saved model profile instead of repeating raw model settings
- Provider credentials are managed inside the app rather than hardcoded into project files

In practice, providers let you separate job routing from project content: prompts and assets stay in the project, while API credentials, endpoint details, and parallelism settings stay with the provider.

## Libraries

Libraries are reusable collections that keep common prompt fragments and image references out of individual projects.

- Remix Studio supports both text libraries and image libraries
- Text libraries are useful for reusable prompt fragments, style blocks, subject ideas, and prompt building templates
- Image libraries are useful for reference images, moodboards, style references, and reusable visual inputs
- Each library contains ordered items, and items can include titles and tags for easier filtering and reuse
- Libraries can be edited independently from projects, so you can improve shared prompt/image collections once and reuse them across multiple workflows
- Text libraries support import and export as Markdown-style lists for bulk editing outside the app

### Library Usage In Project View

The project view treats libraries as workflow building blocks.

- You can add a library directly into a project workflow with the `Lib` action in the workflow editor
- Library items participate in workflow combination generation, so reusable library content can expand into multiple draft jobs
- Library workflow items can be previewed in-place before generating jobs
- Library previews support tag filtering, which lets you narrow a large library down to a smaller subset for a specific project
- When selecting content for a workflow item, the project view can open a library picker and insert a chosen text or image item into that workflow step
- Image libraries can be used as reusable reference sources for image workflow items
- The workflow keeps library references separate from project-specific prompt text, which makes larger generation setups easier to maintain

In practice, libraries give you a reusable layer between raw assets and finished projects: projects define the current workflow, while libraries hold the repeatable building blocks.

## Exports

Remix Studio can package generated album images into downloadable ZIP archives.

- Exports are created from project album items, so finished outputs can be bundled and downloaded outside the app
- Export tasks run in the background and move through `pending`, `processing`, `completed`, or `failed` states
- Completed archives are stored in a separate export bucket, while the app stores the raw `s3Key` and generates a fresh presigned download URL when the archive is viewed
- The Archive page shows export status across projects and lets users download completed ZIPs or delete export records
- Export creation performs a runtime storage quota check before uploading the ZIP archive
- Failed exports are retained for a shorter period, while completed exports are retained longer so users have time to download them

In practice, exports give you a clean handoff step after generation: produce images in the project, collect the keepers in the album, then archive them as a ZIP.

## Storage

Remix Studio tracks storage usage across the main image bucket, libraries, exports, and recycle bin data.

- Remix Studio uses S3-compatible object storage for generated images and archives
- For local development, the recommended storage backend is MinIO running via Docker Compose
- For deployment, you can point the app at AWS S3 or another S3-compatible storage service instead of local MinIO
- The main storage bucket holds project images, workflow assets, library images, and related media
- A separate export bucket is used for completed ZIP archives
- Storage analysis reports total usage against the user's storage limit
- The dashboard and account area show current usage and limit information
- Usage is broken down into projects, libraries, archives, and recycle bin categories
- Project storage includes album items, workflow assets, and orphaned files still present in project storage paths
- Library storage is counted from saved library items, including derived image sizes where available
- Archive storage is calculated from completed export ZIPs in the export bucket
- Recycle bin storage is counted separately so deleted items are still visible in usage until permanently removed
- Generation and export flows both check storage limits before committing more data

The storage system is designed so the quota checks and the storage dashboard stay aligned: the same categories used for reporting are also used for enforcement. In short, use MinIO for local development, and use S3 or another compatible object store when running Remix Studio outside local dev.

## Repository Structure

```text
remix-studio/
├── docs/        # Design notes and implementation docs
├── prisma/      # Prisma schema and migrations
├── public/      # Static assets
├── server/      # API, auth, storage, queue, and generator code
├── src/         # React application
├── .env.example # Example environment variables
├── server.ts    # Local server entry point
└── docker-compose.yml
```

## Notes

- This repository is aimed at local or self-hosted use. Production deployment is possible, but it still requires you to make your own decisions around secrets, storage, database operations, and infrastructure.
- The app auto-creates a default admin user if `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are provided and the user does not already exist.
- Storage is implemented against S3-compatible APIs, so MinIO works well for development.

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
