from __future__ import annotations

import hashlib
import json
import re
import unicodedata
from dataclasses import dataclass
from typing import Iterable, Literal, Sequence

from pydantic import ValidationError

from .ingest_models import PageInventoryRecord, PrintedLabelCandidate
from .manifest import MadozManifest, ManifestDuplicateDecision
from .pdf_source import EmbeddedWord, RenderedLeaf

_SIDE_ORDER = {"full": 0, "left": 0, "right": 1}


def _physical_key(record: PageInventoryRecord) -> tuple[int, int, str]:
    return (record.pdfPage, _SIDE_ORDER[record.side], record.side)


def _hamming_distance(a: str, b: str) -> int:
    return (int(a, 16) ^ int(b, 16)).bit_count()


def _ref_to_key(ref) -> tuple[int, int, str]:
    return (ref.pdfPage, _SIDE_ORDER[ref.side], ref.side)


def _rebuild(
    record: PageInventoryRecord | dict[str, object],
) -> PageInventoryRecord:
    try:
        payload = (
            record.model_dump(mode="json")
            if isinstance(record, PageInventoryRecord)
            else record
        )
        return PageInventoryRecord.model_validate(payload)
    except ValidationError as error:
        first = error.errors(include_url=False)[0]
        field = ".".join(str(part) for part in first["loc"]) or "record"
        raise PageInventoryError(f"{field}: {first['msg']}") from None


_PRINTED_LABEL_CANDIDATE_RE = re.compile(r"^[0-9]{1,4}\.?$")


class PageInventoryError(RuntimeError):
    """Inventory signals cannot be represented by the versioned contract."""


@dataclass(frozen=True)
class PrintedLabelSignals:
    candidates: tuple[PrintedLabelCandidate, ...]
    normalized_label: str | None
    normalized_box: tuple[float, float, float, float] | None
    anomaly: Literal["label_missing", "label_ambiguous"] | None


def normalize_embedded_text(parts: Iterable[str]) -> str:
    combined = " ".join(parts)
    normalized = unicodedata.normalize("NFKC", combined).lower()
    return " ".join(normalized.split())


def _text_simhash64(normalized_text: str) -> str | None:
    tokens = re.findall(r"\w+", normalized_text)
    if len(tokens) < 3:
        return None
    votes = [0] * 64
    for index in range(len(tokens) - 2):
        shingle = " ".join(tokens[index : index + 3])
        value = int.from_bytes(
            hashlib.sha256(shingle.encode("utf-8")).digest()[:8], "big"
        )
        for bit_index in range(64):
            mask = 1 << (63 - bit_index)
            votes[bit_index] += 1 if value & mask else -1
    result = 0
    for vote in votes:
        result = (result << 1) | int(vote > 0)
    return f"{result:016x}"


def embedded_text_fingerprints(
    words: Sequence[EmbeddedWord],
) -> tuple[str | None, str | None]:
    normalized = normalize_embedded_text(word.text for word in words)
    if not normalized:
        return None, None
    digest = hashlib.sha256(normalized.encode("utf-8")).hexdigest()
    return f"sha256:{digest}", _text_simhash64(normalized)


def extract_printed_label_candidates(
    words: Sequence[EmbeddedWord],
) -> PrintedLabelSignals:
    candidates: list[PrintedLabelCandidate] = []
    for word in words:
        horizontal_center = (word.box[0] + word.box[2]) / 2.0
        vertical_center = (word.box[1] + word.box[3]) / 2.0
        if not (vertical_center <= 0.065 or vertical_center >= 0.92):
            continue
        if not (horizontal_center <= 0.25 or horizontal_center >= 0.75):
            continue
        if _PRINTED_LABEL_CANDIDATE_RE.fullmatch(word.text) is None:
            continue
        candidates.append(
            PrintedLabelCandidate(
                text=word.text,
                box={
                    "x0": word.box[0],
                    "y0": word.box[1],
                    "x1": word.box[2],
                    "y1": word.box[3],
                },
            )
        )
        if len(candidates) > 32:
            raise PageInventoryError("printed label candidates exceed the limit of 32")

    if len(candidates) != 1:
        return PrintedLabelSignals(
            candidates=tuple(candidates),
            normalized_label=None,
            normalized_box=None,
            anomaly="label_missing" if not candidates else "label_ambiguous",
        )

    numeric = int(candidates[0].text.removesuffix("."))
    if not 1 <= numeric <= 9999:
        return PrintedLabelSignals(
            candidates=tuple(candidates),
            normalized_label=None,
            normalized_box=None,
            anomaly="label_missing",
        )
    return PrintedLabelSignals(
        candidates=tuple(candidates),
        normalized_label=str(numeric),
        normalized_box=(
            candidates[0].box.x0,
            candidates[0].box.y0,
            candidates[0].box.x1,
            candidates[0].box.y1,
        ),
        anomaly=None,
    )


