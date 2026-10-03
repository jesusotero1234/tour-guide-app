#!/usr/bin/env python3
"""Open one audited recovery round and restart the European tour supervisor."""
import fcntl
import hashlib
import json
import os
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

import overpass_control
import phase_receipts


BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
BATCH = Path(os.environ.get('BATCH_STAGE') or BACKEND / 'tmp/pilot-batch-europe-20260920')
SUPERVISOR = Path(__file__).with_name('deepseek-europe-supervise.py')


def read(path):
    return json.loads(path.read_text())


def sha(path):
    return hashlib.sha256(Path(path).read_bytes()).hexdigest()


def supervisor_alive(queue):
    pid = queue.get('pid')
    if not isinstance(pid, int):
        return False
    command = Path('/proc') / str(pid) / 'cmdline'
    try:
        return b'deepseek-europe-supervise.py' in command.read_bytes()
    except OSError:
        return False


def snapshot(source, target):
    content = source.read_bytes()
    with target.open('xb') as stream:
        stream.write(content)
        stream.flush()
        os.fsync(stream.fileno())
    return sha(target)


def save(path, value):
    overpass_control.atomic_save(path, value)


def recoverable_prepare_failure(stage, static_fallback=False):
    if stage.get('phase') not in ('error', 'blocked'):
        return False
    terminal_reasons = {'source_recovery_exhausted', 'provider_recovery_exhausted'}
    if stage.get('reason') in terminal_reasons:
        return True
    if not static_fallback:
        return False
    if stage.get('reason') == 'coordinator_unavailable':
        return True
    message = stage.get('message', '')
    return stage.get('reason') == 'run_failed' and any(reason in message for reason in (
        'walking_provider_unavailable', 'route_too_short'))


def recoverable_text_failure(stages):
    return (stages['prepare'].get('phase') == 'prepared'
            and stages['text'].get('phase') == 'error')


