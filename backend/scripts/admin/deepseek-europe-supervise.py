"""Detached local queue: standard route preparation -> Spanish editorial -> audio."""
import fcntl
import json
import os
import re
import signal
import subprocess
import sys
import time
import phase_receipts
import verify_audio_recovery_copy
import overpass_control
from datetime import datetime, timezone
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[2]
B = BACKEND / 'tmp/pilot-batch-europe-20260920'
ROOT = BACKEND.parent
NODE = Path('/home/jesusotero/.nvm/versions/node/v22.19.0/bin/node')
AUDIO_PYTHON = ROOT / 'pods/voxcpm-pod/.venv/bin/python'
STAGES = ('prepare', 'text', 'audio')
LIMITS = {'prepare': 1, 'text': 2, 'audio': 1}
EXECUTION_POLICY = {'scope': 'pilots', 'limits': dict(LIMITS), 'audioAtEnd': False, 'independentSources': False, 'sharedMapControl': True}
TIMEOUTS = {'prepare': 13 * 3600, 'text': 2 * 3600, 'audio': 4 * 3600}
READY = {'prepare': 'prepared', 'text': 'ready', 'audio': 'completed'}
ACTIVE = {'prepare': 'preparing', 'text': 'writing', 'audio': 'rendering'}
TERMINATION_GRACE_SECONDS = 300
SOURCE_COOLDOWN_SECONDS = 300
RECOVERY_DELAYS = (300, 900, 1800)
POLL_SECONDS = 5


def read(p):
    return json.loads(p.read_text())


def now():
    return datetime.now(timezone.utc).isoformat()


def save(name, value):
    p = B / name
    t = p.with_suffix(p.suffix + '.tmp')
    t.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n')
    t.replace(p)


def command(stage, slug):
    scripts = BACKEND / 'scripts/admin'
    if stage == 'text':
        return [sys.executable, '-u', str(scripts / 'deepseek-batch-text.py'),
                '--city-dir', str(B / slug), '--languages=es', '--execute']
    result = [str(NODE), '-r', 'ts-node/register/transpile-only',
              str(scripts / ('deepseek-europe-' + stage + '.cjs')), slug]
    if stage == 'audio' and (B / slug / 'tts-job/input.json').is_file():
        result.append('--resume')
    return result


def guarded_command(stage, slug):
    return [sys.executable, str(BACKEND / 'scripts/admin/phase_guard.py'), str(B / slug), stage, *command(stage, slug)]


def output_ready(stage, slug):
    return phase_receipts.verify(B / slug, stage)


def group_alive(pid):
    try:
        os.killpg(pid, 0)
    except ProcessLookupError:
        return False
    # Orphan zombies can remain under WSL's init after a renderer is killed.
    # They hold no work/resources and cannot be killed again; do not deadlock
    # the queue lock waiting for init to reap them. Ignore only proven zombies.
    found = False
    for stat in Path('/proc').glob('[0-9]*/stat'):
        try:
            fields = stat.read_text().rsplit(')', 1)[1].split()
            if int(fields[2]) == pid:
                found = True
                if fields[0] != 'Z':
                    return True
        except (OSError, ValueError, IndexError):
            continue
    return not found


def signal_group(pid, sig):
    try:
        os.killpg(pid, sig)
    except ProcessLookupError:
        pass  # The last child can exit between inspection and signaling.


def terminate_job(job, user_stop=False):
    if user_stop:
        job['userStop'] = True
    if 'terminateAt' not in job:
        job['terminateAt'] = time.monotonic()
        signal_group(job['process'].pid, signal.SIGTERM)


def poll_job(job, stage, stopping=False):
    process = job['process']
    elapsed = time.monotonic() - job['start']
    code = process.poll()  # Reaps the direct child before checking descendants.
    descendants_alive = group_alive(process.pid)
    if stopping or (code is None and elapsed > TIMEOUTS[stage]) or (code is not None and descendants_alive):
        terminate_job(job, user_stop=stopping)
    if 'terminateAt' in job and time.monotonic() - job['terminateAt'] >= TERMINATION_GRACE_SECONDS:
        if code is None or descendants_alive:
            signal_group(process.pid, signal.SIGKILL)
    if code is None or descendants_alive:
        return None
    return code, elapsed


