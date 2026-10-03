#!/usr/bin/env bash
# Backend release for plan 04 section 10.2 step 1: the code of plans 02 and 03 plus the additive migration
# 20261001220000_spoken_text_cues_legs. It changes no published data: spokenText null uses the current text, tours without
# orderFlexible ask for no link clips and the fingerprints do not change (regression tests of plan 02 section 7.5).
#
# NOT YET RUN AGAINST THE SERVER. It needs the user's explicit authorisation (SSH, production write). A first run with DRY_RUN=1
# only reads: it checks the server and the files and stops before creating anything.
#
#   COMMIT=<commit with the final backend> [BASE=766286f] [DRY_RUN=1] deployment/pilot/release-regeneration-backend.sh
#
# What it does, in order: verifies that the server holds the BASE version of every file it will replace; builds a candidate
# release as nomuvia-admin (prisma generate + tsc, no root); takes a pg_dump; runs `prisma migrate deploy` with migration.env
# (before the switch, because the new Prisma client needs the new columns); grants the app role SELECT on the new tables;
# switches `current` atomically; checks the public catalogue (216 tours) and rolls back to the old release if anything fails.
# The migration is additive, so the old release keeps working with it. Its inverse is migrations/.../down.sql.
set -euo pipefail

: "${COMMIT:?set COMMIT to the commit that holds the final backend}"
BASE=${BASE:-766286f}
HOST=nomuvia-admin@88.99.175.28
KEY="${KEY:-$HOME/.ssh/tour-guide-hetzner}"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
NAME="$(date +%Y%m%d)-spoken-text-cues"

git -C "$REPO" cat-file -e "$COMMIT^{commit}" && git -C "$REPO" cat-file -e "$BASE^{commit}"
mapfile -t CHANGES < <(git -C "$REPO" diff --name-status "$BASE" "$COMMIT" -- backend/src backend/prisma)
FILES=(); NEWFILES=()
for line in "${CHANGES[@]}"; do
  status=${line%%$'\t'*}; file=${line#*$'\t'}
  case "$status" in
    M) FILES+=("$file") ;;
    A) FILES+=("$file"); NEWFILES+=("$file") ;;
    *) echo "unsupported change '$status $file': deletions and renames need their own review" >&2; exit 1 ;;
  esac
done
[ "${#FILES[@]}" -gt 0 ] || { echo "no backend changes between $BASE and $COMMIT" >&2; exit 1; }
git -C "$REPO" ls-tree -r --name-only "$COMMIT" -- backend/prisma/migrations | grep -q 20261001220000_spoken_text_cues_legs || { echo "the migration is not in $COMMIT" >&2; exit 1; }
echo "$COMMIT replaces ${#FILES[@]} files (${#NEWFILES[@]} new) relative to $BASE"

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
: > "$WORK/base.sha256"; : > "$WORK/next.sha256"
for f in "${FILES[@]}"; do
  mkdir -p "$WORK/files/$(dirname "$f")"
  git -C "$REPO" show "$COMMIT:$f" > "$WORK/files/$f"
  echo "$(sha256sum "$WORK/files/$f" | cut -d' ' -f1)  $f" >> "$WORK/next.sha256"
  if printf '%s\n' "${NEWFILES[@]:-}" | grep -qx -- "$f"; then echo "NEW  $f" >> "$WORK/base.sha256"
  else echo "$(git -C "$REPO" show "$BASE:$f" | sha256sum | cut -d' ' -f1)  $f" >> "$WORK/base.sha256"; fi
done
tar czf "$WORK/release.tgz" -C "$WORK/files" backend
SSH=(ssh -i "$KEY" -o IdentitiesOnly=yes -o BatchMode=yes)
scp -q -i "$KEY" -o IdentitiesOnly=yes "$WORK/release.tgz" "$WORK/base.sha256" "$WORK/next.sha256" "$HOST:/tmp/"

"${SSH[@]}" "DRY_RUN=${DRY_RUN:-0} NAME=$NAME bash -s" <<'REMOTE'
set -euo pipefail
OLD=$(sudo -n readlink -f /srv/tour-guide/current)
NEW=/srv/tour-guide/releases/$NAME
NODE=/opt/nomuvia-node/bin
BACKUP=/root/nomuvia-before-$NAME
declare -A EXPECTED=([es]=52 [en]=41 [fr]=41 [de]=41 [it]=41)
step() { echo; echo "== $*"; }
fail() { echo "ERROR: $*"; exit 1; }

step "1/7 Checks (read only)"
sudo -n test -e "$NEW" && fail "$NEW already exists"
sudo -n test -e "$BACKUP" && fail "$BACKUP already exists"
sudo -n test -x "$OLD/backend/node_modules/.bin/prisma" || fail "the active release has no prisma CLI: the migration cannot be applied this way"
sudo -n test -f "$OLD/backend/node_modules/typescript/bin/tsc" || fail "typescript is missing in the backend"
avail=$(df --output=avail -BM / | tail -1 | tr -dc 0-9); [ "$avail" -gt 3000 ] || fail "little free disk: ${avail} MiB"
while read -r digest file; do
  [ "$digest" = NEW ] && { sudo -n test ! -e "$OLD/$file" || fail "$file exists on the server but is new"; continue; }
  [ "$(sudo -n sha256sum "$OLD/$file" | cut -d' ' -f1)" = "$digest" ] || fail "the server has another version of $file"
