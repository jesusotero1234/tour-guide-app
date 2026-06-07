#!/usr/bin/env bash
# Phase 2 — Overpass POI Fetcher validation
# Tests that Paris returns >=5 raw POIs for each of the 4 MVP themes
set -euo pipefail

API_KEY="development-api-key"
BASE="http://localhost:3001"
PASS=0
FAIL=0

check_theme() {
  local theme="$1"

  # Truncate relevant log section
  local before_count
  before_count=$(grep -c "\[OSM\] Raw POIs:" /tmp/backend.log 2>/dev/null || echo "0")

  local body http_code
  body=$(curl -s -w "\n%{http_code}" -X POST "$BASE/api/v1/tours/generate" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "{\"city\":\"Paris\",\"country\":\"France\",\"countryCode\":\"FR\",\"theme\":\"$theme\",\"language\":\"en\",\"durationMinutes\":60}" \
    --max-time 600 2>/dev/null || echo "000")

  http_code=$(echo "$body" | tail -1)

  # Find the new raw POI count in the log
  local raw_pois
  raw_pois=$(grep "\[OSM\] Raw POIs:" /tmp/backend.log 2>/dev/null | tail -1 | grep -oP '\d+' || echo "0")

  if [ "$http_code" = "201" ] && [ "$raw_pois" -ge 5 ]; then
    echo "PASS  Paris/$theme — HTTP $http_code, raw POIs: $raw_pois"
    ((PASS+=1))
  elif [ "$http_code" = "422" ]; then
    echo "FAIL  Paris/$theme — HTTP 422 CITY_NOT_AVAILABLE (raw POIs: $raw_pois, <5 after ranking)"
    ((FAIL+=1))
  else
    echo "FAIL  Paris/$theme — HTTP $http_code, raw POIs: $raw_pois (need >=5)"
    ((FAIL+=1))
  fi

  # Rate limit: Nominatim needs 1s between requests
  sleep 2
}

echo "=== Phase 2 — Overpass POI Fetcher Validation ==="
echo "City: Paris, checking 4 MVP themes"
echo ""

check_theme "history"
check_theme "architecture"
check_theme "food"
check_theme "art"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
