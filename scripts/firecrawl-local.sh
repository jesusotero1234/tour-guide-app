#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly FIRECRAWL_VERSION="v2.8.0"
readonly FIRECRAWL_REPOSITORY="https://github.com/firecrawl/firecrawl.git"
readonly RUNTIME_ROOT="$PROJECT_ROOT/.runtime/firecrawl"
readonly FIRECRAWL_DIR="$RUNTIME_ROOT/$FIRECRAWL_VERSION"
readonly USER_STATE_HOME="${XDG_STATE_HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)/.local/state}"
readonly PRIVATE_STATE_ROOT="$USER_STATE_HOME/tour-guide-app"
readonly ENV_FILE="$PRIVATE_STATE_ROOT/firecrawl.env"
readonly COMPOSE_OVERRIDE="$SCRIPT_DIR/firecrawl-local.compose.yaml"
readonly COMPOSE_PROJECT="tour-guide-firecrawl-v2-8-0"
readonly BASE_URL="http://127.0.0.1:3007/v2"
readonly PORT=3007

log() {
  printf '[firecrawl-local] %s\n' "$*" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

usage() {
  printf 'Usage: %s {up|down|smoke}\n' "${0##*/}" >&2
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
  (
    cd -- "$FIRECRAWL_DIR"
    PODMAN_COMPOSE_PROVIDER=podman-compose podman compose \
      --env-file "$ENV_FILE" \
      --project-name "$COMPOSE_PROJECT" \
      --file docker-compose.yaml \
      --file "$COMPOSE_OVERRIDE" \
      "$@"
  )
}

ensure_checkout() {
  mkdir -p -- "$RUNTIME_ROOT"
  if [[ ! -d "$FIRECRAWL_DIR/.git" ]]; then
    log "Cloning Firecrawl $FIRECRAWL_VERSION into ignored runtime state"
    git clone --depth 1 --branch "$FIRECRAWL_VERSION" \
      "$FIRECRAWL_REPOSITORY" "$FIRECRAWL_DIR"
  fi

  local expected_commit actual_commit
  expected_commit=$(git -C "$FIRECRAWL_DIR" rev-list -n 1 "$FIRECRAWL_VERSION")
  actual_commit=$(git -C "$FIRECRAWL_DIR" rev-parse HEAD)
  [[ -n "$expected_commit" && "$actual_commit" == "$expected_commit" ]] \
    || fail "runtime checkout is not exactly $FIRECRAWL_VERSION"
  [[ -z "$(git -C "$FIRECRAWL_DIR" status --porcelain --untracked-files=all)" ]] \
    || fail "runtime checkout has local modifications; Firecrawl must remain unmodified"
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
  local bull_key postgres_password rabbitmq_cookie
  bull_key=$(random_secret)
  postgres_password=$(random_secret)
  rabbitmq_cookie=$(random_secret)
  umask 077
  {
    printf 'PORT=127.0.0.1:3007\n'
    printf 'INTERNAL_PORT=3002\n'
    printf 'EXTRACT_WORKER_PORT=3004\n'
    printf 'WORKER_PORT=3005\n'
    printf 'NUM_WORKERS_PER_QUEUE=2\n'
    printf 'CRAWL_CONCURRENT_REQUESTS=2\n'
    printf 'MAX_CONCURRENT_JOBS=2\n'
    printf 'BROWSER_POOL_SIZE=2\n'
    printf 'BULL_AUTH_KEY=%s\n' "$bull_key"
    printf 'POSTGRES_USER=firecrawl\n'
    printf 'POSTGRES_PASSWORD=%s\n' "$postgres_password"
    printf 'POSTGRES_DB=postgres\n'
    printf 'POSTGRES_HOST=nuq-postgres\n'
    printf 'POSTGRES_PORT=5432\n'
    printf 'RABBITMQ_ERLANG_COOKIE=%s\n' "$rabbitmq_cookie"
    printf 'USE_DB_AUTHENTICATION=false\n'
    printf 'OPENAI_API_KEY=\n'
    printf 'OPENAI_BASE_URL=\n'
    printf 'MODEL_NAME=\n'
    printf 'MODEL_EMBEDDING_NAME=\n'
    printf 'OLLAMA_BASE_URL=\n'
    printf 'TEST_API_KEY=\n'
    printf 'PROXY_SERVER=\n'
    printf 'PROXY_USERNAME=\n'
    printf 'PROXY_PASSWORD=\n'
    printf 'SEARXNG_ENDPOINT=\n'
    printf 'SEARXNG_ENGINES=\n'
    printf 'SEARXNG_CATEGORIES=\n'
    printf 'SLACK_WEBHOOK_URL=\n'
    printf 'SUPABASE_ANON_TOKEN=\n'
    printf 'SUPABASE_URL=\n'
    printf 'SUPABASE_SERVICE_TOKEN=\n'
    printf 'SELF_HOSTED_WEBHOOK_URL=\n'
    printf 'BLOCK_MEDIA=true\n'
    printf 'LOGGING_LEVEL=info\n'
  } > "$ENV_FILE"
  chmod 0600 -- "$ENV_FILE"
  log "Created ignored local configuration (secret values not displayed)"
}

assert_port_available() {
  if ss -ltnH "sport = :$PORT" | rg -q .; then
    fail "127.0.0.1:$PORT is already occupied"
  fi
}

post_json() {
  local url="$1"
  local payload="$2"
  local output="$3"
  curl --fail-with-body --silent --show-error \
    --connect-timeout 10 --max-time 120 \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    --output "$output" \
    "$url"
}

wait_for_api() {
  local output="$1"
  local attempt
  for attempt in $(seq 1 60); do
    if post_json "$BASE_URL/search" '{"query":"Palacio Real Madrid","limit":1}' "$output" \
      && jq -e '.success == true and (.data.web | type == "array")' "$output" >/dev/null; then
      return
    fi
    sleep 2
  done
  fail "Firecrawl did not become ready within 120 seconds"
}

assert_scrape_rejected() {
  local url="$1"
  local output="$2"
  local status
  status=$(curl --silent --show-error \
    --connect-timeout 10 --max-time 75 \
    --header 'Content-Type: application/json' \
    --data "$(jq -cn --arg url "$url" '{url:$url,formats:["markdown"]}')" \
    --output "$output" \
    --write-out '%{http_code}' \
    "$BASE_URL/scrape")
  if [[ "$status" =~ ^2 ]] && jq -e '.success == true' "$output" >/dev/null 2>&1; then
    fail "unsafe scrape unexpectedly succeeded: $url"
  fi
}

smoke() {
  require_commands curl jq mktemp
  local smoke_dir search_output markdown_output pdf_output unsafe_output
  smoke_dir=$(mktemp -d)
  trap "rm -rf -- '$smoke_dir'" EXIT
  search_output="$smoke_dir/search.json"
  markdown_output="$smoke_dir/markdown.json"
  pdf_output="$smoke_dir/pdf.json"
  unsafe_output="$smoke_dir/unsafe.json"

  log "Waiting for $BASE_URL and checking search"
  wait_for_api "$search_output"

  log "Checking HTML scrape and Markdown output"
  post_json "$BASE_URL/scrape" \
    '{"url":"https://www.patrimonionacional.es/visita/palacio-real-de-madrid","formats":["markdown"],"onlyMainContent":true}' \
    "$markdown_output"
  jq -e '.success == true and (.data.markdown | type == "string" and length > 100)' \
    "$markdown_output" >/dev/null

  log "Checking a relevant official PDF without LLM extraction"
  post_json "$BASE_URL/scrape" \
    '{"url":"https://www.patrimonionacional.es/sites/default/files/documents/palacio_real_visita_autoguiada__0.pdf","formats":["markdown"],"onlyMainContent":true,"parsers":[{"type":"pdf","maxPages":5}]}' \
    "$pdf_output"
  jq -e '.success == true and (.data.markdown | type == "string" and length > 100)' \
    "$pdf_output" >/dev/null

  log "Checking SSRF and unsafe redirect rejection"
  assert_scrape_rejected 'http://127.0.0.1:3007/' "$unsafe_output"
  assert_scrape_rejected 'https://169.254.169.254/latest/meta-data/' "$unsafe_output"
  assert_scrape_rejected \
    'https://httpbin.dev/redirect-to?url=http%3A%2F%2F127.0.0.1%3A3007%2F' \
    "$unsafe_output"

  log "Smoke passed: search, Markdown, PDF, SSRF and redirect controls"
}

up() {
  require_commands git openssl podman podman-compose ss rg stat
  assert_port_available
  ensure_checkout
  ensure_env_file
  log "Building and starting Firecrawl on 127.0.0.1:$PORT"
  compose up --detach --build
  log "Firecrawl started; run '$0 smoke' before use"
}

down() {
  require_commands podman podman-compose
  [[ -d "$FIRECRAWL_DIR/.git" ]] || fail "Firecrawl runtime checkout does not exist"
  [[ -f "$ENV_FILE" ]] || fail "Firecrawl local environment file does not exist"
  log "Stopping Firecrawl without deleting volumes"
  compose down
}

case "${1:-}" in
  up) up ;;
  down) down ;;
  smoke) smoke ;;
  -h|--help) usage 0 ;;
  *) usage 1 ;;
esac
