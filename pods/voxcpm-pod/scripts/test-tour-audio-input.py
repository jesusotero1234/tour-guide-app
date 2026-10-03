#!/usr/bin/env python3
"""CPU regression tests for saved-tour audio preparation."""
import json
import hashlib
import importlib.util
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

POD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POD / "src"))
from utils.tour_audio_input import _expand_french_years, generation_arguments, prepare_input, prepare_piece_text
from utils.sanitize import sanitize_text
import re

STOP = "22222222-2222-4222-8222-222222222222"


class TourInputTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "input.json"
        self.preset = POD / "presets/guide-es-a.json"
        self.french_preset = POD / "presets/guide-fr-a.json"

    def prepare(self, text, language="es", stops=None, preset=None):
        payload = {"language": language, "stops": stops or [{"id": STOP, "text": text}]}
        self.path.write_text(json.dumps(payload))
        return prepare_input(self.path, preset or self.preset)

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
        original = "En 1248, nous entrons dans la cour."
        prepared = self.prepare(original, "fr", preset=self.french_preset)
        stop = prepared["stops"][0]
        self.assertEqual(stop["text"], original)
        self.assertIn("mille deux cent quarante-huit", stop["spoken"])
        self.assertNotIn("1248", stop["spoken"])
        self.assertNotIn("mil doscientos", stop["spoken"])

    def test_french_year_expansion_edge_cases(self):
        cases = [
            ("1248", "mille deux cent quarante-huit"),
            ("1492", "mille quatre cent quatre-vingt-douze"),
            ("1800", "mille huit cents"),
            ("1900", "mille neuf cents"),
            ("1971", "mille neuf cent soixante et onze"),
            ("1980", "mille neuf cent quatre-vingts"),
            ("2000", "deux mille"),
            ("2021", "deux mille vingt et un"),
        ]
        for digits, expected in cases:
            with self.subTest(digits=digits):
                spoken = self.prepare(f"L'année {digits}.", "fr", preset=self.french_preset)["stops"][0]["spoken"]
                self.assertIn(expected, spoken)
                self.assertNotIn(digits, spoken)

    def test_french_year_range_and_punctuation(self):
        original = "De 1248–1492, la cour était active."
        prepared = self.prepare(original, "fr", preset=self.french_preset)
        stop = prepared["stops"][0]
        self.assertEqual(stop["text"], original)
        self.assertIn("mille deux cent quarante-huit", stop["spoken"])
        self.assertIn("mille quatre cent quatre-vingt-douze", stop["spoken"])
        self.assertNotIn("1248", stop["spoken"])
        self.assertNotIn("1492", stop["spoken"])

    def test_french_decimal_and_long_numbers_unchanged(self):
        original = "La mesure est 1248,5 et le code est 12.1492. Codes A1248, 1492B, 12345. Surface : 10 000."
        prepared = self.prepare(original, "fr", preset=self.french_preset)
        stop = prepared["stops"][0]
        self.assertEqual(stop["text"], original)
        self.assertIn("1248,5", stop["spoken"])
        self.assertIn("12.1492", stop["spoken"])
        for token in ("A1248", "1492B", "12345", "10 000"):
            self.assertIn(token, stop["spoken"])

    def test_french_paragraph_boundaries_preserved(self):
        original = "Première partie en 1248.\n\nDeuxième partie en 1492."
        prepared = self.prepare(original, "fr", preset=self.french_preset)
        stop = prepared["stops"][0]
        self.assertEqual(stop["text"], original)
        self.assertIn("mille deux cent quarante-huit", stop["spoken"])
        self.assertIn("mille quatre cent quatre-vingt-douze", stop["spoken"])
        self.assertEqual(sum(c.boundary == "paragraph" for c in stop["chunks"]), 1)

    def test_duplicate_ids_and_unsupported_languages_fail(self):
        with self.assertRaises(ValueError):
            self.prepare("Hola", stops=[{"id": STOP, "text": "Hola"}, {"id": STOP, "text": "Otra"}])
        with self.assertRaises(ValueError):
            self.prepare("Olá", "pt")
        with self.assertRaises(ValueError):
            self.prepare("Hola", stops=[{"id": "../../escape", "text": "Hola"}])

    def test_documentary_profile_uses_reference_without_continuation(self):
        prepared = self.prepare("En 1987, nous sommes ici.", "fr",
                                preset=POD / "presets/guide-fr-documentary-serene.json")
        stop = prepared["stops"][0]
        self.assertEqual(stop["text"], "En 1987, nous sommes ici.")
        self.assertIn("mille neuf cent quatre-vingt-sept", stop["spoken"])
        preset = prepared["preset"]
        self.assertEqual(preset["speed"], 1.0)
        self.assertEqual(preset["mp3CompressionLevel"], 0.0)
        args = generation_arguments(stop["chunks"][0].text, preset, prepared["reference"])
        self.assertEqual(set(args), {"text", "reference_wav_path"})
        self.assertTrue(args["text"].startswith("(" + preset["stylePrompt"] + ")"))
        self.assertNotIn(preset["stylePrompt"], stop["spoken"])
        legacy = self.prepare("Bonjour.", "fr", preset=self.french_preset)
        args = generation_arguments("Bonjour.", legacy["preset"], legacy["reference"])
        self.assertEqual(args["text"], "Bonjour.")
        self.assertEqual(args["prompt_wav_path"], args["reference_wav_path"])
        self.assertEqual(args["prompt_text"], legacy["preset"]["referenceText"])

    def test_invalid_generation_settings_fail_before_gpu(self):
        base = json.loads((POD / "presets/guide-fr-documentary-serene.json").read_text())
        base["reference"] = str(POD / "presets" / base["reference"])
        temp_preset = Path(self.temp.name) / "preset.json"
        cases = [{"generationMode": "unknown"}, {"stylePrompt": " "},
                 {"stylePrompt": "bad)prompt"}, {"generationMode": "continuation"},
                 {"mp3CompressionLevel": True}, {"mp3CompressionLevel": -0.1},
                 {"mp3CompressionLevel": float("nan")}]
        for changed in cases:
            with self.subTest(changed=changed):
                temp_preset.write_text(json.dumps({**base, **changed}))
                with self.assertRaises(ValueError):
                    self.prepare("Bonjour.", "fr", preset=temp_preset)

    def test_identity_pins_preset_reference_and_model(self):
        self.prepare("Esta audioguía utiliza una voz generada por inteligencia artificial.")
        payload = json.loads(self.path.read_text())
        preset = json.loads(self.preset.read_text())
        payload["identity"] = {
            "modelId": "openbmb/VoxCPM2", "modelRevision": preset["modelRevision"],
            "presetSha256": hashlib.sha256(self.preset.read_bytes()).hexdigest(),
            "referenceSha256": hashlib.sha256((self.preset.parent / preset["reference"]).read_bytes()).hexdigest(),
        }
        self.path.write_text(json.dumps(payload))
        self.assertEqual(prepare_input(self.path, self.preset)["identity"], payload["identity"])
        for key in ("modelRevision", "presetSha256", "referenceSha256"):
            changed = json.loads(json.dumps(payload))
            changed["identity"][key] = "0" * len(changed["identity"][key])
            self.path.write_text(json.dumps(changed))
            with self.assertRaises(ValueError):
                prepare_input(self.path, self.preset)

    def test_existing_foreign_presets_preserve_language_and_text(self):
        samples = {"en": "Welcome to the square in 1248.", "de": "Willkommen auf dem Platz im Jahr 1248.",
                   "it": "Benvenuti nella piazza nel 1248."}
        for language, text in samples.items():
            with self.subTest(language=language):
                self.preset = POD / f"presets/guide-{language}-a.json"
                prepared = self.prepare(text, language)
                self.assertEqual(prepared["language"], language)
                self.assertEqual(prepared["stops"][0]["spoken"], text)
                with self.assertRaises(ValueError):
                    self.prepare(text, "es")

    def test_prepare_cli_requires_no_gpu_runtime(self):
        self.prepare("Bienvenidos al patio.\nNos detenemos para observarlo.")
        progress = Path(self.temp.name) / "progress.json"
        result = subprocess.run([sys.executable, str(POD / "scripts/render-tour.py"), "--input", str(self.path),
                                 "--output", str(Path(self.temp.name) / "audio"), "--progress", str(progress),
                                 "--prepare-only"], capture_output=True, text=True)
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(progress.read_text())["phase"], "prepared")
        self.assertFalse((Path(self.temp.name) / "audio").exists())