def prepare_round(static_fallback=False):
    source_dir = overpass_control.directory()
    state_path = source_dir / 'state.json'
    now = datetime.now(timezone.utc)
    stamp = now.astimezone(ZoneInfo('Europe/Madrid')).strftime('%Y%m%dT%H%M%S%z')
    prefix = 'static-osm-fallback-' if static_fallback else 'user-resume-'
    round_id = prefix + stamp + '-' + str(os.getpid())

    with (BATCH / 'queue.lock').open('a+') as queue_lock, (source_dir / 'request.lock').open('a+') as map_lock:
        fcntl.flock(queue_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(map_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        queue = read(BATCH / 'queue-status.json')
        state = read(state_path)
        gates = read(BATCH / 'reliability-gates.json')

        if supervisor_alive(queue):
            return None, queue['pid'], 'already_running'
        if state.get('active') is not None:
            raise RuntimeError('Hay una petición de mapas activa; no se reinicia hasta que termine.')
        if not gates.get('offlineTestsPassed') or not gates.get('interruptionTestsPassed'):
            raise RuntimeError('Las comprobaciones de recuperación no están aprobadas.')
        changed = [path for path, expected in gates.get('testedFiles', {}).items() if sha(path) != expected]
        if changed:
            raise RuntimeError('La implementación cambió después de las pruebas: ' + ', '.join(changed))

        completed = [slug for slug, stages in queue.get('cities', {}).items()
                     if stages['audio']['phase'] == 'completed']
        if not all(phase_receipts.verify(BATCH / slug, stage)
                   for slug in completed for stage in ('prepare', 'text', 'audio')):
            raise RuntimeError('Un tour terminado no supera la comprobación de integridad.')
        pending_prepare = [slug for slug, stages in queue.get('cities', {}).items()
                           if recoverable_prepare_failure(stages['prepare'], static_fallback)]
        pending_text = [slug for slug, stages in queue.get('cities', {}).items()
                        if recoverable_text_failure(stages)]
        pending = sorted(set(pending_prepare + pending_text))
        if not pending:
            raise RuntimeError('No hay ciudades detenidas que puedan reanudarse.')
        incident = state.get('incident')
        if not incident or not incident.get('exhausted'):
            raise RuntimeError('El control de mapas no está en un estado agotado reiniciable.')

        archive = BATCH / 'recovery-history' / round_id
        archive.mkdir(parents=True)
        snapshots = {
            'queue-before.json': snapshot(BATCH / 'queue-status.json', archive / 'queue-before.json'),
            'overpass-before.json': snapshot(state_path, archive / 'overpass-before.json'),
            'gates-before.json': snapshot(BATCH / 'reliability-gates.json', archive / 'gates-before.json'),
        }

        old_incident = dict(incident)
        renewed = {}
        if not static_fallback:
            for key, query in state['queries'].items():
                if query.get('terminal') == 'source_recovery_exhausted' or query.get('attempts', 0) >= 4:
                    renewed[key] = dict(query)
                    query['priorRoundAttempts'] = query.get('priorRoundAttempts', 0) + query.get('attempts', 0)
                    query['attempts'] = 0
                    query.pop('terminal', None)
                    query['authorizedRound'] = round_id

            current_ms = int(now.timestamp() * 1000)
            provider_times = [provider['retryAt'] for provider in state['providers'].values()
                              if not provider.get('restricted')]
            if not provider_times:
                raise RuntimeError('Todos los proveedores de mapas están restringidos.')
            state['incident'] = {'id': round_id, 'windowsUsed': 0, 'exhausted': False,
                                 'retryAt': max(current_ms, state['nextRequestAt'], min(provider_times))}
        history = state.setdefault('operatorResumeHistory', [])
        history.append({'id': round_id, 'at': now.isoformat(),
                        'instruction': 'Reanudar con respaldo OSM estático' if static_fallback else 'Reiniciar el proceso',
                        'previousIncident': old_incident, 'renewedQueries': renewed,
                        'archive': str(archive), 'snapshotSha256': snapshots,
                        'maxSharedRecoveryWindows': 3,
                        'staticFallback': static_fallback,
                        'reason': ('Overpass permanece agotado; las ciudades pendientes usarán el extracto local.'
                                   if static_fallback else
                                   'Nueva ronda solicitada por el usuario; se conservan los contadores anteriores.')})

        for slug in pending_prepare:
            previous = queue['cities'][slug]['prepare']
            queue['cities'][slug]['prepare'] = {'phase': 'queued', 'coordinated': True,
                                                'authorizedRound': round_id, 'history': [previous]}
        for slug in pending_text:
            previous = queue['cities'][slug]['text']
            queue['cities'][slug]['text'] = {'phase': 'queued', 'authorizedRound': round_id,
                                             'history': [previous]}
        queue.update(phase='paused', processAlive=False, preparationBlocked=None,
                     updatedAt=now.isoformat(), operatorResume=round_id)
        authorization = {'id': round_id, 'at': now.isoformat(), 'pendingCities': pending,
                         'pendingPreparationCities': pending_prepare, 'pendingTextCities': pending_text,
                         'preservedCompletedCities': completed, 'renewedQueryCount': len(renewed),
                         'previousIncident': old_incident, 'newIncident': state['incident'],
                         'lifetimeRequestCountPreserved': state['metrics']['requests'],
                         'maxSharedRecoveryWindows': 3, 'staticFallback': static_fallback,
                         'snapshots': snapshots, 'phase': 'prepared'}
        save(archive / 'authorization.json', authorization)
        save(state_path, state)
        save(BATCH / 'queue-status.json', queue)

    return (archive, authorization), None, 'prepared'


def main():
    static_fallback = '--static-fallback' in sys.argv
    try:
        prepared, pid, status = prepare_round(static_fallback=static_fallback)
    except BlockingIOError:
        queue = read(BATCH / 'queue-status.json')
        if supervisor_alive(queue):
            print(f'El proceso ya está activo (PID {queue["pid"]}).')
            return
        raise RuntimeError('Otro proceso está modificando la cola; vuelve a intentarlo en unos segundos.')
    if status == 'already_running':
        print(f'El proceso ya está activo (PID {pid}).')
        return
    archive, authorization = prepared
    command = [sys.executable, '-u', str(SUPERVISOR), '--all-texts-first']
    environment = dict(os.environ)
    if static_fallback:
        environment['STATIC_OSM_FALLBACK'] = '1'
    with (BATCH / 'shared-map-control-supervisor.log').open('a') as output:
        process = subprocess.Popen(command, cwd=BACKEND, stdin=subprocess.DEVNULL,
                                   stdout=output, stderr=output, start_new_session=True,
                                   env=environment)
    authorization.update(phase='launched', pid=process.pid, command=command)
    save(archive / 'authorization.json', authorization)
    save(BATCH / 'shared-map-control-launch.json', {
        'startedAt': datetime.now(timezone.utc).isoformat(), 'pid': process.pid,
        'command': command,
        'reason': ('Respaldo estático solicitado después de agotar Overpass.' if static_fallback
                   else 'Nueva ronda limitada solicitada por el usuario.'),
        'staticFallback': static_fallback,
        'authorization': str(archive / 'authorization.json')})
    print(f'Proceso reiniciado (PID {process.pid}); {len(authorization["pendingCities"])} ciudades pendientes.')


if __name__ == '__main__':
    main()
