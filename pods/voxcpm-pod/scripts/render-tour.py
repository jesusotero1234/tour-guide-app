#!/usr/bin/env python3
"""Render saved tour stops under scripts/with-tts-gpu.py, using voice A."""
import argparse
import json
import hashlib
import os
from pathlib import Path
import shutil
import sys
from uuid import uuid4

POD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POD / "src"))
from utils.tour_audio_input import generation_arguments, prepare_input, write_progress
from utils.audio_provenance import capture_generation, combine_generations, find_record, verify_record, write_audio_record


def inspect_resume(input_path, output, progress_path, prepared):
    """Validate saved chapters without modifying inputs, progress, or audio."""
    import numpy as np
    import soundfile as sf
    from utils.narration_audio import NARRATION_POST_PROCESSING

    identity, preset = prepared["identity"], prepared["preset"]
    if not identity:
        raise ValueError("Resuming requires a pinned audio identity")
    digest = hashlib.sha256(input_path.read_bytes()).hexdigest()
    old = json.loads(progress_path.read_text()) if progress_path.exists() else {}
    if old.get("inputSha256", digest) != digest:
        raise ValueError("Saved audio input hash changed before resume")
    saved = old.get("results", [])
    stops = prepared["stops"]
    if (not isinstance(saved, list) or old.get("completedStops", len(saved)) != len(saved)
            or [item.get("id") for item in saved] != [stop["id"] for stop in stops[:len(saved)]]):
        raise ValueError("Completed audio progress is not an ordered chapter prefix")
    completed = {item["id"]: item for item in saved}
    results, quarantine = [], []
    norm = lambda text: " ".join(text.split())
    sample_rate = None
    for stop in stops:
        target = output / (stop["id"] + ".mp3")
        artifacts = sorted(output.glob(stop["id"] + ".*"))
        historical = completed.get(stop["id"])
        current = stop["id"] == old.get("currentStopId") and historical is None
        if not artifacts and historical is None:
            continue
        if historical is None and not current:
            raise ValueError("Unexpected saved audio outside the interrupted chapter: " + stop["id"])
        try:
            sidecar = find_record(target)
            record = verify_record(sidecar)
            if (sidecar.parent / record["file"]).resolve() != target.resolve():
                raise ValueError("Provenance points to another chapter")
            if (record.get("identity") != identity or record.get("stopId") != stop["id"]
                    or record.get("modelId") != identity["modelId"]
                    or record.get("modelRevision") != identity["modelRevision"]
                    or record.get("kind") != "narration" or record.get("recordKind") != "generation"):
                raise ValueError("Chapter identity, model or provenance changed")
            arguments = [generation_arguments(chunk.text, preset, prepared["reference"]) for chunk in stop["chunks"]]
            segments = record.get("segments", [])
            if (norm(record.get("spokenText", "")) != norm(stop["spoken"])
                    or norm(record.get("text", "")) != norm(" ".join(arg["text"] for arg in arguments))
                    or len(segments) != len(arguments)):
                raise ValueError("Chapter spoken text or complete chunk evidence changed")
            roles = {key for key in arguments[0] if key in ("reference_wav_path", "prompt_wav_path")}
            references = record.get("inputs", [])
            if len(references) != len(roles) or {item["role"] for item in references} != roles:
                raise ValueError("Chapter voice reference arguments changed")
            for item in references:
                if ((sidecar.parent / item["file"]).resolve() != Path(prepared["reference"]).resolve()
                        or item["sha256"] != identity["referenceSha256"]):
                    raise ValueError("Chapter voice reference changed")
            expected_parameters = {"seed": preset["seed"], "cfg_value": 2.0,
                                   "inference_timesteps": 10, "max_len": 4096, "retry_badcase": False}
            for segment, argument in zip(segments, arguments):
                if (segment.get("recordKind") != "generation" or not segment.get("generatedAt")
                        or segment.get("modelId") != identity["modelId"]
                        or segment.get("modelRevision") != identity["modelRevision"]
                        or segment.get("inputMode") != "reference_audio"
                        or norm(segment.get("text", "")) != norm(argument["text"])
                        or segment.get("referenceText") != argument.get("prompt_text")
                        or segment.get("inputs") != references
                        or any(segment.get("parameters", {}).get(k) != v for k, v in expected_parameters.items())):
                    raise ValueError("Chapter generation or reference evidence changed")
            samples, rate = sf.read(target, dtype="float32")
            duration = len(samples) / rate
            if (sf.info(target).format != "MP3" or samples.ndim != 1 or len(samples) <= rate
                    or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 1e-4
                    or sample_rate not in (None, rate)):
                raise ValueError("Chapter audio is invalid, silent or has an inconsistent sample rate")
            expected_post = {**NARRATION_POST_PROCESSING,
                "paragraphPauseMs": preset["paragraphPauseMs"], "sentencePauseMs": preset["sentencePauseMs"],
                "speed": preset.get("speed", 1.0), "sampleRate": rate, "format": "MP3",
                "compressionLevel": preset.get("mp3CompressionLevel", 0.8), "bitrateMode": "VARIABLE",
                "crossfadeMs": int(os.getenv("VOXCPM_CHUNK_CROSSFADE_MS", "18")),
                "trimEdgeSilenceMs": int(os.getenv("VOXCPM_TRIM_EDGE_SILENCE_MS", "120")),
                "silenceThreshold": float(os.getenv("VOXCPM_SILENCE_THRESHOLD", "0.003"))}
            if record.get("postProcessing") != expected_post:
                raise ValueError("Chapter audio processing changed")
            expected_options = {"engine": "nano-vllm-voxcpm", "mode": preset.get("generationMode", "continuation"),
                "stylePrompt": preset.get("stylePrompt"), "inference_timesteps": 10,
                "temperature": 1.0, "device": "cuda"}
            if record.get("modelOptions") != expected_options:
                raise ValueError("Chapter model options changed")
            if historical and (historical.get("filename") != target.name
                    or historical.get("sha256") != record["fileSha256"]
                    or historical.get("modelRevision") != identity["modelRevision"]
                    or not np.isfinite(historical.get("durationSeconds", float("nan")))
                    or abs(historical["durationSeconds"] - duration) > 0.15):
                raise ValueError("Completed chapter hash or duration changed")
            leftovers = [p for p in artifacts if p not in (target, sidecar)]
            if leftovers:
                if stop["id"] != old.get("currentStopId"):
                    raise ValueError("Unexpected artifacts beside a completed chapter")
                quarantine.extend({"path": p, "reason": "Uncommitted temporary chapter artifact"} for p in leftovers)
            # A complete sidecar committed before the progress update is reusable too.
            results.append(historical or {"id": stop["id"], "filename": target.name,
                "durationSeconds": round(duration, 3), "sha256": record["fileSha256"],
                "modelRevision": identity["modelRevision"]})
            sample_rate = rate
        except (ValueError, OSError, KeyError, TypeError, RuntimeError) as error:
            if not current:
                raise ValueError("Completed chapter requires inspection: " + stop["id"] + ": " + str(error)) from error
            quarantine.extend({"path": p, "reason": str(error)} for p in artifacts)
    if [item["id"] for item in results] != [stop["id"] for stop in stops[:len(results)]]:
        raise ValueError("Reusable audio chapters contain a gap")
    return {"results": results, "quarantine": quarantine, "inputSha256": digest}


