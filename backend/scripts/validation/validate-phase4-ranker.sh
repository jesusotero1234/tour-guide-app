#!/usr/bin/env bash
# Phase 4 — Selection + Ranking validation
# Runs Valencia/history ranking and outputs the top-N for eyeball check.
set -euo pipefail

API_KEY="development-api-key"
BASE="http://localhost:3001"

echo "=== Phase 4 — Selection + Ranking Validation ==="
echo ""
echo "Generating Valencia/history/en/60 and inspecting ranked POI output..."
echo ""

RESP=$(curl -s -X POST "$BASE/api/v1/tours/generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"city":"Valencia","country":"Spain","countryCode":"ES","theme":"history","language":"en","durationMinutes":60}' \
  --max-time 600 2>/dev/null || echo "{}")

echo "--- Backend Log (OSM pipeline) ---"
grep -E "\[OSM\]|Ranked|Raw POIs|Geocoded" /tmp/backend.log 2>/dev/null | tail -20 || true
echo ""

echo "--- Response places (ranked and route-composed) ---"
python3 - "$RESP" << 'PY'
import json, sys

raw = sys.argv[1]
try:
    data = json.loads(raw)
except:
    print("FAIL — could not parse response")
    sys.exit(1)

places = data.get('places', [])
if not places:
    print("FAIL — no places returned")
    sys.exit(1)

print(f"Selected {len(places)} stops (from ranked candidates):\n")
print(f"{'#':<3} {'Name':<50} {'Lat':<12} {'Lng':<12} {'Words':<6}")
print("-" * 85)
for i, p in enumerate(places):
    name = p.get('name', '???')[:48]
    lat = p.get('latitude', 0)
    lng = p.get('longitude', 0)
    words = len((p.get('description') or '').split())
    print(f"{i+1:<3} {name:<50} {lat:<12.6f} {lng:<12.6f} {words:<6}")

print(f"\n--- Eyeball check ---")
print("Q: Are these sensible history POIs in Valencia?")
print("Q: Are coordinates clustered around lat ~39.47, lng ~-0.37?")
print("Q: Is the ranking diverse (not all the same type)?")

# Automated sanity checks
lat_ok = all(38.5 < p.get('latitude', 0) < 40.5 for p in places)
lng_ok = all(-1.5 < p.get('longitude', 0) < 0.5 for p in places)
count_ok = len(places) >= 3

results = []
if lat_ok:
    results.append("PASS  latitude range")
else:
    results.append("FAIL  latitude out of Valencia range")
if lng_ok:
    results.append("PASS  longitude range")
else:
    results.append("FAIL  longitude out of Valencia range")
if count_ok:
    results.append(f"PASS  stop count ({len(places)} >= 3)")
else:
    results.append(f"FAIL  stop count ({len(places)} < 3)")

print("\n--- Automated checks ---")
for r in results:
    print(f"  {r}")

passed = sum(1 for r in results if r.startswith("PASS"))
failed = sum(1 for r in results if r.startswith("FAIL"))
print(f"\n=== Results: {passed} passed, {failed} failed ===")
sys.exit(min(failed, 1))
PY
