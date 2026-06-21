# Docker Deployment

Remix Studio is designed for self-hosted and cloud-hosted deployments. Docker images are published to GHCR and run against your own PostgreSQL database and S3-compatible storage.

Use a separate environment file for containerized deployments so your local `.env` can keep using host addresses like `localhost`.

## 1. Clone the Repository

```bash
git clone https://github.com/ShinChven/remix-studio.git
cd remix-studio
```

## 2. Create the Docker Deployment Environment File

```bash
cp .env.docker.example .env.docker
```

For the bundled PostgreSQL + MinIO stack, keep these container-network addresses:

```ini
DATABASE_URL=postgresql://postgres:postgres@postgres:5432/remix_studio
S3_ENDPOINT=http://minio:9000
```

Before starting the stack, set real values for:

- `PROVIDER_ENCRYPTION_KEY` — must be a 64-character hex string
- `JWT_SECRET`
- `DEFAULT_ADMIN_PASSWORD`
- `S3_ACCESS_KEY_ID` and `S3_SECRET_ACCESS_KEY`, if you do not want the default MinIO credentials

Generate an encryption key with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

## 3. Start the Full Stack From the Published GHCR Image

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

## 4. View Logs

```bash
docker compose --profile app --env-file .env.docker logs -f app
```

## 5. Stop the Stack

```bash
docker compose --profile app --env-file .env.docker down
```

## Choosing a Compose Template

The `docker/` directory ships several layouts. Pick the one that matches where your object storage lives:

| Template | Layout | Matching env file |
| :--- | :--- | :--- |
| `compose.minio.yml` | app + PostgreSQL + MinIO (fully self-hosted, single host) | `env.minio.example` |
| `compose.aws-s3.yml` | app + PostgreSQL, storage on AWS S3 or managed S3 | `env.aws-s3.example` |
| `compose.app-only.yml` | app only (you provide PostgreSQL and object storage) | `env.app-only.example` |

Additional env examples are provided for `cloudflare-r2`, `gcs`, and `aliyun-oss`. See [Storage Providers](/guide/storage-providers) for per-provider configuration.

### Example: AWS S3 layout

```bash
cp docker/env.aws-s3.example .env
docker compose -f docker/compose.aws-s3.yml --env-file .env up -d
```

## Passkeys Behind a Reverse Proxy

If you use passkeys:

- Set `WEBAUTHN_RP_ID` to the **public site domain only**, without protocol or port. Example: `app.example.com`.
- If TLS terminates at a reverse proxy or load balancer, set `WEBAUTHN_ORIGIN` to the exact external origin, including `https://`. Example: `https://app.example.com`.

## Health Checks

All templates expose:

- Liveness: `GET /healthz`
- Readiness: `GET /readyz`

## Image Tags and Cleanup

- `latest` tracks the latest successful build from the main branch.
- Version tags publish `1.0.0`, `1.0`, and `1` style tags from `v1.0.0`; use these for release deployments.
- `edge` is deprecated; replace it with `latest` for default-branch tracking.
- A scheduled workflow removes old untagged GHCR images weekly, keeps the newest 20 untagged images, and validates multi-architecture image integrity after cleanup.

## Cutting a Release

```bash
npm version 1.0.0
git push origin main --tags
```

This triggers the GHCR image build from `.github/workflows/docker.yml`.

## Related

- [Backup & Restore](/operations/backup-and-restore) — the compose templates mount `/app/backups` by default.
- [Upgrading](/operations/upgrading) — migration and compatibility notes.
