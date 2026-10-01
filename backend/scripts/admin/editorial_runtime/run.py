#!/usr/bin/env python3
"""Frozen text pilot: at most five DeepSeek calls and one repair."""
import argparse
import copy
import json
from pathlib import Path
import time

import client as q
import contracts as c
import prompts

BASE = Path(__file__).resolve().parent


def read(path):
    return json.loads((BASE / path).read_text())


def freeze_request(path, request):
    if (BASE / path).exists():
        c.require(read(path) == request, 'frozen request changed')
    else:
        q.write_json(path, request)


def prepare():
    for item in read('frozen/origins.json'):
        c.require(q.sha_file(item['path']) == item['sha256'], 'original input changed')
    paths = [p for p in (BASE / 'frozen').iterdir() if p.is_file()]
    paths += [BASE / name for name in ('run.py', 'client.py', 'contracts.py', 'prompts.py', 'PLAN.md', 'test_pilot.py')]
    protocol = dict(model=q.MODEL, reasoningEffort='low', maxOutputTokens=32768,
                    maxPhysicalCalls=5, maxAttemptsPerStage=1, maxRepairRounds=1,
                    audio=False, astraCalls=0, productionWrites=False,
                    lengthPolicy='informational; explicit route commitments retained separately',
                    quotePolicy='literal; whitespace/smart quotes; unique capitalization-only equivalent',
                    files={str(p.relative_to(BASE)): q.sha_file(p) for p in sorted(paths)})
    freeze_request('protocol.json', protocol)
    return protocol


def compose(case, current, obj, editable_ids):
    rows = obj.get('pieces') if isinstance(obj, dict) else None
    c.require(isinstance(rows, list) and all(isinstance(r, dict) for r in rows), 'pieces array required')
    ids = [r.get('pieceId') for r in rows]
    c.require(all(isinstance(pid, str) for pid in ids), 'piece IDs required')
    c.require(len(ids) == len(set(ids)), 'duplicate piece')
    known = [p['pieceId'] for p in case['pieces']]
    c.require(set(editable_ids) <= set(known), 'unknown editable piece')
    c.require(set(ids) <= set(known), 'unknown returned piece')
    c.require(set(editable_ids) <= set(ids), 'missing editable piece')
    mapping = {r['pieceId']: r for r in rows}
    for pid in set(ids) - set(editable_ids):
        c.require(isinstance(mapping[pid].get('text'), str) and
                  mapping[pid]['text'].strip() == current[pid].strip(), 'modified KEEP piece')
    filtered = {'pieces': [mapping[pid] for pid in editable_ids]}
    ok, errors = c.validate_editor(filtered, editable_ids)
    c.require(ok, '; '.join(errors))
    return {pid: mapping[pid]['text'].strip() if pid in editable_ids else current[pid] for pid in known}


def editor_validator(case, current, editable_ids):
    def validate(obj):
        try:
            compose(case, current, obj, editable_ids)
            return True, []
        except (ValueError, TypeError, KeyError) as exc:
            return False, [str(exc)]
    return validate


def selection(case, texts, review):
    fixes, optional = [], []
    for row in review['pieces']:
        for issue in row['issues']:
            target = fixes if issue['kind'] == 'FACTUAL' or issue['severity'] == 'major' else optional
            target.append(dict(pieceId=row['pieceId'], **issue))
    lengths = [dict(pieceId=p['pieceId'], beforeWords=len(p['text'].split()),
                    candidateWords=len(texts[p['pieceId']].split()), targetWords=p['targetWords'])
               for p in case['pieces']]
    before = sum(p['beforeWords'] for p in lengths)
    after = sum(p['candidateWords'] for p in lengths)
    affected = {issue['pieceId'] for issue in fixes}
    return dict(status='CORRECTION_REQUIRED' if fixes else 'SUFFICIENT_IN_REVIEW_SCOPE',
                pendingPieceIds=[p['pieceId'] for p in case['pieces'] if p['pieceId'] in affected],
                issuesToFix=fixes, minorEditorialIssues=optional,
                worsePieces=[r['pieceId'] for r in review['pieces'] if r['verdict'] == 'WORSE'],
                lostUsefulDetails=[dict(pieceId=r['pieceId'], **d) for r in review['pieces'] for d in r['lostUsefulDetails']],
                length=dict(pieces=lengths, beforeWords=before, candidateWords=after,
                            targetWords=case['targetWords'], deltaWords=after-before,
                            deltaPercent=round((after/before-1)*100, 2) if before else None,
                            actsAsVeto=False),
                durationCommitment=case.get('durationCommitment'), actualDurationValidated=False,
                publicationApproved=False, semanticJudgeIsNotGroundTruth=True)


def repair_needed(decision, completed_repairs):
    return decision['status'] == 'CORRECTION_REQUIRED' and completed_repairs == 0


def render(case, texts):
    return '# ' + case['city'] + '\n\n' + '\n\n'.join(
        '## ' + p['name'] + '\n\n' + texts[p['pieceId']] for p in case['pieces']) + '\n'


def save_texts(city, name, case, texts):
    q.write_json(f'cases/{city}/{name}.json', texts)
    q.write(f'cases/{city}/{name}.md', render(case, texts))


