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

This starts PostgreSQL on `5432` and MinIO on `19000` with the console on `19001`.

### 3. Install dependencies

```bash
npm install
```

### 4. Configure environment variables

```bash
cp .env.example .env
```

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
