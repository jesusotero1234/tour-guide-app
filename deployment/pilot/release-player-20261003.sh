#!/usr/bin/env bash
# Release 20261003-player: the start-anywhere player, the persistent audio engine, link clips, walking legs and the UI improvements
# of plans 05 and 06 (frontend only; the backend and the data are already live: release-regeneration-backend.sh and update-install.sh).
#
#   COMMIT=<commit with the final frontend> SHIP_LIST=<file> SERVER_SNAP=<dir> [DRY_RUN=1] deployment/pilot/release-player-20261003.sh
#
# The server does not hold a checkout of any commit: its frontend/src is a set of files of known older versions. SHIP_LIST has one path
# under frontend/ per line; a line starting with "-" means "delete this file". SERVER_SNAP is a copy of the server's frontend/ (src,
# package.json, package-lock.json, tsconfig.json) taken read-only just before: each file replaced or deleted must still have there the
# version it had in that copy, or nothing is touched. Copies the active release, replaces only those files, builds without root,
# switches `current` atomically and rolls back if the public checks fail. A failure before the switch deletes only the candidate.
set -euo pipefail

: "${COMMIT:?set COMMIT to the commit that holds the final frontend}"
: "${SHIP_LIST:?set SHIP_LIST to the file with the paths under frontend/}"
: "${SERVER_SNAP:?set SERVER_SNAP to the copy of the server frontend directory}"
HOST=nomuvia-admin@88.99.175.28
KEY="${KEY:-$HOME/.ssh/tour-guide-hetzner}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="$(date +%Y%m%d)-player"
git -C "$REPO" cat-file -e "$COMMIT^{commit}"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
: > "$WORK/base.sha256"; : > "$WORK/next.sha256"; : > "$WORK/delete.list"
count=0
while read -r entry; do
  [ -n "$entry" ] || continue
  if [ "${entry:0:1}" = "-" ]; then
    f="${entry:1}"
    echo "$(sha256sum "$SERVER_SNAP/$f" | cut -d' ' -f1)  frontend/$f" >> "$WORK/base.sha256"
    echo "frontend/$f" >> "$WORK/delete.list"
  else
    f="$entry"
    mkdir -p "$WORK/files/frontend/$(dirname "$f")"
    git -C "$REPO" show "$COMMIT:frontend/$f" > "$WORK/files/frontend/$f"
    echo "$(sha256sum "$WORK/files/frontend/$f" | cut -d' ' -f1)  frontend/$f" >> "$WORK/next.sha256"
    if [ -e "$SERVER_SNAP/$f" ]; then echo "$(sha256sum "$SERVER_SNAP/$f" | cut -d' ' -f1)  frontend/$f" >> "$WORK/base.sha256"
    else echo "NEW  frontend/$f" >> "$WORK/base.sha256"; fi
  fi
  count=$((count + 1))
done < "$SHIP_LIST"
[ "$count" -gt 0 ] || { echo "empty SHIP_LIST" >&2; exit 1; }
mkdir -p "$WORK/files/frontend"
tar czf "$WORK/release.tgz" -C "$WORK/files" frontend
echo "$COMMIT: $count files ($(wc -l < "$WORK/delete.list") to delete)"

SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes)
scp -q -i "$KEY" -o IdentitiesOnly=yes "$WORK/release.tgz" "$WORK/base.sha256" "$WORK/next.sha256" "$WORK/delete.list" "$HOST:/tmp/"

"${SSH[@]}" "$HOST" "DRY_RUN=${DRY_RUN:-0} NAME=$NAME bash -s" <<'REMOTE'
set -euo pipefail
OLD=$(sudo -n readlink -f /srv/tour-guide/current)
NEW=/srv/tour-guide/releases/$NAME
NODE=/opt/nomuvia-node/bin
step() { echo; echo "== $*"; }
fail() { echo "ERROR: $*"; exit 1; }

step "1/6 Checks (read only)"
sudo -n test -e "$NEW" && fail "$NEW already exists"
sudo -n test -d "$OLD/frontend/node_modules/next" || fail "next is missing in the frontend"
command -v python3 >/dev/null || fail "python3 is missing"
avail=$(df --output=avail -BM / | tail -1 | tr -dc 0-9); [ "$avail" -gt 5000 ] || fail "little free disk: ${avail} MiB"
while read -r digest file; do
  if [ "$digest" = NEW ]; then sudo -n test ! -e "$OLD/$file" || fail "$file exists on the server but is new"; continue; fi
  [ "$(sudo -n sha256sum "$OLD/$file" | cut -d' ' -f1)" = "$digest" ] || fail "the server has another version of $file"
done < /tmp/base.sha256
STAGE=$(mktemp -d); tar xzf /tmp/release.tgz -C "$STAGE"
(cd "$STAGE" && sha256sum -c /tmp/next.sha256 --quiet) || fail "the uploaded files do not match"
declare -A BEFORE
for lang in es en fr de it; do
  curl -s -o /tmp/nomuvia-catalog.json -m 150 "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=50" || fail "catalogue $lang does not answer"
  BEFORE[$lang]=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["total"])')
done
echo "OK: active release $OLD, ${avail} MiB free, files verified. Catalogue: es=${BEFORE[es]} en=${BEFORE[en]} fr=${BEFORE[fr]} de=${BEFORE[de]} it=${BEFORE[it]}"
[ "$DRY_RUN" = 1 ] && { echo "DRY_RUN: nothing was created."; exit 0; }

ACTIVATED=0
cleanup() { local s=$?; if [ "$s" -ne 0 ] && [ "$ACTIVATED" = 0 ] && sudo -n test -d "$NEW"; then echo "Aborted before the switch: removing the candidate $NEW"; sudo -n rm -rf -- "$NEW"; fi; }
trap cleanup EXIT

