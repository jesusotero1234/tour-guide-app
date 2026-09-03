from __future__ import annotations

import math

from historical_corpus.embedded_text_policy import assess_embedded_text
from historical_corpus.pdf_source import EmbeddedTextLine


def _line(
    text: str,
    box: tuple[float, float, float, float] = (0.1, 0.1, 0.9, 0.2),
) -> EmbeddedTextLine:
    return EmbeddedTextLine(
        text=text,
        box=box,
        block_index=0,
        line_index=0,
    )


def _assess(
    lines: tuple[EmbeddedTextLine, ...],
    *,
    content_class: str = "normal",
    min_characters: int = 20,
    min_alphabetic_ratio: float = 0.4,
    max_token_repetition_ratio: float = 0.5,
):
    return assess_embedded_text(
        lines,
        content_class=content_class,
        min_characters=min_characters,
        min_alphabetic_ratio=min_alphabetic_ratio,
        max_token_repetition_ratio=max_token_repetition_ratio,
    )


def test_ordinary_embedded_prose_is_accepted_with_finite_metrics() -> None:
    text = "Madrid de Caderechas tiene caminos y campos cultivados."
    decision = _assess((_line(text),))

    assert decision.accepted is True
    assert decision.reason == "accepted"
    assert decision.character_count == len(text)
    assert 0.0 <= decision.alphabetic_ratio <= 1.0
    assert 0.0 <= decision.token_repetition_ratio <= 1.0
    assert 0.0 <= decision.quality_score <= 1.0
    assert all(
        math.isfinite(value)
        for value in (
            decision.alphabetic_ratio,
            decision.token_repetition_ratio,
            decision.quality_score,
        )
    )


def test_missing_embedded_text_is_rejected() -> None:
    decision = _assess(())
    assert decision.accepted is False
    assert decision.reason == "missing_text"


def test_short_embedded_text_is_rejected() -> None:
    text = "Madrid villa"
    decision = _assess((_line(text),))
    assert decision.accepted is False
    assert decision.reason == "too_short"
    assert decision.character_count == len(text)
    assert decision.alphabetic_ratio > 0.0
    assert decision.token_repetition_ratio > 0.0
    assert math.isfinite(decision.quality_score)
    assert decision.quality_score > 0.0


def test_embedded_text_with_too_few_letters_is_rejected() -> None:
    decision = _assess((_line("1234 5678 9012 3456 7890"),))
    assert decision.accepted is False
    assert decision.reason == "low_alphabetic_ratio"


def test_pathologically_repeated_embedded_tokens_are_rejected() -> None:
    decision = _assess((_line(("madrid " * 20) + "villa"),))
    assert decision.accepted is False
    assert decision.reason == "repeated_tokens"


def test_embedded_text_with_invalid_box_is_rejected() -> None:
    decision = _assess((_line("Texto suficientemente largo y válido.", (-0.1, 0.1, 0.9, 0.2)),))
    assert decision.accepted is False
    assert decision.reason == "invalid_box"


def test_special_layout_requires_image_ocr_contrast() -> None:
    decision = _assess(
        (_line("Texto suficientemente largo para superar los otros controles."),),
        content_class="table",
    )
    assert decision.accepted is False
    assert decision.reason == "special_layout"


def test_embedded_text_exceeding_line_limit_is_rejected() -> None:
    text = "Madrid de Caderechas tiene caminos y campos cultivados."
    lines = tuple(_line(text) for _ in range(1001))
    decision = _assess(lines)
    assert decision.accepted is False
    assert decision.reason == "too_many_lines"
