from __future__ import annotations

import hashlib
import os
import re
import stat
import tempfile
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Literal, Sequence

import numpy as np
import pymupdf

from .manifest import MadozManifest, ManifestTableRegion


_SHA256_RE = re.compile(r"^[0-9a-f]{64}$")
_COPY_BLOCK_SIZE = 1024 * 1024
_RASTERIZATION_POLICY = "pymupdf-page-render-v1"
LeafSide = Literal["left", "right", "full"]


class PdfSourceError(RuntimeError):
    """A local PDF source failed a deterministic safety or integrity check."""


@dataclass(frozen=True)
class CandidateLeaf:
    pdf_page: int
    side: LeafSide
    crop_box: tuple[float, float, float, float]
    rotation_degrees: Literal[0, 90, 180, 270]
    content_class: str
    table_regions: tuple[ManifestTableRegion, ...]


@dataclass(frozen=True)
class EmbeddedWord:
    text: str
    box: tuple[float, float, float, float]
    block_index: int = 0
    line_index: int = 0
    word_index: int = 0


@dataclass(frozen=True)
class EmbeddedTextLine:
    text: str
    box: tuple[float, float, float, float]
    block_index: int
    line_index: int


@dataclass(frozen=True)
class DominantRasterMetadata:
    width_px: int | None
    height_px: int | None
    bits_per_component: int | None
    filter: str | None
    declared_dpi_x: float | None
    declared_dpi_y: float | None


@dataclass(frozen=True)
class RenderedLeaf:
    candidate: CandidateLeaf
    width_px: int
    height_px: int
    render_dpi: int
    rasterization_policy: str
    rgb_bytes: bytes
    image_sha256: str
    visual_dhash64: str
    embedded_words: tuple[EmbeddedWord, ...]
    dominant_raster: DominantRasterMetadata | None
    media_box: tuple[float, float, float, float]
    pdf_rotation_degrees: Literal[0, 90, 180, 270]


def _validate_expected_sha256(expected_sha256: str) -> None:
    if not _SHA256_RE.fullmatch(expected_sha256):
        raise PdfSourceError("expected SHA-256 must be 64 lowercase hexadecimal characters")


def _regular_file(path: Path, *, label: str) -> tuple[Path, os.stat_result]:
    try:
        if path.is_symlink():
            raise PdfSourceError(f"{label} must not be a symlink")
        resolved = path.resolve(strict=True)
        metadata = resolved.stat()
    except PdfSourceError:
        raise
    except OSError:
        raise PdfSourceError(f"{label} must be a readable regular file") from None
    if not stat.S_ISREG(metadata.st_mode):
        raise PdfSourceError(f"{label} must be a readable regular file")
    return resolved, metadata


def _open_readonly_no_follow(path: Path) -> int:
    flags = os.O_RDONLY
    if hasattr(os, "O_NOFOLLOW"):
        flags |= os.O_NOFOLLOW
    return os.open(path, flags)


def _stream_sha256(path: Path) -> str:
    digest = hashlib.sha256()
    try:
        descriptor = _open_readonly_no_follow(path)
        with os.fdopen(descriptor, "rb") as handle:
            before = os.fstat(handle.fileno())
            if not stat.S_ISREG(before.st_mode):
                raise PdfSourceError("PDF source must be a regular file")
            for block in iter(lambda: handle.read(_COPY_BLOCK_SIZE), b""):
                digest.update(block)
            after = os.fstat(handle.fileno())
    except PdfSourceError:
        raise
    except OSError:
        raise PdfSourceError("unable to read PDF source") from None
    if (before.st_size, before.st_mtime_ns) != (after.st_size, after.st_mtime_ns):
        raise PdfSourceError("PDF source changed while hashing")
    return digest.hexdigest()


@lru_cache(maxsize=16)
def _cached_sha_verification(
    resolved_path: str,
    size: int,
    mtime_ns: int,
    expected_sha256: str,
) -> None:
    del size, mtime_ns
    if _stream_sha256(Path(resolved_path)) != expected_sha256:
        raise PdfSourceError("PDF source SHA-256 does not match the expected value")


def verify_pdf_sha256(path: str | Path, expected_sha256: str) -> None:
    _validate_expected_sha256(expected_sha256)
    resolved, metadata = _regular_file(Path(path), label="PDF source")
    _cached_sha_verification(
        str(resolved), metadata.st_size, metadata.st_mtime_ns, expected_sha256
    )


def clear_sha_verification_cache() -> None:
    _cached_sha_verification.cache_clear()


def sha_verification_cache_info():
    return _cached_sha_verification.cache_info()


def _fsync_directory(directory: Path) -> None:
    flags = os.O_RDONLY
    if hasattr(os, "O_DIRECTORY"):
        flags |= os.O_DIRECTORY
    descriptor = os.open(directory, flags)
    try:
        os.fsync(descriptor)
    finally:
        os.close(descriptor)


