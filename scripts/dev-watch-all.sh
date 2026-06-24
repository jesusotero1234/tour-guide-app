#!/bin/bash
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
REPO_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
LOG_DIR="$REPO_ROOT/.dev-logs"
POD_LOG_FILE="$LOG_DIR/pods-dev.log"
FRONTEND_LOG_FILE="$LOG_DIR/frontend-dev.log"

PIDS=()
COMPOSE_CMD=()

log_info() {
  printf '[%s] INFO: %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*" >&2
}

log_error() {
  printf '[%s] ERROR: %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*" >&2
}

log_warn() {
  printf '[%s] WARN: %s\n' "$(date +'%Y-%m-%d %H:%M:%S')" "$*" >&2
}

ollama_host_url() {
  if [[ -n "${OLLAMA_HOST:-}" ]]; then
    printf '%s' "$OLLAMA_HOST"
    return 0
  fi

  # In this workspace Ollama commonly runs on Windows while the stack runs in WSL.
  # From WSL, the Windows host is usually the default gateway.
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

cleanup() {
  log_info "Stopping foreground watchers..."

  for pid in "${PIDS[@]}"; do
    if kill -0 "$pid" 2>/dev/null; then
      kill -TERM "$pid" 2>/dev/null || true
    fi
  done

  for pid in "${PIDS[@]}"; do
    wait "$pid" 2>/dev/null || true
  done

  if [[ "${STOP_STACK_ON_EXIT:-0}" == "1" && ${#COMPOSE_CMD[@]} -gt 0 ]]; then
    log_info "STOP_STACK_ON_EXIT=1, stopping dev containers..."
    (cd "$REPO_ROOT" && "${COMPOSE_CMD[@]}" down) || true
  else
    log_info "Dev containers are still running. Use ./scripts/dev-down.sh to stop them."
  fi
}

trap cleanup EXIT INT TERM

check_command() {
  local -r command_name="$1"

  if ! command -v "$command_name" >/dev/null 2>&1; then
    log_error "Missing required command: $command_name"
    exit 1
  fi
}

check_command podman
check_command npm
check_command ip
check_command ss

if command -v podman-compose >/dev/null 2>&1; then
  COMPOSE_CMD=(podman-compose -f docker-compose.dev.yml)
elif podman compose version >/dev/null 2>&1; then
  COMPOSE_CMD=(podman compose -f docker-compose.dev.yml)
else
  log_error "Missing podman-compose or podman compose."
  exit 1
fi

if [[ ! -f "$REPO_ROOT/docker-compose.dev.yml" ]]; then
  log_error "docker-compose.dev.yml not found at repo root."
  exit 1
fi

if [[ ! -f "$REPO_ROOT/frontend/package.json" ]]; then
  log_error "frontend/package.json not found."
  exit 1
fi

mkdir -p "$LOG_DIR"
mkdir -p "$REPO_ROOT/backend/data/audio"
: > "$POD_LOG_FILE"
: > "$FRONTEND_LOG_FILE"

export OLLAMA_HOST
OLLAMA_HOST="$(ollama_host_url)"
export OLLAMA_MODEL="${OLLAMA_MODEL:-gemma4:26b}"
if curl -fsS -m 3 "$OLLAMA_HOST/api/tags" >/dev/null 2>&1; then
  log_info "Ollama available at $OLLAMA_HOST using model $OLLAMA_MODEL"
else
  log_warn "Ollama is not reachable at $OLLAMA_HOST. Tour narration will fall back unless Windows Ollama is started and reachable."
fi

services=(llm-pod tts-pod supabase-pod verification-pod description-pod backend)
if ss -ltn | grep -Eq '(^|[[:space:]])127\.0\.0\.1:5432[[:space:]]|(^|[[:space:]])0\.0\.0\.0:5432[[:space:]]|(^|[[:space:]])\[::\]:5432[[:space:]]|(^|[[:space:]]):::5432[[:space:]]'; then
  log_warn "Port 5432 is already in use; skipping postgres-local."
else
  services=(postgres-local "${services[@]}")
fi

stream_pod_log_snapshots() {
  local interval="${POD_LOG_POLL_SECONDS:-5}"
  local first_pass=true
  local service=""
  local container_name=""

  while true; do
    for service in "${services[@]}"; do
      container_name="tour-guide-app_${service}_1"
      if ! podman container exists "$container_name" >/dev/null 2>&1; then
        continue
      fi

      if [[ "$first_pass" == "true" ]]; then
        podman logs --tail 120 "$container_name" 2>&1 | sed "s/^/[$service] /" || true
      else
        podman logs --since "${interval}s" "$container_name" 2>&1 | sed "s/^/[$service] /" || true
      fi
    done

    first_pass=false
    sleep "$interval"
  done
}

log_info "Starting backend and pods with hot reload..."
(cd "$REPO_ROOT" && "${COMPOSE_CMD[@]}" up -d --build --force-recreate "${services[@]}")

log_info "Streaming pod log snapshots to $POD_LOG_FILE"
stream_pod_log_snapshots >>"$POD_LOG_FILE" 2>&1 &
PIDS+=("$!")

log_info "Starting frontend dev server with polling enabled..."
(
  cd "$REPO_ROOT/frontend"
  CHOKIDAR_USEPOLLING="${CHOKIDAR_USEPOLLING:-true}" \
  WATCHPACK_POLLING="${WATCHPACK_POLLING:-true}" \
  npm run dev
) >>"$FRONTEND_LOG_FILE" 2>&1 &
PIDS+=("$!")

log_info "Frontend: http://localhost:3000"
log_info "Backend:  http://localhost:3001"
log_info "Showing combined logs. Press Ctrl+C to stop log/frontend watchers."

tail -n +1 -f "$POD_LOG_FILE" "$FRONTEND_LOG_FILE" &
PIDS+=("$!")

wait
