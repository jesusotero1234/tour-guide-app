#!/usr/bin/env python3
"""Bounded teacher -> editor -> reviewer experiment; no production writes."""
import argparse
import concurrent.futures
import copy
import json
import pathlib
import threading
import time

import client as q

BASE = pathlib.Path(__file__).resolve().parent
CASES = ('sevilla', 'malaga')
EFFORTS = ('low', 'max')
LEDGER_LOCK = threading.Lock()
ORIGINAL_LEDGER = q.ledger


def locked_ledger(entry):
    with LEDGER_LOCK:
        ORIGINAL_LEDGER(entry)


q.ledger = locked_ledger


def read(path):
    return json.loads((BASE / path).read_text())


def freeze_request(path, request):
    target = BASE / path
    if target.exists():
        require(read(path) == request, "frozen request changed")
    else:
        q.write_json(path, request)


def require(ok, message):
    if not ok:
        raise ValueError(message)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def paragraphs(text):
    return [{'paragraphId': f'p{i:02d}', 'text': p}
            for i, p in enumerate(text.strip().split('\n\n'), 1) if p.strip()]


def piece_rows(obj, ids):
    require(isinstance(obj, dict) and isinstance(obj.get('pieces'), list), 'pieces array required')
    rows = obj['pieces']
    require(all(isinstance(r, dict) for r in rows), 'pieces must be objects')
    require([r.get('pieceId') for r in rows] == ids, 'missing, duplicate, unknown or out-of-order piece')
    return rows


def canonical_quote(quote, source):
    from citations import resolve
    # A previously normalized raw span can contain Markdown delimiters.
    if isinstance(quote, str) and len(quote.strip()) >= 4 and source.count(quote) == 1:
        return quote
    return resolve(quote, source)['after']


def anchor(item, pars):
    require(isinstance(item, dict), 'anchor must be object')
    mapping = {p['paragraphId']: p['text'] for p in pars}
    require(item.get('paragraphId') in mapping, 'unknown paragraph ID')
    quote = item.get('quote')
    canonical_quote(quote, mapping[item['paragraphId']])


def evidence(items, piece):
    require(isinstance(items, list), 'evidence array required')
    mapping = {p['passageId']: p['quote'] for p in piece['evidence']['passages']}
    for item in items:
        require(isinstance(item, dict) and item.get('passageId') in mapping, 'unknown evidence ID')
        quote = item.get('quote')
        canonical_quote(quote, mapping[item['passageId']])


def validated(check):
    def wrapper(*args):
        try:
            check(*args)
            return True, []
        except (ValueError, TypeError, KeyError, AttributeError) as exc:
            return False, [str(exc)]
    return wrapper


@validated
def validate_teacher(obj, case):
    for row, piece in zip(piece_rows(obj, [p['pieceId'] for p in case['pieces']]), case['pieces']):
        require(row.get('decision') in ('KEEP', 'ADJUST', 'RESTRUCTURE'), 'invalid decision')
        require(nonempty(row.get('memory')), 'memory required')
        protected = row.get('protect')
        changes = row.get('changes')
        concerns = row.get('factualConcerns')
        require(isinstance(protected, list) and 1 <= len(protected) <= 5, 'one to five protected details required')
        require(isinstance(changes, list) and len(changes) <= 3, 'zero to three changes required')
        require(isinstance(concerns, list), 'factualConcerns array required')
        require((row['decision'] == 'KEEP') == (len(changes) == 0), 'decision and changes disagree')
        for item in protected:
            anchor(item, piece['paragraphs'])
            require(nonempty(item.get('why')), 'protected detail needs reason')
        for item in changes:
            anchor(item, piece['paragraphs'])
            require(all(nonempty(item.get(k)) for k in ('why', 'action', 'acceptance')), 'incomplete change')
        for item in concerns:
            anchor(item, piece['paragraphs'])
            require(nonempty(item.get('problem')), 'factual concern needs explanation')
            evidence(item.get('evidence'), piece)


@validated
def validate_editor(obj, editable_ids):
    for row in piece_rows(obj, editable_ids):
        require(nonempty(row.get('text')) and '<<<' not in row['text'], 'invalid narrative text')


@validated
def validate_review(obj, case, texts):
    for row, piece in zip(piece_rows(obj, [p['pieceId'] for p in case['pieces']]), case['pieces']):
        current = paragraphs(texts[piece['pieceId']])
        require(row.get('coveredParagraphIds') == [p['paragraphId'] for p in current], 'incomplete paragraph coverage')
        require(row.get('verdict') in ('IMPROVED', 'SIMILAR', 'WORSE'), 'invalid review verdict')
        require(nonempty(row.get('reason')), 'review reason required')
        require(isinstance(row.get('issues'), list), 'issues array required')
        require(isinstance(row.get('lostUsefulDetails'), list), 'lostUsefulDetails array required')
        unchanged = texts[piece['pieceId']] == piece['text']
        require(not unchanged or row['verdict'] == 'SIMILAR', 'unchanged text must be SIMILAR')
        for issue in row['issues']:
            anchor(issue, current)
            require(issue.get('kind') in ('FACTUAL', 'EDITORIAL'), 'invalid issue kind')
            require(issue.get('severity') in ('minor', 'major'), 'invalid severity')
            require(issue.get('origin') in ('NEW', 'INHERITED'), 'invalid issue origin')
            require(not unchanged or issue['origin'] == 'INHERITED', 'unchanged text cannot create new issue')
            require(nonempty(issue.get('explanation')), 'issue needs explanation')
            evidence(issue.get('evidence'), piece)
        for detail in row['lostUsefulDetails']:
            anchor(detail, piece['paragraphs'])
            require(nonempty(detail.get('explanation')), 'lost detail needs explanation')

