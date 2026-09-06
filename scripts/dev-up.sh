#!/usr/bin/env bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
ROOT_DIR="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
STATE_DIR="$ROOT_DIR/.dev-state"
LOG_DIR="$ROOT_DIR/.dev-logs"

POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-tour-guide-postgres}"
POSTGRES_IMAGE="${POSTGRES_IMAGE:-postgres:16-alpine}"
POSTGRES_DB="${POSTGRES_DB:-tour_guide_local}"
POSTGRES_USER="${POSTGRES_USER:-tour_guide}"
POSTGRES_PASSWORD="${POSTGRES_PASSWORD:-tour_guide_dev}"
DATABASE_URL="${DATABASE_URL:-postgresql://tour_guide:tour_guide_dev@localhost:5432/tour_guide_local?schema=public}"
API_KEY="${API_KEY:-development-api-key}"
OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:26b}"
NARRATIVE_MODEL="${NARRATIVE_MODEL:-qwen2.5:14b}"

log() {
  printf '[dev-up] %s\n' "$*"
}

warn() {
  printf '[dev-up] WARN: %s\n' "$*" >&2
}

die() {
  printf '[dev-up] ERROR: %s\n' "$*" >&2
  exit 1
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Missing required command: $cmd"
}

port_open() {
  local port="$1"
  (exec 3<>"/dev/tcp/127.0.0.1/$port") >/dev/null 2>&1
}

wait_for_port() {
  local port="$1"
  local name="$2"
  local timeout_seconds="${3:-60}"
  local elapsed=0

  while ! port_open "$port"; do
    if (( elapsed >= timeout_seconds )); then
      die "$name did not open port $port within ${timeout_seconds}s. Check logs in $LOG_DIR."
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
}

wait_for_url() {
  local url="$1"
  local name="$2"
  local timeout_seconds="${3:-90}"
  local elapsed=0

  while ! curl -fsS -m 3 "$url" >/dev/null 2>&1; do
    if (( elapsed >= timeout_seconds )); then
      die "$name did not respond at $url within ${timeout_seconds}s. Check logs in $LOG_DIR."
    fi
    sleep 1
    elapsed=$((elapsed + 1))
  done
}

browser_host() {
  if [[ -n "${BROWSER_HOST:-}" ]]; then
    printf '%s' "$BROWSER_HOST"
    return 0
  fi

  # In WSL, Windows Chrome may not be able to reach WSL services through
  # localhost. Use the WSL interface IP for browser-visible URLs.
  if grep -qi microsoft /proc/version 2>/dev/null; then
    hostname -I | cut -d' ' -f1
    return 0
  fi

  printf 'localhost'
}

ollama_host_url() {
  if [[ -n "${OLLAMA_HOST:-}" ]]; then
    printf '%s' "$OLLAMA_HOST"
    return 0
  fi

  # Ollama runs on Windows for this workspace. In WSL, the Windows host is
  # available through the default gateway, which can change after reboot.
  if grep -qi microsoft /proc/version 2>/dev/null; then
    local windows_host
    windows_host="$(ip route | awk '/default/ {print $3; exit}')"
    if [[ -n "$windows_host" ]]; then
      printf 'http://%s:11434' "$windows_host"
      return 0
    fi
  fi

  printf 'http://localhost:11434'
}

