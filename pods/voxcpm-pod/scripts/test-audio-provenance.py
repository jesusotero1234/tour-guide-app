#!/usr/bin/env python3
"""CPU-only provenance linkage check; no model or GPU required."""
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from utils.audio_provenance import capture_generation, input_audio, verify_record, write_audio_record


class ProvenanceLinkTests(unittest.TestCase):
    def test_actual_audio_arguments_and_effective_defaults(self):
        class Model:
            def _generate(self, text, reference_wav_path=None, cfg_value=2.0, max_len=4096):
                pass

            def generate(self, **kwargs):
                return b"generated"

        _, event = capture_generation(Model(), model_id="fixture", revision="a" * 40,
                                      text="Hello", reference_wav_path=None, seed=7)
        self.assertEqual(event["inputMode"], "text_only")
        self.assertEqual(event["inputs"], [])
        self.assertEqual(event["parameters"]["seed"], 7)
        self.assertEqual(event["parameters"]["max_len"], 4096)
        self.assertIsNotNone(event["generatedAt"])
        with self.assertRaises(ValueError):
            capture_generation(Model(), model_id="fixture", revision=None, text="Hello")

    def test_reference_output_and_unknown_history(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            reference = root / "reference.wav"
            reference.write_bytes(b"synthetic reference fixture")
            origin = write_audio_record(reference, {
                "kind": "voice_reference", "inputMode": "text_only",
                "generatedAt": "2026-09-08T12:00:00+00:00", "text": "Hello",
                "modelId": "fixture", "modelRevision": "a" * 40,
                "parameters": {"seed": 42}, "inputs": [],
            }, destination=reference.with_suffix(".provenance.json"))
            output = root / "narration.mp3"
            output.write_bytes(b"narration fixture")
            record = write_audio_record(output, {
                "kind": "narration", "inputMode": "reference_audio",
                "inputs": [input_audio(reference)], "text": "Welcome",
            })
            verified = verify_record(record)
            self.assertEqual(verified["inputs"][0]["generationRecord"]["id"], json.loads(origin.read_text())["id"])
            self.assertEqual(verified["file"], output.name)
            self.assertIsNone(verified["generatedAt"])
            self.assertIsNone(verified["inputs"][0]["license"])
            self.assertNotIn("rightsApproved", verified)
            self.assertEqual(write_audio_record(output, {"kind": "narration", "inputMode": "unknown"}), record)
            output.write_bytes(b"changed output")
            with self.assertRaises(ValueError):
                verify_record(record)
            output.write_bytes(b"narration fixture")
            reference.write_bytes(b"changed reference")
            with self.assertRaises(ValueError):
                verify_record(record)


if __name__ == "__main__":
    unittest.main()
