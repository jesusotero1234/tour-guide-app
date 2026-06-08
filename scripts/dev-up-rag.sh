#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
STATE_DIR="$ROOT_DIR/.dev-state"
LOG_DIR="$ROOT_DIR/.dev-logs"

ENRICHMENT_DIR="${ENRICHMENT_DIR:-$ROOT_DIR/pods/llm-pod/src/enrichment}"
RAG_PORT="${RAG_PORT:-11435}"
RAG_VENV="${RAG_VENV:-/tmp/rag-venv}"
RAG_PYTHON="${RAG_PYTHON:-$RAG_VENV/bin/python3}"

log() {
  printf '[dev-up-rag] %s\n' "$*"
}

warn() {
  printf '[dev-up-rag] WARN: %s\n' "$*" >&2
}

die() {
  printf '[dev-up-rag] ERROR: %s\n' "$*" >&2
  exit 1
}

port_open() {
  (exec 3<>"/dev/tcp/127.0.0.1/$1") >/dev/null 2>&1
}

pid_alive() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1
  local pid
  pid="$(<"$pid_file")"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

kill_port_owner() {
  local port="$1"
  local pids
  pids=$(ss -ltnpH "sport = :$port" 2>/dev/null \
    | grep -oP 'pid=\K[0-9]+' || true)
  if [[ -n "$pids" ]]; then
    log "Killing unmanaged process(es) on :$port — PIDs: $pids"
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null || true
    done
    sleep 2
    for pid in $pids; do
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    done
  fi
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local timeout_seconds="${3:-120}"
  local elapsed=0

  while ! curl -fsS -m 3 "$url" >/dev/null 2>&1; do
    if (( elapsed >= timeout_seconds )); then
      die "$name did not respond at $url within ${timeout_seconds}s. Check logs in $LOG_DIR."
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
}

usage() {
  cat <<EOF
Usage: ./scripts/dev-up-rag.sh

Starts the persistent RAG enrichment sidecar (port $RAG_PORT).
Requires the rag-venv with sentence-transformers and turbovec installed.

Environment:
  ENRICHMENT_DIR    Base directory with build_city_corpus.py and {city}_index/ dirs
  RAG_PORT          Port for the enrichment HTTP server (default: $RAG_PORT)
  RAG_VENV          Path to the Python venv with dependencies (default: $RAG_VENV)
EOF
}

main() {
  mkdir -p "$STATE_DIR" "$LOG_DIR"

  local pid_file="$STATE_DIR/rag-enrichment.pid"
  local log_file="$LOG_DIR/rag-enrichment.log"

  if pid_alive "$pid_file"; then
    if port_open "$RAG_PORT"; then
      log "RAG enrichment already running with PID $(<"$pid_file")"
      return 0
    fi
    # PID file exists and process is alive, but port is not open — stale state
    warn "RAG enrichment PID file exists and process is alive but port :$RAG_PORT is not open. Cleaning up stale state..."
    rm -f -- "$pid_file"
  fi

  # Port in use by an unmanaged process — kill it and take over.
  if port_open "$RAG_PORT"; then
    if pid_alive "$pid_file"; then
      log "RAG enrichment already running on :$RAG_PORT"
      return 0
    fi
    warn "Port :$RAG_PORT is in use by an unmanaged process. Reclaiming..."
    kill_port_owner "$RAG_PORT"
    rm -f -- "$pid_file"
  fi

  if [[ ! -f "$RAG_PYTHON" ]]; then
    die "Python not found at $RAG_PYTHON. Set RAG_VENV to the correct venv path."
  fi

  if [[ ! -d "$ENRICHMENT_DIR" ]]; then
    die "Enrichment directory not found: $ENRICHMENT_DIR"
  fi

  log "Starting RAG enrichment server on :$RAG_PORT..."
  log "  Python:    $RAG_PYTHON"
  log "  Index dir: $ENRICHMENT_DIR"

  (
    cd "$ENRICHMENT_DIR"
    nohup "$RAG_PYTHON" enrichment_server.py \
      --mode http \
      --port "$RAG_PORT" \
      --index-base-dir "$ENRICHMENT_DIR" \
      >"$log_file" 2>&1 &
    printf '%s' "$!" >"$pid_file"
  )

  # Cleanup trap: if health check fails, kill the process we just started
  # so it doesn't become an orphan holding the port.
  _cleanup_on_rag_failure() {
    local pid
    pid="$(<"$pid_file")" 2>/dev/null || true
    if [[ -n "$pid" ]] && kill -0 "$pid" 2>/dev/null; then
      log "Health check failed — killing RAG process (PID $pid)"
      kill -TERM "$pid" 2>/dev/null || true
      sleep 1
      kill -0 "$pid" 2>/dev/null && kill -KILL "$pid" 2>/dev/null || true
    fi
    rm -f -- "$pid_file"
  }
  trap _cleanup_on_rag_failure ERR

  wait_for_url "http://127.0.0.1:$RAG_PORT/health" "RAG enrichment" 90

  trap - ERR  # health check passed — disarm cleanup trap
  log "RAG enrichment ready on :$RAG_PORT"
}

main "$@"
