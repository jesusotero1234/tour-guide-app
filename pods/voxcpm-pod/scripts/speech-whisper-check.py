#!/usr/bin/env python3
"""Independent check that the rendered audio says the spoken text (plan 02 section 9). Recommended, not blocking.

  speech-whisper-check.py --manifest manifest.json --out report.json [--fraction 0.05] [--threshold 0.15]

manifest.json: {"language": "es", "country": "ES", "pieces": [{"pieceId", "audio", "spokenText", "flagged": false}]}.
A sample of the pieces (a deterministic fraction, plus every piece marked `flagged`: LLM repairs and acronym warnings) is
transcribed with faster-whisper on the CPU. Whisper writes digits and Roman numerals, so BOTH sides are normalised before
comparing. A piece whose word error rate exceeds the threshold goes to the human listening queue with the words that
differed, as candidates for lexicon/<lang>.json.
"""
import argparse
import hashlib
import json
import os
import re
import sys
import unicodedata
from pathlib import Path
from typing import Callable

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "src"))
from utils.speech import normalize

DEFAULT_MODEL = Path.home() / ".cache/huggingface/hub/models--Systran--faster-whisper-small/snapshots/536b0662742c02347bc0e980a01041f333bce120"


def words(text: str, lang: str, country=None) -> list:
    """Lower-case words without accents or punctuation, after turning digits and Roman numerals into words."""
    spoken = normalize(text, lang, country).spoken
    stripped = "".join(c for c in unicodedata.normalize("NFD", spoken.lower()) if unicodedata.category(c) != "Mn")
    return re.findall(r"\w+", stripped)


def edit_operations(expected: list, actual: list):
    """Word-level edit distance and the aligned (expected, heard) pairs that differ."""
    rows = [[0] * (len(actual) + 1) for _ in range(len(expected) + 1)]
    for i in range(len(expected) + 1):
        rows[i][0] = i
    for j in range(len(actual) + 1):
        rows[0][j] = j
    for i in range(1, len(expected) + 1):
        for j in range(1, len(actual) + 1):
            rows[i][j] = min(rows[i - 1][j] + 1, rows[i][j - 1] + 1, rows[i - 1][j - 1] + (expected[i - 1] != actual[j - 1]))
    differences, i, j = [], len(expected), len(actual)
    while i or j:
        if i and j and rows[i][j] == rows[i - 1][j - 1] + (expected[i - 1] != actual[j - 1]):
            if expected[i - 1] != actual[j - 1]:
                differences.append((expected[i - 1], actual[j - 1]))
            i, j = i - 1, j - 1
        elif i and rows[i][j] == rows[i - 1][j] + 1:
            differences.append((expected[i - 1], ""))
            i -= 1
        else:
            differences.append(("", actual[j - 1]))
            j -= 1
    return rows[-1][-1], list(reversed(differences))


def compare(spoken: str, transcript: str, lang: str, country=None) -> dict:
    expected, heard = words(spoken, lang, country), words(transcript, lang, country)
    edits, differences = edit_operations(expected, heard)
    return {"wordErrorRate": round(edits / max(1, len(expected)), 4), "wordEdits": edits, "expectedWords": len(expected),
            "differences": [{"expected": a, "heard": b} for a, b in differences][:40]}


def choose(pieces: list, fraction: float) -> list:
    """Every flagged piece, plus a deterministic `fraction` of the rest (stable under reordering)."""
    def rank(piece):
        return int(hashlib.sha256(piece["pieceId"].encode()).hexdigest(), 16) % 10_000 / 10_000
    return [p for p in pieces if p.get("flagged") or rank(p) < fraction]


def run(manifest: dict, transcribe: Callable[[str, str], str], fraction: float = 0.05, threshold: float = 0.15) -> dict:
    lang, country = manifest["language"], manifest.get("country")
    results = []
    for piece in choose(manifest["pieces"], fraction):
        result = compare(piece["spokenText"], transcribe(piece["audio"], lang), lang, country)
        results.append({"pieceId": piece["pieceId"], "flagged": bool(piece.get("flagged")), **result})
    queue = sorted((r for r in results if r["wordErrorRate"] > threshold), key=lambda r: -r["wordErrorRate"])
    return {"language": lang, "threshold": threshold, "checked": len(results), "ofPieces": len(manifest["pieces"]),
            "meanWordErrorRate": round(sum(r["wordErrorRate"] for r in results) / max(1, len(results)), 4),
            "listeningQueue": [r["pieceId"] for r in queue], "results": results}


def whisper_transcriber(model_path: Path) -> Callable[[str, str], str]:
    from faster_whisper import WhisperModel          # CPU only: the GPU belongs to the TTS renderer
    model = WhisperModel(str(model_path), device="cpu", compute_type="int8", cpu_threads=4, local_files_only=True)

    def transcribe(audio: str, lang: str) -> str:
        segments, _ = model.transcribe(audio, language=lang, beam_size=5, temperature=0, vad_filter=False, condition_on_previous_text=False)
        return " ".join(s.text.strip() for s in segments)
    return transcribe


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--manifest", required=True, type=Path)
    parser.add_argument("--out", required=True, type=Path)
    parser.add_argument("--fraction", type=float, default=0.05)
    parser.add_argument("--threshold", type=float, default=0.15)
    parser.add_argument("--model-path", type=Path, default=Path(os.environ.get("WHISPER_MODEL_PATH", DEFAULT_MODEL)))
    args = parser.parse_args()
    report = run(json.loads(args.manifest.read_text(encoding="utf-8")), whisper_transcriber(args.model_path), args.fraction, args.threshold)
    args.out.write_text(json.dumps(report, ensure_ascii=False, indent=1), encoding="utf-8")
    print(f"{report['language']}: {report['checked']} of {report['ofPieces']} pieces, mean WER {report['meanWordErrorRate']}, "
          f"{len(report['listeningQueue'])} for listening")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
