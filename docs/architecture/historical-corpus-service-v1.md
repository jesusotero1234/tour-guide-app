# Historical Corpus Service V1

## Objective

Build a standalone local evidence-retrieval service for historical sources. It
must discover candidate passages with exact provenance while preserving the
Narrative V8 rule that retrieval is not factual authorization.

V1 is deliberately not connected to the backend, Narrative Research, the
writer, the auditor, or any canary. It is started explicitly with Podman and
can be evaluated independently before a later shadow integration.

## Scope and capability map

| Module | Responsibility | Depends on |
| --- | --- | --- |
| `corpus-registry` | Documents, rights gate, chunks, QIDs, hashes, OCR metadata, SQLite FTS5 | — |
| `hybrid-retrieval` | Dense-vector interface, TurboVec adapter, lexical/dense fusion, Qwen embedding and reranking adapters | `corpus-registry` |
| `evidence-api` | Versioned HTTP schemas for ingest, lookup and search | `corpus-registry`, `hybrid-retrieval` |
| `podman-runtime` | Rootless, opt-in local container operation and persistent volumes | `evidence-api` |

Build order: registry → retrieval → API → Podman runtime.

## Technology

- Python 3.12 and FastAPI with Pydantic v2 boundary validation.
- SQLite with FTS5 for source metadata, exact text and lexical search.
- TurboVec `IdMapIndex` behind a local vector-index protocol.
- `Qwen/Qwen3-Embedding-0.6B` for 1024-dimensional dense vectors.
- `Qwen/Qwen3-Reranker-0.6B` for final candidate ordering.
- A deterministic test backend may be selected explicitly for tests and smoke
  checks; the Podman service defaults to the Qwen backends.

## HTTP contract

- `GET /health`
- `GET /v1/index/version`
- `GET /v1/chunks/{chunkId}`
- `GET /v1/documents/{documentId}`
- `POST /v1/ingest`
- `POST /v1/search`
- `POST /v1/search-for-stop`
- `POST /v1/search-for-claim`

All errors use `{ "error": { "code", "message", "details"? } }`. State-changing
ingest requests are idempotent by `documentId` plus `contentHash`: replaying the
same document is safe, while reusing an identifier for different content is a
conflict.

The ingest boundary accepts structured text and provenance only. V1 does not
fetch user-provided URLs and does not accept arbitrary PDF uploads. Source
connectors and OCR are separate, security-sensitive increments built after the
retrieval core is proven.

## Data rules

- A document is rejected unless reuse rights are explicit and verified.
- Original OCR text is retained; corrected text is stored separately.
- Every chunk records document, page/section, text hash, source class, rights,
  language and entity/city QIDs.
- Queries can filter by city, entity, language, source class, document, rights,
  publication year, historical period and minimum OCR confidence.
- Results expose lexical, dense, fusion and rerank scores, the query hash and
  the index fingerprint. They are discovery candidates, never authorized V8
  propositions.
- The index fingerprint includes the corpus version, embedding model and
  dimension, reranker model, chunking policy and source-registry version.

## Security boundaries

- The Podman port binds to loopback only and the compose project is opt-in.
- Ingest requires an admin token supplied through the environment; no token is
  committed.
- SQL is parameterized, request sizes and collection counts are bounded, and
  external/model text is treated as untrusted data.
- V1 performs no outbound URL fetches, shell execution or writer/tool calls.
- The container runs as a non-root user with dropped capabilities, a read-only
  root filesystem and writable data/model-cache volumes only.

## Commands

Use absolute compose paths because `podman compose` may change directory before
invoking its external provider:

```bash
CORPUS_REPO="$(git rev-parse --show-toplevel)"
CORPUS_COMPOSE="$CORPUS_REPO/deployment/podman/historical-corpus.compose.yml"
export PODMAN_COMPOSE_PROVIDER=podman-compose

PODMAN_COMPOSE_PROVIDER=podman-compose podman compose \
  -f "$CORPUS_COMPOSE" build

PODMAN_COMPOSE_PROVIDER=podman-compose podman compose \
  -f "$CORPUS_COMPOSE" up -d

podman build --target test \
  --tag localhost/tour-guide-historical-corpus:test \
  "$CORPUS_REPO/pods/historical-corpus-pod"
podman run --rm localhost/tour-guide-historical-corpus:test
```

See `docs/operations/historical-corpus-rag.md` for the isolated deterministic
smoke and Qwen startup procedures.

## Testing strategy

- Unit tests cover rights validation, hashing, FTS filters, reciprocal-rank
  fusion and deterministic index behavior.
- API integration tests use a temporary SQLite database and deterministic
  embedding/reranking doubles; no model download or network access is allowed.
- A Podman smoke test verifies build, health, ingest, retrieval, persistence and
  restart behavior before the service is considered usable.
- A later retrieval evaluation must use at least Málaga plus another Spanish
  city to avoid city-specific overfitting.

## Success criteria

1. Podman starts the service without starting or modifying the existing stack.
2. Reusable structured sources can be ingested and retrieved by lexical and
   dense paths with exact chunk/page/hash provenance.
3. Non-reusable sources, malformed metadata and oversized inputs fail closed.
4. Filtered searches cannot return a chunk from a different requested entity,
   city, language or rights class.
5. The index and database survive a service restart and expose a stable,
   inspectable fingerprint.
6. Tests and the deterministic Podman smoke path pass without external network
   or model downloads.
7. No Narrative V8, backend, frontend or canary files are changed.

## Deferred work

- PDF/image parsing, OCR correction and remote source connectors.
- Curator/boundary conversion of candidate chunks into authorized evidence.
- Narrative Research or auditor integration, including shadow mode.
- Domain evaluation datasets, reranker fine-tuning and Qwen contract tuning.
