#!/bin/bash
# =============================================================================
# Remix Studio — Database Restore
#
# Usage (inside container):
#   /app/restore.sh <backup-file>
#
# Example:
#   docker exec -it remix-studio-app /app/restore.sh \
#     /app/backups/remix_studio_backup_2026-05-01_020000.sql.gz
#
# Environment variables:
#   DATABASE_URL  — PostgreSQL connection string (required)
# =============================================================================

set -euo pipefail

BACKUP_FILE="${1:-}"

# ── Validate ──────────────────────────────────────────────────────────────────
if [ -z "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: No backup file specified." >&2
  echo "[restore] Usage: /app/restore.sh <backup-file.sql.gz>" >&2
  echo ""
  echo "[restore] Available backups:"
  ls -1t "${BACKUP_DIR:-/app/backups}"/remix_studio_backup_*.sql.gz 2>/dev/null || echo "  (none found)"
  exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
  echo "[restore] ERROR: File not found: ${BACKUP_FILE}" >&2
  exit 1
fi

if [ -z "${DATABASE_URL:-}" ]; then
  echo "[restore] ERROR: DATABASE_URL is not set." >&2
  exit 1
fi

# ── Parse DATABASE_URL ────────────────────────────────────────────────────────
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

echo "[restore] ⚠️  WARNING: This will OVERWRITE the current database '${DB_NAME}'."
echo "[restore] Source file: ${BACKUP_FILE}"
echo "[restore] Database:    ${DB_NAME} @ ${DB_HOST}:${DB_PORT}"
echo ""
printf "[restore] Type 'yes' to confirm: "
read -r CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "[restore] Aborted."
  exit 0
fi

echo "[restore] Starting restore..."

# ── Restore ───────────────────────────────────────────────────────────────────
# Drop and recreate the target database
PGPASSWORD="$DB_PASS" psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="postgres" \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '${DB_NAME}' AND pid <> pg_backend_pid();" \
  > /dev/null

PGPASSWORD="$DB_PASS" psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="postgres" \
  --command="DROP DATABASE IF EXISTS \"${DB_NAME}\";" \
  > /dev/null

PGPASSWORD="$DB_PASS" psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="postgres" \
  --command="CREATE DATABASE \"${DB_NAME}\" OWNER \"${DB_USER}\";" \
  > /dev/null

# Restore from compressed dump
gunzip -c "$BACKUP_FILE" | PGPASSWORD="$DB_PASS" psql \
  --host="$DB_HOST" \
  --port="$DB_PORT" \
  --username="$DB_USER" \
  --dbname="$DB_NAME" \
  --quiet

echo "[restore] ✓ Restore complete."
echo "[restore] Run 'npx prisma migrate deploy' if schema migrations are needed."