def stage_failure(stage, log):
    if stage == 'prepare' and ('; retry no earlier than ' in log or 'Overpass acquisition deferred until ' in log):
        return 'temporary_sources', 'El servicio de mapas no está disponible; preparación detenida para evitar repetir el fallo.'
    if stage == 'prepare' and ('guided_duration_infeasible' in log or 'route_review_required' in log):
        return 'route_review', 'La ruta necesita revisión de duración o selección.'
    if stage == 'prepare' and 'evidence_review_required' in log:
        return 'source_evidence', 'Faltan fuentes suficientes para una parada.'
    if stage == 'text':
        return 'text_review', 'El guion necesita completar su revisión.'
    if stage == 'audio':
        return 'audio_render', 'El audio se detuvo; se conservan los capítulos verificados.'
    return 'stage_failed', 'Esta fase necesita revisión; los datos anteriores se conservan.'


def timestamp(value):
    try:
        parsed = datetime.fromisoformat(value.replace('Z', '+00:00'))
        return parsed.replace(tzinfo=parsed.tzinfo or timezone.utc).timestamp()
    except (AttributeError, ValueError, OverflowError):
        # The fetcher can safely represent dates beyond Python's datetime limit.
        if isinstance(value, str) and re.match(r'^\+\d{6}-', value):
            return datetime.max.replace(tzinfo=timezone.utc).timestamp() - 1
        return None


def source_block(slug, message, log):
    deadline = time.time() + SOURCE_COOLDOWN_SECONDS
    for match in re.finditer(r'(?:retry no earlier than|Overpass acquisition deferred until)\s+(\S+)', log):
        parsed = timestamp(match.group(1))
        if parsed is not None:
            deadline = max(deadline, parsed)
    return {'city': slug, 'at': now(), 'reason': 'temporary_sources', 'message': message,
            'retryNotBefore': datetime.fromtimestamp(deadline, timezone.utc).isoformat()}


def resume_sources(blocked, states, requested):
    if not blocked or not requested:
        return blocked
    deadline = timestamp(blocked.get('retryNotBefore'))
    if deadline is None:
        observed = timestamp(blocked.get('at'))
        if observed is None:
            return blocked  # Unverifiable saved cooldown needs an explicit repair.
        deadline = observed + SOURCE_COOLDOWN_SECONDS
    if time.time() < deadline:
        return blocked
    slug = blocked.get('city')
    if slug in states and states[slug]['prepare'].get('reason') == 'temporary_sources':
        states[slug]['prepare'] = {'phase': 'queued'}
    return None


def recover_states(previous, slugs):
    states = {slug: {stage: dict(previous.get('cities', {}).get(slug, {}).get(stage, {'phase': 'queued'}))
                     for stage in STAGES} for slug in slugs}
    for slug in slugs:
        for stage in STAGES:
            state = states[slug][stage]
            owner_path = B / slug / (stage + '-owner.json')
            if owner_path.exists():
                owner = read(owner_path)
                if owner.get('phase') == 'running' and group_alive(owner['processGroup']):
                    raise RuntimeError('Previous phase owner still running: ' + slug + '/' + stage)
            if state.get('pid') and state['phase'] in (*ACTIVE.values(), 'paused') and group_alive(state['pid']):
                raise RuntimeError('Previous process group still running: ' + slug + '/' + stage)
            if output_ready(stage, slug):
                states[slug][stage] = state = {'phase': READY[stage], 'validatedReceipt': str(B / slug / 'receipts' / (stage + '.json')), 'history': state.get('history', []) + ([dict(state)] if state.get('pid') or state.get('exitCode') else [])}
                for field in ('error', 'reason', 'message'):
                    state.pop(field, None)
            elif state['phase'] in (*ACTIVE.values(), 'paused'):
                states[slug][stage] = {'phase': 'queued'}
            elif state['phase'] not in ('queued', 'error', 'blocked', 'waiting_sources'):
                state.update(phase='error', error='Saved stage output is missing; inspect artifacts before retry.')
    return states


def refresh_dependencies(stages):
    for i, stage in enumerate(STAGES[1:], 1):
        state = stages[stage]
        predecessor = stages[STAGES[i - 1]]['phase']
        if state['phase'] == 'blocked' and state.get('reason') == 'previous_stage' and predecessor not in ('error', 'blocked'):
            stages[stage] = state = {'phase': 'queued'}
        if state['phase'] == 'queued' and predecessor in ('error', 'blocked'):
            state.update(phase='blocked', reason='previous_stage', message='Esperando a la fase anterior.')


