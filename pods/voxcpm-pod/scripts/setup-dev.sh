#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."

python3.10 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
mkdir -p cache

python - <<'PY'
from voxcpm import VoxCPM
VoxCPM.from_pretrained("openbmb/VoxCPM2", load_denoiser=False)
print("VoxCPM2 warmup complete")
PY
