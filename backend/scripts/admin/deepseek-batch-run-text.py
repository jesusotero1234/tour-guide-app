#!/usr/bin/env python3
"""Run at most two city text jobs while the existing preparation batch advances."""
import os
import json
from pathlib import Path
import subprocess
import sys
import time

backend = Path(__file__).resolve().parents[2]
batch = Path(os.environ.get('BATCH_STAGE') or backend / 'tmp/pilot-batch-spain-20260912')
manifest = json.loads((batch / 'manifest.json').read_text())
# Madrid was launched first and is monitored separately in this initial batch.
pending = [city['slug'] for city in manifest['cities'] if city['slug'] not in sys.argv[1:]]
running, completed, failures = {}, [], {}
started = time.monotonic()
while pending or running:
    for city, (child, log) in list(running.items()):
        code = child.poll()
        if code is not None:
            log.close()
            del running[city]
            if code == 0:
                completed.append(city)
            else:
                failures[city] = 'Text job failed; see city/text.log and summary.json'
            print(json.dumps({'city': city, 'phase': 'texts_finished', 'exitCode': code}), flush=True)
    prep_done = batch / 'preparation-summary.json'
    prep_failures = ({item['city']: item['error'] for item in json.loads(prep_done.read_text())['failures']}
                     if prep_done.exists() else {})
    for city in list(pending):
        if len(running) >= 2:
            break
        directory = batch / city
        if city in prep_failures:
            failures[city] = prep_failures[city]
            pending.remove(city)
        elif (directory / 'inputs.json').exists() and (directory / 'combined-prompt.md').exists():
            log = (directory / 'text.log').open('a')
            child = subprocess.Popen([sys.executable, str(backend / 'scripts/admin/deepseek-batch-text.py'),
                                      '--city-dir', str(directory), '--execute'], stdout=log, stderr=log)
            running[city] = (child, log)
            pending.remove(city)
            print(json.dumps({'city': city, 'phase': 'texts_started', 'pid': child.pid}), flush=True)
    state = {'pending': pending, 'running': list(running), 'completed': completed, 'failures': failures}
    target = batch / 'text-batch-state.json'
    temporary = target.with_suffix('.tmp')
    temporary.write_text(json.dumps(state, indent=2) + '\n')
    temporary.replace(target)
    if pending and time.monotonic() - started > 6 * 3600:
        raise SystemExit('Preparation wait exceeded six hours; completed artifacts retained')
    if pending or running:
        time.sleep(5)
raise SystemExit(1 if failures else 0)
