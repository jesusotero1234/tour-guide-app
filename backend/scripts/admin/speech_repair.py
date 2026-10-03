#!/usr/bin/env python3
"""Repair the residues that utils.speech could not resolve deterministically (plan 02 section 6).

The LLM only rewrites the tokens marked with ⟦ ⟧, in the sentences that still fail the gate. A deterministic guard then
checks that every word and every mark of punctuation around those tokens is unchanged and that the sentence passes the
gate. After two failed attempts the piece becomes `needs_manual` and keeps its residue: nothing is ever guessed.

  speech_repair.py --lang es --in speech.json --out repaired.json --estimate        no network, prints the volume and the worst-case cost
  speech_repair.py --lang es --in speech.json --out repaired.json --execute         BILLABLE: needs DEEPSEEK_API_KEY and the user's authorisation

`speech.json` is the output of pods/voxcpm-pod/scripts/speech-normalize.py.
"""
import argparse
import hashlib
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

ADMIN = Path(__file__).resolve().parent
REPO = ADMIN.parents[2]
sys.path.insert(0, str(REPO / "pods/voxcpm-pod/src"))
from utils.speech import gate  # noqa: E402
from utils.speech.gate import sentence_spans  # noqa: E402

LANGUAGE_NAMES = {"es": "español", "en": "inglés", "fr": "francés", "de": "alemán", "it": "italiano"}
MARK_OPEN, MARK_CLOSE = "⟦", "⟧"
MAX_ATTEMPTS = 2

SYSTEM = (
    "Reescribe estas frases en {language} exactamente como debe leerlas en voz alta un guía. Cambia SOLO las expresiones "
    "marcadas entre ⟦ ⟧ (números, fechas, números romanos, abreviaturas o símbolos). Escribe todo en letras. No cambies "
    "ninguna otra palabra, ni el orden, ni la puntuación. Si un número romano forma parte del nombre de un rey o papa, "
    "usa la forma que se diría en {language}, con la declinación correcta. Si es un código o un nombre propio, léelo como "
    "se diría en voz alta. No devuelvas los signos ⟦ ⟧. Responde solo con JSON: "
    '{{"sentences": [{{"i": <índice recibido>, "spoken": "<frase completa>"}}]}}'
)


def mark_spans(sentence: str, violations, lang: Optional[str] = None) -> list:
    """Token-sized (start, end) spans of `sentence` that contain a violation, merged when they overlap.

    German writes ordinals with a dot ("Ludwig VII. baute"): the dot belongs to the numeral, so inside a sentence it is marked with it
    and the model may rewrite "VII." as "der Siebte" without breaking the guard. A dot that ends the sentence stays outside."""
    spans = []
    for v in violations:
        start, end = v.start, v.end
        while start > 0 and not sentence[start - 1].isspace():
            start -= 1
        while end < len(sentence) and not sentence[end].isspace():
            end += 1
        while start < end and sentence[start] in ".,;:!?()«»\"'“”‘’¿¡":
            start += 1
        while end > start and sentence[end - 1] in ".,;:!?()«»\"'“”‘’":
            end -= 1
        if lang == "de" and v.kind == "ROMAN" and sentence[end:end + 1] == "." and sentence[end + 1:].strip():
            end += 1
        if start < end:
            spans.append((start, end))
    merged = []
    for s, e in sorted(spans):
        if merged and s <= merged[-1][1]:
            merged[-1] = (merged[-1][0], max(merged[-1][1], e))
        else:
            merged.append((s, e))
    return merged


def marked(sentence: str, spans) -> str:
    out, last = [], 0
    for s, e in spans:
        out += [sentence[last:s], MARK_OPEN, sentence[s:e], MARK_CLOSE]
        last = e
    return "".join(out) + sentence[last:]


