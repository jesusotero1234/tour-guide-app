"""CPU-only preparation of saved tour narrations for voice A."""
import json
import hashlib
import os
from pathlib import Path
import re
from uuid import UUID

from utils.sanitize import chunk_text, sanitize_text


_SMALL_NUMBERS = ["zéro", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf",
                  "dix", "onze", "douze", "treize", "quatorze", "quinze", "seize"]
_TENS = ["", "", "vingt", "trente", "quarante", "cinquante", "soixante"]


def _french_number_to_words(n: int) -> str:
    if not 0 <= n <= 9999:
        raise ValueError("Expected a number between 0 and 9999")
    if n >= 1000:
        thousands, remainder = divmod(n, 1000)
        prefix = "mille" if thousands == 1 else _SMALL_NUMBERS[thousands] + " mille"
        return prefix + (" " + _french_number_to_words(remainder) if remainder else "")
    if n >= 100:
        hundreds, remainder = divmod(n, 100)
        prefix = "cent" if hundreds == 1 else _SMALL_NUMBERS[hundreds] + " cent"
        if not remainder:
            return prefix + ("s" if hundreds > 1 else "")
        return prefix + " " + _french_number_to_words(remainder)
    if n >= 80:
        return "quatre-vingts" if n == 80 else "quatre-vingt-" + _french_number_to_words(n - 80)
    if n >= 70:
        return "soixante" + (" et " if n == 71 else "-") + _french_number_to_words(n - 60)
    if n >= 20:
        tens, unit = divmod(n, 10)
        base = _TENS[tens]
        if not unit:
            return base
        return base + (" et " if unit == 1 else "-") + _SMALL_NUMBERS[unit]
    if n >= 17:
        return "dix-" + _SMALL_NUMBERS[n - 10]
    return _SMALL_NUMBERS[n]


def _expand_french_years(text: str) -> str:
    def replace(match: re.Match) -> str:
        return _french_number_to_words(int(match.group(0)))
    # Preserve decimals, grouped numbers and IDs; sentence punctuation is fine.
    return re.sub(r"(?<!\w)(?<!\d[.,\s])[1-9]\d{2,3}(?!\w|[.,\s]\d)", replace, text)


def write_progress(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(path.name + ".tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def generation_arguments(text: str, preset: dict, reference: str) -> dict:
    if preset.get("generationMode", "continuation") == "controllable-cloning":
        return {"text": "(" + preset["stylePrompt"] + ")" + text,
                "reference_wav_path": reference}
    return {"text": text, "reference_wav_path": reference,
            "prompt_wav_path": reference, "prompt_text": preset["referenceText"]}


def prepare_input(input_path: Path, preset_path: Path) -> dict:
    data = json.loads(input_path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or data.get("language") not in ("es", "fr", "en", "de", "it"):
        raise ValueError("Audio language must be es, fr, en, de or it")
    stops = data.get("stops")
    if not isinstance(stops, list) or not 1 <= len(stops) <= 40:
        raise ValueError("Expected 1 to 40 saved stops")
    preset = json.loads(preset_path.read_text(encoding="utf-8"))
    if not isinstance(preset, dict):
        raise ValueError("Invalid voice preset")
    mode = preset.get("generationMode", "continuation")
    if mode not in ("continuation", "controllable-cloning"):
        raise ValueError("Invalid generation mode")
    style = preset.get("stylePrompt")
    if mode == "controllable-cloning":
        if not isinstance(style, str) or not style.strip() or len(style) > 1000 or any(c in style for c in "()\r\n"):
            raise ValueError("Invalid narration style prompt")
    elif style is not None:
        raise ValueError("Style prompts require controllable cloning")
    compression = preset.get("mp3CompressionLevel", 0.8)
    if isinstance(compression, bool) or not isinstance(compression, (int, float)) or not 0 <= compression <= 1:
        raise ValueError("Invalid MP3 compression level")
    speed = preset.get("speed", 1.0)
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not 0.5 <= speed <= 2.0:
        raise ValueError("Invalid preset speed")
    if preset.get("language", data["language"]) != data["language"]:
        raise ValueError("Voice preset language does not match tour")
    for key, maximum in (("seed", 2**32 - 1), ("paragraphPauseMs", 5000), ("sentencePauseMs", 5000)):
        if type(preset.get(key)) is not int or not 0 <= preset[key] <= maximum:
            raise ValueError(f"Invalid preset {key}")
    if mode == "continuation" and (not isinstance(preset.get("referenceText"), str) or not preset["referenceText"].strip()):
        raise ValueError("Missing voice reference transcript")
    if not isinstance(preset.get("reference"), str):
        raise ValueError("Missing voice reference")
    reference = (preset_path.parent / preset["reference"]).resolve()
    if not reference.is_file():
        raise ValueError("Voice A reference audio is unavailable")
    identity = data.get("identity")
    if identity is not None:
        if not isinstance(identity, dict) or identity.get("modelId") != "openbmb/VoxCPM2":
            raise ValueError("Invalid audio model identity")
        if not re.fullmatch(r"[0-9a-f]{40}", str(identity.get("modelRevision", ""))):
            raise ValueError("Missing exact model revision")
        if preset.get("modelRevision", identity["modelRevision"]) != identity["modelRevision"]:
            raise ValueError("Voice model changed before rendering")
        if identity.get("presetSha256") != hashlib.sha256(preset_path.read_bytes()).hexdigest() or identity.get("referenceSha256") != hashlib.sha256(reference.read_bytes()).hexdigest():
            raise ValueError("Voice reference or preset changed before rendering")
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
        if data["language"] == "fr":
            spoken = _expand_french_years(spoken)
        chunks = chunk_text(spoken, max_chars=360)
        if not chunks:
            raise ValueError("Narration contains no speakable text")
        prepared.append({"id": stop_id, "text": text, "spoken": spoken, "chunks": chunks})
    return {"language": data["language"], "preset": preset, "reference": str(reference), "stops": prepared, "identity": identity}
