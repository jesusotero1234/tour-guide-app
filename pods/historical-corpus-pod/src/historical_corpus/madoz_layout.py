from __future__ import annotations

import math
from collections.abc import Mapping, Sequence
from dataclasses import dataclass
from typing import Literal

import numpy as np
from pydantic import ValidationError

from .identity import compute_line_id, compute_page_id
from .ingest_models import (
    ExtractedLineCandidate,
    PageInventoryRecord,
    QualityFlag,
    SourceLineInput,
    SourcePageInput,
)
from .manifest import MadozManifest, ManifestTableRegion
from .models import NormalizedBox
from .pdf_source import EmbeddedTextLine, RenderedLeaf


class LayoutError(RuntimeError):
    pass


@dataclass(frozen=True)
class _LayoutLine:
    original_text: str
    confidence: float
    correction180: int
    polygon: tuple[tuple[float, float], ...]
    box: NormalizedBox
    orientation: Literal[0, 90, 180, 270] | None
    role: Literal["body", "header", "footer", "table"]
    region_index: int | None
    local_sort_box: NormalizedBox


@dataclass(frozen=True)
class _ContentBlock:
    lines: tuple[_LayoutLine, ...]
    box: NormalizedBox


def _raw_candidate_key(candidate: ExtractedLineCandidate) -> tuple[object, ...]:
    return (
        candidate.originalText,
        tuple(tuple(float(coordinate) for coordinate in point) for point in candidate.polygon),
        float(candidate.confidence),
        candidate.correction180,
    )


def _deduplicate(
    candidates: Sequence[ExtractedLineCandidate],
) -> list[ExtractedLineCandidate]:
    unique: dict[tuple[object, ...], ExtractedLineCandidate] = {}
    for candidate in candidates:
        if not isinstance(candidate, ExtractedLineCandidate):
            raise LayoutError("layout input must contain ExtractedLineCandidate values")
        if not candidate.originalText.strip():
            continue
        unique.setdefault(_raw_candidate_key(candidate), candidate)
    return list(unique.values())


def _polygon_box(polygon: tuple[tuple[float, float], ...]) -> NormalizedBox:
    xs = [point[0] for point in polygon]
    ys = [point[1] for point in polygon]
    try:
        return NormalizedBox(x0=min(xs), y0=min(ys), x1=max(xs), y1=max(ys))
    except (ValidationError, ValueError, TypeError) as exc:
        raise LayoutError("OCR polygon has an invalid envelope") from exc


def _normalize_polygon(
    polygon: Sequence[Sequence[float]],
    width: int,
    height: int,
) -> tuple[tuple[float, float], ...]:
    if width < 1 or height < 1 or len(polygon) != 4:
        raise LayoutError("OCR polygon cannot be normalized")
    normalized: list[tuple[float, float]] = []
    for point in polygon:
        if len(point) != 2:
            raise LayoutError("OCR polygon point must contain two coordinates")
        x = float(point[0])
        y = float(point[1])
        if not math.isfinite(x) or not math.isfinite(y):
            raise LayoutError("OCR polygon coordinates must be finite")
        if not 0.0 <= x <= width or not 0.0 <= y <= height:
            raise LayoutError("OCR polygon lies outside its image")
        normalized.append((x / width, y / height))
    return tuple(normalized)


def _line_axis(
    polygon: Sequence[Sequence[float]],
) -> Literal[0, 90] | None:
    edges: list[tuple[float, float, float]] = []
    for index in range(4):
        first = polygon[index]
        second = polygon[(index + 1) % 4]
        dx = float(second[0]) - float(first[0])
        dy = float(second[1]) - float(first[1])
        edges.append((math.hypot(dx, dy), dx, dy))
    _length, dx, dy = max(edges, key=lambda edge: edge[0])
    if dx == 0.0 and dy == 0.0:
        return None
    angle = math.degrees(math.atan2(dy, dx)) % 180.0
    distance_zero = min(angle, 180.0 - angle)
    distance_ninety = abs(angle - 90.0)
    if distance_zero <= 15.0:
        return 0
    if distance_ninety <= 15.0:
        return 90
    return None


def _orientation(
    candidate: ExtractedLineCandidate,
    *,
    rotated_by: int = 0,
) -> Literal[0, 90, 180, 270] | None:
    axis = _line_axis(candidate.polygon)
    if axis is None:
        return None
    value = (axis + candidate.correction180 - rotated_by) % 360
    if value not in (0, 90, 180, 270):
        raise LayoutError("OCR orientation is unsupported")
    return value


