from __future__ import annotations

import hashlib
import json
from pathlib import Path

import pytest

from historical_corpus.ingest_models import PreparedDocument, SourcePageInput
from historical_corpus.manifest import ManifestCorrections
from historical_corpus.text_corrections import (
    CorrectionSetError,
    apply_corrections,
    load_correction_set,
)


def _page() -> SourcePageInput:
    fixture_path = Path(__file__).with_name("prepared-document.json")
    payload = json.loads(fixture_path.read_text(encoding="utf-8"))
    return PreparedDocument.model_validate(payload).pages[0]


def _record(page: SourcePageInput, **updates: object) -> dict[str, object]:
    line = page.lines[0]
    payload: dict[str, object] = {
        "schemaVersion": 1,
        "documentId": page.documentId,
        "sourcePdfPageNumber": page.sourcePdfPageNumber,
        "logicalPageNumber": page.logicalPageNumber,
        "lineOrder": line.lineOrder,
        "lineId": line.lineId,
        "originalTextSha256": "sha256:"
        + hashlib.sha256(line.originalText.encode("utf-8")).hexdigest(),
        "correctedText": "MÁLAGA: ciudad histórica corregida.",
        "authority": "ai_adjudicated",
        "reviewedAt": "2026-09-04T10:00:00+02:00",
    }
    payload.update(updates)
    return payload


def _write_set(
    tmp_path: Path,
    records: list[dict[str, object]],
    *,
    expected_sha256: str | None = None,
) -> tuple[Path, ManifestCorrections]:
    data = b"".join(
        json.dumps(
            record,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8")
        + b"\n"
        for record in records
    )
    path = tmp_path / "corrections.jsonl"
    path.write_bytes(data)
    config = ManifestCorrections(
        path=path.name,
        expectedSha256=expected_sha256 or hashlib.sha256(data).hexdigest(),
        authority="ai_adjudicated",
        reviewStatus="ai_adjudicated_not_human_certified",
    )
    return path, config


def test_load_and_apply_correction_preserves_raw_provenance(tmp_path: Path) -> None:
    page = _page()
    raw_page_text = page.originalText
    raw_line_text = page.lines[0].originalText
    raw_line_id = page.lines[0].lineId
    _path, config = _write_set(tmp_path, [_record(page)])

    loaded = load_correction_set(config, tmp_path, page.documentId)
    corrected_pages = apply_corrections([page], loaded)

    assert corrected_pages[0].originalText == raw_page_text
    assert corrected_pages[0].lines[0].originalText == raw_line_text
    assert corrected_pages[0].lines[0].lineId == raw_line_id
    assert (
        corrected_pages[0].lines[0].correctedText
        == "MÁLAGA: ciudad histórica corregida."
    )


def test_load_rejects_configured_digest_mismatch(tmp_path: Path) -> None:
    page = _page()
    _path, config = _write_set(
        tmp_path,
        [_record(page)],
        expected_sha256="f" * 64,
    )
    with pytest.raises(CorrectionSetError, match="digest"):
        load_correction_set(config, tmp_path, page.documentId)


def test_load_rejects_duplicate_line_ids(tmp_path: Path) -> None:
    page = _page()
    record = _record(page)
    _path, config = _write_set(tmp_path, [record, record])
    with pytest.raises(CorrectionSetError, match="duplicate"):
        load_correction_set(config, tmp_path, page.documentId)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("sourcePdfPageNumber", 999),
        ("logicalPageNumber", 999),
        ("lineOrder", 999),
        ("lineId", "sha256:" + "f" * 64),
        ("originalTextSha256", "sha256:" + "e" * 64),
    ],
)
def test_apply_rejects_stale_locator_or_original_hash(
    tmp_path: Path,
    field: str,
    value: object,
) -> None:
    page = _page()
    _path, config = _write_set(tmp_path, [_record(page, **{field: value})])
    loaded = load_correction_set(config, tmp_path, page.documentId)
    with pytest.raises(CorrectionSetError, match="stale|unused|match"):
        apply_corrections([page], loaded)


def test_apply_rejects_noop_correction(tmp_path: Path) -> None:
    page = _page()
    _path, config = _write_set(
        tmp_path,
        [_record(page, correctedText=page.lines[0].originalText)],
    )
    loaded = load_correction_set(config, tmp_path, page.documentId)
    with pytest.raises(CorrectionSetError, match="no-op"):
        apply_corrections([page], loaded)


def test_load_rejects_naive_reviewed_at(tmp_path: Path) -> None:
    page = _page()
    _path, config = _write_set(
        tmp_path,
        [_record(page, reviewedAt="2026-09-04T10:00:00")],
    )
    with pytest.raises(CorrectionSetError, match="reviewedAt"):
        load_correction_set(config, tmp_path, page.documentId)
