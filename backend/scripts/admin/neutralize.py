#!/usr/bin/env python3
"""Makes a published stop (or introduction) independent of the order of the visit (plan 03 section 6).

The LLM only returns EDITS (`before` -> `after`), never the whole text. A deterministic guard applies them and checks that
nothing else moved, that no reference to the order is left (utils: editorial_runtime/order_neutral.py) and that the piece
did not lose its substance. After two refused attempts the piece is `needs_manual`: its tour is not regenerated and keeps
its current content and fixed order.

  neutralize.py --lang es --in tour.json --estimate          volume and worst-case cost, no network
  neutralize.py --lang es --in tour.json --out neutral.json --stage DIR --execute      BILLABLE (DeepSeek)

tour.json: {"pieces": [{"pieceId", "kind": "introduction"|"stop", "name", "text"}]} in the published order.
"""
import argparse
import json
import os
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
from typing import Callable, Optional

ADMIN = Path(__file__).resolve().parent
sys.path.insert(0, str(ADMIN / "editorial_runtime"))
import order_neutral as on  # noqa: E402

LANGUAGE_NAMES = {"es": "español", "en": "inglés", "fr": "francés", "de": "alemán", "it": "italiano"}
MAX_ATTEMPTS = 3
# NEUTRALIZE_STRICT_NEXT_NAME=1 turns off the last-attempt leniency below: a stop that still names its successor is refused, and the model is
# told to rewrite that sentence without the name. It is for the re-run of the few pieces that were accepted with a flagged mention.
STRICT_NEXT_NAME = os.environ.get("NEUTRALIZE_STRICT_NEXT_NAME") == "1"

SYSTEM = (
    "Este texto es una parada de un paseo con audio. A partir de ahora las paradas pueden escucharse en cualquier orden. "
    "Devuelve SOLO las ediciones mínimas para que el texto no dependa del orden: elimina la frase que anuncia la siguiente "
    "parada; elimina o reformula las referencias a la parada anterior o posterior, los cierres del recorrido y, en la "
    "introducción, la indicación de por dónde se empieza o el orden de visita. Conserva todo lo demás palabra por palabra. "
    "Si una frase mezcla contenido valioso con el anuncio, reformúlala conservando el contenido. El texto está en {language}: "
    'toda sustitución va en {language}. Formato JSON: {{"edits":[{{"before":"<fragmento literal del original>",'
    '"after":"<sustitución, puede ser vacía>","reason":"NEXT_STOP|PREVIOUS_STOP|FINISH|START"}}]}}. '
    "Cada `before` debe aparecer exactamente una vez en el texto. Si no hay nada que cambiar, devuelve {{\"edits\":[]}}."
)


def _paragraphs(text: str) -> list:
    return [p.strip() for p in re.split(r"\n\s*\n", text) if p.strip()]


def _sentences(text: str) -> list:
    return [text[s:e].strip() for s, e in on.sentences(text) if text[s:e].strip()]


def apply_edits(original: str, edits: list):
    """(body, errors). Every `before` must occur exactly once in the original and the edits must not overlap."""
    errors, spans = [], []
    for i, edit in enumerate(edits):
        before = edit.get("before") if isinstance(edit, dict) else None
        after = edit.get("after") if isinstance(edit, dict) else None
        if not isinstance(before, str) or not before or not isinstance(after, str):
            errors.append(f"edit {i}: before must be a non-empty string and after a string")
            continue
        count = original.count(before)
        if count == 0:
            # The model often joins lines or changes the spacing of a fragment it quotes: find it ignoring the kind and amount of whitespace.
            pattern = re.compile(r"\s+".join(re.escape(word) for word in before.split()))
            found = list(pattern.finditer(original)) if before.split() else []
            if len(found) == 1:
                spans.append((found[0].start(), found[0].end(), after))
                continue
        if count != 1:
            errors.append(f"edit {i}: `before` occurs {count} times in the original (must be exactly once)")
            continue
        start = original.index(before)
        spans.append((start, start + len(before), after))
    spans.sort()
    for (s1, e1, _), (s2, e2, _) in zip(spans, spans[1:]):
        if s2 < e1:
            errors.append("edits overlap")
    if errors:
        return None, errors
    out, last = [], 0
    for start, end, after in spans:
        out += [original[last:start], after]
        last = end
    body = "".join(out) + original[last:]
    body = re.sub(r"[ \t]+", " ", body)
    body = re.sub(r" +([,.])", r"\1", body)             # not before : ; ! ?  French puts a space there
    body = re.sub(r"\n[ \t]+", "\n", body)
    return "\n\n".join(_paragraphs(body)), []


def guard(original: str, edits: list, lang: str, role: str, stop_names: Optional[list] = None, next_name: Optional[str] = None):
    """(body, errors). Every check of plan 03 section 6.3."""
    body, errors, _ = guard_detail(original, edits, lang, role, stop_names, next_name)
    return body, errors


