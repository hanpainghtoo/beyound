#!/usr/bin/env bash
set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: scripts/db-restore.sh <backup.dump>"
  exit 1
fi

if [[ "${ALLOW_DB_RESTORE:-false}" != "true" ]]; then
  echo "Restore blocked. Set ALLOW_DB_RESTORE=true to confirm this destructive operation."
  exit 1
fi

BACKUP_FILE="$1"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-zayos}"

if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "Backup file not found: ${BACKUP_FILE}"
  exit 1
fi

echo "Restoring PostgreSQL backup into ${DB_NAME}: ${BACKUP_FILE}"
PGPASSWORD="${DB_PASSWORD:-password}" pg_restore \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USERNAME" \
  --dbname "$DB_NAME" \
  --clean \
  --if-exists \
  --no-owner \
  --verbose \
  "$BACKUP_FILE"

echo "Restore complete: ${BACKUP_FILE}"
