# Configuration Reference

Remix Studio is configured through environment variables. This page documents the variables read by the application and the supported Docker Compose templates. For local development copy `.env.example`; for containerized deployments copy the example matching the compose layout.

## Ports & URLs

| Variable | Default | Description |
| :--- | :--- | :--- |
| `PORT` | `3000` | Port the Node.js process listens on inside its runtime. |
| `APP_PORT` | `3000` | Host port mapped to the container's `PORT` by the supplied compose files. It is not read directly by `server.ts`. |
| `APP_URL` | `http://localhost:3000` | Public base URL. Must match the base of any OAuth callback URLs you register. |
| `POSTGRES_PORT` | `5432` | Host-published PostgreSQL port (compose). |
| `MINIO_API_PORT` | `9000` | Host-published MinIO API port (compose). |
| `MINIO_CONSOLE_PORT` | `9001` | Host-published MinIO console port (compose). |

`APP_URL` must be the browser-visible origin, with no path suffix. It is used to build social, store, Google login/Drive, and other callback URLs. `PORT` and `APP_PORT` can differ when a container listens on one port and the host publishes another.

## Runtime & Reverse Proxy

| Variable | Default | Description |
| :--- | :--- | :--- |
| `NODE_ENV` | development tooling dependent | Use `production` for the built server. Also changes secure defaults such as storage bucket auto-creation. |
| `TRUST_PROXY` | `false` | When `1`, `true`, or `yes`, rate limiting uses the leading `X-Forwarded-For` address. Enable only behind a trusted proxy that overwrites this header. |
| `JOB_PROCESSING_TIMEOUT_MS` | `7200000` (2 hours) | Maximum time an observed detached provider task may remain non-terminal before the job is failed and its concurrency slot released. |
| `DISABLE_HMR` | unset | Development-only Vite switch used when hot-module-reload WebSockets are unsuitable. |
| `GEMINI_API_KEY` | unset | Build-time/development compatibility variable exposed by Vite. Normal Remix Studio generation and assistant use provider credentials stored in the app. |

::: warning Trust proxy carefully
If clients can connect directly to the app and supply their own `X-Forwarded-For`, enabling `TRUST_PROXY` lets them choose the address used by the in-memory authentication rate limiter. Restrict direct access and configure the proxy to replace forwarded headers.
:::

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

## Releases

Destinations for finished exports are connected on the **Releases** page. Credentials are encrypted using the same deployment encryption facility as other external credentials.

### Storefronts

| Variable | Default | Description |
| :--- | :--- | :--- |
| `GUMROAD_CLIENT_ID` | empty | OAuth application client ID used by **Releases**. |
| `GUMROAD_CLIENT_SECRET` | empty | Gumroad OAuth client secret. |
| `GUMROAD_SCOPE` | `edit_products view_profile view_sales` | Space-separated OAuth scopes requested when connecting Gumroad. |

The redirect URL is `${APP_URL}/api/stores/gumroad/callback`.

### Drives

Google Drive reuses the Google OAuth application configured above; add `${APP_URL}/api/auth/google-drive/callback` as an authorized redirect URI.

| Variable | Default | Description |
| :--- | :--- | :--- |
| `MICROSOFT_CLIENT_ID` | empty | Entra ID application client ID used for OneDrive. |
| `MICROSOFT_CLIENT_SECRET` | empty | Entra ID application client secret. |
| `MICROSOFT_TENANT_ID` | `common` | `common`, `organizations`, `consumers`, or a tenant GUID. |
| `MICROSOFT_REDIRECT_URI` | derived from `APP_URL` | Override when the callback URL differs from `${APP_URL}/api/releases/drives/onedrive/callback`. |

The OneDrive app needs the delegated scopes `offline_access`, `User.Read`, and `Files.ReadWrite`.

MEGA needs no server-side configuration — each user signs in with their own account from the Releases page.

## Backups (Docker)

| Variable | Default | Description |
| :--- | :--- | :--- |
| `BACKUP_DIR` | `./volumes/backups` | Host path mounted to `/app/backups` for database dumps. |
| `BACKUP_KEEP_DAYS` | `7` | Retention in days. `0` keeps all backups. |

See [Backup & Restore](/operations/backup-and-restore).

## Compose Service Names, Ports & Volumes

These variables are consumed by the supplied compose files and helper scripts rather than by the Node.js application:

| Variable | Purpose |
| :--- | :--- |
| `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` | Bundled PostgreSQL initialization and connection values. Keep `DATABASE_URL` consistent with them. |
| `POSTGRES_CONTAINER_NAME`, `MINIO_CONTAINER_NAME`, `APP_CONTAINER_NAME` | Optional container-name overrides used by compose templates. |
| `POSTGRES_DATA_DIR`, `MINIO_DATA_DIR` | Host directories for persistent database and MinIO data. |
| `POSTGRES_PORT`, `MINIO_API_PORT`, `MINIO_CONSOLE_PORT` | Host-published ports. |
| `BACKUP_DIR`, `BACKUP_KEEP_DAYS` | Database dump mount and helper-script retention. |

## Deployment Image

| Variable | Description |
| :--- | :--- |
| `REMIX_STUDIO_IMAGE` | Override the image tag in compose templates, e.g. `ghcr.io/shinchven/remix-studio:1.5.0`. Defaults to `:latest`. |

## Notes

- The app auto-creates a default admin user if `DEFAULT_ADMIN_EMAIL` and `DEFAULT_ADMIN_PASSWORD` are provided and the user does not already exist.
- Storage is implemented against S3-compatible APIs, so MinIO works well for development and AWS S3 works for production.
- For host-based local development (`docker compose up -d postgres minio` + `npm run dev`), reach MinIO at `http://localhost:9000`.
- A database backup does not include bucket objects or `PROVIDER_ENCRYPTION_KEY`; back up all three separately.