pid_alive() {
  local pid_file="$1"
  [[ -f "$pid_file" ]] || return 1

  local pid
  pid="$(<"$pid_file")"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

ensure_npm_deps() {
  local dir="$1"
  local label="$2"

  if [[ -d "$dir/node_modules" ]]; then
    return 0
  fi

  log "Installing npm dependencies for $label..."
  (cd "$dir" && npm install)
}

ensure_postgres() {
  if port_open 5432; then
    log "Postgres already available on :5432"
    return 0
  fi

  require_cmd podman

  if podman container exists "$POSTGRES_CONTAINER"; then
    if [[ "$(podman inspect -f '{{.State.Running}}' "$POSTGRES_CONTAINER")" != "true" ]]; then
      log "Starting existing Postgres container: $POSTGRES_CONTAINER"
      podman start "$POSTGRES_CONTAINER" >/dev/null
    else
      log "Postgres container already running: $POSTGRES_CONTAINER"
    fi
  else
    log "Creating Postgres container: $POSTGRES_CONTAINER"
    podman run -d \
      --name "$POSTGRES_CONTAINER" \
      -p 5432:5432 \
      -e "POSTGRES_DB=$POSTGRES_DB" \
      -e "POSTGRES_USER=$POSTGRES_USER" \
      -e "POSTGRES_PASSWORD=$POSTGRES_PASSWORD" \
      -v tour-guide-postgres-data:/var/lib/postgresql/data \
      "$POSTGRES_IMAGE" >/dev/null
  fi

  wait_for_port 5432 "Postgres" 60
  log "Postgres ready on :5432"
}

kill_port_owner() {
  local port="$1"
  local pids
  # ss -ltnpH gives lines like: LISTEN ... users:(("node",pid=1234,fd=22))
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

start_managed() {
  local name="$1"
  local port="$2"
  local dir="$3"
  shift 3

  local pid_file="$STATE_DIR/$name.pid"
  local log_file="$LOG_DIR/$name.log"

  if pid_alive "$pid_file"; then
    log "$name already running with PID $(<"$pid_file")"
    return 0
  fi

  # Port in use by an unmanaged process — kill it and take over.
  if port_open "$port"; then
    warn "$name port :$port is in use by an unmanaged process. Reclaiming..."
    kill_port_owner "$port"
    rm -f -- "$pid_file"
  fi

  log "Starting $name on :$port..."
  (
    cd "$dir"
    nohup "$@" >"$log_file" 2>&1 &
    printf '%s' "$!" >"$pid_file"
  )
}

clean_frontend_next() {
  local pid_file="$STATE_DIR/frontend.pid"

  # Only skip cleanup if both PID is alive AND port 3000 is actually open.
  # Relying on PID alone is fragile — PID recycling can cause false positives.
  if pid_alive "$pid_file" && port_open 3000; then
    log "frontend already running; leaving frontend/.next intact"
    return 0
  fi

  # Stale PID file from a dead process — clean it up.
  if [[ -f "$pid_file" ]]; then
    rm -f -- "$pid_file"
  fi

  if [[ -d "$ROOT_DIR/frontend/.next" ]]; then
    log "Cleaning frontend/.next before starting dev server..."
    rm -rf "$ROOT_DIR/frontend/.next"
  fi
}

start_ollama_if_available() {
  local host_url
  host_url="$(ollama_host_url)"

  if curl -fsS -m 3 "$host_url/api/tags" >/dev/null 2>&1; then
    log "Ollama available at $host_url"
    return 0
  fi

  if port_open 11434; then
    log "Ollama already running on :11434"
    return 0
  fi

  if ! command -v ollama >/dev/null 2>&1; then
    warn "Ollama is not reachable at $host_url and 'ollama' was not found in WSL. Tour generation may fail until Windows Ollama is started."
    return 0
  fi

  start_managed "ollama" 11434 "$ROOT_DIR" ollama serve
  wait_for_port 11434 "Ollama" 30
  log "Ollama ready on :11434. If generation fails, run: ollama pull $OLLAMA_MODEL"
}

ensure_voxcpm_env() {
  local dir="$ROOT_DIR/pods/voxcpm-pod"

  if [[ -x "$dir/.venv/bin/uvicorn" ]]; then
    return 0
  fi

  log "Setting up VoxCPM virtualenv. First run can take several minutes..."
  (cd "$dir" && ./scripts/setup-dev.sh)
}

run_prisma_migrations() {
  if [[ "${SKIP_PRISMA:-0}" == "1" ]]; then
    warn "Skipping Prisma migrations because SKIP_PRISMA=1"
    return 0
  fi

  log "Running Prisma migrations..."
  (
    cd "$ROOT_DIR/backend"
    DATABASE_URL="$DATABASE_URL" npx prisma migrate dev
  )
}

main() {
  require_cmd curl
  require_cmd npm
  require_cmd npx

  mkdir -p "$STATE_DIR" "$LOG_DIR"

  ensure_postgres
  start_ollama_if_available

  ensure_npm_deps "$ROOT_DIR/pods/llm-pod" "llm-pod"
  ensure_npm_deps "$ROOT_DIR/backend" "backend"
  ensure_npm_deps "$ROOT_DIR/frontend" "frontend"
  ensure_voxcpm_env
  run_prisma_migrations

  # ── RAG enrichment sidecar (persistent, avoids cold-start per request) ──
  local rag_script="$ROOT_DIR/scripts/dev-up-rag.sh"
  if [[ -x "$rag_script" ]]; then
    log "Starting RAG enrichment sidecar..."
    "$rag_script" || warn "RAG enrichment failed to start — tours will use fallback mode (slower)"
  else
    warn "RAG enrichment script not found ($rag_script). Tours will use fallback mode (slower)."
  fi

  local ollama_url
  ollama_url="$(ollama_host_url)"

  start_managed "llm-pod" 3002 "$ROOT_DIR/pods/llm-pod" \
    env PORT=3002 OLLAMA_HOST="$ollama_url" OLLAMA_MODEL="$OLLAMA_MODEL" NARRATIVE_MODEL="$NARRATIVE_MODEL" NARRATIVE_BRIEF_ENABLED=true npm run dev
  wait_for_url "http://localhost:3002/health" "llm-pod" 90

  # Backend supervises on-demand VoxCPM2 after saving tour text.
  start_managed "backend" 3001 "$ROOT_DIR/backend" \
    env PORT=3001 NODE_ENV=development API_KEYS="$API_KEY" DATABASE_URL="$DATABASE_URL" \
      LLM_SERVICE_URL=http://localhost:3002 npm run dev
  wait_for_url "http://localhost:3001/health" "backend" 90

  # Only clean .next when we are about to start a fresh frontend process.
  # Deleting it while next dev is already running corrupts server chunk refs.
  clean_frontend_next

  local browser_access_host
  browser_access_host="$(browser_host)"

  start_managed "frontend" 3000 "$ROOT_DIR/frontend" \
    env NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://$browser_access_host:3001/api}" \
      NEXT_PUBLIC_API_KEY="$API_KEY" npm run dev
  wait_for_port 3000 "frontend" 90

  printf '\nStack is running.\n'
  printf 'Frontend:    http://%s:3000\n' "$browser_access_host"
  printf 'Backend:     http://%s:3001/health\n' "$browser_access_host"
  printf 'LLM pod:     http://localhost:3002/health\n'
  printf 'RAG enrich:  http://localhost:11435/health\n'
  printf 'VoxCPM2:     on demand from the completed tour\n'
  printf 'Logs:        %s\n' "$LOG_DIR"
  printf '\nStop managed services with: ./scripts/dev-down.sh\n'
}

main "$@"
