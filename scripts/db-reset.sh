#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load env files WITHOUT shell expansion (values like SMTP_PASS="...$h..."
# would otherwise be expanded by bash and break under `set -u`).
load_env() {
  local file="$1" line key val
  while IFS= read -r line || [ -n "$line" ]; do
    line="${line%$'\r'}"
    [ -n "$line" ] || continue
    case "$line" in
      \#*) continue ;;
    esac
    key="${line%%=*}"
    case "$key" in
      *[!A-Za-z0-9_]*) continue ;;
    esac
    val="${line#*=}"
    if [ ${#val} -ge 2 ] && { [ "${val:0:1}" = '"' ] && [ "${val: -1}" = '"' ]; }; then
      val="${val:1:${#val}-2}"
    elif [ ${#val} -ge 2 ] && { [ "${val:0:1}" = "'" ] && [ "${val: -1}" = "'" ]; }; then
      val="${val:1:${#val}-2}"
    fi
    export "$key=$val"
  done < "$file"
}

if [ -f "$ROOT_DIR/.env" ]; then
  load_env "$ROOT_DIR/.env"
fi

if [[ "${ALLOW_DB_RESET:-false}" != "true" ]]; then
  echo "Database reset blocked. Set ALLOW_DB_RESET=true to confirm this destructive operation."
  exit 1
fi

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_USERNAME="${DB_USERNAME:-postgres}"
DB_PASSWORD="${DB_PASSWORD:-password}"
DB_NAME="${DB_NAME:-kme_omnichannel}"

echo "Resetting PostgreSQL schema for ${DB_HOST}:${DB_PORT}/${DB_NAME}..."
PGPASSWORD="$DB_PASSWORD" psql \
  --host "$DB_HOST" \
  --port "$DB_PORT" \
  --username "$DB_USERNAME" \
  --dbname "$DB_NAME" \
  --set ON_ERROR_STOP=1 <<'SQL'
DROP SCHEMA IF EXISTS public CASCADE;
CREATE SCHEMA public;
GRANT ALL ON SCHEMA public TO PUBLIC;
SQL

echo "Running TypeORM migrations..."
npm --prefix "${ROOT_DIR}/backend-core-service" run migration:run

echo "Database reset complete."
