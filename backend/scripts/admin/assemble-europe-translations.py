#!/usr/bin/env python3
import hashlib, json, sys
from pathlib import Path
import numpy as np
import soundfile as sf

BACKEND = Path(__file__).resolve().parents[2]
ROOT = BACKEND.parent
BATCH = BACKEND / 'tmp/pilot-batch-europe-20260920'
WORK = BATCH / 'translation-audio'
sys.path.insert(0, str(ROOT / 'pods/voxcpm-pod/src'))
from utils.audio_provenance import input_audio, verify_record, write_audio_record, utc_now, find_record
from utils.tour_audio_input import prepare_input, generation_arguments

read = lambda path: json.loads(Path(path).read_text())
sha = lambda path: hashlib.sha256(Path(path).read_bytes()).hexdigest()
norm = lambda text: ' '.join(text.split())

def save(path, value):
    path = Path(path); temporary = path.with_suffix(path.suffix + '.tmp')
    temporary.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n'); temporary.replace(path)

def assemble(language):
    manifest, frozen = read(WORK / 'manifest.json'), read(WORK / 'frozen.json')
    language_dir = WORK / 'languages' / language
    results, expected, audio_paths, identity, preset, reference = {}, {}, {}, None, None, None
    for group in frozen['languages'][language]['batches']:
        directory = language_dir / group['id']; input_path = directory / 'audio-input.json'
        assert sha(input_path) == group['inputSha256']
        prepared = prepare_input(input_path, ROOT / f'pods/voxcpm-pod/presets/guide-{language}-a.json')
        progress = read(directory / 'tts-job/progress.json')
        assert progress['phase'] == 'rendered' and len(progress['results']) == len(prepared['stops']) == group['chapters']
        current_identity = read(input_path)['identity']; assert identity in (None, current_identity); identity = current_identity
        preset, reference = prepared['preset'], prepared['reference']
        for row in progress['results']:
            assert row['id'] not in results; results[row['id']] = row
            audio_paths[row['id']] = directory / 'audio' / row['filename']
        for row in prepared['stops']:
            assert row['id'] not in expected; expected[row['id']] = row
    count = 0
    for variant in (row for row in manifest['variants'] if row['language'] == language):
        directory = WORK / 'tours' / variant['citySlug'] / language
        master_path = directory / 'master.json'; master = read(master_path)
        assert sha(master_path) == frozen['tours'][variant['slug']]['masterSha256']
        result_path, output_path = directory / 'listening-result.json', directory / 'tour.mp3'
        if result_path.exists():
            result = read(result_path)
            assert verify_record(find_record(output_path))['fileSha256'] == result['fileSha256']
            count += 1; continue
        assert not output_path.exists(), 'Orphan compilation needs review: ' + variant['slug']
        arrays, chapters, inputs = [], [], []
        elapsed, rate0, started = 0, None, utc_now()
        for piece in master['pieces']:
            rendered = results[piece['audioId']]
            audio = audio_paths[piece['audioId']]
            record = verify_record(find_record(audio)); wanted = expected[piece['audioId']]
            assert record['identity'] == identity and norm(record.get('spokenText', '')) == norm(wanted['spoken'])
            assert norm(record['text']) == norm(' '.join(generation_arguments(chunk.text, preset, reference)['text'] for chunk in wanted['chunks']))
            samples, rate = sf.read(audio, dtype='float32')
            assert samples.ndim == 1 and len(samples) > rate and np.isfinite(samples).all() and np.max(np.abs(samples)) > 1e-4
            assert rate0 in (None, rate); rate0 = rate
            if arrays: arrays.append(np.zeros(rate * 2, dtype='float32')); elapsed += 2
            chapters.append(dict(id=piece['id'], name=piece['name'], audio=str(audio), startSeconds=elapsed,
                                 durationSeconds=len(samples) / rate, sha256=record['fileSha256']))
            arrays.append(samples); elapsed += len(samples) / rate; inputs.append(input_audio(audio, role='source_audio'))
        sf.write(output_path, np.concatenate(arrays), rate0, format='MP3', bitrate_mode='VARIABLE', compression_level=.8)
        samples, rate = sf.read(output_path, dtype='float32')
        assert np.isfinite(samples).all() and abs(len(samples) / rate - elapsed) < .15
        provenance = write_audio_record(output_path, dict(kind='tour_compilation', recordKind='new_transform',
            inputMode='audio_transform', generationStartedAt=started, generatedAt=utc_now(), inputs=inputs,
            text='\n\n'.join(piece['text'] for piece in master['pieces']), parameters={'operation':'concatenation',
            'silenceSecondsBetweenPieces':2, 'format':'MP3', 'sampleRate':rate, 'compressionLevel':.8}))
        record = verify_record(provenance)
        save(result_path, dict(audio=str(output_path), durationSeconds=len(samples) / rate,
            fileSha256=record['fileSha256'], chapters=chapters,
            validation='Identidad, texto, audio decodificable y procedencia comprobados; sin escucha humana.'))
        count += 1
    print(json.dumps({'language': language, 'completedTours': count}, ensure_ascii=False))

if __name__ == '__main__':
    assert len(sys.argv) == 2 and sys.argv[1] in ('en', 'fr', 'de', 'it')
    assemble(sys.argv[1])
