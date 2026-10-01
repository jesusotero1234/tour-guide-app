"""Read the shared map gate and import legacy acquisition evidence under flock."""
import fcntl
import hashlib
import json
import os
from pathlib import Path
import time
from datetime import datetime, timezone

BACKEND = Path(__file__).resolve().parents[2]
ENDPOINTS = ('https://overpass-api.de/api/interpreter', 'https://overpass.private.coffee/api/interpreter')


def directory():
    path = Path(os.environ.get('OVERPASS_COORDINATOR_DIR', str(BACKEND / 'tmp/source-control/overpass')))
    if not path.is_absolute():
        raise ValueError('OVERPASS_COORDINATOR_DIR must be absolute')
    return path


def read_status():
    try:
        state = json.loads((directory() / 'state.json').read_text())
        if state.get('version') != 1 or not isinstance(state.get('providers'), dict):
            raise ValueError('Invalid coordinator state')
        return {k: state.get(k) for k in ('version', 'active', 'nextRequestAt', 'preferredEndpoint', 'providers', 'incident', 'metrics')}
    except FileNotFoundError:
        return {'phase': 'not_started'}
    except (OSError, ValueError):
        return {'phase': 'invalid_state', 'message': 'El control compartido necesita revisión; no se habilitan peticiones sin control.'}


def milliseconds(value):
    try:
        return int(datetime.fromisoformat(value.replace('Z', '+00:00')).timestamp() * 1000)
    except (ValueError, AttributeError, OverflowError):
        return 0


def atomic_save(path, value):
    temporary = path.with_name(path.name + '.' + str(os.getpid()) + '.tmp')
    with temporary.open('w') as stream:
        json.dump(value, stream, ensure_ascii=False, indent=2)
        stream.write('\n')
        stream.flush()
        os.fsync(stream.fileno())
    temporary.replace(path)


