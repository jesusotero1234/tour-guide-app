#!/usr/bin/env bash
# Release 20261001-audio-cache (commit 766286f).
# Copies the active release, replaces only the four files of the fix, builds
# without root, switches `current` atomically and rolls back if the public
# checks fail. A failure before activation deletes only the new candidate.
set -euo pipefail

COMMIT=766286f
HOST=nomuvia-admin@88.99.175.28
KEY="$HOME/.ssh/tour-guide-hetzner"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILES=(
  'backend/src/services/IntroductionAudio.ts'
  'backend/src/services/TourAudioService.ts'
  'frontend/src/app/api/backend/tours/[id]/audio/[placeId]/route.ts'
  'frontend/src/app/api/backend/tours/[id]/audio/introduction/route.ts'
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for f in "${FILES[@]}"; do
  mkdir -p "$WORK/files/$(dirname "$f")"
  git -C "$REPO" show "$COMMIT:$f" > "$WORK/files/$f"
done
tar czf "$WORK/release.tgz" -C "$WORK/files" backend frontend
scp -q -i "$KEY" "$WORK/release.tgz" "$HOST:/tmp/nomuvia-release-20261001.tgz"

ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
OLD=/srv/tour-guide/releases/20260922-europe-history
NEW=/srv/tour-guide/releases/20261001-audio-cache
NODE=/opt/nomuvia-node/bin
FILES=(
  'backend/src/services/IntroductionAudio.ts'
  'backend/src/services/TourAudioService.ts'
  'frontend/src/app/api/backend/tours/[id]/audio/[placeId]/route.ts'
  'frontend/src/app/api/backend/tours/[id]/audio/introduction/route.ts'
)
# sha256 of each file in the active release (commit 936fbe6) and in commit 766286f.
BASE=(
  f4b4a7fd69326dbec9c964033ff44dbfd877b62788caab6d770cf6b7390019d7
  7f560581b6122559840a315dc9fcfed8259ba6d786228d0a790f81348a6d9d55
  82a6d2627e324535038adb1d1a47c6192640dfb16b51f7f6d17714e37874a87d
  561780f6c64cc416b94285802200d2964a4accae1f2a04d748f2076f35970b39
)
NEXT=(
  129ee502144400f0d02957106fa6cb36de3955673e4d7441244bb686f053d3f3
  4744e6741316b03bd1b491b40a3eb8307d2e0ae42dc2a7c99ec1b1bcc35a8776
  523351836cb06ba7e3c78ac2a5534c4094048cb4c0a2148a5cdfce557874baba
  de1c80b256ddb6884ee091cc0139260e09b56a85fb81ed9f1a8dd8a6158680ac
)
# Published catalogue per language on 2026-10-01 (216 tours in total).
declare -A EXPECTED=([es]=52 [en]=41 [fr]=41 [de]=41 [it]=41)

step() { echo; echo "== $*"; }
fail() { echo "ERROR: $*"; exit 1; }

step "1/6 Comprobaciones previas"
[ "$(sudo -n readlink -f /srv/tour-guide/current)" = "$OLD" ] || fail "current no apunta a $OLD"
if sudo -n test -e "$NEW"; then fail "$NEW ya existe"; fi
sudo -n test -f "$OLD/backend/node_modules/typescript/bin/tsc" || fail "falta typescript en el backend"
sudo -n test -d "$OLD/frontend/node_modules/next" || fail "falta next en el frontend"
command -v python3 >/dev/null || fail "falta python3"
avail=$(df --output=avail -BM / | tail -1 | tr -dc 0-9)
[ "$avail" -gt 2500 ] || fail "poco disco libre: ${avail} MiB"
STAGE=$(mktemp -d)
tar xzf /tmp/nomuvia-release-20261001.tgz -C "$STAGE"
for i in "${!FILES[@]}"; do
  f=${FILES[$i]}
  [ "$(sudo -n sha256sum "$OLD/$f" | cut -d' ' -f1)" = "${BASE[$i]}" ] || fail "el servidor tiene otra versión de $f"
  [ "$(sha256sum "$STAGE/$f" | cut -d' ' -f1)" = "${NEXT[$i]}" ] || fail "el archivo subido no coincide: $f"
done
echo "OK: release activa, herramientas, ${avail} MiB libres y 4 archivos verificados"

ACTIVATED=0
cleanup() {
  local status=$?
  if [ "$status" -ne 0 ] && [ "$ACTIVATED" = 0 ] && sudo -n test -d "$NEW"; then
    echo "Abortado antes de activar: elimino la candidata $NEW (producción no cambió)"
    sudo -n rm -rf -- "$NEW"
  fi
}
trap cleanup EXIT

step "2/6 Creando la candidata $NEW"
sudo -n cp -a "$OLD" "$NEW"
sudo -n rm -rf -- "$NEW/frontend/.next.before-paragraphs" "$NEW/frontend/.next.previous"
for f in "${FILES[@]}"; do
  sudo -n cp "$STAGE/$f" "$NEW/$f"
  sudo -n chown --reference="$OLD/$f" "$NEW/$f"
  sudo -n chmod --reference="$OLD/$f" "$NEW/$f"
done

step "3/6 Compilando como nomuvia-admin (sin root)"
# /srv/tour-guide is 750 root:tour-pilot, so the build needs that group to reach the release.
sudo -n chown -R nomuvia-admin:tour-pilot "$NEW"
sudo -n systemd-run --quiet --wait --pipe --collect --uid=nomuvia-admin --gid=tour-pilot \
  -p WorkingDirectory="$NEW/backend" -E PATH="$NODE:/usr/bin:/bin" \
  "$NODE/node" node_modules/typescript/bin/tsc -p tsconfig.json
sudo -n systemd-run --quiet --wait --pipe --collect --uid=nomuvia-admin --gid=tour-pilot \
  -p WorkingDirectory="$NEW/frontend" -p EnvironmentFile=/etc/tour-guide/frontend.env -E PATH="$NODE:/usr/bin:/bin" \
  "$NODE/npm" run build
sudo -n chown -R root:tour-pilot "$NEW"
sudo -n chmod -R g+rX "$NEW"
sudo -n grep -q audioFileSha256 "$NEW/backend/dist/services/TourAudioService.js" || fail "el backend compilado no contiene el cambio"
sudo -n grep -q audioFileSha256 "$NEW/backend/dist/services/IntroductionAudio.js" || fail "el backend compilado no contiene el cambio"
[ "$(sudo -n cat "$NEW/frontend/.next/BUILD_ID")" != "$(sudo -n cat "$OLD/frontend/.next/BUILD_ID")" ] || fail "el frontend no se recompiló"
echo "OK: backend y frontend compilados"

rollback() {
  echo "FALLO: $*. Vuelvo a $OLD"
  sudo -n ln -sfn "$OLD" /srv/tour-guide/current.next
  sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
  sudo -n systemctl restart nomuvia-backend nomuvia-frontend
  echo "Revertido. La candidata queda en $NEW para inspección."
  exit 1
}

step "4/6 Activando"
ACTIVATED=1
sudo -n ln -sfn "$NEW" /srv/tour-guide/current.next
sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
sudo -n systemctl restart nomuvia-backend nomuvia-frontend
for _ in $(seq 1 30); do
  sleep 2
  systemctl is-active --quiet nomuvia-backend && systemctl is-active --quiet nomuvia-frontend \
    && curl -s -o /dev/null -m 5 http://127.0.0.1:3000/ && break
done
systemctl is-active --quiet nomuvia-backend || rollback "backend inactivo"
systemctl is-active --quiet nomuvia-frontend || rollback "frontend inactivo"

step "5/6 Comprobando catálogo, audio y página pública"
for lang in es en fr de it; do
  out=$(curl -s -o /tmp/nomuvia-catalog.json -m 150 -w '%{http_code} %{time_total}' \
    "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=50") || rollback "catálogo $lang sin respuesta"
  [ "${out%% *}" = 200 ] || rollback "catálogo $lang HTTP ${out%% *}"
  total=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["total"])')
  echo "catálogo $lang: HTTP 200, ${out#* } s, $total tours"
  [ "$total" = "${EXPECTED[$lang]}" ] || rollback "catálogo $lang tiene $total tours, se esperaban ${EXPECTED[$lang]}"
done
audio=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["tours"][0]["places"][0]["audioUrl"])')
code=$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -w '%{http_code}' "https://nomuvia.com$audio")
echo "audio de parada (rango): HTTP $code"
[ "$code" = 206 ] || rollback "audio HTTP $code"
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://nomuvia.com/tours)
echo "página /tours: HTTP $code"
[ "$code" = 200 ] || rollback "/tours HTTP $code"

step "6/6 Listo"
echo "Release activa: $(sudo -n readlink -f /srv/tour-guide/current)"
echo "Anterior para revertir: $OLD"
rm -rf "$STAGE" /tmp/nomuvia-catalog.json /tmp/nomuvia-release-20261001.tgz
REMOTE
