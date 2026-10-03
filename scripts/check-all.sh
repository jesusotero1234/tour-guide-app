#!/usr/bin/env bash
# Common check for every work package of docs/plans/20261001-audio-paradas-ui-backend.
# No GPU, no network, no writes outside a temporary directory (and the gitignored caches of the tools).
# Exit code 0 means: no failure outside scripts/check-all.known-failures.txt, and no known failure that now passes.
set -u
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
KNOWN="$ROOT/scripts/check-all.known-failures.txt"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT
export PYTHONDONTWRITEBYTECODE=1 CI=1
failed=()
step() { echo; echo "=== $1 ==="; }
run() { local name="$1"; shift; step "$name"; if "$@"; then echo "ok: $name"; else echo "FAILED: $name"; failed+=("$name"); fi; }
known() { grep -E "^$1 " "$KNOWN" | sed -E "s/^$1 //" | sort -u; }

# Compares the failing identifiers in $2 (one per line) with the known list of kind $1.
compare() {
  local kind="$1" actual="$2" unexpected obsolete
  unexpected="$(comm -23 <(sort -u "$actual") <(known "$kind") || true)"
  obsolete="$(comm -13 <(sort -u "$actual") <(known "$kind") || true)"
  [ -z "$unexpected" ] || { echo "NEW $kind failures:"; echo "$unexpected" | sed 's/^/  /'; failed+=("$kind: new failures"); }
  [ -z "$obsolete" ] || { echo "Known $kind failures that now PASS (remove them from $KNOWN):"; echo "$obsolete" | sed 's/^/  /'; failed+=("$kind: obsolete known failures"); }
  [ -z "$unexpected$obsolete" ] && echo "ok: $kind failures match the known list ($(wc -l < <(sort -u "$actual")) known)"
}

# --- backend: types ---
run "backend tsc (src)" bash -c "cd '$ROOT/backend' && npx tsc --noEmit"
run "backend tsc (generation worker)" bash -c "cd '$ROOT/backend' && npx tsc --noEmit -p tsconfig.generation-worker.json"

# --- backend: Jest (OverpassCoordinator.integration writes into backend/tmp, so it is skipped) ---
step "backend jest"
( cd "$ROOT/backend" && npx jest --testPathIgnorePatterns 'OverpassCoordinator.integration' --json --outputFile="$TMP/jest.json" >"$TMP/jest.log" 2>&1 )
if [ ! -s "$TMP/jest.json" ]; then echo "FAILED: jest produced no report"; tail -20 "$TMP/jest.log"; failed+=("backend jest: no report")
else
  python3 - "$TMP/jest.json" "$ROOT/backend/" > "$TMP/jest-failing.txt" <<'PY'
import json, sys
data, root = json.load(open(sys.argv[1])), sys.argv[2]
for r in data["testResults"]:
    if r["status"] == "failed": print(r["name"].replace(root, ""))
PY
  # A suite that fails only under parallel load (shared temp directories) is retried alone once.
  : > "$TMP/jest-real.txt"
  while read -r suite; do
    [ -n "$suite" ] || continue
    if grep -qxF "$suite" <(known jest); then echo "$suite" >> "$TMP/jest-real.txt"; continue; fi
    if ( cd "$ROOT/backend" && npx jest "$suite" >/dev/null 2>&1 ); then echo "flaky under parallel load, passes alone: $suite"; else echo "$suite" >> "$TMP/jest-real.txt"; fi
  done < "$TMP/jest-failing.txt"
  compare jest "$TMP/jest-real.txt"
fi

# --- backend: Python and Node tests of the batch pipeline ---
run "backend scripts/admin python" bash -c "cd '$ROOT/backend/scripts/admin' && python3 -m unittest discover -p 'test_*.py' >'$TMP/admin.log' 2>&1 || { tail -30 '$TMP/admin.log'; exit 1; }"
run "backend node --test" bash -c "cd '$ROOT/backend' && node -r ts-node/register/transpile-only --test scripts/validation/*.test.cjs scripts/admin/test_preparation_attempt.cjs scripts/admin/test_speech_stage.cjs >'$TMP/node.log' 2>&1 || { tail -30 '$TMP/node.log'; exit 1; }"

# --- voxcpm pod: CPU-only tests ---
step "voxcpm pod tests"
: > "$TMP/voxcpm-failing.txt"
PY="${VOXCPM_PYTHON:-$ROOT/pods/voxcpm-pod/.venv/bin/python}"; [ -x "$PY" ] || PY=python3
for t in "$ROOT"/pods/voxcpm-pod/scripts/test-tour-audio-input.py "$ROOT"/pods/voxcpm-pod/scripts/test-sanitize.py "$ROOT"/pods/voxcpm-pod/scripts/test-speech-normalize.py "$ROOT"/pods/voxcpm-pod/scripts/test-speech-whisper-check.py; do
  [ -f "$t" ] || continue
  out="$( cd "$ROOT/pods/voxcpm-pod" && "$PY" "$t" 2>&1 )"; code=$?
  echo "$(basename "$t"): exit $code"
  if [ $code -ne 0 ]; then
    names="$(echo "$out" | sed -nE 's/^(FAIL|ERROR): ([A-Za-z0-9_]+) .*/\2/p')"
    if [ -n "$names" ]; then echo "$names" >> "$TMP/voxcpm-failing.txt"; else echo "$out" | tail -15; failed+=("voxcpm: $(basename "$t") crashed"); fi
  fi
done
compare voxcpm "$TMP/voxcpm-failing.txt"

# --- frontend ---
run "frontend tsc" bash -c "cd '$ROOT/frontend' && npx tsc --noEmit"
run "frontend unit tests" bash -c "cd '$ROOT/frontend' && node --test scripts/test-route-order.cjs scripts/test-tour-state.cjs scripts/test-analytics.cjs scripts/test-analytics-session.cjs"
run "frontend lint" bash -c "cd '$ROOT/frontend' && npm run lint >'$TMP/lint.log' 2>&1 || { tail -30 '$TMP/lint.log'; exit 1; }"

echo
if [ ${#failed[@]} -eq 0 ]; then echo "CHECK-ALL: GREEN"; exit 0; fi
echo "CHECK-ALL: RED"; printf ' - %s\n' "${failed[@]}"; exit 1
