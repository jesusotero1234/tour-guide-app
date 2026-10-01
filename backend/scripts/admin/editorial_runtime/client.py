#!/usr/bin/env python3
"""MAX-3 quality review sandbox runner.

Stages: freeze, evidence, tests, audit-raw, decisions, patches, audit-final,
closure, viewer, tts, report, zip.
Only DeepSeek is called; the frozen MAX-3 tour is never regenerated.
"""
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

BASE = os.path.dirname(os.path.abspath(__file__))
REPO = "/home/jesusotero/coding/tour-guide-app"
TRIAL = os.path.join(REPO, "backend/tmp/astra-replacement-sandbox/reasoning-trial-20260911T202314Z")
CHECKS = os.path.join(REPO, "backend/tmp/astra-replacement-sandbox/checks-fix-human-review-20260911T211230Z")
MAX3 = os.path.join(TRIAL, "outputs/MAX-3.md")
PROMPT = os.path.join(TRIAL, "frozen/combined-author-prompt.md")
RESP = os.path.join(TRIAL, "responses/MAX-3.json")
REQ = os.path.join(TRIAL, "requests/MAX-3.json")
PREREG = os.path.join(TRIAL, "PREREGISTRATION.json")
AMEND = os.path.join(TRIAL, "AMENDMENT-1.json")
HASH_MAX3 = "e00a640148a6786707241f7e7b5a6879a9f83b8b7b057e778dbb4e2b3fbb8dbe"
HASH_PROMPT = "92a1dc4905eb5a105a0a2301c3510dc882e5a5efe135169d8380713146b84c08"
MODEL = "deepseek-v4-flash"
API = "https://api.deepseek.com/v1/chat/completions"
MAX_ATTEMPTS = 1
LEDGER = os.path.join(BASE, "metrics/calls.jsonl")
AUDIT_SYSTEM = """Eres revisor de contenido y experiencia presencial de una audioguía.
Tu tarea es comprobar afirmaciones contra la evidencia entregada,
no evaluar al autor ni maximizar el número de objeciones.

Revisa todos los párrafos. Dentro de cada uno, separa afirmaciones
comprobables cuando una parte pueda estar respaldada y otra no.
Conserva el sujeto, acción, fecha, cantidad, alcance, causalidad,
modalidad, lugar y grado de certeza exactos de lo que afirma el guion.

Un ID válido no demuestra soporte. Cita un fragmento literal y explica
brevemente qué parte respalda. Si no alcanza, indícalo.
No completes con conocimiento propio. No conviertas ausencia en falsedad.
Una pregunta o metáfora puede contener una premisa factual: compruébala.
Una leyenda documentada y presentada como leyenda no es un error por
no estar probada como acontecimiento histórico.

No propongas reescribir por gusto. Identifica problemas concretos y
su relevancia para el oyente. No supongas una posición GPS, acceso,
visibilidad interior, horarios o condiciones actuales no acreditadas.
No escribas un nuevo guion.

Devuelve JSON conforme al schema entregado, con todas las unidades
solicitadas, incluso las que no contienen errores."""
EDIT_SYSTEM = """Eres editor de una audioguía en español. Corrige únicamente los problemas
identificados y justificables.

Mantén la voz cercana, las preguntas que funcionan, la riqueza histórica,
los detalles memorables y las leyendas respaldadas como leyendas.

No elimines todo lo dudoso por comodidad; primero utiliza la comprobación
adjunta. Tampoco conserves una afirmación sin soporte porque sea atractiva.
No añadas nuevos episodios, hechos, motivaciones o conocimiento externo.
No sustituyas la pieza por un resumen genérico ni por una imitación de Astra.
No rellenes para alcanzar una cuota y no recortes datos solo porque sean datos.

Los párrafos no afectados deben permanecer idénticos.
Devuelve solo operaciones de parche ligadas a issue IDs existentes,
con texto original exacto, reemplazo, soporte y justificación breve."""

KINDS = ("FACT", "LEGEND_REPORT", "VISIBLE_DESCRIPTION", "NAVIGATION", "EDITORIAL")
SUPPORTS = ("SUPPORTED", "PARTIAL", "CONTRADICTED", "NOT_IN_EVIDENCE", "NON_FACTUAL", "UNRESOLVED")
SEVERITIES = ("none", "minor", "major", "critical")
BASES = ("ORIGINAL_PACKET", "SOURCE_ADDENDUM")
TAGS = ("NUMBER", "DATE", "NAME_OR_ROLE", "CAUSALITY", "MOTIVE", "LEGEND_AS_FACT",
        "SOURCE_CONFLICT", "TIME_SENSITIVE", "VISITOR_POSITION", "NAVIGATION_OR_ACCESS",
        "STYLE_LEAKAGE", "META_TEXT", "INTERNAL_CONTRADICTION", "REPETITION",
        "BROKEN_PROMISE", "OTHER")
