#!/usr/bin/env bash
# Release 20261002-catalog-summary (commit 329d6a4).
# The catalogue is served as light cards (`view=summary`) and the first tour pages are prefetched.
# Copies the active release, replaces only the files of the change, builds without root,
# switches `current` atomically and rolls back if the public checks fail. A failure before
# activation deletes only the new candidate. No database, audio or admission-rule changes.
set -euo pipefail

COMMIT=329d6a4
HOST=nomuvia-admin@88.99.175.28
KEY="$HOME/.ssh/tour-guide-hetzner"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILES=(
  'backend/src/api/routes/pilot.ts'
  'frontend/src/components/tours/TourCard.tsx'
  'frontend/src/components/tours/TourCover.tsx'
  'frontend/src/components/tours/TourSample.tsx'
  'frontend/src/components/tours/ToursList.tsx'
  'frontend/src/lib/api.ts'
  'frontend/src/types/api.ts'
  'backend/src/services/PilotCatalogSummary.ts'
  'frontend/src/lib/tourSummary.ts'
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for f in "${FILES[@]}"; do
  mkdir -p "$WORK/files/$(dirname "$f")"
  git -C "$REPO" show "$COMMIT:$f" > "$WORK/files/$f"
done
tar czf "$WORK/release.tgz" -C "$WORK/files" backend frontend
scp -q -i "$KEY" "$WORK/release.tgz" "$HOST:/tmp/nomuvia-release-20261002b.tgz"

ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
OLD=/srv/tour-guide/releases/20261002-catalog-load
NEW=/srv/tour-guide/releases/20261002-catalog-summary
NODE=/opt/nomuvia-node/bin
FILES=(
  'backend/src/api/routes/pilot.ts'
  'frontend/src/components/tours/TourCard.tsx'
  'frontend/src/components/tours/TourCover.tsx'
  'frontend/src/components/tours/TourSample.tsx'
  'frontend/src/components/tours/ToursList.tsx'
  'frontend/src/lib/api.ts'
  'frontend/src/types/api.ts'
  'backend/src/services/PilotCatalogSummary.ts'
  'frontend/src/lib/tourSummary.ts'
)
# sha256 of each file in the active release (commit 361083c); the last 2 files are new.
BASE=(
  26bb1510de5aec439ed41bc23cfe1b6afa781f275469325957c31f7da205af06
  10b732a7c893e4393a7a7337536ad41d896db0753d2e32135215d474ddb2d9f3
  7b67f9f748fe9bb8aac41c0c1af02f63595663d66d768b9e3200763bd9a12caf
  6aafb5b0863bcb7cf09d0f48a5ad496c8a2867262716e953a2a933ae37cbfe48
  3092f8d03ce67bdfdc556a8fdce765cbd21c24b03f1345164a57292e85f83650
  a021a112ebdf3b0d2c4a40fd65be9659cccd5a45bd7e553b0276ed7b195673c3
  07d1b4ad0c74daac2ae357652a314bb7e6ae537135813564acfb4bcc44603dd1
)
NEXT=(
  ebcdfaad9e5e340af5d3e5bb18646101ea01c66fe9ad2e23af50699e89516aa5
  0c5174a9bda1c8bd6936d21f03e536ed8e85bcaadf161f3cad68f10717363e1e
  993d396dbcd0f6002c7ef1e77ef960dcb7662d7f375dff59fa2652f969059222
  293781999c7191cb4e576b07cae148fde32406783d41118f323e47147e56bddb
  1b6a67e9932f0f3023f94cbd2d6f8c40a8865251593e2dc2cc84d1c60163a57e
  0fdd01ff31285b192e532f9f5636150468d2e70afb7b70e3eed2f5594c26d1df
  65bb16c46cbdf0bedc7b8030f1163ce92971ed301c325f9210e14f9f1bd9c8f5
  4c3ff7e0a10b8f19f969651effa0b790a6cfe2c14a94d7bdc020350c7106174a
  55c9e088d3215944c48082d6ac0210e5c3d20b3e70ac7b42310c17504964ca4f
)

step() { echo; echo "== $*"; }
fail() { echo "ERROR: $*"; exit 1; }

step "1/6 Comprobaciones previas"
[ "$(sudo -n readlink -f /srv/tour-guide/current)" = "$OLD" ] || fail "current no apunta a $OLD"
if sudo -n test -e "$NEW"; then fail "$NEW ya existe"; fi
sudo -n test -f "$OLD/backend/node_modules/typescript/bin/tsc" || fail "falta typescript en el backend"
sudo -n test -d "$OLD/frontend/node_modules/next" || fail "falta next en el frontend"
command -v python3 >/dev/null || fail "falta python3"
avail=$(df --output=avail -BM / | tail -1 | tr -dc 0-9)
[ "$avail" -gt 5000 ] || fail "poco disco libre: ${avail} MiB"
STAGE=$(mktemp -d)
tar xzf /tmp/nomuvia-release-20261002b.tgz -C "$STAGE"
first_new=${#BASE[@]}
for i in "${!FILES[@]}"; do
  f=${FILES[$i]}
  if [ "$i" -lt "$first_new" ]; then
    [ "$(sudo -n sha256sum "$OLD/$f" | cut -d' ' -f1)" = "${BASE[$i]}" ] || fail "el servidor tiene otra versión de $f"
  else
    if sudo -n test -e "$OLD/$f"; then fail "$f ya existe en el servidor"; fi
  fi
  [ "$(sha256sum "$STAGE/$f" | cut -d' ' -f1)" = "${NEXT[$i]}" ] || fail "el archivo subido no coincide: $f"
done
# Published catalogue per language before the change; it must be the same afterwards.
declare -A BEFORE
for lang in es en fr de it; do
  curl -s -o /tmp/nomuvia-catalog.json -m 150 "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=50" || fail "catálogo $lang no responde antes del cambio"
  BEFORE[$lang]=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["total"])')
done
echo "OK: release activa, herramientas, ${avail} MiB libres, ${#FILES[@]} archivos verificados"
echo "Catálogo antes: es=${BEFORE[es]} en=${BEFORE[en]} fr=${BEFORE[fr]} de=${BEFORE[de]} it=${BEFORE[it]}"

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
  if sudo -n test -e "$OLD/$f"; then
    sudo -n chown --reference="$OLD/$f" "$NEW/$f"
    sudo -n chmod --reference="$OLD/$f" "$NEW/$f"
  else
    sudo -n chown --reference="$OLD/${FILES[0]}" "$NEW/$f"
    sudo -n chmod --reference="$OLD/${FILES[0]}" "$NEW/$f"
  fi
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
sudo -n grep -q presentPilotTourSummary "$NEW/backend/dist/api/routes/pilot.js" || fail "el backend compilado no contiene el cambio"
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

step "5/6 Comprobando catálogo ligero, ficha, audio y página pública"
for lang in es en fr de it; do
  out=$(curl -s -o /tmp/nomuvia-catalog.json -m 150 -w '%{http_code} %{time_total} %{size_download}' \
    "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=200&view=summary") || rollback "catálogo $lang sin respuesta"
  read -r code secs bytes <<<"$out"
  [ "$code" = 200 ] || rollback "catálogo $lang HTTP $code"
  read -r total got nocover noplaces < <(python3 -c 'import json;d=json.load(open("/tmp/nomuvia-catalog.json"))["data"];t=d["tours"];print(d["total"],len(t),sum(1 for x in t if "cover" not in x),sum(1 for x in t if "places" in x))')
  echo "catálogo $lang (ligero): HTTP 200, $secs s, $bytes bytes, total $total, recibidos $got, sin portada $nocover"
  [ "$total" = "${BEFORE[$lang]}" ] || rollback "catálogo $lang tiene $total tours, antes ${BEFORE[$lang]}"
  [ "$got" = "$total" ] || rollback "catálogo $lang devolvió $got de $total en una sola petición"
  [ "$noplaces" = 0 ] || rollback "el catálogo ligero $lang todavía trae paradas"
  [ "$bytes" -lt 400000 ] || rollback "el catálogo ligero $lang pesa $bytes bytes"
done
read -r id audio < <(python3 -c 'import json;t=json.load(open("/tmp/nomuvia-catalog.json"))["data"]["tours"][0];print(t["id"],t["sampleAudioUrl"])')
code=$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -w '%{http_code}' "https://nomuvia.com$audio")
echo "audio de muestra (rango): HTTP $code"
[ "$code" = 206 ] || rollback "audio HTTP $code"
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://nomuvia.com/tours)
echo "página /tours: HTTP $code"
[ "$code" = 200 ] || rollback "/tours HTTP $code"
curl -s -m 60 -o /tmp/nomuvia-tour.html -w '%{http_code}\n' "https://nomuvia.com/tours/$id" | grep -q '^200$' || rollback "ficha /tours/$id no responde 200"
grep -q '<h1' /tmp/nomuvia-tour.html || rollback "la ficha no trae el título en el HTML inicial"
echo "ficha /tours/$id: HTTP 200 con el título en el HTML inicial"
curl -s -o /dev/null -m 150 "https://nomuvia.com/api/backend/tours?language=es&readyOnly=true&limit=200" -w "catálogo completo (compatibilidad): HTTP %{http_code}\n"

step "6/6 Listo"
echo "Release activa: $(sudo -n readlink -f /srv/tour-guide/current)"
echo "Anterior para revertir: $OLD"
rm -rf "$STAGE" /tmp/nomuvia-catalog.json /tmp/nomuvia-tour.html /tmp/nomuvia-release-20261002b.tgz
REMOTE
