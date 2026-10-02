#!/usr/bin/env bash
# Release 20261002-city-groups (commit 97ed4f7).
# The closing city links are grouped by country in folded sections. Frontend only.
# Copies the active release, replaces only the files of the change, builds without root,
# switches `current` atomically and rolls back if the public checks fail. A failure before
# activation deletes only the new candidate. No database, audio or admission-rule changes.
set -euo pipefail

COMMIT=97ed4f7
HOST=nomuvia-admin@88.99.175.28
KEY="$HOME/.ssh/tour-guide-hetzner"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILES=(
  'frontend/src/app/tours/page.tsx'
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for f in "${FILES[@]}"; do
  mkdir -p "$WORK/files/$(dirname "$f")"
  git -C "$REPO" show "$COMMIT:$f" > "$WORK/files/$f"
done
tar czf "$WORK/release.tgz" -C "$WORK/files" backend frontend
scp -q -i "$KEY" "$WORK/release.tgz" "$HOST:/tmp/nomuvia-release-20261002c.tgz"

ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
OLD=/srv/tour-guide/releases/20261002-catalog-summary
NEW=/srv/tour-guide/releases/20261002-city-groups
NODE=/opt/nomuvia-node/bin
FILES=(
  'frontend/src/app/tours/page.tsx'
)
# sha256 of the file in the active release (commit d554788) and in commit 97ed4f7.
BASE=(
  e363a110558e029376519fea1c9be54a9bcfce4665dc6cb3c83d97b18e9d93c6
)
NEXT=(
  fb05fa8ea3c1c3cf84f00140c95a08984d45abc96fab9c507e68ed5da7205893
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
tar xzf /tmp/nomuvia-release-20261002c.tgz -C "$STAGE"
last=${#FILES[@]}
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

step "3/6 Compilando el frontend como nomuvia-admin (sin root)"
# /srv/tour-guide is 750 root:tour-pilot, so the build needs that group to reach the release.
sudo -n chown -R nomuvia-admin:tour-pilot "$NEW"
sudo -n systemd-run --quiet --wait --pipe --collect --uid=nomuvia-admin --gid=tour-pilot \
  -p WorkingDirectory="$NEW/frontend" -p EnvironmentFile=/etc/tour-guide/frontend.env -E PATH="$NODE:/usr/bin:/bin" \
  "$NODE/npm" run build
sudo -n chown -R root:tour-pilot "$NEW"
sudo -n chmod -R g+rX "$NEW"
[ "$(sudo -n cat "$NEW/frontend/.next/BUILD_ID")" != "$(sudo -n cat "$OLD/frontend/.next/BUILD_ID")" ] || fail "el frontend no se recompiló"
sudo -n grep -rqs discovery-country "$NEW/frontend/.next/server" || fail "el frontend compilado no contiene el cambio"
echo "OK: frontend compilado"

rollback() {
  echo "FALLO: $*. Vuelvo a $OLD"
  sudo -n ln -sfn "$OLD" /srv/tour-guide/current.next
  sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
  sudo -n systemctl restart nomuvia-frontend
  echo "Revertido. La candidata queda en $NEW para inspección."
  exit 1
}

step "4/6 Activando"
ACTIVATED=1
sudo -n ln -sfn "$NEW" /srv/tour-guide/current.next
sudo -n mv -T /srv/tour-guide/current.next /srv/tour-guide/current
sudo -n systemctl restart nomuvia-frontend
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
    "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=200&view=summary") || rollback "catálogo $lang sin respuesta"
  [ "${out%% *}" = 200 ] || rollback "catálogo $lang HTTP ${out%% *}"
  read -r total got < <(python3 -c 'import json;d=json.load(open("/tmp/nomuvia-catalog.json"))["data"];print(d["total"],len(d["tours"]))')
  echo "catálogo $lang: HTTP 200, ${out#* } s, total $total, recibidos $got"
  [ "$total" = "${BEFORE[$lang]}" ] || rollback "catálogo $lang tiene $total tours, antes ${BEFORE[$lang]}"
  [ "$got" = "$total" ] || rollback "catálogo $lang devolvió $got de $total en una sola petición"
done
read -r id audio < <(python3 -c 'import json;t=json.load(open("/tmp/nomuvia-catalog.json"))["data"]["tours"][0];print(t["id"],t["sampleAudioUrl"])')
code=$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -w '%{http_code}' "https://nomuvia.com$audio")
echo "audio de parada (rango): HTTP $code"
[ "$code" = 206 ] || rollback "audio HTTP $code"
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://nomuvia.com/tours)
echo "página /tours: HTTP $code"
[ "$code" = 200 ] || rollback "/tours HTTP $code"
curl -s -m 60 -o /tmp/nomuvia-tour.html -w '%{http_code}\n' "https://nomuvia.com/tours/$id" | grep -q '^200$' || rollback "ficha /tours/$id no responde 200"
grep -q '<h1' /tmp/nomuvia-tour.html || rollback "la ficha no trae el título en el HTML inicial"
echo "ficha /tours/$id: HTTP 200 con el título en el HTML inicial"
n=$(curl -s -m 60 https://nomuvia.com/tours | grep -o 'class="discovery-country"' | wc -l)
echo "/tours: $n grupos de país en el HTML"
[ "$n" -ge 4 ] || rollback "/tours no trae los grupos de país"

step "6/6 Listo"
echo "Release activa: $(sudo -n readlink -f /srv/tour-guide/current)"
echo "Anterior para revertir: $OLD"
rm -rf "$STAGE" /tmp/nomuvia-catalog.json /tmp/nomuvia-tour.html /tmp/nomuvia-release-20261002c.tgz
REMOTE
