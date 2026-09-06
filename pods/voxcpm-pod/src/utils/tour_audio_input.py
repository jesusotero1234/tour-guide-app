"""CPU-only preparation of saved tour narrations for voice A."""
import json
import os
from pathlib import Path
import re
from uuid import UUID

from utils.sanitize import chunk_text, sanitize_text


def write_progress(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def prepare_input(input_path: Path, preset_path: Path) -> dict:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("language") not in ("es", "fr"):
        raise ValueError("Audio language must be es or fr")
    stops = data.get("stops")
    if not isinstance(stops, list) or not 1 <= len(stops) <= 40:
        raise ValueError("Expected 1 to 40 saved stops")
    preset = json.loads(preset_path.read_text(encoding="utf-8"))
    if not isinstance(preset, dict):
        raise ValueError("Invalid voice preset")
    for key, maximum in (("seed", 2**32 - 1), ("paragraphPauseMs", 5000), ("sentencePauseMs", 5000)):
        if type(preset.get(key)) is not int or not 0 <= preset[key] <= maximum:
            raise ValueError(f"Invalid preset {key}")
    if not isinstance(preset.get("referenceText"), str) or not preset["referenceText"].strip():
        raise ValueError("Missing voice reference transcript")
    if not isinstance(preset.get("reference"), str):
        raise ValueError("Missing voice reference")
    reference = (preset_path.parent / preset["reference"]).resolve()
    if not reference.is_file():
        raise ValueError("Voice A reference audio is unavailable")
    replacements = preset.get("textReplacements", {})
    if not isinstance(replacements, dict) or any(
        not isinstance(k, str) or not k or not isinstance(v, str) for k, v in replacements.items()
    ):
        raise ValueError("Invalid pronunciation replacements")
    prepared, seen = [], set()
    for stop in stops:
        if not isinstance(stop, dict) or not isinstance(stop.get("id"), str):
            raise ValueError("Invalid stop")
        stop_id = str(UUID(stop["id"]))
        if stop_id != stop["id"] or stop_id in seen:
            raise ValueError("Stop IDs must be unique canonical UUIDs")
        seen.add(stop_id)
        text = stop.get("text")
        if not isinstance(text, str) or not text.strip() or len(text) > 50000:
            raise ValueError("Each stop must have a nonempty narration of at most 50000 characters")
        spoken = text.replace("\r\n", "\n").replace("\r", "\n")
        if data["language"] == "es":
            for phrase, replacement in replacements.items():
                spoken = re.sub(r"(?<!\w)" + re.escape(phrase) + r"(?!\w)", lambda _: replacement, spoken)
        if preset.get("singleNewlineParagraphs"):
            spoken = re.sub(r"\n+", "\n\n", spoken)
        spoken = sanitize_text(spoken)
        chunks = chunk_text(spoken, max_chars=360)
        if not chunks:
            raise ValueError("Narration contains no speakable text")
        prepared.append({"id": stop_id, "text": text, "spoken": spoken, "chunks": chunks})
    return {"language": data["language"], "preset": preset, "reference": str(reference), "stops": prepared}
