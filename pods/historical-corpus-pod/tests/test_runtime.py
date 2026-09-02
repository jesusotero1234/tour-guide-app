from __future__ import annotations

import hashlib
from pathlib import Path

import pytest

from historical_corpus.models import (
    ChunkInput,
    IngestRequest,
    RightsMetadata,
    SearchRequest,
)
from historical_corpus.runtime import build_service_from_env


def _deterministic_env(data_dir: Path) -> dict[str, str]:
    return {
        "HISTORICAL_CORPUS_DATA_DIR": str(data_dir),
        "HISTORICAL_CORPUS_MODEL_BACKEND": "deterministic",
        "HISTORICAL_CORPUS_ALLOW_DETERMINISTIC": "true",
    }


def _request() -> IngestRequest:
    original_text = (
        "El teatro romano de Malaga cambio de funcion tras la Antiguedad."
    )
    content_hash = "sha256:" + hashlib.sha256(
        original_text.encode("utf-8")
    ).hexdigest()
    return IngestRequest(
        documentId="runtime-smoke",
        sourceUrl="https://example.org/runtime-smoke",
        title="Historia del teatro romano de Malaga",
        author="Autora de prueba",
        edition="Edicion abierta",
        publicationYear=1901,
        language="es",
        countryCode="ES",
        sourceClass="historical_secondary",
        contentHash=content_hash,
        rights=RightsMetadata(
            status="public_domain",
            uri="https://example.org/rights/public-domain",
            verifiedAt="2026-09-02T00:00:00Z",
            isExplicitlyReusable=True,
        ),
        chunks=[
            ChunkInput(
                originalText=original_text,
                correctedText=(
                    "El teatro romano de Málaga cambió de función tras la Antigüedad."
                ),
                pageStart=42,
                pageEnd=42,
                sectionPath=["Málaga", "Teatro romano"],
                cityQids=["Q8851"],
                entityQids=["Q3849447"],
                historicalPeriod="late_antiquity",
                ocrConfidence=0.98,
            )
        ],
    )


def _search() -> SearchRequest:
    return SearchRequest(
        query="teatro romano cambio de funcion",
        cityQid="Q8851",
        stopQid="Q3849447",
        languages=["es"],
        rightsStatuses=["public_domain"],
        limit=5,
    )


def test_runtime_defaults_to_lazy_qwen(tmp_path: Path) -> None:
    service = build_service_from_env(
        {"HISTORICAL_CORPUS_DATA_DIR": str(tmp_path)}
    )
    try:
        version = service.index_version()
        assert version.embeddingModel == "Qwen/Qwen3-Embedding-0.6B"
        assert version.embeddingDimension == 1024
        assert version.rerankerModel == "Qwen/Qwen3-Reranker-0.6B"
        assert version.documentCount == 0
    finally:
        service.close()


def test_deterministic_backend_requires_explicit_opt_in(tmp_path: Path) -> None:
    with pytest.raises(ValueError, match="deterministic"):
        build_service_from_env(
            {
                "HISTORICAL_CORPUS_DATA_DIR": str(tmp_path),
                "HISTORICAL_CORPUS_MODEL_BACKEND": "deterministic",
            }
        )


def test_deterministic_runtime_persists_across_restart(tmp_path: Path) -> None:
    environment = _deterministic_env(tmp_path)

    first = build_service_from_env(environment)
    try:
        ingest_result = first.ingest(_request())
        first_response = first.search(_search())
        first_version = first.index_version().indexVersion
        assert len(first_response.hits) == 1
        assert first_response.hits[0].chunkId == ingest_result.chunkIds[0]
    finally:
        first.close()

    second = build_service_from_env(environment)
    try:
        second_response = second.search(_search())
        assert len(second_response.hits) == 1
        assert second_response.hits[0].chunkId == ingest_result.chunkIds[0]
        assert second.index_version().indexVersion == first_version
    finally:
        second.close()


@pytest.mark.parametrize(
    ("overrides", "message"),
    [
        ({"HISTORICAL_CORPUS_MODEL_BACKEND": "unknown"}, "backend"),
        ({"HISTORICAL_CORPUS_ALLOW_DETERMINISTIC": "sometimes"}, "boolean"),
        ({"HISTORICAL_CORPUS_MODEL_BATCH_SIZE": "many"}, "integer"),
        ({"HISTORICAL_CORPUS_TURBOVEC_BIT_WIDTH": "5"}, "bit width"),
    ],
)
def test_invalid_runtime_configuration_fails(
    tmp_path: Path,
    overrides: dict[str, str],
    message: str,
) -> None:
    environment = {
        "HISTORICAL_CORPUS_DATA_DIR": str(tmp_path),
        **overrides,
    }
    with pytest.raises(ValueError, match=message):
        build_service_from_env(environment)
