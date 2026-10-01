import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
import overpass_control as control


class MigrationTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.batch = self.root / 'batch'
        self.batch.mkdir()
        self.target = self.root / 'coordinator'
        env = patch.dict(os.environ, {'OVERPASS_COORDINATOR_DIR': str(self.target)})
        env.start()
        self.addCleanup(env.stop)
        self.queue = {'processAlive': False, 'cities': {'hamburg': {'prepare': {'reason': 'source_recovery_exhausted'}}}}
        self.write('queue-status.json', self.queue)

    def write(self, name, value):
        file = self.batch / name
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text(json.dumps(value))

    def recovery(self):
        self.write('hamburg/source-recovery.json', {
            'queryHash': 'hamburg-query', 'windowsUsed': 3, 'initialAttempts': 4,
            'retryNotBefore': '2026-09-20T18:50:35Z', 'windowStartedAt': '2026-09-20T18:55:42Z',
            'lastFailure': {'sourceFailure': {'cityKey': 'relation:62782', 'startedAt': '2026-09-20T18:55:44Z', 'elapsedMs': 70000}},
        })

    def events(self, items):
        file = self.batch / 'venezia/source-attempts/run/events.jsonl'
        file.parent.mkdir(parents=True, exist_ok=True)
        file.write_text('\n'.join(json.dumps(item) for item in items) + '\n')

    def read(self):
        return json.loads((self.target / 'state.json').read_text())

    def test_exhaustion_and_deadlines_survive_migration_and_repeated_invocation(self):
        self.recovery()
        control.migrate(self.batch)
        saved = self.read()
        self.assertEqual(saved['queries']['relation:62782/hamburg-query'], {'attempts': 7, 'terminal': 'source_recovery_exhausted'})
        self.assertTrue(saved['incident']['exhausted'])
        self.assertEqual(saved['incident']['windowsUsed'], 3)
        self.assertFalse(control.migrate(self.batch)['imported'])
        self.assertEqual(self.read(), saved)

    def test_later_verified_response_recovers_service_but_not_exhausted_city(self):
        self.recovery()
        self.events([{'type': 'request_completed', 'cityKey': 'Q641', 'queryHash': 'venice',
                      'endpoint': control.ENDPOINTS[1], 'startedAt': '2026-09-20T19:00:00Z',
                      'elapsedMs': 1000, 'httpStatus': 200, 'status': 'complete_under_policy'}])
        control.migrate(self.batch)
        saved = self.read()
        self.assertIsNone(saved['incident'])
        self.assertEqual(saved['queries']['relation:62782/hamburg-query']['terminal'], 'source_recovery_exhausted')
        self.assertEqual(saved['preferredEndpoint'], control.ENDPOINTS[1])

    def test_interrupted_request_and_failure_retry_after_remain_protected(self):
        self.events([{'type': 'request_started', 'cityKey': 'Q1', 'queryHash': 'q',
                      'endpoint': control.ENDPOINTS[0], 'startedAt': '2026-09-20T19:00:00Z'}])
        self.write('venezia/source-attempts/other/source-failure.json', {
            'endpoint': control.ENDPOINTS[1], 'retryNotBefore': '2026-09-21T19:00:00Z'})
        control.migrate(self.batch)
        saved = self.read()
        self.assertEqual(saved['nextRequestAt'], control.milliseconds('2026-09-20T19:00:00Z') + 100000)
        self.assertEqual(saved['providers'][control.ENDPOINTS[1]]['retryAt'], control.milliseconds('2026-09-21T19:00:00Z'))
        self.assertEqual(saved['queries']['Q1/q']['attempts'], 1)

    def test_active_supervisor_prevents_migration(self):
        self.queue['processAlive'] = True
        self.write('queue-status.json', self.queue)
        with self.assertRaisesRegex(RuntimeError, 'Stop the legacy supervisor'):
            control.migrate(self.batch)
        self.assertFalse((self.target / 'state.json').exists())

    def test_invalid_existing_state_is_not_reset(self):
        self.target.mkdir()
        (self.target / 'state.json').write_text('{broken')
        self.assertFalse(control.migrate(self.batch)['imported'])
        self.assertEqual(control.read_status()['phase'], 'invalid_state')
        self.assertEqual((self.target / 'state.json').read_text(), '{broken')

    def test_relative_coordinator_directory_is_rejected(self):
        with patch.dict(os.environ, {'OVERPASS_COORDINATOR_DIR': 'relative'}):
            with self.assertRaises(ValueError):
                control.directory()