def preserve_resume_history(progress_path, inspected):
    """Retain the old checkpoint and any unfinished artifacts before resuming."""
    history = progress_path.parent / "resume-history" / uuid4().hex
    history.mkdir(parents=True)
    if progress_path.exists():
        shutil.copyfile(progress_path, history / "progress.json")
    entries = []
    for item in inspected["quarantine"]:
        original = item["path"]
        destination = history / "unfinished" / original.name
        destination.parent.mkdir(exist_ok=True)
        entries.append({"original": str(original.resolve()), "retained": str(destination.resolve()),
                        "sha256": hashlib.sha256(original.read_bytes()).hexdigest(), "reason": item["reason"]})
        original.rename(destination)
    write_progress(history / "resume.json", {"inputSha256": inspected["inputSha256"],
        "reusedStops": [item["id"] for item in inspected["results"]], "quarantined": entries})


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--progress", type=Path, required=True)
    parser.add_argument("--prepare-only", action="store_true")
    parser.add_argument("--resume", action="store_true", help="Verify and reuse complete saved chapters")
    args = parser.parse_args()
    progress = {"phase": "preparing", "completedStops": 0, "totalStops": 0, "results": []}
    can_write_progress = not args.resume

    def update(**fields):
        progress.update(fields)
        write_progress(args.progress, progress)

    model = None
    try:
        language = json.loads(args.input.read_text()).get("language")
        if language not in ("es", "fr", "en", "de", "it"):
            raise ValueError("Audio language must be es, fr, en, de or it")
        prepared = prepare_input(args.input, Path(os.environ.get("VOXCPM_PRESET_PATH", POD / f"presets/guide-{language}-a.json")))
        preset, reference, stops = prepared["preset"], prepared["reference"], prepared["stops"]
        if args.resume:
            inspected = inspect_resume(args.input, args.output, args.progress, prepared)
            if args.prepare_only:
                print(json.dumps({"phase": "resume_validated", "completedStops": len(inspected["results"]),
                    "totalStops": len(stops), "quarantineFiles": len(inspected["quarantine"])}), flush=True)
                return 0
            preserve_resume_history(args.progress, inspected)
            progress.update(results=inspected["results"], completedStops=len(inspected["results"]))
            can_write_progress = True
        progress["inputSha256"] = hashlib.sha256(args.input.read_bytes()).hexdigest()
        update(totalStops=len(stops), stopPlans=[
            {"id": stop["id"], "chunkCount": len(stop["chunks"]),
             "paragraphBreaks": sum(chunk.boundary == "paragraph" for chunk in stop["chunks"])}
            for stop in stops
        ])
        if args.prepare_only:
            update(phase="prepared")
            return 0
        if args.resume and progress["completedStops"] == len(stops):
            update(phase="rendered")
            return 0
        os.environ["HF_HUB_OFFLINE"] = "1"
        os.environ["TOKENIZERS_PARALLELISM"] = "false"
        os.environ["VOXCPM_PARAGRAPH_PAUSE_MS"] = str(preset["paragraphPauseMs"])
        os.environ["VOXCPM_SENTENCE_PAUSE_MS"] = str(preset["sentencePauseMs"])
        import numpy as np
        import soundfile as sf
        import torch
        from huggingface_hub import snapshot_download
        from services.nano import VoxCPM, change_tempo
        from services.voxcpm import join_audio_chunks
        from utils.narration_audio import finish_narration, NARRATION_POST_PROCESSING

        revision = (prepared["identity"] or preset).get("modelRevision")
        if not revision:
            raise ValueError("An exact modelRevision is required")
        model_path = Path(os.environ.get("VOXCPM_MODEL_PATH") or snapshot_download(
            "openbmb/VoxCPM2", revision=revision, local_files_only=True)).resolve()
        if model_path.name != revision or model_path.parent.name != "snapshots":
            raise ValueError("Model path must identify the pinned Hugging Face snapshot")
        if json.loads((model_path / "config.json").read_text()).get("architecture") != "voxcpm2":
            raise ValueError("Expected a VoxCPM2 checkpoint")
        if not torch.cuda.is_available():
            raise RuntimeError("CUDA is unavailable")
        if "MP3" not in sf.available_formats():
            raise RuntimeError("The installed audio encoder does not support MP3")
        args.output.mkdir(parents=True, exist_ok=True)
        pending = stops[progress["completedStops"]:] if args.resume else stops
        if any((args.output / (stop["id"] + ".mp3")).exists() for stop in pending):
            raise ValueError("Audio output already exists")
        model = VoxCPM.from_pretrained(str(model_path), load_denoiser=False, optimize=False, device="cuda")
        sample_rate = model.tts_model.sample_rate
        for stop in pending:
            generated = []
            events = []
            update(phase="generating", currentStopId=stop["id"], completedChunks=0, totalChunks=len(stop["chunks"]))
            for index, chunk in enumerate(stop["chunks"]):
                torch.manual_seed(preset["seed"])
                np.random.seed(preset["seed"])
                raw, event = capture_generation(model, model_id='openbmb/VoxCPM2', revision=revision, seed=preset['seed'],
                    **generation_arguments(chunk.text, preset, reference), cfg_value=2.0,
                    inference_timesteps=10, max_len=4096, retry_badcase=False,
                )
                samples = np.asarray(raw).reshape(-1)
                if not samples.size or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 1e-4:
                    raise RuntimeError("A narration chunk is empty, invalid or silent")
                events.append(event)
                generated.append((samples, chunk))
                update(completedChunks=index + 1)
            audio = finish_narration(change_tempo(join_audio_chunks(generated, sample_rate), sample_rate, preset.get("speed", 1.0)), sample_rate)
            filename = stop["id"] + ".mp3"
            target = args.output / filename
            temporary = target.with_suffix(".tmp")
            sf.write(temporary, audio, sample_rate, format="MP3",
                     bitrate_mode="VARIABLE", compression_level=preset.get("mp3CompressionLevel", 0.8))
            os.link(temporary, target)
            temporary.unlink()
            digest = hashlib.sha256(target.read_bytes()).hexdigest()
            write_audio_record(target, {
                **combine_generations(events),
                'kind': 'narration',
                'version': 1,
                'identity': prepared['identity'],
                'spokenText': stop['spoken'],
                'stopId': stop['id'],
                'postProcessing': {
                    'paragraphPauseMs': preset['paragraphPauseMs'],
                    'sentencePauseMs': preset['sentencePauseMs'],
                    **NARRATION_POST_PROCESSING,
                    'speed': preset.get('speed', 1.0),
                    'sampleRate': sample_rate,
                    'format': 'MP3',
                    'compressionLevel': preset.get('mp3CompressionLevel', 0.8),
                    'bitrateMode': 'VARIABLE',
                    'crossfadeMs': int(os.getenv('VOXCPM_CHUNK_CROSSFADE_MS', '18')),
                    'trimEdgeSilenceMs': int(os.getenv('VOXCPM_TRIM_EDGE_SILENCE_MS', '120')),
                    'silenceThreshold': float(os.getenv('VOXCPM_SILENCE_THRESHOLD', '0.003'))
                },
                'modelOptions': {
                    'engine': 'nano-vllm-voxcpm',
                    'mode': preset.get('generationMode', 'continuation'),
                    'stylePrompt': preset.get('stylePrompt'),
                    'inference_timesteps': 10,
                    'temperature': 1.0,
                    'device': 'cuda'
                }
            }, destination=target.with_suffix('.provenance.json'))
            progress["results"].append({"id": stop["id"], "filename": filename,
                                        "durationSeconds": round(len(audio) / sample_rate, 3),
                                        "sha256": digest, "modelRevision": revision})
            update(completedStops=len(progress["results"]))
        update(phase="rendered")
        return 0
    except Exception as error:
        if can_write_progress:
            update(phase="failed", error=str(error))
        print(str(error), file=sys.stderr, flush=True)
        return 1

    finally:
        if model is not None:
            model.close()


if __name__ == "__main__":
    sys.exit(main())
