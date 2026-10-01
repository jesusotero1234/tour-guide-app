#!/usr/bin/env python3
"""Translate every validated European Spanish master with a resumable local queue."""
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
SCRIPT = Path(__file__).with_name('deepseek-batch-text.py')
LANGUAGES = ('en', 'fr', 'de', 'it')
LIMIT = 4


def now():
    return datetime.now(timezone.utc).isoformat()


def read(path):
    return json.loads(Path(path).read_text())


def save(path, value):
    path = Path(path)
    temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    temporary.replace(path)


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def completed_languages(slug):
    directory = BATCH / slug
    master = read(directory / 'final/es.json')
    complete = []
    for language in LANGUAGES:
        path = directory / 'final' / (language + '.json')
        try:
            value = read(path)
            review = Path(value['review']['artifactPath'])
            if (value['language'] == language and value['sourceLanguage'] == 'es'
                    and value['masterSha256'] == master['masterSha256']
                    and value['review']['status'] == 'SUFFICIENT_IN_REVIEW_SCOPE'
                    and review.is_file() and sha(review) == value['review']['artifactSha256']):
                complete.append(language)
        except (OSError, ValueError, KeyError, TypeError):
            pass
    return complete


def spanish_gate(slugs):
    failures = []
    for slug in slugs:
        directory = BATCH / slug
        for stage in ('prepare', 'text', 'audio'):
            if not phase_receipts.verify(directory, stage):
                failures.append(slug + '/' + stage)
    if failures:
        raise RuntimeError('Spanish completion gate failed: ' + ', '.join(failures))


def publish(states, phase, started, **extra):
    counts = {language: sum(language in state['completeLanguages'] for state in states.values())
              for language in LANGUAGES}
    save(BATCH / 'translation-status.json', {'pid': os.getpid(), 'phase': phase,
         'startedAt': started, 'updatedAt': now(), 'parallelLimit': LIMIT,
         'languages': list(LANGUAGES), 'counts': counts, 'cities': states, **extra})


def main():
    manifest = read(BATCH / 'manifest.json')
    slugs = [city['slug'] for city in manifest['cities']]
    assert len(slugs) == len(set(slugs)) == 30 and SCRIPT.is_file()
    if '--check' in sys.argv:
        print('Translation queue valid: 30 cities; en,fr,de,it; parallel limit 4')
        return 0
    spanish_gate(slugs)
    started = now()
    states = {}
    for slug in slugs:
        complete = completed_languages(slug)
        states[slug] = {'phase': 'completed' if len(complete) == len(LANGUAGES) else 'queued',
                        'completeLanguages': complete}
    jobs = {}
    publish(states, 'running', started)
    environment = {**os.environ, 'PYTHONUNBUFFERED': '1',
                   'DEEPSEEK_RELIABILITY_PILOT': '1', 'DEEPSEEK_RECOVER_INTERRUPTED': '1'}
    try:
        while True:
            for slug in slugs:
                if len(jobs) >= LIMIT:
                    break
                state = states[slug]
                if state['phase'] != 'queued':
                    continue
                log = (BATCH / slug / 'translation-runner.log').open('a')
                command = [sys.executable, '-u', str(SCRIPT), '--city-dir', str(BATCH / slug),
                           '--languages=es,en,fr,de,it', '--execute']
                process = subprocess.Popen(command, cwd=BACKEND, env=environment,
                                           stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                           start_new_session=True)
                jobs[slug] = {'process': process, 'log': log, 'started': time.monotonic()}
                state.update(phase='translating', pid=process.pid, startedAt=now())
                publish(states, 'running', started)
            for slug, job in list(jobs.items()):
                code = job['process'].poll()
                if code is None:
                    continue
                job['log'].close()
                complete = completed_languages(slug)
                state = states[slug]
                state.update(completeLanguages=complete, exitCode=code, finishedAt=now(),
                             elapsedSeconds=round(time.monotonic() - job['started']))
                if code == 0 and len(complete) == len(LANGUAGES):
                    state['phase'] = 'completed'
                    state.pop('error', None)
                else:
                    state.update(phase='error', error='See translation-runner.log and translation artifacts.')
                del jobs[slug]
                publish(states, 'running', started)
            terminal = not jobs and all(state['phase'] in ('completed', 'error') for state in states.values())
            if terminal:
                break
            time.sleep(3)
    finally:
        for job in jobs.values():
            job['process'].terminate()
            job['log'].close()
    failed = [slug for slug, state in states.items() if state['phase'] != 'completed']
    publish(states, 'completed_with_errors' if failed else 'completed', started,
            finishedAt=now(), failedCities=failed)
    return 1 if failed else 0


if __name__ == '__main__':
    raise SystemExit(main())
