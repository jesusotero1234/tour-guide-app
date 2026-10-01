#!/usr/bin/env python3
"""Run one preserved final recovery after the reviewed Berlin replacement."""
import fcntl
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone


BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
BATCH = BACKEND / 'tmp/pilot-batch-europe-20260920'
STATE = BATCH / 'final-recovery-state.json'
PREPARE_CITIES = ('toulouse', 'bologna', 'montpellier')
TEXT_CITIES = ('strasbourg', 'torino', 'dresden', 'nantes', 'nuremberg')
NODE = Path('/home/jesusotero/.nvm/versions/node/v22.19.0/bin/node')


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def process_alive(pid):
    return isinstance(pid, int) and Path('/proc', str(pid)).is_dir()


def wait_for_berlin():
    pid_file = BATCH / 'berlin-route-revision-watcher.pid'
    while pid_file.exists() and process_alive(int(pid_file.read_text())):
        time.sleep(30)


def fresh_preparation(slug, stamp, manifest):
    directory = BATCH / slug
    recovery_path = directory / 'prepare-recovery.json'
    recovery = read(recovery_path)
    old_run = manifest['runId'] + '-' + slug + '-' + recovery['runSuffix']
    budget_path = BACKEND / 'tmp/narrative-v8' / old_run / 'budget.private.json'
    prior = recovery.get('priorSpendUsd', 0)
    if budget_path.is_file():
        prior = max(prior, read(budget_path)['spentUsd'])
    suffix = 'final-recovery-' + stamp
    save(recovery_path, {
        'runSuffix': suffix,
        'priorSpendUsd': prior,
        'previousRunId': old_run,
        'reason': 'Fresh route after a saved checkpoint became incompatible or a reviewed optional stop failed its evidence gate.',
    })
    return {'previousRunId': old_run, 'runSuffix': suffix, 'priorSpendUsd': prior}


def archive_editorial(slug, stamp):
    directory = BATCH / slug
    source = directory / 'editorial'
    archive = directory / 'editorial-attempts' / ('final-recovery-' + stamp)
    archive.parent.mkdir(parents=True, exist_ok=True)
    if source.exists() and not archive.exists():
        source.rename(archive)
    if not archive.is_dir():
        raise RuntimeError('Missing preserved editorial attempt for ' + slug)

    budget_path = directory / 'editorial-budget.json'
    budget = read(budget_path)
    remapped = {}
    source_prefix = str(source.resolve()) + os.sep
    archive_prefix = str(archive.resolve()) + os.sep
    for key, value in budget['requests'].items():
        if key.startswith(source_prefix):
            key = archive_prefix + key[len(source_prefix):]
        if key in remapped:
            raise RuntimeError('Duplicate editorial budget binding for ' + slug)
        remapped[key] = value
    budget['requests'] = remapped
    save(budget_path, budget)

    slots = directory / 'contract-repair-slots.json'
    slots_archive = archive.parent / (archive.name + '-contract-repair-slots.json')
    if slots.exists() and not slots_archive.exists():
        slots.rename(slots_archive)
    return str(archive)


def prepare_recovery():
    manifest = read(BATCH / 'manifest.json')
    berlin = next(row for row in manifest['cities'] if row['slug'] == 'berlin')
    montpellier = next(row for row in manifest['cities'] if row['slug'] == 'montpellier')
    assert berlin.get('excludedIds') == ['Q146138', 'Q151963', 'Q157298', 'Q156716', 'Q170103']
    assert montpellier.get('excludedIds') == ['Q3100546']
    if STATE.exists():
        state = read(STATE)
        stamp = state['stamp']
    else:
        stamp = datetime.now().strftime('%Y%m%dT%H%M%S')
        state = {'status': 'preparing', 'stamp': stamp, 'startedAt': now(),
                 'prepareCities': list(PREPARE_CITIES), 'textCities': list(TEXT_CITIES)}
        save(STATE, state)

    queue = read(BATCH / 'queue-status.json')
    if process_alive(queue.get('pid')):
        raise RuntimeError('A generation supervisor is still running')
    preparations = {}
    for slug in PREPARE_CITIES:
        previous = queue['cities'][slug]['prepare']
        if previous['phase'] != 'error':
            raise RuntimeError(slug + ' preparation is no longer in the expected failed state')
        preparations[slug] = fresh_preparation(slug, stamp, manifest)
        queue['cities'][slug]['prepare'] = {'phase': 'queued', 'history': [previous]}
    archives = {}
    for slug in TEXT_CITIES:
        stages = queue['cities'][slug]
        if stages['prepare']['phase'] != 'prepared' or stages['text']['phase'] != 'error':
            raise RuntimeError(slug + ' text is no longer in the expected recoverable state')
        archives[slug] = archive_editorial(slug, stamp)
        stages['text'] = {'phase': 'queued', 'history': [stages['text']]}
    queue.update(phase='paused', processAlive=False, updatedAt=now())
    save(BATCH / 'queue-status.json', queue)
    state.update(status='prepared', preparations=preparations, editorialArchives=archives, updatedAt=now())
    save(STATE, state)
    return state


def launch():
    environment = {**os.environ, 'STATIC_OSM_FALLBACK': '1',
                   'PATH': str(NODE.parent) + os.pathsep + os.environ.get('PATH', '')}
    command = [sys.executable, '-u', str(Path(__file__).with_name('deepseek-europe-supervise.py')),
               '--all-texts-first']
    output = (BATCH / 'shared-map-control-supervisor.log').open('a')
    process = subprocess.Popen(command, cwd=BACKEND, env=environment, stdin=subprocess.DEVNULL,
                               stdout=output, stderr=output, start_new_session=True)
    state = read(STATE)
    state.update(status='launched', supervisorPid=process.pid, launchedAt=now())
    save(STATE, state)
    save(BATCH / 'final-recovery-launch.json', {'startedAt': now(), 'pid': process.pid,
         'command': command, 'state': str(STATE)})
    return process.pid


def main():
    if '--check' in sys.argv:
        manifest = read(BATCH / 'manifest.json')
        assert len(manifest['cities']) == 30 and NODE.is_file()
        print('Final recovery worker valid: ' + ','.join((*PREPARE_CITIES, *TEXT_CITIES)))
        return
    wait_for_berlin()
    with (BATCH / 'queue.lock').open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        prepare_recovery()
    print('Final recovery supervisor PID', launch(), flush=True)


if __name__ == '__main__':
    main()
