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

isDev="${ZAYOS_ENV:-}"

if [ "$isDev" = "dev" ] && [ -f "$ROOT_DIR/.env.dev" ]; then
  load_env "$ROOT_DIR/.env.dev"
elif [ -f "$ROOT_DIR/.env" ]; then
  load_env "$ROOT_DIR/.env"
fi

export ALLOW_DB_RESET="${ALLOW_DB_RESET:-false}"

"${ROOT_DIR}/scripts/db-reset.sh"

if [ "$isDev" = "dev" ]; then
  export NODE_ENV=development
  export DB_SYNCHRONIZE=true
  echo "ZAYOS_ENV=dev detected: seeding with NODE_ENV=development from .env.dev."
else
  export NODE_ENV=production
  export ALLOW_PRODUCTION_SEED=true
  export ALLOW_DEMO_SEED_IN_PRODUCTION=true
  export DB_SYNCHRONIZE="false"
fi

echo "Seeding demo data into ${DB_NAME:-kme_omnichannel}..."
npm --prefix "${ROOT_DIR}/backend-core-service" run seed

echo "Demo database reset and reseed complete."
