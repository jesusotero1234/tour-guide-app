#!/usr/bin/env bash
# Release 20261002-about-languages (commit 7c04060).
# The about page in all five languages; no duplicate info links on the legal pages. Frontend only.
# Copies the active release, replaces only the files of the change, builds without root,
# switches `current` atomically and rolls back if the public checks fail. A failure before
# activation deletes only the new candidate. No database, audio or admission-rule changes.
set -euo pipefail

COMMIT=7c04060
HOST=nomuvia-admin@88.99.175.28
KEY="$HOME/.ssh/tour-guide-hetzner"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
FILES=(
  'frontend/src/app/about/page.tsx'
  'frontend/src/app/data-sources/page.tsx'
  'frontend/src/app/privacy/page.tsx'
  'frontend/src/components/legal/InfoLinks.tsx'
)

WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT
for f in "${FILES[@]}"; do
  mkdir -p "$WORK/files/$(dirname "$f")"
  git -C "$REPO" show "$COMMIT:$f" > "$WORK/files/$f"
done
tar czf "$WORK/release.tgz" -C "$WORK/files" frontend
scp -q -i "$KEY" "$WORK/release.tgz" "$HOST:/tmp/nomuvia-release-20261002d.tgz"

ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
OLD=/srv/tour-guide/releases/20261002-city-groups
NEW=/srv/tour-guide/releases/20261002-about-languages
NODE=/opt/nomuvia-node/bin
FILES=(
  'frontend/src/app/about/page.tsx'
  'frontend/src/app/data-sources/page.tsx'
  'frontend/src/app/privacy/page.tsx'
  'frontend/src/components/legal/InfoLinks.tsx'
)
# sha256 of each file in the active release (commit 0214e22) and in commit 7c04060.
BASE=(
  0b12a6e36bb1126d7c0cbe22cfeda2af58f4746b05c0ade321b5fa5fea7e9f36
  c8690a4cef98cd0a0d478375866eb154286830acf79c41d11bbb06fb3659d2f3
  67c4f7ffa70580ae7d2f81c05bc83c5c072af8bcdd6a0d0bae13cffbc3ec0808
  eef5cc3badc9f87eb245f344a98d75333ddf4f497b01b23c6ba8e85615daa3cd
)
NEXT=(
  786facb39671c97a4423409108d8512875ec9176314c87052205cbc11e30b908
  8e9a960ac1f7f51bef36673a7f39b25b0d7249c1c68179a90871102cef1ce072
  40934e0d24a49390b0698782cb6a8008098dc7c9358f8a71cbffa4898884c05a
  cd71109efc3c927f1ec8d1d4b82c61016e905e946891b709ee6cd79004077406
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
tar xzf /tmp/nomuvia-release-20261002d.tgz -C "$STAGE"
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
sudo -n grep -rqs 'Verantwortlicher und Kontakt' "$NEW/frontend/.next/server" || fail "el frontend compilado no contiene el cambio"
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
for lang in es en fr de it; do
  curl -s -m 60 -o /tmp/nomuvia-about.html "https://nomuvia.com/about?lang=$lang" || rollback "/about $lang sin respuesta"
  grep -q "<main lang=\"$lang\"" /tmp/nomuvia-about.html || rollback "/about no sale en $lang"
  grep -q 'mailto:contact@nomuvia.com' /tmp/nomuvia-about.html || rollback "/about $lang sin el contacto"
  echo "/about $lang: idioma y contacto correctos"
done
# `|| true` keeps a zero count from ending the script before the rollback.
for page in about privacy data-sources; do
  n=$(curl -s -m 60 "https://nomuvia.com/$page?lang=es" | grep -o 'tour-info-links' | wc -l || true)
  echo "/$page: $n bloque(s) de enlaces"
  [ "$n" = 1 ] || rollback "/$page tiene $n bloques de enlaces"
done

step "6/6 Listo"
echo "Release activa: $(sudo -n readlink -f /srv/tour-guide/current)"
echo "Anterior para revertir: $OLD"
rm -rf "$STAGE" /tmp/nomuvia-catalog.json /tmp/nomuvia-tour.html /tmp/nomuvia-about.html /tmp/nomuvia-release-20261002d.tgz
REMOTE