def _existing_destination_matches(destination: Path, expected_sha256: str) -> bool:
    if destination.is_symlink():
        raise PdfSourceError("canonical destination must not be a symlink")
    if not destination.exists():
        return False
    try:
        verify_pdf_sha256(destination, expected_sha256)
    except PdfSourceError:
        raise PdfSourceError(
            "canonical destination already exists with different SHA-256"
        ) from None
    return True


def copy_canonical_pdf(
    source: str | Path,
    destination: str | Path,
    expected_sha256: str,
) -> Path:
    _validate_expected_sha256(expected_sha256)
    source_path, source_metadata = _regular_file(Path(source), label="PDF source")
    destination_path = Path(destination)
    destination_path.parent.mkdir(parents=True, exist_ok=True)
    if _existing_destination_matches(destination_path, expected_sha256):
        return destination_path

    descriptor, temporary_name = tempfile.mkstemp(
        dir=destination_path.parent,
        prefix=f".{destination_path.name}.tmp-",
    )
    temporary_path = Path(temporary_name)
    digest = hashlib.sha256()
    try:
        os.chmod(temporary_path, 0o600)
        with os.fdopen(descriptor, "wb") as destination_handle:
            source_descriptor = _open_readonly_no_follow(source_path)
            with os.fdopen(source_descriptor, "rb") as source_handle:
                before = os.fstat(source_handle.fileno())
                for block in iter(lambda: source_handle.read(_COPY_BLOCK_SIZE), b""):
                    digest.update(block)
                    destination_handle.write(block)
                after = os.fstat(source_handle.fileno())
            destination_handle.flush()
            os.fsync(destination_handle.fileno())
        if (before.st_size, before.st_mtime_ns) != (
            after.st_size,
            after.st_mtime_ns,
        ) or (after.st_size, after.st_mtime_ns) != (
            source_metadata.st_size,
            source_metadata.st_mtime_ns,
        ):
            raise PdfSourceError("PDF source changed while copying")
        if digest.hexdigest() != expected_sha256:
            raise PdfSourceError("PDF source SHA-256 does not match the expected value")
        if _existing_destination_matches(destination_path, expected_sha256):
            return destination_path
        os.replace(temporary_path, destination_path)
        _fsync_directory(destination_path.parent)
        clear_sha_verification_cache()
        return destination_path
    except PdfSourceError:
        raise
    except OSError:
        raise PdfSourceError("unable to create canonical PDF copy") from None
    finally:
        try:
            temporary_path.unlink(missing_ok=True)
        except OSError:
            pass


def crop_box_for_side(
    side: LeafSide,
    gutter_ratio: float,
    inner_gutter_trim_ratio: float,
) -> tuple[float, float, float, float]:
    if side == "full":
        return (0.0, 0.0, 1.0, 1.0)
    if side == "left":
        return (0.0, 0.0, gutter_ratio - inner_gutter_trim_ratio, 1.0)
    if side == "right":
        return (gutter_ratio + inner_gutter_trim_ratio, 0.0, 1.0, 1.0)
    raise PdfSourceError("candidate side must be left, right, or full")


def candidate_leaves(manifest: MadozManifest) -> list[CandidateLeaf]:
    selection = manifest.selection
    overrides = {
        (override.pdfPage, override.side): override
        for override in selection.leafOverrides
    }
    sides: tuple[LeafSide, ...] = (
        ("left", "right") if selection.splitSpreads else ("full",)
    )
    candidates: list[CandidateLeaf] = []
    for page_range in selection.candidatePdfPageRanges:
        for pdf_page in range(page_range.start, page_range.end + 1):
            for side in sides:
                override = overrides.get((pdf_page, side))
                candidates.append(
                    CandidateLeaf(
                        pdf_page=pdf_page,
                        side=side,
                        crop_box=crop_box_for_side(
                            side,
                            selection.gutterRatio,
                            selection.innerGutterTrimRatio,
                        ),
                        rotation_degrees=(
                            override.rotationDegrees if override is not None else 0
                        ),
                        content_class=(
                            override.contentClass if override is not None else "normal"
                        ),
                        table_regions=(
                            tuple(override.tableRegions)
                            if override is not None
                            else ()
                        ),
                    )
                )
    return candidates


def _pixel_crop(
    rgb: np.ndarray,
    crop_box: tuple[float, float, float, float],
) -> np.ndarray:
    height, width, _channels = rgb.shape
    x0 = max(0, min(width, round(crop_box[0] * width)))
    y0 = max(0, min(height, round(crop_box[1] * height)))
    x1 = max(0, min(width, round(crop_box[2] * width)))
    y1 = max(0, min(height, round(crop_box[3] * height)))
    if x1 <= x0 or y1 <= y0:
        raise PdfSourceError("candidate crop is empty")
    return rgb[y0:y1, x0:x1, :]