def _record_from_rendered(
    rendered: RenderedLeaf,
    manifest: MadozManifest,
) -> PageInventoryRecord:
    candidate = rendered.candidate
    overrides = {
        (override.pdfPage, override.side): override
        for override in manifest.selection.canonicalization.pageOverrides
    }
    override = overrides.get((candidate.pdf_page, candidate.side))
    label_signals = extract_printed_label_candidates(rendered.embedded_words)
    embedded_sha, text_simhash = embedded_text_fingerprints(rendered.embedded_words)

    if override is not None and override.normalizedPrintedLabel is not None:
        normalized_label = override.normalizedPrintedLabel
        normalized_box = None
        label_source = "manifest_override"
        anomalies: list[str] = []
    else:
        normalized_label = label_signals.normalized_label
        normalized_box = label_signals.normalized_box
        label_source = (
            "embedded_ocr_heuristic" if normalized_label is not None else "missing"
        )
        anomalies = (
            [label_signals.anomaly] if label_signals.anomaly is not None else []
        )

    dominant = rendered.dominant_raster
    status = (
        "exclude_nonbody"
        if override is not None and override.canonicalStatus == "exclude_nonbody"
        else "pending_review"
    )
    try:
        return PageInventoryRecord(
            schemaVersion=1,
            pdfPage=candidate.pdf_page,
            side=candidate.side,
            mediaBox=rendered.media_box,
            pdfRotationDegrees=rendered.pdf_rotation_degrees,
            rasterWidthPx=dominant.width_px if dominant is not None else None,
            rasterHeightPx=dominant.height_px if dominant is not None else None,
            rasterBitsPerComponent=(
                dominant.bits_per_component if dominant is not None else None
            ),
            rasterFilter=dominant.filter if dominant is not None else None,
            declaredDpiX=dominant.declared_dpi_x if dominant is not None else None,
            declaredDpiY=dominant.declared_dpi_y if dominant is not None else None,
            printedLabelCandidates=list(label_signals.candidates),
            normalizedPrintedLabel=normalized_label,
            printedLabelBox=(
                {
                    "x0": normalized_box[0],
                    "y0": normalized_box[1],
                    "x1": normalized_box[2],
                    "y1": normalized_box[3],
                }
                if normalized_box is not None
                else None
            ),
            printedLabelSource=label_source,
            sourceImageSha256=f"sha256:{rendered.image_sha256}",
            visualDhash64=rendered.visual_dhash64,
            embeddedTextSha256=embedded_sha,
            textSimhash64=text_simhash,
            duplicateCandidates=[],
            anomalyFlags=sorted(anomalies),
            canonicalStatus=status,
            duplicateOf=None,
            canonicalSequenceIndex=None,
            continuityBreakBefore=False,
            decisionReason=override.reason if override is not None else None,
        )
    except ValidationError as error:
        first = error.errors(include_url=False)[0]
        field = ".".join(str(part) for part in first["loc"]) or "record"
        raise PageInventoryError(f"{field}: {first['msg']}") from None


def build_inventory_signals(
    rendered_leaves: Iterable[RenderedLeaf],
    manifest: MadozManifest,
) -> list[PageInventoryRecord]:
    return [_record_from_rendered(rendered, manifest) for rendered in rendered_leaves]


