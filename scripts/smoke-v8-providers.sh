#!/usr/bin/env bash
set -Eeuo pipefail

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly PROJECT_ROOT="$(cd -- "$SCRIPT_DIR/.." && pwd -P)"
readonly USER_STATE_HOME="${XDG_STATE_HOME:-$(getent passwd "$(id -u)" | cut -d: -f6)/.local/state}"
readonly FIRECRAWL_ENV="$USER_STATE_HOME/tour-guide-app/firecrawl.env"
readonly FIRECRAWL_VERSION="v2.8.0"
readonly FIRECRAWL_SRC="$PROJECT_ROOT/.runtime/firecrawl/$FIRECRAWL_VERSION"
readonly FIRECRAWL_PROJECT="tour-guide-firecrawl-v2-8-0"
readonly FIRECRAWL_API_CONTAINER="${FIRECRAWL_PROJECT}_api_1"
readonly SEARXNG_URL="http://127.0.0.1:18081"
readonly FIRECRAWL_URL="http://127.0.0.1:3007/v2"

PASS_COUNT=0
FAIL_COUNT=0

log() {
  printf '[smoke-v8] %s\n' "$*" >&2
}

fail() {
  log "ERROR: $*"
  exit 1
}

pass() {
  printf '[ok]   %s\n' "$*"
  PASS_COUNT=$((PASS_COUNT + 1))
}

fail_check() {
  printf '[fail] %s\n' "$*"
  FAIL_COUNT=$((FAIL_COUNT + 1))
}

