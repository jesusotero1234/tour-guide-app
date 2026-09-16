#!/usr/bin/env python3
"""Record completed historical VoxCPM examples; never infer missing generation facts."""
import argparse
from collections import Counter
import copy
import json
from pathlib import Path
import sys

POD = Path(__file__).resolve().parents[1]
REPO = POD.parents[1]
sys.path.insert(0, str(POD / "src"))
from utils.audio_provenance import input_audio, model_revision, find_record, sha256_file, verify_record, write_audio_record, utc_now

AUDIO = {".wav", ".mp3", ".ogg", ".flac"}
OWNER = {
    "statement": "Las he creado con ejemplo del mismo VOXCPM2; ahora estamos creando ejemplos.",
    "source": "Declaración del responsable en esta conversación, conservada en guide-es-a.provenance.json",
    "recordedOn": "2026-09-08",
    "scope": "Declaración sobre los ejemplos sintéticos; no prueba independiente del método, la fecha ni los derechos.",
}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("paths", type=Path, nargs="+", help="Completed audio directories only")
    parser.add_argument("--verify-only", action="store_true")
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    files = sorted({p.resolve() for directory in args.paths for p in directory.rglob("*")
                    if p.is_file() and p.suffix.lower() in AUDIO})
    before = {p: sha256_file(p) for p in files}
    if args.verify_only:
        records = [verify_record(find_record(p)) for p in files]
    else:
        by_hash = {}
        for p, digest in before.items():
            by_hash.setdefault(digest, []).append(p)
        plans = {p: {"recordKind": "historical_observation", "ownerStatement": OWNER,
                     "limitations": ["Original generation date is not established by filesystem timestamps.",
                                     "Only saved evidence is transcribed; absent fields remain unknown.",
                                     "Provenance is not legal certification or a release approval."]}
                 for p in files}
        parents = {}
        evidence_files = sorted({p.resolve() for directory in args.paths for p in directory.rglob("*.json")
                                 if not p.name.endswith(".provenance.json")})

        def evidence(p):
            return {"file": str(p), "sha256": sha256_file(p)}

        def resolve(name, base, digest=None):
            if name:
                candidate = Path(name)
                candidates = [candidate] if candidate.is_absolute() else [base / candidate, REPO / candidate]
                for candidate in candidates:
                    candidate = candidate.resolve()
                    if candidate.is_file() and (digest is None or sha256_file(candidate) == digest):
                        return candidate
            return (by_hash.get(digest) or [None])[0]

        def apply(target, metadata, source, input_path=None, role="reference_wav_path"):
            if target not in plans:
                return
            plans[target].update(copy.deepcopy(metadata))
            plans[target].setdefault("evidence", []).append(evidence(source))
            if input_path:
                parents[target] = (input_path, role)

        # References first: explicit output hashes and text-only flags are required.
        for source in evidence_files:
            data = json.loads(source.read_text())
            if not isinstance(data, dict):
                continue
            if data.get("generatedWithoutReference") is True:
                digest = data.get("sha256")
            elif data.get("referenceGeneratedWithoutAudioReference") is True:
                digest = data.get("referenceSha256")
            else:
                continue
            metadata = {"kind": "voice_reference", "inputMode": "text_only",
                        "text": data.get("text"), "voiceDescription": data.get("description"),
                        "parameters": {"seed": data["seed"]} if "seed" in data else None,
                        "expectedTranscript": data.get("expectedTranscript"),
                        "source": {"origin": "synthetic_example_documented_by_saved_result",
                                   "sourceUrl": None, "license": None, "permission": None}}
            request = source.parent / "request.json"
            if data.get("referenceGeneratedWithoutAudioReference") and request.is_file():
                metadata["text"] = json.loads(request.read_text()).get("referenceText")
            for target in by_hash.get(digest, []):
                apply(target, metadata, source)

        # A legacy preset's model licence and current revision do not prove its input rights or generation.
        legacy = POD / "presets/guide-es-a.provenance.json"
        if legacy.is_file():
            data = json.loads(legacy.read_text())
            for target in by_hash.get(data.get("referenceSha256"), []):
                apply(target, {"kind": "voice_reference", "inputMode": "unknown",
                               "ownerStatement": data.get("ownerStatement", OWNER),
                               "legacyObservation": data}, legacy)

        for source in evidence_files:
            data = json.loads(source.read_text())
            if source.name == "reference-provenance.json" and isinstance(data, dict) and data.get("sourceSha256"):
                original = resolve(data.get("source"), source.parent, data["sourceSha256"])
                if original:
                    for target in by_hash.get(data.get("referenceSha256"), []):
                        apply(target, {"kind": "reference_excerpt", "inputMode": "audio_transform",
                                       "ownerStatement": None,
                                       "source": {"origin": "user_supplied_recording", "sourceUrl": None,
                                                  "license": None, "permission": {
                                                      "statement": "usa esta voz de frances como ejemplo para probar nada mas y genera una parada de frances a ver como suena",
                                                      "source": "User request in this conversation",
                                                      "scope": "Local experiment only; no assertion of speaker consent or commercial rights"}},
                                       "postProcessing": {k: data[k] for k in ("excerptStartSeconds", "excerptEndSeconds") if k in data}},
                              source, original, "source_audio")
            if not isinstance(data, dict):
                continue
            if source.name == "metrics.json":
                ref = resolve(data.get("reference"), source.parent, data.get("referenceSha256"))
                if not ref or not data.get("cases"):
                    continue
                preset = data.get("presetSettings") or {}
                revision = model_revision(data.get("model") or "")
                parameters = {k: data[k] for k in ("cfg", "inferenceSteps", "retryBadcase") if k in data}
                if "seed" in preset:
                    parameters["seed"] = preset["seed"]
                common = {"kind": "narration", "inputMode": "reference_audio",
                          "modelId": "openbmb/VoxCPM2" if revision and data.get("architecture") == "voxcpm2" else None,
                          "modelRevision": revision, "parameters": parameters,
                          "referenceText": data.get("referenceText"),
                          "postProcessing": {k: data[k] for k in ("sentencePauseMs", "paragraphPauseMs", "sampleRate") if data.get(k) is not None},
                          "evidenceBinding": "Path recorded by completed metrics; output hash first established during this observation."}
                for case in data["cases"]:
                    for key in ("path", "mp3"):
                        target = resolve(case.get(key), source.parent)
                        apply(target, {**common, "text": data.get("spokenText")}, source, ref)
                    for index, chunk in enumerate(case.get("chunks", [])):
                        chunks = data.get("chunks") or []
                        text = chunks[index].get("text") if index < len(chunks) else None
                        apply(resolve(chunk.get("path"), source.parent),
                              {**common, "kind": "narration_chunk", "text": text}, source, ref)
            elif source.name.endswith("-result.json") and data.get("cloneMode") == "controllable_reference_only":
                ref = resolve(data.get("reference"), source.parent, data.get("referenceSha256"))
                for suffix in (".wav", ".mp3"):
                    target = source.with_name(source.name.removesuffix("-result.json") + suffix)
                    if ref:
                        apply(target, {"kind": "narration", "inputMode": "reference_audio",
                                       "text": data.get("style", "") + data["text"], "voiceDescription": data.get("style"),
                                       "parameters": {"seed": data["seed"]},
                                       "evidenceBinding": "Named result; no original output hash was saved."}, source, ref)
            elif data.get("referenceGeneratedWithoutAudioReference") is True:
                ref = resolve(None, source.parent, data.get("referenceSha256"))
                request = source.parent / "request.json"
                request_data = json.loads(request.read_text()) if request.is_file() else {}
                # This seed belongs to voice creation, not to the later narration.
                target = resolve(None, source.parent, data.get("previewSha256"))
                if ref and target:
                    apply(target, {"kind": "narration", "inputMode": "reference_audio",
                                   "text": request_data.get("previewText")}, source, ref)
                    wav = target.with_suffix(".wav")
                    if wav in plans:
                        apply(wav, {"kind": "narration", "inputMode": "reference_audio",
                                    "text": request_data.get("previewText"),
                                    "evidenceBinding": "Sibling WAV named with the result identifier; original hash not saved."}, source, ref)

        # Older app jobs retained requests/results but no effective synthesis configuration.
        for source in evidence_files:
            if source.name != "progress.json":
                continue
            progress = json.loads(source.read_text())
            handoff_path = source.parent / "gpu-handoff.json"
            request_path = source.parent / "input.json"
            if progress.get("phase") != "rendered" or not handoff_path.is_file() or not request_path.is_file():
                continue
            handoff = json.loads(handoff_path.read_text())
            if not isinstance(handoff, list):
                continue
            commands = [item.get("command", []) for item in handoff if item.get("stage") == "tts_started"]
            if len(commands) != 1 or "--output" not in commands[0]:
                continue
            output = Path(commands[0][commands[0].index("--output") + 1]).resolve()
            request = json.loads(request_path.read_text())
            texts = {stop["id"]: stop["text"] for stop in request.get("stops", [])}
            for result in progress.get("results", []):
                target = output / result["filename"]
                if target not in plans:
                    continue
                if result.get("fileSha256") and before[target] != result["fileSha256"]:
                    raise ValueError(f"Historical job output hash mismatch: {target}")
                apply(target, {"kind": "narration", "sourceText": texts.get(result["id"]),
                               "language": request.get("language"),
                               "evidenceBinding": "Completed job output and original text request; effective transformed text and synthesis configuration were not saved."}, source)
                plans[target]["evidence"].extend([evidence(request_path), evidence(handoff_path)])

        # Preview cuts are derived audio, not independent voice creation.
        for source in evidence_files:
            if source.name != "preview-cuts.json":
                continue
            for cut in json.loads(source.read_text()):
                parent = resolve(cut.get("source"), source.parent)
                target = source.parent / (cut["id"] + "-preview.mp3")
                if parent:
                    apply(target, {"kind": "preview", "inputMode": "audio_transform",
                                   "postProcessing": {"excerptEndSeconds": cut.get("previewSeconds")}},
                          source, parent, "source_audio")

        # Record remaining cache/preset voices as observations, without reverse-engineering history.
        for target in files:
            if "voice_references" in target.parts or target.parent == POD / "presets":
                plans[target].setdefault("kind", "voice_reference")
            manifest = target.parent / "manifest.json"
            if manifest.is_file():
                entry = json.loads(manifest.read_text()).get(target.stem)
                if entry:
                    plans[target]["legacyManifestObservation"] = entry
                    plans[target].setdefault("evidence", []).append(evidence(manifest))

        done = set()
        def save(target, active=()):
            if target in done:
                return
            if target in active:
                raise ValueError("Circular historical evidence")
            existing = find_record(target)
            if existing.is_file():
                verify_record(existing)
                done.add(target)
                return
            metadata = copy.deepcopy(plans[target])
            if target in parents:
                parent, role = parents[target]
                if parent in plans:
                    save(parent, active + (target,))
                metadata["inputs"] = [input_audio(parent, role=role)]
                if role == "source_audio" and metadata.get("source"):
                    metadata["inputs"][0].update(metadata["source"])
            write_audio_record(target, metadata)
            done.add(target)
        for target in files:
            save(target)
        records = [verify_record(find_record(p)) for p in files]

    assert all(sha256_file(p) == digest for p, digest in before.items()), "Audio changed during recording"
    report = {"checkedAt": utc_now(), "audioCount": len(files), "unchangedAudioCount": len(files),
              "inputModes": dict(Counter(r["inputMode"] for r in records)),
              "unknownGenerationDates": sum(r["generatedAt"] is None for r in records),
              "unknownModelRevisions": sum(r["modelRevision"] is None for r in records),
              "records": [str(find_record(p)) for p in files]}
    if args.report:
        with args.report.open("x") as stream:
            json.dump(report, stream, ensure_ascii=False, indent=2)
            stream.write("\n")
    print(json.dumps({k: v for k, v in report.items() if k != "records"}, ensure_ascii=False))


if __name__ == "__main__":
    main()
