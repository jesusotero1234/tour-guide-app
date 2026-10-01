"""Run the three frozen experimental presets through the existing renderer."""
import json
import os
from pathlib import Path
import subprocess
import sys

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
RENDERER = ROOT / 'pods/voxcpm-pod/scripts/render-tour.py'


def main():
    manifest = json.loads((OUT / 'manifest.json').read_text())
    for variant in manifest['variants']:
        name = variant['id']
        env = dict(os.environ, VOXCPM_PRESET_PATH=str(OUT / (name + '.preset.json')))
        print('Rendering ' + name, flush=True)
        subprocess.run([
            sys.executable, str(RENDERER), '--input', str(OUT / 'input.json'),
            '--output', str(OUT / name), '--progress', str(OUT / (name + '.progress.json')),
        ], env=env, check=True)


if __name__ == '__main__':
    main()