def finalize_inventory(
    records: list[PageInventoryRecord],
    manifest: MadozManifest,
) -> list[PageInventoryRecord]:
    keys = [_physical_key(record) for record in records]
    if len(keys) != len(set(keys)):
        raise PageInventoryError("duplicate physical keys in input records")
    if keys != sorted(keys):
        raise PageInventoryError("records must be in deterministic physical order")

    universe: list[tuple[int, int, str]] = []
    sides = ("left", "right") if manifest.selection.splitSpreads else ("full",)
    for page_range in manifest.selection.candidatePdfPageRanges:
        for pdf_page in range(page_range.start, page_range.end + 1):
            for side in sides:
                universe.append((pdf_page, _SIDE_ORDER[side], side))
    if keys != universe:
        raise PageInventoryError(
            "records must exactly equal the manifest candidate universe"
        )

    overrides = {
        (override.pdfPage, override.side): override
        for override in manifest.selection.canonicalization.pageOverrides
    }
    effective_status: dict[tuple[int, int, str], str] = {}
    effective_reason: dict[tuple[int, int, str], str | None] = {}
    eligible: list[PageInventoryRecord] = []
    for record in records:
        key = _physical_key(record)
        override = overrides.get((record.pdfPage, record.side))
        reason = override.reason if override is not None else record.decisionReason
        if record.canonicalStatus == "exclude_duplicate":
            status = "exclude_duplicate"
        elif override is not None and override.canonicalStatus == "exclude_nonbody":
            status = "exclude_nonbody"
        elif record.canonicalStatus == "exclude_nonbody":
            status = "exclude_nonbody"
        else:
            status = "pending_review"
            eligible.append(record)
        effective_status[key] = status
        effective_reason[key] = reason

    computed_flags = {
        "repeat",
        "decrease",
        "gap",
        "declared_gap",
        "candidate_range_break",
    }
    flags_by_key: dict[tuple[int, int, str], set[str]] = {
        key: set(record.anomalyFlags) - computed_flags
        for key, record in zip(keys, records)
    }
    break_before = {key: False for key in keys}

    missing_labels = [int(label) for label in manifest.coverage.missingPrintedPages]

    def is_declared_gap(skipped: list[int]) -> bool:
        width = len(skipped)
        return any(
            missing_labels[index : index + width] == skipped
            for index in range(len(missing_labels) - width + 1)
        )

    previous_label: int | None = None
    for record in eligible:
        key = _physical_key(record)
        current_label = (
            int(record.normalizedPrintedLabel)
            if record.normalizedPrintedLabel is not None
            else None
        )
        if previous_label is not None and current_label is not None:
            if current_label == previous_label:
                flags_by_key[key].add("repeat")
            elif current_label < previous_label:
                flags_by_key[key].add("decrease")
            elif current_label > previous_label + 1:
                skipped = list(range(previous_label + 1, current_label))
                if is_declared_gap(skipped):
                    flags_by_key[key].add("declared_gap")
                    break_before[key] = True
                else:
                    flags_by_key[key].add("gap")
        previous_label = current_label

    ranges = manifest.selection.candidatePdfPageRanges
    for previous_range, current_range in zip(ranges, ranges[1:]):
        if current_range.start <= previous_range.end + 1:
            continue
        first_in_range = next(
            (
                record
                for record in eligible
                if current_range.start <= record.pdfPage <= current_range.end
            ),
            None,
        )
        if first_in_range is not None:
            key = _physical_key(first_in_range)
            flags_by_key[key].add("candidate_range_break")
            break_before[key] = True

    unresolved_flags = {
        "repeat",
        "decrease",
        "gap",
        "near_duplicate",
        "label_missing",
        "label_ambiguous",
    }
    pending_row_exists = False
    for record in eligible:
        key = _physical_key(record)
        override = overrides.get((record.pdfPage, record.side))
        explicitly_included = (
            override is not None and override.canonicalStatus == "include"
        )
        if flags_by_key[key] & unresolved_flags and not explicitly_included:
            pending_row_exists = True

    pending_pair_exists = any(
        candidate.decision == "pending"
        for record in records
        for candidate in record.duplicateCandidates
    )
    has_pending = pending_row_exists or pending_pair_exists

    result: list[PageInventoryRecord] = []
    next_index = 1
    for record in records:
        key = _physical_key(record)
        data = record.model_dump(mode="json")
        status = effective_status[key]
        if status in ("exclude_nonbody", "exclude_duplicate"):
            data["canonicalStatus"] = status
            data["canonicalSequenceIndex"] = None
            data["continuityBreakBefore"] = False
        elif has_pending:
            data["canonicalStatus"] = "pending_review"
            data["canonicalSequenceIndex"] = None
            data["continuityBreakBefore"] = break_before[key]
        else:
            data["canonicalStatus"] = "include"
            data["canonicalSequenceIndex"] = next_index
            data["continuityBreakBefore"] = break_before[key]
            next_index += 1
        data["decisionReason"] = effective_reason[key]
        data["anomalyFlags"] = sorted(flags_by_key[key])
        result.append(_rebuild(data))

    if not has_pending:
        include_keys = {
            _physical_key(record)
            for record in result
            if record.canonicalStatus == "include"
        }
        for record in result:
            if (
                record.canonicalStatus == "exclude_duplicate"
                and record.duplicateOf is not None
            ):
                target = (
                    record.duplicateOf.pdfPage,
                    _SIDE_ORDER[record.duplicateOf.side],
                    record.duplicateOf.side,
                )
                if target not in include_keys:
                    raise PageInventoryError(
                        "exclude_duplicate duplicateOf target is not a final include"
                    )
    return result


