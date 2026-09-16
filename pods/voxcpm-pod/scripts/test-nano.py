"""Focused CPU checks for reference reuse and pitch-preserving speed."""
import sys
import tempfile
from pathlib import Path
from types import SimpleNamespace
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'src'))
from services.nano import VoxCPM, change_tempo

class Server:
    def __init__(self):
        self.encodes = 0
        self.calls = []
    def encode_latents(self, data, format):
        self.encodes += 1
        return data
    def generate(self, **kwargs):
        self.calls.append(kwargs)
        return [np.ones(80, dtype=np.float32)]

with tempfile.TemporaryDirectory() as directory:
    path = Path(directory) / 'reference.wav'
    path.write_bytes(b'reference')
    model = VoxCPM()
    model.server = Server()
    model.reference = model.latents = None
    model.generate(text='(French documentary narration.)Bonjour.', reference_wav_path=str(path))
    assert model.server.calls[-1]['target_text'] == '(French documentary narration.)Bonjour.'
    assert model.server.calls[-1]['prompt_text'] == ''
    assert model.server.calls[-1]['prompt_latents'] is None
    assert model.server.calls[-1]['ref_audio_latents'] == b'reference'
    model.generate(text='Bienvenue.', reference_wav_path=str(path), prompt_wav_path=str(path), prompt_text='La référence.')
    assert model.server.encodes == 1
    assert all(c['prompt_text'] == 'La référence.' and c['prompt_latents'] == c['ref_audio_latents'] == b'reference' for c in model.server.calls[1:])
    model.generate(text='Bonjour.', reference_wav_path=str(path))
    assert model.server.encodes == 1
    assert model.server.calls[-1]['prompt_latents'] is None
    try:
        model.generate(text='Bonjour.', reference_wav_path=None)
        raise AssertionError('accepted missing reference')
    except ValueError:
        pass
    try:
        model.generate(text='Bonjour.', reference_wav_path=str(path), prompt_wav_path=str(path), prompt_text='   ')
        raise AssertionError('accepted blank transcript')
    except ValueError:
        pass
    try:
        model.generate(text='Bonjour.', reference_wav_path=str(path), prompt_wav_path=str(path))
        raise AssertionError('accepted missing transcript')
    except ValueError:
        pass
    try:
        model.generate(text='Bonjour.', reference_wav_path=str(path), prompt_wav_path='wrong', prompt_text='La référence.')
        raise AssertionError('accepted mismatched prompt file')
    except ValueError:
        pass
    try:
        model.generate(text='Bonjour.', reference_wav_path=str(path), prompt_text='La référence.')
        raise AssertionError('accepted transcript without prompt path')
    except ValueError:
        pass
rate = 48000
wave = np.sin(2 * np.pi * 220 * np.arange(rate * 2) / rate).astype(np.float32)
slower = change_tempo(wave, rate, 0.9)
assert abs(len(slower) / len(wave) - 1 / 0.9) < 0.02
peak = np.fft.rfftfreq(len(slower), 1 / rate)[np.argmax(abs(np.fft.rfft(slower)))]
assert abs(peak - 220) < 2, peak
assert change_tempo(wave, rate, 1.0) is wave
for speed in (True, 0, float('nan'), 3):
    try:
        change_tempo(wave, rate, speed)
        raise AssertionError('accepted invalid speed')
    except ValueError:
        pass
print('Nano reference reuse, matching prompts, tempo duration and pitch: passed')
