"""Prove completed audio survives a lost final progress update, on an isolated copy."""
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import uuid

ROOT=Path(__file__).resolve().parents[3]
PYTHON=ROOT/'pods/voxcpm-pod/.venv/bin/python'
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()

def verify(source):
    source=Path(source).resolve()
    report_path=source/'audio-recovery-proof.json'
    receipt=source/'receipts/audio.json'
    binding={'audioReceiptSha256':sha(receipt),'checkerSha256':sha(__file__)}
    if report_path.exists():
        report=json.loads(report_path.read_text())
        if report.get('binding')==binding and report.get('passed'): return report
    copy=source.parent/('_audio-recovery-'+source.name+'-'+uuid.uuid4().hex[:8])
    copy.mkdir()
    shutil.copytree(source/'audio',copy/'audio');shutil.copytree(source/'tts-job',copy/'tts-job')
    originals={str(p):sha(p) for folder in ('audio','tts-job') for p in (source/folder).iterdir() if p.is_file()}
    audios={p.name:sha(p) for p in (copy/'audio').iterdir() if p.is_file()}
    progress=copy/'tts-job/progress.json';saved=json.loads(progress.read_text())
    assert saved['phase']=='rendered' and saved['results']
    last=saved['results'].pop()
    saved.update(phase='generating',completedStops=len(saved['results']),currentStopId=last['id'])
    progress.write_text(json.dumps(saved))
    command=[str(PYTHON),str(ROOT/'pods/voxcpm-pod/scripts/render-tour.py'),
      '--input',str(copy/'tts-job/input.json'),'--output',str(copy/'audio'),'--progress',str(progress),'--resume']
    result=subprocess.run(command,env={**os.environ,'CUDA_VISIBLE_DEVICES':''},capture_output=True,text=True,timeout=45)
    assert result.returncode==0,'Audio recovery failed: '+result.stderr[-800:]
    assert json.loads(progress.read_text())['completedStops']==len(saved['results'])+1
    assert audios=={p.name:sha(p) for p in (copy/'audio').iterdir() if p.is_file()},'Audio was rewritten'
    assert all(sha(Path(p))==h for p,h in originals.items()),'Original audio changed'
    report={'binding':binding,'passed':True,'copy':str(copy),'originals':originals,'copiedAudio':audios,
      'interruption':'final sidecar committed before final progress update','realRendererProcess':True,
      'chaptersRecovered':1,'gpuAvailable':False,'paidCalls':0}
    temporary=report_path.with_suffix('.tmp');temporary.write_text(json.dumps(report,indent=2)+'\n');temporary.replace(report_path)
    return report
