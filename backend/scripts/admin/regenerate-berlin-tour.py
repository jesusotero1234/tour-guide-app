#!/usr/bin/env python3
"""Replace Berlin with the reviewed Reichstag-and-Wall route after the active batch."""
import fcntl
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import time
from datetime import datetime, timezone

import phase_receipts


BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
BATCH = Path(os.environ.get('BATCH_STAGE') or BACKEND / 'tmp/pilot-batch-europe-20260920')
CITY = BATCH / 'berlin'
STATE = BATCH / 'berlin-route-revision-state.json'
NODE = Path(os.environ.get('NODE_BIN') or shutil.which('node') or 'node')
PINNED_IDS = ['Q151897', 'Q82425', 'Q160700', 'Q152252', 'Q819081', 'Q68689']
EXCLUDED_IDS = ['Q146138', 'Q151963', 'Q157298', 'Q156716', 'Q170103']
COORDINATOR_MARKERS = (b'deepseek-europe-supervise.py', b'restart-europe-batch.py')


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def coordinating_processes():
    found = []
    for command_file in Path('/proc').glob('[0-9]*/cmdline'):
        try:
            command = command_file.read_bytes()
        except OSError:
            continue
        if any(marker in command for marker in COORDINATOR_MARKERS):
            found.append(int(command_file.parent.name))
    return sorted(found)


def update_queue(stage, phase, **details):
    path = BATCH / 'queue-status.json'
    queue = read(path)
    queue['pid'] = os.getpid()
    queue['updatedAt'] = now()
    queue['phase'] = 'running' if phase not in ('completed', 'error') else queue.get('phase', 'running')
    queue['processAlive'] = phase not in ('completed', 'error')
    queue['cities']['berlin'][stage] = {'phase': phase, **details}
    save(path, queue)


def update_state(**changes):
    if STATE.exists():
        state = read(STATE)
    else:
        state = {'pinnedIds': PINNED_IDS, 'completedStages': []}
    state.update(changes, updatedAt=now())
    save(STATE, state)


def prepare_workspace():
    if STATE.exists():
        state = read(STATE)
        archive = state.get('archive')
        if archive is not None and (state.get('pinnedIds') != PINNED_IDS
                                    or state.get('excludedIds') != EXCLUDED_IDS
                                    or not Path(archive).is_dir()):
            raise RuntimeError('Saved Berlin revision state is incompatible')
        if archive is not None:
            return state
    old_preparation = read(CITY / 'preparation.json')
    stamp = datetime.now().strftime('%Y%m%dT%H%M%S')
    archive = BATCH / 'recovery-history' / ('berlin-before-reichstag-wall-' + stamp)
    archive.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(CITY, archive)
    destination = (CITY / 'destination.json').read_bytes()
    shutil.rmtree(CITY)
    CITY.mkdir(mode=0o700)
    (CITY / 'destination.json').write_bytes(destination)
    run_suffix = 'reichstag-wall-' + stamp
    save(CITY / 'prepare-recovery.json', {
        'runSuffix': run_suffix,
        'priorSpendUsd': old_preparation['budget']['spentUsd'],
        'previousRunId': old_preparation['runId'],
        'reason': 'User-reviewed Berlin replacement: Reichstag, Brandenburg Gate, Topography of Terror and Checkpoint Charlie are protected.',
    })
    state = {'status': 'workspace_ready', 'startedAt': state.get('startedAt', now()) if STATE.exists() else now(),
             'workerPid': os.getpid(), 'archive': str(archive), 'runSuffix': run_suffix,
             'pinnedIds': PINNED_IDS, 'excludedIds': EXCLUDED_IDS, 'completedStages': []}
    save(STATE, state)
    queue = read(BATCH / 'queue-status.json')
    previous = queue['cities']['berlin']
    queue['cities']['berlin'] = {
        'prepare': {'phase': 'queued', 'history': [previous['prepare']]},
        'text': {'phase': 'queued', 'history': [previous['text']]},
        'audio': {'phase': 'queued', 'history': [previous['audio']]},
    }
    queue.update(pid=os.getpid(), updatedAt=now(), phase='running', processAlive=True)
    save(BATCH / 'queue-status.json', queue)
    return state


def command(stage):
    scripts = BACKEND / 'scripts/admin'
    if stage == 'prepare':
        payload = [str(NODE), '-r', 'ts-node/register/transpile-only',
                   str(scripts / 'deepseek-europe-prepare.cjs'), 'berlin']
    elif stage == 'text':
        payload = [sys.executable, '-u', str(scripts / 'deepseek-batch-text.py'),
                   '--city-dir', str(CITY), '--languages=es', '--execute']
    else:
        payload = [str(NODE), '-r', 'ts-node/register/transpile-only',
                   str(scripts / 'deepseek-europe-audio.cjs'), 'berlin']
        if (CITY / 'tts-job/input.json').is_file():
            payload.append('--resume')
    return [sys.executable, str(scripts / 'phase_guard.py'), str(CITY), stage, *payload]


