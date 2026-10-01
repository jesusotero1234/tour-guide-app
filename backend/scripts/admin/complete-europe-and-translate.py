#!/usr/bin/env python3
"""Recover the remaining Spanish tours, finish their audio, then translate all 30."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import sys
import time
from datetime import datetime, timezone

import phase_receipts


BACKEND = Path(__file__).resolve().parents[2]
BATCH = BACKEND / 'tmp/pilot-batch-europe-20260920'
RUNS = BACKEND / 'tmp/narrative-v8'
SUPERVISOR = Path(__file__).with_name('deepseek-europe-supervise.py')
TRANSLATOR = Path(__file__).with_name('translate-europe-batch.py')
NODE = Path('/home/jesusotero/.nvm/versions/node/v22.19.0/bin/node')
STATE = BATCH / 'completion-and-translation-state.json'
LOG = BATCH / 'completion-and-translation.log'
SEARXNG = BACKEND.parent / 'scripts/searxng-local.sh'
RECOVERY = ('berlin', 'bologna', 'torino', 'nantes', 'nuremberg', 'montpellier')
PREPARE = ('berlin', 'bologna')


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def alive(pid):
    return isinstance(pid, int) and Path('/proc', str(pid)).is_dir()


def additional_exposure(slug):
    prefix = 'pilot-europe-20260920-' + slug
    exposure = 0.0
    for directory in RUNS.glob(prefix + '*'):
        budget = directory / 'budget.private.json'
        if not budget.exists():
            continue
        value = read(budget)
        exposure += max(0, value.get('spentUsd', 0) - value.get('historicalSpentUsd', 0)) \
                    + value.get('reservedUsd', 0)
    return exposure


def reset_preparation(slug, stamp):
    directory = BATCH / slug
    old = read(directory / 'prepare-recovery.json') if (directory / 'prepare-recovery.json').exists() else {}
    save(directory / 'prepare-recovery.json', {
        'runSuffix': 'completion-' + stamp,
        'priorSpendUsd': max(float(old.get('priorSpendUsd', 0)), additional_exposure(slug)),
        'previousRunId': old.get('previousRunId'),
        'reason': ('Fresh Berlin route without the optional Gendarmenmarkt evidence blocker.' if slug == 'berlin'
                   else 'Fresh retry after the transient walking provider outage.'),
    })


def prepare_queue():
    queue = read(BATCH / 'queue-status.json')
    if alive(queue.get('pid')):
        raise RuntimeError('The European supervisor is already running')
    manifest = read(BATCH / 'manifest.json')
    berlin = next(city for city in manifest['cities'] if city['slug'] == 'berlin')
    assert berlin['pinnedIds'] == ['Q151897', 'Q82425', 'Q160700', 'Q152252', 'Q819081', 'Q68689']
    assert 'Q170103' in berlin['excludedIds']
    for slug, stages in queue['cities'].items():
        if slug not in RECOVERY:
            for stage in ('prepare', 'text', 'audio'):
                if not phase_receipts.verify(BATCH / slug, stage):
                    raise RuntimeError('Previously completed output changed: ' + slug + '/' + stage)
    stamp = datetime.now().strftime('%Y%m%dT%H%M%S')
    for slug in PREPARE:
        reset_preparation(slug, stamp)
        previous = queue['cities'][slug]
        queue['cities'][slug] = {
            'prepare': {'phase': 'queued', 'history': [previous['prepare']]},
            'text': {'phase': 'queued', 'history': [previous['text']]},
            'audio': {'phase': 'queued', 'history': [previous['audio']]},
        }
    for slug in set(RECOVERY) - set(PREPARE):
        stages = queue['cities'][slug]
        if not phase_receipts.verify(BATCH / slug, 'prepare'):
            raise RuntimeError('Validated preparation missing: ' + slug)
        previous_text, previous_audio = stages['text'], stages['audio']
        stages['prepare'] = {'phase': 'prepared', 'validatedReceipt': str(BATCH / slug / 'receipts/prepare.json')}
        stages['text'] = {'phase': 'queued', 'history': [previous_text]}
        stages['audio'] = {'phase': 'queued', 'history': [previous_audio]}
    queue.update(phase='paused', processAlive=False, preparationBlocked=None, updatedAt=now())
    save(BATCH / 'queue-status.json', queue)
    state = {'pid': os.getpid(), 'phase': 'spanish_recovery_queued', 'startedAt': now(),
             'recoveryCities': list(RECOVERY), 'translationLanguages': ['en', 'fr', 'de', 'it']}
    save(STATE, state)
    return state


def validate_spanish():
    manifest = read(BATCH / 'manifest.json')
    missing = [city['slug'] + '/' + stage for city in manifest['cities'] for stage in ('prepare', 'text', 'audio')
               if not phase_receipts.verify(BATCH / city['slug'], stage)]
    if missing:
        raise RuntimeError('Spanish recovery incomplete: ' + ', '.join(missing))


def ensure_research_services():
    with LOG.open('a') as output:
        subprocess.run(['bash', str(SEARXNG), 'up'], cwd=BACKEND.parent,
                       stdin=subprocess.DEVNULL, stdout=output, stderr=output, check=True)


def run():
    ensure_research_services()
    state = prepare_queue()
    environment = {**os.environ, 'STATIC_OSM_FALLBACK': '1', 'PYTHONUNBUFFERED': '1',
                   'PATH': str(NODE.parent) + os.pathsep + os.environ.get('PATH', '')}
    state.update(phase='spanish_recovery_running', updatedAt=now())
    save(STATE, state)
    with LOG.open('a') as output:
        recovered = subprocess.run([sys.executable, '-u', str(SUPERVISOR), '--all-texts-first'],
                                   cwd=BACKEND, env=environment, stdin=subprocess.DEVNULL,
                                   stdout=output, stderr=output)
    state.update(spanishSupervisorExitCode=recovered.returncode, updatedAt=now())
    save(STATE, state)
    validate_spanish()
    state.update(phase='translations_running', translationStartedAt=now())
    save(STATE, state)
    with LOG.open('a') as output:
        translated = subprocess.run([sys.executable, '-u', str(TRANSLATOR)], cwd=BACKEND,
                                    env=environment, stdin=subprocess.DEVNULL,
                                    stdout=output, stderr=output)
    status = read(BATCH / 'translation-status.json')
    if translated.returncode or status.get('phase') != 'completed':
        raise RuntimeError('Translation queue completed with errors; see translation-status.json')
    state.update(phase='completed', translationExitCode=translated.returncode, finishedAt=now())
    save(STATE, state)


def launch():
    if STATE.exists():
        old = read(STATE)
        if alive(old.get('pid')) and old.get('phase') != 'completed':
            print('Completion worker already running: ' + str(old['pid']))
            return 0
    output = LOG.open('a')
    process = subprocess.Popen([sys.executable, '-u', str(Path(__file__).resolve()), '--run'],
                               cwd=BACKEND, stdin=subprocess.DEVNULL, stdout=output, stderr=output,
                               start_new_session=True)
    save(STATE, {'pid': process.pid, 'phase': 'launching', 'startedAt': now()})
    print('Completion and translation worker PID', process.pid)
    return 0


def follow(pid):
    while alive(pid):
        time.sleep(15)
    return launch()


def main():
    assert SUPERVISOR.is_file() and TRANSLATOR.is_file() and NODE.is_file() and SEARXNG.is_file()
    if '--check' in sys.argv:
        print('Completion chain valid: six recoveries, 30 Spanish gates, four translation languages')
        return 0
    follower = next((arg for arg in sys.argv if arg.startswith('--follow=')), None)
    if follower:
        return follow(int(follower.split('=', 1)[1]))
    if '--run' not in sys.argv:
        return launch()
    try:
        run()
        return 0
    except Exception as error:
        state = read(STATE) if STATE.exists() else {'pid': os.getpid()}
        state.update(phase='error', error=str(error), finishedAt=now())
        save(STATE, state)
        print(str(error), file=sys.stderr, flush=True)
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