def _center(box: NormalizedBox) -> tuple[float, float]:
    return ((box.x0 + box.x1) / 2.0, (box.y0 + box.y1) / 2.0)


def _inside_region(box: NormalizedBox, region: ManifestTableRegion) -> bool:
    center_x, center_y = _center(box)
    x0, y0, x1, y1 = region.box
    return x0 <= center_x <= x1 and y0 <= center_y <= y1


def _region_index(
    box: NormalizedBox,
    regions: Sequence[ManifestTableRegion],
) -> int | None:
    for index, region in enumerate(regions):
        if _inside_region(box, region):
            return index
    return None


def _classify_role(
    *,
    box: NormalizedBox,
    orientation: int | None,
    content_class: str,
    region_index: int | None,
) -> Literal["body", "header", "footer", "table"]:
    if content_class == "table" or region_index is not None or orientation in (90, 270):
        return "table"
    _center_x, center_y = _center(box)
    if center_y < 0.07:
        return "header"
    if center_y > 0.95:
        return "footer"
    return "body"


def _primary_lines(
    rendered_leaf: RenderedLeaf,
    candidates: Sequence[ExtractedLineCandidate],
) -> list[_LayoutLine]:
    regions = rendered_leaf.candidate.table_regions
    rotated_region_indexes = {
        index for index, region in enumerate(regions) if region.ocrRotationDegrees is not None
    }
    lines: list[_LayoutLine] = []
    for candidate in _deduplicate(candidates):
        polygon = _normalize_polygon(
            candidate.polygon,
            rendered_leaf.width_px,
            rendered_leaf.height_px,
        )
        box = _polygon_box(polygon)
        region_index = _region_index(box, regions)
        if region_index in rotated_region_indexes:
            continue
        orientation = _orientation(candidate)
        role = _classify_role(
            box=box,
            orientation=orientation,
            content_class=rendered_leaf.candidate.content_class,
            region_index=region_index,
        )
        lines.append(
            _LayoutLine(
                original_text=candidate.originalText,
                confidence=float(candidate.confidence),
                correction180=candidate.correction180,
                polygon=polygon,
                box=box,
                orientation=orientation,
                role=role,
                region_index=region_index,
                local_sort_box=box,
            )
        )
    return lines


def _region_pixel_dimensions(
    rendered_leaf: RenderedLeaf,
    region: ManifestTableRegion,
) -> tuple[int, int]:
    x0 = max(0, min(rendered_leaf.width_px, round(region.box[0] * rendered_leaf.width_px)))
    y0 = max(0, min(rendered_leaf.height_px, round(region.box[1] * rendered_leaf.height_px)))
    x1 = max(0, min(rendered_leaf.width_px, round(region.box[2] * rendered_leaf.width_px)))
    y1 = max(0, min(rendered_leaf.height_px, round(region.box[3] * rendered_leaf.height_px)))
    width = x1 - x0
    height = y1 - y0
    if width < 1 or height < 1:
        raise LayoutError("table region crop is empty")
    if region.ocrRotationDegrees in (90, 270):
        width, height = height, width
    return width, height


def _inverse_region_point(
    point: tuple[float, float],
    rotation: int,
) -> tuple[float, float]:
    u, v = point
    if rotation == 90:
        return (v, 1.0 - u)
    if rotation == 270:
        return (1.0 - v, u)
    raise LayoutError("rotated table region must use 90 or 270 degrees")