def _legacy_inline_preparation(text, language, preset):
    """Frozen copy of the per-piece logic that lived inline in prepare_input before it moved to prepare_piece_text."""
    spoken = text.replace("\r\n", "\n").replace("\r", "\n")
    if language == "es":
        for phrase, replacement in preset.get("textReplacements", {}).items():
            spoken = re.sub(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", lambda _: replacement, spoken)
    if preset.get("singleNewlineParagraphs"):
        spoken = re.sub(r"\n+", "\n\n", spoken)
    spoken = sanitize_text(spoken)
    if language == "fr":
        spoken = _expand_french_years(spoken)
    return spoken


class PreparePieceTextTests(unittest.TestCase):
    SAMPLES = {
        "es": ["Llegamos en 1248.\r\nAquí vivió Alfonso X.\r\n\r\nSeguimos hacia el patio.", "En el siglo XIV, Pedro I vivió a 3 km y 52 m de aquí.",
               "1492. Año de la conquista.", "Visita St. Michel.\n\nAve. Central, 15.800 tubos.", "**Negrita** y [enlace](http://x.y) (nota)."],
        "fr": ["En 1987, nous sommes ici.", "Le 14 juillet 1789, 1 500 personnes et 2,5 km.\nLigne suivante.", "L'an 1000 et 999."],
        "en": ["Welcome to the square in 1248.\nSecond line.", "St. Paul's, 3 km away."],
        "de": ["Willkommen auf dem Platz im Jahr 1248.", "Das 19. Jahrhundert.\r\nZweite Zeile."],
        "it": ["Benvenuti nella piazza nel 1248.", "Il XIX secolo, a 52 m."],
    }

    def test_matches_the_previous_inline_logic_byte_for_byte(self):
        for language, texts in self.SAMPLES.items():
            preset = json.loads((POD / f"presets/guide-{language}-a.json").read_text())
            for text in texts:
                with self.subTest(language=language, text=text[:30]):
                    self.assertEqual(prepare_piece_text(text, language, preset), _legacy_inline_preparation(text, language, preset))

    def test_matches_with_synthetic_presets(self):
        preset = {"textReplacements": {"Alfonso X": "Alfonso décimo"}, "singleNewlineParagraphs": True}
        for language in self.SAMPLES:
            for text in self.SAMPLES[language]:
                self.assertEqual(prepare_piece_text(text, language, preset), _legacy_inline_preparation(text, language, preset))

    def test_prepare_input_uses_the_same_function(self):
        with tempfile.TemporaryDirectory() as temp:
            for language, texts in self.SAMPLES.items():
                preset_path = POD / f"presets/guide-{language}-a.json"
                preset = json.loads(preset_path.read_text())
                path = Path(temp) / "input.json"
                path.write_text(json.dumps({"language": language, "stops": [{"id": STOP, "text": texts[0]}]}))
                self.assertEqual(prepare_input(path, preset_path)["stops"][0]["spoken"], prepare_piece_text(texts[0], language, preset))

    def test_http_service_uses_the_shared_function(self):
        # voxcpm.py imports torch and the model, so it is checked as source text rather than imported.
        source = (POD / "src/services/voxcpm.py").read_text()
        self.assertIn("prepare_piece_text", source)
        self.assertNotIn("cleaned = sanitize_text(text)", source)


class SpokenTextInputTests(unittest.TestCase):
    """A piece that carries spokenText is synthesised exactly as given, after the gate (plan 02 section 3.3)."""

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.path = Path(self.temp.name) / "input.json"

    def prepare(self, stops, language="es", **extra):
        self.path.write_text(json.dumps({"language": language, "stops": stops, **extra}))
        return prepare_input(self.path, POD / f"presets/guide-{language}-a.json")

    def test_provided_spoken_text_is_used_verbatim_and_replacements_do_not_apply(self):
        # "Alfonso X" is a textReplacement of the Spanish preset: with spokenText it must not be touched.
        spoken = "Alfonso décimo vivió aquí.\n\nSegundo párrafo."
        prepared = self.prepare([{"id": STOP, "text": "Alfonso X vivió aquí.", "spokenText": spoken}], speechVersion="speech-1")
        stop = prepared["stops"][0]
        self.assertEqual(stop["spoken"], spoken)
        self.assertEqual(stop["text"], "Alfonso X vivió aquí.")
        self.assertEqual((stop["speechSource"], stop["speechVersion"]), ("provided", "speech-1"))
        self.assertEqual(sum(c.boundary == "paragraph" for c in stop["chunks"]), 1)

    def test_legacy_pieces_are_marked_legacy(self):
        stop = self.prepare([{"id": STOP, "text": "Alfonso X vivió en 1248."}])["stops"][0]
        self.assertEqual((stop["speechSource"], stop["speechVersion"]), ("legacy", None))
        self.assertIn("Alfonso décimo", stop["spoken"])

    def test_gate_blocks_digits_romans_abbreviations_and_symbols(self):
        for bad in ("Llegó en 1248.", "Alfonso X vivió.", "Siglo I a. C.", "Un 45% más.", "Una nota (importante)."):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError) as caught:
                    self.prepare([{"id": STOP, "text": bad, "spokenText": bad}])
                self.assertEqual(caught.exception.args[0], "SPEECH_GATE")
                self.assertEqual(caught.exception.args[1], STOP)
                self.assertTrue(caught.exception.args[2])

    def test_spoken_text_must_be_a_fixed_point_of_sanitize(self):
        for bad in ("Un **gran** rey.", "Hola\nmundo.", "Dos   espacios."):
            with self.subTest(bad=bad):
                with self.assertRaises(ValueError) as caught:
                    self.prepare([{"id": STOP, "text": "x", "spokenText": bad}])
                self.assertEqual(caught.exception.args[0], "SPEECH_NOT_CLEAN")

    def test_normalizer_output_always_passes(self):
        sys.path.insert(0, str(POD / "src"))
        from utils.speech import normalize
        for language, text in (("es", "Jaime I vivió en 1248 y el siglo XIV."), ("fr", "Louis XIV en 1643, n° 5."), ("de", "Im 19. Jahrhundert, 1.665 Meter."),
                               ("it", "Nel XIX secolo, 15.800 canne."), ("en", "In 1876, Louis XIV and 45%.")):
            with self.subTest(language=language):
                spoken = normalize(text, language).spoken
                prepared = self.prepare([{"id": STOP, "text": text, "spokenText": spoken}], language)
                self.assertEqual(prepared["stops"][0]["spoken"], spoken)

    def test_sidecar_records_how_the_text_was_obtained(self):
        source = (POD / "scripts/render-tour.py").read_text()
        self.assertIn("'speechSource': stop['speechSource']", source)
        self.assertIn("'speechVersion': stop['speechVersion']", source)


class ResumeTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.directory = Path(self.temp.name)
        self.input = self.directory / "input.json"
        self.output = self.directory / "audio"
        self.output.mkdir()
        self.progress = self.directory / "progress.json"
        self.current = "33333333-3333-4333-8333-333333333333"
        preset_path = POD / "presets/guide-es-a.json"
        preset = json.loads(preset_path.read_text())
        identity = {"modelId": "openbmb/VoxCPM2", "modelRevision": preset["modelRevision"],
                    "presetSha256": hashlib.sha256(preset_path.read_bytes()).hexdigest(),
                    "referenceSha256": hashlib.sha256((preset_path.parent / preset["reference"]).read_bytes()).hexdigest()}
        self.input.write_text(json.dumps({"language": "es", "identity": identity,
            "stops": [{"id": STOP, "text": "Bienvenidos al patio."},
                      {"id": self.current, "text": "Seguimos hacia el jardín."}]}))
        self.prepared = prepare_input(self.input, preset_path)
        spec = importlib.util.spec_from_file_location("renderer", POD / "scripts/render-tour.py")
        self.renderer = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(self.renderer)
        first = self.write_clip(self.prepared["stops"][0])
        self.progress.write_text(json.dumps({"phase": "generating", "completedStops": 1,
            "totalStops": 2, "currentStopId": self.current, "completedChunks": 1,
            "results": [first], "inputSha256": hashlib.sha256(self.input.read_bytes()).hexdigest()}))

    def write_clip(self, stop):
        import numpy as np
        import soundfile as sf
        from utils.audio_provenance import combine_generations, input_audio, write_audio_record
        from utils.narration_audio import NARRATION_POST_PROCESSING
        preset, identity = self.prepared["preset"], self.prepared["identity"]
        target = self.output / (stop["id"] + ".mp3")
        sf.write(target, 0.1 * np.sin(np.arange(96000) * 0.07), 48000, format="MP3")
        events = []
        for chunk in stop["chunks"]:
            args = generation_arguments(chunk.text, preset, self.prepared["reference"])
            events.append({"recordKind": "generation", "generatedAt": "2026-09-20T00:00:00Z",
                "inputMode": "reference_audio", "modelId": identity["modelId"],
                "modelRevision": identity["modelRevision"], "text": args["text"],
                "referenceText": args.get("prompt_text"), "parameters": {"seed": preset["seed"],
                    "cfg_value": 2.0, "inference_timesteps": 10, "max_len": 4096, "retry_badcase": False},
                "inputs": [input_audio(value, role=key) for key, value in args.items()
                           if key in ("reference_wav_path", "prompt_wav_path")]})
        write_audio_record(target, {**combine_generations(events), "kind": "narration", "identity": identity,
            "stopId": stop["id"], "spokenText": stop["spoken"],
            "postProcessing": {**NARRATION_POST_PROCESSING, "paragraphPauseMs": preset["paragraphPauseMs"],
                "sentencePauseMs": preset["sentencePauseMs"], "speed": preset.get("speed", 1.0),
                "sampleRate": 48000, "format": "MP3", "compressionLevel": preset.get("mp3CompressionLevel", 0.8),
                "bitrateMode": "VARIABLE", "crossfadeMs": 18, "trimEdgeSilenceMs": 120, "silenceThreshold": 0.003},
            "modelOptions": {"engine": "nano-vllm-voxcpm", "mode": preset.get("generationMode", "continuation"),
                "stylePrompt": preset.get("stylePrompt"), "inference_timesteps": 10, "temperature": 1.0,
                "device": "cuda"}}, destination=target.with_suffix(".provenance.json"))
        return {"id": stop["id"], "filename": target.name, "durationSeconds": sf.info(target).duration,
                "sha256": hashlib.sha256(target.read_bytes()).hexdigest(), "modelRevision": identity["modelRevision"]}

    def cli(self, *flags):
        return subprocess.run([sys.executable, str(POD / "scripts/render-tour.py"),
            "--input", str(self.input), "--output", str(self.output), "--progress", str(self.progress),
            "--resume", *flags], capture_output=True, text=True)

    def inspect(self):
        return self.renderer.inspect_resume(self.input, self.output, self.progress, self.prepared)

    def test_prepare_resume_preserves_progress_and_unfinished_chunks(self):
        incomplete = self.output / (self.current + ".tmp")
        incomplete.write_bytes(b"unfinished chunk")
        before = {p: p.read_bytes() for p in [self.input, self.progress, *self.output.iterdir()]}
        result = self.cli("--prepare-only")
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual(json.loads(result.stdout)["completedStops"], 1)
        self.assertEqual(json.loads(result.stdout)["quarantineFiles"], 1)
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        self.assertFalse((self.directory / "resume-history").exists())

    def test_complete_current_sidecar_recovers_without_gpu_or_rewriting_clips(self):
        self.write_clip(self.prepared["stops"][1])
        before = {p: p.read_bytes() for p in self.output.iterdir()}
        original_progress = self.progress.read_bytes()
        result = self.cli()
        self.assertEqual(result.returncode, 0, result.stderr)
        checkpoint = json.loads(self.progress.read_text())
        self.assertEqual((checkpoint["phase"], checkpoint["completedStops"]), ("rendered", 2))
        self.assertEqual(before, {p: p.read_bytes() for p in before})
        archived = list((self.directory / "resume-history").glob("*/progress.json"))
        self.assertEqual(archived[0].read_bytes(), original_progress)
        self.assertEqual(len(self.inspect()["results"]), 2)

    def test_corrupt_completed_evidence_fails_without_changing_progress(self):
        sidecar = self.output / (STOP + ".provenance.json")
        original, checkpoint = sidecar.read_bytes(), self.progress.read_bytes()
        for field, value in [("spokenText", "Otro guion."), ("modelRevision", "0" * 40),
                             ("identity", {}), ("segments", []), ("fileSha256", "0" * 64)]:
            with self.subTest(field=field):
                record = json.loads(original)
                record[field] = value
                sidecar.write_text(json.dumps(record))
                result = self.cli("--prepare-only")
                self.assertNotEqual(result.returncode, 0)
                self.assertIn("Completed chapter requires inspection", result.stderr)
                self.assertEqual(self.progress.read_bytes(), checkpoint)
                self.assertTrue(sidecar.exists())
        sidecar.write_bytes(original)

    def test_incomplete_current_sidecar_is_quarantined_with_its_audio(self):
        self.write_clip(self.prepared["stops"][1])
        sidecar = self.output / (self.current + ".provenance.json")
        record = json.loads(sidecar.read_text())
        record["segments"] = []
        sidecar.write_text(json.dumps(record))
        preserved = {p.name: p.read_bytes() for p in self.output.glob(self.current + ".*")}
        first = (self.output / (STOP + ".mp3")).read_bytes()
        inspected = self.inspect()
        self.assertEqual(len(inspected["results"]), 1)
        self.assertEqual(len(inspected["quarantine"]), 2)
        self.renderer.preserve_resume_history(self.progress, inspected)
        quarantined = list((self.directory / "resume-history").glob("*/unfinished/*"))
        self.assertEqual({p.name: p.read_bytes() for p in quarantined}, preserved)
        self.assertEqual((self.output / (STOP + ".mp3")).read_bytes(), first)

    def test_silent_completed_audio_is_rejected_even_with_matching_hashes(self):
        import numpy as np
        import soundfile as sf
        target = self.output / (STOP + ".mp3")
        sf.write(target, np.zeros(96000), 48000, format="MP3")
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        sidecar = target.with_suffix(".provenance.json")
        record = json.loads(sidecar.read_text())
        record["fileSha256"] = digest
        sidecar.write_text(json.dumps(record))
        checkpoint = json.loads(self.progress.read_text())
        checkpoint["results"][0]["sha256"] = digest
        self.progress.write_text(json.dumps(checkpoint))
        before = self.progress.read_bytes()
        result = self.cli("--prepare-only")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("audio is invalid, silent", result.stderr)
        self.assertEqual(self.progress.read_bytes(), before)

    def test_changed_input_hash_fails_before_any_checkpoint_write(self):
        checkpoint = self.progress.read_bytes()
        self.input.write_text(self.input.read_text() + "\n")
        result = self.cli("--prepare-only")
        self.assertNotEqual(result.returncode, 0)
        self.assertIn("input hash changed", result.stderr)
        self.assertEqual(self.progress.read_bytes(), checkpoint)


if __name__ == "__main__":
    unittest.main()
