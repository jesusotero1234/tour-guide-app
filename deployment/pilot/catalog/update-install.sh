#!/usr/bin/env bash
# Installs a catalogue update package on the server (plan 04 section 10). Run with sudo from the uploaded package folder:
#   sudo bash update-install.sh <package-dir>
# Order: checks, pg_dump, audio copy (hard links, refuses an existing job folder), dry run, update, public checks.
# On any failure after the first change the update is rolled back from the package's own `previous` block. The new audio files
# stay on disk, because without the new text nothing selects them; the database dump is the last resort.
set -Eeuo pipefail
stage="$(cd "${1:?usage: update-install.sh <package-dir>}" && pwd)"
release="$(readlink -f /srv/tour-guide/current)"
shared=/srv/tour-guide/shared/audio
node=/opt/nomuvia-node/bin/node
run=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["regenRunId"])' "$stage/catalog-update.json")
backup="/root/nomuvia-before-update-$run"
copied=()
changed=0
step() { printf '\n== %s\n' "$*"; }
fail() { echo "ERROR: $*" >&2; exit 1; }
load_env() { set -a; source /etc/tour-guide/backend.env; source /etc/tour-guide/migration.env; set +a; export AUDIO_STORAGE_PATH="${AUDIO_STORAGE_PATH:-$shared}"; }
catalogue() {  # language -> total, as the public API reports it
  for lang in es en fr de it; do
    curl -fsS -m 150 "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=50" | python3 -c 'import json,sys;print(sys.argv[1], json.load(sys.stdin)["data"]["total"])' "$lang"
  done
}

step "1/6 Checks"
[[ -s "$stage/catalog-update.json" && -s "$stage/audio.sha256" && -f "$stage/remote-update.cjs" ]] || fail "incomplete package"
[[ ! -e "$backup" ]] || fail "$backup already exists: this package was installed or attempted before"
[[ -f "$release/backend/dist/services/regeneration/applyUpdate.js" ]] || fail "the active release has no regeneration code: install the backend release first"
(cd "$stage/audio" && sha256sum -c ../audio.sha256 --quiet) || fail "the audio does not match audio.sha256"
need=$(( $(du -sb "$stage/audio" | cut -f1) * 2 + 3 * 1024 * 1024 * 1024 ))
available=$(df -B1 --output=avail /srv | tail -1)
(( available > need )) || fail "not enough free disk: $available bytes, need $need"
for job in "$stage"/audio/voxcpm2/*/; do [[ ! -e "$shared/voxcpm2/$(basename "$job")" ]] || fail "$shared/voxcpm2/$(basename "$job") already exists"; done
before="$(catalogue)"; echo "$before"

rollback() {
  rc=$?
  trap - ERR
  set +e
  echo "FAILED (exit $rc). Rolling the tours back." >&2
  if (( changed )); then
    ( cd "$release"; load_env; "$node" remote-update.cjs "$stage/catalog-update.json" --rollback )
    systemctl restart nomuvia-backend
  fi
  echo "The audio folders copied stay on disk: ${copied[*]:-none}. The database dump is in $backup." >&2
  exit "$rc"
}
trap rollback ERR

step "2/6 Database dump"
mkdir -m 700 "$backup"
runuser -u postgres -- pg_dump nomuvia > "$backup/database.sql"
echo "dump: $(du -h "$backup/database.sql" | cut -f1)"

step "3/6 Audio"
mkdir -p "$shared/voxcpm2"
for job in "$stage"/audio/voxcpm2/*/; do
  name="$(basename "$job")"
  cp -al "$job" "$shared/voxcpm2/$name"
  copied+=("$shared/voxcpm2/$name")
  chown -R root:tour-pilot "$shared/voxcpm2/$name"
  find "$shared/voxcpm2/$name" -type d -exec chmod 750 {} +
  find "$shared/voxcpm2/$name" -type f -exec chmod 640 {} +
done
echo "copied ${#copied[@]} job folders"

step "4/6 Dry run"
cp "$stage/remote-update.cjs" "$release/remote-update.cjs"
( cd "$release"; load_env; "$node" remote-update.cjs "$stage/catalog-update.json" --dry-run )

step "5/6 Update"
changed=1
( cd "$release"; load_env; "$node" remote-update.cjs "$stage/catalog-update.json" )
systemctl restart nomuvia-backend
sleep 5
systemctl is-active --quiet nomuvia-backend

step "6/6 Public checks"
after="$(catalogue)"; echo "$after"
[[ "$before" == "$after" ]] || fail "the catalogue totals changed: before [$before] after [$after]"
audio=$(curl -fsS -m 60 "https://nomuvia.com/api/backend/tours?language=es&readyOnly=true&limit=1" | python3 -c 'import json,sys;print(json.load(sys.stdin)["data"]["tours"][0]["places"][0]["audioUrl"])')
code=$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -w '%{http_code}' "https://nomuvia.com$audio")
[[ "$code" == 206 ]] || fail "audio answered HTTP $code"
trap - ERR
echo "Update installed. Dump: $backup. To undo: node remote-update.cjs $stage/catalog-update.json --rollback (from $release, with the env files)."