def _rotated_region_lines(
    rendered_leaf: RenderedLeaf,
    rotated_table_lines: Mapping[int, Sequence[ExtractedLineCandidate]] | None,
) -> list[_LayoutLine]:
    regions = rendered_leaf.candidate.table_regions
    expected_indexes = {
        index for index, region in enumerate(regions) if region.ocrRotationDegrees is not None
    }
    supplied = {} if rotated_table_lines is None else dict(rotated_table_lines)
    if set(supplied) != expected_indexes or any(
        isinstance(index, bool) or not isinstance(index, int) for index in supplied
    ):
        raise LayoutError("rotated table OCR must match declared regions exactly")

    lines: list[_LayoutLine] = []
    for index in sorted(expected_indexes):
        region = regions[index]
        rotation = region.ocrRotationDegrees
        if rotation is None:
            raise LayoutError("rotated table region is missing its rotation")
        width, height = _region_pixel_dimensions(rendered_leaf, region)
        for candidate in _deduplicate(supplied[index]):
            local_polygon = _normalize_polygon(candidate.polygon, width, height)
            original_local = tuple(
                _inverse_region_point(point, rotation) for point in local_polygon
            )
            region_x0, region_y0, region_x1, region_y1 = region.box
            region_width = region_x1 - region_x0
            region_height = region_y1 - region_y0
            polygon = tuple(
                (
                    region_x0 + u * region_width,
                    region_y0 + v * region_height,
                )
                for u, v in original_local
            )
            box = _polygon_box(polygon)
            lines.append(
                _LayoutLine(
                    original_text=candidate.originalText,
                    confidence=float(candidate.confidence),
                    correction180=candidate.correction180,
                    polygon=polygon,
                    box=box,
                    orientation=_orientation(candidate, rotated_by=rotation),
                    role="table",
                    region_index=index,
                    local_sort_box=_polygon_box(local_polygon),
                )
            )
    return lines


def _polygon_key(line: _LayoutLine) -> tuple[tuple[float, float], ...]:
    return line.polygon


def _line_sort_key(line: _LayoutLine) -> tuple[object, ...]:
    return (
        line.box.y0,
        line.box.x0,
        line.box.y1,
        line.box.x1,
        line.original_text,
        _polygon_key(line),
        line.confidence,
        line.correction180,
    )


def _local_line_sort_key(line: _LayoutLine) -> tuple[object, ...]:
    box = line.local_sort_box
    return (
        box.y0,
        box.x0,
        box.y1,
        box.x1,
        line.original_text,
        _polygon_key(line),
        line.confidence,
        line.correction180,
    )


def _envelope(lines: Sequence[_LayoutLine]) -> NormalizedBox:
    return NormalizedBox(
        x0=min(line.box.x0 for line in lines),
        y0=min(line.box.y0 for line in lines),
        x1=max(line.box.x1 for line in lines),
        y1=max(line.box.y1 for line in lines),
    )


def _content_blocks(
    lines: Sequence[_LayoutLine],
    rendered_leaf: RenderedLeaf,
) -> list[_ContentBlock]:
    regions = rendered_leaf.candidate.table_regions
    body_lines = [line for line in lines if line.role == "body"]
    table_lines = [line for line in lines if line.role == "table"]
    blocks = [_ContentBlock(lines=(line,), box=line.box) for line in body_lines]

    grouped_indexes: set[int] = set()
    for index, region in enumerate(regions):
        members = [line for line in table_lines if line.region_index == index]
        if not members:
            continue
        grouped_indexes.add(index)
        ordered = tuple(sorted(members, key=_local_line_sort_key))
        blocks.append(_ContentBlock(lines=ordered, box=_normalized_region_box(region)))

    ungrouped = [
        line
        for line in table_lines
        if line.region_index is None or line.region_index not in grouped_indexes
    ]
    if rendered_leaf.candidate.content_class == "table" and not regions and ungrouped:
        ordered = tuple(sorted(ungrouped, key=_line_sort_key))
        blocks.append(_ContentBlock(lines=ordered, box=_envelope(ordered)))
    else:
        blocks.extend(_ContentBlock(lines=(line,), box=line.box) for line in ungrouped)
    return blocks


def _normalized_region_box(region: ManifestTableRegion) -> NormalizedBox:
    return NormalizedBox(
        x0=region.box[0],
        y0=region.box[1],
        x1=region.box[2],
        y1=region.box[3],
    )


def _block_sort_key(block: _ContentBlock) -> tuple[object, ...]:
    return (
        block.box.y0,
        block.box.x0,
        block.box.y1,
        block.box.x1,
        tuple(_line_sort_key(line) for line in block.lines),
    )


def _is_transverse(block: _ContentBlock) -> bool:
    return (
        block.box.x0 < 0.5 < block.box.x1
        and block.box.x1 - block.box.x0 > 0.65
    )


def _emit_band(blocks: Sequence[_ContentBlock]) -> list[_LayoutLine]:
    left: list[_ContentBlock] = []
    right: list[_ContentBlock] = []
    for block in blocks:
        center_x, _center_y = _center(block.box)
        (left if center_x < 0.5 else right).append(block)
    emitted: list[_LayoutLine] = []
    for column in (left, right):
        for block in sorted(column, key=_block_sort_key):
            emitted.extend(block.lines)
    return emitted


