#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
STATE_DIR="$ROOT_DIR/.dev-state"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-tour-guide-postgres}"
STOP_POSTGRES=false

log() {
  printf '[dev-down] %s\n' "$*"
}

usage() {
  cat <<EOF
Usage: ./scripts/dev-down.sh [--postgres]

Stops services started by ./scripts/dev-up.sh.

Options:
  --postgres   Also stop the Podman Postgres container.
  -h, --help   Show this help.
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --postgres)
      STOP_POSTGRES=true
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      printf '[dev-down] ERROR: Unknown option: %s\n' "$1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

kill_gracefully() {
  local name="$1"
  local pid="$2"
  log "Stopping $name (PID $pid)..."
  kill -TERM "$pid" >/dev/null 2>&1 || true
  for _ in {1..10}; do
    if ! kill -0 "$pid" >/dev/null 2>&1; then
      return 0
    fi
    sleep 1
  done
  if kill -0 "$pid" >/dev/null 2>&1; then
    log "$name did not exit gracefully; sending KILL."
    kill -KILL "$pid" >/dev/null 2>&1 || true
  fi
}

stop_port_owner() {
  local name="$1"
  local port="$2"
  local pids
  pids=$(ss -ltnpH "sport = :$port" 2>/dev/null \
    | grep -oP 'pid=\K[0-9]+' || true)
  if [[ -n "$pids" ]]; then
    log "Found unmanaged $name process(es) on :$port — PIDs: $pids"
    for pid in $pids; do
      kill_gracefully "$name (port $port)" "$pid"
    done
  fi
}

stop_pid_file() {
  local name="$1"
  local port="${2:-}"
  local pid_file="$STATE_DIR/$name.pid"

  if [[ -f "$pid_file" ]]; then
    local pid
    pid="$(<"$pid_file")"
    if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
      kill_gracefully "$name" "$pid"
    else
      log "$name PID file exists, but process is not running."
    fi
    rm -f -- "$pid_file"
  else
    log "$name was not started by dev-up (no PID file)."
  fi

  # Fallback: also kill any unmanaged process still holding the port.
  if [[ -n "$port" ]]; then
    stop_port_owner "$name" "$port"
  fi
}

main() {
  stop_pid_file "frontend"  3000

  # Clean Next.js build cache to guarantee a fresh recompile next time
  if [[ -d "$ROOT_DIR/frontend/.next" ]]; then
    log "Cleaning frontend/.next cache..."
    rm -rf "$ROOT_DIR/frontend/.next"
  fi

  stop_pid_file "backend"   3001
  stop_pid_file "tts-pod"   3005
  stop_pid_file "voxcpm-pod" 3006
  stop_pid_file "llm-pod"   3002
  stop_pid_file "ollama"    11434

  if [[ "$STOP_POSTGRES" == "true" ]]; then
    if command -v podman >/dev/null 2>&1 && podman container exists "$POSTGRES_CONTAINER"; then
      log "Stopping Postgres container: $POSTGRES_CONTAINER"
      podman stop "$POSTGRES_CONTAINER" >/dev/null || true
    else
      log "Postgres container not found: $POSTGRES_CONTAINER"
    fi
  else
    log "Leaving Postgres running. Use --postgres to stop it too."
  fi
}

main "$@"
