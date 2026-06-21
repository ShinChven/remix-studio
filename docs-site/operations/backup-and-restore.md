# Database Backup & Restore

This guide covers how to back up and restore the PostgreSQL database used by Remix Studio when running via Docker. The application container includes `pg_dump`, `psql`, and automated helper scripts.

## Architecture

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

## Restoring From a Backup

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