def guard(original: str, spans, repaired: str, lang: str) -> Optional[str]:
    """None when `repaired` only rewrites the marked tokens and passes the gate; otherwise the reason it was refused."""
    if not isinstance(repaired, str) or MARK_OPEN in repaired or MARK_CLOSE in repaired:
        return "the answer still contains ⟦ ⟧ marks or is not text"
    parts, last = [], 0
    for s, e in spans:
        parts.append(re.escape(original[last:s]))
        last = e
    tail = re.escape(original[last:])
    pattern = "^" + "(.+?)".join(parts + [tail]) + "$"
    m = re.match(pattern, repaired, re.DOTALL)
    if not m:
        return "words or punctuation outside the marked tokens changed"
    for group in m.groups():
        if not group.strip():
            return "a marked token was deleted instead of rewritten"
        if gate(group, lang):
            return "a rewritten token still has digits, Roman numerals, abbreviations or symbols"
    return None


def default_caller(stage_dir: Path):
    """The existing DeepSeek client: every attempt is persisted before it is interpreted and counts against the budget."""
    sys.path.insert(0, str(ADMIN / "editorial_runtime"))
    import client as q
    stage_dir.mkdir(parents=True, exist_ok=True)

    def call(system: str, data: dict, request_id: str, validator) -> Optional[dict]:
        # The client replays a saved answer for a request it has seen: the id carries a hash of what is asked, so a changed marking
        # (new rules, new lexicon) makes a new request instead of replaying an answer to the old one.
        request_id += "-" + hashlib.sha256(json.dumps([system, data], ensure_ascii=False, sort_keys=True).encode()).hexdigest()[:8]
        previous = q.BASE, q.LEDGER, q.MAX_ATTEMPTS
        # client.py stops after 5 physical attempts per base folder (it was written for one sandbox run): one folder per request keeps
        # that guard meaningful, and resumes a request from its own record.
        q.BASE, q.LEDGER, q.MAX_ATTEMPTS = str(stage_dir / "calls" / re.sub(r"[^A-Za-z0-9_.-]", "_", request_id)), str(stage_dir / "metrics/calls.jsonl"), 2
        try:
            payload = dict(model=q.MODEL, max_tokens=4096, stream=False, thinking={"type": "disabled"},
                           response_format={"type": "json_object"},
                           messages=[{"role": "system", "content": system}, {"role": "user", "content": json.dumps(data, ensure_ascii=False)}])
            result = q.call(payload, request_id, "speech-repair", request_id, q.sha_text(json.dumps(data, ensure_ascii=False, sort_keys=True)), validator)
        finally:
            q.BASE, q.LEDGER, q.MAX_ATTEMPTS = previous
        return result["parsed"] if result["validation"]["status"] == "OK" else None
    return call


