#!/usr/bin/env bash
# Phase A of the catalogue plan: gzip/zstd at the edge and a 5-minute cache of the admitted catalogue.
# Backs up the two files it touches, validates Caddy before reloading, checks the public site and
# restores both files if anything fails. No release, build or database change.
set -euo pipefail

HOST=nomuvia-admin@88.99.175.28
KEY="$HOME/.ssh/tour-guide-hetzner"
REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CADDYFILE="$REPO/deployment/pilot/Caddyfile.nomuvia-public"
scp -q -i "$KEY" "$CADDYFILE" "$HOST:/tmp/Caddyfile.nomuvia-encode"

ssh -i "$KEY" "$HOST" 'bash -s' <<'REMOTE'
set -euo pipefail
# sha256 of the Caddyfile that is active today (the repo file before `encode zstd gzip`).
OLD_SHA=124c963fbf1fa0917c1ded4d3b66fb4f7e26fb02ad501f1185771d4751692212
STAMP=20261002
step() { echo; echo "== $*"; }
fail() { echo "ERROR: $*"; exit 1; }

step "1/5 Comprobaciones previas"
[ "$(sudo -n sha256sum /etc/caddy/Caddyfile | cut -d' ' -f1)" = "$OLD_SHA" ] || fail "el Caddyfile activo no es el esperado"
grep -q '^    encode zstd gzip$' /tmp/Caddyfile.nomuvia-encode || fail "el Caddyfile nuevo no trae encode"
sudo -n test -e "/etc/caddy/Caddyfile.before-encode-$STAMP" && fail "ya existe la copia de seguridad del Caddyfile"
sudo -n test -e "/etc/tour-guide/backend.env.before-cache-$STAMP" && fail "ya existe la copia de seguridad de backend.env"
if sudo -n grep -q '^PILOT_CATALOG_CACHE_MS=' /etc/tour-guide/backend.env; then fail "backend.env ya define PILOT_CATALOG_CACHE_MS"; fi
sudo -n sh -c 'set -a; . /etc/tour-guide/proxy.env; set +a; caddy validate --adapter caddyfile --config /tmp/Caddyfile.nomuvia-encode' >/dev/null 2>&1 || fail "Caddy no valida el Caddyfile nuevo"
declare -A BEFORE
for lang in es en fr de it; do
  curl -s -o /tmp/nomuvia-catalog.json -m 150 "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=200" || fail "catálogo $lang no responde"
  BEFORE[$lang]=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["total"])')
done
echo "OK. Catálogo antes: es=${BEFORE[es]} en=${BEFORE[en]} fr=${BEFORE[fr]} de=${BEFORE[de]} it=${BEFORE[it]}"

restore() {
  echo "FALLO: $*. Restauro los dos ficheros"
  sudo -n cp -a "/etc/caddy/Caddyfile.before-encode-$STAMP" /etc/caddy/Caddyfile
  sudo -n cp -a "/etc/tour-guide/backend.env.before-cache-$STAMP" /etc/tour-guide/backend.env
  sudo -n systemctl reload caddy || true
  sudo -n systemctl restart nomuvia-backend
  exit 1
}

step "2/5 Compresión en Caddy"
sudo -n cp -a /etc/caddy/Caddyfile "/etc/caddy/Caddyfile.before-encode-$STAMP"
sudo -n cp -a /etc/tour-guide/backend.env "/etc/tour-guide/backend.env.before-cache-$STAMP"
sudo -n install -o root -g caddy -m 640 /tmp/Caddyfile.nomuvia-encode /etc/caddy/Caddyfile
sudo -n systemctl reload caddy || restore "caddy no recargó"
sleep 2
systemctl is-active --quiet caddy || restore "caddy inactivo"
enc=$(curl -s -o /dev/null -m 60 -D - -H 'Accept-Encoding: gzip' "https://nomuvia.com/api/backend/tours?language=es&readyOnly=true&limit=200" | tr -d '\r' | grep -i '^content-encoding' || true)
echo "cabecera: ${enc:-<ninguna>}"
[ -n "$enc" ] || restore "el catálogo no llega comprimido"
code=$(curl -s -o /dev/null -m 30 -H 'Range: bytes=0-1023' -H 'Accept-Encoding: gzip' -w '%{http_code}' "https://nomuvia.com$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["tours"][0]["places"][0]["audioUrl"])')")
echo "audio con rango y gzip aceptado: HTTP $code"
[ "$code" = 206 ] || restore "el audio con rango no responde 206"

step "3/5 Caché del catálogo (5 minutos)"
echo 'PILOT_CATALOG_CACHE_MS=300000' | sudo -n tee -a /etc/tour-guide/backend.env >/dev/null
sudo -n systemctl restart nomuvia-backend
for _ in $(seq 1 30); do sleep 2; systemctl is-active --quiet nomuvia-backend && curl -s -o /dev/null -m 5 http://127.0.0.1:3000/ && break; done
systemctl is-active --quiet nomuvia-backend || restore "backend inactivo"

step "4/5 Comprobando"
for lang in es en fr de it; do
  out=$(curl -s -o /tmp/nomuvia-catalog.json -m 150 -w '%{http_code} %{time_total} %{size_download}' "https://nomuvia.com/api/backend/tours?language=$lang&readyOnly=true&limit=200") || restore "catálogo $lang sin respuesta"
  [ "${out%% *}" = 200 ] || restore "catálogo $lang HTTP ${out%% *}"
  total=$(python3 -c 'import json;print(json.load(open("/tmp/nomuvia-catalog.json"))["data"]["total"])')
  [ "$total" = "${BEFORE[$lang]}" ] || restore "catálogo $lang tiene $total tours, antes ${BEFORE[$lang]}"
  echo "catálogo $lang: $out, total $total"
done
for i in 1 2 3; do curl -s -o /dev/null -m 60 -w "es (caché) #$i: %{time_total}s\n" "https://nomuvia.com/api/backend/tours?language=es&readyOnly=true&limit=200"; done
code=$(curl -s -o /dev/null -m 30 -w '%{http_code}' https://nomuvia.com/tours); [ "$code" = 200 ] || restore "/tours HTTP $code"

step "5/5 Listo"
echo "Copias: /etc/caddy/Caddyfile.before-encode-$STAMP y /etc/tour-guide/backend.env.before-cache-$STAMP"
rm -f /tmp/Caddyfile.nomuvia-encode /tmp/nomuvia-catalog.json
REMOTE