require_commands() {
  local -a missing=()
  local command_name
  for command_name in "$@"; do
    command -v "$command_name" >/dev/null 2>&1 || missing+=("$command_name")
  done
  [[ ${#missing[@]} -eq 0 ]] || fail "missing commands: ${missing[*]}"
}

post_firecrawl() {
  local endpoint="$1"
  local payload="$2"
  local output="$3"
  curl --silent --show-error \
    --connect-timeout 10 --max-time 120 \
    --header 'Content-Type: application/json' \
    --data "$payload" \
    --output "$output" \
    --write-out '%{http_code}' \
    "$FIRECRAWL_URL/$endpoint"
}

jq_ok() {
  local output="$1"
  local filter="$2"
  jq -e "$filter" "$output" >/dev/null 2>&1
}

check_searxng_json() {
  local output="$1"
  local status
  if ! status=$(curl --silent --show-error \
    --connect-timeout 10 --max-time 60 \
    --get \
    --data-urlencode 'q=Palacio de los Condes de Buenavista Málaga' \
    --data-urlencode 'language=es-ES' \
    --data-urlencode 'format=json' \
    --output "$output" --write-out '%{http_code}' \
    "$SEARXNG_URL/search"); then
    fail_check "SearXNG JSON search request failed"
    return
  fi

  if [[ "$status" != "200" ]]; then
    fail_check "SearXNG JSON search (HTTP $status); body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  if ! jq_ok "$output" '.results | type == "array" and length > 0'; then
    fail_check "SearXNG JSON search: results is not a non-empty array; body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  if ! jq_ok "$output" '
    [.results[] | select(
      .url == "https://www.wikidata.org/wiki/Q969308"
      and (
        (.engine? // "") == "mwmbl"
        or ((.engines? // []) | type == "array" and index("mwmbl") != null)
      )
    )] | length > 0
  '; then
    fail_check "SearXNG JSON search: no result with URL https://www.wikidata.org/wiki/Q969308 attributed to mwmbl; body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  if jq_ok "$output" '
    (.unresponsive_engines // []) | any(.[];
      if type == "array" then .[0] == "mwmbl"
      elif type == "object" then (.engine // .name // "") == "mwmbl"
      else . == "mwmbl"
      end
    )
  '; then
    fail_check "SearXNG JSON search: mwmbl present in unresponsive_engines; body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  pass "SearXNG JSON search: mwmbl returned the expected Wikidata result for Palacio de los Condes de Buenavista Málaga"
}

check_searxng_bing() {
  local output="$1"
  local status
  if ! status=$(curl --silent --show-error \
    --connect-timeout 10 --max-time 60 \
    --get \
    --data-urlencode 'q=Alcazaba de Málaga' \
    --data-urlencode 'language=es-ES' \
    --data-urlencode 'format=json' \
    --output "$output" --write-out '%{http_code}' \
    "$SEARXNG_URL/search"); then
    fail_check "SearXNG Bing keyless check: request failed"
    return
  fi

  if [[ "$status" != "200" ]]; then
    fail_check "SearXNG Bing keyless check (HTTP $status); body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  if ! jq_ok "$output" '.results | type == "array" and length > 0'; then
    fail_check "SearXNG Bing keyless check: results is not a non-empty array; body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  if ! jq_ok "$output" '
    [.results[] | select(
      (.url | startswith("https://"))
      and (
        (.engine? // "") == "bing"
        or ((.engines? // []) | type == "array" and index("bing") != null)
      )
      and (
        ((.title? // "") | ascii_downcase | contains("alcazaba"))
        or ((.url? // "") | ascii_downcase | contains("alcazaba"))
      )
    )] | length > 0
  '; then
    fail_check "SearXNG Bing keyless check: no HTTPS result attributed to bing containing alcazaba in title or URL; body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  if jq_ok "$output" '
    (.unresponsive_engines // []) | any(.[];
      if type == "array" then .[0] == "bing"
      elif type == "object" then (.engine // .name // "") == "bing"
      else . == "bing"
      end
    )
  '; then
    fail_check "SearXNG Bing keyless check: bing present in unresponsive_engines; body: $(head -c 200 "$output" 2>/dev/null || true)"
    return
  fi

  pass "SearXNG Bing keyless check: bing returned a relevant HTTPS result for Alcazaba de Málaga"
}

check_firecrawl_searxng_wiring() {
  local endpoint
  endpoint=$(podman exec "$FIRECRAWL_API_CONTAINER" sh -c 'echo "$SEARXNG_ENDPOINT"' 2>/dev/null | tr -d '\r\n ')
  if [[ "$endpoint" == "http://searxng:8080" ]]; then
    pass "Firecrawl wired to local SearXNG (SEARXNG_ENDPOINT=http://searxng:8080 in api container)"
  else
    fail_check "Firecrawl not wired to local SearXNG (container endpoint='$endpoint'); set SEARXNG_ENDPOINT=http://searxng:8080 and restart Firecrawl"
  fi
}

check_firecrawl_search() {
  local output="$1"
  local status
  status=$(post_firecrawl 'search' '{"query":"Palacio Real Madrid","limit":3}' "$output")
  if [[ "$status" == "200" ]] \
    && jq_ok "$output" '.success == true and (.data.web | type == "array")'; then
    pass "Firecrawl /v2/search returns web results"
  else
    fail_check "Firecrawl /v2/search (HTTP $status); body: $(head -c 200 "$output" 2>/dev/null || true)"
  fi
}

check_firecrawl_map() {
  local output="$1"
  local status
  status=$(post_firecrawl 'map' \
    '{"url":"https://www.barcelona.cat","search":"sagrada familia","limit":10}' \
    "$output")
  if [[ "$status" == "200" ]] \
    && jq_ok "$output" '.success == true and (.links | type == "array" and length > 0)'; then
    pass "Firecrawl /v2/map returns links (contract {success, links})"
  else
    fail_check "Firecrawl /v2/map (HTTP $status); body: $(head -c 200 "$output" 2>/dev/null || true)"
  fi
}

check_firecrawl_scrape_html() {
  local output="$1"
  local status
  status=$(post_firecrawl 'scrape' \
    '{"url":"https://www.patrimonionacional.es/visita/palacio-real-de-madrid","formats":["markdown"],"onlyMainContent":true}' \
    "$output")
  if [[ "$status" == "200" ]] \
    && jq_ok "$output" '.success == true and (.data.markdown | type == "string" and length > 100)'; then
    pass "Firecrawl /v2/scrape HTML -> Markdown"
  else
    fail_check "Firecrawl /v2/scrape HTML (HTTP $status); body: $(head -c 200 "$output" 2>/dev/null || true)"
  fi
}

# PDF capture depends on the PDF parser bundled in the running Firecrawl
# build (parsers.type == "pdf"). If this check fails, the provider does not
# support PDF and the backend must disable PDF capture; the V8 plan treats
# PDF as optional.
check_firecrawl_scrape_pdf() {
  local output="$1"
  local status
  status=$(post_firecrawl 'scrape' \
    '{"url":"https://www.patrimonionacional.es/sites/default/files/documents/palacio_real_visita_autoguiada__0.pdf","formats":["markdown"],"onlyMainContent":true,"parsers":[{"type":"pdf","maxPages":5}]}' \
    "$output")
  if [[ "$status" == "200" ]] \
    && jq_ok "$output" '.success == true and (.data.markdown | type == "string" and length > 100)'; then
    pass "Firecrawl /v2/scrape PDF (documented: requires PDF parser in provider)"
  else
    fail_check "Firecrawl /v2/scrape PDF (HTTP $status); body: $(head -c 200 "$output" 2>/dev/null || true)"
  fi
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
    "$FIRECRAWL_URL/scrape")
  if [[ "$status" =~ ^2 ]] && jq_ok "$output" '.success == true'; then
    fail_check "SSRF block missing: unsafe scrape unexpectedly succeeded: $url"
  else
    pass "SSRF block: $url (HTTP $status)"
  fi
}

check_cloud_isolation() {
  if grep -rqE 'api\.firecrawl\.dev' "$FIRECRAWL_SRC/apps/api/src" 2>/dev/null; then
    fail_check "api.firecrawl.dev referenced in $FIRECRAWL_SRC/apps/api/src"
  else
    pass "Firecrawl source has no api.firecrawl.dev references (cloud blocked by code)"
  fi

  local api_container
  api_container=$(podman ps --filter "label=io.podman.compose.project=$FIRECRAWL_PROJECT" \
    --format '{{.Names}}' | grep -E '_api_1$' || true)
  if [[ -z "$api_container" ]]; then
    fail_check "Firecrawl api container not running (project $FIRECRAWL_PROJECT)"
    return
  fi

  local env_hits log_hits
  env_hits=$(podman inspect "$api_container" --format '{{range .Config.Env}}{{println .}}{{end}}' \
    | grep -iE 'firecrawl\.dev' || true)
  if [[ -n "$env_hits" ]]; then
    fail_check "api container env points at firecrawl.dev: $(echo "$env_hits" | tr '\n' ' ')"
  else
    pass "api container env has no firecrawl.dev references"
  fi

  log_hits=$(podman logs --since 30m "$api_container" 2>&1 | grep -E 'api\.firecrawl\.dev' || true)
  if [[ -n "$log_hits" ]]; then
    fail_check "recent api logs reference api.firecrawl.dev"
  else
    pass "no api.firecrawl.dev in recent api logs (limitation: no egress interception; check is code + env + logs)"
  fi
}

main() {
  require_commands curl jq podman mktemp head
  local smoke_dir searxng_output searxng_bing_output firecrawl_output
  smoke_dir=$(mktemp -d)
  trap "rm -rf -- '$smoke_dir'" EXIT
  searxng_output="$smoke_dir/searxng.json"
  searxng_bing_output="$smoke_dir/searxng_bing.json"
  firecrawl_output="$smoke_dir/firecrawl.json"

  log "Checking SearXNG (provider de descubrimiento)"
  check_searxng_json "$searxng_output"
  check_searxng_bing "$searxng_bing_output"

  log "Checking Firecrawl (captura y map)"
  check_firecrawl_searxng_wiring
  check_firecrawl_search "$firecrawl_output"
  check_firecrawl_map "$firecrawl_output"
  check_firecrawl_scrape_html "$firecrawl_output"

  log "Checking Firecrawl PDF capture"
  check_firecrawl_scrape_pdf "$firecrawl_output"

  log "Checking SSRF protection"
  assert_scrape_rejected 'http://169.254.169.254/' "$firecrawl_output"
  assert_scrape_rejected 'http://127.0.0.1:3007/' "$firecrawl_output"

  log "Checking Firecrawl Cloud isolation"
  check_cloud_isolation

  printf '\n[smoke-v8] %d passed, %d failed\n' "$PASS_COUNT" "$FAIL_COUNT"
  [[ "$FAIL_COUNT" -eq 0 ]] || exit 1
}

main
