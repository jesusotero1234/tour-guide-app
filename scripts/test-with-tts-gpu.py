#!/usr/bin/env python3
"""Exercise supervisor cleanup without touching the real GPU or Qwen process."""
import importlib.util
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SPEC = importlib.util.spec_from_file_location("gpu_supervisor", Path(__file__).with_name("with-tts-gpu.py"))
SUPERVISOR = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(SUPERVISOR)


class SupervisorTests(unittest.TestCase):
    def run_supervisor(self, parent_dead=False, initially_running=True):
        with tempfile.TemporaryDirectory() as temporary:
            home = Path(temporary)
            state = home / ".local/state/qwen"
            state.mkdir(parents=True)
            if initially_running:
                (state / "qwen.pid").write_text("1234")
            report = home / "report.json"
            child = MagicMock(pid=5678)
            child.poll.return_value = None if parent_dead else 1
            child.returncode = 1
            child.wait.return_value = 1

            def exists(pid, _signal):
                if pid == 9999 and parent_dead:
                    raise ProcessLookupError()

            def command(args, **_kwargs):
                return MagicMock(returncode=75 if str(args[0]).endswith("qwen-ensure") else 0)

            with patch.object(SUPERVISOR.Path, "home", return_value=home), \
                 patch.object(SUPERVISOR.os, "kill", side_effect=exists), \
                 patch.object(SUPERVISOR.os, "killpg") as kill_group, \
                 patch.object(SUPERVISOR.signal, "signal"), \
                 patch.object(SUPERVISOR, "get_json", return_value=[]), \
                 patch.object(SUPERVISOR.subprocess, "run", side_effect=command) as run, \
                 patch.object(SUPERVISOR.subprocess, "check_output", return_value="16303, 1000, 15303"), \
                 patch.object(SUPERVISOR.subprocess, "Popen", return_value=child), \
                 patch("sys.argv", ["with-tts-gpu.py", "--report", str(report), "--parent-pid", "9999", "--", "fake-renderer"]):
                if parent_dead:
                    with self.assertRaisesRegex(RuntimeError, "Owning backend exited"):
                        SUPERVISOR.main()
                    kill_group.assert_called_once_with(5678, SUPERVISOR.signal.SIGTERM)
                else:
                    self.assertEqual(SUPERVISOR.main(), 1)
                starts = [call for call in run.call_args_list if str(call.args[0][0]).endswith("qwen-start")]
                self.assertEqual(len(starts), int(initially_running))
            return [entry["stage"] for entry in json.loads(report.read_text())]

    def test_backend_exit_terminates_audio_and_restores_qwen(self):
        stages = self.run_supervisor(parent_dead=True)
        self.assertIn("tts_terminated", stages)
        self.assertEqual(stages[-1], "qwen_restored")

    def test_failed_renderer_restores_qwen_and_preserves_failure(self):
        self.assertEqual(self.run_supervisor()[-1], "qwen_restored")

    def test_qwen_initially_off_stays_off(self):
        self.assertNotIn("qwen_restored", self.run_supervisor(initially_running=False))


if __name__ == "__main__":
    unittest.main()
