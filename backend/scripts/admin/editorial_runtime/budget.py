"""One durable exposure ceiling for every editorial request in a city."""
import fcntl
import hashlib
import json
from pathlib import Path
from contextlib import contextmanager
from datetime import datetime, timezone

PRICING = {'source':'https://api-docs.deepseek.com/quick_start/pricing/',
    'verifiedAt':'2026-09-20','models':['deepseek-v4-flash','deepseek-flash'],
    'inputMissPerMillionUsd':0.30,'inputHitPerMillionUsd':0.006,'outputPerMillionUsd':1.20,
    'accounting':'peak-rate upper bound; actual off-peak invoice may be lower',
    'offPeak':{'inputMiss':0.15,'inputHit':0.003,'output':0.60}}
LIMIT = 0.50

class BudgetError(ValueError): pass

def atomic(path,obj):
    temporary=path.with_suffix('.tmp');temporary.write_text(json.dumps(obj,ensure_ascii=False,indent=2)+'\n');temporary.replace(path)

@contextmanager
def locked(root):
    root=Path(root);root.mkdir(parents=True,exist_ok=True)
    with (root/'editorial-budget.lock').open('a+') as lock:
        fcntl.flock(lock,fcntl.LOCK_EX)
        path=root/'editorial-budget.json'
        if path.exists():
            state=json.loads(path.read_text())
            if state.get('limitUsd') != LIMIT or state.get('pricing') != PRICING: raise BudgetError('budget configuration changed')
        else:
            history=[]
            for p in sorted(root.rglob('*.attempt-*.json')):
                record=json.loads(p.read_text());history.append({'path':str(p.relative_to(root)),
                  'sha256':hashlib.sha256(p.read_bytes()).hexdigest(),'entry':record.get('entry'),
                  'usage':(record.get('body') or {}).get('usage'), 'historicalPriceVerified':False})
            state={'version':1,'limitUsd':LIMIT,'pricing':PRICING,'createdAt':datetime.now(timezone.utc).isoformat(),
                   'historicalAttempts':history,'requests':{}}
        yield state
        atomic(path,state)

def reserve(root,path,payload):
    if payload.get('model') not in PRICING['models']: raise BudgetError('unknown model price')
    if not isinstance(payload.get('max_tokens'),int) or payload['max_tokens'] <= 0: raise BudgetError('unbounded output')
    # Every UTF-8 byte can be a token; reserve framing overhead as well. No cache discount assumed.
    input_bound=len(json.dumps(payload['messages'],ensure_ascii=False).encode())+4096
    maximum=(input_bound*PRICING['inputMissPerMillionUsd']+payload['max_tokens']*PRICING['outputPerMillionUsd'])/1e6
    key=str(Path(path).resolve());identity=hashlib.sha256(json.dumps(payload,sort_keys=True).encode()).hexdigest()
    with locked(root) as state:
        requests=state['requests']
        if key in requests: raise BudgetError('request already reserved; inspect cached or uncertain attempt')
        exposure=sum(r.get('chargedUpperBoundUsd',r['reservedUsd']) for r in requests.values())
        if exposure+maximum > LIMIT+1e-12: raise BudgetError(f'editorial exposure {exposure:.6f} + reserve {maximum:.6f} exceeds {LIMIT:.2f} USD')
        requests[key]={'payloadSha256':identity,'reservedUsd':maximum,'inputTokenUpperBound':input_bound,
                       'maxOutputTokens':payload['max_tokens'],'status':'reserved'}
    return key

def settle(root,key,record):
    usage=(record.get('body') or {}).get('usage') or {}
    with locked(root) as state:
        row=state['requests'][key]
        if all(isinstance(usage.get(k),int) and usage[k]>=0 for k in ('prompt_tokens','completion_tokens')):
            amount=(usage['prompt_tokens']*PRICING['inputMissPerMillionUsd']+usage['completion_tokens']*PRICING['outputPerMillionUsd'])/1e6
            row.update(status='accounted',usage=usage,chargedUpperBoundUsd=amount)
            if amount > row['reservedUsd']+1e-12: row['overReservation']=True
        else: row.update(status='uncertain',providerStatus=record['entry']['status'])