def migrate(batch):
    """One-time conservative import. Successful later downloads prove recovery;
    exhausted individual queries remain exhausted even when providers recover.
    Must run after stopping all legacy workers, before starting coordinated ones.
    """
    batch = Path(batch)
    target = directory()
    target.mkdir(parents=True, exist_ok=True)
    with (target / 'request.lock').open('a+') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        state_path = target / 'state.json'
        if state_path.exists():
            return {'imported': False, 'reason': 'Existing coordinator state preserved'}
        queue = json.loads((batch / 'queue-status.json').read_text())
        if queue.get('processAlive'):
            raise RuntimeError('Stop the legacy supervisor before migration')
        now = int(time.time() * 1000)
        state = {'version': 1, 'nextRequestAt': 0, 'preferredEndpoint': ENDPOINTS[0],
                 'providers': {e: {'retryAt': 0, 'failures': 0, 'lastFailureAt': 0,
                                  'recovery': False, 'restricted': False} for e in ENDPOINTS},
                 'queries': {}, 'active': None, 'incident': None,
                 'metrics': {'requests': 0, 'cacheHits': 0}}
        events = []
        evidence_files = {}
        for file in batch.glob('*/source-attempts/*/events.jsonl'):
            evidence_files[str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
            for line in file.read_text().splitlines():
                event = json.loads(line)
                if event.get('endpoint') not in ENDPOINTS or not event.get('queryHash'):
                    continue
                descriptor = file.parent / ('query-' + event['queryHash'] + '.json')
                if not event.get('cityKey') and descriptor.exists():
                    event['cityKey'] = json.loads(descriptor.read_text())['cityKey']
                if not event.get('cityKey'):
                    raise ValueError('Missing city identity in legacy source event')
                event['eventAt'] = milliseconds(event.get('startedAt')) + event.get('elapsedMs', 0)
                events.append(event)
        pending = {}
        last_success = 0
        for event in sorted(events, key=lambda e: e['eventAt']):
            endpoint = event['endpoint']
            provider = state['providers'][endpoint]
            key = event['cityKey'] + '/' + event['queryHash']
            at = event['eventAt']
            kind = event.get('event', event.get('type'))
            if kind == 'request_started':
                state['metrics']['requests'] += 1
                record = state['queries'].setdefault(key, {'attempts': 0})
                record['attempts'] += 1
                pending[(key, endpoint, event.get('startedAt'))] = at
            elif kind in ('request_completed', 'request_failed'):
                pending.pop((key, endpoint, event.get('startedAt')), None)
                if kind == 'request_completed':
                    if event.get('httpStatus') != 200 or event.get('status') not in ('complete_under_policy', 'valid_empty') or event.get('remark'):
                        raise ValueError('Legacy success lacks complete acquisition evidence')
                    last_success = max(last_success, at)
                    state['preferredEndpoint'] = endpoint
                    provider.update(retryAt=0, failures=0, lastFailureAt=0, recovery=False)
                    state['queries'].pop(key, None)
                    state['nextRequestAt'] = max(state['nextRequestAt'], at + 3000)
                else:
                    provider['failures'] = provider['failures'] + 1 if at - provider['lastFailureAt'] <= 300_000 else 1
                    provider['lastFailureAt'] = at
                    provider['recovery'] = event.get('httpStatus') in (429, 503) or provider['failures'] >= 2
                    provider['restricted'] = event.get('httpStatus') == 403 or provider['restricted']
                    provider['retryAt'] = max(provider['retryAt'], at + (300_000 if provider['recovery'] else 30_000),
                                              milliseconds(event.get('retryNotBefore')))
        # Failed-event logs precede backoff calculation in the legacy client.
        # The phase evidence holds the authoritative Retry-After deadline.
        for file in batch.glob('*/source-attempts/*/source-failure.json'):
            evidence = json.loads(file.read_text())
            endpoint = evidence.get('endpoint')
            if endpoint in state['providers']:
                state['providers'][endpoint]['retryAt'] = max(state['providers'][endpoint]['retryAt'], milliseconds(evidence.get('retryNotBefore')))
            evidence_files[str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
        windows = 0
        latest_failure = 0
        imported_recoveries = []
        for file in batch.glob('*/source-recovery.json'):
            recovery = json.loads(file.read_text())
            evidence_files[str(file)] = hashlib.sha256(file.read_bytes()).hexdigest()
            evidence = recovery.get('lastFailure', {}).get('sourceFailure', {})
            query_hash = recovery.get('queryHash')
            key = evidence.get('cityKey', '') + '/' + str(query_hash)
            if not evidence.get('cityKey'):
                continue
            used = recovery.get('windowsUsed', 0)
            state['queries'].setdefault(key, {'attempts': 0})['attempts'] = max(
                state['queries'].get(key, {}).get('attempts', 0), recovery.get('initialAttempts', 4) + used)
            terminal = queue.get('cities', {}).get(file.parent.name, {}).get('prepare', {}).get('reason') == 'source_recovery_exhausted'
            if terminal or used >= 3:
                state['queries'][key]['terminal'] = 'source_recovery_exhausted'
            for endpoint in ENDPOINTS:
                state['providers'][endpoint]['retryAt'] = max(state['providers'][endpoint]['retryAt'], milliseconds(recovery.get('retryNotBefore')))
            windows += used
            latest_failure = max(latest_failure, milliseconds(recovery.get('windowStartedAt')),
                                 milliseconds(evidence.get('startedAt')) + evidence.get('elapsedMs', 0))
            imported_recoveries.append({'city': file.parent.name, 'windowsUsed': used, 'terminal': terminal})
        # A killed HTTP request can still execute server-side. Preserve quarantine.
        for at in pending.values():
            state['nextRequestAt'] = max(state['nextRequestAt'], at + 100_000)
        if windows and last_success <= latest_failure:
            available = [p['retryAt'] for p in state['providers'].values() if not p['restricted']]
            state['incident'] = {'id': 'legacy-' + str(latest_failure), 'windowsUsed': min(3, windows),
                                 'retryAt': max(now, state['nextRequestAt'], min(available or [now])), 'exhausted': windows >= 3}
        state['migration'] = {'at': datetime.now(timezone.utc).isoformat(), 'batch': str(batch.resolve()),
                              'evidenceFiles': evidence_files, 'recoveries': imported_recoveries,
                              'latestValidResponseAt': last_success, 'latestLegacyRecoveryAt': latest_failure}
        atomic_save(state_path, state)
        return {'imported': True, 'queries': len(state['queries']), 'incident': state['incident'], 'requests': state['metrics']['requests']}


if __name__ == '__main__':
    import sys
    print(json.dumps(migrate(sys.argv[2]) if len(sys.argv) == 3 and sys.argv[1] == '--migrate' else read_status(), ensure_ascii=False, indent=2))
