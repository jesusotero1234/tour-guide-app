#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
RESET_DB_SCRIPT="$ROOT_DIR/scripts/dev-reset-db.sh"

log() {
  printf '[dev-reset-all] %s\n' "$*"
}

usage() {
  cat <<EOF
Usage: ./scripts/dev-reset-all.sh [--seed]

Resets the local Prisma/Postgres database and removes generated local audio/cache files.

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
      printf '[dev-reset-all] ERROR: Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

command -v gio >/dev/null 2>&1 || {
  printf '[dev-reset-all] ERROR: Missing required command: gio\n' >&2
  exit 1
}

trash_path_contents() {
  local target="$1"

  if [[ ! -d "$target" ]]; then
    return 0
  fi

  shopt -s nullglob dotglob
  local entries=("$target"/*)
  shopt -u nullglob dotglob

  for entry in "${entries[@]}"; do
    gio trash "$entry"
  done
}

log "Resetting local database..."
if [[ "$SEED" == "true" ]]; then
  "$RESET_DB_SCRIPT" --seed
else
  "$RESET_DB_SCRIPT"
fi

log "Removing generated backend audio files..."
trash_path_contents "$ROOT_DIR/backend/data/audio"

log "Removing VoxCPM generated cache files..."
trash_path_contents "$ROOT_DIR/pods/voxcpm-pod/cache"

log "Done. Database, generated audio, and VoxCPM cache were reset."
