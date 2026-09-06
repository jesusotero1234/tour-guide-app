#!/usr/bin/env python3
"""Render saved tour stops under scripts/with-tts-gpu.py, using voice A."""
import argparse
import json
import os
from pathlib import Path
import sys

POD = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(POD / "src"))
from utils.tour_audio_input import prepare_input, write_progress


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

    try:
        prepared = prepare_input(args.input, Path(os.environ.get("VOXCPM_PRESET_PATH", POD / "presets/guide-es-a.json")))
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
        from voxcpm import VoxCPM
        from services.voxcpm import join_audio_chunks, normalize_audio

        model_path = Path(os.environ.get("VOXCPM_MODEL_PATH") or snapshot_download(
            "openbmb/VoxCPM2", local_files_only=True))
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
            update(phase="generating", currentStopId=stop["id"], completedChunks=0, totalChunks=len(stop["chunks"]))
            for index, chunk in enumerate(stop["chunks"]):
                torch.manual_seed(preset["seed"])
                np.random.seed(preset["seed"])
                samples = np.asarray(model.generate(
                    text=chunk.text, reference_wav_path=reference, prompt_wav_path=reference,
                    prompt_text=preset["referenceText"], cfg_value=2.0,
                    inference_timesteps=10, max_len=4096, retry_badcase=False,
                )).reshape(-1)
                if not samples.size or not np.isfinite(samples).all() or np.max(np.abs(samples)) < 1e-4:
                    raise RuntimeError("A narration chunk is empty, invalid or silent")
                generated.append((samples, chunk))
                update(completedChunks=index + 1)
            audio = normalize_audio(join_audio_chunks(generated, sample_rate))
            filename = stop["id"] + ".mp3"
            target = args.output / filename
            temporary = target.with_suffix(".tmp")
            sf.write(temporary, audio, sample_rate, format="MP3",
                     bitrate_mode="VARIABLE", compression_level=0.8)
            os.replace(temporary, target)
            progress["results"].append({"id": stop["id"], "filename": filename,
                                        "durationSeconds": round(len(audio) / sample_rate, 3)})
            update(completedStops=stop_index + 1)
        update(phase="rendered")
        return 0
    except Exception as error:
        update(phase="failed", error=str(error))
        print(str(error), file=sys.stderr, flush=True)
        return 1


if __name__ == "__main__":
    sys.exit(main())
