# Backup & Restore

This guide covers the PostgreSQL helper scripts shipped with the Docker image and the additional data needed for a complete Remix Studio backup.

::: warning A database dump is not a complete backup
PostgreSQL stores records and object keys. Generated media, library uploads, campaign media, thumbnails, and export ZIPs live in object storage. Provider and external-service credentials also require the original `PROVIDER_ENCRYPTION_KEY` to decrypt.
:::

For a recoverable deployment, back up:

1. PostgreSQL.
2. The main object-storage bucket (`S3_BUCKET`).
3. The export bucket (`S3_EXPORT_BUCKET`) if archives must be retained.
4. Environment/deployment secrets, especially `PROVIDER_ENCRYPTION_KEY` and `JWT_SECRET`.
5. The application version or image tag used at backup time.

## Database Backup Architecture

Backup files are generated inside the application container and saved to `/app/backups`. To ensure these backups persist across container restarts and updates, this path must be mounted as a host volume.

Backup files are plain SQL dumps compressed with gzip (`.sql.gz`).

### Volume Mount Configuration

To ensure backups are not lost if the container is removed, mount a host directory to `/app/backups`.

#### Using Docker Compose (Recommended)

This volume mount is already included by default in all provided Docker Compose templates in the `docker/` directory.

```yaml
services:
  app:
    volumes:
      # Mounts a host directory to the container's backup directory
      - ${BACKUP_DIR:-./volumes/backups}:/app/backups
```

#### Using Docker CLI (`docker run`)

```bash
docker run -d \
  --name remix-studio-app \
  -v /path/to/your/host/backups:/app/backups \
  # ... other necessary flags ...
  ghcr.io/shinchven/remix-studio:latest
```

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `BACKUP_DIR` | `./volumes/backups` | Host path where backup files are stored. |
| `BACKUP_KEEP_DAYS` | `7` | Retention. Deletes backups older than N days on each successful run. Set `0` to keep all backups. |

Example `.env`:

```ini
BACKUP_DIR=/mnt/nas/remix-studio-backups
BACKUP_KEEP_DAYS=14
```

## Creating a Backup

### Manual Backup

Run the `backup.sh` script inside the running application container:

```bash
docker exec remix-studio-app /app/backup.sh
```

*(Replace `remix-studio-app` with your actual container name if it differs.)*

Expected output:

```text
[backup] Starting backup at 2026-05-01_020000
[backup] Database: remix_studio @ postgres:5432
[backup] Output:   /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz
[backup] ✓ Backup complete — /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz (1.2M)
[backup] Applying retention: removing backups older than 7 day(s)
[backup] Done.
```

The resulting `.sql.gz` file is immediately available on your host in the directory specified by `BACKUP_DIR`.

### Automated Scheduling (Cron)

For production, schedule backups with a host cron job. To run a backup every day at 2:00 AM:

```bash
crontab -e
```

Add:

```bash
0 2 * * * docker exec remix-studio-app /app/backup.sh >> /var/log/remix-studio-backup.log 2>&1
```

The helper applies retention only to matching database dump files in `/app/backups`. It does not copy object storage or secrets.

## Backing Up Object Storage

Use the native versioning/replication/export feature of your storage provider or a compatible tool that preserves object bytes and keys.

- **MinIO**: mirror both buckets to a different disk or remote target; copying the local MinIO data directory is safe only with a storage-consistent snapshot.
- **AWS S3 / R2 / managed storage**: enable versioning and/or replication, or run a scheduled bucket copy to an independent account/location.
- **Other S3-compatible services**: verify that multipart objects, metadata, and every prefix are included.

Record the exact bucket names, endpoints, regions, and custom-domain settings. Restoring bytes under different keys will leave database references broken.

For the most consistent backup, pause new generation, uploads, exports, campaign-media processing, and trash cleanup while capturing the database and buckets. If that is not possible, take storage and database snapshots as close together as possible and expect to use project orphan analysis after recovery.

## Backing Up Secrets

Keep an encrypted copy of production configuration in a secret manager or offline recovery store. At minimum preserve:

- `PROVIDER_ENCRYPTION_KEY` — required to decrypt saved provider, social, store, and connected-service credentials.
- `JWT_SECRET` — changing it invalidates existing access tokens.
- Database and object-storage credentials, or the identity configuration used to obtain them.
- OAuth client secrets for Google, X, Threads, and Gumroad.

Do not put an unencrypted `.env` file in the same publicly accessible backup location as the database and buckets.

## Restoring PostgreSQL

::: danger Data loss warning
Restoring a backup will **drop and recreate** the target database. All current data is permanently lost and replaced with the state from the backup. The restore script prompts for confirmation before proceeding.
:::

### 1. Identify the Backup File

List available backups from inside the container:

```bash
docker exec remix-studio-app ls -lht /app/backups/
```

Or directly on the host:

```bash
ls -lht ./volumes/backups/
```

### 2. Run the Restore Script

Pass the absolute path to the backup file *as it appears inside the container* (starting with `/app/backups/`). Run interactively (`-it`) because the script requires confirmation.

```bash
docker exec -it remix-studio-app /app/restore.sh \
  /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz
```

### 3. Post-Restore Steps

**A. Run database migrations.** If the backup came from an older version, apply pending migrations:

```bash
docker exec remix-studio-app npx prisma migrate deploy
```

**B. Restart the application** to clear in-memory caches and reconnect cleanly:

```bash
docker compose restart app
```

## Restoring a Complete Deployment

Use this order for a disaster recovery:

1. Stop Remix Studio workers or keep the application offline.
2. Provision PostgreSQL and both object-storage buckets.
3. Restore the bucket objects under their original keys.
4. Restore the PostgreSQL dump.
5. Restore the original `PROVIDER_ENCRYPTION_KEY` and remaining environment configuration.
6. Start the target application version and run `prisma migrate deploy`.
7. Verify `/healthz` and `/readyz`.
8. Test representative project media, library media, an export download, provider credential access, and a non-destructive connected-service read.
9. Upgrade to a newer application version only after the restored version is healthy.

If bucket names or public endpoints changed, update the S3 environment variables. Stored database values are generally object keys, while signed/display URLs are rebuilt by the server; however, externally cached URLs and third-party posts are not rewritten.

## Verification and Retention

A backup is useful only if it can be restored. Periodically:

- Test-decompress a database dump with `gzip -t`.
- Restore to an isolated PostgreSQL database.
- Compare object counts/bytes for both buckets.
- Open original, optimized, and thumbnail variants.
- Confirm encrypted provider credentials can be decrypted with the recovered key.
- Keep at least one copy outside the deployment host and storage account.