def guard_detail(original: str, edits: list, lang: str, role: str, stop_names: Optional[list] = None, next_name: Optional[str] = None,
                 lenient_next_name: bool = False):
    """(body, errors, soft). With `lenient_next_name` (the last attempt), a stop whose only remaining finding is the bare name of the next
    stop in its last sentence is accepted and the finding is reported in `soft`: the detector cannot tell a mention of a neighbour as
    content from an announcement, and excluding the whole tour for it is worse than a flagged sentence for the reviewer."""
    body, errors = apply_edits(original, edits)
    if errors:
        return None, errors, []
    changed = sum(len(e["before"]) for e in edits)
    # An introduction often IS an itinerary ("Empezamos en A. Seguiremos por B. Después C..."): making it independent of the order means
    # rewriting most of its sentences, so its limits are different and the guard checks instead that every stop it named is still named.
    intro = role == "introduction"
    limit = len(original) if intro else max(400, int(0.15 * len(original)))      # an introduction may be rewritten whole
    if changed > limit:
        errors.append(f"{changed} characters were removed or changed; the limit for this text is {limit}")
    remaining = on.find_order_references(body, lang, stop_names=stop_names, role=role, next_name=next_name)
    soft = []
    if lenient_next_name and role == "stop" and next_name:
        soft = [f for f in remaining if f["kind"] == "NEXT_STOP" and f["match"].strip().lower() == next_name.strip().lower()]
        remaining = [f for f in remaining if f not in soft]
    if remaining:
        sentence_spans = on.sentences(body)

        def where(f):    # the model needs the sentence that still gives it away, not only the word the detector matched
            index = f.get("sentence_index")
            if isinstance(index, int) and 0 <= index < len(sentence_spans):
                start, end = sentence_spans[index]
                return f" in the sentence «{body[start:end].strip()[:300]}»"
            return ""
        errors.append("references to the order are still present: " + "; ".join(f"{f['kind']} «{f['match']}»{where(f)}" for f in remaining[:4]))
    before_sentences, after_sentences = _sentences(original), set(_sentences(body))
    if intro:
        def only_announcement(name):          # a short sentence that only announces the stop (< 45 characters) may be deleted whole
            hits = [e for e in edits if re.search(re.escape(name), e["before"], re.IGNORECASE)]
            return bool(hits) and all(e["after"] == "" and len(e["before"]) < 45 for e in hits)
        named = [n for n in (stop_names or []) if n and re.search(re.escape(n), original, re.IGNORECASE)]
        lost = [n for n in named if not re.search(re.escape(n), body, re.IGNORECASE) and not only_announcement(n)]
        if len(lost) > max(1, int(0.2 * len(named))):         # a teaser may shorten one name (the cathedral becomes "the cathedral"), not drop stops
            errors.append("the rewritten introduction no longer names: " + "; ".join(lost[:4]))
        if len(body) < 0.55 * len(original):
            errors.append("the rewritten introduction lost too much of its content")
        before_sentences = []                        # the sentence-retention rule below does not apply to an itinerary
    kept = sum(1 for s in before_sentences if s in after_sentences)
    # At least 85% of the sentences must survive untouched. A stop has ~25 sentences, so that allows three to change; for
    # very short texts the percentage would forbid even the one sentence that announces the next stop, so two are always allowed.
    allowed_changes = max(2, int(0.15 * len(before_sentences)))
    if before_sentences and kept < len(before_sentences) - allowed_changes:
        errors.append(f"only {kept} of {len(before_sentences)} sentences were kept intact (at most {allowed_changes} may change)")
    paragraphs = _paragraphs(body)
    if not paragraphs or len(paragraphs[-1]) < 40:
        errors.append("the text is empty or its last paragraph has no content left")
    return (body if not errors else None), errors, soft


