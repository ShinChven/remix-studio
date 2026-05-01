#!/bin/bash
# =============================================================================
# Remix Studio — Database Backup
#
# Usage (inside container):
#   /app/backup.sh
#
# Mount the backups directory in docker-compose:
#   volumes:
#     - ./data/backups:/app/backups
#
# Environment variables:
#   DATABASE_URL       — PostgreSQL connection string (required)
#   BACKUP_DIR         — Output directory (default: /app/backups)
#   BACKUP_KEEP_DAYS   — Delete backups older than N days; 0 = keep all (default: 7)
# =============================================================================

set -euo pipefail

# ── Config ────────────────────────────────────────────────────────────────────
BACKUP_DIR="${BACKUP_DIR:-/app/backups}"
BACKUP_KEEP_DAYS="${BACKUP_KEEP_DAYS:-7}"
TIMESTAMP="$(date +%Y-%m-%d_%H%M%S)"
BACKUP_FILE="${BACKUP_DIR}/remix_studio_backup_${TIMESTAMP}.sql.gz"

# ── Validate ──────────────────────────────────────────────────────────────────
if [ -z "${DATABASE_URL:-}" ]; then
  echo "[backup] ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"

# ── Parse DATABASE_URL ────────────────────────────────────────────────────────
# Format: postgresql://user:password@host:port/dbname[?params]
_url="${DATABASE_URL}"
_url="${_url#postgresql://}"
_url="${_url#postgres://}"

DB_USER="$(echo "$_url" | sed 's/:.*$//')"
_rest="${_url#*:}"
DB_PASS="$(echo "$_rest" | sed 's/@.*$//')"
_rest="${_rest#*@}"
DB_HOST="$(echo "$_rest" | sed 's/[:\/].*$//')"
_rest="${_rest#*:}"
DB_PORT="$(echo "$_rest" | sed 's/\/.*$//')"
DB_NAME="$(echo "$_rest" | sed 's/^[0-9]*\///' | sed 's/?.*$//')"

echo "[backup] Starting backup at ${TIMESTAMP}"
echo "[backup] Database: ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"
echo "[backup] Output:   ${BACKUP_FILE}"

# ── Dump ──────────────────────────────────────────────────────────────────────
PGPASSWORD="$DB_PASS" pg_dump \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --format=plain \
  --no-owner \
  --no-acl \
  | gzip -9 > "$BACKUP_FILE"

BACKUP_SIZE="$(du -sh "$BACKUP_FILE" | cut -f1)"
echo "[backup] ✓ Backup complete — ${BACKUP_FILE} (${BACKUP_SIZE})"

# ── Retention ─────────────────────────────────────────────────────────────────
if [ "${BACKUP_KEEP_DAYS}" -gt 0 ]; then
  echo "[backup] Applying retention: removing backups older than ${BACKUP_KEEP_DAYS} day(s)"
  find "$BACKUP_DIR" -maxdepth 1 -name "remix_studio_backup_*.sql.gz" \
    -mtime "+${BACKUP_KEEP_DAYS}" -type f -print -delete
fi

echo "[backup] Done."
