#!/usr/bin/env python3
"""Compare one complete Spanish tour stop with the app's sentence-aware chunks."""
import argparse
import hashlib
import importlib.metadata
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source", type=Path, required=True)
    parser.add_argument("--section", type=int, default=1)
    parser.add_argument("--reference", type=Path)
    parser.add_argument("--model", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--chunk-chars", type=int, default=360)
    parser.add_argument("--optimize", action="store_true")
    parser.add_argument("--preset", type=Path)
    parser.add_argument("--case", choices=("whole", "chunked", "both"), default="both")
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    if args.preset is not None and args.reference is not None:
        parser.error("--preset and --reference are mutually exclusive")
    if args.preset is None and args.reference is None:
        parser.error("one of --preset or --reference is required")
    preset = None
    if args.preset is not None:
        if not args.preset.is_file():
            parser.error(f"missing preset: {args.preset}")
        try:
            preset = json.loads(args.preset.read_text())
        except (OSError, ValueError) as error:
            parser.error(f"cannot read preset: {error}")
        if not isinstance(preset, dict):
            parser.error("preset must be a JSON object")
        replacements = preset.get("textReplacements", {})
        if not isinstance(replacements, dict) or any(not isinstance(k, str) or not k or not isinstance(v, str) for k, v in replacements.items()):
            parser.error("textReplacements must map nonempty strings to strings")
        if not isinstance(preset.get("singleNewlineParagraphs", False), bool):
            parser.error("singleNewlineParagraphs must be a boolean")
        for key in ("reference", "referenceText", "seed"):
            if key not in preset:
                parser.error(f"preset missing key: {key}")
        if not isinstance(preset["reference"], str) or not preset["reference"].strip():
            parser.error("preset reference must be a nonblank string")
        if not isinstance(preset["referenceText"], str) or not preset["referenceText"].strip():
            parser.error("preset referenceText must be a nonblank string")
        if not isinstance(preset["seed"], int) or isinstance(preset["seed"], bool):
            parser.error("preset seed must be an integer")
        for key in ("sentencePauseMs", "paragraphPauseMs"):
            val = preset.get(key)
            if not isinstance(val, int) or isinstance(val, bool) or val < 0 or val > 3000:
                parser.error(f"preset {key} must be an integer 0..3000")
        os.environ["VOXCPM_SENTENCE_PAUSE_MS"] = str(preset["sentencePauseMs"])
        os.environ["VOXCPM_PARAGRAPH_PAUSE_MS"] = str(preset["paragraphPauseMs"])
        ref_path = (args.preset.parent / preset["reference"]).resolve()
        if not ref_path.is_file():
            parser.error(f"preset reference not found: {ref_path}")
        args.reference = ref_path
    for path in (args.source, args.reference, args.model / "config.json"):
        if not path.is_file():
            parser.error(f"missing input: {path}")
    config = json.loads((args.model / "config.json").read_text())
    if config.get("architecture") != "voxcpm2":
        parser.error("expected a VoxCPM2 checkpoint")
    source = args.source.read_text()
    match = re.search(rf"^## {args.section}\. ([^\n]+)\n(.*?)(?=^## |\Z)", source, re.M | re.S)
    if not match or "\n> Auditoría:" not in match[2]:
        parser.error("expected a completed stop with an audit footer")
    title = match[1]
    original = match[2].split("\n> Auditoría:", 1)[0].strip()
    args.output.mkdir(parents=True, exist_ok=True)
    if any((args.output / name).exists() for name in ("whole.wav", "chunked.wav", "metrics.json")):
        parser.error("output already contains a comparison; choose a new output directory")
    (args.output / "source.txt").write_text(original + "\n")
    spoken = original
    if preset is not None:
        for phrase, replacement in preset.get("textReplacements", {}).items():
            pattern = r"(?<!\w)" + re.escape(phrase) + r"(?!\w)"
            spoken = re.sub(pattern, lambda match: replacement, spoken)
        if preset.get("singleNewlineParagraphs"):
            spoken = re.sub(r"\n+", "\n\n", spoken)
    metrics = {
        "title": title,
        "source": str(args.source.resolve()),
        "sourceSha256": hashlib.sha256(original.encode()).hexdigest(),
        "words": len(original.split()),
        "chars": len(original),
        "model": str(args.model.resolve()),
        "architecture": config["architecture"],
        "reference": str(args.reference.resolve()),
        "referenceSha256": hashlib.sha256(args.reference.read_bytes()).hexdigest(),
        "optimize": args.optimize,
        "preset": str(args.preset.resolve()) if preset is not None else None,
        "presetSettings": preset if preset is not None else None,
        "referenceText": preset["referenceText"] if preset is not None else None,
        "cloneMode": "ultimate" if preset is not None else "reference",
        "sentencePauseMs": preset["sentencePauseMs"] if preset is not None else None,
        "paragraphPauseMs": preset["paragraphPauseMs"] if preset is not None else None,
        "cfg": 2.0,
        "inferenceSteps": 10,
        "retryBadcase": False,
        "cases": [],
        "status": "preparing",
    }

    def save(stage, **details):
        metrics["status"] = stage
        metrics.update(details)
        (args.output / "metrics.json").write_text(json.dumps(metrics, ensure_ascii=False, indent=2) + "\n")
        print(json.dumps({"stage": stage, **details}, ensure_ascii=False), flush=True)

    os.environ.setdefault("HF_HUB_OFFLINE", "1")
    os.environ.setdefault("TOKENIZERS_PARALLELISM", "false")
    pod = Path(__file__).resolve().parents[1]
    sys.path.insert(0, str(pod / "src"))
    import_started = time.monotonic()
    import numpy as np
    import soundfile as sf
    import torch
    from voxcpm import VoxCPM
    from utils.sanitize import chunk_text, sanitize_text
    from services.voxcpm import VOICE_PROFILES, join_audio_chunks, normalize_audio
    metrics["importSeconds"] = round(time.monotonic() - import_started, 3)
    metrics["versions"] = {name: importlib.metadata.version(name) for name in ("voxcpm", "torch", "torchaudio", "transformers")}
    cleaned = sanitize_text(spoken)
    (args.output / "spoken.txt").write_text(cleaned + "\n")
    metrics["spokenSha256"] = hashlib.sha256(cleaned.encode()).hexdigest()
    metrics["spokenWords"] = len(cleaned.split())
    chunks = chunk_text(cleaned, max_chars=args.chunk_chars)
    assert " ".join(chunk.text for chunk in chunks).split() == cleaned.split(), "chunking changed the text"
    metrics["chunks"] = [{"text": c.text, "boundary": c.boundary, "chars": len(c.text)} for c in chunks]
    metrics["spokenText"] = cleaned
    if args.prepare_only:
        save("prepared", chunkCount=len(chunks), words=metrics["words"], title=title)
        return
    if not torch.cuda.is_available():
        raise RuntimeError("CUDA unavailable; refusing an accidental CPU benchmark")
    metrics["gpu"] = torch.cuda.get_device_name(0)
    metrics["cuda"] = torch.version.cuda
    metrics["referenceAudio"] = str(sf.info(args.reference))
    save("loading_model", chunkCount=len(chunks), words=metrics["words"], title=title)
    load_started = time.monotonic()
    model = VoxCPM.from_pretrained(str(args.model), load_denoiser=False, optimize=args.optimize, device="cuda")
    torch.cuda.synchronize()
    metrics["modelLoadSeconds"] = round(time.monotonic() - load_started, 3)
    sample_rate = model.tts_model.sample_rate
    metrics["sampleRate"] = sample_rate
    description = VOICE_PROFILES["guide_es"]
    seed = preset["seed"] if preset is not None else 42

    def generate(text, seed_val):
        torch.manual_seed(seed_val)
        np.random.seed(seed_val)
        if preset is not None:
            return np.asarray(model.generate(
                text=text,
                reference_wav_path=str(args.reference),
                prompt_wav_path=str(args.reference),
                prompt_text=preset["referenceText"],
                cfg_value=2.0,
                inference_timesteps=10,
                max_len=4096,
                retry_badcase=False,
            )).reshape(-1)
        return np.asarray(model.generate(
            text=f"({description}){text}",
            reference_wav_path=str(args.reference),
            cfg_value=2.0,
            inference_timesteps=10,
            max_len=4096,
            retry_badcase=False,
        )).reshape(-1)

    save("warming_up", modelLoadSeconds=metrics["modelLoadSeconds"])
    warmup_started = time.monotonic()
    generate("Comenzamos nuestro recorrido por Sevilla.", seed)
    torch.cuda.synchronize()
    metrics["warmupSeconds"] = round(time.monotonic() - warmup_started, 3)
    save("ready", warmupSeconds=metrics["warmupSeconds"])

    cases = []
    if args.case == "both":
        cases = ["whole", "chunked"]
    else:
        cases = [args.case]
    for name in cases:
        save(f"generating_{name}")
        torch.cuda.empty_cache()
        torch.cuda.reset_peak_memory_stats()
        started = time.monotonic()
        chunk_results = []
        if name == "whole":
            wav = generate(" ".join(cleaned.split()), seed)
        else:
            generated = []
            chunks_dir = args.output / "chunks"
            chunks_dir.mkdir(parents=True, exist_ok=True)
            for index, chunk in enumerate(chunks):
                chunk_started = time.monotonic()
                part = generate(chunk.text, seed if preset is not None else 42 + index)
                torch.cuda.synchronize()
                generated.append((part, chunk))
                chunk_path = chunks_dir / f"{index + 1:03d}.wav"
                sf.write(chunk_path, part, sample_rate, subtype="PCM_16")
                entry = {
                    "index": index + 1, "chars": len(chunk.text),
                    "seconds": round(time.monotonic() - chunk_started, 3),
                    "audioSeconds": round(len(part) / sample_rate, 3),
                    "boundary": chunk.boundary,
                    "path": str(chunk_path.resolve()),
                }
                chunk_results.append(entry)
                print(json.dumps({"stage": "chunk_finished", **entry}), flush=True)
            wav = join_audio_chunks(generated, sample_rate)
        torch.cuda.synchronize()
        elapsed = time.monotonic() - started
        if not len(wav) or not np.isfinite(wav).all() or np.max(np.abs(wav)) < 1e-4:
            raise RuntimeError(f"{name}: empty, non-finite or silent audio")
        wav = normalize_audio(wav)
        target = args.output / f"{name}.wav"
        sf.write(target, wav, sample_rate, subtype="PCM_16")
        duration = len(wav) / sample_rate
        entry = {
            "name": name, "path": str(target.resolve()),
            "generationSeconds": round(elapsed, 3),
            "audioSeconds": round(duration, 3),
            "realTimeFactor": round(elapsed / duration, 4),
            "peakAllocatedGiB": round(torch.cuda.max_memory_allocated() / 2**30, 3),
            "peakReservedGiB": round(torch.cuda.max_memory_reserved() / 2**30, 3),
            "rms": round(float(np.sqrt(np.mean(wav.astype(np.float64)**2))), 6),
            "chunks": chunk_results,
        }
        if shutil.which("ffmpeg"):
            mp3 = target.with_suffix(".mp3")
            subprocess.run(["ffmpeg", "-v", "error", "-i", str(target), "-codec:a", "libmp3lame", "-q:a", "3", str(mp3)], check=True)
            entry["mp3"] = str(mp3.resolve())
        elif "MP3" in sf.available_formats():
            mp3 = target.with_suffix(".mp3")
            sf.write(mp3, wav, sample_rate, format="MP3", bitrate_mode="VARIABLE", compression_level=0.8)
            entry["mp3"] = str(mp3.resolve())
        metrics["cases"].append(entry)
        save(f"finished_{name}", lastCase=entry)
    save("complete")


if __name__ == "__main__":
    main()