def neutralize_piece(piece: dict, lang: str, role: str, call: Callable, request_id: str, *, place_name: str = "",
                     other_stops: Optional[list] = None, next_name: Optional[str] = None, model: str = "deepseek-v4-flash") -> dict:
    text = piece["text"]
    findings = on.find_order_references(text, lang, stop_names=other_stops, role=role, next_name=next_name)
    record = {"pieceId": piece["pieceId"], "role": role, "original": text, "body": text, "edits": [], "findingsBefore": findings,
              "status": "ok", "model": model, "attempts": 0}
    if not findings:
        return record
    system = SYSTEM.format(language=LANGUAGE_NAMES[lang])
    if role == "introduction":
        system += (" En la introducción, si un itinerario enumera las paradas con «empezamos, seguiremos, después, luego, terminaremos», "
                   "reescribe CADA frase del itinerario entera, como una frase completa y autónoma que presente el lugar y lo que lo hace "
                   "especial, conservando su nombre y su contenido. Cada `before` debe ser la frase completa, no solo la fórmula de orden.")
    if STRICT_NEXT_NAME and role == "stop":
        system += (" Si la última frase nombra la siguiente parada aunque sea como dato, reescribe esa frase SIN ese nombre: usa una expresión "
                   "genérica («otro monumento de la ciudad», «el puente») o quita solo esa cláusula. No añadas ningún dato nuevo.")
    reasons = []
    for attempt in range(1, MAX_ATTEMPTS + 1):
        request = {"language": lang, "role": role, "placeName": place_name, "otherStops": other_stops or [], "findings": findings, "text": text}
        if reasons:
            request["previousAttemptFailed"] = reasons[-1]
        record["attempts"] = attempt

        def validator(obj):
            ok = isinstance(obj.get("edits"), list) and all(isinstance(e, dict) for e in obj["edits"])
            return ok, [] if ok else ["expected {edits: [...]}"]
        answer = call(system, request, f"{request_id}-a{attempt}", validator)
        if answer is None:
            reasons.append("no valid answer from the model")
            continue
        body, errors, soft = guard_detail(text, answer["edits"], lang, role, other_stops, next_name, lenient_next_name=(attempt == MAX_ATTEMPTS and not STRICT_NEXT_NAME))
        if not errors:
            record.update(body=body, edits=answer["edits"], status="ok", reasons=reasons, softFindings=soft)
            return record
        reasons.append("; ".join(errors))
    record.update(status="needs_manual", reasons=reasons)
    return record


def neutralize_tour(tour: dict, lang: str, call: Callable, request_prefix: str) -> dict:
    """Roles and neighbours come from the published order: the last stop closes the walk, each stop is told its successor."""
    pieces = tour["pieces"]
    stops = [p for p in pieces if p.get("kind") == "stop"]
    names = [p["name"] for p in stops]
    results = []
    for piece in pieces:
        if piece.get("kind") == "introduction":
            role, nxt, others = "introduction", None, names
            name = ""
        else:
            i = stops.index(piece)
            role = "last_stop" if i == len(stops) - 1 else "stop"
            nxt = stops[i + 1]["name"] if i + 1 < len(stops) else None
            others, name = [n for n in names if n != piece["name"]], piece["name"]
        results.append(neutralize_piece(piece, lang, role, call, f"{request_prefix}-{piece['pieceId']}", place_name=name, other_stops=others, next_name=nxt))
    return {"language": lang, "pieces": results, "excluded": any(r["status"] == "needs_manual" for r in results)}


def estimate(tours: list, lang: str) -> dict:
    pieces = requests = chars = 0
    for tour in tours:
        stops = [p for p in tour["pieces"] if p.get("kind") == "stop"]
        for piece in tour["pieces"]:
            pieces += 1
            if piece.get("kind") == "introduction":
                role, nxt = "introduction", None
            else:
                i = stops.index(piece)
                role, nxt = ("last_stop", None) if i == len(stops) - 1 else ("stop", stops[i + 1]["name"])
            if on.find_order_references(piece["text"], lang, role=role, next_name=nxt):
                requests += 1
                chars += len(piece["text"])
    tokens_in = int(chars / 3.0) + requests * 450 * MAX_ATTEMPTS
    tokens_out = requests * 250 * MAX_ATTEMPTS
    return {"pieces": pieces, "requests": requests, "approxInputTokens": tokens_in, "approxOutputTokens": tokens_out,
            "worstCaseUsd": round((tokens_in * 0.30 + tokens_out * 1.20) / 1e6, 3)}


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", required=True, choices=sorted(LANGUAGE_NAMES))
    parser.add_argument("--in", dest="source", required=True, type=Path, help="JSON with one tour, or {\"tours\": [...]}")
    parser.add_argument("--out", type=Path)
    parser.add_argument("--stage", type=Path)
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--estimate", action="store_true")
    mode.add_argument("--execute", action="store_true", help="billable")
    args = parser.parse_args()
    data = json.loads(args.source.read_text(encoding="utf-8"))
    tours = data["tours"] if "tours" in data else [data]
    if args.estimate:
        print(json.dumps(estimate(tours, args.lang), indent=2))
        return 0
    if not (args.out and args.stage):
        parser.error("--execute needs --out and --stage")
    os.environ.setdefault("DEEPSEEK_BUDGET_ROOT", str(args.stage / "budget"))
    import speech_repair
    call = speech_repair.default_caller(args.stage)
    results = [neutralize_tour(tour, args.lang, call, tour.get("tourId", f"tour{i}")) for i, tour in enumerate(tours)]
    args.out.write_text(json.dumps({"generatedAt": datetime.now(timezone.utc).isoformat(), "tours": results}, ensure_ascii=False, indent=1), encoding="utf-8")
    return 1 if any(r["excluded"] for r in results) else 0


if __name__ == "__main__":
    raise SystemExit(main())