step "2/6 Candidate $NEW"
sudo -n cp -a "$OLD" "$NEW"
sudo -n rm -rf -- "$NEW/frontend/.next.before-paragraphs" "$NEW/frontend/.next.previous"
sudo -n tar xzf /tmp/release.tgz -C "$NEW"
while read -r file; do [ -n "$file" ] && sudo -n rm -f -- "$NEW/$file"; done < /tmp/delete.list

step "3/6 Build as nomuvia-admin (no root)"
sudo -n chown -R nomuvia-admin:tour-pilot "$NEW"
sudo -n systemd-run --quiet --wait --pipe --collect --uid=nomuvia-admin --gid=tour-pilot \
  -p WorkingDirectory="$NEW/frontend" -p EnvironmentFile=/etc/tour-guide/frontend.env -E PATH="$NODE:/usr/bin:/bin" \
  "$NODE/npm" run build
sudo -n chown -R root:tour-pilot "$NEW"; sudo -n chmod -R g+rX "$NEW"
[ "$(sudo -n cat "$NEW/frontend/.next/BUILD_ID")" != "$(sudo -n cat "$OLD/frontend/.next/BUILD_ID")" ] || fail "the frontend was not rebuilt"
sudo -n grep -rqs 'Empezar aquí' "$NEW/frontend/.next/server" || fail "the built frontend does not contain the new player"
echo "OK: frontend built"

rollback() {
  echo "FAILED: $*. Back to $OLD"
  sudo -n ln -sfn "$OLD" /srv/tour-guide/current.next; sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
  sudo -n systemctl restart nomuvia-frontend
  echo "Reverted. The candidate stays in $NEW for inspection."
  exit 1
}

step "4/6 Switch"
ACTIVATED=1
sudo -n ln -sfn "$NEW" /srv/tour-guide/current.next; sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
sudo -n systemctl restart nomuvia-frontend
for _ in $(seq 1 30); do sleep 2; systemctl is-active --quiet nomuvia-backend && systemctl is-active --quiet nomuvia-frontend && curl -s -o /dev/null -m 5 http://127.0.0.1:3000/ && break; done
systemctl is-active --quiet nomuvia-backend || rollback "backend inactive"
systemctl is-active --quiet nomuvia-frontend || rollback "frontend inactive"

step "5/6 Public checks: catalogue, tour page, audio, link clips and walking legs"
for lang in es en fr de it; do
  out=$(curl -s -o /tmp/nomuvia-catalog.json -m 150 -w '%{http_code} %{time_total}' "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=200&view=summary") || rollback "catalogue $lang did not answer"
  [ "${out%% *}" = 200 ] || rollback "catalogue $lang HTTP ${out%% *}"
  read -r total got < <(python3 -c 'import json;d=json.load(open("/tmp/nomuvia-catalog.json"))["data"];print(d["total"],len(d["tours"]))')
  echo "catalogue $lang: ${out#* } s, total $total, received $got"
  [ "$total" = "${BEFORE[$lang]}" ] || rollback "catalogue $lang has $total tours, before ${BEFORE[$lang]}"
  [ "$got" = "$total" ] || rollback "catalogue $lang returned $got of $total in one request"
done
curl -s -o /tmp/nomuvia-catalog.json -m 150 "https://nomuvia.com/api/backend/tours?language=es&readyOnly=true&limit=200&view=summary" || rollback "catalogue es did not answer"
id=$(python3 -c 'import json;ts=json.load(open("/tmp/nomuvia-catalog.json"))["data"]["tours"];print([t for t in ts if t["city"]=="Valencia"][0]["id"])')
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://nomuvia.com/tours); echo "/tours: HTTP $code"; [ "$code" = 200 ] || rollback "/tours HTTP $code"
curl -s -m 60 -o /tmp/nomuvia-tour.html -w '%{http_code}\n' "https://nomuvia.com/tours/$id" | grep -q '^200$' || rollback "tour page /tours/$id does not answer 200"
grep -q '<h1' /tmp/nomuvia-tour.html || rollback "the tour page has no title in the first HTML"
curl -s -m 60 -o /tmp/nomuvia-audio.json "https://nomuvia.com/api/backend/tours/$id/audio" || rollback "audio state did not answer"
read -r stop_url cue_url < <(python3 - <<'PY'
import json
a = json.load(open('/tmp/nomuvia-audio.json'))
urls = a['audioUrls']
first = next(iter(urls.values())) if isinstance(urls, dict) else urls[0]
cue = a['cues']['finish']['audioUrl']
print(first, cue)
PY
) || rollback "the audio state has no link clips"
for u in "$stop_url" "$cue_url"; do
  code=$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -w '%{http_code}' "https://nomuvia.com$u"); echo "$u: HTTP $code"
  [ "$code" = 206 ] || rollback "$u answered HTTP $code"
done
code=$(curl -s -o /tmp/nomuvia-legs.json -m 30 -w '%{http_code}' "https://nomuvia.com/api/backend/tours/$id/walking-legs"); echo "walking-legs: HTTP $code"
[ "$code" = 200 ] || rollback "walking-legs answered HTTP $code"

step "6/6 Done"
echo "Active release: $(sudo -n readlink -f /srv/tour-guide/current). Previous, to revert: $OLD"
rm -rf "$STAGE" /tmp/nomuvia-catalog.json /tmp/nomuvia-tour.html /tmp/nomuvia-audio.json /tmp/nomuvia-legs.json /tmp/release.tgz /tmp/base.sha256 /tmp/next.sha256 /tmp/delete.list
REMOTE
