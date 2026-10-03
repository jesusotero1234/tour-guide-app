#!/usr/bin/env bash
set -Eeuo pipefail
stage=/home/nomuvia-admin/nomuvia-europe-20260922
build=/home/nomuvia-admin/nomuvia-europe-build-20260922
release=/srv/tour-guide/releases/20260922-europe-history
backup=/root/nomuvia-before-europe-20260922-attempt2
shared=/srv/tour-guide/shared/audio
catalog="$stage/catalog.json"
job=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["jobId"])' "$stage/manifest.json")
[[ -s "$build/frontend/.next/BUILD_ID" && -s "$catalog" ]]
[[ ! -e "$release" && ! -e "$backup" && ! -e "$shared/voxcpm2/$job" ]]
(cd "$stage/audio" && sha256sum -c "$stage/audio.sha256" >/dev/null)
available=$(df -B1 --output=avail /srv | tail -1)
(( available > 3221225472 ))
imported=0
switched=0
previous=$(readlink -f /srv/tour-guide/current)
rollback() {
  rc=$?
  trap - ERR
  set +e
  if (( imported )); then
    cd "$release"
    set -a; source /etc/tour-guide/migration.env; set +a
    /opt/nomuvia-node/bin/node remote-rollback.cjs "$catalog"
  fi
  rm -rf "$shared/voxcpm2/$job"
  if (( switched )); then
    ln -s "$previous" /srv/tour-guide/current-europe-rollback
    mv -Tf /srv/tour-guide/current-europe-rollback /srv/tour-guide/current
    systemctl restart nomuvia-backend nomuvia-frontend
  fi
  [[ "$(readlink -f /srv/tour-guide/current)" == "$release" ]] || rm -rf "$release"
  exit "$rc"
}
trap rollback ERR
mkdir -m 700 "$backup"
printf '%s\n' "$previous" > "$backup/previous-release"
runuser -u postgres -- pg_dump nomuvia > "$backup/database.sql"
mv "$build" "$release"
cp "$stage/remote-import.cjs" "$stage/remote-rollback.cjs" "$stage/verify.cjs" "$release/"
chown -R root:tour-pilot "$release"
chmod -R o-rwx "$release"
chown -R tour-pilot:tour-pilot "$release/frontend/.next/cache"
mkdir -p "$shared/voxcpm2"
cp -al "$stage/audio/voxcpm2/$job" "$shared/voxcpm2/$job"
chown -R root:tour-pilot "$shared/voxcpm2/$job"
find "$shared/voxcpm2/$job" -type d -exec chmod 750 {} +
find "$shared/voxcpm2/$job" -type f -exec chmod 640 {} +
cd "$release"
set -a; source /etc/tour-guide/migration.env; set +a
/opt/nomuvia-node/bin/node remote-import.cjs "$catalog"
imported=1
set -a; source /etc/tour-guide/backend.env; set +a
export TOUR_PROJECT_ROOT="$release"
/opt/nomuvia-node/bin/node verify.cjs "$catalog"
ln -s "$release" /srv/tour-guide/current-europe-next
mv -Tf /srv/tour-guide/current-europe-next /srv/tour-guide/current
switched=1
systemctl restart nomuvia-backend nomuvia-frontend
systemctl is-active nomuvia-backend nomuvia-frontend caddy
trap - ERR
printf 'Europe release installed: %s\n' "$release"