def display_state(stages):
    for stage in STAGES:
        if stages[stage]['phase'] != READY[stage]:
            return {**stages[stage], 'stage': stage}
    return {**stages['audio'], 'stage': 'audio'}


def publish_status(states, phase, blocked, started):
    save('queue-status.json', {'pid': os.getpid(), 'startedAt': started, 'updatedAt': now(),
                             'phase': phase, 'processAlive': phase in ('running', 'waiting_sources'),
                             'executionPolicy': EXECUTION_POLICY, 'preparationBlocked': blocked, 'overpass': overpass_control.read_status(), 'cities': states})
    save('text-status.json', {'phase': phase, 'updatedAt': now(),
                            'cities': {s: display_state(stages) for s, stages in states.items()}})
    save('audio-status.json', {'phase': phase, 'updatedAt': now(),
                             'cities': {s: stages['audio'] for s, stages in states.items()}})


def update_index():
    try:
        with (B / 'page.log').open('a') as page_log:
            result = subprocess.run([str(AUDIO_PYTHON), str(BACKEND / 'scripts/admin/deepseek-europe-page.py')],
                                    cwd=BACKEND, stdout=page_log, stderr=page_log, timeout=30)
        if result.returncode:
            print('Page update failed; see page.log.', flush=True)
    except (OSError, subprocess.TimeoutExpired) as error:
        print('Page update failed: ' + str(error), flush=True)


def tested_implementation():
    gates = read(B / 'reliability-gates.json')
    assert gates.get('offlineTestsPassed') and gates.get('interruptionTestsPassed'), 'Offline recovery gates not passed'
    assert gates.get('testedFiles'), 'Missing binding to tested implementation'
    for path, expected in gates['testedFiles'].items():
        assert phase_receipts.sha(path) == expected, 'Tested implementation changed: ' + path
    return gates


def approve_rollout():
    gates = tested_implementation()
    pilots = ('marseille', 'hamburg', 'venezia')
    for slug in pilots:
        assert output_ready('audio', slug), 'Incomplete or changed pilot: ' + slug
        verify_audio_recovery_copy.verify(B / slug)
    gates.update(pilotsCompleted=3, expandBatchAllowed=True, rolloutApprovedAt=now(),
                 audioRecoveryProofs={slug: phase_receipts.sha(B / slug / 'audio-recovery-proof.json') for slug in pilots})
    save('reliability-gates.json', gates)


def audio_batch_ready(states, allowed, jobs):
    return not any(stage in ('prepare', 'text') for _, stage in jobs) and all(
        states[slug][stage]['phase'] in (READY[stage], 'error', 'blocked')
        for slug in allowed for stage in ('prepare', 'text'))


