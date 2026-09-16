"""CPU-only generation records shared by the service and voice experiments."""
from datetime import datetime, timezone
import hashlib
import inspect
import json
import os
from pathlib import Path
import re
from uuid import uuid4

from utils.tour_audio_input import write_progress


def utc_now():
    return datetime.now(timezone.utc).isoformat()


def sha256_file(path):
    path = Path(path)
    before = path.stat()
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    after = path.stat()
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise ValueError(f"File changed while recording provenance: {path}")
    return digest.hexdigest()


def record_path(audio):
    return Path(str(audio) + ".provenance.json")


def find_record(audio):
    """Accept current records and the tour renderer\'s established sidecar name."""
    current = record_path(audio)
    legacy = Path(audio).with_suffix(".provenance.json")
    if not current.is_file() and legacy.is_file():
        if {"id", "file", "fileSha256"}.issubset(json.loads(legacy.read_text())):
            return legacy
    return current


def input_audio(path, role="reference", **source):
    path = Path(path).resolve()
    digest = sha256_file(path)
    item = {"role": role, "file": str(path), "sha256": digest,
            "origin": "unknown", "sourceUrl": None, "license": None,
            "permission": None, "generationRecord": None}
    item.update({key: value for key, value in source.items()
                 if key in ("origin", "sourceUrl", "license", "permission")})
    candidate = find_record(path)
    if candidate.is_file():
        record = verify_record(candidate)
        if record["fileSha256"] != digest:
            raise ValueError("Reference generation record belongs to another audio")
        item["generationRecord"] = {"file": str(candidate), "id": record["id"],
                                    "sha256": sha256_file(candidate)}
        documented = record.get("source") or {}
        for key in ("origin", "sourceUrl", "license", "permission"):
            if key in documented and key not in source:
                item[key] = documented[key]
        if record.get("kind") == "voice_reference" and record.get("inputMode") == "text_only":
            item["origin"] = "documented_synthetic_reference"
    else:
        legacy = path.with_suffix(".provenance.json")
        if legacy.is_file():
            record = json.loads(legacy.read_text())
            if record.get("referenceSha256", record.get("fileSha256")) != digest:
                raise ValueError("Legacy reference record hash mismatch")
            item["sourceRecord"] = {"file": str(legacy), "sha256": sha256_file(legacy)}
    return item


def verify_record(path, seen=None):
    path = Path(path).resolve()
    seen = set() if seen is None else seen
    if path in seen:
        raise ValueError("Circular provenance link")
    record = json.loads(path.read_text())
    output = (path.parent / record["file"]).resolve()
    if sha256_file(output) != record["fileSha256"]:
        raise ValueError(f"Output hash mismatch: {output}")
    for item in record.get("inputs", []):
        audio = (path.parent / item["file"]).resolve()
        if sha256_file(audio) != item["sha256"]:
            raise ValueError(f"Input hash mismatch: {audio}")
        link = item.get("generationRecord")
        if link:
            parent = (path.parent / link["file"]).resolve()
            if sha256_file(parent) != link["sha256"]:
                raise ValueError("Linked generation record hash mismatch")
            generation = verify_record(parent, seen | {path})
            if generation["id"] != link["id"] or generation["fileSha256"] != item["sha256"]:
                raise ValueError("Generation record is not linked to this input")
        legacy = item.get("sourceRecord")
        if legacy and sha256_file(path.parent / legacy["file"]) != legacy["sha256"]:
            raise ValueError("Legacy source record hash mismatch")
    return record