def invoke(city, stage, system, data, validator):
    payload = dict(model=q.MODEL, thinking={'type': 'enabled'}, reasoning_effort='low',
                   max_tokens=32768, stream=False, messages=[
                       {'role': 'system', 'content': system},
                       {'role': 'user', 'content': json.dumps(data, ensure_ascii=False)}])
    rid = f'{city}-{stage}'
    freeze_request(f'requests/{rid}.json', payload)
    print(f'{rid}: start', flush=True)
    result = q.call(payload, rid, stage, city, q.sha_text(json.dumps(data, ensure_ascii=False, sort_keys=True)), validator)
    q.write_json(f'cases/{city}/{stage}-raw.json', result)
    print(f'{rid}: {result["validation"]}', flush=True)
    if result['validation']['status'] != 'OK':
        return None
    q.write_json(f'cases/{city}/{stage}.json', result['parsed'])
    return result['parsed']


def review_texts(city, stage, case, texts):
    context = copy.deepcopy(case)
    for piece in context['pieces']:
        piece['candidateParagraphs'] = c.paragraphs(texts[piece['pieceId']])
    return invoke(city, stage, prompts.REVIEWER, {'tour': context},
                  lambda obj: c.validate_review(obj, case, texts))


def sevilla():
    city = 'sevilla'
    case = read('frozen/sevilla.json')
    texts = {p['pieceId']: p['text'] for p in case['pieces']}
    save_texts(city, 'before', case, texts)
    summary = dict(city=city, completedRepairs=0, publicationApproved=False)

    def finish(status, failed_stage=None, decision=None):
        summary.update(status=status, failedStage=failed_stage, selection=decision)
        if decision is not None:
            save_texts(city, 'selected', case, texts)
        q.write_json(f'cases/{city}/summary.json', summary)
        return summary

    teacher = invoke(city, 'teacher', prompts.TEACHER,
                     {'tour': case, 'styleExample': read('frozen/style-example.json')},
                     lambda obj: c.validate_teacher(obj, case))
    if teacher is None:
        return finish('INCOMPLETE', 'teacher')
    editable = [p['pieceId'] for p in teacher['pieces'] if p['decision'] != 'KEEP']
    summary['initialEditablePieceIds'] = editable
    if editable:
        edited = invoke(city, 'editor', prompts.EDITOR,
                        {'tour': case, 'teacherBriefs': teacher, 'editablePieceIds': editable,
                         'styleExample': read('frozen/style-example.json')},
                        editor_validator(case, texts, editable))
        if edited is None:
            return finish('INCOMPLETE', 'editor')
        texts = compose(case, texts, edited, editable)
    save_texts(city, 'candidate', case, texts)
    review = review_texts(city, 'reviewer', case, texts)
    if review is None:
        return finish('INCOMPLETE', 'reviewer')
    decision = selection(case, texts, review)
    q.write_json(f'cases/{city}/initial-selection.json', decision)
    if repair_needed(decision, summary['completedRepairs']):
        summary['completedRepairs'] = 1
        editable = decision['pendingPieceIds']
        repaired = invoke(city, 'repair', prompts.REPAIR,
                          {'tour': case, 'currentTexts': texts, 'editablePieceIds': editable,
                           'issuesToFix': decision['issuesToFix']}, editor_validator(case, texts, editable))
        if repaired is None:
            return finish('INCOMPLETE', 'repair', decision)
        proposed = compose(case, texts, repaired, editable)
        save_texts(city, 'repaired', case, proposed)
        final_review = review_texts(city, 'repair-reviewer', case, proposed)
        if final_review is None:
            return finish('INCOMPLETE', 'repair-reviewer', decision)
        texts = proposed
        decision = selection(case, texts, final_review)
    return finish(decision['status'], decision=decision)


def execute():
    start = time.perf_counter()
    prepare()
    results = []
    for flow in (sevilla,):
        results.append(flow())
    ledger = BASE / 'metrics/calls.jsonl'
    calls = [json.loads(line) for line in ledger.read_text().splitlines()] if ledger.exists() else []
    c.require(len(calls) <= 5, 'five-call editorial budget exceeded')
    summary = dict(cases=results, physicalCalls=len(calls),
                   truncatedCalls=sum(r.get('finishReason') == 'length' for r in calls),
                   summedApiSeconds=sum(r.get('durationMs', 0) for r in calls)/1000,
                   promptTokens=sum(r.get('promptTokens') or 0 for r in calls),
                   completionTokens=sum(r.get('completionTokens') or 0 for r in calls),
                   reasoningTokens=sum(r.get('reasoningTokens') or 0 for r in calls),
                   invocationWallSeconds=round(time.perf_counter()-start, 3),
                   audioGenerated=False, astraApiCalls=0, manualNarrativeEdits=0)
    q.write_json('summary.json', summary)
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    return summary


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--execute', action='store_true')
    args = parser.parse_args()
    if args.execute:
        result = execute()
        raise SystemExit(1 if any(c['status'] == 'INCOMPLETE' for c in result['cases']) else 0)
    else:
        prepare()
        print('Prepared; no API calls. Use --execute to run.')