def run_queue(slugs, previous, resume_requested=False, allowed=None, auto_expand=False,
              audio_at_end=False, independent_sources=False):
    states = recover_states(previous, slugs)
    preparation_blocked = previous.get('preparationBlocked')
    # A failed query alone does not establish that other cities cannot be fetched.
    # Explicit provider throttling/unavailability still pauses new preparations.
    if independent_sources and (preparation_blocked or {}).get('reason') == 'query_unknown' and not (preparation_blocked or {}).get('coordinated'):
        preparation_blocked = None
    allowed = set(slugs if allowed is None else allowed) & set(slugs)
    jobs = {}
    rollout_attempted = False
    rollout_blocked = False
    stopping = False

    def stop(_signum, _frame):
        nonlocal stopping
        stopping = True

    old_handlers = {sig: signal.signal(sig, stop) for sig in (signal.SIGTERM, signal.SIGINT)}
    env = {**os.environ, 'PYTHONUNBUFFERED': '1', 'VOXCPM_BATCH_TIMEOUT_SECONDS': '10800',
           'DEEPSEEK_RECOVER_INTERRUPTED': '1', 'DEEPSEEK_RELIABILITY_PILOT': '1'}
    env['PATH'] = str(NODE.parent) + os.pathsep + env.get('PATH', '')
    last_index = 0
    started = now()
    try:
        while True:
            for slug in allowed:
                state = states[slug]['prepare']
                if not stopping and state['phase'] == 'waiting_sources' and time.time() >= timestamp(state['retryNotBefore']):
                    if state.get('coordinated'):
                        states[slug]['prepare'] = {'phase': 'queued', 'coordinated': True, 'queuedAt': time.time()}
                        continue  # Only the shared coordinator reserves physical attempts.
                    recovery = read(B / slug / 'source-recovery.json')
                    recovery['windowsUsed'] += 1
                    recovery['windowStartedAt'] = now()
                    save(slug + '/source-recovery.json', recovery)
                    states[slug]['prepare'] = {'phase': 'queued', 'recoveryQueryHash': recovery['queryHash'],
                                               'recoveryWindow': recovery['windowsUsed']}
                    if preparation_blocked and preparation_blocked.get('city') == slug:
                        preparation_blocked = {'city': slug, 'reason': 'provider_probe',
                                               'message': 'Comprobando la recuperación del proveedor antes de abrir nuevas consultas.'}
            for key, job in list(jobs.items()):
                slug, stage = key
                outcome = poll_job(job, stage, stopping)
                if outcome is None:
                    continue
                code, elapsed = outcome
                job['log'].close()
                if stage == 'prepare' and preparation_blocked and preparation_blocked.get('city') == slug and preparation_blocked.get('reason') == 'provider_probe':
                    preparation_blocked = None
                receipt_error = None
                if code == 0 and 'terminateAt' not in job:
                    try:
                        phase_receipts.create(B / slug, stage)
                    except Exception as error:
                        receipt_error = str(error)
                ok = code == 0 and output_ready(stage, slug) and 'terminateAt' not in job and receipt_error is None
                states[slug][stage].update(phase=READY[stage] if ok else 'paused' if job.get('userStop') else 'error',
                                          exitCode=code, finishedAt=now(), elapsedSeconds=round(elapsed))
                if ok:
                    states[slug][stage].pop('error', None)
                    save(slug + '/' + stage + '-result.json', {'stage': stage, 'status': 'completed',
                        'type': 'validated_completion', 'receipt': str(B / slug / 'receipts' / (stage + '.json'))})
                elif job.get('userStop'):
                    states[slug][stage].update(reason='user_stop', message='Pausado por el usuario; se conserva el último punto válido.')
                else:
                    result_path = B / slug / (stage + '-result.json')
                    result = read(result_path) if result_path.exists() else {'type': 'stage_failed', 'message': 'No structured phase result'}
                    reason = 'invalid_receipt' if receipt_error else result.get('type', 'stage_failed')
                    message = receipt_error or result.get('message', 'Phase failed')
                    state = states[slug][stage]
                    state.update(reason=reason, message=message, error='See saved phase result and artifacts.')
                    evidence = result.get('sourceFailure', {})
                    if stage == 'prepare' and evidence.get('coordinated'):
                        state['coordinated'] = True
                        if reason == 'source_wait':
                            deadline = timestamp(evidence.get('retryNotBefore'))
                            if deadline is None:
                                state.update(reason='invalid_source_wait', message='Shared source wait has no valid deadline.')
                            else:
                                state.update(phase='waiting_sources', retryNotBefore=evidence['retryNotBefore'],
                                             queryHash=evidence.get('queryHash'), endpoint=evidence.get('endpoint'),
                                             recoveryWindowsRemaining=evidence.get('recoveryWindowsRemaining'))
                                state.pop('error', None)
                        # Permanent/exhausted queries remain errors. Other cities can
                        # consume cached sources; every new HTTP checks the shared gate.
                    elif stage == 'prepare' and reason in ('service_wait', 'query_unknown'):
                        recovery_path = B / slug / 'source-recovery.json'
                        recovery = read(recovery_path) if recovery_path.exists() else {'windowsUsed': 0}
                        evidence = result['sourceFailure']
                        query_hash = evidence['queryHash']
                        if recovery.get('queryHash') not in (None, query_hash):
                            recovery.setdefault('history', []).append(dict(recovery, history=[]))
                            recovery['windowsUsed'] = 0
                            recovery['serviceConfirmed'] = False
                        recovery['queryHash'] = query_hash
                        shared_wait = reason == 'service_wait' or (not independent_sources and recovery.get('serviceConfirmed', False))
                        recovery['serviceConfirmed'] = shared_wait
                        used = recovery['windowsUsed']
                        if used < 3:
                            delay = RECOVERY_DELAYS[used]
                            deadline = max(time.time() + delay, timestamp(evidence.get('retryNotBefore')) or 0)
                            state.update(phase='waiting_sources', retryNotBefore=datetime.fromtimestamp(deadline, timezone.utc).isoformat(),
                                         recoveryWindowsRemaining=3-used, queryHash=query_hash)
                            recovery.update(retryNotBefore=state['retryNotBefore'], lastFailure=result)
                            if shared_wait: preparation_blocked = {'city': slug, **state}
                        else:
                            state.update(reason='source_recovery_exhausted', recoveryWindowsRemaining=0)
                            if shared_wait:
                                preparation_blocked = {'city': slug, 'reason': 'provider_recovery_exhausted'}
                                for other in allowed:
                                    pending = states[other]['prepare']
                                    if pending['phase'] in ('queued', 'waiting_sources'):
                                        pending.update(phase='blocked', reason='provider_recovery_exhausted',
                                                       message='Se agotaron las ventanas del servicio; no se lanzan nuevas consultas.')
                        save(slug + '/source-recovery.json', recovery)
                print(json.dumps({'city': slug, 'stage': stage, **states[slug][stage]}, ensure_ascii=False), flush=True)
                del jobs[key]
            # Retries rejoin behind untouched cities, avoiding repeated failures
            # monopolizing the two preparation slots.
            for slug in sorted(slugs, key=lambda s: states[s]['prepare'].get('queuedAt', 0)):
                refresh_dependencies(states[slug])
                for i, stage in enumerate(STAGES):
                    state = states[slug][stage]
                    if state['phase'] != 'queued' or slug not in allowed:
                        continue
                    source_paused = stage == 'prepare' and preparation_blocked and not (
                        preparation_blocked.get('reason') == 'provider_probe' and preparation_blocked.get('city') == slug)
                    if stopping or source_paused or (i and states[slug][STAGES[i - 1]]['phase'] != READY[STAGES[i - 1]]):
                        continue
                    if sum(k[1] == stage for k in jobs) >= LIMITS[stage]:
                        continue
                    if stage == 'audio' and audio_at_end and not audio_batch_ready(states, allowed, jobs):
                        continue
                    log = (B / slug / (stage + '-runner.log')).open('a')
                    log_start = log.tell()
                    job_env = dict(env)
                    if stage == 'prepare' and state.get('recoveryQueryHash'):
                        job_env['OVERPASS_RECOVERY_QUERY_HASH'] = state['recoveryQueryHash']
                        job_env['OVERPASS_RECOVERY_ENDPOINT_INDEX'] = str((state['recoveryWindow'] - 1) % 2)
                    result_path = B / slug / (stage + '-result.json')
                    if result_path.exists():
                        history = B / slug / 'phase-history'
                        history.mkdir(exist_ok=True)
                        result_path.rename(history / (stage + '-' + str(time.time_ns()) + '.json'))
                    publish_status(states, 'running', preparation_blocked, started)
                    try:
                        process = subprocess.Popen(guarded_command(stage, slug), cwd=BACKEND, env=job_env,
                                                   stdin=subprocess.DEVNULL, stdout=log, stderr=log,
                                                   start_new_session=True)
                    except BaseException:
                        log.close()
                        raise
                    jobs[(slug, stage)] = {'process': process, 'log': log, 'start': time.monotonic(), 'logStart': log_start}
                    for field in ('error', 'reason', 'message', 'exitCode', 'finishedAt', 'elapsedSeconds'):
                        state.pop(field, None)
                    state.update(phase=ACTIVE[stage], startedAt=now(), pid=process.pid)
                    print(json.dumps({'city': slug, 'stage': stage, **state}, ensure_ascii=False), flush=True)
            pilots = {'marseille', 'hamburg', 'venezia'}
            if auto_expand and not rollout_attempted and not stopping and pilots.issubset(allowed) and all(
                    states[s]['audio']['phase'] == READY['audio'] for s in pilots):
                rollout_attempted = True
                try:
                    approve_rollout()
                    allowed = set(slugs)
                    save('rollout.json', {'at': now(), 'phase': 'remaining_cities_released', 'cities': slugs})
                except Exception as error:
                    rollout_blocked = True
                    save('rollout.json', {'at': now(), 'phase': 'blocked', 'reason': str(error)})
            terminal = all(states[s][k]['phase'] in (READY[k], 'error', 'blocked') for s in allowed for k in STAGES)
            waiting_sources = any(states[s]['prepare']['phase'] == 'waiting_sources' for s in allowed) and not jobs
            phase = 'rollout_blocked' if rollout_blocked else 'paused' if stopping else 'waiting_sources' if waiting_sources else ('completed_with_errors' if terminal and any(states[s][k]['phase'] in ('error', 'blocked') for s in allowed for k in STAGES) else 'completed' if terminal else 'running')
            publish_status(states, phase, preparation_blocked, started)
            if time.monotonic() - last_index >= 20 or terminal or stopping:
                update_index()
                last_index = time.monotonic()
            if (terminal or stopping) and not jobs:
                break
            time.sleep(POLL_SECONDS)
    finally:
        # Exceptions and timeouts need the same descendant cleanup as user stops.
        # This runs inside main's queue lock, before another supervisor can start.
        interrupted = bool(jobs)
        for job in jobs.values():
            terminate_job(job, user_stop=True)
        while jobs:
            for key, job in list(jobs.items()):
                outcome = poll_job(job, key[1], stopping=True)
                if outcome is not None:
                    job['log'].close()
                    states[key[0]][key[1]].update(phase='paused', reason='supervisor_interrupted',
                        message='Ejecución interrumpida; se conserva el último punto válido.', finishedAt=now())
                    del jobs[key]
            if jobs:
                time.sleep(1)
        for sig, handler in old_handlers.items():
            signal.signal(sig, handler)
        if interrupted:
            publish_status(states, 'paused', preparation_blocked, started)