def write_audio_record(audio, metadata, destination=None):
    audio = Path(audio).resolve()
    destination = Path(destination).resolve() if destination else record_path(audio)
    if destination.exists():
        existing = verify_record(destination)
        if (destination.parent / existing["file"]).resolve() != audio:
            raise ValueError("Existing record belongs to another output")
        return destination
    record = {"version": 2, "kind": "unknown", "recordKind": "historical_observation",
              "generatedAt": None, "generationStartedAt": None, "inputMode": "unknown",
              "text": None, "voiceDescription": None, "modelId": None,
              "modelRevision": None, "parameters": None, "inputs": []}
    record.update(metadata)
    record.update(id=str(uuid4()), recordedAt=utc_now(),
                  file=os.path.relpath(audio, destination.parent), fileSha256=sha256_file(audio))
    # Copy metadata before making links relative; callers may reuse it for WAV and MP3.
    record = json.loads(json.dumps(record))
    for generation in [record] + record.get("segments", []):
        for item in generation.get("inputs", []):
            item["file"] = os.path.relpath(Path(item["file"]).resolve(), destination.parent)
            for key in ("generationRecord", "sourceRecord"):
                if item.get(key):
                    item[key]["file"] = os.path.relpath(Path(item[key]["file"]).resolve(), destination.parent)
    if record["inputMode"] not in ("unknown", "text_only", "reference_audio", "audio_transform", "mixed"):
        raise ValueError("Invalid input mode")
    if record["inputMode"] == "text_only" and record["inputs"]:
        raise ValueError("Text-only generation cannot contain input audio")
    if record["inputMode"] in ("reference_audio", "audio_transform") and not record["inputs"]:
        raise ValueError("Input audio is required for this mode")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Reuse the existing atomic JSON helper, then install without replacing a record.
    temporary = destination.with_name(destination.name + "." + uuid4().hex)
    try:
        write_progress(temporary, record)
        verify_record(temporary)
        os.link(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return destination


def model_revision(model_path):
    parts = Path(model_path).parts
    for index, part in enumerate(parts[:-1]):
        if part == "snapshots" and re.fullmatch(r"[0-9a-f]{40}", parts[index + 1]):
            return parts[index + 1]
    return None


def capture_generation(model, *, model_id, revision, description=None, seed=None, **kwargs):
    """Record the actual call, including whether either audio input was supplied."""
    if not re.fullmatch(r"[0-9a-f]{40}", str(revision or "")):
        raise ValueError("An exact model revision is required before generation")
    parameters = {}
    for key, parameter in inspect.signature(model._generate).parameters.items():
        if parameter.default is not inspect.Parameter.empty:
            parameters[key] = parameter.default
    parameters.update(kwargs)
    for key in ("text", "prompt_text", "prompt_wav_path", "reference_wav_path"):
        parameters.pop(key, None)
    parameters["seed"] = seed
    parameters["seedPolicy"] = "explicitly_set_by_caller" if seed is not None else "not_reset_for_call"
    inputs = [input_audio(value, role=key) for key, value in kwargs.items()
              if key in ("reference_wav_path", "prompt_wav_path") and value is not None]
    started = utc_now()
    audio = model.generate(**kwargs)
    event = {"recordKind": "generation", "generatedByAI": True,
             "generationStartedAt": started, "generatedAt": utc_now(),
             "inputMode": "reference_audio" if inputs else "text_only",
             "text": kwargs["text"], "voiceDescription": description,
             "modelId": model_id, "modelRevision": revision,
             "parameters": parameters, "inputs": inputs}
    if kwargs.get("prompt_text") is not None:
        event["referenceText"] = kwargs["prompt_text"]
    return audio, event


def combine_generations(events):
    if not events:
        raise ValueError("A generated output needs at least one generation event")
    combined = dict(events[0])
    combined.update(generatedAt=events[-1]["generatedAt"],
                    text="\n\n".join(event["text"] for event in events), segments=events)
    inputs = {}
    for event in events:
        for item in event["inputs"]:
            inputs[(item["role"], item["file"], item["sha256"])] = item
    combined["inputs"] = list(inputs.values())
    if len({event["inputMode"] for event in events}) > 1:
        combined["inputMode"] = "mixed"
    if any(event["parameters"] != events[0]["parameters"] for event in events):
        combined["parameters"] = {"perSegment": [event["parameters"] for event in events]}
    return combined