done < /tmp/base.sha256
STAGE=$(mktemp -d); tar xzf /tmp/release.tgz -C "$STAGE"
(cd "$STAGE" && sha256sum -c /tmp/next.sha256 --quiet) || fail "the uploaded files do not match"
sudo -n runuser -u postgres -- psql -At nomuvia -c "select migration_name from _prisma_migrations order by finished_at desc limit 3" || echo "(could not read _prisma_migrations as postgres)"
echo "OK: active release $OLD, ${avail} MiB free, files verified"
[ "$DRY_RUN" = 1 ] && { echo "DRY_RUN: nothing was created."; exit 0; }

ACTIVATED=0
cleanup() { local s=$?; if [ "$s" -ne 0 ] && [ "$ACTIVATED" = 0 ] && sudo -n test -d "$NEW"; then echo "Aborted before the switch: removing the candidate $NEW"; sudo -n rm -rf -- "$NEW"; fi; }
trap cleanup EXIT

step "2/7 Candidate"
sudo -n cp -a "$OLD" "$NEW"
sudo -n rm -rf -- "$NEW/frontend/.next.before-paragraphs" "$NEW/frontend/.next.previous"
sudo -n tar xzf /tmp/release.tgz -C "$NEW"
sudo -n chown -R nomuvia-admin:tour-pilot "$NEW"

step "3/7 Build as nomuvia-admin (no root)"
run_as_admin() { sudo -n systemd-run --quiet --wait --pipe --collect --uid=nomuvia-admin --gid=tour-pilot -p WorkingDirectory="$NEW/backend" -E PATH="$NODE:/usr/bin:/bin" "$@"; }
run_as_admin "$NODE/node" node_modules/prisma/build/index.js generate
run_as_admin "$NODE/node" node_modules/typescript/bin/tsc -p tsconfig.json
sudo -n chown -R root:tour-pilot "$NEW"; sudo -n chmod -R g+rX "$NEW"
sudo -n test -f "$NEW/backend/dist/services/regeneration/applyUpdate.js" || fail "the build has no regeneration code"

step "4/7 Dump and migration"
sudo -n mkdir -m 700 "$BACKUP"
sudo -n runuser -u postgres -- pg_dump nomuvia | sudo -n tee "$BACKUP/database.sql" > /dev/null
sudo -n bash -c "cd '$NEW/backend' && set -a && . /etc/tour-guide/migration.env && set +a && '$NODE/node' node_modules/prisma/build/index.js migrate deploy"
sudo -n runuser -u postgres -- psql nomuvia -v ON_ERROR_STOP=1 -c "GRANT SELECT ON tour_cue_audio, tour_walking_legs TO nomuvia_app"
echo "migrated; the old release keeps working with the additive schema"

rollback() {
  echo "FAILED: $*. Back to $OLD"
  sudo -n ln -sfn "$OLD" /srv/tour-guide/current.next; sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
  sudo -n systemctl restart nomuvia-backend nomuvia-frontend
  echo "Reverted. The candidate stays in $NEW; the migration stays (additive); the dump is in $BACKUP/database.sql."
  exit 1
}

step "5/7 Switch"
ACTIVATED=1
sudo -n ln -sfn "$NEW" /srv/tour-guide/current.next; sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
sudo -n systemctl restart nomuvia-backend nomuvia-frontend
for _ in $(seq 1 30); do sleep 2; systemctl is-active --quiet nomuvia-backend && systemctl is-active --quiet nomuvia-frontend && curl -s -o /dev/null -m 5 http://127.0.0.1:3000/ && break; done
systemctl is-active --quiet nomuvia-backend || rollback "backend inactive"
systemctl is-active --quiet nomuvia-frontend || rollback "frontend inactive"

step "6/7 Public checks: the same 216 tours, with the same versions"
for lang in es en fr de it; do
  out=$(curl -s -o /tmp/nomuvia-catalog.json -m 150 -w '%{http_code} %{time_total}' "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=50") || rollback "catalogue $lang did not answer"
  [ "${out%% *}" = 200 ] || rollback "catalogue $lang HTTP ${out%% *}"
  total=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["total"])')
  echo "catalogue $lang: ${out#* } s, $total tours"
  [ "$total" = "${EXPECTED[$lang]}" ] || rollback "catalogue $lang has $total tours, ${EXPECTED[$lang]} expected"
done
audio=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["tours"][0]["places"][0]["audioUrl"])')
[ "$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -w '%{http_code}' "https://nomuvia.com$audio")" = 206 ] || rollback "audio did not answer 206"
[ "$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://nomuvia.com/tours)" = 200 ] || rollback "/tours did not answer 200"

step "7/7 Done"
echo "Active release: $(sudo -n readlink -f /srv/tour-guide/current). Previous, to revert: $OLD. Dump: $BACKUP/database.sql"
rm -rf "$STAGE" /tmp/nomuvia-catalog.json /tmp/release.tgz /tmp/base.sha256 /tmp/next.sha256
REMOTE