KIND_ALIASES = {"LEGEND": "LEGEND_REPORT", "INTERPRETATION": "EDITORIAL",
                "DESCRIPTION": "VISIBLE_DESCRIPTION", "VISIBLE": "VISIBLE_DESCRIPTION",
                "NAVIGATIONAL": "NAVIGATION"}
SUPPORT_ALIASES = {"NOT_APPLICABLE": "NON_FACTUAL", "NO_FACTUAL_CLAIM": "NON_FACTUAL",
                   "UNSUPPORTED": "NOT_IN_EVIDENCE", "PARTIALLY_SUPPORTED": "PARTIAL",
                   "PARTIALLY": "PARTIAL", "NO_EVIDENCE": "NOT_IN_EVIDENCE"}


def norm_quote(text):
    if not isinstance(text, str):
        return ""
    for a, b in (("«", '"'), ("»", '"'), ("“", '"'), ("”", '"'), ("‘", "'"), ("’", "'")):
        text = text.replace(a, b)
    return re.sub(r"\s+", " ", text).strip()


def read(p):
    with open(p, encoding="utf-8") as f:
        return f.read()


def read_json(p):
    return json.loads(read(p))


def sha_text(t):
    import hashlib
    return hashlib.sha256(t.encode("utf-8")).hexdigest()


def sha_file(p):
    import hashlib
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for c in iter(lambda: f.read(65536), b""):
            h.update(c)
    return h.hexdigest()


def write(path, text):
    p = os.path.join(BASE, path)
    os.makedirs(os.path.dirname(p), exist_ok=True)
    with open(p, "w", encoding="utf-8") as f:
        f.write(text)
    return p


def write_json(path, obj):
    return write(path, json.dumps(obj, ensure_ascii=False, indent=2))


def now():
    return datetime.now(timezone.utc).isoformat()


