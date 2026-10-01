import copy
import fcntl
import importlib.util
import json
from pathlib import Path
import signal
import tempfile
import unittest
from unittest.mock import Mock, patch

spec = importlib.util.spec_from_file_location('supervisor', Path(__file__).with_name('deepseek-europe-supervise.py'))
supervisor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(supervisor)


class SupervisorTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.base = Path(self.temporary.name)
        self.enter(patch.object(supervisor, 'B', self.base))
        self.enter(patch.object(supervisor, 'guarded_command', side_effect=lambda stage,slug:supervisor.command(stage,slug)))
        self.kill = self.enter(patch.object(supervisor.os, 'killpg'))
        self.enter(patch.object(supervisor.signal, 'signal', return_value=signal.SIG_DFL))
        self.launch = self.enter(patch.object(supervisor.subprocess, 'Popen', side_effect=AssertionError('unexpected process')))
        self.enter(patch.object(supervisor.subprocess, 'run', side_effect=AssertionError('unexpected process')))
        self.clock = 100.0
        self.enter(patch.object(supervisor.time, 'monotonic', side_effect=lambda: self.clock))
        self.enter(patch.object(supervisor.time, 'time', side_effect=lambda: 1_800_000_000 + self.clock))
        self.enter(patch.object(supervisor.time, 'sleep', side_effect=self.sleep))
        self.enter(patch.object(supervisor, 'now', return_value='2027-01-15T08:01:40+00:00'))
        self.enter(patch.object(supervisor, 'update_index'))

    def enter(self, context):
        result = context.__enter__()
        self.addCleanup(context.__exit__, None, None, None)
        return result

    def sleep(self, seconds):
        self.clock += seconds

    @staticmethod
    def states(**phases):
        return {stage: {'phase': phases.get(stage, 'queued')} for stage in supervisor.STAGES}

    def test_stop_at_expired_deadline_does_not_allocate_another_window(self):
        (self.base / 'city').mkdir()
        recovery = {'windowsUsed': 1, 'queryHash': 'pending', 'retryNotBefore': '2000-01-01T00:00:00Z'}
        (self.base / 'city/source-recovery.json').write_text(json.dumps(recovery))
        prior = {'cities': {'city': self.states(prepare='waiting_sources')}}
        prior['cities']['city']['prepare']['retryNotBefore'] = recovery['retryNotBefore']
        self.enter(patch.object(supervisor, 'output_ready', return_value=False))
        def stop_immediately(sig, handler):
            if sig == signal.SIGTERM and callable(handler): handler(sig, None)
            return signal.SIG_DFL
        self.enter(patch.object(supervisor.signal, 'signal', side_effect=stop_immediately))
        supervisor.run_queue(['city'], prior)
        self.assertEqual(json.loads((self.base / 'city/source-recovery.json').read_text()), recovery)
        self.assertEqual(json.loads((self.base / 'queue-status.json').read_text())['phase'], 'paused')
        self.launch.assert_not_called()

    def test_all_texts_first_cli_releases_all_cities_without_claiming_pilot_success(self):
        slugs = ['marseille', 'hamburg', 'venezia'] + [f'city-{i}' for i in range(27)]
        (self.base / 'manifest.json').write_text(json.dumps({'cities': [{'slug': s} for s in slugs]}))
        executable = self.base / 'executable'
        executable.touch()
        self.enter(patch.object(supervisor, 'NODE', executable))
        self.enter(patch.object(supervisor, 'AUDIO_PYTHON', executable))
        self.enter(patch.object(supervisor, 'LIMITS', dict(supervisor.LIMITS)))
        self.enter(patch.object(supervisor, 'EXECUTION_POLICY', {}))
        self.enter(patch.object(supervisor.sys, 'argv', ['supervisor', '--all-texts-first']))
        tested = self.enter(patch.object(supervisor, 'tested_implementation'))
        rollout = self.enter(patch.object(supervisor, 'approve_rollout'))
        run = self.enter(patch.object(supervisor, 'run_queue'))
        supervisor.main()
        tested.assert_called_once()
        rollout.assert_not_called()
        self.assertEqual(run.call_args.kwargs['allowed'], set(slugs))
        self.assertTrue(run.call_args.kwargs['audio_at_end'])
        self.assertTrue(run.call_args.kwargs['independent_sources'])
        self.assertFalse(run.call_args.kwargs['auto_expand'])
        self.assertEqual(supervisor.LIMITS, {'prepare': 2, 'text': 4, 'audio': 1})
        saved = json.loads((self.base / 'rollout.json').read_text())
        self.assertFalse(saved['pilotAudioGatePassed'])

    def test_audio_barrier_includes_waits_errors_and_running_workers(self):
        states = {'a': self.states(prepare='prepared', text='ready'),
                  'b': self.states(prepare='waiting_sources')}
        self.assertFalse(supervisor.audio_batch_ready(states, set(states), {}))
        states['b'] = self.states(prepare='error', text='blocked', audio='blocked')
        self.assertTrue(supervisor.audio_batch_ready(states, set(states), {}))
        self.assertFalse(supervisor.audio_batch_ready(states, set(states), {('b', 'prepare'): {}}))

    def test_audio_resume_requires_saved_renderer_input(self):
        directory = self.base / 'berlin/tts-job'
        directory.mkdir(parents=True)
        (directory / 'progress.json').write_text('{}')
        self.assertNotIn('--resume', supervisor.command('audio', 'berlin'))
        (directory / 'input.json').write_text('{}')
        self.assertIn('--resume', supervisor.command('audio', 'berlin'))
        self.assertNotIn('--resume', supervisor.command('prepare', 'berlin'))
        self.assertNotIn('--resume', supervisor.command('text', 'berlin'))

    def test_interrupted_stages_resume_without_leaving_downstream_blocked(self):
        prior = {'cities': {'nice': self.states(prepare='paused', text='blocked', audio='blocked')}}
        for stage in ('text', 'audio'):
            prior['cities']['nice'][stage]['reason'] = 'previous_stage'
        with patch.object(supervisor, 'output_ready', return_value=False):
            states = supervisor.recover_states(prior, ['nice', 'new-city'])
        supervisor.refresh_dependencies(states['nice'])
        self.assertEqual(states['nice'], self.states())
        self.assertEqual(states['new-city'], self.states())
        self.assertEqual(prior['cities']['nice']['prepare']['phase'], 'paused')

    def test_saved_success_skips_work_and_actual_failure_remains_visible(self):
        prior = {'cities': {'roma': self.states(prepare='error', text='error', audio='blocked')}}
        prior['cities']['roma']['prepare'].update(reason='old_failure', message='stale', error='old')
        prior['cities']['roma']['text'].update(reason='text_review', error='Actual failure')
        prior['cities']['roma']['audio']['reason'] = 'previous_stage'
        with patch.object(supervisor, 'output_ready', side_effect=lambda stage, slug: stage == 'prepare'):
            states = supervisor.recover_states(prior, ['roma'])
        displayed = supervisor.display_state(states['roma'])
        self.assertEqual(displayed['stage'], 'text')
        self.assertEqual(displayed['error'], 'Actual failure')
        self.assertNotIn('reason', states['roma']['prepare'])
        self.assertEqual(supervisor.display_state(self.states(prepare='prepared', text='ready', audio='completed'))['stage'], 'audio')

    def test_active_process_group_prevents_recovery(self):
        previous = {'cities': {'berlin': self.states(audio='paused')}}
        previous['cities']['berlin']['audio']['pid'] = 123
        with patch.object(supervisor, 'group_alive', return_value=True):
            with self.assertRaisesRegex(RuntimeError, 'Previous process group still running'):
                supervisor.recover_states(previous, ['berlin'])

    def test_true_upstream_failure_blocks_both_downstream_stages(self):
        stages = self.states(prepare='error')
        supervisor.refresh_dependencies(stages)
        self.assertEqual([stages[s]['phase'] for s in supervisor.STAGES], ['error', 'blocked', 'blocked'])
        self.assertEqual(supervisor.display_state(stages)['stage'], 'prepare')

    def test_source_deadline_survives_restart_and_requires_explicit_recovery(self):
        deadline = '2027-01-15T09:00:00.000Z'
        block = supervisor.source_block('nice', 'unavailable',
            'Overpass acquisition failed after 4 attempt(s): server error 429; retry no earlier than ' + deadline)
        self.assertEqual(supervisor.timestamp(block['retryNotBefore']), supervisor.timestamp(deadline))
        states = {'nice': self.states(prepare='error'), 'other': self.states(prepare='error')}
        states['nice']['prepare']['reason'] = 'temporary_sources'
        saved = copy.deepcopy(block)
        self.assertEqual(supervisor.resume_sources(saved, states, True), block)
        self.clock += 4_000
        self.assertEqual(supervisor.resume_sources(saved, states, False), block)
        self.assertIsNone(supervisor.resume_sources(saved, states, True))
        self.assertEqual(states['nice']['prepare']['phase'], 'queued')
        self.assertEqual(states['other']['prepare']['phase'], 'error')

    def test_source_circuit_has_minimum_cooldown_and_handles_large_dates(self):
        blocked = supervisor.source_block('nice', 'unavailable',
            'Overpass acquisition deferred until 2027-01-15T08:01:41.000Z')
        self.assertEqual(supervisor.timestamp(blocked['retryNotBefore']), supervisor.time.time() + 300)
        huge = supervisor.source_block('nice', 'unavailable',
            'Overpass acquisition deferred until +275760-09-13T00:00:00.000Z')
        self.assertIsNotNone(supervisor.resume_sources(huge, {}, True))
        self.assertIsNotNone(supervisor.resume_sources({'at': 'bad'}, {}, True))

    def test_exited_direct_child_does_not_free_slot_until_descendants_stop(self):
        process = Mock(pid=123)
        process.poll.return_value = 1
        job = {'process': process, 'start': self.clock}
        with patch.object(supervisor, 'group_alive', return_value=True):
            self.assertIsNone(supervisor.poll_job(job, 'audio'))
            self.kill.assert_called_with(123, signal.SIGTERM)
            self.clock += 301
            self.assertIsNone(supervisor.poll_job(job, 'audio'))
            self.kill.assert_called_with(123, signal.SIGKILL)
        with patch.object(supervisor, 'group_alive', return_value=False):
            self.assertEqual(supervisor.poll_job(job, 'audio'), (1, 301))

    def test_timeout_waits_for_group_and_user_stop_is_marked_paused(self):
        process = Mock(pid=123)
        process.poll.return_value = None
        job = {'process': process, 'start': self.clock - supervisor.TIMEOUTS['audio'] - 1}
        with patch.object(supervisor, 'group_alive', return_value=True):
            self.assertIsNone(supervisor.poll_job(job, 'audio'))
            self.kill.assert_called_once_with(123, signal.SIGTERM)
            self.assertNotIn('userStop', job)
            supervisor.poll_job(job, 'audio', stopping=True)
            self.assertTrue(job['userStop'])
            self.assertEqual(self.kill.call_count, 1)

    def test_zombie_only_group_does_not_hold_queue_forever(self):
        stat = Mock()
        stat.read_text.return_value = '123 (renderer name) Z 1 123 123 0 0'
        with patch.object(supervisor, 'Path') as paths:
            paths.return_value.glob.return_value = [stat]
            self.assertFalse(supervisor.group_alive(123))
            stat.read_text.return_value = '123 (renderer name) S 1 123 123 0 0'
            self.assertTrue(supervisor.group_alive(123))

    def test_source_outage_stops_other_preparations_but_finishes_existing_text_and_audio(self):
        for slug in ('nice', 'paris', 'milan'):
            (self.base / slug).mkdir()
        available = {('prepare', 'paris')}
        self.enter(patch.object(supervisor.phase_receipts, 'create'))
        launches, snapshots = [], []
        self.enter(patch.object(supervisor, 'output_ready', side_effect=lambda stage, slug: (stage, slug) in available))
        self.enter(patch.object(supervisor, 'group_alive', return_value=False))
        self.enter(patch.object(supervisor, 'publish_status', side_effect=lambda states, phase, blocked, started:
                              snapshots.append((copy.deepcopy(states), phase, copy.deepcopy(blocked)))))

        def launch(args, **options):
            if '--city-dir' in args:
                stage, slug = 'text', Path(args[args.index('--city-dir') + 1]).name
            else:
                stage, slug = ('audio' if 'audio.cjs' in args[3] else 'prepare'), args[4]
            launches.append((stage, slug))
            process = Mock(pid=100 + len(launches))
            finish = self.clock + (5 if stage == 'prepare' else 10)
            if stage == 'prepare':
                options['stdout'].write('Overpass acquisition failed after 4 attempt(s): server error 429; retry no earlier than 2027-01-15T09:00:00.000Z\n')
                options['stdout'].flush()
                (self.base / slug / 'prepare-result.json').write_text(json.dumps({'type':'service_wait','message':'429',
                    'sourceFailure':{'queryHash':'query-1','retryNotBefore':'2027-01-15T09:00:00.000Z'}}))

            def poll():
                if self.clock < finish:
                    return None
                if stage != 'prepare':
                    available.add((stage, slug))
                return 1 if stage == 'prepare' else 0

            process.poll.side_effect = poll
            return process

        self.launch.side_effect = launch
        supervisor.run_queue(['nice', 'paris', 'milan'], {})
        self.assertEqual(launches[:3], [('prepare', 'nice'), ('text', 'paris'), ('audio', 'paris')])
        self.assertEqual(launches.count(('prepare','nice')),4)
        self.assertEqual(launches.count(('prepare','milan')),0)
        states, phase, blocked = snapshots[-1]
        self.assertEqual(phase, 'completed_with_errors')
        self.assertEqual(states['paris']['audio']['phase'], 'completed')
        self.assertEqual(states['nice']['prepare']['reason'], 'source_recovery_exhausted')
        self.assertTrue(any(phase=='waiting_sources' for _,phase,_ in snapshots))

    def test_exception_cleans_processes_before_releasing_main_lock(self):
        slugs = ['marseille','hamburg','venezia'] + [f'city-{i}' for i in range(27)]
        for slug in slugs:
            (self.base / slug).mkdir()
        (self.base / 'manifest.json').write_text(json.dumps({'cities': [{'slug': s} for s in slugs]}))
        executable = self.base / 'executable'
        executable.touch()
        self.enter(patch.object(supervisor, 'NODE', executable))
        self.enter(patch.object(supervisor, 'AUDIO_PYTHON', executable))
        self.enter(patch.object(supervisor, 'output_ready', return_value=False))
        self.enter(patch.object(supervisor, 'group_alive', return_value=False))
        process = Mock(pid=123)
        process.poll.return_value = None
        self.launch.side_effect = None
        self.launch.return_value = process
        publications = []

        def publish(states, phase, blocked, started):
            publications.append(phase)
            if phase == 'running' and publications.count('running') == 2:
                raise RuntimeError('status storage failed')

        self.enter(patch.object(supervisor, 'publish_status', side_effect=publish))

        def terminate(pid, sig):
            with (self.base / 'queue.lock').open('a+') as other:
                with self.assertRaises(BlockingIOError):
                    fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)
            process.poll.return_value = -15

        self.kill.side_effect = terminate
        with self.assertRaisesRegex(RuntimeError, 'status storage failed'):
            supervisor.main()
        self.kill.assert_called_once_with(123, signal.SIGTERM)
        self.assertEqual(publications, ['running', 'running', 'paused'])
        with (self.base / 'queue.lock').open('a+') as other:
            fcntl.flock(other, fcntl.LOCK_EX | fcntl.LOCK_NB)



