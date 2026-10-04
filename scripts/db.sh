#!/usr/bin/env bash
# Local Postgres via backend/compose.yaml: scripts/db.sh up|down|reset|logs|status
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
root="$here/.."
if [ -f "$root/.env" ]; then set -a; . "$root/.env"; set +a; fi
: "${DB_PASSWORD:?Set DB_PASSWORD in .env (copy .env.example)}"
export WM_DB_PORT="${WM_DB_PORT:-5434}"
cd "$root/backend"
case "${1:-}" in
  up) docker compose up -d --wait ;;
  down) docker compose down ;;
  reset) docker compose down -v ;;
  logs) docker compose logs -f ;;
  status) docker compose ps ;;
  *) echo "Usage: db.sh up|down|reset|logs|status" >&2; exit 1 ;;
esac