def ledger(entry):
    entry["ts"] = now()
    os.makedirs(os.path.dirname(LEDGER), exist_ok=True)
    with open(LEDGER, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def load_key():
    key = os.environ.get("DEEPSEEK_API_KEY")
    if not key:
        for line in open(os.path.join(REPO, "backend/.env")):
            if line.strip().startswith("DEEPSEEK_API_KEY="):
                key = line.strip().split("=", 1)[1]
                break
    return key


def extract_json(content):
    """Accept a complete JSON object only; never salvage response fragments."""
    if not isinstance(content, str) or not content.strip():
        return None
    try:
        value = json.loads(content)
    except json.JSONDecodeError:
        return None
    return value if isinstance(value, dict) else None


def call(payload, request_id, stage, piece, text_hash, validator=None):
    """One persisted physical attempt; only complete, currently valid JSON is usable."""
    import glob
    identity = sha_text(json.dumps({"payload": payload, "textHash": text_hash},
                                  sort_keys=True, ensure_ascii=False))
    folder = os.path.join(BASE, "frozen/request-and-response")
    os.makedirs(folder, exist_ok=True)
    res_path = os.path.join(folder, f"{request_id}.response.json")
    out = {"requestId": request_id, "stage": stage, "piece": piece,
           "payloadHash": identity, "textHash": text_hash, "attempts": [],
           "rawContent": None, "parsed": None,
           "validation": {"status": "INCOMPLETE", "errors": ["no valid response"]}}

    def assess(record):
        body = record.get("body") or {}
        choice = (body.get("choices") or [{}])[0]
        content = (choice.get("message") or {}).get("content")
        parsed = None
        errors = []
        if record.get("entry", {}).get("status") != "HTTP_OK" or choice.get("finish_reason") != "stop":
            errors = ["response did not finish with HTTP_OK/stop"]
        elif not isinstance(content, str) or not content.strip():
            errors = ["empty final content"]
        else:
            parsed = extract_json(content)
            if parsed is None:
                errors = ["not a complete JSON object"]
            elif validator is not None:
                try:
                    valid, errors = validator(parsed)
                    if not valid and not errors:
                        errors = ["schema invalid"]
                except (TypeError, ValueError, KeyError, AttributeError) as exc:
                    errors = ["schema invalid: " + str(exc)]
        failure_type = ('transport' if record.get('entry', {}).get('status') != 'HTTP_OK'
                        else 'truncated' if choice.get('finish_reason') != 'stop'
                        else 'contract_invalid') if errors else None
        return content, parsed, {"status": "OK" if not errors else "INCOMPLETE", "type": failure_type,
                                 "stage": stage, "piece": piece, "errors": errors}

    if os.path.exists(res_path) and read_json(res_path).get("payloadHash") != identity:
        out["validation"] = {"status": "STALE_CACHE", "errors": ["request/text hash changed"]}
        return out
    records = []
    for n in range(1, MAX_ATTEMPTS + 1):
        path = os.path.join(folder, f"{request_id}.attempt-{n}.json")
        if os.path.exists(path):
            record = read_json(path)
            if record.get("payloadHash") != identity:
                out["validation"] = {"status": "STALE_CACHE", "errors": ["attempt hash changed"]}
                return out
            records.append(record)
    if records:
        out["attempts"] = [r["entry"] for r in records]
        out["rawContent"], out["parsed"], out["validation"] = assess(records[-1])
        status = records[-1]["entry"].get("status", "")
        if out["validation"]["status"] == "OK" or len(records) >= MAX_ATTEMPTS or (
                status.startswith("HTTP_4") and status != "HTTP_429"):
            write_json(res_path, out)
            return out
    write_json(os.path.join(folder, f"{request_id}.request.json"),
               {"requestId": request_id, "stage": stage, "piece": piece,
                "payload": payload, "payloadHash": identity, "textHash": text_hash, "sentAt": now()})
    for n in range(len(records) + 1, MAX_ATTEMPTS + 1):
        if len(glob.glob(os.path.join(folder, "*.attempt-*.json"))) >= 5:
            out["validation"] = {"status": "BUDGET_EXHAUSTED", "errors": ["5 physical attempts exhausted"]}
            break
        key = load_key()
        if not key:
            out["validation"] = {"status": "BLOCKED_API_KEY", "errors": ["DeepSeek key unavailable"]}
            break
        path = os.path.join(folder, f"{request_id}.attempt-{n}.json")
        entry = {"requestId": request_id, "stage": stage, "piece": piece,
                 "attempt": n, "status": "PENDING", "sentAt": now(),
                 "payloadHash": identity, "textHash": text_hash, "configuredModel": payload["model"]}
        record = {"payloadHash": identity, "entry": entry, "body": None}
        budget_root = os.environ.get('DEEPSEEK_BUDGET_ROOT')
        reservation = None
        if budget_root:
            import budget
            try:
                reservation = budget.reserve(budget_root, path, payload)
            except budget.BudgetError as exc:
                out['validation'] = {'status': 'BUDGET_EXHAUSTED', 'type': 'budget', 'errors': [str(exc)]}
                write_json(res_path, out)
                return out
        write_json(path, record)
        t0 = time.perf_counter()
        body = None
        try:
            request = urllib.request.Request(API, data=json.dumps(payload).encode("utf-8"),
                                             headers={"Content-Type": "application/json",
                                                      "Authorization": f"Bearer {key}"})
            with urllib.request.urlopen(request, timeout=900) as response:
                body = json.loads(response.read())
            entry["status"] = "HTTP_OK"
            for choice in body.get("choices", []):
                (choice.get("message") or {}).pop("reasoning_content", None)
        except urllib.error.HTTPError as exc:
            entry.update(status=f"HTTP_{exc.code}", error=str(exc))
        except Exception as exc:
            entry.update(status="TRANSPORT_ERROR", error=str(exc))
        usage = (body or {}).get("usage") or {}
        choice = ((body or {}).get("choices") or [{}])[0]
        entry.update(completedAt=now(), durationMs=int((time.perf_counter()-t0)*1000),
                     finishReason=choice.get("finish_reason"),
                     reportedModel=(body or {}).get("model"),
                     promptTokens=usage.get("prompt_tokens"), completionTokens=usage.get("completion_tokens"),
                     reasoningTokens=(usage.get("completion_tokens_details") or {}).get("reasoning_tokens"),
                     cachedTokens=usage.get("prompt_cache_hit_tokens"))
        record["body"] = body
        write_json(path, record)  # Persist provider output before parsing or schema validation.
        if reservation is not None:
            budget.settle(budget_root, reservation, record)
        ledger(entry)
        out["attempts"].append(entry)
        out["rawContent"], out["parsed"], out["validation"] = assess(record)
        record["validation"] = out["validation"]
        write_json(path, record)
        write_json(res_path, out)
        status = entry["status"]
        if out["validation"]["status"] == "OK" or (status.startswith("HTTP_4") and status != "HTTP_429"):
            break
        if n < MAX_ATTEMPTS:
            time.sleep(3)
    write_json(res_path, out)
    return out