class RolloutTests(unittest.TestCase):
    def test_missing_pilot_cannot_release_remaining_cities(self):
        with tempfile.TemporaryDirectory() as temp:
            b=Path(temp);tested=b/'implementation.py';tested.write_text('tested')
            (b/'reliability-gates.json').write_text(json.dumps({'offlineTestsPassed':True,'interruptionTestsPassed':True,
                'testedFiles':{str(tested):supervisor.phase_receipts.sha(tested)}}))
            with patch.object(supervisor,'B',b),patch.object(supervisor,'output_ready',side_effect=lambda stage,slug:slug!='venezia'),patch.object(supervisor.verify_audio_recovery_copy,'verify'):
                with self.assertRaisesRegex(AssertionError,'venezia'):supervisor.approve_rollout()
            self.assertNotIn('expandBatchAllowed',json.loads((b/'reliability-gates.json').read_text()))
    def test_untested_implementation_cannot_release_completed_pilots(self):
        with tempfile.TemporaryDirectory() as temp:
            b=Path(temp);tested=b/'implementation.py';tested.write_text('old')
            gates={'offlineTestsPassed':True,'interruptionTestsPassed':True,'testedFiles':{str(tested):supervisor.phase_receipts.sha(tested)}}
            (b/'reliability-gates.json').write_text(json.dumps(gates));tested.write_text('changed')
            with patch.object(supervisor,'B',b),patch.object(supervisor,'output_ready',return_value=True),patch.object(supervisor.verify_audio_recovery_copy,'verify') as copy_check:
                with self.assertRaisesRegex(AssertionError,'changed'):supervisor.approve_rollout()
                copy_check.assert_not_called()

if __name__ == '__main__':
    unittest.main()