def _ordered_lines(lines: Sequence[_LayoutLine], rendered_leaf: RenderedLeaf) -> list[_LayoutLine]:
    headers = sorted((line for line in lines if line.role == "header"), key=_line_sort_key)
    footers = sorted((line for line in lines if line.role == "footer"), key=_line_sort_key)
    blocks = _content_blocks(lines, rendered_leaf)
    transverse = sorted((block for block in blocks if _is_transverse(block)), key=_block_sort_key)
    remaining = sorted((block for block in blocks if not _is_transverse(block)), key=_block_sort_key)

    content: list[_LayoutLine] = []
    for divider in transverse:
        divider_key = _block_sort_key(divider)
        band = [block for block in remaining if _block_sort_key(block) < divider_key]
        remaining = [block for block in remaining if _block_sort_key(block) >= divider_key]
        content.extend(_emit_band(band))
        content.extend(divider.lines)
    content.extend(_emit_band(remaining))
    return [*headers, *content, *footers]


def _foreground_ratio(rendered_leaf: RenderedLeaf) -> float:
    expected_bytes = rendered_leaf.width_px * rendered_leaf.height_px * 3
    if len(rendered_leaf.rgb_bytes) != expected_bytes:
        raise LayoutError("rendered RGB byte length does not match its dimensions")
    rgb = np.frombuffer(rendered_leaf.rgb_bytes, dtype=np.uint8).reshape(
        rendered_leaf.height_px,
        rendered_leaf.width_px,
        3,
    )
    rgb_u32 = rgb.astype(np.uint32)
    gray = (
        299 * rgb_u32[:, :, 0]
        + 587 * rgb_u32[:, :, 1]
        + 114 * rgb_u32[:, :, 2]
    ) // 1000
    return float(np.count_nonzero(gray < 245) / (rendered_leaf.width_px * rendered_leaf.height_px))


def _quality(
    lines: Sequence[_LayoutLine],
    foreground_ratio: float,
    manifest: MadozManifest,
    rendered_leaf: RenderedLeaf,
) -> tuple[float, float, float, list[QualityFlag]]:
    total_characters = sum(len(line.original_text) for line in lines)
    blank = foreground_ratio < 0.005 and total_characters == 0
    if blank:
        mean_confidence = 1.0
        low_confidence_ratio = 0.0
        quality_score = 1.0
    elif total_characters == 0:
        mean_confidence = 0.0
        low_confidence_ratio = 1.0
        quality_score = 0.0
    else:
        mean_confidence = sum(
            len(line.original_text) * line.confidence for line in lines
        ) / total_characters
        low_characters = sum(
            len(line.original_text)
            for line in lines
            if line.confidence < manifest.processing.lowConfidenceThreshold
        )
        low_confidence_ratio = low_characters / total_characters
        quality_score = max(
            0.0,
            min(
                1.0,
                0.7 * mean_confidence + 0.3 * (1.0 - low_confidence_ratio),
            ),
        )

    flags: list[QualityFlag] = []
    if blank:
        flags.append("blank")
    if mean_confidence < 0.75 or low_confidence_ratio > 0.25:
        flags.append("low_confidence")
    horizontal_count = sum(line.orientation in (0, 180) for line in lines)
    vertical_count = sum(line.orientation in (90, 270) for line in lines)
    if horizontal_count >= 3 and vertical_count >= 3:
        flags.append("mixed_orientation")
    publishable_characters = sum(
        len(line.original_text) for line in lines if line.role not in ("header", "footer")
    )
    table_characters = sum(
        len(line.original_text) for line in lines if line.role == "table"
    )
    if publishable_characters and table_characters / publishable_characters >= 0.25:
        flags.append("table_heavy")
    if rendered_leaf.candidate.rotation_degrees != 0:
        flags.append("rotation_applied")
    if any(
        line.role == "body"
        and len(line.original_text) > manifest.processing.maxChunkChars
        for line in lines
    ):
        flags.append("oversize_body_line")
    return mean_confidence, low_confidence_ratio, quality_score, sorted(flags)


