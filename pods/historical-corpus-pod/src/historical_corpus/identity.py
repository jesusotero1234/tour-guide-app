from __future__ import annotations

import hashlib
import json

from historical_corpus.models import NormalizedBox


def canonical_json_bytes(value: object) -> bytes:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")


def _box_to_dict(box: NormalizedBox) -> dict[str, float]:
    return {
        "x0": round(box.x0, 6),
        "y0": round(box.y0, 6),
        "x1": round(box.x1, 6),
        "y1": round(box.y1, 6),
    }


def compute_page_id(
    document_id: str,
    source_pdf_page_number: int,
    leaf_side: str,
    crop_box: NormalizedBox,
    rotation_degrees: int,
    image_sha256: str,
) -> str:
    payload = {
        "documentId": document_id,
        "sourcePdfPageNumber": source_pdf_page_number,
        "leafSide": leaf_side,
        "cropBox": _box_to_dict(crop_box),
        "rotationDegrees": rotation_degrees,
        "imageSha256": image_sha256,
    }
    return "sha256:" + hashlib.sha256(canonical_json_bytes(payload)).hexdigest()


def compute_line_id(
    page_id: str,
    line_order: int,
    original_text: str,
    box: NormalizedBox,
) -> str:
    payload = {
        "pageId": page_id,
        "lineOrder": line_order,
        "originalText": original_text,
        "box": _box_to_dict(box),
    }
    return "sha256:" + hashlib.sha256(canonical_json_bytes(payload)).hexdigest()


def compute_chunk_id(
    document_id: str,
    page_start: int,
    page_end: int,
    section_path: list[str],
    original_text: str,
) -> str:
    section_json = json.dumps(section_path, ensure_ascii=False, separators=(",", ":"))
    payload = f"{document_id}|{page_start}|{page_end}|{section_json}|{original_text}"
    return "sha256:" + hashlib.sha256(payload.encode("utf-8")).hexdigest()
