"""Concatenate the rendered chapters of one tour into a verified MP3 with a provenance record.

Extracted verbatim from the former backend/tmp/sicilia-20260919/assemble.py, which the Europe
batch loaded by file path. `verify_inputs(d)` returns (master, prepared) and is now a parameter
instead of a patched module global.
"""
import hashlib, json, sys
from pathlib import Path
import numpy as np
import soundfile as sf
ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / 'pods/voxcpm-pod/src'))
from utils.audio_provenance import input_audio, verify_record, write_audio_record, utc_now, find_record
from utils.tour_audio_input import generation_arguments


def read(p): return json.loads(Path(p).read_text())
def save(p, x):
 p = Path(p); q = p.with_suffix(p.suffix + '.tmp'); q.write_text(json.dumps(x, ensure_ascii=False, indent=2) + '\n'); q.replace(p)
def sha(p): return hashlib.sha256(p.read_bytes()).hexdigest()

def assemble(d, verify_inputs):
 m,prepared=verify_inputs(d);out=d/'tour.mp3';result=d/'listening-result.json'
 if result.exists():
  r=read(result);assert verify_record(find_record(out))['fileSha256']==r['fileSha256'];return
 assert not out.exists(),'Orphan compilation needs review'
 progress=read(d/'tts-job/progress.json');assert progress['phase']=='rendered';assert len(progress['results'])==len(m['pieces']);records={x['id']:x for x in progress['results']};expected={x['id']:x for x in prepared['stops']};norm=lambda s:' '.join(s.split());arrays=[];chapters=[];inputs=[];elapsed=0;rate0=None;started=utc_now()
 for p in m['pieces']:
  rr=records[p['audioId']];f=d/'audio'/rr['filename'];record=verify_record(find_record(f));assert record['identity']==read(d/'audio-input.json')['identity'];want=expected[p['audioId']];assert norm(record.get('spokenText',''))==norm(want['spoken']),'Spoken text mismatch';assert norm(record['text'])==norm(' '.join(generation_arguments(c.text,prepared['preset'],prepared['reference'])['text'] for c in want['chunks'])),'Chunk text mismatch'
  samples,rate=sf.read(f,dtype='float32');assert samples.ndim==1 and len(samples)>rate and np.isfinite(samples).all() and np.max(np.abs(samples))>1e-4;assert rate0 in (None,rate);rate0=rate
  if arrays:arrays.append(np.zeros(rate*2,dtype='float32'));elapsed+=2
  chapters.append(dict(id=p['id'],name=p['name'],audio=str(f),startSeconds=elapsed,durationSeconds=len(samples)/rate,sha256=record['fileSha256']));arrays.append(samples);elapsed+=len(samples)/rate;inputs.append(input_audio(f,role='source_audio'))
 sf.write(out,np.concatenate(arrays),rate0,format='MP3',bitrate_mode='VARIABLE',compression_level=.8);samples,rate=sf.read(out,dtype='float32');assert np.isfinite(samples).all() and abs(len(samples)/rate-elapsed)<.15
 prov=write_audio_record(out,dict(kind='tour_compilation',recordKind='new_transform',inputMode='audio_transform',generationStartedAt=started,generatedAt=utc_now(),inputs=inputs,text='\n\n'.join(p['text'] for p in m['pieces']),parameters={'operation':'concatenation','silenceSecondsBetweenPieces':2,'format':'MP3','sampleRate':rate,'compressionLevel':.8}));record=verify_record(prov);save(result,dict(audio=str(out),durationSeconds=len(samples)/rate,fileSha256=record['fileSha256'],chapters=chapters,validation='Identidad, texto normalizado, clips decodificables y procedencia enlazada comprobados; no escucha humana.'))
