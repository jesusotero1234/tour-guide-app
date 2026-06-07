#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
BACKEND_DIR="$ROOT_DIR/backend"

log() {
  printf '[dev-reset-db] %s\n' "$*"
}

usage() {
  cat <<EOF
Usage: ./scripts/dev-reset-db.sh [--seed]

Resets the local Prisma/Postgres database for this workspace.

Options:
  --seed       Re-run backend Prisma seed after reset.
  -h, --help   Show this help.
EOF
}

SEED=false
while [[ $# -gt 0 ]]; do
  case "$1" in
    --seed)
      SEED=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[dev-reset-db] ERROR: Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

command -v npm >/dev/null 2>&1 || {
  printf '[dev-reset-db] ERROR: Missing required command: npm\n' >&2
  exit 1
}

log "Resetting local database via Prisma migrate reset..."
(cd "$BACKEND_DIR" && npx prisma migrate reset --force --skip-generate --skip-seed)

if [[ "$SEED" == "true" ]]; then
  log "Running Prisma seed..."
  (cd "$BACKEND_DIR" && npm run prisma:seed)
fi

log "Done. Local tours, places, audio asset rows, jobs, and caches in Postgres were reset."
