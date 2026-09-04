from __future__ import annotations

import math
import re
from collections.abc import Sequence
from dataclasses import dataclass

from pydantic import ValidationError

from .identity import compute_chunk_id
from .ingest_models import PreparedChunkInput, SourceLineInput, SourcePageInput
from .models import DocumentMetadata


_ENTRY_TITLE_RE = re.compile(r"^(?P<title>[^.:—\-\r\n]{2,100}?)(?P<delimiter>[.:—-])")
_MAX_CHUNK_LINE_IDS = 512


class ChunkingError(RuntimeError):
    pass


@dataclass(frozen=True)
class _Entry:
    title: str
    lines: tuple[SourceLineInput, ...]


@dataclass(frozen=True)
class _BuiltChunk:
    chunk: PreparedChunkInput
    first_position: tuple[int, int]
    last_position: tuple[int, int]


def detect_entry_title(original_text: str) -> str | None:
    if not isinstance(original_text, str):
        return None
    match = _ENTRY_TITLE_RE.match(original_text)
    if match is None:
        return None
    entry_title = match.group("title").strip()
    if not 2 <= len(entry_title) <= 100:
        return None
    first = entry_title[0]
    if not first.isalpha() or not first.isupper():
        return None
    letters = [character for character in entry_title if character.isalpha()]
    if len(letters) < 2:
        return None
    uppercase_ratio = sum(character.isupper() for character in letters) / len(letters)
    if uppercase_ratio < 0.75:
        return None
    return entry_title


def _validate_limits(max_chunk_chars: int, overlap_lines: int) -> None:
    if (
        isinstance(max_chunk_chars, bool)
        or not isinstance(max_chunk_chars, int)
        or not 256 <= max_chunk_chars <= 65536
    ):
        raise ChunkingError("max_chunk_chars must be an integer in 256..65536")
    if (
        isinstance(overlap_lines, bool)
        or not isinstance(overlap_lines, int)
        or not 0 <= overlap_lines <= 32
    ):
        raise ChunkingError("overlap_lines must be an integer in 0..32")


def _ordered_pages(
    metadata: DocumentMetadata,
    pages: Sequence[SourcePageInput],
) -> tuple[list[SourcePageInput], dict[str, SourceLineInput]]:
    if isinstance(pages, (str, bytes, bytearray)):
        raise ChunkingError("pages must be a sequence of SourcePageInput values")
    ordered = sorted(pages, key=lambda page: page.logicalPageNumber)
    page_numbers = [page.logicalPageNumber for page in ordered]
    if page_numbers != sorted(set(page_numbers)):
        raise ChunkingError("logical page numbers must be unique")

    line_lookup: dict[str, SourceLineInput] = {}
    for page in ordered:
        if not isinstance(page, SourcePageInput):
            raise ChunkingError("pages must contain SourcePageInput values")
        if page.documentId != metadata.documentId:
            raise ChunkingError("page documentId differs from metadata")
        orders = [line.lineOrder for line in page.lines]
        if orders != sorted(set(orders)):
            raise ChunkingError("page lines must have unique increasing lineOrder")
        for line in page.lines:
            if line.logicalPageNumber != page.logicalPageNumber:
                raise ChunkingError("line logical page differs from its page")
            if line.lineId in line_lookup:
                raise ChunkingError("lineIds must be globally unique")
            line_lookup[line.lineId] = line
    return ordered, line_lookup


def _body_lines(page: SourcePageInput) -> list[SourceLineInput]:
    return [line for line in page.lines if line.role == "body"]


def _table_lines(page: SourcePageInput) -> list[SourceLineInput]:
    return [line for line in page.lines if line.role == "table"]


def _table_chunk_title(active_entry: str | None, page: SourcePageInput) -> str:
    label = page.printedPageLabel if page.printedPageLabel else str(page.logicalPageNumber)
    suffix = f" — tabla p. {label}"
    if active_entry is None:
        return f"TABLA — p. {label}"
    max_prefix = 100 - len(suffix)
    if max_prefix < 0:
        max_prefix = 0
    entry_title = active_entry[:max_prefix]
    return f"{entry_title}{suffix}"


def _collect_entries(
    pages: Sequence[SourcePageInput],
    max_chunk_chars: int,
) -> list[_Entry]:
    for page in pages:
        for line in _body_lines(page):
            if len(line.originalText) > max_chunk_chars:
                raise ChunkingError(
                    "OVERSIZE_BODY_LINE "
                    f"logicalPageNumber={page.logicalPageNumber} lineId={line.lineId}"
                )

    entries: list[_Entry] = []
    active_title: str | None = None
    active_lines: list[SourceLineInput] = []
    previous_page_number: int | None = None

    def finish_active() -> None:
        nonlocal active_title, active_lines
        if active_title is not None:
            entries.append(_Entry(title=active_title, lines=tuple(active_lines)))
        active_title = None
        active_lines = []

    for page in pages:
        if previous_page_number is not None and (
            page.logicalPageNumber != previous_page_number + 1
            or page.continuityBreakBefore
        ):
            finish_active()
        for line in _body_lines(page):
            entry_title = detect_entry_title(line.originalText)
            if entry_title is not None:
                finish_active()
                active_title = entry_title
                active_lines = [line]
            elif active_title is not None:
                active_lines.append(line)
        previous_page_number = page.logicalPageNumber
    finish_active()
    return entries


def _joined_length(lines: Sequence[SourceLineInput]) -> int:
    if not lines:
        return 0
    return sum(len(line.originalText) for line in lines) + len(lines) - 1


