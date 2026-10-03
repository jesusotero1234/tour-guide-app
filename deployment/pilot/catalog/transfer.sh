#!/usr/bin/env bash
set -Eeuo pipefail
# Archived from the 2026-09-22 European launch. Release-specific names are kept on purpose: see README.md.
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
stage="${STAGE:?set STAGE to the local staging directory of the release}"
remote="${HOST:-nomuvia-admin@88.99.175.28}"
ssh_args=(-i "${KEY:-$HOME/.ssh/tour-guide-hetzner}" -o IdentitiesOnly=yes -o BatchMode=yes)
mkdir -p "$stage/code/backend/src/domain" "$stage/code/frontend/src/lib" "$stage/code/frontend/scripts"
cp "$repo/backend/src/domain/cityNames.ts" "$repo/backend/src/domain/cityNames.test.ts" "$stage/code/backend/src/domain/"
cp "$repo/frontend/src/lib/seoInventory.ts" "$repo/frontend/src/lib/seoServer.ts" "$stage/code/frontend/src/lib/"
cp "$repo/frontend/scripts/test-seo.cjs" "$stage/code/frontend/scripts/"
chmod 700 "$stage/build.sh" "$stage/install.sh"
ssh "${ssh_args[@]}" "$remote" 'umask 077; mkdir -p /home/nomuvia-admin/nomuvia-europe-20260922'
rsync -a --exclude audio -e "ssh ${ssh_args[*]}" "$stage/" "$remote:/home/nomuvia-admin/nomuvia-europe-20260922/"
printf 'Small release files transferred\n'
