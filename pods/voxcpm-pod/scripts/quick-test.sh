#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3006}"

curl -s "$BASE_URL/healthz"
printf '\n'

curl -s -X POST "$BASE_URL/tts/generate" \
  -H 'Content-Type: application/json' \
  -d '{"text":"Welcome to this history walking tour of Valencia.","language":"en"}'
printf '\n'
