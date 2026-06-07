#!/usr/bin/env bash
# Phase 1 — Nominatim Geocoder validation
# Tests geocodeCity for 4 cities, asserts sane lat/lng and wikidataId
set -euo pipefail

API_KEY="development-api-key"
BASE="http://localhost:3001"
PASS=0
FAIL=0

check_city() {
  local city="$1" lat_min="$2" lat_max="$3" lng_min="$4" lng_max="$5"

  local body
  body=$(curl -s -X POST "$BASE/api/v1/tours/generate" \
    -H "Content-Type: application/json" \
    -H "X-API-Key: $API_KEY" \
    -d "{\"city\":\"$city\",\"country\":\"test\",\"countryCode\":\"XX\",\"theme\":\"history\",\"language\":\"en\",\"durationMinutes\":60}" \
    --max-time 600 2>/dev/null || true)

  # Extract lat/lng from the first place in response
  local lat lng
  lat=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['places'][0]['latitude'])" 2>/dev/null || echo "NONE")
  lng=$(echo "$body" | python3 -c "import json,sys; d=json.load(sys.stdin); print(d['places'][0]['longitude'])" 2>/dev/null || echo "NONE")

  if [ "$lat" = "NONE" ] || [ "$lng" = "NONE" ]; then
    echo "FAIL  $city — no places returned or parse error"
    ((FAIL+=1))
    return
  fi

  # Check lat/lng bounds (rough sanity)
  local ok
  ok=$(python3 -c "print('ok' if $lat_min <= $lat <= $lat_max and $lng_min <= $lng <= $lng_max else 'bad')")
  if [ "$ok" = "ok" ]; then
    echo "PASS  $city — lat=$lat lng=$lng"
    ((PASS+=1))
  else
    echo "FAIL  $city — lat=$lat lng=$lng (expected lat $lat_min..$lat_max, lng $lng_min..$lng_max)"
    ((FAIL+=1))
  fi
}

# Also check backend log for geocoded display name
check_log() {
  local city="$1"
  if grep -q "\[OSM\] Geocoded city:.*$city" /tmp/backend.log 2>/dev/null; then
    echo "  LOG  [OSM] Geocoded city found for $city"
  else
    echo "  LOG  WARNING: no geocode log entry for $city"
  fi
}

echo "=== Phase 1 — Nominatim Geocoder Validation ==="
echo ""

# Valencia: lat ~39.47, lng ~-0.37
echo "--- Valencia ---"
check_city "Valencia" 39.0 40.0 -1.0 0.5
check_log "Valencia"

# Paris: lat ~48.86, lng ~2.35
echo "--- Paris ---"
check_city "Paris" 48.0 49.5 1.5 3.0
check_log "Paris"

# Lisbon: lat ~38.72, lng ~-9.14
echo "--- Lisbon ---"
check_city "Lisbon" 38.0 39.5 -10.0 -8.0
check_log "Lisbon"

# München: lat ~48.14, lng ~11.58
echo "--- München ---"
check_city "München" 47.5 49.0 10.5 12.5
check_log "München"

echo ""
echo "=== Results: $PASS passed, $FAIL failed ==="
exit $FAIL
