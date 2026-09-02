# Historical Corpus RAG with Podman

This service retrieves historical passages with exact source, page, hash,
rights and OCR provenance. Its results are discovery candidates only: they do
not become authorized Narrative V8 evidence until the existing curator,
support, boundary and manifest checks accept them.

The service is intentionally absent from the shared Podman stack and every
canary. It starts only when its dedicated compose file is named explicitly.

## Prerequisites

- Podman 5 or newer.
- `podman-compose` available as the Podman compose provider.
- Enough disk space for the image and both Qwen 0.6B model caches.
- A private random admin token for the ingest endpoint.

`podman compose` changes its working directory before invoking some external
providers. Use the absolute compose paths below so the provider always finds
the files.

```bash
CORPUS_REPO="$(git rev-parse --show-toplevel)"
CORPUS_COMPOSE="$CORPUS_REPO/deployment/podman/historical-corpus.compose.yml"
CORPUS_SMOKE_COMPOSE="$CORPUS_REPO/deployment/podman/historical-corpus.smoke.compose.yml"
export PODMAN_COMPOSE_PROVIDER=podman-compose
export HISTORICAL_CORPUS_ADMIN_TOKEN="$(openssl rand -hex 32)"
```

## Deterministic smoke test

The smoke override uses deterministic local embeddings and reranking. It
proves the API, SQLite FTS5, TurboVec persistence, authentication and restart
path without downloading model weights. Its separate project name keeps the
deterministic index and volumes isolated from the normal Qwen service.

```bash
podman compose -p tour-guide-historical-corpus-smoke \
  -f "$CORPUS_COMPOSE" \
  -f "$CORPUS_SMOKE_COMPOSE" \
  up -d --build

until curl --fail --silent http://127.0.0.1:3010/health; do sleep 1; done

curl --fail --silent \
  -H "Authorization: Bearer $HISTORICAL_CORPUS_ADMIN_TOKEN" \
  -H "Content-Type: application/json" \
  --data-binary "@$CORPUS_REPO/pods/historical-corpus-pod/examples/malaga-smoke-ingest.json" \
  http://127.0.0.1:3010/v1/ingest

curl --fail --silent \
  -H "Content-Type: application/json" \
  --data-binary "@$CORPUS_REPO/pods/historical-corpus-pod/examples/malaga-smoke-search.json" \
  http://127.0.0.1:3010/v1/search

podman compose -p tour-guide-historical-corpus-smoke \
  -f "$CORPUS_COMPOSE" \
  -f "$CORPUS_SMOKE_COMPOSE" \
  down
podman compose -p tour-guide-historical-corpus-smoke \
  -f "$CORPUS_COMPOSE" \
  -f "$CORPUS_SMOKE_COMPOSE" \
  up -d

until curl --fail --silent http://127.0.0.1:3010/health; do sleep 1; done
curl --fail --silent http://127.0.0.1:3010/v1/index/version
```

Stop the isolated smoke project while preserving its volumes:

```bash
podman compose -p tour-guide-historical-corpus-smoke \
  -f "$CORPUS_COMPOSE" \
  -f "$CORPUS_SMOKE_COMPOSE" \
  down
```

Add `--volumes` only when the smoke corpus and model cache should be deleted.
Those volumes belong exclusively to the explicitly named smoke project.

## Start the Qwen service

The base compose uses Qwen3-Embedding-0.6B and Qwen3-Reranker-0.6B by default.
It binds only to loopback on port 3010.

```bash
podman compose -f "$CORPUS_COMPOSE" build
podman compose -f "$CORPUS_COMPOSE" up -d
curl --fail --silent http://127.0.0.1:3010/health
```

Model loading is lazy. `/health` confirms that the HTTP service, database and
stored index opened; the first ingest downloads and loads the embedding model,
and the first non-empty search also loads the reranker. The named model-cache
volume preserves those downloads across restarts.

To change device, model IDs, batch size or maximum token length, add a private
compose override with the corresponding variables understood by
`historical_corpus.runtime`. Do not put tokens or machine-specific overrides in
the tracked base compose file.

## API boundary

- `POST /v1/ingest` requires `Authorization: Bearer <admin token>`.
- Search and read endpoints are loopback-only but intentionally do not require
  a token in V1.
- Ingest accepts structured text plus provenance. It never downloads
  `sourceUrl`, accepts no arbitrary files and executes no source content.
- Sources without explicitly verified reuse rights fail closed.
- Every error uses `{ "error": { "code", "message", "details"? } }`.
- Interactive OpenAPI documentation is available at `/docs` while the service
  is running.

The endpoints are:

- `POST /v1/search`
- `POST /v1/search-for-stop`
- `POST /v1/search-for-claim`
- `GET /v1/chunks/{chunkId}`
- `GET /v1/documents/{documentId}`
- `POST /v1/ingest`
- `GET /v1/index/version`
- `GET /health`

## Verification and recovery

Run the complete test stage inside Podman without starting the service:

```bash
podman build \
  --target test \
  --tag localhost/tour-guide-historical-corpus:test \
  "$CORPUS_REPO/pods/historical-corpus-pod"
podman run --rm localhost/tour-guide-historical-corpus:test
```

The SQLite database is authoritative for document metadata, chunks and stored
embeddings. TurboVec is the replaceable dense index. Back up the data volume
before any recovery operation; a lost `index.tvim` can be rebuilt from the
embeddings in `corpus.sqlite3` on the next clean start.