def _validate_page_inputs(
    inventory_record: PageInventoryRecord,
    rendered_leaf: RenderedLeaf,
) -> int:
    candidate = rendered_leaf.candidate
    if inventory_record.canonicalStatus != "include" or inventory_record.canonicalSequenceIndex is None:
        raise LayoutError("layout accepts only included inventory pages")
    if inventory_record.pdfPage != candidate.pdf_page or inventory_record.side != candidate.side:
        raise LayoutError("inventory record does not match the rendered leaf")
    if rendered_leaf.width_px < 1 or rendered_leaf.height_px < 1:
        raise LayoutError("rendered leaf dimensions are invalid")
    return inventory_record.canonicalSequenceIndex


def _embedded_lines(
    rendered_leaf: RenderedLeaf,
    embedded_lines: Sequence[EmbeddedTextLine],
    *,
    confidence: float,
) -> list[_LayoutLine]:
    lines: list[_LayoutLine] = []
    for embedded in embedded_lines:
        if not isinstance(embedded, EmbeddedTextLine):
            raise LayoutError("embedded input must contain EmbeddedTextLine values")
        if not embedded.text.strip():
            continue
        try:
            x0, y0, x1, y1 = embedded.box
        except (TypeError, ValueError) as exc:
            raise LayoutError("embedded box is invalid") from exc
        try:
            box = NormalizedBox(x0=float(x0), y0=float(y0), x1=float(x1), y1=float(y1))
        except (ValidationError, ValueError, TypeError) as exc:
            raise LayoutError("embedded box is invalid") from exc
        polygon = ((box.x0, box.y0), (box.x1, box.y0), (box.x1, box.y1), (box.x0, box.y1))
        role = _classify_role(
            box=box,
            orientation=0,
            content_class=rendered_leaf.candidate.content_class,
            region_index=None,
        )
        lines.append(
            _LayoutLine(
                original_text=embedded.text,
                confidence=float(confidence),
                correction180=0,
                polygon=polygon,
                box=box,
                orientation=0,
                role=role,
                region_index=None,
                local_sort_box=box,
            )
        )
    return lines


def _build_final_page(
    manifest: MadozManifest,
    inventory_record: PageInventoryRecord,
    rendered_leaf: RenderedLeaf,
    ordered: list[_LayoutLine],
    *,
    logical_page_number: int,
    foreground_ratio: float,
    text_source: Literal["ppocrv6", "embedded"],
    ocr_engine: Literal["transformers", "pymupdf"],
    ocr_engine_version: str,
    ocr_detection_model: str,
    ocr_recognition_model: str,
    additional_quality_flags: Sequence[QualityFlag] = (),
) -> SourcePageInput:
    mean_confidence, low_confidence_ratio, quality_score, quality_flags = _quality(
        ordered,
        foreground_ratio,
        manifest,
        rendered_leaf,
    )
    merged_flags = sorted(set(quality_flags) | set(additional_quality_flags))

    candidate = rendered_leaf.candidate
    crop_box = NormalizedBox(
        x0=candidate.crop_box[0],
        y0=candidate.crop_box[1],
        x1=candidate.crop_box[2],
        y1=candidate.crop_box[3],
    )
    image_sha256 = f"sha256:{rendered_leaf.image_sha256}"
    page_id = compute_page_id(
        manifest.document.documentId,
        candidate.pdf_page,
        candidate.side,
        crop_box,
        candidate.rotation_degrees,
        image_sha256,
    )
    source_lines: list[SourceLineInput] = []
    for line_order, line in enumerate(ordered):
        line_id = compute_line_id(page_id, line_order, line.original_text, line.box)
        source_lines.append(
            SourceLineInput(
                lineId=line_id,
                logicalPageNumber=logical_page_number,
                lineOrder=line_order,
                originalText=line.original_text,
                confidence=line.confidence,
                box=line.box,
                orientationDegrees=line.orientation,
                role=line.role,
            )
        )

    try:
        return SourcePageInput(
            pageId=page_id,
            documentId=manifest.document.documentId,
            logicalPageNumber=logical_page_number,
            sourcePdfPageNumber=candidate.pdf_page,
            leafSide=candidate.side,
            continuityBreakBefore=inventory_record.continuityBreakBefore,
            cropBox=crop_box,
            printedPageLabel=inventory_record.normalizedPrintedLabel,
            widthPx=rendered_leaf.width_px,
            heightPx=rendered_leaf.height_px,
            renderDpi=rendered_leaf.render_dpi,
            rasterizationPolicy=rendered_leaf.rasterization_policy,
            rotationDegrees=candidate.rotation_degrees,
            imageSha256=image_sha256,
            contentClass=candidate.content_class,
            foregroundRatio=foreground_ratio,
            textSource=text_source,
            ocrEngine=ocr_engine,
            ocrEngineVersion=ocr_engine_version,
            ocrDetectionModel=ocr_detection_model,
            ocrRecognitionModel=ocr_recognition_model,
            meanConfidence=mean_confidence,
            lowConfidenceRatio=low_confidence_ratio,
            qualityScore=quality_score,
            qualityFlags=merged_flags,
            originalText="\n".join(line.originalText for line in source_lines),
            lines=source_lines,
        )
    except (ValidationError, ValueError, TypeError) as exc:
        raise LayoutError("source page layout is invalid") from exc


