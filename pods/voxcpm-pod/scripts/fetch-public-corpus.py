#!/usr/bin/env python3
"""Download the published narration texts from the public, read-only API (no SSH, no credentials).

  fetch-public-corpus.py --out DIR [--base https://nomuvia.com] [--languages es,en,fr,de,it]

Writes DIR/<lang>.json: {"language", "fetchedAt", "pieces": [{"tourId", "pieceId", "kind": "stop"|"introduction", "name", "countryCode", "text"}]}.
Point --out at a temporary directory, never at the repository. One request per page of 50 tours, with a pause in between,
because the catalogue endpoint validates every tour on each call.
"""
import argparse
import json
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path


def get(url: str, attempts: int = 3):
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": "tour-guide-speech-corpus/1", "Accept": "application/json"})
            with urllib.request.urlopen(request, timeout=120) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, ValueError) as error:
            if attempt == attempts - 1:
                raise
            print(f"retry {attempt + 1} after {error}", file=sys.stderr)
            time.sleep(5 * (attempt + 1))


def fetch_language(base: str, language: str, pause: float) -> list:
    pieces, offset, total = [], 0, None
    while total is None or offset < total:
        payload = get(f"{base}/api/backend/tours?language={language}&limit=50&offset={offset}")
        data = payload.get("data", payload)
        tours, total = data["tours"], data["total"]
        for tour in tours:
            if tour.get("introduction"):
                pieces.append({"tourId": tour["id"], "pieceId": "introduction", "kind": "introduction", "name": tour.get("city", ""),
                               "countryCode": tour.get("countryCode"), "text": tour["introduction"]})
            for place in tour.get("places", []):
                pieces.append({"tourId": tour["id"], "pieceId": place["id"], "kind": "stop", "name": place.get("nameInTourLanguage") or place.get("name", ""),
                               "countryCode": tour.get("countryCode"), "text": place["description"]})
        offset += 50
        time.sleep(pause)
    return pieces


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--base", default="https://nomuvia.com")
    parser.add_argument("--languages", default="es,en,fr,de,it")
    parser.add_argument("--pause", type=float, default=2.0)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parents[3]
    if repo in args.out.resolve().parents or args.out.resolve() == repo:
        print("Refusing to write the corpus inside the repository", file=sys.stderr)
        return 2
    args.out.mkdir(parents=True, exist_ok=True)
    for language in args.languages.split(","):
        pieces = fetch_language(args.base.rstrip("/"), language, args.pause)
        (args.out / f"{language}.json").write_text(json.dumps({"language": language, "fetchedAt": datetime.now(timezone.utc).isoformat(), "pieces": pieces}, ensure_ascii=False), encoding="utf-8")
        print(f"{language}: {len(pieces)} pieces from {len({p['tourId'] for p in pieces})} tours")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
