# Historical Corpus RAG with Podman

This service retrieves historical passages with exact source, page, hash,
rights and OCR provenance. Its results are discovery candidates only: they do
not become authorized Narrative V8 evidence until the existing curator,
support, boundary and manifest checks accept them.

The service is intentionally absent from the shared Podman stack and is not
started by a canary. Start it explicitly with its dedicated compose file.
Narrative V8 can optionally query the running service with `--rag=on`; its
default `--rag=off` makes no corpus requests.

## Narrative V8: optional evidence

Add `--rag=on` to the normal `quality:narrative:v8:user-canary` command.
Use `--rag=off` (the default) for the baseline. The optional
`--rag-base-url=http://127.0.0.1:3010` or `HISTORICAL_CORPUS_BASE_URL`
selects the already-running local service; only HTTP loopback origins are
accepted. No ingest, index repair or model/provider changes occur.

Retrieval runs before the first curator round. At most two searches and three
accepted chunks per stop are allowed. Untagged corpora use a bounded textual
fallback requiring city and stop identity; a retrieval score alone is not
identity evidence. Current policy admits reviewed reusable, coverage-accepted,
exact-record primary historical sources with OCR confidence at least 0.9 and
reranker score at least 0.5. These conservative cutoffs are provisional, not
a guarantee of semantic relevance.

The curator receives catalogue metadata separately from the original OCR.
Historical evidence alone cannot establish a current visible observation.
Each chunk keeps its provenance and a distinct source URL fragment; chunks
from the same hostname do not count as independent publishers. The fragment
identifies the corpus chunk, not a claimed Google Books page anchor. Logical
page numbers, source URL, section, year and hashes remain in checkpoint
capture metadata.

A missing/down corpus degrades to ordinary sources and records the error;
`off` makes no corpus requests. Inspect
`review.research[].historicalCorpus`, `historicalSourceIdsUsed` and
`historicalPropositionCount` to distinguish retrieval from actual dossier
use. Full provenance is saved under research captures' `historicalCorpus`.
Publication checks are unchanged.

Use different run IDs for comparisons. The research mode is part of the
request fingerprint: an off checkpoint can switch to on only with
`--resume-from=research` and the same base request. This preserves route and
narration targets but rebuilds research, arc and narration; editorial/scorecard
resumes cannot reuse old approvals under a changed RAG mode. The corpus index
version is recorded with every accepted capture.

Keep `--prior-spend-usd` cumulative across trials of one authorized budget;
do not reset it to zero between the off/on runs.

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

The verify-mode API intentionally rejects a fresh data directory until
`repair-index` creates the empty TurboVec/index-state pair; this preserves
fail-closed startup.

