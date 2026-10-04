#!/usr/bin/env bash
# Starts the system under test for Playwright: a throwaway Postgres, then the packaged jar
# (UI + API on one port). Playwright stops this script; the trap removes the database.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
export WM_E2E_DB_PORT="${WM_E2E_DB_PORT:-5435}"
APP_PORT="${WM_E2E_APP_PORT:-8095}"

cleanup() {
  [ -n "${app_pid:-}" ] && kill "$app_pid" 2>/dev/null || true
  docker compose -f "$here/compose.yaml" down -v >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

docker compose -f "$here/compose.yaml" up -d --wait

export DB_PASSWORD=e2e-password
export SERVER_PORT="$APP_PORT"
# Same "today" as the scenarios and the UI date defaults (the UI reads it from GET /api/v1/today).
export WEALTHMESH_CLOCK_FIXED_TODAY="${WEALTHMESH_CLOCK_FIXED_TODAY:-2026-10-03}"
export SPRING_R2DBC_URL="r2dbc:postgresql://localhost:${WM_E2E_DB_PORT}/wealthmesh_e2e"
export SPRING_FLYWAY_URL="jdbc:postgresql://localhost:${WM_E2E_DB_PORT}/wealthmesh_e2e"
export DB_USERNAME=wealthmesh

"$here/../scripts/run-backend-jar.sh" &
app_pid=$!
wait "$app_pid"
