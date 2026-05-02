# Database Backup and Restore Guide

This guide covers how to back up and restore the PostgreSQL database used by Remix Studio when running via Docker. The Remix Studio application container includes `pg_dump`, `psql`, and automated helper scripts designed to make database management simple and reliable.

## Architecture

Backup files are generated inside the application container and saved to `/app/backups`. To ensure these backups persist across container restarts and updates, this path must be mounted as a host volume. 

The backup files are plain SQL dumps compressed with gzip (`.sql.gz`).

### Volume Mount Configuration

To ensure backups are not lost if the container is removed, you must mount a host directory to `/app/backups` inside the container. 

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
If you are running the container manually without Compose, use the `-v` flag to mount the directory:

```bash
docker run -d \
  --name remix-studio-app \
  -v /path/to/your/host/backups:/app/backups \
  # ... other necessary flags ...
  ghcr.io/shinchven/remix-studio:latest
```

### Environment Variables

You can customize the backup behavior using the following environment variables in your `.env` file:

| Variable | Default | Description |
|---|---|---|
| `BACKUP_DIR` | `./volumes/backups` | The path on the host machine where backup files will be stored. |
| `BACKUP_KEEP_DAYS` | `7` | Retention policy. Automatically deletes backups older than N days on each successful backup run. Set to `0` to keep all backups indefinitely. |

Example `.env` configuration:
```dotenv
BACKUP_DIR=/mnt/nas/remix-studio-backups
BACKUP_KEEP_DAYS=14
```

---

## Creating a Backup

### Manual Backup

To trigger a manual database backup, execute the `backup.sh` script inside the running application container:

```bash
docker exec remix-studio-app /app/backup.sh
```
*(Note: Replace `remix-studio-app` with your actual container name if it differs).*

**Expected Output:**
```text
[backup] Starting backup at 2026-05-01_020000
[backup] Database: remix_studio @ postgres:5432
[backup] Output:   /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz
[backup] ✓ Backup complete — /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz (1.2M)
[backup] Applying retention: removing backups older than 7 day(s)
[backup] Done.
```

The resulting `.sql.gz` file will be immediately available on your host machine in the directory specified by `BACKUP_DIR`.

### Automated Scheduling (Cron)

For production environments, it is highly recommended to schedule backups automatically using a cron job on the host machine.

To run a backup every day at 2:00 AM:

1. Open the crontab editor on the host:
   ```bash
   crontab -e
   ```
2. Add the following line:
   ```bash
   0 2 * * * docker exec remix-studio-app /app/backup.sh >> /var/log/remix-studio-backup.log 2>&1
   ```

---

## Restoring from a Backup

> [!WARNING]
> **Data Loss Warning:** Restoring a backup will **drop and recreate** the target database. All current data in the database will be permanently lost and replaced with the state from the backup. The restore script will prompt you for confirmation before proceeding.

### 1. Identify the Backup File

First, list the available backups to find the exact filename you wish to restore. You can list them from inside the container:

```bash
docker exec remix-studio-app ls -lht /app/backups/
```

Or directly on the host machine:
```bash
ls -lht ./volumes/backups/
```

### 2. Run the Restore Script

Use the `restore.sh` script, passing the absolute path to the backup file *as it appears inside the container* (starting with `/app/backups/`). 

You must run this command interactively (`-it`) because the script requires user confirmation.

```bash
docker exec -it remix-studio-app /app/restore.sh \
  /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz
```

### 3. Post-Restore Steps

After a successful restore, you must ensure the database schema and application state are synchronized.

**A. Run Database Migrations:**
If the backup you restored was taken from an older version of Remix Studio, the database schema might be outdated. Apply any pending migrations:

```bash
docker exec remix-studio-app npx prisma migrate deploy
```

**B. Restart the Application:**
Restart the application container to clear any in-memory caches and ensure the app connects cleanly to the newly restored database state.

```bash
docker compose restart app
```
