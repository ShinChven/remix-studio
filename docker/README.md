# Docker Deployment Templates

These templates are intended to be copied into a separate deployment repository after this repository publishes Docker images to GHCR.

## Recommended layouts

- `compose.aws-s3.yml`: app + PostgreSQL, with object storage on AWS S3 or another managed S3-compatible service
- `compose.minio.yml`: app + PostgreSQL + MinIO, for a fully self-hosted single-host deployment
- `compose.app-only.yml`: app only, for environments that already provide PostgreSQL and object storage

## Matching environment files

- `env.aws-s3.example`
- `env.cloudflare-r2.example`
- `env.gcs.example`
- `env.aliyun-oss.example`
- `env.minio.example`
- `env.app-only.example`

## Storage backend guides

- `STORAGE_PROVIDERS.md`: provider-specific S3-compatible configuration notes for AWS S3, Cloudflare R2, Google Cloud Storage, and Alibaba Cloud OSS

## Suggested workflow

1. Let GitHub Actions build and publish the image from this repository
2. In the deployment repository, use `latest` for main branch tracking or pin `REMIX_STUDIO_IMAGE` to a release tag such as `ghcr.io/shinchven/remix-studio:1.0.0`
3. Copy one compose file and its matching env example
4. Replace all placeholder secrets before deployment
5. If you use passkeys, set `WEBAUTHN_RP_ID` to the public site domain only, without protocol or port. Example: `app.example.com` or `example.com`
6. If TLS terminates at a reverse proxy or load balancer, set `WEBAUTHN_ORIGIN` to the exact external origin, including `https://`. Example: `https://app.example.com`

## Image tags and cleanup

- `latest` tracks the latest successful build from the main branch
- Version tags publish `1.0.0`, `1.0`, and `1` style tags from `v1.0.0`; use these for release deployments
- `edge` is deprecated; replace it with `latest` if you want default branch tracking
- `.github/workflows/ghcr-cleanup.yml` removes old untagged GHCR images weekly, keeps the newest 20 untagged images, and validates multi-architecture image integrity after cleanup

## Example commands

```bash
cp docker/env.aws-s3.example .env
docker compose -f docker/compose.aws-s3.yml --env-file .env up -d
```

```bash
cp docker/env.minio.example .env
docker compose -f docker/compose.minio.yml --env-file .env up -d
```

All templates expose app health on `/healthz` and readiness on `/readyz`.

---

## Backup & Restore

The app container includes `pg_dump` / `psql` and two helper scripts. Backup files are stored in `/app/backups` inside the container — mount it as a host volume so the files persist and are accessible on the host.

### Volume mount (already included in all templates)

```yaml
services:
  app:
    volumes:
      - ${BACKUP_DIR:-./volumes/backups}:/app/backups
```

You can override the host path via the `.env` file:

```dotenv
BACKUP_DIR=/mnt/nas/remix-studio-backups
```

### Environment variables

| Variable | Default | Description |
|---|---|---|
| `BACKUP_DIR` | `./volumes/backups` | Host path to mount as the backup volume |
| `BACKUP_KEEP_DAYS` | `7` | Auto-delete backups older than N days on each backup run. Set to `0` to keep all. |

---

### Create a backup

```bash
docker exec remix-studio-app /app/backup.sh
```

Output example:

```
[backup] Starting backup at 2026-05-01_020000
[backup] Database: remix_studio @ postgres:5432
[backup] Output:   /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz
[backup] ✓ Backup complete — /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz (1.2M)
[backup] Applying retention: removing backups older than 7 day(s)
[backup] Done.
```

The backup file is a gzip-compressed plain SQL dump. It appears at the same path on the host under `./volumes/backups/` (or your custom `BACKUP_DIR`).

#### Scheduling on the host (optional)

To run daily backups automatically, add a cron job on the host:

```bash
# crontab -e
0 2 * * * docker exec remix-studio-app /app/backup.sh >> /var/log/remix-studio-backup.log 2>&1
```

---

### Restore from a backup

> [!WARNING]
> Restoring will **drop and recreate** the target database. All current data will be lost. The script will prompt for confirmation before proceeding.

```bash
# Interactive — the script will ask you to confirm before proceeding
docker exec -it remix-studio-app /app/restore.sh \
  /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz
```

To list available backups inside the container:

```bash
docker exec remix-studio-app ls -lht /app/backups/
```

#### After restoring

If the restored backup is from an older version, run schema migrations:

```bash
docker exec remix-studio-app npx prisma migrate deploy
```

Then restart the app to pick up any in-memory state:

```bash
docker compose restart app
```

