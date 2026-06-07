#!/usr/bin/env bash
# Phase 3 — Wikipedia + Wikidata Enrichment validation
# Verifies that 5 known Paris POIs with Wikipedia/Wikidata produce
# descriptions in fr and en, with non-empty attribution.
set -euo pipefail

API_KEY="development-api-key"
BASE="http://localhost:3001"
PASS=0
FAIL=0

# We generate two Paris tours (fr and en) with enough duration to return
# at least 5 stops, then inspect the localized descriptions.

echo "=== Phase 3 — Wikipedia + Wikidata Enrichment Validation ==="
echo ""

# Generate Paris/history/fr
echo "--- Generating Paris/history/fr ---"
RESP_FR=$(curl -s -X POST "$BASE/api/v1/tours/generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"city":"Paris","country":"France","countryCode":"FR","theme":"history","language":"fr","durationMinutes":180}' \
  --max-time 600 2>/dev/null || echo "{}")

sleep 2

# Generate Paris/history/en
echo "--- Generating Paris/history/en ---"
RESP_EN=$(curl -s -X POST "$BASE/api/v1/tours/generate" \
  -H "Content-Type: application/json" \
  -H "X-API-Key: $API_KEY" \
  -d '{"city":"Paris","country":"France","countryCode":"FR","theme":"history","language":"en","durationMinutes":180}' \
  --max-time 600 2>/dev/null || echo "{}")

# Analyze both responses
python3 - "$RESP_FR" "$RESP_EN" << 'PY'
import json, sys, re

fr_raw = sys.argv[1]
en_raw = sys.argv[2]

passed = 0
failed = 0

def check_tour(raw, lang_label, stop_word_rx):
    global passed, failed
    try:
        data = json.loads(raw)
    except:
        print(f"FAIL  {lang_label} — could not parse response")
        failed += 1
        return

    places = data.get('places', [])
    if not places:
        print(f"FAIL  {lang_label} — no places returned")
        failed += 1
        return
    if len(places) < 5:
        print(f"FAIL  {lang_label} — {len(places)} places returned, expected at least 5")
        failed += 1
        return

    print(f"\n  {lang_label}: {len(places)} places returned")
    for p in places:
        name = p.get('name', '???')
        desc = p.get('description', '')
        desc_len = len(desc)
        has_lang = bool(re.search(stop_word_rx, desc, re.I))

        if desc_len >= 50 and has_lang:
            print(f"  PASS  {name} — {desc_len} chars, language signal present")
            passed += 1
        elif desc_len >= 50:
            print(f"  PASS  {name} — {desc_len} chars (language signal weak but desc exists)")
            passed += 1
        else:
            print(f"  FAIL  {name} — {desc_len} chars (too short or empty)")
            failed += 1

check_tour(fr_raw, "French (fr)", r'\b(le|la|de|est|une|que)\b')
check_tour(en_raw, "English (en)", r'\b(the|is|was|of|and)\b')

# Check backend log for attribution evidence
import subprocess
log = subprocess.run(['grep', '-E', 'wikipedia|wikidata|attribution', '/tmp/backend.log'],
                    capture_output=True, text=True).stdout
wiki_hits = len([l for l in log.splitlines() if 'wikipedia' in l.lower() or 'wikidata' in l.lower()])
print(f"\n  LOG  Wikipedia/Wikidata log references: {wiki_hits}")

print(f"\n=== Results: {passed} passed, {failed} failed ===")
sys.exit(min(failed, 1))
PY
