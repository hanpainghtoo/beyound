#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-backups}"
TIMESTAMP="$(date -u +"%Y%m%dT%H%M%SZ")"
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_NAME="${DB_NAME:-zayos}"
OUTPUT_FILE="${1:-${BACKUP_DIR}/${DB_NAME}-${TIMESTAMP}.dump}"

mkdir -p "$(dirname "$OUTPUT_FILE")"

echo "Creating PostgreSQL backup: ${OUTPUT_FILE}"
PGPASSWORD="${DB_PASSWORD:-password}" pg_dump \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USERNAME" \
  --dbname "$DB_NAME" \
  --format custom \
  --verbose \
  --file "$OUTPUT_FILE"

echo "Backup complete: ${OUTPUT_FILE}"