def repair_piece(piece: dict, lang: str, call: Callable, request_prefix: str, model: str = "deepseek-v4-flash") -> dict:
    """Returns {"spokenText", "status": "ok"|"needs_manual"|"clean", "llmRepairs", "violations", "attempts", "reasons"}."""
    spoken = piece["spokenText"]
    violations = gate(spoken, lang)
    if not violations:
        return {"spokenText": spoken, "status": "clean", "llmRepairs": [], "violations": [], "attempts": 0, "reasons": []}
    spans_by_sentence = sentence_spans(spoken)
    per_sentence = {}
    for v in violations:
        per_sentence.setdefault(v.sentence_index, []).append(v)
    work = {}
    for index, found in per_sentence.items():
        start, end = spans_by_sentence[index]
        sentence = spoken[start:end]
        local = [type(v)(v.kind, v.match, v.start - start, v.end - start, 0) for v in found]
        work[index] = (sentence, mark_spans(sentence, local, lang))
    pending, repairs, reasons, attempts = dict(work), {}, [], 0
    system = SYSTEM.format(language=LANGUAGE_NAMES[lang])
    while pending and attempts < MAX_ATTEMPTS:
        attempts += 1
        request = {"language": LANGUAGE_NAMES[lang], "sentences": [{"i": i, "text": marked(s, sp)} for i, (s, sp) in sorted(pending.items())]}
        if reasons:
            request["previousAttemptFailed"] = reasons[-1]

        def validator(obj):
            rows = obj.get("sentences")
            ok = isinstance(rows, list) and all(isinstance(r, dict) and isinstance(r.get("i"), int) and isinstance(r.get("spoken"), str) for r in rows)
            return ok, [] if ok else ["expected {sentences: [{i, spoken}]}"]
        answer = call(system, request, f"{request_prefix}-a{attempts}", validator)
        failures = []
        returned = {r["i"]: r["spoken"] for r in (answer or {}).get("sentences", [])}
        for i, (sentence, spans) in sorted(pending.items()):
            if i not in returned:
                failures.append(f"sentence {i}: missing from the answer")
                continue
            why = guard(sentence, spans, returned[i], lang)
            if why:
                failures.append(f"sentence {i}: {why}")
            else:
                repairs[i] = {"before": sentence, "after": returned[i], "model": model, "at": datetime.now(timezone.utc).isoformat()}
                del pending[i]
        if failures:
            reasons.append("; ".join(failures))
    # Assemble the text with every accepted sentence replaced.
    out, last = [], 0
    for index in sorted(repairs):
        s, e = spans_by_sentence[index]
        out += [spoken[last:s], repairs[index]["after"]]
        last = e
    text = "".join(out) + spoken[last:]
    remaining = gate(text, lang)
    status = "ok" if not remaining and not pending else "needs_manual"
    return {"spokenText": text, "status": status, "llmRepairs": [repairs[i] for i in sorted(repairs)],
            "violations": [v.as_dict() for v in remaining], "attempts": attempts, "reasons": reasons}


def estimate(pieces: list, lang: str) -> dict:
    """Volume and worst-case cost at the peak DeepSeek rates of editorial_runtime/budget.py, with no network."""
    flagged = sentences = chars = 0
    for piece in pieces:
        violations = gate(piece["spokenText"], lang)
        if violations:
            flagged += 1
            spans = sentence_spans(piece["spokenText"])
            for i in {v.sentence_index for v in violations}:
                sentences += 1
                chars += spans[i][1] - spans[i][0]
    tokens_in = int(chars / 3.0) + flagged * 400 * MAX_ATTEMPTS
    tokens_out = int(chars / 3.0) * MAX_ATTEMPTS
    cost = (tokens_in * 0.30 + tokens_out * 1.20) / 1e6
    return {"pieces": len(pieces), "piecesWithResidue": flagged, "sentences": sentences, "approxInputTokens": tokens_in,
            "approxOutputTokens": tokens_out, "worstCaseUsd": round(cost, 4)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", required=True, choices=sorted(LANGUAGE_NAMES))
    parser.add_argument("--in", dest="source", required=True, type=Path)
    parser.add_argument("--out", type=Path)
    parser.add_argument("--stage", type=Path, help="folder for the persisted attempts and the budget ledger")
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--estimate", action="store_true")
    mode.add_argument("--execute", action="store_true", help="billable")
    args = parser.parse_args()
    data = json.loads(args.source.read_text(encoding="utf-8"))
    pieces = data["pieces"]
    if args.estimate:
        print(json.dumps(estimate(pieces, args.lang), indent=2))
        return 0
    if not (args.out and args.stage):
        parser.error("--execute needs --out and --stage")
    if not os.environ.get("DEEPSEEK_BUDGET_ROOT"):
        os.environ["DEEPSEEK_BUDGET_ROOT"] = str(args.stage / "budget")
    call = default_caller(args.stage)
    results = []
    for piece in pieces:
        outcome = repair_piece(piece, args.lang, call, f"{piece['pieceId']}")
        results.append({**piece, **outcome})
        print(f"{piece['pieceId']}: {outcome['status']} ({outcome['attempts']} attempts)", flush=True)
    args.out.write_text(json.dumps({**data, "pieces": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0 if all(r["status"] in ("ok", "clean") for r in results) else 1


if __name__ == "__main__":
    raise SystemExit(main())
