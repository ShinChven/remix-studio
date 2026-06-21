# Configuration Reference

Remix Studio is configured entirely through environment variables. This page documents every variable, grouped by purpose. For local development copy `.env.example`; for containerized deployments copy one of the `docker/env.*.example` files.

## Ports & URLs

| Variable | Default | Description |
| :--- | :--- | :--- |
| `APP_PORT` | `3000` | Port the app listens on. |
| `APP_URL` | `http://localhost:3000` | Public base URL. Must match the base of any OAuth callback URLs you register. |
| `POSTGRES_PORT` | `5432` | Host-published PostgreSQL port (compose). |
| `MINIO_API_PORT` | `9000` | Host-published MinIO API port (compose). |
| `MINIO_CONSOLE_PORT` | `9001` | Host-published MinIO console port (compose). |

## Database

| Variable | Description |
| :--- | :--- |
| `DATABASE_URL` | PostgreSQL connection string used by Prisma. Use `@localhost` for host dev, `@postgres` inside Docker Compose. |

## Storage (S3-Compatible)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `S3_ENDPOINT` | `http://localhost:9000` | Storage endpoint. Leave empty for AWS S3 default resolution. Use `http://minio:9000` only inside Compose. |
| `S3_ACCESS_KEY_ID` | `minioadmin` | Access key. Can be empty when using AWS IAM roles. |
| `S3_SECRET_ACCESS_KEY` | `minioadmin` | Secret key. Can be empty when using AWS IAM roles. |
| `S3_BUCKET` | `remix-studio` | Bucket for project images, workflow assets, and library media. |
| `S3_EXPORT_BUCKET` | `remix-studio-exports` | Separate bucket for completed ZIP export archives. |
| `AWS_REGION` | `us-east-1` | Region (use `auto` for R2/GCS interop). |
| `S3_PUBLIC_ENDPOINT` | empty | Override base URL for presigned download links if different from the internal endpoint. |
| `S3_EXPORT_PUBLIC_ENDPOINT` | empty | Public endpoint override for export downloads. |
| `S3_PUBLIC_CUSTOM_DOMAIN` | `false` | Treat the public endpoint as a custom domain. |
| `S3_EXPORT_PUBLIC_CUSTOM_DOMAIN` | `false` | Same, for exports. |
| `S3_AUTO_CREATE_BUCKET` | `true` (dev) / `false` (prod) | Whether the app creates buckets automatically. Pre-create buckets and set `false` for managed stores. |

See [Storage Providers](/guide/storage-providers) for AWS S3, Cloudflare R2, Google Cloud Storage, and Alibaba Cloud OSS specifics.

## Authentication & Security

| Variable | Default | Description |
| :--- | :--- | :--- |
| `DEFAULT_ADMIN_EMAIL` | `admin@example.com` | Auto-created admin account email. |
| `DEFAULT_ADMIN_PASSWORD` | — | Auto-created admin password. The admin is created on first boot if it does not exist. |
| `PROVIDER_ENCRYPTION_KEY` | — | **64-character hex string** used to encrypt stored provider API keys. See the warning below. |
| `JWT_SECRET` | — | Secret for signing JWT session tokens. Change in production. |
| `WEBAUTHN_ORIGIN` | empty | Exact external origin for passkeys, including `https://`. Set when TLS terminates at a proxy. |
| `WEBAUTHN_RP_ID` | empty | Passkey relying-party ID: public domain only, no protocol or port. |
| `WEBAUTHN_RP_NAME` | `Remix Studio` | Display name shown during passkey registration. |

::: danger Keep PROVIDER_ENCRYPTION_KEY stable
Do not change `PROVIDER_ENCRYPTION_KEY` after providers have been created unless you also re-encrypt stored credentials. Generate one with:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```
:::

## Google OAuth (Login + Invite Registration)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GOOGLE_CLIENT_ID` | empty | Google OAuth client ID for existing-user login and invite-based registration. |
| `GOOGLE_CLIENT_SECRET` | empty | Google OAuth client secret. |
| `GOOGLE_REDIRECT_URI` | `http://localhost:3000/api/auth/google/callback` | OAuth redirect URI. |

## Social Channels

| Variable | Description |
| :--- | :--- |
| `X_CLIENT_ID` / `X_CLIENT_SECRET` | OAuth 2.0 credentials for X (Twitter) campaigns. See [X Setup](/integrations/x-platform). |
| `THREADS_APP_ID` / `THREADS_APP_SECRET` | Threads (Meta) use-case credentials. Redirect: `${APP_URL}/api/social/threads/callback`. See [Threads Setup](/integrations/threads-platform). |

## Backups (Docker)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `BACKUP_DIR` | `./volumes/backups` | Host path mounted to `/app/backups` for database dumps. |
| `BACKUP_KEEP_DAYS` | `7` | Retention in days. `0` keeps all backups. |

See [Backup & Restore](/operations/backup-and-restore).

## Deployment Image

| Variable | Description |
| :--- | :--- |
| `REMIX_STUDIO_IMAGE` | Override the image tag in compose templates, e.g. `ghcr.io/shinchven/remix-studio:1.5.0`. Defaults to `:latest`. |

## Notes

- The app auto-creates a default admin user if `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are provided and the user does not already exist.
- Storage is implemented against S3-compatible APIs, so MinIO works well for development and AWS S3 works for production.
- For host-based local development (`docker compose up -d postgres minio` + `npm run dev`), reach MinIO at `http://localhost:9000`.
