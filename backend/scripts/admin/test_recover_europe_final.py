import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


spec = importlib.util.spec_from_file_location(
    'recover_europe_final', Path(__file__).with_name('recover-europe-final.py'))
recovery = importlib.util.module_from_spec(spec)
spec.loader.exec_module(recovery)


class FinalRecoveryTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.backend = Path(self.temporary.name) / 'backend'
        self.batch = self.backend / 'tmp/batch'
        self.batch.mkdir(parents=True)
        self.backend_patch = patch.object(recovery, 'BACKEND', self.backend)
        self.batch_patch = patch.object(recovery, 'BATCH', self.batch)
        self.backend_patch.start(); self.batch_patch.start()
        self.addCleanup(self.backend_patch.stop); self.addCleanup(self.batch_patch.stop)

    def save(self, path, value):
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(value))

    def test_fresh_preparation_drops_checkpoint_and_preserves_spend(self):
        directory = self.batch / 'bologna'
        self.save(directory / 'prepare-recovery.json', {
            'runSuffix': 'old', 'priorSpendUsd': .1, 'checkpoint': '/old/checkpoint', 'phase': 'route'})
        self.save(self.backend / 'tmp/narrative-v8/batch-bologna-old/budget.private.json', {'spentUsd': .2})
        result = recovery.fresh_preparation('bologna', 'stamp', {'runId': 'batch'})
        saved = json.loads((directory / 'prepare-recovery.json').read_text())
        self.assertEqual(result['priorSpendUsd'], .2)
        self.assertNotIn('checkpoint', saved)
        self.assertEqual(saved['runSuffix'], 'final-recovery-stamp')

    def test_editorial_archive_remaps_budget_and_preserves_contract_slot(self):
        directory = self.batch / 'nantes'
        attempt = directory / 'editorial/frozen/request-and-response/teacher.attempt-1.json'
        attempt.parent.mkdir(parents=True)
        attempt.write_text('{}')
        self.save(directory / 'editorial-budget.json', {
            'requests': {str(attempt.resolve()): {'reservedUsd': .1}}})
        self.save(directory / 'contract-repair-slots.json', {'teacher': {}})
        archive = Path(recovery.archive_editorial('nantes', 'stamp'))
        budget = json.loads((directory / 'editorial-budget.json').read_text())
        self.assertTrue((archive / 'frozen/request-and-response/teacher.attempt-1.json').is_file())
        self.assertEqual(list(budget['requests']), [str((archive / 'frozen/request-and-response/teacher.attempt-1.json').resolve())])
        self.assertTrue((archive.parent / 'final-recovery-stamp-contract-repair-slots.json').is_file())
