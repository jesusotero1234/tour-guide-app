import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location(
    'restart_europe_batch', Path(__file__).with_name('restart-europe-batch.py'))
restart = importlib.util.module_from_spec(spec)
spec.loader.exec_module(restart)


class RestartRecoveryTests(unittest.TestCase):
    def test_static_round_recovers_source_walking_and_compact_route_failures(self):
        self.assertTrue(restart.recoverable_prepare_failure(
            {'phase': 'error', 'reason': 'coordinator_unavailable'}, True))
        self.assertTrue(restart.recoverable_prepare_failure(
            {'phase': 'error', 'reason': 'run_failed',
             'message': 'route_review_required: walking_provider_unavailable'}, True))
        self.assertTrue(restart.recoverable_prepare_failure(
            {'phase': 'error', 'reason': 'run_failed',
             'message': 'route_review_required: route_too_short'}, True))
        self.assertFalse(restart.recoverable_prepare_failure(
            {'phase': 'error', 'reason': 'run_failed', 'message': 'unrelated'}, True))

    def test_text_retry_requires_a_valid_preparation_and_failed_text(self):
        self.assertTrue(restart.recoverable_text_failure({
            'prepare': {'phase': 'prepared'}, 'text': {'phase': 'error'}}))
        self.assertFalse(restart.recoverable_text_failure({
            'prepare': {'phase': 'error'}, 'text': {'phase': 'error'}}))
        self.assertFalse(restart.recoverable_text_failure({
            'prepare': {'phase': 'prepared'}, 'text': {'phase': 'ready'}}))
