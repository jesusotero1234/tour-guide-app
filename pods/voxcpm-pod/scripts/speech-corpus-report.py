#!/usr/bin/env python3
"""Run the normalizer over a corpus downloaded with fetch-public-corpus.py and report what is left for the gate.

  speech-corpus-report.py --corpus DIR [--json OUT.json] [--samples 8]

Per language: pieces, pieces left clean without any LLM, residual violations by kind, the most common residues with
their context, acronym warnings and every "Name + Roman numeral" pair found (to extend the ruler list).
"""
import argparse
import json
import re
import sys
from collections import Counter, defaultdict
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from utils.speech import acronym_warnings, normalize
from utils.speech.common import RULER_NAMES, roman_to_int

SUPPORTED = ("es", "en", "fr", "de", "it")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--corpus", required=True, type=Path)
    parser.add_argument("--json", type=Path)
    parser.add_argument("--samples", type=int, default=8)
    parser.add_argument("--languages", default=",".join(SUPPORTED))
    args = parser.parse_args()
    report = {}
    print(f"{'lang':4} {'pieces':>6} {'clean':>6} {'clean %':>8}  residues by kind")
    for lang in args.languages.split(","):
        data = json.loads((args.corpus / f"{lang}.json").read_text(encoding="utf-8"))
        pieces = data["pieces"]
        clean, kinds, contexts, warnings, pairs = 0, Counter(), defaultdict(Counter), Counter(), Counter()
        dirty_pieces = []
        for piece in pieces:
            result = normalize(piece["text"], lang, piece.get("countryCode"))
            for m in re.finditer(r"\b([A-ZÀ-ÖØ-Þ][\wà-ÿ]+)\s+([IVXLCDM]{1,8})\b\.?", piece["text"]):
                if roman_to_int(m.group(2)) is not None and m.group(1) not in RULER_NAMES:
                    pairs[m.group(0)] += 1
            warnings.update(acronym_warnings(result.spoken))
            if not result.violations:
                clean += 1
                continue
            dirty_pieces.append(piece["tourId"] + "/" + piece["pieceId"])
            for v in result.violations:
                kinds[v.kind] += 1
                context = result.spoken[max(0, v.start - 30):v.end + 30].replace("\n", " ")
                contexts[v.kind][(v.match, context)] += 1
        pct = 100 * clean / len(pieces)
        print(f"{lang:4} {len(pieces):6} {clean:6} {pct:7.1f}%  {dict(kinds)}")
        report[lang] = {"pieces": len(pieces), "clean": clean, "cleanPercent": round(pct, 2), "residuesByKind": dict(kinds),
                        "dirtyPieces": dirty_pieces, "acronymWarnings": warnings.most_common(40),
                        "unknownRomanPairs": pairs.most_common(60),
                        "samples": {k: [{"match": m, "context": c, "count": n} for (m, c), n in contexts[k].most_common(args.samples)] for k in contexts}}
    for lang, entry in report.items():
        print(f"\n== {lang}")
        for kind, items in entry["samples"].items():
            print(f"  {kind}:")
            for item in items:
                print(f"    {item['count']:3}x {item['match']!r:14} ...{item['context']}...")
        if entry["unknownRomanPairs"]:
            print("  Name + Roman not in the ruler list:", ", ".join(f"{p} ({n})" for p, n in entry["unknownRomanPairs"][:20]))
        if entry["acronymWarnings"]:
            print("  acronym warnings:", ", ".join(f"{a}" for a, _ in entry["acronymWarnings"][:20]))
    if args.json:
        args.json.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
