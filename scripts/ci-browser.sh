#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
LOG_DIR="${CI_LOG_DIR:-$ROOT_DIR/artifacts/ci-logs}"
mkdir -p "$LOG_DIR"

pids=()

cleanup() {
  local status=$?
  for pid in "${pids[@]:-}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill "$pid" 2>/dev/null || true
    fi
  done
  wait 2>/dev/null || true
  exit "$status"
}
trap cleanup EXIT INT TERM

start_service() {
  local name="$1"
  local directory="$2"
  shift 2
  echo "Starting $name"
  (
    cd "$ROOT_DIR/$directory"
    exec "$@"
  ) >"$LOG_DIR/$name.log" 2>&1 &
  pids+=("$!")
}

wait_for_url() {
  local name="$1"
  local url="$2"
  local attempts="${3:-90}"
  echo "Waiting for $name at $url"
  for attempt in $(seq 1 "$attempts"); do
    if curl --fail --silent --location --output /dev/null "$url"; then
      echo "$name is ready"
      return 0
    fi
    if [ "$attempt" -eq "$attempts" ]; then
      echo "Timed out waiting for $name at $url"
      echo "--- $name logs ---"
      sed -n '1,220p' "$LOG_DIR/$name.log" 2>/dev/null || true
      return 1
    fi
    sleep 2
  done
}

cd "$ROOT_DIR"

echo "Running migrations against CI database"
npm --prefix backend-core-service run migration:run

echo "Seeding CI browser database"
npm --prefix backend-core-service run seed

start_service core-api backend-core-service env PORT=6001 npm run start:prod
start_service chat-ingestion services/chat-ingestion-service env PORT=6002 npm run start:prod
start_service webhook-handler services/webhook-handler-service env PORT=6003 npm run start:prod
start_service integration-service services/integration-service env PORT=6004 npm run start:prod
start_service file-storage services/file-storage-service env PORT=6005 npm run start:prod
start_service media-processing services/media-processing-service env PORT=6006 npm run start:prod
start_service workspace dashboards/workspace env PORT=6100 npm run start -- -p 6100
start_service platform-console dashboards/platform-console env PORT=6101 npm run start -- -p 6101

wait_for_url core-api "http://127.0.0.1:6001/api/v1/health"
wait_for_url chat-ingestion "http://127.0.0.1:6002/health"
wait_for_url webhook-handler "http://127.0.0.1:6003/health"
wait_for_url integration-service "http://127.0.0.1:6004/health"
wait_for_url file-storage "http://127.0.0.1:6005/health"
wait_for_url media-processing "http://127.0.0.1:6006/health"
wait_for_url workspace "http://127.0.0.1:6100"
wait_for_url platform-console "http://127.0.0.1:6101/login"

echo "Installing Playwright Chromium"
npm --prefix dashboards/workspace exec playwright install --with-deps chromium

echo "Running browser acceptance"
npm run test:e2e
