"""Nano adapter for the saved-tour renderer's VoxCPM call contract."""
import os
from pathlib import Path
import sys
from types import SimpleNamespace

import numpy as np


class VoxCPM:
    @classmethod
    def from_pretrained(cls, model, **options):
        deps = Path(os.environ.get('VOXCPM_NANO_DEPS', Path(__file__).resolve().parents[2] / '.nano-deps'))
        if deps.is_dir():
            sys.path.insert(0, str(deps))
        from nanovllm_voxcpm import VoxCPM as Nano
        instance = cls()
        instance.server = Nano.from_pretrained(
            model=str(model), devices=[0], inference_timesteps=10,
            max_num_batched_tokens=8192, max_num_seqs=1, max_model_len=8192,
            gpu_memory_utilization=0.8, enforce_eager=False)
        instance.tts_model = SimpleNamespace(sample_rate=instance.server.get_model_info()['output_sample_rate'])
        instance.reference = None
        instance.latents = None
        return instance

    def _generate(self, text, reference_wav_path=None, prompt_wav_path=None,
                  prompt_text='', cfg_value=2.0, inference_timesteps=10,
                  max_len=4096, retry_badcase=False):
        if not reference_wav_path:
            raise ValueError('Nano tour narration requires a reference audio path')
        if inference_timesteps != 10 or retry_badcase:
            raise ValueError('Unsupported Nano tour generation settings')
        has_prompt = bool(prompt_wav_path) or bool(prompt_text)
        if has_prompt:
            if (not prompt_wav_path or not isinstance(prompt_text, str) or not prompt_text.strip()
                    or prompt_wav_path != reference_wav_path):
                raise ValueError('Nano tour narration requires matching reference and prompt audio plus transcript')
        else:
            prompt_text = ''
        if reference_wav_path != self.reference:
            self.latents = self.server.encode_latents(Path(reference_wav_path).read_bytes(), 'wav')
            self.reference = reference_wav_path
        import torch
        prompt_latents = self.latents if has_prompt else None
        parts = list(self.server.generate(target_text=text, prompt_latents=prompt_latents,
            ref_audio_latents=self.latents, prompt_text=prompt_text,
            seed=torch.initial_seed(), cfg_value=cfg_value,
            max_generate_length=max_len, temperature=1.0))
        if not parts:
            raise RuntimeError('Nano returned no audio')
        return np.concatenate(parts).astype(np.float32).reshape(-1)

    generate = _generate

    def close(self):
        self.server.stop()


def change_tempo(audio, rate, speed):
    """Pitch-preserving tempo adjustment, after assembly, before final encoding."""
    if isinstance(speed, bool) or not isinstance(speed, (int, float)) or not 0.5 <= speed <= 2.0:
        raise ValueError('Audio speed must be between 0.5 and 2.0')
    if speed == 1.0:
        return audio
    import av
    from fractions import Fraction
    frame = av.AudioFrame.from_ndarray(np.asarray(audio, dtype=np.float32).reshape(1, -1), format='fltp', layout='mono')
    frame.sample_rate, frame.time_base, frame.pts = rate, Fraction(1, rate), 0
    graph = av.filter.Graph()
    source = graph.add_abuffer(sample_rate=rate, format='fltp', layout='mono', time_base=frame.time_base)
    tempo = graph.add('atempo', str(speed))
    sink = graph.add('abuffersink')
    source.link_to(tempo)
    tempo.link_to(sink)
    graph.configure()
    graph.push(frame)
    graph.push(None)
    chunks = []
    while True:
        try:
            chunks.append(graph.pull().to_ndarray().reshape(-1))
        except av.error.EOFError:
            break
    result = np.concatenate(chunks)
    if not result.size or not np.isfinite(result).all():
        raise RuntimeError('Invalid tempo-adjusted audio')
    return result
