"""Verify the directed passages and align them with an independent transcript."""
import difflib
import json
from pathlib import Path
import runpy
import sys

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[2]
sys.path.insert(0, str(ROOT / 'pods/voxcpm-pod/src'))
from utils.audio_provenance import verify_record


def main():
    helpers = runpy.run_path(str(OUT.parent / 'verify.py'))
    words, distance = helpers['words'], helpers['distance']
    m = json.loads((OUT / 'manifest.json').read_text())
    target = OUT / 'narracion-emociones.mp3'
    record = verify_record(str(target) + '.provenance.json')
    assert record['spokenText'] == m['text']
    assert len(record['segments']) == len(m['segments']) == 5
    for section, event in zip(m['segments'], record['segments']):
        assert event['text'] == '(' + section['instruction'] + ')' + section['text']
        assert event['parameters']['seed'] == m['seed']
        assert len(event['inputs']) == 1
        assert event['inputs'][0]['sha256'] == m['referenceSha256']
        raw_path = OUT / (section['id'] + '-raw.wav')
        verify_record(str(raw_path) + '.provenance.json')
        raw, _ = sf.read(raw_path)
        assert raw.ndim == 1 and raw.size and np.isfinite(raw).all()
    wave, rate = sf.read(target)
    peak = float(np.max(np.abs(wave)))
    assert wave.ndim == 1 and np.isfinite(wave).all() and 1e-4 < peak < 1
    model_path = Path.home() / '.cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots/536b0662742c02347bc0e980a01041f333bce120'
    model = WhisperModel(str(model_path), device='cpu', compute_type='int8',
                         cpu_threads=4, local_files_only=True)
    segments, _ = model.transcribe(str(target), language='es', beam_size=5,
        temperature=0, vad_filter=False, condition_on_previous_text=False, word_timestamps=True)
    segments = list(segments)
    recognized = ' '.join(s.text.strip() for s in segments)
    numbers = {'1561': 'mil quinientos sesenta y uno', 'ii': 'segundo', 'xviii': 'dieciocho'}
    actual, starts = [], []
    for segment in segments:
        for word in segment.words:
            for token in words(word.word):
                expanded = numbers.get(token, token).split()
                actual.extend(expanded)
                starts.extend([word.start] * len(expanded))
    expected = words(m['text'])
    alignment = {}
    for block in difflib.SequenceMatcher(None, expected, actual, autojunk=False).get_matching_blocks():
        for i in range(block.size):
            alignment[block.a + i] = block.b + i
    timeline, offset = [], 0
    for section in m['segments']:
        index = next((i for i in range(offset, offset + 3) if i in alignment), None)
        timeline.append({'id': section['id'], 'emotion': section['emotion'],
                         'startSecondsApprox': round(starts[alignment[index]], 2) if index is not None else None,
                         'text': section['text']})
        offset += len(words(section['text']))
    report = {'audio': str(target), 'seconds': round(len(wave) / rate, 3),
        'sampleRate': rate, 'peak': peak, 'provenanceVerified': True,
        'expectedText': m['text'], 'recognizedText': recognized,
        'numberNormalization': numbers, 'normalizedWordEdits': distance(expected, actual),
        'expectedWords': len(expected), 'timeline': timeline,
        'scope': 'Technical integrity and automatic transcription. Emotion and voice continuity require listening.'}
    (OUT / 'verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    print(json.dumps(report, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
