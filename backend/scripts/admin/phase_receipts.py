"""Content-bound completion receipts. Creation validates semantics; reuse verifies all bytes."""
import hashlib
import json
from pathlib import Path
import subprocess
import sys

ROOT=Path(__file__).resolve().parents[3]
NODE=Path('/home/jesusotero/.nvm/versions/node/v22.19.0/bin/node')
PYTHON=ROOT/'pods/voxcpm-pod/.venv/bin/python'
read=lambda p:json.loads(Path(p).read_text())
sha=lambda p:hashlib.sha256(Path(p).read_bytes()).hexdigest()
digest=lambda o:hashlib.sha256(json.dumps(o,ensure_ascii=False,sort_keys=True,separators=(',',':')).encode()).hexdigest()

def verify(directory,stage):
    try:
        receipt=read(directory/'receipts'/f'{stage}.json')
        if receipt['version']!=1 or receipt['stage']!=stage or receipt['directory']!=str(directory.resolve()): return False
        return bool(receipt['files']) and all(sha(path)==value for path,value in receipt['files'].items())
    except (OSError,ValueError,KeyError,TypeError): return False

def create(directory,stage, *, audio_check=True):
    directory=Path(directory).resolve(); files=set()
    def include(path):
        path=Path(path).resolve();files.add(path);return read(path)
    inputs=include(directory/'inputs.json'); snapshot=inputs['snapshot']
    destination=include(directory/'destination.json')
    assert destination['qid']==snapshot['destination']['qid'],'destination mismatch'
    preparation=include(directory/'preparation.json');blueprint=include(preparation['blueprintFile'])
    assert blueprint==snapshot,'blueprint inputs mismatch'
    if 'sourceManifests' in preparation:
        assert preparation['sourceManifests'],'required source acquisition unproven'
        for source_path in preparation['sourceManifests']:
            source=include(source_path)
            assert source['status'] in ('complete_under_policy','valid_empty')
            assert source['completedGroups']==list(range(len(source['completedGroups'])))
            assert len(source['completedGroups'])==source['plannedGroups'] or source.get('stoppedAtSelectorLimit')
            folder=Path(source_path).parent
            query_files=list(folder.glob('query-*.json'))
            assert len(query_files)>=len(source['completedGroups'])
            for query_file in query_files:
                query=include(query_file);result=include(folder/('result-'+query['queryHash']+'.json'))
                assert hashlib.sha256(query['query'].encode()).hexdigest()==query['queryHash']==result['queryHash']
                assert result['status'] in ('complete_under_policy','valid_empty')
                assert query['city']['osmId']==source['city']['osmId']
                provenance=result.get('provenance',result)
                raw_file=provenance.get('rawResponseFile')
                if raw_file:
                    include(raw_file)
                    assert sha(raw_file)==provenance['rawResponseFileSha256'],'raw source response changed'

            include(folder/'canonical-wikidata.json')  # optional failure remains explicit, never an empty search

    prompt=directory/'combined-prompt.md';files.add(prompt);assert prompt.read_text().strip()
    stops=snapshot['checkpoint']['route']['stops']; ids=['tour-welcome']+[s['stopId'] for s in stops]
    assert len(ids)==len(set(ids)) and len(ids)>1
    assert [m['stopId'] for m in inputs['materials']]==ids[1:]
    # Use the production fingerprint/route/evidence decoder before issuing a receipt.
    validation=subprocess.run([str(NODE),'-r','ts-node/register/transpile-only','-e',
        "const fs=require('fs');require('./src/services/TourBlueprint').parseTourBlueprintSnapshot(JSON.parse(fs.readFileSync(process.argv[1],'utf8')))",str(preparation['blueprintFile'])],cwd=ROOT/'backend',capture_output=True,text=True)
    assert validation.returncode==0,'blueprint validation failed: '+validation.stderr[-600:]
    if stage in ('text','audio'):
        lock=include(directory/'text-inputs-lock.json');assert lock=={'inputsSha256':digest(inputs),'promptSha256':sha(prompt)},'text input binding changed'
        budget_path=directory/'editorial-budget.json'
        if budget_path.exists():
            budget=include(budget_path)
            assert budget['limitUsd']==.50
            assert sum(r.get('chargedUpperBoundUsd',r['reservedUsd']) for r in budget['requests'].values())<=.50+1e-12
        final=include(directory/'final/es.json');review=include(final['review']['artifactPath'])
        assert final['review']['artifactSha256']==sha(final['review']['artifactPath'])
        assert final['review']['status']==review['status']=='SUFFICIENT_IN_REVIEW_SCOPE'
        assert not review['pendingPieceIds'] and not review['issuesToFix']
        assert final['language']=='es' and final['masterSha256']==digest(final['pieces'])
        assert [p['pieceId'] for p in final['pieces']]==ids,'final route mismatch'
        sys.path.insert(0,str(Path(__file__).parent/'editorial_runtime'))
        import contracts as c
        import citations
        case=include(directory/'editorial/case.json');texts={p['pieceId']:p['text'] for p in final['pieces']}
        manual=directory/'editorial/manual-recovery-v1/review.json'
        candidates=[manual] if (directory/'editorial/manual-corrections.json').exists() else []
        candidates += [directory/f'editorial/cases/{directory.name}/{name}.json' for name in ('repair-reviewer-recovered','repair-reviewer','reviewer-recovered','reviewer')]
        assessed=None
        for candidate in candidates:
            if candidate.exists(): assessed=include(candidate);break
        assert assessed is not None,'missing substantive review'
        citations.normalize_response(assessed,case,texts)
        ok,errors=c.validate_review(assessed,case,texts);assert ok,'review contract: '+str(errors)
        assert not any(issue['kind']=='FACTUAL' or issue['severity']=='major' for row in assessed['pieces'] for issue in row['issues']),'pending factual/editorial issue'
    if stage=='audio':
        result=include(directory/'listening-result.json');master=include(directory/'master.json');audio=include(directory/'audio-input.json');locked=include(directory/'frozen.json')
        assert master['sourceMasterSha256']==final['masterSha256']
        assert master['blueprintFingerprint']==snapshot['fingerprint']
        assert locked=={'masterSha256':sha(directory/'master.json'),'inputSha256':sha(directory/'audio-input.json')}
        assert [p['id'] for p in master['pieces']]==ids
        for index,(p,f) in enumerate(zip(master['pieces'],final['pieces'])):
            assert p['text']==f['text'] if index else p['text'].endswith('\n\n'+f['text'])
        assert audio['stops']==[{'id':p['audioId'],'text':p['text']} for p in master['pieces']]
        assert include(directory/'tts-job/input.json')==audio
        progress=include(directory/'tts-job/progress.json')
        assert progress['phase']=='rendered' and progress['completedStops']==len(ids)
        assert [p['id'] for p in result['chapters']]==ids
        assert sha(result['audio'])==result['fileSha256'];files.add(Path(result['audio']))
        for chapter in result['chapters']:
            assert sha(chapter['audio'])==chapter['sha256'];files.add(Path(chapter['audio']))
        files.update(p.resolve() for p in (directory/'audio').iterdir() if p.is_file())
        if audio_check:
            checked=subprocess.run([str(PYTHON),str(ROOT/'pods/voxcpm-pod/scripts/render-tour.py'),
                '--input',str(directory/'tts-job/input.json'),'--output',str(directory/'audio'),
                '--progress',str(directory/'tts-job/progress.json'),'--resume','--prepare-only'],capture_output=True,text=True)
            assert checked.returncode==0,'audio provenance failed: '+checked.stderr[-600:]
            details=json.loads(checked.stdout.strip().splitlines()[-1]);assert details['completedStops']==details['totalStops']==len(ids) and details['quarantineFiles']==0
    result={'version':1,'stage':stage,'directory':str(directory),'destinationQid':destination['qid'],
            'humanApproved':False,'files':{str(p):sha(p) for p in sorted(files)}}
    target=directory/'receipts'/f'{stage}.json';target.parent.mkdir(exist_ok=True)
    temporary=target.with_suffix('.tmp');temporary.write_text(json.dumps(result,indent=2)+'\n');temporary.replace(target)
    return result

if __name__=='__main__':
    print(json.dumps(create(Path(sys.argv[1]),sys.argv[2])))
