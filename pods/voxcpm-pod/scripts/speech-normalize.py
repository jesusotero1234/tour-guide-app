#!/usr/bin/env python3
"""Batch CLI for the spoken-text normalizer. JSON on stdin and stdout, so Node and Python callers share it.

  speech-normalize.py --lang es --country ES < pieces.json > speech.json
    in : {"pieces": [{"pieceId": "...", "text": "..."}]}
    out: {"speechVersion": "speech-1", "pieces": [{"pieceId", "spokenText", "changes", "violations", "warnings", "fixedPoint"}]}
         fixedPoint is true when sanitize_text leaves spokenText unchanged, which the renderer requires (SPEECH_NOT_CLEAN)

  speech-normalize.py --check --lang es < speech.json     exit 1 when any spokenText still has violations
"""
import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from utils.sanitize import sanitize_text
from utils.speech import SPEECH_VERSION, SUPPORTED, acronym_warnings, gate, normalize


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--lang", required=True, choices=SUPPORTED)
    parser.add_argument("--country", default=None, help="ISO country of the tour (decides St. -> Sankt/Saint)")
    parser.add_argument("--check", action="store_true", help="only run the gate on pieces[].spokenText")
    args = parser.parse_args()
    try:
        data = json.load(sys.stdin)
        pieces = data["pieces"]
        assert isinstance(pieces, list)
    except (ValueError, KeyError, AssertionError):
        print('Expected JSON like {"pieces": [{"pieceId": "...", "text": "..."}]}', file=sys.stderr)
        return 2
    out, dirty = [], False
    for piece in pieces:
        piece_id = piece.get("pieceId", piece.get("id"))
        if args.check:
            text = piece.get("spokenText", piece.get("text", ""))
            violations = gate(text, args.lang)
            out.append({"pieceId": piece_id, "violations": [v.as_dict() for v in violations], "warnings": acronym_warnings(text),
                        "fixedPoint": sanitize_text(text) == text})
        else:
            result = normalize(piece["text"], args.lang, args.country)
            violations = result.violations
            out.append({"pieceId": piece_id, "spokenText": result.spoken, "changes": [list(c) for c in result.changes],
                        "violations": [v.as_dict() for v in violations], "warnings": acronym_warnings(result.spoken),
                        "fixedPoint": sanitize_text(result.spoken) == result.spoken})
        dirty = dirty or bool(violations) or not out[-1]["fixedPoint"]
    json.dump({"speechVersion": SPEECH_VERSION, "pieces": out}, sys.stdout, ensure_ascii=False)
    sys.stdout.write("\n")
    return 1 if args.check and dirty else 0


if __name__ == "__main__":
    raise SystemExit(main())
