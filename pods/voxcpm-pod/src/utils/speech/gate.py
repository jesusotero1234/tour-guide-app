"""The gate: text that still contains digits, Roman numerals, abbreviations or symbols must not be rendered."""
import json
import re
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Sequence

from .common import RULER_ALT, english_pronoun_i, roman_to_int

Kind = Literal["DIGIT", "ROMAN", "ABBR", "SYMBOL", "BRACKET", "URL"]
_LEXICON = Path(__file__).parent / "lexicon"


@dataclass
class Violation:
    kind: Kind
    match: str
    start: int
    end: int
    sentence_index: int

    def as_dict(self) -> dict:
        return {"kind": self.kind, "match": self.match, "start": self.start, "end": self.end, "sentenceIndex": self.sentence_index}


ABBREVIATIONS = {
    "es": [r"\ba\. ?C\.", r"\bd\. ?C\.", r"(?<![\w])s\.\s", r"\bSt\.", r"\bSta\.", r"\bn\.º", r"\bnº", r"\bca\.", r"\bc\. (?=\d)"],
    "fr": [r"\bav\. J\.-C\.", r"\bapr\. J\.-C\.", r"\bSt\b", r"\bSte\b", r"\bn°"],
    "de": [r"\bv\. ?Chr\.", r"\bn\. ?Chr\.", r"\bz\. ?B\.", r"\bd\. ?h\.", r"\bu\. ?a\.", r"\busw\.", r"\bbzw\.",
           r"\bNr\.", r"\bSt\.", r"\bStr\.", r"\bca\."],
    "it": [r"\ba\.C\.", r"\bd\.C\.", r"\bS\. (?=[A-ZÀ-ÖØ-Þ])", r"\bSt\.", r"\bca\."],
    "en": [r"\bB\.C\.", r"\bA\.D\.", r"\bSt\.", r"\bc\. (?=\d)", r"\bca\."],
}
SYMBOLS = r"[%°ºª²³¼½¾€$£&#@+=<>~*^_|§]|(?<=[^\W\d_])/(?=[^\W\d_])"
_century_words = r"(?:[Ss]iglos?|[Ss]ecol[oi]|[Ss]iècles?|[Jj]ahrhunderts?|[Cc]enturies|[Cc]entury)"


def _roman_allow() -> set:
    try:
        return set(json.loads((_LEXICON / "roman-allow.json").read_text(encoding="utf-8")))
    except OSError:
        return set()


def sentence_spans(text: str) -> list:
    """(start, end) of every sentence, in the order of Violation.sentence_index. The separators between them are not included."""
    spans, start = [], 0
    for m in re.finditer(r"(?<=[.!?])\s+|\n+", text):
        spans.append((start, m.start()))
        start = m.end()
    spans.append((start, len(text)))
    return spans


def _sentence_starts(text: str) -> list:
    return [s for s, _ in sentence_spans(text)]


def gate(text: str, lang: str, allow: Sequence[str] = ()) -> list:
    """All violations in `text`. `allow` lists exact matches to ignore (legitimate acronyms such as MIDI)."""
    skip = set(allow) | _roman_allow()
    starts = _sentence_starts(text)
    found: list = []

    def add(kind: Kind, m: re.Match):
        if m.group(0).strip() in skip:
            return
        idx = max(i for i, s in enumerate(starts) if s <= m.start())
        found.append(Violation(kind, m.group(0).strip(), m.start(), m.end(), idx))

    for m in re.finditer(r"https?://|www\.", text):
        add("URL", m)
    for m in re.finditer(r"\d", text):
        add("DIGIT", m)
    for m in re.finditer(r"\b[IVXLCDM]{2,}\b", text):
        if roman_to_int(m.group(0)) is not None:
            add("ROMAN", m)
    for m in re.finditer(r"\b(?:" + RULER_ALT + r")\s+([IVXLCDM]+)\b", text):
        # English: "John I think" is the pronoun. Same test as en.py before it treats a lone I as a ruler.
        if lang == "en" and m.group(1) == "I" and english_pronoun_i(text[m.end():m.end() + 16]):
            continue
        if roman_to_int(m.group(1)) is not None:
            found.append(Violation("ROMAN", m.group(1), m.start(1), m.end(1), max(i for i, s in enumerate(starts) if s <= m.start(1))))
    for m in re.finditer(r"\b" + _century_words + r"\s+([IVXLCDM])\b", text):
        found.append(Violation("ROMAN", m.group(1), m.start(1), m.end(1), max(i for i, s in enumerate(starts) if s <= m.start(1))))
    for pattern in ABBREVIATIONS.get(lang, []):
        for m in re.finditer(pattern, text):
            add("ABBR", m)
    for m in re.finditer(SYMBOLS, text):
        add("SYMBOL", m)
    for m in re.finditer(r"[()\[\]{}]", text):
        add("BRACKET", m)
    unique = {(v.kind, v.start, v.end): v for v in found}
    return sorted(unique.values(), key=lambda v: (v.start, v.kind))


def acronym_warnings(text: str) -> list:
    """Upper-case sigla (USAAF, UNESCO): not a violation, but worth listening to; they feed the lexicon."""
    return sorted({m.group(0) for m in re.finditer(r"\b[A-ZÀ-ÖØ-Þ]{2,}\b", text) if roman_to_int(m.group(0)) is None})
