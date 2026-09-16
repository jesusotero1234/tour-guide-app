#!/usr/bin/env python3
"""Render saved tour stops under scripts/with-tts-gpu.py, using voice A."""
import argparse
import json
import hashlib
import os
from pathlib import Path
import sys

POD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POD / "src"))
from utils.tour_audio_input import generation_arguments, prepare_input, write_progress
from utils.audio_provenance import capture_generation, combine_generations, write_audio_record


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--input", type=Path, required=True)
    parser.add_argument("--output", type=Path, required=True)
    parser.add_argument("--progress", type=Path, required=True)
    parser.add_argument("--prepare-only", action="store_true")
    args = parser.parse_args()
    progress = {"phase": "preparing", "completedStops": 0, "totalStops": 0, "results": []}

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
        update(totalStops=len(stops), stopPlans=[
            {"id": stop["id"], "chunkCount": len(stop["chunks"]),
             "paragraphBreaks": sum(chunk.boundary == "paragraph" for chunk in stop["chunks"])}
            for stop in stops
        ])
        if args.prepare_only:
            update(phase="prepared")
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
        if any((args.output / (stop["id"] + ".mp3")).exists() for stop in stops):
            raise ValueError("Audio output already exists")
        model = VoxCPM.from_pretrained(str(model_path), load_denoiser=False, optimize=False, device="cuda")
        sample_rate = model.tts_model.sample_rate
        for stop_index, stop in enumerate(stops):
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
            update(completedStops=stop_index + 1)
        update(phase="rendered")
        return 0
    except Exception as error:
        update(phase="failed", error=str(error))
        print(str(error), file=sys.stderr, flush=True)
        return 1

    finally:
        if model is not None:
            model.close()


if __name__ == "__main__":
    sys.exit(main())