def serialize_inventory_jsonl(records: list[PageInventoryRecord]) -> bytes:
    if len(records) > 2000:
        raise PageInventoryError("inventory exceeds 2000 records")
    lines: list[bytes] = []
    for record in records:
        payload = record.model_dump(mode="json", by_alias=True, exclude_none=False)
        line = json.dumps(
            payload,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
        ).encode("utf-8") + b"\n"
        lines.append(line)
    data = b"".join(lines)
    if len(data) > 2 * 1024 * 1024:
        raise PageInventoryError("inventory exceeds 2 MiB")
    return data


def inventory_sha256(records: list[PageInventoryRecord]) -> str:
    return hashlib.sha256(serialize_inventory_jsonl(records)).hexdigest()


def _validate_duplicate_evidence(
    records: list[PageInventoryRecord],
    manifest: MadozManifest,
) -> None:
    by_key = {_physical_key(record): record for record in records}
    evidence: dict[
        frozenset[tuple[int, int, str]],
        tuple[str, tuple[int, int, str] | None, str | None, tuple[str, ...]],
    ] = {}
    endpoints: dict[
        frozenset[tuple[int, int, str]], set[tuple[int, int, str]]
    ] = {}
    for record in records:
        source = _physical_key(record)
        for candidate in record.duplicateCandidates:
            target = (
                candidate.pdfPage,
                _SIDE_ORDER[candidate.side],
                candidate.side,
            )
            if target not in by_key or target == source:
                raise PageInventoryError(
                    "duplicate evidence references an unknown physical row"
                )
            pair = frozenset((source, target))
            canonical = (
                (
                    candidate.canonical.pdfPage,
                    _SIDE_ORDER[candidate.canonical.side],
                    candidate.canonical.side,
                )
                if candidate.canonical is not None
                else None
            )
            value = (
                candidate.decision,
                canonical,
                candidate.decisionReason,
                tuple(candidate.reasons),
            )
            if pair in evidence and evidence[pair] != value:
                raise PageInventoryError("duplicate evidence is not symmetric")
            evidence[pair] = value
            endpoints.setdefault(pair, set()).add(source)
    if any(seen != set(pair) for pair, seen in endpoints.items()):
        raise PageInventoryError("duplicate evidence is not symmetric")

    expected: dict[
        frozenset[tuple[int, int, str]],
        tuple[str, tuple[int, int, str] | None, str],
    ] = {}
    for decision in manifest.selection.canonicalization.duplicateDecisions:
        first = _ref_to_key(decision.first)
        second = _ref_to_key(decision.second)
        canonical = (
            _ref_to_key(decision.canonical)
            if decision.canonical is not None
            else None
        )
        expected[frozenset((first, second))] = (
            decision.decision,
            canonical,
            decision.reason,
        )
    if set(evidence) != set(expected):
        raise PageInventoryError(
            "duplicate evidence does not match manifest decisions"
        )
    for pair, observed in evidence.items():
        if observed[:3] != expected[pair]:
            raise PageInventoryError(
                "duplicate evidence does not match manifest decisions"
            )

    confirmed = {
        pair: observed[1]
        for pair, observed in evidence.items()
        if observed[0] == "confirmed_duplicate"
    }
    if not confirmed:
        return
    parent: dict[tuple[int, int, str], tuple[int, int, str]] = {}

    def find(key: tuple[int, int, str]) -> tuple[int, int, str]:
        parent.setdefault(key, key)
        while parent[key] != key:
            parent[key] = parent[parent[key]]
            key = parent[key]
        return key

    def union(first: tuple[int, int, str], second: tuple[int, int, str]) -> None:
        first_root = find(first)
        second_root = find(second)
        if first_root != second_root:
            parent[second_root] = first_root

    for pair in confirmed:
        first, second = tuple(pair)
        union(first, second)
    components: dict[
        tuple[int, int, str], set[tuple[int, int, str]]
    ] = {}
    for key in parent:
        components.setdefault(find(key), set()).add(key)
    for root, members in components.items():
        canonicals = {
            canonical
            for pair, canonical in confirmed.items()
            if find(next(iter(pair))) == root
        }
        if len(canonicals) != 1:
            raise PageInventoryError(
                "confirmed component must name exactly one canonical"
            )
        canonical = next(iter(canonicals))
        if canonical is None or canonical not in members:
            raise PageInventoryError(
                "confirmed component canonical must belong to the component"
            )
        included = {
            key for key in members if by_key[key].canonicalStatus == "include"
        }
        if included != {canonical}:
            raise PageInventoryError(
                "confirmed component must have exactly one included canonical"
            )
        for key in members - {canonical}:
            record = by_key[key]
            target = (
                (
                    record.duplicateOf.pdfPage,
                    _SIDE_ORDER[record.duplicateOf.side],
                    record.duplicateOf.side,
                )
                if record.duplicateOf is not None
                else None
            )
            if record.canonicalStatus != "exclude_duplicate" or target != canonical:
                raise PageInventoryError(
                    "confirmed component member must point to its canonical"
                )


