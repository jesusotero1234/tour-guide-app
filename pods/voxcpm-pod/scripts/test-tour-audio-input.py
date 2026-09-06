#!/usr/bin/env python3
"""CPU regression tests for saved-tour audio preparation."""
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

POD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POD / "src"))
from utils.tour_audio_input import prepare_input

STOP = "22222222-2222-4222-8222-222222222222"


class TourInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "input.json"
        self.preset = POD / "presets/guide-es-a.json"

    def prepare(self, text, language="es", stops=None):
        payload = {"language": language, "stops": stops or [{"id": STOP, "text": text}]}
        self.path.write_text(json.dumps(payload))
        return prepare_input(self.path, self.preset)

    def test_paragraphs_and_pronunciation_preserve_original(self):
        original = "Llegamos en 1248.\r\nAquí vivió Alfonso X.\r\n\r\nSeguimos hacia el patio."
        prepared = self.prepare(original)
        stop = prepared["stops"][0]
        self.assertEqual(stop["text"], original)
        self.assertIn("mil doscientos cuarenta y ocho", stop["spoken"])
        self.assertIn("Alfonso décimo", stop["spoken"])
        self.assertEqual(sum(c.boundary == "paragraph" for c in stop["chunks"]), 2)
        self.assertEqual(prepared["preset"]["paragraphPauseMs"], 750)
        self.assertEqual(prepared["preset"]["sentencePauseMs"], 220)

    def test_french_does_not_receive_spanish_replacements(self):
        spoken = self.prepare("En 1248, nous entrons dans la cour.", "fr")["stops"][0]["spoken"]
        self.assertIn("1248", spoken)
        self.assertNotIn("mil", spoken)

    def test_duplicate_ids_and_unsupported_languages_fail(self):
        with self.assertRaises(ValueError):
            self.prepare("Hola", stops=[{"id": STOP, "text": "Hola"}, {"id": STOP, "text": "Otra"}])
        with self.assertRaises(ValueError):
            self.prepare("Hallo", "de")
        with self.assertRaises(ValueError):
            self.prepare("Hola", stops=[{"id": "../../escape", "text": "Hola"}])

    def test_prepare_cli_requires_no_gpu_runtime(self):
        self.prepare("Bienvenidos al patio.\nNos detenemos para observarlo.")
        progress = Path(self.temp.name) / "progress.json"
        result = subprocess.run([sys.executable, str(POD / "scripts/render-tour.py"), "--input", str(self.path),
                                 "--output", str(Path(self.temp.name) / "audio"), "--progress", str(progress),
                                 "--prepare-only"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(progress.read_text())["phase"], "prepared")
        self.assertFalse((Path(self.temp.name) / "audio").exists())


if __name__ == "__main__":
    unittest.main()
