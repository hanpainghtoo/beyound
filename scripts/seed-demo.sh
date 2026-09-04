#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Load env files WITHOUT shell expansion. Sourcing is unsafe here: values
# such as SMTP_PASS="support{Cg$h{1" get $h expanded by bash (breaking under
# `set -u` and silently corrupting secrets). This parser mirrors dotenv:
# split on the first =, strip matching surrounding quotes, never expand.
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
    # strip one layer of matching surrounding quotes
    if [ ${#val} -ge 2 ] && { [ "${val:0:1}" = '"' ] && [ "${val: -1}" = '"' ]; }; then
      val="${val:1:${#val}-2}"
    elif [ ${#val} -ge 2 ] && { [ "${val:0:1}" = "'" ] && [ "${val: -1}" = "'" ]; }; then
      val="${val:1:${#val}-2}"
    fi
    export "$key=$val"
  done < "$file"
}

# Prefer .env.dev when running the dev stack (ZAYOS_ENV=dev) so signed
# file-storage upload URLs are rewritten to the local service; production
# keeps loading .env.
if [ -f "$ROOT_DIR/.env.dev" ] && [ "${ZAYOS_ENV:-}" = "dev" ]; then
  load_env "$ROOT_DIR/.env.dev"
elif [ -f "$ROOT_DIR/.env" ]; then
  load_env "$ROOT_DIR/.env"
fi

export NODE_ENV="${NODE_ENV:-test}"
export DB_HOST="${DB_HOST:-localhost}"
export DB_PORT="${DB_PORT:-55432}"
export DB_USERNAME="${DB_USERNAME:-postgres}"
export DB_PASSWORD="${DB_PASSWORD:-password}"
export DB_NAME="${DB_NAME:-zayos}"
if [ "${NODE_ENV}" = "production" ]; then
  export DB_SYNCHRONIZE="${DB_SYNCHRONIZE:-false}"
  if [ "${ALLOW_PRODUCTION_SEED:-}" != "true" ] || [ "${ALLOW_DEMO_SEED_IN_PRODUCTION:-}" != "true" ]; then
    echo "Production demo seeding requires ALLOW_PRODUCTION_SEED=true and ALLOW_DEMO_SEED_IN_PRODUCTION=true." >&2
    exit 1
  fi
else
  export DB_SYNCHRONIZE="${DB_SYNCHRONIZE:-true}"
fi
export INTERNAL_SERVICE_TOKEN_ISSUER="${INTERNAL_SERVICE_TOKEN_ISSUER:-zayos-local-internal-services}"
export INTERNAL_SERVICE_TOKEN_SIGNING_KEY="${INTERNAL_SERVICE_TOKEN_SIGNING_KEY:-local-dev-internal-service-token-signing-key-32-chars}"
export JWT_SECRET="${JWT_SECRET:-local-dev-change-me}"
export CORE_API_URL="${CORE_API_URL:-http://localhost:3001/api/v1}"

echo "Seeding Core API database at ${DB_HOST}:${DB_PORT}/${DB_NAME}..."
npm --prefix "${ROOT_DIR}/backend-core-service" run seed

echo "Seeding Media Library and media-backed scenarios through ${CORE_API_URL}..."
node "${ROOT_DIR}/scripts/seed-v2-media.mjs"

echo "Demo seed complete."