def load_verified_inventory(
    payload: bytes,
    manifest: MadozManifest,
) -> list[PageInventoryRecord]:
    if not isinstance(payload, bytes):
        raise PageInventoryError("payload must be bytes")
    if len(payload) > 2 * 1024 * 1024:
        raise PageInventoryError("payload exceeds 2 MiB")
    if manifest.selection.inventoryReviewStatus != "verified":
        raise PageInventoryError("inventory review status must be verified")
    expected_sha = manifest.selection.expectedPageInventorySha256
    if expected_sha is None:
        raise PageInventoryError("expectedPageInventorySha256 is required")
    actual_sha = hashlib.sha256(payload).hexdigest()
    if actual_sha != expected_sha:
        raise PageInventoryError("SHA-256 mismatch")
    if not payload.endswith(b"\n"):
        raise PageInventoryError("canonical payload must end with LF")
    try:
        text = payload.decode("utf-8")
    except UnicodeDecodeError:
        raise PageInventoryError("payload is not valid UTF-8")
    lines = text.split("\n")
    if lines[-1] != "":
        raise PageInventoryError("payload must end with LF")
    lines = lines[:-1]
    if len(lines) > 2000:
        raise PageInventoryError("inventory exceeds 2000 records")
    records: list[PageInventoryRecord] = []
    for line in lines:
        if not line:
            raise PageInventoryError("empty line in payload")
        try:
            obj = json.loads(line)
        except json.JSONDecodeError:
            raise PageInventoryError("invalid record JSON line")
        if not isinstance(obj, dict):
            raise PageInventoryError("record must be a JSON object")
        try:
            records.append(PageInventoryRecord.model_validate(obj))
        except ValidationError as error:
            first = error.errors(include_url=False)[0]
            field = ".".join(str(part) for part in first["loc"]) or "record"
            raise PageInventoryError(f"{field}: {first['msg']}") from None
    canonical = serialize_inventory_jsonl(records)
    if canonical != payload:
        raise PageInventoryError("payload is not canonical")
    keys = [_physical_key(record) for record in records]
    if len(keys) != len(set(keys)):
        raise PageInventoryError("duplicate physical keys in inventory")
    if keys != sorted(keys):
        raise PageInventoryError("records must be in deterministic physical order")
    universe: list[tuple[int, int, str]] = []
    sides = ("left", "right") if manifest.selection.splitSpreads else ("full",)
    for page_range in manifest.selection.candidatePdfPageRanges:
        for pdf_page in range(page_range.start, page_range.end + 1):
            for side in sides:
                universe.append((pdf_page, _SIDE_ORDER[side], side))
    if keys != universe:
        raise PageInventoryError("records must exactly equal the manifest candidate universe")
    pending_row = False
    pending_pair = False
    for record in records:
        if record.canonicalStatus == "pending_review":
            pending_row = True
        for candidate in record.duplicateCandidates:
            if candidate.decision == "pending":
                pending_pair = True
    if pending_row or pending_pair:
        raise PageInventoryError("pending record or candidate present")
    _validate_duplicate_evidence(records, manifest)
    overrides = {
        (override.pdfPage, override.side): override
        for override in manifest.selection.canonicalization.pageOverrides
    }
    unresolved_flags = {
        "repeat",
        "decrease",
        "gap",
        "near_duplicate",
        "label_missing",
        "label_ambiguous",
    }
    for record in records:
        key = _physical_key(record)
        override = overrides.get((record.pdfPage, record.side))
        flags = set(record.anomalyFlags) & unresolved_flags
        if not flags:
            continue
        if (
            manifest.coverage.status == "unknown"
            and "label_missing" in flags
            and override is None
        ):
            raise PageInventoryError(
                "label_missing row requires a human pageOverride"
            )
        if override is not None and override.canonicalStatus is not None:
            continue
        if override is not None and override.normalizedPrintedLabel is not None:
            flags -= {"label_missing", "label_ambiguous"}
        if flags:
            raise PageInventoryError(
                f"unresolved inventory invariant on physical row {key}: {sorted(flags)}"
            )
    include_indices: list[int] = []
    include_keys: set[tuple[int, int, str]] = set()
    for record in records:
        if record.canonicalStatus == "include":
            if record.canonicalSequenceIndex is None:
                raise PageInventoryError("include record missing canonicalSequenceIndex")
            include_indices.append(record.canonicalSequenceIndex)
            include_keys.add(_physical_key(record))
        elif record.canonicalStatus in ("exclude_nonbody", "exclude_duplicate"):
            if record.canonicalSequenceIndex is not None:
                raise PageInventoryError("non-include record must have null canonicalSequenceIndex")
        else:
            raise PageInventoryError(f"unexpected canonicalStatus: {record.canonicalStatus}")
    if include_indices != list(range(1, len(include_indices) + 1)):
        raise PageInventoryError("include indices must be exactly 1..M")
    for record in records:
        if record.canonicalStatus == "exclude_duplicate":
            if record.duplicateOf is None:
                raise PageInventoryError("exclude_duplicate record missing duplicateOf")
            target = (
                record.duplicateOf.pdfPage,
                _SIDE_ORDER[record.duplicateOf.side],
                record.duplicateOf.side,
            )
            if target not in include_keys:
                raise PageInventoryError("exclude_duplicate duplicateOf target is not a final include")
    overrides = {
        (override.pdfPage, override.side): override
        for override in manifest.selection.canonicalization.pageOverrides
    }
    coverage = manifest.coverage
    if coverage.status in ("partial_source", "complete_source"):
        included_labels: list[int] = []
        for record in records:
            if record.canonicalStatus == "include" and record.normalizedPrintedLabel is not None:
                included_labels.append(int(record.normalizedPrintedLabel))
        observed_ranges = coverage.observedPrintedRanges
        flattened: list[int] = []
        for rng in observed_ranges:
            start = int(rng.start)
            end = int(rng.end)
            flattened.extend(range(start, end + 1))
        if included_labels != flattened:
            raise PageInventoryError(
                "coverage observed ranges do not match the included labels"
            )
        if included_labels:
            min_label = min(included_labels)
            max_label = max(included_labels)
            expected_missing = sorted(set(range(min_label, max_label + 1)) - set(included_labels))
            actual_missing = sorted(int(p) for p in coverage.missingPrintedPages)
            if expected_missing != actual_missing:
                raise PageInventoryError(
                    "coverage missingPrintedPages do not match the included labels"
                )
        if coverage.status == "complete_source" and coverage.missingPrintedPages:
            raise PageInventoryError(
                "coverage missingPrintedPages must be empty for complete coverage"
            )
    elif coverage.status == "unknown":
        if coverage.observedPrintedRanges:
            raise PageInventoryError("unknown coverage must have empty observedPrintedRanges")
        if coverage.missingPrintedPages:
            raise PageInventoryError("unknown coverage must have empty missingPrintedPages")
        for record in records:
            if "label_missing" in record.anomalyFlags:
                key = (record.pdfPage, record.side)
                override = overrides.get(key)
                if override is None:
                    raise PageInventoryError("label_missing row requires a human pageOverride")
    else:
        raise PageInventoryError(f"unexpected coverage status: {coverage.status}")
    return records


