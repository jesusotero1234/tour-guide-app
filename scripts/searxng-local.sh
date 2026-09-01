#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly USER_STATE_HOME="${XDG_STATE_HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)/.local/state}"
readonly PRIVATE_STATE_ROOT="$USER_STATE_HOME/tour-guide-app"
readonly ENV_FILE="$PRIVATE_STATE_ROOT/searxng.env"
readonly SETTINGS_TEMPLATE="$SCRIPT_DIR/searxng-settings.yml"
readonly SETTINGS_FILE="$PRIVATE_STATE_ROOT/searxng-settings.yml"
readonly COMPOSE_FILE="$SCRIPT_DIR/searxng-local.compose.yaml"
readonly COMPOSE_PROJECT="tour-guide-searxng"
readonly BASE_URL="http://127.0.0.1:18081"
readonly PORT=18081
readonly FIRECRAWL_NETWORK="tour-guide-firecrawl-v2-8-0_backend"

log() {
  printf '[searxng-local] %s\n' "$*" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

usage() {
  printf 'Usage: %s {up|down|status}\n' "${0##*/}" >&2
  exit "${1:-1}"
}

require_commands() {
  local -a missing=()
  local command_name
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || missing+=("$command_name")
  done
  [[ ${#missing[@]} -eq 0 ]] || fail "missing commands: ${missing[*]}"
}

compose() {
  SEARXNG_SETTINGS_FILE="$SETTINGS_FILE" \
  PODMAN_COMPOSE_PROVIDER=podman-compose podman compose \
    --project-name "$COMPOSE_PROJECT" \
    --file "$COMPOSE_FILE" \
    "$@"
}

random_secret() {
  openssl rand -hex 32
}

ensure_env_file() {
  if [[ -f "$ENV_FILE" ]]; then
    [[ "$(stat -c '%a' "$ENV_FILE")" == "600" ]] \
      || fail "$ENV_FILE must have mode 0600"
    return
  fi

  mkdir -p -- "$PRIVATE_STATE_ROOT"
  chmod 0700 -- "$PRIVATE_STATE_ROOT"
  local searxng_secret
  searxng_secret=$(random_secret)
  umask 077
  {
    printf 'SEARXNG_SECRET=%s\n' "$searxng_secret"
  } > "$ENV_FILE"
  chmod 0600 -- "$ENV_FILE"
  log "Created ignored local configuration (secret values not displayed)"
}

read_env_value() {
  local key="$1"
  local line
  while IFS= read -r line; do
    if [[ "$line" == "$key="* ]]; then
      printf '%s' "${line#"$key="}"
      return 0
    fi
  done < "$ENV_FILE"
  return 1
}

render_settings() {
  local secret_key
  secret_key="${SEARXNG_SECRET:-}"

  if [[ -z "$secret_key" ]]; then
    secret_key="$(read_env_value "SEARXNG_SECRET" || true)"
  fi

  [[ -n "$secret_key" ]] || fail "SEARXNG_SECRET is not set; export it or edit $ENV_FILE"

  mkdir -p -- "$PRIVATE_STATE_ROOT"
  chmod 0700 -- "$PRIVATE_STATE_ROOT"

  [[ "$secret_key" != *$'\n'* && "$secret_key" != *$'\r'* ]] \
    || fail "SEARXNG_SECRET must be a single-line value"

  local secret_yaml
  secret_yaml="'${secret_key//\'/\'\'}'"

  local tmp_file
  tmp_file="$(mktemp -- "$SETTINGS_FILE.XXXXXX")"
  chmod 0600 -- "$tmp_file"

  local line secret_markers=0
  if ! while IFS= read -r line || [[ -n "$line" ]]; do
    case "$line" in
      '  secret_key: __SEARXNG_SECRET__')
        printf '  secret_key: %s\n' "$secret_yaml"
        secret_markers=$((secret_markers + 1))
        ;;
      *) printf '%s\n' "$line" ;;
    esac
  done < "$SETTINGS_TEMPLATE" > "$tmp_file"; then
    rm -f -- "$tmp_file"
    fail "Failed to render private SearXNG settings"
  fi

  if [[ "$secret_markers" -ne 1 ]] \
    || rg -q '__SEARXNG_SECRET__' "$tmp_file"; then
    rm -f -- "$tmp_file"
    fail "SearXNG settings template must contain the secret marker exactly once"
  fi

  mv -- "$tmp_file" "$SETTINGS_FILE"
  chmod 0600 -- "$SETTINGS_FILE"
}

assert_port_available() {
  if ss -ltnH "sport = :$PORT" | rg -q .; then
    fail "127.0.0.1:$PORT is already occupied"
  fi
}

search_json() {
  curl --silent --show-error \
    --connect-timeout 3 --max-time 10 \
    --get --data-urlencode 'q=test' --data-urlencode 'format=json' \
    "$BASE_URL/search" 2>/dev/null || true
}

wait_for_searxng() {
  local attempt json
  for attempt in $(seq 1 60); do
    json=$(search_json)
    if [[ -n "$json" ]] && jq -e '.results | type == "array"' <<<"$json" >/dev/null 2>&1; then
      return
    fi
    sleep 2
  done
  fail "SearXNG did not become ready within 120 seconds"
}

status() {
  require_commands curl jq
  local json
  json=$(search_json)
  if [[ -n "$json" ]] && jq -e '.results | type == "array"' <<<"$json" >/dev/null 2>&1; then
    log "SearXNG is up at $BASE_URL (JSON API responding)"
    return 0
  fi
  log "SearXNG is not responding at $BASE_URL; run '$0 up'"
  exit 1
}

up() {
  require_commands openssl podman podman-compose ss rg stat mktemp
  assert_port_available
  ensure_env_file

  render_settings

  if ! podman network exists "$FIRECRAWL_NETWORK" 2>/dev/null; then
    log "Firecrawl bridge network '$FIRECRAWL_NETWORK' not found"
    log "Start Firecrawl first: ./scripts/firecrawl-local.sh up"
    fail "SearXNG must join the Firecrawl network to be reachable as http://searxng:8080"
  fi
  log "Pulling and starting SearXNG on 127.0.0.1:$PORT (joining $FIRECRAWL_NETWORK)"
  compose up --detach
  log "Waiting for SearXNG JSON API"
  wait_for_searxng
  log "SearXNG is ready at $BASE_URL"
}

down() {
  require_commands podman podman-compose
  [[ -f "$ENV_FILE" ]] || fail "SearXNG local environment file does not exist"
  log "Stopping SearXNG without deleting volumes"
  compose down
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  status) status ;;
  -h|--help) usage 0 ;;
  *) usage 1 ;;
esac
