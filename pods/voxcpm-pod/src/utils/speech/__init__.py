"""Spoken-text normalization: turns the on-screen text of a tour into the exact text the TTS reads."""
import json
import re
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional, Sequence

from .common import Ctx, clean_text, parentheses_to_commas, tidy
from .gate import Violation, acronym_warnings, gate

SPEECH_VERSION = "speech-1"  # bump on every change of rules or lexicon
SUPPORTED = ("es", "en", "fr", "de", "it")
_LEXICON = Path(__file__).parent / "lexicon"
__all__ = ["SPEECH_VERSION", "NormalizationResult", "Violation", "normalize", "gate", "acronym_warnings"]


@dataclass
class NormalizationResult:
    spoken: str
    changes: list = field(default_factory=list)       # (original, spoken), in order
    violations: list = field(default_factory=list)    # gate(spoken) after normalizing


def _module(lang: str):
    if lang not in SUPPORTED:
        raise ValueError(f"Unsupported speech language: {lang}")
    return __import__(f"{__name__}.{lang}", fromlist=["normalize"])


def apply_lexicon(text: str, lang: str, ctx: Optional[Ctx] = None) -> str:
    """Whole-word pronunciation respellings from lexicon/<lang>.json (valid for every city)."""
    entries = json.loads((_LEXICON / f"{lang}.json").read_text(encoding="utf-8"))
    for word in sorted(entries, key=len, reverse=True):
        pattern = r"(?<!\w)" + re.escape(word) + r"(?!\w)"
        text = re.sub(pattern, lambda _m, w=entries[word]: w, text)
    return text


def normalize(text: str, lang: str, country_code: Optional[str] = None) -> NormalizationResult:
    module = _module(lang)
    ctx = Ctx(lang, (country_code or "").upper() or None)
    spoken = module.normalize(clean_text(text), ctx)
    spoken = apply_lexicon(parentheses_to_commas(spoken), lang)
    spoken = tidy(spoken)
    return NormalizationResult(spoken, ctx.changes, gate(spoken, lang))