def _fits(lines: Sequence[SourceLineInput], max_chunk_chars: int) -> bool:
    return len(lines) <= _MAX_CHUNK_LINE_IDS and _joined_length(lines) <= max_chunk_chars


def _fragment_entry(
    entry: _Entry,
    max_chunk_chars: int,
    overlap_lines: int,
) -> list[tuple[SourceLineInput, ...]]:
    fragments: list[tuple[SourceLineInput, ...]] = []
    position = 0
    previous: tuple[SourceLineInput, ...] = ()
    while position < len(entry.lines):
        overlap = (
            list(previous[-min(overlap_lines, len(previous)) :])
            if previous and overlap_lines
            else []
        )
        next_new_line = entry.lines[position]
        while overlap and not _fits([*overlap, next_new_line], max_chunk_chars):
            overlap.pop(0)
        current = [*overlap, next_new_line]
        if not _fits(current, max_chunk_chars):
            raise ChunkingError(
                "OVERSIZE_BODY_LINE "
                f"logicalPageNumber={next_new_line.logicalPageNumber} "
                f"lineId={next_new_line.lineId}"
            )
        position += 1
        while position < len(entry.lines):
            candidate = [*current, entry.lines[position]]
            if not _fits(candidate, max_chunk_chars):
                break
            current.append(entry.lines[position])
            position += 1
        previous = tuple(current)
        fragments.append(previous)
    return fragments


def _prepared_chunk(
    metadata: DocumentMetadata,
    entry_title: str,
    lines: tuple[SourceLineInput, ...],
    is_table: bool = False,
) -> _BuiltChunk:
    original_text = "\n".join(line.originalText for line in lines)
    page_start = min(line.logicalPageNumber for line in lines)
    page_end = max(line.logicalPageNumber for line in lines)
    if is_table:
        section_path = ["Diccionario Madoz", metadata.edition, "tablas"]
    else:
        section_path = ["Diccionario Madoz", metadata.edition, entry_title]
    total_characters = sum(len(line.originalText) for line in lines)
    if total_characters < 1:
        raise ChunkingError("chunk lines must contain text")
    ocr_confidence = math.fsum(
        len(line.originalText) * line.confidence for line in lines
    ) / total_characters
    chunk_id = compute_chunk_id(
        metadata.documentId,
        page_start,
        page_end,
        section_path,
        original_text,
    )
    try:
        chunk = PreparedChunkInput(
            chunkId=chunk_id,
            originalText=original_text,
            correctedText=None,
            pageStart=page_start,
            pageEnd=page_end,
            sectionPath=section_path,
            cityQids=[],
            entityQids=[],
            historicalPeriod=metadata.historicalPeriod,
            ocrConfidence=ocr_confidence,
            entryTitle=entry_title,
            lineIds=[line.lineId for line in lines],
        )
    except (ValidationError, ValueError, TypeError) as exc:
        raise ChunkingError("prepared chunk is invalid") from exc
    positions = [(line.logicalPageNumber, line.lineOrder) for line in lines]
    return _BuiltChunk(
        chunk=chunk,
        first_position=min(positions),
        last_position=max(positions),
    )


def _collect_table_chunks(
    pages: Sequence[SourcePageInput],
    max_chunk_chars: int,
) -> list[tuple[str | None, SourcePageInput, tuple[SourceLineInput, ...]]]:
    chunks: list[tuple[str | None, SourcePageInput, tuple[SourceLineInput, ...]]] = []
    active_title: str | None = None

    for page in pages:
        page_title_at_first_table: str | None = None
        for line in page.lines:
            if line.role == "body":
                entry_title = detect_entry_title(line.originalText)
                if entry_title is not None:
                    active_title = entry_title
            elif line.role == "table":
                if page_title_at_first_table is None:
                    page_title_at_first_table = active_title

        table_lines = _table_lines(page)
        if table_lines:
            current: list[SourceLineInput] = []
            for line in table_lines:
                if len(line.originalText) > max_chunk_chars:
                    raise ChunkingError(
                        "OVERSIZE_TABLE_LINE "
                        f"logicalPageNumber={page.logicalPageNumber} lineId={line.lineId}"
                    )
                if current and not _fits([*current, line], max_chunk_chars):
                    chunks.append((page_title_at_first_table, page, tuple(current)))
                    current = []
                current.append(line)
            if current:
                chunks.append((page_title_at_first_table, page, tuple(current)))

    return chunks


def build_prepared_chunks(
    metadata: DocumentMetadata,
    pages: Sequence[SourcePageInput],
    max_chunk_chars: int,
    overlap_lines: int,
) -> list[PreparedChunkInput]:
    _validate_limits(max_chunk_chars, overlap_lines)
    if not isinstance(metadata.historicalPeriod, str) or not metadata.historicalPeriod:
        raise ChunkingError("metadata.historicalPeriod is required")
    ordered_pages, _line_lookup = _ordered_pages(metadata, pages)
    entries = _collect_entries(ordered_pages, max_chunk_chars)
    table_chunks = _collect_table_chunks(ordered_pages, max_chunk_chars)

    built: list[_BuiltChunk] = []
    for entry in entries:
        for fragment in _fragment_entry(entry, max_chunk_chars, overlap_lines):
            built.append(_prepared_chunk(metadata, entry.title, fragment))

    for active_title, page, lines in table_chunks:
        title = _table_chunk_title(active_title, page)
        built.append(_prepared_chunk(metadata, title, lines, is_table=True))

    built.sort(
        key=lambda item: (
            item.first_position[0],
            item.first_position[1],
            item.last_position[0],
            item.last_position[1],
            item.chunk.chunkId,
        )
    )
    return [item.chunk for item in built]
