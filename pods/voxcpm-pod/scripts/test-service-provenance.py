#!/usr/bin/env python3
"""Exercise real service persistence/fallback with a fake model, entirely on CPU."""
import json
from pathlib import Path
import sys
import tempfile
from types import SimpleNamespace

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
import numpy as np
from config import env
from services.voxcpm import VoxCpmService
from utils.audio_provenance import verify_record, record_path


class Model:
    tts_model = SimpleNamespace(sample_rate=24000)
    fail_reference = False

    def _generate(self, text, reference_wav_path=None, cfg_value=2.0, inference_timesteps=10, max_len=4096):
        pass

    def generate(self, **kwargs):
        if self.fail_reference and kwargs.get("reference_wav_path"):
            raise RuntimeError("fixture: reference generation failed")
        return np.sin(np.arange(2400) * .03).astype(np.float32) * .1


with tempfile.TemporaryDirectory() as directory:
    old_cache = env.AUDIO_CACHE
    env.AUDIO_CACHE = Path(directory)
    try:
        service = VoxCpmService()
        service._model = Model()
        service._model_path = "/models/snapshots/" + "a" * 40
        first = service.generate_speech("Bonjour et bienvenue.", language="fr")
        assert first["success"] and first["generationMode"] == "reference"
        narration = verify_record(first["provenance"])
        assert narration["inputMode"] == "reference_audio" and narration["generatedAt"]
        assert narration["parameters"]["max_len"] == 4096
        link = narration["inputs"][0]["generationRecord"]
        reference = verify_record(Path(first["provenance"]).parent / link["file"])
        assert reference["kind"] == "voice_reference" and reference["inputMode"] == "text_only"
        assert reference["text"].endswith("Bienvenue. Je serai votre guide local pour cette visite, avec une voix claire, calme et régulière.")
        assert reference["id"] == link["id"] and reference["generatedAt"]
        assert reference["parameters"]["seed"] is None
        assert narration["parameters"]["seedPolicy"] == "not_reset_for_call"

        service._model.fail_reference = True
        service._output_path = lambda _: Path(directory) / "fallback.wav"
        fallback = service.generate_speech("Une autre promenade.", language="fr")
        fallback_record = verify_record(fallback["provenance"])
        assert fallback["generationMode"] == "voice-design" and fallback["referenceId"] is None
        assert fallback_record["inputMode"] == "text_only" and fallback_record["inputs"] == []
        original = (Path(directory) / "fallback.wav").read_bytes()
        try:
            service.generate_speech("Never overwrite.", language="fr")
            raise AssertionError("Expected exclusive output creation")
        except FileExistsError:
            pass
        assert (Path(directory) / "fallback.wav").read_bytes() == original
        print("Service reference creation, narration link, fallback, and no-overwrite: OK")
    finally:
        env.AUDIO_CACHE = old_cache
