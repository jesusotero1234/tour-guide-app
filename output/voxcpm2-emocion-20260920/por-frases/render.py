"""Generate one narration with five independently directed passages."""
import hashlib
import json
import os
from pathlib import Path
import sys

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
sys.path.insert(0, str(ROOT / 'pods/voxcpm-pod/src'))
from utils.tour_audio_input import write_progress


def main():
    m = json.loads((OUT / 'manifest.json').read_text())
    assert ' '.join(s['text'] for s in m['segments']) == m['text']
    assert hashlib.sha256(m['text'].encode()).hexdigest() == m['textSha256']
    for key in ('source', 'preset', 'reference'):
        assert hashlib.sha256(Path(m[key]).read_bytes()).hexdigest() == m[key + 'Sha256']
    target = OUT / 'narracion-emociones.mp3'
    paths = [target] + [OUT / (s['id'] + '-raw.wav') for s in m['segments']]
    if any(p.exists() for p in paths):
        raise FileExistsError('Experiment audio already exists')
    os.environ.update(HF_HUB_OFFLINE='1', TOKENIZERS_PARALLELISM='false',
        VOXCPM_SENTENCE_PAUSE_MS=str(m['sentencePauseMs']),
        VOXCPM_PARAGRAPH_PAUSE_MS=str(m['paragraphPauseMs']))
    progress = {'phase': 'loading', 'completedSegments': 0, 'results': []}
    write_progress(OUT / 'progress.json', progress)
    model = None
    try:
        import numpy as np
        import soundfile as sf
        import torch
        from huggingface_hub import snapshot_download
        from services.nano import VoxCPM
        from services.voxcpm import join_audio_chunks
        from utils.sanitize import TextChunk
        from utils.narration_audio import finish_narration, NARRATION_POST_PROCESSING
        from utils.audio_provenance import capture_generation, combine_generations, write_audio_record

        revision = m['modelRevision']
        model_path = Path(snapshot_download('openbmb/VoxCPM2', revision=revision, local_files_only=True))
        assert model_path.name == revision
        assert json.loads((model_path / 'config.json').read_text())['architecture'] == 'voxcpm2'
        model = VoxCPM.from_pretrained(str(model_path))
        rate = model.tts_model.sample_rate
        generated, events = [], []
        for segment in m['segments']:
            progress.update(phase='generating', currentSegment=segment['id'])
            write_progress(OUT / 'progress.json', progress)
            torch.manual_seed(m['seed'])
            np.random.seed(m['seed'])
            samples, event = capture_generation(model, model_id='openbmb/VoxCPM2',
                revision=revision, seed=m['seed'], description=segment['instruction'],
                text='(' + segment['instruction'] + ')' + segment['text'],
                reference_wav_path=m['reference'], cfg_value=2.0,
                inference_timesteps=10, max_len=4096, retry_badcase=False)
            samples = np.asarray(samples, dtype=np.float32).reshape(-1)
            assert samples.size and np.isfinite(samples).all() and np.max(np.abs(samples)) > 1e-4
            raw_path = OUT / (segment['id'] + '-raw.wav')
            with raw_path.open('xb') as stream:
                sf.write(stream, samples, rate, format='WAV', subtype='FLOAT')
            write_audio_record(raw_path, {**event, 'kind': 'narration',
                'spokenText': segment['text'], 'emotion': segment['emotion']})
            events.append(event)
            generated.append((samples, TextChunk(segment['text'], 'sentence')))
            progress['results'].append({'id': segment['id'], 'emotion': segment['emotion'],
                                       'rawSeconds': round(len(samples) / rate, 3)})
            progress['completedSegments'] += 1
            write_progress(OUT / 'progress.json', progress)
            print('Generated ' + segment['id'], flush=True)
        audio = finish_narration(join_audio_chunks(generated, rate), rate)
        with target.open('xb') as stream:
            sf.write(stream, audio, rate, format='MP3', bitrate_mode='VARIABLE', compression_level=0.8)
        write_audio_record(target, {**combine_generations(events), 'kind': 'narration',
            'spokenText': m['text'], 'modelOptions': {'engine': 'nano-vllm-voxcpm',
                'mode': 'controllable-cloning-per-segment'},
            'postProcessing': {**NARRATION_POST_PROCESSING, 'sampleRate': rate,
                'format': 'MP3', 'compressionLevel': 0.8, 'bitrateMode': 'VARIABLE', 'speed': 1.0,
                'sentencePauseMs': m['sentencePauseMs'], 'paragraphPauseMs': m['paragraphPauseMs'],
                'crossfadeMs': 18, 'trimEdgeSilenceMs': 120}})
        progress.update(phase='rendered', audio=str(target), durationSeconds=round(len(audio) / rate, 3))
        write_progress(OUT / 'progress.json', progress)
    except Exception as error:
        progress.update(phase='failed', error=str(error))
        write_progress(OUT / 'progress.json', progress)
        raise
    finally:
        if model is not None:
            model.close()


if __name__ == '__main__':
    main()
