"""Check frozen inputs, audio integrity, provenance and an independent transcript."""
import hashlib
import json
from pathlib import Path
import re
import sys
import unicodedata

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

OUT = Path(__file__).resolve().parent
ROOT = OUT.parents[1]
sys.path.insert(0, str(ROOT / 'pods/voxcpm-pod/src'))
from utils.audio_provenance import verify_record
from utils.tour_audio_input import prepare_input


def words(text):
    text = ''.join(c for c in unicodedata.normalize('NFD', text.lower())
                   if unicodedata.category(c) != 'Mn')
    return re.findall(r'\w+', text)


def distance(expected, actual):
    row = list(range(len(actual) + 1))
    for i, word in enumerate(expected, 1):
        next_row = [i]
        for j, other in enumerate(actual, 1):
            next_row.append(min(next_row[-1] + 1, row[j] + 1,
                                row[j - 1] + (word != other)))
        row = next_row
    return row[-1]


def main():
    manifest = json.loads((OUT / 'manifest.json').read_text())
    for key in ('source', 'preset', 'reference'):
        assert hashlib.sha256(Path(manifest[key]).read_bytes()).hexdigest() == manifest[key + 'Sha256']
    model_path = Path.home() / '.cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots/536b0662742c02347bc0e980a01041f333bce120'
    model = WhisperModel(str(model_path), device='cpu', compute_type='int8',
                         cpu_threads=4, local_files_only=True)
    rows = []
    for variant in manifest['variants']:
        name = variant['id']
        prepared = prepare_input(OUT / 'input.json', OUT / (name + '.preset.json'))
        stop = prepared['stops'][0]
        assert stop['text'] == manifest['text']
        path = OUT / name / (stop['id'] + '.mp3')
        record = verify_record(path.with_suffix('.provenance.json'))
        assert record['spokenText'] == stop['spoken']
        assert len(record['segments']) == len(stop['chunks'])
        for event, chunk in zip(record['segments'], stop['chunks']):
            prefix = '(' + variant['style'] + ')' if variant['style'] else ''
            assert event['text'] == prefix + chunk.text
            assert event['parameters']['seed'] == 42
            assert len(event['inputs']) == (2 if name == 'a-habitual' else 1)
        wave, rate = sf.read(path)
        peak = float(np.max(np.abs(wave)))
        assert wave.ndim == 1 and np.isfinite(wave).all() and 1e-4 < peak < 1
        segments, _ = model.transcribe(str(path), language='es', beam_size=5,
            temperature=0, vad_filter=False, condition_on_previous_text=False)
        segments = list(segments)
        recognized = ' '.join(s.text.strip() for s in segments)
        expected = words(stop['spoken'])
        edits = distance(expected, words(recognized))
        row = {'id': name, 'audio': str(path), 'seconds': round(len(wave) / rate, 2),
               'sampleRate': rate, 'peak': peak, 'provenanceVerified': True,
               'wordEdits': edits, 'expectedWords': len(expected),
               'wordErrorRate': round(edits / len(expected), 4),
               'recognizedText': recognized, 'expectedText': stop['spoken'],
               'segments': [{'start': s.start, 'end': s.end, 'text': s.text.strip()} for s in segments]}
        rows.append(row)
        (OUT / 'verification.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2) + '\n')
        print(json.dumps({k: v for k, v in row.items() if k not in ('segments', 'expectedText')}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
