#!/usr/bin/env bash
# Uploads a catalogue update package (plan 04 section 10) to the server and, with INSTALL=1, runs the installer there.
# Needs the user's explicit authorisation: it connects to production over SSH. Nothing is installed unless INSTALL=1.
#   deployment/pilot/catalog/update-transfer.sh <package-dir>            upload and verify only
#   INSTALL=1 deployment/pilot/catalog/update-transfer.sh <package-dir>  upload, then install
set -Eeuo pipefail
package="${1:?usage: update-transfer.sh <package-dir>  (the folder written by catalog-regeneration package)}"
repo="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
remote="${HOST:-nomuvia-admin@88.99.175.28}"
ssh_args=(-i "${KEY:-$HOME/.ssh/tour-guide-hetzner}" -o IdentitiesOnly=yes -o BatchMode=yes)
[[ -s "$package/catalog-update.json" && -s "$package/audio.sha256" && -d "$package/audio" ]] || { echo "not a package folder: $package" >&2; exit 1; }
run=$(python3 -c 'import json,sys;print(json.load(open(sys.argv[1]))["regenRunId"])' "$package/catalog-update.json")
[[ "$run" =~ ^[0-9a-f-]{36}$ ]] || { echo "unexpected regenRunId" >&2; exit 1; }
(cd "$package/audio" && sha256sum -c ../audio.sha256 --quiet) || { echo "the local audio does not match audio.sha256" >&2; exit 1; }
dest="/home/nomuvia-admin/nomuvia-update-$run"
ssh "${ssh_args[@]}" "$remote" "umask 077; [[ ! -e '$dest' ]] && mkdir -p '$dest'"      # a second upload of the same run is refused
cp "$repo/deployment/pilot/catalog/remote-update.cjs" "$repo/deployment/pilot/catalog/update-install.sh" "$package/"
chmod 700 "$package/update-install.sh"
rsync -a -e "ssh ${ssh_args[*]}" "$package/" "$remote:$dest/"
ssh "${ssh_args[@]}" "$remote" "cd '$dest/audio' && sha256sum -c ../audio.sha256 --quiet" && echo "Package uploaded and verified on the server: $dest"
rm -f "$package/remote-update.cjs" "$package/update-install.sh"
if [[ "${INSTALL:-0}" == 1 ]]; then
  ssh -t "${ssh_args[@]}" "$remote" "sudo -n bash '$dest/update-install.sh' '$dest'"
else
  echo "Not installed. To install: INSTALL=1 $0 $package"
fi