def run_stage(stage, state):
    if phase_receipts.verify(CITY, stage):
        if stage not in state['completedStages']:
            state['completedStages'].append(stage)
            save(STATE, state)
        return
    update_queue(stage, {'prepare': 'preparing', 'text': 'writing', 'audio': 'rendering'}[stage],
                 startedAt=now(), pid=os.getpid())
    environment = {**os.environ, 'PYTHONUNBUFFERED': '1', 'STATIC_OSM_FALLBACK': '1',
                   'DEEPSEEK_RECOVER_INTERRUPTED': '1', 'DEEPSEEK_RELIABILITY_PILOT': '1',
                   'VOXCPM_BATCH_TIMEOUT_SECONDS': '10800',
                   'PATH': str(NODE.parent) + os.pathsep + os.environ.get('PATH', '')}
    with (CITY / (stage + '-revision-runner.log')).open('a') as log:
        result = subprocess.run(command(stage), cwd=BACKEND, env=environment,
                                stdin=subprocess.DEVNULL, stdout=log, stderr=log)
    if result.returncode:
        update_queue(stage, 'error', exitCode=result.returncode, finishedAt=now(),
                     reason='berlin_route_revision_failed', message='See ' + stage + '-revision-runner.log')
        raise RuntimeError(f'Berlin {stage} failed with exit code {result.returncode}')
    phase_receipts.create(CITY, stage)
    if not phase_receipts.verify(CITY, stage):
        raise RuntimeError(f'Berlin {stage} receipt did not verify')
    state['completedStages'].append(stage)
    state['status'] = stage + '_completed'
    save(STATE, state)
    update_queue(stage, {'prepare': 'prepared', 'text': 'ready', 'audio': 'completed'}[stage],
                 exitCode=0, finishedAt=now(), validatedReceipt=str(CITY / 'receipts' / (stage + '.json')))


def main():
    if '--check' in sys.argv:
        manifest = read(BATCH / 'manifest.json')
        berlin = next(city for city in manifest['cities'] if city['slug'] == 'berlin')
        assert berlin.get('pinnedIds') == PINNED_IDS
        assert berlin.get('excludedIds') == EXCLUDED_IDS and NODE.is_file()
        print('Berlin revision worker valid: ' + ','.join(PINNED_IDS))
        return
    active = coordinating_processes()
    update_state(status='waiting_for_active_batch', waitingForPids=active,
                 workerPid=os.getpid(), startedAt=now())
    while active:
        time.sleep(30)
        active = coordinating_processes()
        update_state(status='waiting_for_active_batch', waitingForPids=active,
                     workerPid=os.getpid())
    with (BATCH / 'queue.lock').open('a+') as queue_lock:
        fcntl.flock(queue_lock, fcntl.LOCK_EX)
        # A supervisor may have started between the scan and the lock.
        active = coordinating_processes()
        while active:
            fcntl.flock(queue_lock, fcntl.LOCK_UN)
            time.sleep(30)
            fcntl.flock(queue_lock, fcntl.LOCK_EX)
            active = coordinating_processes()
            update_state(status='waiting_for_active_batch', waitingForPids=active,
                         workerPid=os.getpid())
        state = prepare_workspace()
        try:
            for stage in ('prepare', 'text', 'audio'):
                run_stage(stage, state)
            state.update(status='completed', finishedAt=now())
            save(STATE, state)
            queue = read(BATCH / 'queue-status.json')
            has_errors = any(stages[phase]['phase'] in ('error', 'blocked')
                             for stages in queue['cities'].values() for phase in ('prepare', 'text', 'audio'))
            queue.update(updatedAt=now(), phase='completed_with_errors' if has_errors else 'completed',
                         processAlive=False)
            save(BATCH / 'queue-status.json', queue)
            with (CITY / 'page-revision.log').open('a') as log:
                subprocess.run([str(ROOT / 'pods/voxcpm-pod/.venv/bin/python'),
                                str(BACKEND / 'scripts/admin/deepseek-europe-page.py')],
                               cwd=BACKEND, stdout=log, stderr=log, check=True)
        except Exception as error:
            state.update(status='error', error=str(error), finishedAt=now())
            save(STATE, state)
            raise


if __name__ == '__main__':
    main()