def main():
    with (B / 'queue.lock').open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        cities = read(B / 'manifest.json')['cities']
        slugs = [c['slug'] for c in cities]
        assert len(slugs) == len(set(slugs)) == 30
        assert NODE.is_file() and AUDIO_PYTHON.is_file()
        all_texts_first = '--all-texts-first' in sys.argv
        if all_texts_first:
            LIMITS.update(prepare=2, text=4, audio=1)
        EXECUTION_POLICY.update(scope='all' if all_texts_first or '--all-after-pilots' in sys.argv else 'pilots',
                                limits=dict(LIMITS), audioAtEnd=all_texts_first, independentSources=all_texts_first, sharedMapControl=True)
        if '--check' in sys.argv:
            for stage in STAGES:
                assert Path(command(stage, slugs[0])[0]).is_file()
            print('Queue valid: 30 cities; ' + json.dumps(EXECUTION_POLICY))
            return
        previous = read(B / 'queue-status.json') if (B / 'queue-status.json').exists() else {}
        pilots = {'marseille', 'hamburg', 'venezia'}
        if all_texts_first:
            tested_implementation()
            allowed = set(slugs)
            save('rollout.json', {'at': now(), 'phase': 'all_cities_texts_first', 'cities': slugs,
                'basis': 'Explicit user request: all cities in parallel, audio as a batch at the end.',
                'pilotAudioGatePassed': False, 'executionPolicy': EXECUTION_POLICY})
        elif '--all-after-pilots' in sys.argv:
            assert all(output_ready('audio', slug) for slug in pilots), 'Three verified pilots required'
            approve_rollout()
            allowed = set(slugs)
        else:
            allowed = pilots
        # Explicit rollout authorizes resuming the two diagnosed failures only once.
        if '--start-pilots' in sys.argv:
            if (previous.get('preparationBlocked') or {}).get('reason') == 'temporary_sources':
                previous['preparationBlocked'] = None
            for slug, stage in [('marseille', 'text'), ('hamburg', 'prepare')]:
                prior = previous.get('cities', {}).get(slug, {}).get(stage, {})
                if not (B / slug / 'pilot-started.json').exists():
                    if prior.get('phase') == 'error':
                        previous['cities'][slug][stage] = {'phase': 'queued', 'history': [prior]}
                    save(slug + '/pilot-started.json', {'at': now(), 'previous': prior})
        run_queue(slugs, previous, resume_requested='--resume-sources' in sys.argv, allowed=allowed,
                  auto_expand=not all_texts_first and '--pilots-only' not in sys.argv,
                  audio_at_end=all_texts_first, independent_sources=all_texts_first)


if __name__ == '__main__':
    main()
