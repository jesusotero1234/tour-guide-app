#!/usr/bin/env bash
set -Eeuo pipefail
stage=/home/nomuvia-admin/nomuvia-europe-20260922
build=/home/nomuvia-admin/nomuvia-europe-build-20260922
[[ ! -e "$build" ]]
sudo -n cp -a /srv/tour-guide/current/. "$build"
sudo -n chown -R nomuvia-admin:nomuvia-admin "$build"
cp "$stage/code/backend/src/domain/cityNames.ts" "$build/backend/src/domain/cityNames.ts"
cp "$stage/code/backend/src/domain/cityNames.test.ts" "$build/backend/src/domain/cityNames.test.ts"
for file in src/lib/seoInventory.ts src/lib/seoServer.ts scripts/test-seo.cjs; do
  cp "$stage/code/frontend/$file" "$build/frontend/$file"
done
export PATH=/opt/nomuvia-node/bin:$PATH
cd "$build/backend"
node node_modules/typescript/bin/tsc
cd "$build/frontend"
npm run build > /home/nomuvia-admin/nomuvia-europe-frontend-build.log 2>&1
CADDY_BIN=/usr/bin/caddy node scripts/test-seo.cjs > /home/nomuvia-admin/nomuvia-europe-seo-test.log 2>&1
printf 'Europe candidate built and SEO regression passed\n'