def apply_duplicate_decisions(
    records: list[PageInventoryRecord],
    manifest: MadozManifest,
) -> list[PageInventoryRecord]:
    keys = [_physical_key(r) for r in records]
    if len(keys) != len(set(keys)):
        raise PageInventoryError("duplicate physical keys in input records")
    if keys != sorted(keys):
        raise PageInventoryError("records must be in deterministic physical order")

    by_key: dict[tuple[int, int, str], PageInventoryRecord] = {
        k: r for k, r in zip(keys, records)
    }

    # Detect candidates
    candidate_pairs: list[tuple[tuple[int, int, str], tuple[int, int, str], list[str]]] = []
    for i in range(len(records)):
        for j in range(i + 1, len(records)):
            a = records[i]
            b = records[j]
            reasons: list[str] = []
            same_label = (
                a.normalizedPrintedLabel is not None
                and b.normalizedPrintedLabel is not None
                and a.normalizedPrintedLabel == b.normalizedPrintedLabel
            )
            if same_label:
                reasons.append("same_label")
            same_embedded = (
                a.embeddedTextSha256 is not None
                and b.embeddedTextSha256 is not None
                and a.embeddedTextSha256 == b.embeddedTextSha256
            )
            if same_embedded:
                reasons.append("same_embedded_text_sha")
            simhash_close = False
            if a.textSimhash64 is not None and b.textSimhash64 is not None:
                if _hamming_distance(a.textSimhash64, b.textSimhash64) <= 3:
                    simhash_close = True
                    reasons.append("simhash_le_3")
            dhash_close = False
            if a.visualDhash64 is not None and b.visualDhash64 is not None:
                if _hamming_distance(a.visualDhash64, b.visualDhash64) <= 5:
                    dhash_close = True
                    reasons.append("dhash_le_5")
            is_candidate = (
                same_label and (same_embedded or simhash_close or dhash_close)
            ) or (not same_label and simhash_close and dhash_close)
            if is_candidate:
                candidate_pairs.append((keys[i], keys[j], sorted(reasons)))
                if len(candidate_pairs) > 2000:
                    raise PageInventoryError(
                        "detected duplicate candidates exceed 2000"
                    )

    # Build candidate sets per record
    candidates_by_key: dict[tuple[int, int, str], list[tuple[tuple[int, int, str], list[str]]]] = {
        k: [] for k in keys
    }
    for ka, kb, reasons in candidate_pairs:
        candidates_by_key[ka].append((kb, reasons))
        candidates_by_key[kb].append((ka, reasons))

    # Validate manifest decisions
    decisions = manifest.selection.canonicalization.duplicateDecisions
    detected_set: set[frozenset[tuple[int, int, str]]] = {
        frozenset([ka, kb]) for ka, kb, _ in candidate_pairs
    }
    decision_by_pair: dict[frozenset[tuple[int, int, str]], ManifestDuplicateDecision] = {}
    for d in decisions:
        k1 = _ref_to_key(d.first)
        k2 = _ref_to_key(d.second)
        pair_key = frozenset([k1, k2])
        if pair_key not in detected_set:
            raise PageInventoryError(
                f"manifest decision is not a detected candidate pair: {k1} / {k2}"
            )
        decision_by_pair[pair_key] = d

    # Build confirmed components from confirmed_duplicate edges only
    confirmed_edges: list[tuple[tuple[int, int, str], tuple[int, int, str], tuple[int, int, str]]] = []
    for d in decisions:
        if d.decision == "confirmed_duplicate":
            k1 = _ref_to_key(d.first)
            k2 = _ref_to_key(d.second)
            kc = _ref_to_key(d.canonical)
            confirmed_edges.append((k1, k2, kc))

    # Union-find for confirmed components
    parent: dict[tuple[int, int, str], tuple[int, int, str]] = {}

    def find(x: tuple[int, int, str]) -> tuple[int, int, str]:
        while parent[x] != x:
            parent[x] = parent[parent[x]]
            x = parent[x]
        return x

    def union(x: tuple[int, int, str], y: tuple[int, int, str]) -> None:
        rx, ry = find(x), find(y)
        if rx != ry:
            if rx < ry:
                parent[ry] = rx
            else:
                parent[rx] = ry

    for k1, k2, kc in confirmed_edges:
        for k in (k1, k2):
            if k not in parent:
                parent[k] = k
        union(k1, k2)

    # Group confirmed members by component
    components: dict[tuple[int, int, str], set[tuple[int, int, str]]] = {}
    for k in parent:
        root = find(k)
        components.setdefault(root, set()).add(k)

    # Determine canonical per component: the one named in decisions
    canonical_by_component: dict[tuple[int, int, str], tuple[int, int, str]] = {}
    for k1, k2, kc in confirmed_edges:
        root = find(k1)
        if root not in canonical_by_component:
            canonical_by_component[root] = kc
        elif canonical_by_component[root] != kc:
            raise PageInventoryError(
                "confirmed component decisions must name the same canonical"
            )

    # Validate canonical within component
    for k1, k2, kc in confirmed_edges:
        root = find(k1)
        comp = components[root]
        if kc not in comp:
            raise PageInventoryError(
                f"canonical {kc} not in confirmed component {sorted(comp)}"
            )

    # Check override contradictions
    overrides = manifest.selection.canonicalization.pageOverrides
    override_by_key: dict[tuple[int, int, str], object] = {
        _ref_to_key(o): o for o in overrides
    }
    for k, o in override_by_key.items():
        if k in parent:
            root = find(k)
            canonical = canonical_by_component[root]
            if k == canonical:
                if o.canonicalStatus == "exclude_nonbody":
                    raise PageInventoryError(
                        f"pageOverride exclude_nonbody on canonical {k} is contradictory"
                    )
            else:
                if o.canonicalStatus == "include":
                    raise PageInventoryError(
                        f"pageOverride include on noncanonical confirmed member {k} is contradictory"
                    )
                if o.canonicalStatus is not None:
                    raise PageInventoryError(
                        f"status override on confirmed member {k} is contradictory"
                    )

    # Build pending-pair incidence set
    pending_pairs: set[frozenset[tuple[int, int, str]]] = set()
    for pair_key in detected_set:
        d = decision_by_pair.get(pair_key)
        if d is None:
            pending_pairs.add(pair_key)

    pending_incident: set[tuple[int, int, str]] = set()
    for pair_key in pending_pairs:
        for k in pair_key:
            pending_incident.add(k)

    # Build result records
    result: list[PageInventoryRecord] = []
    for k in keys:
        rec = by_key[k]
        dup_candidates = []
        for other_key, reasons in sorted(candidates_by_key[k], key=lambda x: x[0]):
            pair_key = frozenset([k, other_key])
            d = decision_by_pair.get(pair_key)
            if d is None:
                decision = "pending"
                canonical = None
                decision_reason = None
            else:
                decision = d.decision
                if d.canonical is not None:
                    canonical = {
                        "pdfPage": d.canonical.pdfPage,
                        "side": d.canonical.side,
                    }
                else:
                    canonical = None
                decision_reason = d.reason
            dup_candidates.append(
                {
                    "pdfPage": other_key[0],
                    "side": other_key[2],
                    "reasons": reasons,
                    "decision": decision,
                    "canonical": canonical,
                    "decisionReason": decision_reason,
                }
            )

        if k in parent:
            root = find(k)
            canonical = canonical_by_component[root]
            if k == canonical:
                status = "pending_review"
                duplicate_of = None
            else:
                status = "exclude_duplicate"
                duplicate_of = {
                    "pdfPage": canonical[0],
                    "side": canonical[2],
                }
            anomaly_flags = [f for f in rec.anomalyFlags if f != "near_duplicate"]
        else:
            status = rec.canonicalStatus
            duplicate_of = rec.duplicateOf
            anomaly_flags = list(rec.anomalyFlags)
        anomaly_flags = [flag for flag in anomaly_flags if flag != "near_duplicate"]
        if k in pending_incident:
            anomaly_flags.append("near_duplicate")

        # Rebuild
        data = rec.model_dump(mode="json")
        data["duplicateCandidates"] = dup_candidates
        data["canonicalStatus"] = status
        data["duplicateOf"] = duplicate_of
        data["anomalyFlags"] = sorted(anomaly_flags)
        result.append(_rebuild(PageInventoryRecord.model_validate(data)))

    return result
