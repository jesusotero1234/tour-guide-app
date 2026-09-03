from __future__ import annotations

import math
import re
from collections import Counter
from dataclasses import dataclass
from typing import Literal, Sequence

from .pdf_source import EmbeddedTextLine


MAX_SOURCE_LINES = 1000

Reason = Literal[
    "accepted",
    "missing_text",
    "invalid_box",
    "special_layout",
    "too_many_lines",
    "too_short",
    "low_alphabetic_ratio",
    "repeated_tokens",
]
ContentClass = Literal["normal", "table", "mixed_orientation"]


@dataclass(frozen=True)
class EmbeddedTextDecision:
    accepted: bool
    reason: Reason
    character_count: int
    alphabetic_ratio: float
    token_repetition_ratio: float
    quality_score: float


def _validate_threshold(value: float, name: str, low: float, high: float) -> None:
    if not isinstance(value, (int, float)) or isinstance(value, bool):
        raise ValueError(f"{name} must be a finite number")
    if not math.isfinite(value):
        raise ValueError(f"{name} must be finite")
    if value < low or value > high:
        raise ValueError(f"{name} must be in [{low}, {high}]")


def _validate_min_characters(value: int) -> None:
    if not isinstance(value, int) or isinstance(value, bool):
        raise ValueError("min_characters must be an int")
    if value < 1 or value > 1000000:
        raise ValueError("min_characters must be in [1, 1000000]")


def _is_valid_box(box: tuple[float, float, float, float]) -> bool:
    try:
        x0, y0, x1, y1 = box
    except (TypeError, ValueError):
        return False
    if not all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in (x0, y0, x1, y1)):
        return False
    if not all(math.isfinite(v) for v in (x0, y0, x1, y1)):
        return False
    if not (0 <= x0 < x1 <= 1 and 0 <= y0 < y1 <= 1):
        return False
    return True


def assess_embedded_text(
    lines: Sequence[EmbeddedTextLine],
    *,
    content_class: ContentClass,
    min_characters: int,
    min_alphabetic_ratio: float,
    max_token_repetition_ratio: float,
) -> EmbeddedTextDecision:
    _validate_min_characters(min_characters)
    _validate_threshold(min_alphabetic_ratio, "min_alphabetic_ratio", 0.0, 1.0)
    _validate_threshold(max_token_repetition_ratio, "max_token_repetition_ratio", 0.0, 1.0)

    if content_class not in ("normal", "table", "mixed_orientation"):
        raise ValueError("content_class must be normal, table, or mixed_orientation")

    non_empty = [line.text for line in lines if line.text.strip()]
    if not non_empty:
        return EmbeddedTextDecision(
            accepted=False,
            reason="missing_text",
            character_count=0,
            alphabetic_ratio=0.0,
            token_repetition_ratio=0.0,
            quality_score=0.0,
        )

    joined = "\n".join(non_empty)
    character_count = len(joined)

    non_whitespace = [ch for ch in joined if not ch.isspace()]
    if non_whitespace:
        alphabetic_ratio = sum(1 for ch in non_whitespace if ch.isalpha()) / len(non_whitespace)
    else:
        alphabetic_ratio = 0.0

    tokens = [token.casefold() for token in re.split(r"[^\w]+", joined) if token]
    if tokens:
        max_count = Counter(tokens).most_common(1)[0][1]
        token_repetition_ratio = max_count / len(tokens)
    else:
        token_repetition_ratio = 0.0

    quality_score = max(0.0, min(1.0, alphabetic_ratio * (1.0 - token_repetition_ratio)))

    has_invalid_box = any(not _is_valid_box(line.box) for line in lines)
    if has_invalid_box:
        reason: Reason = "invalid_box"
    elif content_class in ("table", "mixed_orientation"):
        reason = "special_layout"
    elif len(non_empty) > MAX_SOURCE_LINES:
        reason = "too_many_lines"
    elif character_count < min_characters:
        reason = "too_short"
    elif alphabetic_ratio < min_alphabetic_ratio:
        reason = "low_alphabetic_ratio"
    elif token_repetition_ratio > max_token_repetition_ratio:
        reason = "repeated_tokens"
    else:
        reason = "accepted"

    return EmbeddedTextDecision(
        accepted=reason == "accepted",
        reason=reason,
        character_count=character_count,
        alphabetic_ratio=alphabetic_ratio,
        token_repetition_ratio=token_repetition_ratio,
        quality_score=quality_score,
    )