def _rotate_clockwise(rgb: np.ndarray, degrees: int) -> np.ndarray:
    if degrees not in (0, 90, 180, 270):
        raise PdfSourceError("candidate rotation must be 0, 90, 180, or 270")
    if degrees:
        return np.rot90(rgb, k=-(degrees // 90))
    return rgb


def dhash64(rgb_bytes: bytes, *, width: int, height: int) -> str:
    if width <= 0 or height <= 0 or len(rgb_bytes) != width * height * 3:
        raise PdfSourceError("RGB dimensions do not match the supplied bytes")
    rgb = np.frombuffer(rgb_bytes, dtype=np.uint8).reshape(height, width, 3)
    y_indexes = np.rint(np.linspace(0, height - 1, 8)).astype(np.intp)
    x_indexes = np.rint(np.linspace(0, width - 1, 9)).astype(np.intp)
    sample = rgb[np.ix_(y_indexes, x_indexes)]
    gray = (
        sample[:, :, 0].astype(np.uint32) * 299
        + sample[:, :, 1].astype(np.uint32) * 587
        + sample[:, :, 2].astype(np.uint32) * 114
    )
    comparisons = gray[:, :-1] > gray[:, 1:]
    value = 0
    for bit in comparisons.reshape(-1):
        value = (value << 1) | int(bit)
    return f"{value:016x}"


def _rotate_normalized_box(
    box: tuple[float, float, float, float],
    degrees: int,
) -> tuple[float, float, float, float]:
    x0, y0, x1, y1 = box
    corners = ((x0, y0), (x1, y0), (x0, y1), (x1, y1))
    if degrees == 0:
        rotated = corners
    elif degrees == 90:
        rotated = tuple((1.0 - y, x) for x, y in corners)
    elif degrees == 180:
        rotated = tuple((1.0 - x, 1.0 - y) for x, y in corners)
    else:
        rotated = tuple((y, 1.0 - x) for x, y in corners)
    xs = [point[0] for point in rotated]
    ys = [point[1] for point in rotated]
    return (min(xs), min(ys), max(xs), max(ys))


def _embedded_words(page: pymupdf.Page, candidate: CandidateLeaf) -> tuple[EmbeddedWord, ...]:
    page_rect = page.rect
    if page_rect.width <= 0 or page_rect.height <= 0:
        return ()
    crop_x0, crop_y0, crop_x1, crop_y1 = candidate.crop_box
    crop_width = crop_x1 - crop_x0
    crop_height = crop_y1 - crop_y0
    words: list[EmbeddedWord] = []
    for raw in page.get_text("words"):
        rect = pymupdf.Rect(raw[0], raw[1], raw[2], raw[3])
        if page.rotation:
            rect = rect * page.rotation_matrix
        normalized = (
            rect.x0 / page_rect.width,
            rect.y0 / page_rect.height,
            rect.x1 / page_rect.width,
            rect.y1 / page_rect.height,
        )
        x0 = max(crop_x0, normalized[0])
        y0 = max(crop_y0, normalized[1])
        x1 = min(crop_x1, normalized[2])
        y1 = min(crop_y1, normalized[3])
        if x1 <= x0 or y1 <= y0:
            continue
        local_box = (
            (x0 - crop_x0) / crop_width,
            (y0 - crop_y0) / crop_height,
            (x1 - crop_x0) / crop_width,
            (y1 - crop_y0) / crop_height,
        )
        words.append(
            EmbeddedWord(
                text=str(raw[4]),
                box=_rotate_normalized_box(local_box, candidate.rotation_degrees),
                block_index=int(raw[5]),
                line_index=int(raw[6]),
                word_index=int(raw[7]),
            )
        )
    return tuple(words)


def embedded_text_lines(
    words: Sequence[EmbeddedWord],
) -> tuple[EmbeddedTextLine, ...]:
    groups: dict[tuple[int, int], list[EmbeddedWord]] = {}
    for word in words:
        if not word.text:
            continue
        key = (word.block_index, word.line_index)
        groups.setdefault(key, []).append(word)
    lines: list[EmbeddedTextLine] = []
    for (block_index, line_index) in sorted(groups):
        ordered = sorted(groups[(block_index, line_index)], key=lambda w: w.word_index)
        text = " ".join(w.text for w in ordered)
        x0 = min(w.box[0] for w in ordered)
        y0 = min(w.box[1] for w in ordered)
        x1 = max(w.box[2] for w in ordered)
        y1 = max(w.box[3] for w in ordered)
        lines.append(
            EmbeddedTextLine(
                text=text,
                box=(x0, y0, x1, y1),
                block_index=block_index,
                line_index=line_index,
            )
        )
    return tuple(lines)


def _optional_positive_float(value: object) -> float | None:
    if isinstance(value, (int, float)) and not isinstance(value, bool) and value > 0:
        return float(value)
    return None


def _dominant_raster(page: pymupdf.Page) -> DominantRasterMetadata | None:
    images = page.get_image_info(xrefs=True)
    if not images:
        return None
    selected = max(
        images,
        key=lambda image: (
            int(image.get("width") or 0) * int(image.get("height") or 0),
            int(image.get("width") or 0),
            int(image.get("height") or 0),
            -int(image.get("xref") or 0),
        ),
    )
    filters = {
        int(image[0]): str(image[8]) if image[8] else None
        for image in page.get_images(full=True)
    }
    xref = int(selected.get("xref") or 0)
    return DominantRasterMetadata(
        width_px=int(selected["width"]) if selected.get("width") else None,
        height_px=int(selected["height"]) if selected.get("height") else None,
        bits_per_component=int(selected["bpc"]) if selected.get("bpc") else None,
        filter=filters.get(xref),
        declared_dpi_x=_optional_positive_float(selected.get("xres")),
        declared_dpi_y=_optional_positive_float(selected.get("yres")),
    )


def _render_candidate(
    page: pymupdf.Page,
    candidate: CandidateLeaf,
    *,
    dpi: int,
    rasterization_policy: str,
) -> RenderedLeaf:
    rotation = page.rotation
    if rotation not in (0, 90, 180, 270):
        raise PdfSourceError("unexpected PDF page rotation")
    media_box = (float(page.mediabox.x0), float(page.mediabox.y0), float(page.mediabox.x1), float(page.mediabox.y1))
    scale = dpi / 72.0
    pixmap = page.get_pixmap(
        matrix=pymupdf.Matrix(scale, scale),
        colorspace=pymupdf.csRGB,
        alpha=False,
    )
    full_rgb = np.frombuffer(pixmap.samples, dtype=np.uint8).copy()
    full_rgb = full_rgb.reshape(pixmap.height, pixmap.width, 3)
    del pixmap
    cropped = _pixel_crop(full_rgb, candidate.crop_box)
    del full_rgb
    oriented = np.ascontiguousarray(
        _rotate_clockwise(cropped, candidate.rotation_degrees)
    )
    del cropped
    height, width, _channels = oriented.shape
    rgb_bytes = oriented.tobytes()
    return RenderedLeaf(
        candidate=candidate,
        width_px=width,
        height_px=height,
        render_dpi=dpi,
        rasterization_policy=rasterization_policy,
        rgb_bytes=rgb_bytes,
        image_sha256=hashlib.sha256(rgb_bytes).hexdigest(),
        visual_dhash64=dhash64(rgb_bytes, width=width, height=height),
        embedded_words=_embedded_words(page, candidate),
        dominant_raster=_dominant_raster(page),
        media_box=media_box,
        pdf_rotation_degrees=rotation,
    )


def _open_pdf(path: str | Path) -> pymupdf.Document:
    resolved, _metadata = _regular_file(Path(path), label="PDF source")
    try:
        document = pymupdf.open(resolved)
    except Exception:
        raise PdfSourceError("PDF source is invalid or unreadable") from None
    if not document.is_pdf:
        document.close()
        raise PdfSourceError("PDF source is not a PDF document")
    if document.needs_pass:
        document.close()
        raise PdfSourceError("encrypted PDF sources are not supported")
    return document


def iter_rendered_leaves(
    pdf_path: str | Path,
    manifest: MadozManifest,
):
    document = _open_pdf(pdf_path)
    try:
        for candidate in candidate_leaves(manifest):
            if candidate.pdf_page > document.page_count:
                raise PdfSourceError("candidate PDF page is outside the document")
            page = document.load_page(candidate.pdf_page - 1)
            try:
                yield _render_candidate(
                    page,
                    candidate,
                    dpi=manifest.processing.renderDpi,
                    rasterization_policy=manifest.processing.rasterizationPolicy,
                )
            finally:
                del page
    except PdfSourceError:
        raise
    except Exception:
        raise PdfSourceError("unable to render PDF source") from None
    finally:
        document.close()


def render_preview(pdf_path: str | Path, candidate: CandidateLeaf) -> RenderedLeaf:
    document = _open_pdf(pdf_path)
    try:
        if candidate.pdf_page > document.page_count:
            raise PdfSourceError("candidate PDF page is outside the document")
        page = document.load_page(candidate.pdf_page - 1)
        return _render_candidate(
            page,
            candidate,
            dpi=144,
            rasterization_policy=_RASTERIZATION_POLICY,
        )
    except PdfSourceError:
        raise
    except Exception:
        raise PdfSourceError("unable to render PDF preview") from None
    finally:
        document.close()