def build_source_page(
    manifest: MadozManifest,
    inventory_record: PageInventoryRecord,
    rendered_leaf: RenderedLeaf,
    primary_lines: Sequence[ExtractedLineCandidate],
    *,
    rotated_table_lines: Mapping[int, Sequence[ExtractedLineCandidate]] | None = None,
    ocr_engine_version: str = "3.7.0",
    additional_quality_flags: Sequence[QualityFlag] = (),
) -> SourcePageInput:
    logical_page_number = _validate_page_inputs(inventory_record, rendered_leaf)
    foreground_ratio = _foreground_ratio(rendered_leaf)
    lines = _primary_lines(rendered_leaf, primary_lines)
    lines.extend(_rotated_region_lines(rendered_leaf, rotated_table_lines))
    if len(lines) > 1000:
        raise LayoutError("page contains more than 1000 OCR lines")
    ordered = _ordered_lines(lines, rendered_leaf)
    return _build_final_page(
        manifest,
        inventory_record,
        rendered_leaf,
        ordered,
        logical_page_number=logical_page_number,
        foreground_ratio=foreground_ratio,
        text_source="ppocrv6",
        ocr_engine=manifest.processing.ocrEngine,
        ocr_engine_version=ocr_engine_version,
        ocr_detection_model=manifest.processing.ocrDetectionModel,
        ocr_recognition_model=manifest.processing.ocrRecognitionModel,
        additional_quality_flags=additional_quality_flags,
    )


def build_embedded_source_page(
    manifest: MadozManifest,
    inventory_record: PageInventoryRecord,
    rendered_leaf: RenderedLeaf,
    embedded_lines: Sequence[EmbeddedTextLine],
    *,
    confidence: float,
    pymupdf_version: str,
) -> SourcePageInput:
    logical_page_number = _validate_page_inputs(inventory_record, rendered_leaf)
    candidate = rendered_leaf.candidate
    if manifest.processing.textMode != "embedded_first":
        raise LayoutError("embedded layout requires embedded_first text mode")
    if candidate.content_class != "normal":
        raise LayoutError("embedded pages must have normal content class")
    if candidate.table_regions:
        raise LayoutError("embedded pages must not declare table regions")
    if isinstance(confidence, bool) or not isinstance(confidence, (int, float)):
        raise LayoutError("embedded confidence must be a number")
    if not math.isfinite(confidence) or not 0.0 <= confidence <= 1.0:
        raise LayoutError("embedded confidence must be finite and within [0, 1]")
    if not isinstance(pymupdf_version, str) or not pymupdf_version.strip():
        raise LayoutError("embedded pymupdf version must be a nonblank string")

    foreground_ratio = _foreground_ratio(rendered_leaf)
    lines = _embedded_lines(rendered_leaf, embedded_lines, confidence=confidence)
    if not lines:
        raise LayoutError("embedded page produced no usable lines")
    if len(lines) > 1000:
        raise LayoutError("page contains more than 1000 OCR lines")
    ordered = _ordered_lines(lines, rendered_leaf)
    return _build_final_page(
        manifest,
        inventory_record,
        rendered_leaf,
        ordered,
        logical_page_number=logical_page_number,
        foreground_ratio=foreground_ratio,
        text_source="embedded",
        ocr_engine="pymupdf",
        ocr_engine_version=pymupdf_version,
        ocr_detection_model="pdf-text-layer",
        ocr_recognition_model="pdf-text-layer",
    )
