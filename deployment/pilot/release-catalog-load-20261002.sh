#!/usr/bin/env bash
# Release 20261002-catalog-load (commit 361083c).
# Faster pilot catalogue (backend) and tour page read on the server (frontend).
# Copies the active release, replaces only the files of the change, builds without root,
# switches `current` atomically and rolls back if the public checks fail. A failure before
# activation deletes only the new candidate. No database, audio or admission-rule changes.
set -euo pipefail

COMMIT=361083c
HOST=nomuvia-admin@88.99.175.28
KEY="$HOME/.ssh/tour-guide-hetzner"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILES=(
  'backend/src/api/routes/pilot.ts'
  'frontend/src/app/tours/[id]/page.tsx'
  'frontend/src/components/tour/TourPhoto.tsx'
  'frontend/src/components/tours/TourCard.tsx'
  'frontend/src/components/tours/TourCover.tsx'
  'frontend/src/components/tours/TourOverview.tsx'
  'frontend/src/components/tours/ToursList.tsx'
  'frontend/src/lib/api.ts'
  'frontend/src/components/tours/TourDetailClient.tsx'
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for f in "${FILES[@]}"; do
  mkdir -p "$WORK/files/$(dirname "$f")"
  git -C "$REPO" show "$COMMIT:$f" > "$WORK/files/$f"
done
tar czf "$WORK/release.tgz" -C "$WORK/files" backend frontend
scp -q -i "$KEY" "$WORK/release.tgz" "$HOST:/tmp/nomuvia-release-20261002.tgz"

ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
OLD=/srv/tour-guide/releases/20261001-audio-cache
NEW=/srv/tour-guide/releases/20261002-catalog-load
NODE=/opt/nomuvia-node/bin
FILES=(
  'backend/src/api/routes/pilot.ts'
  'frontend/src/app/tours/[id]/page.tsx'
  'frontend/src/components/tour/TourPhoto.tsx'
  'frontend/src/components/tours/TourCard.tsx'
  'frontend/src/components/tours/TourCover.tsx'
  'frontend/src/components/tours/TourOverview.tsx'
  'frontend/src/components/tours/ToursList.tsx'
  'frontend/src/lib/api.ts'
  'frontend/src/components/tours/TourDetailClient.tsx'
)
# sha256 of each file in the active release (the commit before 361083c); the last file is new.
BASE=(
  9a0c0957c2e8c1bbe1cc7f94edb6062f3e5964dec1b3de0ff9c1bf7bb6a15378
  682f02f776f12c29dbca84890a09f69bbc097fc73437498e5b56811b634ede9f
  ed979d856e5fb99982fff0310075baa1c166cccf50990a4d251db80de8ba81f1
  4dde9e73e54c59dad8a98614f892f9415ae7e308fb0eae27e43dac522e0da62c
  1e4a53109d88089bc1432556f50529e83b4b35ff9836e89a6629121ca8475d07
  6d05475efd762aaf6eebc17320f69db0570e9e445417b9a021d34a23372f5743
  bfdd580f062599e812af8f257dece5d5842f92d05a627e2fa4122f288351f818
  e0cd757f8b4eca11e53997b3a81818ed9aeed746fbf5f94caaab824857051811
)
NEXT=(
  26bb1510de5aec439ed41bc23cfe1b6afa781f275469325957c31f7da205af06
  aa5cfca8f1ac4471b0da58b63e23eed9cdc518e159cad85bdff69a8fb8f59396
  e5595a4ec331fa987f6c0f6a3b1e8d6a99471b4ea44425bad1756e539d549ab6
  10b732a7c893e4393a7a7337536ad41d896db0753d2e32135215d474ddb2d9f3
  7b67f9f748fe9bb8aac41c0c1af02f63595663d66d768b9e3200763bd9a12caf
  a3335d0621d1efbcee4610fe7979593a49ba31034f2fd4704d970c5f91d44e19
  3092f8d03ce67bdfdc556a8fdce765cbd21c24b03f1345164a57292e85f83650
  a021a112ebdf3b0d2c4a40fd65be9659cccd5a45bd7e553b0276ed7b195673c3
  8608926a19d95427a985da8cc2730578d0151548570457c599bd095ea9d7c62b
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
tar xzf /tmp/nomuvia-release-20261002.tgz -C "$STAGE"
last=$(( ${#FILES[@]} - 1 ))
for i in "${!FILES[@]}"; do
  f=${FILES[$i]}
  if [ "$i" -lt "$last" ]; then
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
sudo -n grep -q PILOT_CATALOG_CACHE_MS "$NEW/backend/dist/api/routes/pilot.js" || fail "el backend compilado no contiene el cambio"
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

step "5/6 Comprobando catálogo, ficha, audio y página pública"
for lang in es en fr de it; do
  out=$(curl -s -o /tmp/nomuvia-catalog.json -m 150 -w '%{http_code} %{time_total}' \
    "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=200") || rollback "catálogo $lang sin respuesta"
  [ "${out%% *}" = 200 ] || rollback "catálogo $lang HTTP ${out%% *}"
  read -r total got < <(python3 -c 'import json;d=json.load(open("/tmp/nomuvia-catalog.json"))["data"];print(d["total"],len(d["tours"]))')
  echo "catálogo $lang: HTTP 200, ${out#* } s, total $total, recibidos $got"
  [ "$total" = "${BEFORE[$lang]}" ] || rollback "catálogo $lang tiene $total tours, antes ${BEFORE[$lang]}"
  [ "$got" = "$total" ] || rollback "catálogo $lang devolvió $got de $total en una sola petición"
done
read -r id audio < <(python3 -c 'import json;t=json.load(open("/tmp/nomuvia-catalog.json"))["data"]["tours"][0];print(t["id"],t["places"][0]["audioUrl"])')
code=$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -w '%{http_code}' "https://nomuvia.com$audio")
echo "audio de parada (rango): HTTP $code"
[ "$code" = 206 ] || rollback "audio HTTP $code"
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://nomuvia.com/tours)
echo "página /tours: HTTP $code"
[ "$code" = 200 ] || rollback "/tours HTTP $code"
curl -s -m 60 -o /tmp/nomuvia-tour.html -w '%{http_code}\n' "https://nomuvia.com/tours/$id" | grep -q '^200$' || rollback "ficha /tours/$id no responde 200"
grep -q '<h1' /tmp/nomuvia-tour.html || rollback "la ficha no trae el título en el HTML inicial"
echo "ficha /tours/$id: HTTP 200 con el título en el HTML inicial"

step "6/6 Listo"
echo "Release activa: $(sudo -n readlink -f /srv/tour-guide/current)"
echo "Anterior para revertir: $OLD"
rm -rf "$STAGE" /tmp/nomuvia-catalog.json /tmp/nomuvia-tour.html /tmp/nomuvia-release-20261002.tgz
REMOTE