```bash
podman compose -p tour-guide-historical-corpus-smoke \
  -f "$CORPUS_COMPOSE" \
  -f "$CORPUS_SMOKE_COMPOSE" \
  --profile ingest \
  build historical-corpus-ingest

podman compose -p tour-guide-historical-corpus-smoke \
  -f "$CORPUS_COMPOSE" \
  -f "$CORPUS_SMOKE_COMPOSE" \
  --profile ingest \
  run --rm historical-corpus-ingest repair-index

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

## Preparar sin publicar

Esta sección prepara y evalúa en privado el corpus Madoz Málaga con el perfil
aislado de ingesta. Se detiene antes de publicar: no usa `publish`,
`repair-index`, el canario, el stack del backend ni ingesta HTTP externa.

### Requisitos y variables

```bash
CORPUS_REPO="$(git rev-parse --show-toplevel)"
CORPUS_COMPOSE="$CORPUS_REPO/deployment/podman/historical-corpus.compose.yml"
: "${HISTORICAL_CORPUS_ADMIN_TOKEN:?HISTORICAL_CORPUS_ADMIN_TOKEN must be set}"
: "${HISTORICAL_CORPUS_IMPORT_DIR:?HISTORICAL_CORPUS_IMPORT_DIR must be set}"
: "${MADOZ_SOURCE_PDF:?MADOZ_SOURCE_PDF must be set}"
test "${HISTORICAL_CORPUS_IMPORT_DIR#/}" != "$HISTORICAL_CORPUS_IMPORT_DIR"
test "${MADOZ_SOURCE_PDF#/}" != "$MADOZ_SOURCE_PDF"
HISTORICAL_CORPUS_IMPORT_DIR="$(realpath -m -- "$HISTORICAL_CORPUS_IMPORT_DIR")"
MADOZ_SOURCE_PDF="$(realpath -e -- "$MADOZ_SOURCE_PDF")"
case "$HISTORICAL_CORPUS_IMPORT_DIR" in
  "$CORPUS_REPO" | "$CORPUS_REPO"/*) exit 1 ;;
esac
export PODMAN_COMPOSE_PROVIDER=podman-compose
: "${HISTORICAL_CORPUS_MODEL_BACKEND:=qwen}"
: "${HISTORICAL_CORPUS_ALLOW_DETERMINISTIC:=false}"
: "${HISTORICAL_CORPUS_MODEL_BATCH_SIZE:=8}"
: "${HISTORICAL_CORPUS_MODEL_MAX_LENGTH:=8192}"
: "${HISTORICAL_CORPUS_TURBOVEC_BIT_WIDTH:=4}"
: "${HISTORICAL_CORPUS_DEVICE:=}"
: "${HISTORICAL_CORPUS_EMBEDDING_MODEL:=Qwen/Qwen3-Embedding-0.6B}"
: "${HISTORICAL_CORPUS_RERANKER_MODEL:=Qwen/Qwen3-Reranker-0.6B}"
export HISTORICAL_CORPUS_ADMIN_TOKEN HISTORICAL_CORPUS_IMPORT_DIR
export HISTORICAL_CORPUS_MODEL_BACKEND HISTORICAL_CORPUS_ALLOW_DETERMINISTIC
export HISTORICAL_CORPUS_MODEL_BATCH_SIZE HISTORICAL_CORPUS_MODEL_MAX_LENGTH
export HISTORICAL_CORPUS_TURBOVEC_BIT_WIDTH HISTORICAL_CORPUS_DEVICE
export HISTORICAL_CORPUS_EMBEDDING_MODEL HISTORICAL_CORPUS_RERANKER_MODEL
MADOZ_PDF="$HISTORICAL_CORPUS_IMPORT_DIR/Diccionario_geográfico_estadístico_his.pdf"
MADOZ_MANIFEST="$HISTORICAL_CORPUS_IMPORT_DIR/madoz-t11.private.yml"
MADOZ_INVENTORY="$HISTORICAL_CORPUS_IMPORT_DIR/madoz-t11.pages.private.jsonl"
```

- `HISTORICAL_CORPUS_IMPORT_DIR` debe ser una ruta absoluta privada en el host
  y no puede estar dentro de `CORPUS_REPO`.
- `MADOZ_SOURCE_PDF` debe ser una ruta absoluta al PDF de origen.
- El token de administrador debe ser aleatorio y privado.
- Los valores de modelo conservan cualquier override del operador. Si faltan,
  toman los defaults de `.env.example`; así el proveedor local nunca recibe
  expresiones sin resolver.

### Fase 1: Directorio privado de importación

```bash
install -d -m 0700 "$HISTORICAL_CORPUS_IMPORT_DIR"
install -m 0600 "$MADOZ_SOURCE_PDF" "$MADOZ_PDF"
MADOZ_EXPECTED_SHA=d20c9a01f68bd091490a008433e4f1d709dca370181a20b56ca99bbb31bc01ff
MADOZ_ACTUAL_SHA="$(sha256sum -- "$MADOZ_PDF" | cut -d ' ' -f 1)"
test "$MADOZ_ACTUAL_SHA" = "$MADOZ_EXPECTED_SHA"
```

El `test` detiene el flujo si el SHA-256 no coincide exactamente.

### Fase 2: Manifiesto privado

```bash
install -m 0600 \
  "$CORPUS_REPO/pods/historical-corpus-pod/examples/madoz-t11-malaga-partial.manifest.example.yml" \
  "$MADOZ_MANIFEST"
```

El manifiesto debe requerir:

- Páginas 39-109.
- `partial_source`.
- Páginas impresas faltantes: 62, 63, 98, 99, 102, 103.
- `acceptedForProduct: false`.
- Derechos pendientes.
- Hash, estado y marca de tiempo de inventario pendientes.

No añadir a Git el PDF, manifiesto privado, inventario, gold ni reportes.

### Fase 3: Validación del manifiesto

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest build historical-corpus-ingest
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest validate-manifest \
  --manifest /imports/madoz-t11.private.yml
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest validate-manifest \
  --manifest /imports/madoz-t11.private.yml \
  --check-source
```

### Fase 4-6: Construcción y revisión del inventario

El bind base conserva `/imports` como read-only. El segundo bind expone el
mismo directorio por una ruta de salida separada y escribible:

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  -v "$HISTORICAL_CORPUS_IMPORT_DIR:/inventory-output:Z,U" \
  historical-corpus-ingest build-inventory \
  --manifest /imports/madoz-t11.private.yml

MADOZ_STORAGE_KEY="$(printf '%s' \
  'madoz-1848-t11-malaga-partial-google-books' | sha256sum | cut -d ' ' -f 1)"
MADOZ_GENERATED_INVENTORY="$HISTORICAL_CORPUS_IMPORT_DIR/$MADOZ_STORAGE_KEY/page-inventory.jsonl"
install -m 0600 "$MADOZ_GENERATED_INVENTORY" "$MADOZ_INVENTORY"
```

Stdout también devuelve `path`, `sha256`, `records` y `pendingReview`. Revisar
solo `anomalyFlags` y decisiones pendientes; no editar el JSONL. Corregir
`selection.canonicalization.pageOverrides`, manteniendo orden por página y
lado, y repetir la generación y copia hasta obtener `pendingReview: 0` sin
anomalías sin resolver.

Antes de congelarlo, verificar la correspondencia física y lógica:

```bash
python3 - "$MADOZ_INVENTORY" <<'PY'
import json
import sys

with open(sys.argv[1], encoding="utf-8") as handle:
    rows = [json.loads(line) for line in handle]
expected_labels = (
    list(range(32, 62))
    + list(range(64, 98))
    + list(range(100, 102))
    + list(range(104, 109))
)
assert len(rows) == 71
assert all(row["side"] == "full" for row in rows)
assert all(row["canonicalStatus"] == "include" for row in rows)
assert [row["canonicalSequenceIndex"] for row in rows] == list(range(1, 72))
assert [int(row["normalizedPrintedLabel"]) for row in rows] == expected_labels
assert sorted(set(range(32, 109)) - set(expected_labels)) == [62, 63, 98, 99, 102, 103]
PY

sha256sum -- "$MADOZ_INVENTORY"
date --iso-8601=seconds
```

Copiar al manifiesto el SHA desnudo, fijar
`inventoryReviewStatus: verified` e `inventoryVerifiedAt` con el timestamp y
repetir la validación cerrada:

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest validate-manifest \
  --manifest /imports/madoz-t11.private.yml \
  --check-source
```

Este último comando debe aceptar exactamente 71 hojas, rangos impresos
32-61/64-97/100-101/104-108 y los seis huecos declarados.

### Fase 7: Prefetch de modelos

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest prefetch-models \
  --manifest /imports/madoz-t11.private.yml
```

Conservar `ppocrv6-medium-transformers/model-lock.json` en el volumen nombrado
de modelos. Desde aquí, cada OCR verifica el lock cerrado, el inventario de
archivos y sus hashes locales; si algo falta o cambia, falla en vez de iniciar
una descarga implícita.

### Fase 8: Humo OCR

```bash
set -e
for page in 39 41 42 52 60 68 69 70 89 92 102 108; do
  podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
    historical-corpus-ingest ocr-smoke \
    --manifest /imports/madoz-t11.private.yml \
    --pdf-page "$page" \
    --side full
done
```

Detener en el primer fallo.

### Fase 9: Muestra de evaluación

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest prepare-sample --manifest /imports/madoz-t11.private.yml \
  --pages 39:full,41:full,42:full,43:full,47:full,52:full,57:full,60:full,68:full,69:full,70:full,71:full,89:full,90:full,91:full,92:full,102:full,103:full,104:full,105:full,106:full,107:full,108:full,109:full
```

```text
PDF:     39,41,42,43,47,52,57,60,68,69,70,71,89,90,91,92,102,103,104,105,106,107,108,109
lógica:   1, 3, 4, 5, 9,14,19,22,30,31,32,33,51,52,53,54, 64, 65, 66, 67, 68, 69, 70, 71
```

El comando imprime el `path` exacto de una muestra no publicable. Copiar ese
valor, que debe quedar bajo `/data/staging`, en `OCR_SAMPLE_PATH`. Transcribir
el gold humano privado únicamente desde los facsímiles; nunca completar los
huecos ausentes ni usar como verdad la capa OCR de Google.

```bash
: "${OCR_SAMPLE_PATH:?use the path returned by prepare-sample}"
case "$OCR_SAMPLE_PATH" in
  /data/staging/*) ;;
  *) exit 1 ;;
esac
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest evaluate-ocr --sample "$OCR_SAMPLE_PATH" \
  --gold /imports/madoz-t11.gold.private.jsonl \
  --report /data/reports/madoz-t11-ocr-report.json
```

El comando escribe el reporte atómicamente bajo `/data/reports`. Un código 5
o cualquier gate fallido prohíbe ejecutar la preparación completa.

### Fase 10: Preparación completa

Solo después de que la OCR R2 pase:

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest prepare \
  --manifest /imports/madoz-t11.private.yml
```

- Requerir las 71 hojas, cero páginas fallidas y cero
  `oversize_body_line`.
- Ejecutar el mismo comando de preparación una segunda vez:

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest prepare \
  --manifest /imports/madoz-t11.private.yml
```

- Verificar que el segundo informe demuestra resume/reutilización sin re-OCR
  de páginas staged válidas.

No continuar con publicación mientras derechos y cobertura sigan pendientes.

## Publicar el corpus parcial

Esta sección publica, opera, prueba la recuperación y revierte el corpus Madoz
parcial ya preparado. Usa exclusivamente Podman y el compose absoluto
`$CORPUS_COMPOSE`. El comando de API y el de ingesta/publicación deben usar
los mismos valores de runtime compartidos; validar la configuración Compose
antes de continuar.

### Fase 1: Aprobación humana y preparación

Requiere aprobación humana escrita para los derechos de uso previsto y la
cobertura parcial consciente. En el manifiesto privado fijar:

- `rights.status: reviewed_reusable`
- `rights.verifiedAt` con zona horaria
- `rights.isExplicitlyReusable: true`
- `coverage.acceptedForProduct: true`
- `coverage.acceptedAt` con zona horaria

Conservar `partial_source`, los rangos y los seis huecos (62, 63, 98, 99, 102,
103). Regenerar el bundle y exigir que las 71 hojas staged se reutilicen sin
repetir OCR:

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest prepare \
  --manifest /imports/madoz-t11.private.yml
```

Copiar el `preparedDocumentPath` devuelto en stdout y validarlo antes de
continuar:

```bash
: "${PREPARED_PATH:?use preparedDocumentPath returned by prepare}"
case "$PREPARED_PATH" in
  /data/staging/*) ;;
  *) exit 1 ;;
esac
```

### Fase 2: Validación de configuración Compose

Comprobar la configuración de runtime común para API e ingesta/publicación.
Abortar ante cualquier divergencia, backend determinístico o
`ALLOW_DETERMINISTIC` distinto de `false`.

```bash
set -o pipefail
podman compose -f "$CORPUS_COMPOSE" --profile ingest config | /usr/bin/python3 -c '
import sys
import yaml

config = yaml.safe_load(sys.stdin)
services = config["services"]
api = services["historical-corpus-api"]["environment"]
ingest = services["historical-corpus-ingest"]["environment"]
keys = (
    "HISTORICAL_CORPUS_DATA_DIR",
    "HISTORICAL_CORPUS_MODEL_BACKEND",
    "HISTORICAL_CORPUS_ALLOW_DETERMINISTIC",
    "HISTORICAL_CORPUS_MODEL_BATCH_SIZE",
    "HISTORICAL_CORPUS_MODEL_MAX_LENGTH",
    "HISTORICAL_CORPUS_TURBOVEC_BIT_WIDTH",
    "HISTORICAL_CORPUS_DEVICE",
    "HISTORICAL_CORPUS_EMBEDDING_MODEL",
    "HISTORICAL_CORPUS_RERANKER_MODEL",
    "HF_HOME",
)
assert {key: api[key] for key in keys} == {key: ingest[key] for key in keys}
assert api["HISTORICAL_CORPUS_MODEL_BACKEND"] == "qwen"
assert api["HISTORICAL_CORPUS_ALLOW_DETERMINISTIC"] == "false"
print({key: api[key] for key in keys})
'
```

El filtro imprime únicamente los diez valores no secretos del mapping. API e
ingesta deben coincidir en todos. `publish` usa el servicio de ingesta, por lo
que una divergencia invalida la publicación.

### Fase 3: Parar API y volcado atómico

Detener la API y exportar un backup consistente del estado anterior. Nunca
usar `down -v`.

```bash
podman compose -f "$CORPUS_COMPOSE" down
CORPUS_DATA_VOLUME=tour-guide-historical-corpus_historical-corpus-data
BACKUP_DIR="$HISTORICAL_CORPUS_IMPORT_DIR/backups"
install -d -m 0700 "$BACKUP_DIR"
BACKUP_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
BACKUP_TAR="$BACKUP_DIR/madoz-t11-before-publish-$BACKUP_STAMP.tar"
BACKUP_TMP="$BACKUP_TAR.tmp"
podman volume export -o "$BACKUP_TMP" "$CORPUS_DATA_VOLUME"
chmod 0600 "$BACKUP_TMP"
mv -- "$BACKUP_TMP" "$BACKUP_TAR"
BACKUP_SHA="$(sha256sum -- "$BACKUP_TAR" | cut -d ' ' -f 1)"
CURRENT_IMAGE_ID="$(podman image inspect \
  localhost/tour-guide-historical-corpus:local --format '{{.Id}}')"
CURRENT_IMAGE_DIGEST="$(podman image inspect \
  localhost/tour-guide-historical-corpus:local --format '{{.Digest}}')"
test -n "$BACKUP_SHA"
test -n "$CURRENT_IMAGE_ID"
```

El tar puede contener el PDF canónico y siempre es privado. No guardar el
backup, sus hashes ni rutas de host dentro de Git.

### Fase 4: Publicar

Ejecutar `publish` mediante el perfil efímero y registrar el `documentId`, los
`chunkIds` y el `chunkCount` devueltos.

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest publish \
  --prepared "$PREPARED_PATH"
```

### Fase 5: Iniciar solo la API

Iniciar únicamente el API. El perfil `ingest` nunca se ejecuta como daemon.

```bash
podman compose -f "$CORPUS_COMPOSE" up -d historical-corpus-api
```

### Fase 6: Verificación con curl

Esperar el health y conservar en privado el estado inicial del índice y un
preview de procedencia:

```bash
curl --retry 120 --retry-delay 1 --retry-all-errors --fail --silent \
  http://127.0.0.1:3010/health
INDEX_AFTER_PUBLISH="$HISTORICAL_CORPUS_IMPORT_DIR/index-after-publish.json"
curl --fail --silent --output "$INDEX_AFTER_PUBLISH" \
  http://127.0.0.1:3010/v1/index/version
chmod 0600 "$INDEX_AFTER_PUBLISH"
curl --fail --silent http://127.0.0.1:3010/v1/documents/madoz-1848-t11-malaga-partial-google-books
curl --fail --silent http://127.0.0.1:3010/v1/documents/madoz-1848-t11-malaga-partial-google-books/pages
curl --fail --silent http://127.0.0.1:3010/v1/documents/madoz-1848-t11-malaga-partial-google-books/pages/1
PREVIEW_PATH="$HISTORICAL_CORPUS_IMPORT_DIR/madoz-t11-page1-preview.png"
curl --fail --silent --output "$PREVIEW_PATH" \
  http://127.0.0.1:3010/v1/documents/madoz-1848-t11-malaga-partial-google-books/pages/1/image
chmod 0600 "$PREVIEW_PATH"
curl --fail --silent -H "Content-Type: application/json" \
  --data-binary \
  '{"query":"Málaga provincia caminos población","documentIds":["madoz-1848-t11-malaga-partial-google-books"],"limit":20}' \
  http://127.0.0.1:3010/v1/search
```

Registrar `indexVersion` y `generation` del JSON. Documento, lista, página e
imagen deben conservar `partial_source`, numeración y procedencia coherentes.

### Fase 7: Evaluación de recuperación

Ejecutar `evaluate-retrieval` desde el perfil ingest contra exactamente
`http://historical-corpus-api:3010`, casos bajo `/imports` y reporte bajo
`/data/reports`; requerir que los casos y la relevancia no dependan de las
páginas impresas 62, 63, 98, 99, 102, 103 y detener en exit 5/gates fallidos.

```bash
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest evaluate-retrieval \
  --api-base-url http://historical-corpus-api:3010 \
  --cases /imports/madoz-t11-retrieval-cases.private.jsonl \
  --report /data/reports/madoz-t11-retrieval-report.json
```

### Fase 8: Prueba de recuperación

Primero repetir exactamente el mismo publish con el API detenido. El replay
sano no debe duplicar datos ni cambiar `generation` o `indexVersion`:

```bash
INDEX_BEFORE_REPLAY="$HISTORICAL_CORPUS_IMPORT_DIR/index-before-replay.json"
cp -- "$INDEX_AFTER_PUBLISH" "$INDEX_BEFORE_REPLAY"
chmod 0600 "$INDEX_BEFORE_REPLAY"
podman compose -f "$CORPUS_COMPOSE" down
podman compose -f "$CORPUS_COMPOSE" --profile ingest run --rm \
  historical-corpus-ingest publish --prepared "$PREPARED_PATH"
podman compose -f "$CORPUS_COMPOSE" up -d historical-corpus-api
curl --retry 120 --retry-delay 1 --retry-all-errors --fail --silent \
  http://127.0.0.1:3010/health
INDEX_AFTER_REPLAY="$HISTORICAL_CORPUS_IMPORT_DIR/index-after-replay.json"
curl --fail --silent --output "$INDEX_AFTER_REPLAY" \
  http://127.0.0.1:3010/v1/index/version
chmod 0600 "$INDEX_AFTER_REPLAY"
cmp --silent "$INDEX_BEFORE_REPLAY" "$INDEX_AFTER_REPLAY"
```

La reparación se ensaya solo sobre un clon. Crear primero otro backup
consistente, esta vez posterior al publish, sin modificar el volumen primario:

```bash
podman compose -f "$CORPUS_COMPOSE" down
RECOVERY_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
RECOVERY_BACKUP_TAR="$BACKUP_DIR/madoz-t11-after-publish-$RECOVERY_STAMP.tar"
RECOVERY_BACKUP_TMP="$RECOVERY_BACKUP_TAR.tmp"
podman volume export -o "$RECOVERY_BACKUP_TMP" "$CORPUS_DATA_VOLUME"
chmod 0600 "$RECOVERY_BACKUP_TMP"
mv -- "$RECOVERY_BACKUP_TMP" "$RECOVERY_BACKUP_TAR"
podman compose -f "$CORPUS_COMPOSE" up -d historical-corpus-api
curl --retry 120 --retry-delay 1 --retry-all-errors --fail --silent \
  http://127.0.0.1:3010/health

RECOVERY_DATA_VOLUME="madoz-t11-recovery-$RECOVERY_STAMP"
case "$RECOVERY_DATA_VOLUME" in
  madoz-t11-recovery-*) ;;
  *) exit 1 ;;
esac
export RECOVERY_DATA_VOLUME
podman volume create "$RECOVERY_DATA_VOLUME"
podman volume import "$RECOVERY_DATA_VOLUME" "$RECOVERY_BACKUP_TAR"
RECOVERY_OVERRIDE="$HISTORICAL_CORPUS_IMPORT_DIR/historical-corpus.recovery.private.yml"
umask 077
cat >"$RECOVERY_OVERRIDE" <<'YAML'
services:
  historical-corpus-api:
    volumes:
      - historical-corpus-recovery-data:/data:Z,U
  historical-corpus-ingest:
    volumes:
      - historical-corpus-recovery-data:/data:Z,U
volumes:
  historical-corpus-recovery-data:
    external: true
    name: "${RECOVERY_DATA_VOLUME}"
YAML
RECOVERY_COMPOSE=(
  podman compose -p tour-guide-historical-corpus-recovery
  -f "$CORPUS_COMPOSE" -f "$RECOVERY_OVERRIDE"
)
"${RECOVERY_COMPOSE[@]}" --profile ingest config >/dev/null
```

Registrar primero `generation` e `indexVersion` del clon. Después insertar un
journal pendiente que coincide con su autoridad SQLite. Esta es la única
mutación simulada y no borra, mueve ni altera `index.tvim`:

```bash
"${RECOVERY_COMPOSE[@]}" --profile ingest run --rm \
  --entrypoint python historical-corpus-ingest -c '
import sqlite3
db = sqlite3.connect("/data/corpus.sqlite3")
print(db.execute(
    "SELECT generation, index_version FROM index_state WHERE id = 1"
).fetchone())
db.close()
'

"${RECOVERY_COMPOSE[@]}" --profile ingest run --rm \
  --entrypoint python historical-corpus-ingest -c '
import sqlite3
from datetime import datetime, timezone

db = sqlite3.connect("/data/corpus.sqlite3")
with db:
    assert db.execute(
        "SELECT COUNT(*) FROM index_sync_journal"
    ).fetchone() == (0,)
    inserted = db.execute("""
        INSERT INTO index_sync_journal (
            id, operation, target_generation, target_index_version,
            target_corpus_index_version, target_authority_sha256,
            embedding_model, embedding_dimension, reranker_model,
            vector_index_backend, vector_index_bit_width,
            chunking_policy_version, source_registry_version,
            document_count, chunk_count, created_at
        )
        SELECT 1, 'repair', generation + 1, index_version,
            corpus_index_version, authority_sha256,
            embedding_model, embedding_dimension, reranker_model,
            vector_index_backend, vector_index_bit_width,
            chunking_policy_version, source_registry_version,
            document_count, chunk_count, ?
        FROM index_state WHERE id = 1
    """, (datetime.now(timezone.utc).isoformat(),))
    assert inserted.rowcount == 1
db.close()
'
```

El modo `verify` debe rechazar el journal. Si abre, el ensayo falla:

```bash
if "${RECOVERY_COMPOSE[@]}" --profile ingest run --rm \
  --entrypoint python historical-corpus-ingest -c '
from historical_corpus.runtime import build_service_from_env
service = build_service_from_env(startup_policy="verify")
service.close()
'; then
  exit 1
fi

REPAIR_REPORT="$HISTORICAL_CORPUS_IMPORT_DIR/recovery-repair.private.log"
"${RECOVERY_COMPOSE[@]}" --profile ingest run --rm \
  historical-corpus-ingest repair-index | tee "$REPAIR_REPORT"
chmod 0600 "$REPAIR_REPORT"
rg -F '"repaired":true' "$REPAIR_REPORT"

"${RECOVERY_COMPOSE[@]}" --profile ingest run --rm \
  --entrypoint python historical-corpus-ingest -c '
import json
from historical_corpus.runtime import build_service_from_env
service = build_service_from_env(startup_policy="verify")
print(json.dumps(service.index_version().model_dump(mode="json"), sort_keys=True))
service.close()
'
```

Comparar la primera tupla con los dos últimos JSON: `indexVersion` debe
permanecer igual, `generation` aumentar exactamente una vez y el journal
desaparecer. El volumen aceptado no participa en estas órdenes; conservar el
clon hasta documentar el resultado.

### Fase 9: Rollback

El rollback nunca importa encima del primario. Usa la imagen anterior
inmutable y restaura el backup previo a publicación en otro volumen:

```bash
: "${CORPUS_PREVIOUS_IMAGE:?set a previously recorded image ID or digest}"
podman compose -f "$CORPUS_COMPOSE" down
ROLLBACK_STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
ROLLBACK_VOLUME="madoz-t11-rollback-$ROLLBACK_STAMP"
case "$ROLLBACK_VOLUME" in
  madoz-t11-rollback-*) ;;
  *) exit 1 ;;
esac
podman volume create "$ROLLBACK_VOLUME"
podman volume import "$ROLLBACK_VOLUME" "$BACKUP_TAR"
RECOVERY_DATA_VOLUME="$ROLLBACK_VOLUME"
export RECOVERY_DATA_VOLUME
podman tag "$CORPUS_PREVIOUS_IMAGE" \
  localhost/tour-guide-historical-corpus:local
ROLLBACK_COMPOSE=(
  podman compose -p tour-guide-historical-corpus
  -f "$CORPUS_COMPOSE" -f "$RECOVERY_OVERRIDE"
)
"${ROLLBACK_COMPOSE[@]}" config >/dev/null
"${ROLLBACK_COMPOSE[@]}" up -d historical-corpus-api
curl --retry 120 --retry-delay 1 --retry-all-errors --fail --silent \
  http://127.0.0.1:3010/health
curl --fail --silent http://127.0.0.1:3010/v1/index/version
curl --fail --silent -H "Content-Type: application/json" \
  --data-binary \
  '{"query":"Málaga","documentIds":["madoz-1848-t11-malaga-partial-google-books"],"limit":20}' \
  http://127.0.0.1:3010/v1/search
```

Comparar health, versión y búsqueda con el estado anterior documentado. No
borrar el volumen primario, el volumen nuevo ni `CURRENT_IMAGE_ID`: permiten
deshacer el ensayo. Para volver a la imagen nueva, retaggear explícitamente
`CURRENT_IMAGE_ID` solo después de decidir qué estado conservar.

Todos los overrides, backups, previews y reportes de estas fases son privados
y no se versionan. En preparación, publicación y rollback queda prohibido:
usar Docker, montar el socket Podman, exponer un puerto OCR, publicar el
directorio de imports, usar `down -v`, o commitear tokens, rutas privadas,
modelos, PDFs, inventarios, bundles o reportes.

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
- `GET /v1/documents/{documentId}/pages`
- `GET /v1/documents/{documentId}/pages/{logicalPageNumber}`
- `GET /v1/documents/{documentId}/pages/{logicalPageNumber}/image`
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
