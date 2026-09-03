# Plan de ejecución: ingesta Madoz y RAG histórico aislado con Podman

## Estado y autoridad

- Estado: **decisiones cerradas; listo para ejecución incremental**.
- Rama de trabajo: `codex/feature/historical-corpus-rag-podman`.
- Documento canónico: este archivo.
- Sustituye por completo el plan V6, que queda cancelado.
- El checklist de ejecución está incluido aquí; `tasks/todo.md` ya no es
  autoridad para este trabajo.
- Codex conserva la responsabilidad sobre arquitectura, compatibilidad,
  seguridad, revisión y aceptación.
- Qwen ejecuta únicamente las unidades acotadas que se detallan más abajo.
- Fecha de preparación: 2026-09-02.

## 1. Resultado que se quiere obtener

Ampliar el producto independiente `historical-corpus-pod` para que pueda:

1. recibir un PDF histórico local descrito por un manifiesto estricto;
2. verificar identidad, procedencia y derechos antes de publicar;
3. conservar una copia canónica del PDF fuera de Git;
4. separar pliegos digitalizados en páginas lógicas cuando corresponda;
5. inventariar la secuencia real, declarar huecos/duplicados y no prometer una
   cobertura que el binario no contiene;
6. usar PP-OCRv6 local como única fuente de texto publicable y limitar la capa
   OCR embebida a señales de inventario y diagnóstico;
7. conservar trazabilidad exacta por documento, pliego PDF, lado, página,
   línea y caja;
8. formar fragmentos que nunca mezclen dos entradas del diccionario;
9. publicar esos fragmentos mediante el servicio ya existente de
   SQLite/FTS5, Qwen y TurboVec;
10. evaluar OCR y recuperación con métricas reproducibles;
11. ejecutarse con Podman como producto separado, sin conectarse todavía al
    canario ni al backend narrativo.

La primera prueba y el producto Málaga usan el tomo XI entregado en segundo
lugar. El tomo XVI queda como validación scan-only posterior. El pipeline debe
seguir siendo genérico para los demás tomos de Madoz.

## 2. Fuentes reales disponibles

### 2.1 Fuente primaria: tomo XI con Málaga

Archivo recibido:

```text
/home/jesusotero/.codex/attachments/aa8ff399-aae8-497c-a9dc-0049ea17e6b6/Diccionario_geográfico_estadístico_his.pdf
```

| Campo | Valor comprobado |
|---|---|
| Nombre | `Diccionario_geográfico_estadístico_his.pdf` |
| Tamaño | `144749939` bytes |
| SHA-256 desnudo | `d20c9a01f68bd091490a008433e4f1d709dca370181a20b56ca99bbb31bc01ff` |
| Formato/cifrado | PDF 1.4, no cifrado |
| Páginas PDF | 783, una hoja vertical por página en el cuerpo |
| Rotación PDF | 0° en las 783 páginas |
| Texto/words PDF | presentes en 772 páginas; ausentes en 11 guardas/blancos |
| Imágenes | escaneo raster más marcas/elementos Google según página |
| Productor | Google Books PDF Converter (rel 3 12/12/14) |
| Título metadata | Diccionario…: Mad-Mos |
| Autor | Pascual Madoz |
| Tomo/fecha de portada | XI, Madrid, 1848 |
| Registro exacto | `https://books.google.es/books?id=eboNAAAAIAAJ&hl=es` |

Hechos relevantes para la ingesta:

- La capa de texto existente es OCR embebido de Google, no texto editorial. Se
  conserva solo como señal de inventario y baseline diagnóstico; nunca es una
  fuente de texto publicable en la versión 1.
- El cuerpo empieza en la página PDF 14. La primera aparición de la entrada
  provincial `MALAGA (PROVINCIA DE)` está al pie de la página PDF 41; las
  páginas 40–41 contienen la tabla del obispado y el artículo continúa después.
- El subconjunto objetivo Málaga ocupa PDF 39–109: empieza con
  `MALAGA (OBISPADO DE)` y termina antes de las demás entradas `MAL...`.
- El binario **no es una secuencia bibliográfica completa**. Dentro de Málaga,
  PDF 68 termina en la página impresa 61 y PDF 69 empieza en 64; PDF 102 pasa
  de 97 a PDF 103=100; PDF 104=101 y PDF 105=104. Faltan como mínimo las
  impresas `62–63`, `98–99` y `102–103`.
- Fuera del subconjunto Málaga existen bloques repetidos o fuera de orden. Por
  ejemplo, PDF 257–264 contiene impresas 268–273 y 276–277, y PDF 265–274
  vuelve a 266–273 y 276–277. PDF 745–750 y 759–764 son escaneos alternativos
  de las impresas 786–791; PDF 773–774 vuelve a repetir 790–791. Las erratas
  también reaparecen en 752–754, 766–768 y 776–778.
- En consecuencia, ningún rango físico se denomina “tomo completo”. La primera
  entrega solo prepara las 71 hojas físicas PDF 39–109 mediante un inventario
  revisado y publica, si se autoriza, un corpus Málaga de cobertura parcial.
- Un experimento con umbrales simples habría aceptado 613 de 737 hojas PDF
  14–750 de la capa embebida, pero 241 de esas hojas contienen letras de
  scripts inesperados. Se observaron 1.605 codepoints alfabéticos no latinos
  en 311 hojas; esta evidencia justifica excluirla del pipeline publicable. El
  CER gold decide si PP-OCRv6 alcanza el gate, no si se cambia de fuente.
- El cuerpo es normalmente de dos columnas, con tablas de una página completa
  y una marca visible “Digitized by Google”.
- `Mad–Mos` es el título metadata/extremo físico del registro. La secuencia
  alfabética principal observable llega a `MUZTILLANO` en PDF 746 y allí mismo
  empieza un suplemento MON–MÓSTOLES que termina en PDF 750; el plan registra
  ambos hechos y no inventa un único rango alfabético limpio.

### 2.2 Fuente secundaria: tomo XVI sin capa de texto

```text
/home/jesusotero/.codex/attachments/fa13c578-2dfe-421a-81a9-3e0fb08f933b/GMG-686-V-16.pdf
```

| Campo | Valor comprobado |
|---|---|
| Tamaño | `209271354` bytes |
| SHA-256 desnudo | `c7b9345881c4b9ea767adf7a31802ad37d242db7e4e8d870e43e6856206c1866` |
| Páginas PDF | 342 pliegos apaisados |
| Texto nativo | cero caracteres en las 342 páginas |
| Imágenes | una imagen raster por pliego |
| Identidad | tomo XVI, Vía–Zuzones, Madrid 1850, BNE `GM g 686` |

Este binario queda como corpus de estrés posterior para split de pliegos,
bleed-through y orientación mixta. No bloquea el producto Málaga.

### 2.3 Consecuencia de producto

- **POC y producto Málaga**: se construyen primero con las hojas PDF 39–109
  del tomo XI, con aviso de cobertura parcial y sin afirmar integridad.
- **Tomo XI completo**: queda fuera de la primera entrega hasta crear y revisar
  un inventario físico/impreso que resuelva repeticiones, orden y huecos.
- **Compatibilidad scan-only**: se demuestra después con una muestra del tomo
  XVI, reutilizando el mismo pipeline y `splitSpreads=true`.
- **Integración con canario**: sigue fuera de alcance hasta superar calidad,
  operación, derechos y autorización explícita.

### 2.4 Gate jurídico de la digitalización

El registro exacto del tomo XI ya está identificado. La primera página del PDF
declara la obra de dominio público, pero las normas incluidas por Google piden
uso no comercial, prohíben solicitudes automatizadas a su sistema y exigen
conservar la atribución/marca. Procesar localmente el archivo recibido no
equivale a solicitar páginas automáticamente, pero la compatibilidad entre el
uso final del producto y esas condiciones requiere confirmación humana.

Por tanto:

- `prepare` y evaluación local están permitidos por el flujo;
- `publish` falla mientras `rights.isExplicitlyReusable=false`;
- el manifiesto apunta al registro Google exacto, conserva la atribución y
  registra URI, estado y fecha de la revisión de condiciones;
- una persona autorizada debe confirmar que el uso previsto es compatible; el
  plan no convierte esa revisión en una conclusión legal automática;
- el tomo XVI conserva un gate separado de registro BNE si se usa después.

Referencias verificadas:

- [Registro exacto de Google Books](https://books.google.es/books?id=eboNAAAAIAAJ&hl=es)
- [Registro de obra BNE para contexto del tomo XVI](https://datos.bne.es/resource/XX2051707)
- [Condiciones generales BNE](https://www.bne.es/es/preguntas-frecuentes)

## 3. Baseline que debe conservarse

Ya existe un servicio independiente en:

```text
pods/historical-corpus-pod/
```

Y su despliegue Podman está en:

```text
deployment/podman/historical-corpus.compose.yml
```

El baseline ya ofrece:

- API FastAPI;
- autenticación bearer para ingesta;
- límites de cuerpo HTTP;
- validación estricta con Pydantic;
- registro SQLite y búsqueda FTS5;
- embeddings y reranking Qwen;
- índice TurboVec persistente;
- backend determinista permitido solo mediante opt-in explícito;
- identificadores y hashes reproducibles;
- recuperación por documento y filtros de evidencia;
- contenedor sin root, raíz de solo lectura, capacidades eliminadas y
  publicación exclusiva en loopback;
- volúmenes persistentes para datos y modelos.

No se reemplaza este runtime por el starter adjunto. Del starter se toman las
ideas de ingesta PDF/OCR, procedencia fina, evaluación y publicación
controlada. El runtime endurecido actual sigue siendo la autoridad.

Antes de la primera modificación, el ejecutor debe demostrar:

```bash
podman build --target test \
  -t localhost/tour-guide-historical-corpus:test \
  pods/historical-corpus-pod

podman run --rm \
  localhost/tour-guide-historical-corpus:test
```

Resultado esperado en el baseline conocido: 69 pruebas aprobadas. Si el
número cambió legítimamente antes de ejecutar este plan, se registra el nuevo
baseline; cualquier fallo debe resolverse antes de continuar.

## 4. Decisiones arquitectónicas cerradas

### 4.1 Forma del producto

Habrá dos procesos del mismo producto, no dos bases de código:

1. `historical-corpus-api`: servicio permanente ya existente.
2. `historical-corpus-ingest`: contenedor de una sola ejecución, activado
   solo con el perfil Compose `ingest`.

No se añaden Redis, Celery, una cola, un scheduler, un servidor OCR, un
servidor de modelos ni otro servicio permanente.

### 4.2 Flujo

```text
/imports (solo lectura)
  -> manifiesto estricto + PDF + inventario JSONL revisado
  -> verificación SHA/derechos/cobertura
  -> validación de orden, huecos y duplicados del inventario
  -> copia canónica /data/raw
  -> división pliego izquierda/derecha
  -> render/orientación
  -> PP-OCRv6 local (la capa Google queda solo como diagnóstico)
  -> líneas + cajas + confianza
  -> orden de lectura de dos columnas
  -> entradas Madoz
  -> fragmentos con lineIds
  -> bundle preparado y reanudable
  -> publicación exclusiva
  -> SQLite/FTS5 + embeddings + TurboVec
  -> reinicio del API
  -> evaluación de recuperación
```

### 4.3 Preparar y publicar son operaciones distintas

El CLI tendrá dos pasos principales:

- `prepare`: lee el PDF, hace OCR y genera un bundle preparado. No abre ni
  modifica SQLite o TurboVec. Puede ejecutarse mientras el API está vivo.
- `publish`: carga un bundle ya terminado, obtiene un bloqueo exclusivo,
  abre el runtime existente, inserta documento/procedencia/embeddings y
  sincroniza TurboVec. El API debe estar parado.

Esta separación evita tener simultáneamente PP-OCRv6 y los modelos Qwen en
memoria y permite evaluar el OCR antes de tocar el índice.

### 4.4 Bloqueo obligatorio

Se usará `fcntl.flock` sobre:

```text
/data/locks/corpus.lock
```

- El API mantiene un bloqueo compartido durante todo su lifespan.
- `publish` exige un bloqueo exclusivo no bloqueante.
- Si el API está vivo, `publish` termina con código distinto de cero antes
  de abrir la base o el índice.
- Las preparaciones se serializan mediante:

```text
/data/locks/madoz-prepare.lock
```

- `prefetch-models`, `ocr-smoke`, `prepare-sample` y `prepare` toman ese lock
  en modo exclusivo no bloqueante antes de tocar model cache, raw o staging;
  una colisión termina con el código CLI 4. Los pipelines de prepare/muestra
  son dueños del lock; el CLI no intenta adquirirlo una segunda vez al
  delegarles.
- Los descriptores permanecen abiertos durante toda la operación.
- No se usan archivos marcador sin `flock`.

### 4.5 Motor OCR

Se usará:

- `paddleocr==3.7.0`;
- `paddlex==3.7.2`;
- `PyYAML==6.0.2`;
- `numpy==2.3.5` dentro de este producto aislado;
- pipeline PP-OCRv6;
- detección `PP-OCRv6_medium_det`;
- reconocimiento `PP-OCRv6_medium_rec`;
- `engine="transformers"`;
- `transformers==5.16.1` y el PyTorch CPU ya presentes;
- CPU como gate obligatorio inicial;
- clasificación de orientación de documento desactivada;
- orientación de línea activada para corregir 0/180 dentro de cada crop OCR;
- corrección geométrica desactivada;
- sin PaddlePaddle: no se instala un segundo framework de inferencia.

El clasificador oficial de orientación de línea solo distingue 0°/180°; no se
le atribuye soporte 90°/270°. La orientación 0/90 del texto en la hoja se
deduce de la geometría de `rec_polys`. Las regiones de tabla a 90° declaradas
en el manifiesto se OCRizan además en un segundo pase rotado y sus cajas se
transforman de vuelta al sistema de coordenadas de la hoja.

Los pins actuales `numpy==2.5.2` y cualquier PyYAML distinto de `6.0.2` son
incompatibles con PaddleX 3.7.x. Este plan autoriza únicamente dentro de
`historical-corpus-pod` el descenso de NumPy a `2.3.5`; la suite completa de
69 pruebas, TurboVec y los dos backends deben pasar antes de continuar.

Los pesos no quedan identificados solo por el nombre del modelo. Una operación
explícita de prefetch crea `model-lock.json` con el SHA-256 de cada archivo de
modelo. `ocr-smoke` y `prepare` aceptan únicamente rutas locales verificadas
contra ese lock y no disparan descargas implícitas. Su proyección reproducible
de versiones, nombres y archivos participa en el processing fingerprint; la
ubicación local `cacheRelativePath` no.

En `ModelLock`, nombres de modelo y `cacheRelativePath` son únicos; cada path
es POSIX relativo, no vacío, sin `..`, backslash ni segmento `.`. Las listas de
modelos/archivos se ordenan respectivamente por nombre/path y los paths de
archivo no se repiten. Tanto el lock como cada peso se resuelven bajo
`modelCacheRoot`, deben ser archivos regulares no symlink y se verifican por
tamaño más SHA-256 streaming. Falta, extra o cambio de cualquier archivo del
directorio bloqueado falla antes de construir el modelo.

La documentación oficial de PP-OCRv6 admite el motor Transformers y exige
`transformers>=5.10.0`; el pin actual cumple esa condición:

- [PP-OCRv6](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/algorithm/PP-OCRv6/PP-OCRv6.en.md)
- [Motores de inferencia](https://github.com/PaddlePaddle/PaddleOCR/blob/main/docs/version3.x/inference_deployment/local_inference/inference_engine.en.md)

La GPU queda como optimización posterior al gate CPU. No es criterio de
aceptación para el primer POC.

### 4.6 Texto

- `originalText` siempre conserva la salida PP-OCRv6 en orden publicado, con
  saltos de línea; `textSource=ppocrv6`.
- La capa embebida se lee únicamente para construir señales del inventario y,
  opcionalmente, como baseline diagnóstico en evaluación. No crea
  `SourceLineInput`, chunks ni bundle.
- No se implementa `native`, `auto`, mezcla de fuentes ni una confianza
  sintética en la versión 1.
- `correctedText` queda en `null` durante este POC.
- No se usa un LLM para corregir OCR.
- No se corrigen ortografía, nombres ni cifras de forma silenciosa.
- La normalización para comparar o detectar encabezados no reemplaza el texto
  original almacenado.

### 4.7 Identidad e idempotencia

- El SHA-256 del PDF identifica el binario canónico.
- Cada transformación incluye una versión explícita.
- Repetir `prepare` con los mismos bits y configuración produce los mismos
  IDs y reutiliza páginas preparadas válidas.
- Repetir `publish` con el mismo documento y un TurboVec completo no escribe,
  no aumenta `generation` y devuelve los mismos `chunkIds`.
- SQLite —`chunks.vector_id` más `embeddings.vector`— es la única autoridad
  para reconstruir el índice denso. TurboVec es una proyección reemplazable.
- Un journal duradero enlaza cada cambio SQLite con su reemplazo TurboVec. Un
  crash antes, durante o después del reemplazo deja el journal pendiente; una
  reparación offline lo rehace desde toda la autoridad SQLite y finaliza una
  sola vez con el `targetGeneration` ya reservado.
- Si TurboVec pierde entradas pero SQLite conserva completa esa autoridad, la
  reparación offline conserva `indexVersion` y aumenta `generation` una vez.
  Si falta, sobra, está truncado o no valida cualquier embedding/`vector_id`
  SQLite, falla antes de tocar TurboVec.
- Un replay sano comprueba hashes de autoridad/artefacto y el conjunto global:
  todos los IDs esperados están presentes y `count()` coincide. Por unicidad,
  ambas condiciones prueban que tampoco existen IDs extra. No vuelve a
  sincronizar el índice.
- Mismo `documentId` con PDF, configuración, páginas o contenido distintos
  produce conflicto; nunca reemplaza en silencio.
- El algoritmo legado de `chunkId` no cambia.
- `_CHUNKING_POLICY_VERSION` permanece en `"1"`.
- `_SOURCE_REGISTRY_VERSION` sube a `"2"`.

### 4.8 Compatibilidad

- Todos los payloads HTTP válidos antes del cambio siguen siendo válidos.
- El límite HTTP permanece en 2 MiB.
- El máximo público de 256 chunks no se amplía.
- El bundle interno puede contener hasta 4096 chunks.
- Los campos nuevos del API son opcionales o de salida.
- El hash de una petición HTTP legada debe conservar exactamente su valor
  previo aunque se añadan campos opcionales a los modelos.
- Las bases SQLite existentes migran de forma aditiva e idempotente.
- No se re-embebe. El API arranca en modo `verify`: nunca repara ni reescribe
  TurboVec y falla cerrado si hay journal o divergencia. Solo `publish`, con el
  API parado y lock exclusivo, usa modo `repair` y puede reemplazar TurboVec
  atómicamente desde embeddings y `vector_id` SQLite validados.

## 5. Contratos exactos

### 5.1 Manifiesto YAML

El manifiesto usa nombres camelCase y `extra="forbid"`. Esquema inicial:

```yaml
schemaVersion: 1

document:
  documentId: madoz-1848-t11-malaga-partial-google-books
  workId: madoz-diccionario-1845-1850
  title: Diccionario geográfico-estadístico-histórico de España y sus posesiones de ultramar
  author: Pascual Madoz
  edition: Tomo XI
  volumeNumber: 11
  publicationYear: 1848
  language: es
  countryCode: ES
  sourceClass: primary_historical
  historicalPeriod: "1848"
  temporalScope: España y posesiones de ultramar, siglo XIX

source:
  pdfPath: Diccionario_geográfico_estadístico_his.pdf
  sourceUrl: https://books.google.es/books?id=eboNAAAAIAAJ&hl=es
  isExactRecord: true
  repositoryName: Google Books / Stanford University Libraries
  expectedSha256: d20c9a01f68bd091490a008433e4f1d709dca370181a20b56ca99bbb31bc01ff
  attribution: Digitalizado por Google a partir del ejemplar de Stanford University; conservar la marca Google
  rights:
    status: pending_intended_use_review
    uri: https://books.google.es/books?id=eboNAAAAIAAJ&hl=es
    verifiedAt: "2026-09-02T00:00:00+02:00"
    isExplicitlyReusable: false

selection:
  candidatePdfPageRanges:
    - start: 39
      end: 109
  pageInventoryPath: madoz-t11.pages.private.jsonl
  expectedPageInventorySha256: null
  inventoryReviewStatus: pending
  inventoryVerifiedAt: null
  canonicalization:
    defaultStatus: include
    defaultOrder: source_order
    duplicateDecisions: []
    pageOverrides:
      - {pdfPage: 91, side: full, normalizedPrintedLabel: "86", reason: Lectura visual; la capa embebida confunde 86 con 98}
      - {pdfPage: 107, side: full, normalizedPrintedLabel: "106", reason: Lectura visual; la capa embebida confunde 106 con 406}
  splitSpreads: false
  gutterRatio: 0.5
  innerGutterTrimRatio: 0.005
  leafOverrides:
    - {pdfPage: 40, side: full, contentClass: table, rotationDegrees: 0, tableRegions: [{box: [0.02, 0.06, 0.98, 0.94]}]}
    - {pdfPage: 41, side: full, contentClass: mixed_orientation, rotationDegrees: 0, tableRegions: [{box: [0.08, 0.05, 0.96, 0.72]}]}
    - {pdfPage: 42, side: full, contentClass: mixed_orientation, rotationDegrees: 0, tableRegions: [{box: [0.04, 0.38, 0.95, 0.61]}, {box: [0.04, 0.62, 0.94, 0.94], ocrRotationDegrees: 90}]}
    - {pdfPage: 52, side: full, contentClass: mixed_orientation, rotationDegrees: 90, tableRegions: [{box: [0.10, 0.34, 0.93, 0.88]}]}
    - {pdfPage: 60, side: full, contentClass: normal, rotationDegrees: 0, tableRegions: [{box: [0.02, 0.11, 0.98, 0.55]}]}
    - {pdfPage: 70, side: full, contentClass: mixed_orientation, rotationDegrees: 0, tableRegions: [{box: [0.04, 0.68, 0.42, 0.93]}, {box: [0.45, 0.05, 0.94, 0.94], ocrRotationDegrees: 90}]}
    - {pdfPage: 89, side: full, contentClass: table, rotationDegrees: 90, tableRegions: []}
    - {pdfPage: 90, side: full, contentClass: table, rotationDegrees: 90, tableRegions: []}
    - {pdfPage: 91, side: full, contentClass: table, rotationDegrees: 90, tableRegions: []}
    - {pdfPage: 92, side: full, contentClass: mixed_orientation, rotationDegrees: 0, tableRegions: [{box: [0.04, 0.05, 0.44, 0.94], ocrRotationDegrees: 90}]}
    - {pdfPage: 102, side: full, contentClass: table, rotationDegrees: 0, tableRegions: []}
    - {pdfPage: 103, side: full, contentClass: table, rotationDegrees: 0, tableRegions: []}
    - {pdfPage: 104, side: full, contentClass: table, rotationDegrees: 0, tableRegions: []}
    - {pdfPage: 105, side: full, contentClass: table, rotationDegrees: 0, tableRegions: []}
    - {pdfPage: 106, side: full, contentClass: table, rotationDegrees: 0, tableRegions: []}
    - {pdfPage: 107, side: full, contentClass: table, rotationDegrees: 0, tableRegions: []}
    - {pdfPage: 108, side: full, contentClass: mixed_orientation, rotationDegrees: 0, tableRegions: [{box: [0.04, 0.05, 0.96, 0.70]}]}

coverage:
  status: partial_source
  statement: El binario conserva 71 hojas de Málaga, pero carece de seis páginas impresas conocidas; no representa los artículos completos.
  observedPrintedRanges:
    - {start: "32", end: "61"}
    - {start: "64", end: "97"}
    - {start: "100", end: "101"}
    - {start: "104", end: "108"}
  missingPrintedPages: ["62", "63", "98", "99", "102", "103"]
  acceptedForProduct: false
  acceptedAt: null

processing:
  textMode: ocr
  renderDpi: 300
  rasterizationPolicy: pymupdf-page-render-v1
  ocrEngine: transformers
  ocrDetectionModel: PP-OCRv6_medium_det
  ocrRecognitionModel: PP-OCRv6_medium_rec
  ocrLanguage: es
  device: cpu
  modelLockFile: ppocrv6-medium-transformers/model-lock.json
  documentOrientationClassification: false
  documentUnwarping: false
  textLineOrientation: true
  lowConfidenceThreshold: 0.60
  maxChunkChars: 1500
  overlapLines: 2
  layoutPolicy: madoz-two-column-v1
  entryPolicy: madoz-entry-v1
```

Reglas:

- `schemaVersion` solo acepta `1`.
- `document.historicalPeriod` tiene 1..64 caracteres para conservar el límite
  público de `ChunkInput`; el manifest rechaza valores mayores antes de
  preparar.
- El manifiesto completo admite como máximo 64 KiB, todos los modelos usan
  `extra="forbid"` recursivamente y ningún string acepta NUL ni caracteres de
  control salvo tab/newline dentro de texto descriptivo. IDs/códigos admiten
  1..128 caracteres, paths relativos 1..512, URLs HTTP(S) 1..2048, metadatos
  descriptivos 1..512 y `coverage.statement` 1..2048. Se aceptan como máximo
  128 rangos candidatos, 2000 overrides/hojas, 32 regiones de tabla por hoja y
  2000 rangos o páginas impresas declaradas.
- `pdfPath` debe ser relativo, no contener `..` ni ser vacío. La validación
  estructural no exige que el archivo esté presente. La validación de fuente,
  obligatoria antes de `ocr-smoke`/`prepare` y opcional mediante
  `validate-manifest --check-source`, lo resuelve bajo un `importsRoot`
  inyectable cuyo valor de producción es `/imports`; el resultado debe existir,
  ser archivo regular y no escapar mediante enlaces simbólicos.
- `expectedSha256` acepta exactamente 64 caracteres hexadecimales
  minúsculos, sin prefijo.
- El hash se comprueba antes de copiar o renderizar.
- `candidatePdfPageRanges` es inclusivo, ordenado, no solapado y queda dentro
  de `1..N`; delimita el universo que debe inventariarse, pero no autoriza por
  sí solo ninguna página para preparación o publicación.
- `pageInventoryPath` es relativo y se resuelve con las mismas reglas de
  containment/symlink que `pdfPath`; el JSONL admite como máximo 2 MiB y 2000
  registros.
- `expectedPageInventorySha256=null` y `inventoryReviewStatus=pending` permiten
  validación estructural y `ocr-smoke`, pero bloquean `prepare` y `publish`.
  Preparar exige hash desnudo válido, archivo coincidente,
  `inventoryReviewStatus=verified` e `inventoryVerifiedAt` ISO-8601 con zona.
- `gutterRatio` queda entre 0.45 y 0.55 y, junto con el trim interior, solo se
  usa cuando `splitSpreads=true`.
- `innerGutterTrimRatio` queda entre 0 y 0.02 y se aplica solo al borde
  interior de cada hoja.
- `leafOverrides` identifica pares únicos `(pdfPage, side)`, acepta
  `contentClass=normal|table|mixed_orientation`, `rotationDegrees` en
  `0|90|180|270` y regiones de tabla normalizadas no solapadas. Cada región
  contiene `box` y puede añadir `ocrRotationDegrees=90|270` para un segundo
  pase; si se omite, la región solo clasifica líneas y conserva la extracción
  PP-OCRv6 principal.
- Las cajas normalizadas se expresan sobre el crop final, con origen arriba a
  la izquierda, `+x` hacia la derecha y `+y` hacia abajo. Tanto
  `rotationDegrees` como `ocrRotationDegrees` son giros horarios positivos.
- Primero se materializa la rotación intrínseca del PDF, después se recorta la
  hoja y por último se aplica el `rotationDegrees` manual. La orientación de
  línea nunca gira la hoja completa. Las pruebas incluyen ida/vuelta exacta
  de polígonos para 90° y 270°.
- `renderDpi` queda entre 150 y 400.
- En v1, `rasterizationPolicy`, `ocrEngine`, `ocrDetectionModel`,
  `ocrRecognitionModel`, `ocrLanguage`, `device`, `layoutPolicy` y
  `entryPolicy` son respectivamente los literales
  `pymupdf-page-render-v1`, `transformers`, `PP-OCRv6_medium_det`,
  `PP-OCRv6_medium_rec`, `es`, `cpu`, `madoz-two-column-v1` y
  `madoz-entry-v1`.
- `documentOrientationClassification`, `documentUnwarping` y
  `textLineOrientation` son booleanos estrictos y, en v1, deben ser
  respectivamente `false`, `false` y `true`; strings/números equivalentes se
  rechazan.
- `lowConfidenceThreshold` es float finito en `[0,1]`;
  `maxChunkChars` es int estricto en `256..65536`; `overlapLines` es int
  estricto en `0..32`. Los booleanos y enteros rechazan coerciones YAML como
  strings y floats integrales.
- El raster dominante del tomo XI es JBIG2, 1-bit DeviceGray, declarado a 600
  DPI; 200 y 300 DPI son reducciones. El piloto/tomo XI v1 queda congelado en
  300 DPI para conservar cifras pequeñas de tablas. Probar 200 es una
  optimización posterior que exige otro fingerprint y repetir R1–R3; no forma
  parte de este plan. El tomo XVI se calibra aparte porque su raster ronda 150
  DPI y 300 sería una ampliación 2x.
- `modelLockFile` es relativo a un `modelCacheRoot` inyectable cuyo valor de
  producción es `/model-cache/paddlex`; debe validar un lock completo antes de
  OCR.
- `textMode` acepta únicamente `ocr` en la versión 1 publicable. La capa OCR
  embebida de Google puede usarse para diagnóstico, pero nunca alimenta un
  bundle ni un gold porque no aporta confianza compatible con el contrato
  legado y contiene errores Unicode que los gates simples no detectan.
- `coverage.status` acepta `unknown|partial_source|complete_source`.
  `partial_source` exige `statement` y `missingPrintedPages` no vacíos;
  `complete_source` exige lista vacía.
- `publish` exige además `coverage.acceptedForProduct=true` y `acceptedAt`
  ISO-8601 con zona. Una aceptación de cobertura parcial no oculta los huecos:
  status, statement y lista se conservan en documento y respuestas.
- `coverage.status=unknown` nunca puede tener `acceptedForProduct=true`;
  `acceptedForProduct=false` exige `acceptedAt=null`. Los rangos impresos están
  ordenados, no se solapan y sus extremos son enteros decimales positivos; los
  huecos son únicos, ordenados y no pueden caer dentro de un rango observado.
- `prepare` permite derechos pendientes.
- `sourceUrl` puede apuntar al registro de la obra durante `prepare`, pero
  `publish` exige `isExactRecord=true`.
- `rights.status` es un enum cerrado:
  `pending_intended_use_review|reviewed_reusable|reviewed_not_reusable`.
  `rights.verifiedAt` siempre es ISO-8601 con zona y registra cuándo se revisó
  la fuente/condición. `reviewed_reusable` exige
  `isExplicitlyReusable=true`; los otros dos estados exigen booleano `false`.
  Este enum pertenece al manifiesto/pipeline y no estrecha los strings
  históricamente válidos del `RightsMetadata` HTTP.
- `publish` exige `rights.status=reviewed_reusable`, URL HTTP(S) en
  `rights.uri` e `isExplicitlyReusable=true`.
- El ejemplo versionado del tomo XI usa el registro exacto, pero debe seguir
  fallando para publicación hasta que un operador cree una copia privada y
  confirme el gate de uso/derechos.

#### 5.1.1 Inventario canónico JSONL

`build-inventory --manifest PATH [--output-root PATH]` genera de forma determinista
una fila por cada hoja candidata. El archivo no se edita a mano: las
correcciones viven en `selection.canonicalization.pageOverrides` y al volver a
generarlo producen el mismo resultado. Modelo de fila:

```text
PageInventoryRecord
  schemaVersion: literal 1
  pdfPage: int, 1..1000
  side: left|right|full
  mediaBox: exactamente cuatro floats finitos, x1>x0 e y1>y0
  pdfRotationDegrees: 0|90|180|270
  rasterWidthPx: int 1..100000|null
  rasterHeightPx: int 1..100000|null
  rasterBitsPerComponent: int 1..32|null
  rasterFilter: str 1..128|null
  declaredDpiX: float finito >0 y <=2400|null
  declaredDpiY: float finito >0 y <=2400|null
  printedLabelCandidates: lista 0..32 de {text: str 1..16, box: NormalizedBox}
  normalizedPrintedLabel: str con regex ^[1-9][0-9]{0,3}$|null
  printedLabelBox: NormalizedBox|null
  printedLabelSource: embedded_ocr_heuristic|manifest_override|missing
  sourceImageSha256: sha256:<64 hex>|null
  visualDhash64: <16 hex>
  embeddedTextSha256: sha256:<64 hex>|null
  textSimhash64: <16 hex>|null
  duplicateCandidates: lista única/ordenada 0..1999 de
    {pdfPage:int 1..1000, side:left|right|full,
     reasons:lista única/ordenada no vacía,
     decision:pending|confirmed_duplicate|false_positive,
     canonical:{pdfPage,side}|null, decisionReason:str 1..512|null}
  anomalyFlags: lista única/ordenada de los enums congelados abajo
  canonicalStatus: include|exclude_duplicate|exclude_nonbody|pending_review
  duplicateOf: {pdfPage,side}|null
  canonicalSequenceIndex: int 1..2000|null
  continuityBreakBefore: bool
  decisionReason: str 1..512|null
```

Algoritmos congelados:

- cada página usa como raster dominante la imagen con mayor área en píxeles;
  empate por menor xref. Sus dimensiones, bits, filtro, hash del stream
  comprimido y DPI calculado desde su caja visible se registran; si no hay
  imagen, los campos correspondientes son `null`;
- `visualDhash64` renderiza el crop a gris 9×8 después de las rotaciones
  declaradas y compara cada píxel con el situado a su derecha, recorriendo por
  filas; bit 1 significa `left > right`;
- para `embeddedTextSha256` y `textSimhash64`, la capa embebida se normaliza
  con NFKC, lowercase y whitespace simple; vacío da ambos `null`. El primer
  campo hashea los bytes UTF-8 normalizados. Para el segundo se forman shingles
  de tres tokens `\w+`, se toman por shingle los primeros 64 bits de SHA-256 y
  se vota `+1/-1` por bit; empate produce 0 y menos de tres tokens da `null`;
- la etiqueta impresa se busca entre words embebidas cuyo centro cae en el 12 %
  superior o 8 % inferior y cuyo texto casa `^[0-9]{1,4}\.?$`; cero candidatos
  marca `label_missing`, más de uno `label_ambiguous`. Un override sustituye
  solo la etiqueta normalizada, conserva candidatos/cajas como evidencia y
  queda identificado como `manifest_override`;
- con un único candidato se elimina el punto final y se normaliza mediante
  `str(int(valor))`; valores fuera de 1..9999 son inválidos. Sin override, cero
  o varios candidatos dejan etiqueta/caja normalizadas en `null`;
- cada `pageOverride` identifica un `(pdfPage,side)` único y puede fijar
  `normalizedPrintedLabel` y/o `canonicalStatus=include|exclude_nonbody`, con
  al menos uno de ambos no nulo; no acepta `exclude_duplicate` ni
  `duplicateOf`, cuya única autoridad es `duplicateDecisions`. Todo override
  exige `reason` humano no vacío;
- dos hojas son candidatas a duplicado si comparten etiqueta normalizada y
  además tienen `embeddedTextSha256` no nulo igual, distancia Hamming de
  SimHash `<=3` o distancia Hamming de dHash `<=5`; sin etiqueta común se
  exigen simultáneamente SimHash no nulo `<=3` y dHash `<=5`. Esto solo crea
  una alerta: nunca excluye automáticamente;
- `canonicalization.duplicateDecisions` contiene como máximo 2000 pares no
  repetidos, normalizados con el menor `(pdfPage,sideOrder)` primero. Cada par
  detectado debe resolverse como `confirmed_duplicate|false_positive` con
  `reason` humano no vacío. Un falso positivo exige `canonical=null`; un
  confirmado exige canonical no nulo, cuya pertenencia se valida después
  contra su componente completa. Pares no detectados son inválidos y todo
  candidato sin decisión queda `pending`;
- los pares confirmados forman componentes conexas. Todas las decisiones de
  una componente deben señalar el mismo canonical, que pertenece a esa
  componente y queda `include`; no necesita ser miembro de cada arista
  individual. Los demás miembros se derivan como `exclude_duplicate` y
  `duplicateOf=canonical`. Esto es una decisión humana declarada, no una
  exclusión heurística. Un `pageOverride` no puede contradecirla;
- `duplicateCandidates.reasons` usa solo
  `same_label|same_embedded_text_sha|simhash_le_3|dhash_le_5`; `anomalyFlags` usa solo
  `label_missing|label_ambiguous|gap|declared_gap|candidate_range_break|repeat|decrease|near_duplicate`,
  ambas listas se ordenan lexicográficamente y los candidatos por PDF/side;
- `near_duplicate` se mantiene solo mientras al menos un par candidato de la
  hoja siga `pending`; las decisiones confirmada/falso-positivo permanecen en
  `duplicateCandidates` como evidencia, pero eliminan ese flag;
- la resolución usa pases no circulares: (1) expandir todas las hojas por
  `(pdfPage,sideOrder)`; (2) extraer señales y aplicar overrides de etiqueta;
  (3) calcular candidatos; (4) aplicar decisiones de duplicado/componentes y
  overrides `exclude_nonbody`, rechazando contradicciones; (5) formar la
  secuencia elegible sin esos records; (6) calcular una sola vez sobre ella
  `repeat|decrease|gap|declared_gap|candidate_range_break`; (7) aplicar
  overrides `include` o `defaultStatus`, dejando pendientes las anomalías no
  resueltas; y (8), solo con cero pendientes, asignar índices y comprobar la
  cobertura exacta sobre esa misma secuencia elegible;
- un salto provisional crea `gap`; si el conjunto exacto de enteros saltados
  coincide con elementos consecutivos de `coverage.missingPrintedPages`, se
  reemplaza por `declared_gap` y se fija `continuityBreakBefore=true` en la
  primera hoja posterior. Un salto parcial/superconjunto queda `gap`;
- aunque no haya etiqueta impresa, el primer `include` de cada rango candidato
  no contiguo posterior al primero lleva `candidate_range_break` y
  `continuityBreakBefore=true`. Es un break declarado por selección y no deja
  la fila pendiente;
- un override explícito de `canonicalStatus`, siempre con `reason`, decide esa
  hoja salvo que viole las invariantes de exclusión/duplicado. Sin override,
  `defaultStatus=include` aplica solo si no hay anomalías no declaradas;
  `repeat|decrease|near_duplicate|label_missing|label_ambiguous|gap` deja
  `pending_review`. `declared_gap` está resuelto y no fuerza pending;
- todo registro `exclude_duplicate` exige `duplicateOf` hacia una hoja
  `include`; `exclude_nonbody` exige motivo y ambos carecen de índice canónico;
- después de resolver status, las hojas `include` reciben índices únicos y
  contiguos `1..M`; los demás records tienen índice `null`. Cada hoja del
  universo candidato aparece exactamente una vez y no se admite ninguna extra;
- `defaultOrder` solo acepta `source_order` en v1; los índices se asignan por
  `(pdfPage, sideOrder)` después de exclusiones, con `sideOrder` igual a
  `full=0,left=0,right=1`. Reordenar un tomo corrupto exige una versión futura
  del contrato y por eso el tomo XI completo no se publica con este plan;
- `inventoryReviewStatus=verified` exige cero `pending_review`, cero pares de
  duplicado con decisión pending, exactamente una hoja incluida por componente
  confirmada, cero anomalías no resueltas y concordancia
  exacta entre etiquetas observadas, `observedPrintedRanges` y
  `missingPrintedPages`. Para `coverage.status=unknown`, rangos y huecos deben
  estar vacíos: no se inventa concordancia impresa y cada `label_missing`
  incluido/excluido debe estar resuelto por un `pageOverride` humano explícito;
- cada fila JSONL es exactamente
  `json.dumps(record.model_dump(mode="json", by_alias=True, exclude_none=False),
  ensure_ascii=False, sort_keys=True, separators=(",", ":")) + "\n"`; hashes
  hexadecimales se emiten en minúsculas. El SHA se calcula sobre la concatenación
  UTF-8 de esas filas, incluido el LF final;
- el hash, todos los registros y el contenido canónico de `canonicalization`
  participan en el processing fingerprint y quedan copiados en `source.json` y
  en el bundle.

Para el piloto, 71 candidatos PDF 39–109 deben producir 71 `include`, índices
1–71 y los tramos impresos `32–61`, `64–97`, `100–101`, `104–108`. Los seis
huecos declarados siguen siendo visibles y ninguna consulta gold puede depender
de su contenido ausente.

### 5.2 Páginas lógicas

Una página lógica representa una hoja publicada por el pipeline:

- con `splitSpreads=false`, cada candidata genera solo `side=full`;
- con `splitSpreads=true`, cada candidata genera exactamente `side=left` y
  `side=right`; no existe una excepción full-frame en la versión 1;
- solo un registro de inventario con `canonicalStatus=include` se convierte en
  página lógica;
- `logicalPageNumber = canonicalSequenceIndex`, siempre contiguo `1..M`;
- `sourcePdfPageNumber` y `leafSide` conservan la coordenada física incluso si
  el inventario reordena o excluye rescaneos.

Esto no intenta adivinar la paginación impresa. La paginación impresa se
almacena aparte como `printedPageLabel`, nullable.

La geometría:

- usa `cropBox=[0,0,1,1]` cuando no hay split;
- con split aplica `gutterRatio` sobre el ancho del pliego;
- conserva como `cropBox` cuatro coordenadas normalizadas;
- elimina solo el margen interior `innerGutterTrimRatio` por lado;
- no detecta el gutter con heurísticas no reproducibles en la versión 1;
- calcula el SHA-256 sobre los bytes RGB del crop ya orientado;
- marca páginas casi vacías, pero no las borra.

### 5.3 Modelos internos

`ingest_models.py` definirá, como mínimo:

```text
PageInventoryRecord
  contrato exacto de 5.1.1

PrintedRange (definido en models.py e importado aquí; no duplicar)
  start: str, regex ^[1-9][0-9]{0,3}$
  end: str, regex ^[1-9][0-9]{0,3}$, int(start)<=int(end)

CoverageMetadata
  status: unknown|partial_source|complete_source
  statement: str|null, 1..2048 si existe
  observedPrintedRanges: lista ordenada, no solapada, 0..2000 PrintedRange
  missingPrintedPages: lista única/orden numérico, 0..2000 strings con la
    misma regex; ninguna cae dentro de un rango observado
  acceptedForProduct: bool
  acceptedAt: datetime con zona|null

PublicationGateSnapshot
  sourceIsExactRecord: bool
  coverage: CoverageMetadata

NormalizedBox (definido en models.py e importado aquí; no duplicar)
  x0, y0, x1, y1: float, 0..1, x1>x0, y1>y0

ExtractedLineCandidate
  originalText: str, 1..4096
  confidence: float, 0..1
  polygon: exactamente cuatro puntos [x,y] finitos y no negativos en píxeles
    del crop enviado al OCR
  correction180: 0|180

SourceLineInput
  lineId: sha256:<64 hex>
  logicalPageNumber: int, 1..2000
  lineOrder: int, 0..499
  originalText: str, 1..4096
  confidence: float, 0..1
  box: NormalizedBox
  orientationDegrees: 0|90|180|270|null
  role: body|header|footer|table|unknown

SourcePageInput
  pageId: sha256:<64 hex>
  documentId: str, 1..128
  logicalPageNumber: int, 1..2000
  sourcePdfPageNumber: int, 1..1000
  leafSide: left|right|full
  continuityBreakBefore: bool
  cropBox: NormalizedBox
  printedPageLabel: str con regex ^[1-9][0-9]{0,3}$|null
  widthPx: int, 1..100000
  heightPx: int, 1..100000
  renderDpi: int, 150..400
  rasterizationPolicy: str, 1..128
  rotationDegrees: 0|90|180|270
  imageSha256: sha256:<64 hex>
  contentClass: normal|table|mixed_orientation
  foregroundRatio: float, 0..1
  textSource: ppocrv6
  ocrEngine: transformers
  ocrEngineVersion: str, 1..64
  ocrDetectionModel: str, 1..128
  ocrRecognitionModel: str, 1..128
  meanConfidence: float, 0..1
  lowConfidenceRatio: float, 0..1
  qualityScore: float, 0..1
  qualityFlags: lista única/ordenada, 0..8 de blank|low_confidence|
    mixed_orientation|table_heavy|rotation_applied|oversize_body_line
  originalText: str, 0..2048499
  lines: lista ordenada, 0..500 SourceLineInput

PreparedChunkInput
  todos los campos de ChunkInput
  chunkId: sha256:<64 hex> obligatorio
  entryTitle: str obligatorio de 2..100 caracteres
  lineIds: lista obligatoria, única y ordenada de 1..512 IDs de SourceLineInput

StagedPage
  schemaVersion: literal 1
  canonicalPdfSha256: sha256:<64 hex>
  pageInventorySha256: sha256:<64 hex>
  processingFingerprint: sha256:<64 hex>
  pageArtifactHash: sha256:<64 hex>
  page: SourcePageInput

ModelLock
  schemaVersion: literal 1
  paddleOcrVersion: str, 1..64
  paddleXVersion: str, 1..64
  transformersVersion: str, 1..64
  engine: transformers
  models: lista única/ordenada por name, 1..8 ModelLockEntry

ModelLockEntry
  name: str único, 1..128
  cacheRelativePath: path POSIX relativo único, 1..512
  files: lista única/ordenada por relativePath, 1..4096 ModelLockFile

ModelLockFile
  relativePath: path POSIX relativo, 1..512
  sizeBytes: int, 1..2^63-1
  sha256: sha256:<64 hex>

ModelLockFingerprint
  proyección inmutable de ModelLock; conserva schemaVersion,
    paddleOcrVersion, paddleXVersion, transformersVersion y engine
  models: lista única/ordenada por name de ModelLockFingerprintEntry

ModelLockFingerprintEntry
  name: str único, 1..128
  files: lista única/ordenada por relativePath de ModelLockFile

`ModelLockFingerprint` identifica por completo versiones, nombres y bytes de
los pesos, pero excluye deliberadamente `cacheRelativePath`: mover el mismo
modelo verificado dentro del cache local no cambia el procesamiento.

InventoryPageRef
  pdfPage: int, 1..1000
  side: left|right|full

DuplicateDecisionSnapshot
  first: InventoryPageRef
  second: InventoryPageRef; first < second por (pdfPage,sideOrder)
  decision: confirmed_duplicate|false_positive
  canonical: InventoryPageRef|null
  reason: str, 1..512

PageOverrideSnapshot
  pdfPage: int, 1..1000
  side: left|right|full
  normalizedPrintedLabel: str con regex ^[1-9][0-9]{0,3}$|null
  canonicalStatus: include|exclude_nonbody|null
  reason: str, 1..512
  al menos uno de normalizedPrintedLabel/canonicalStatus debe ser no null

CanonicalizationSnapshot
  defaultStatus: literal include
  defaultOrder: literal source_order
  duplicateDecisions: lista única/ordenada, 0..2000 DuplicateDecisionSnapshot
  pageOverrides: lista única/ordenada por (pdfPage,sideOrder),
    0..2000 PageOverrideSnapshot

FingerprintPayload
  modelo tipado, inmutable, camelCase y extra="forbid" con el contrato exacto
    de 5.6; todos sus objetos anidados son también modelos estrictos

SoftwareVersions
  pymupdf, paddleocr, paddlex, transformers, torch, numpy:
    seis strings obligatorios de 1..64, extra="forbid" y frozen

PreparedDocument
  schemaVersion: literal 1
  preparedDocumentHash: sha256:<64 hex>
  metadata: DocumentMetadata
  publicationGate: PublicationGateSnapshot
  chunks: lista en orden canónico de 5.11, 1..4096 PreparedChunkInput
  pages: lista en orden lógico, 1..2000 SourcePageInput
  pageArtifactHashes: lista ordenada, 1..2000 hashes
  pageInventorySha256: sha256:<64 hex>
  inventoryVerifiedAt: datetime con zona
  inventoryRecords: lista en orden canónico, 1..2000 PageInventoryRecord
  canonicalization: CanonicalizationSnapshot
  canonicalPdfRelativePath: path POSIX relativo, 1..512
  processing: FingerprintPayload
  processingFingerprint: sha256:<64 hex>
  preparedAt: datetime con zona

OcrEvaluationPageRef
  pdfPage: int, 1..1000
  side: left|right|full
  logicalPageNumber: int, 1..2000

OcrEvaluationSample
  schemaVersion: literal 1
  sampleHash: sha256:<64 hex>
  publishable: literal false
  metadata: DocumentMetadata
  canonicalPdfSha256: sha256:<64 hex>
  pageInventorySha256: sha256:<64 hex>
  inventoryVerifiedAt: datetime con zona
  processing: FingerprintPayload
  processingFingerprint: sha256:<64 hex>
  canonicalization: CanonicalizationSnapshot
  selectedPages: lista única y ordenada, 1..64 OcrEvaluationPageRef
  selectedInventoryRecords: lista uno-a-uno, 1..64 PageInventoryRecord include
  pages: lista uno-a-uno con selectedPages, 1..64 SourcePageInput
  pageArtifactHashes: lista uno-a-uno, 1..64 hashes
  chunks: lista en orden canónico de 5.11, 0..4096 PreparedChunkInput
  createdAt: datetime con zona

PreparationReport
  schemaVersion: literal 1
  documentId: str, 1..128
  pdfSha256: sha256:<64 hex>
  pageInventorySha256: sha256:<64 hex>
  processingFingerprint: sha256:<64 hex>
  preparedDocumentHash: sha256:<64 hex>
  publicationGate: PublicationGateSnapshot
  prepareAllowed: bool
  publishAllowed: bool
  blockingReasons: lista única/ordenada de strings 1..256
  candidatePdfPages: int >=0
  logicalPages: int >=0
  inventoryIncluded: int >=0
  inventoryExcludedDuplicates: int >=0
  inventoryExcludedNonbody: int >=0
  blankPages: lista única/ordenada de logicalPageNumber
  ocrPages: int >=0
  lowQualityPages: lista única/ordenada de logicalPageNumber
  unassignedBodyLines: int >=0
  chunks: int >=0
  stageRelativePath: path POSIX relativo, 1..512
  preparedAt: datetime con zona
```

Límites:

- máximo 4096 chunks internos;
- máximo 1000 pliegos PDF;
- máximo 2000 páginas lógicas;
- máximo 2000 registros de inventario dentro del bundle;
- máximo 500 líneas por página;
- máximo 4096 caracteres por línea;
- máximo 8 MiB por `StagedPage`, `source.json` o reporte, 32 MiB por
  `OcrEvaluationSample` y 128 MiB para `prepared-document.json`; el tamaño se
  comprueba con `stat` antes de leer;
- cajas, polígonos, confianza y calidad siempre finitos;
- `ExtractedLineCandidate.originalText` y `SourceLineInput.originalText`
  respetan el máximo de 4096 caracteres; tamaños de archivo del `ModelLock`
  son enteros en `1..2^63-1`;
- todo datetime se rechaza si no incluye offset UTC explícito; al serializar se
  conserva ISO-8601 con zona;
- todo path interno usa `/`, no es absoluto, no contiene segmentos vacíos,
  `.` o `..`, NUL, backslash ni percent-encoding; los paths del lock se
  resuelven además con containment, `lstat` y rechazo de symlink;
- todos los modelos internos también usan `extra="forbid"`.
- hashes internos (`canonicalPdfSha256`, `imageSha256`,
  `pageInventorySha256`, `pageArtifactHash`, `processingFingerprint` y hashes
  de pesos) usan siempre `sha256:<64 hex minúsculos>`; solo
  `source.expectedSha256` y `selection.expectedPageInventorySha256` usan hex
  desnudo.
- un validador de `PreparedDocument` exige que `metadata.sourceIsExactRecord`
  y sus campos públicos de cobertura coincidan exactamente con
  `publicationGate`; los derechos se leen una sola vez desde
  `metadata.rights`. Cada `SourceLineInput.logicalPageNumber` coincide con su
  página contenedora. La base no duplica ese número en `source_lines`: se
  obtiene por el join a `source_pages`.
- el mismo validador reconstruye los bytes JSONL de `inventoryRecords`, verifica
  `pageInventorySha256`, exige `inventoryVerifiedAt` con zona y demuestra una
  correspondencia uno-a-uno entre records `include` y `pages` para PDF, lado,
  índice lógico, etiqueta impresa y `continuityBreakBefore`; ningún record
  excluido puede tener una `SourcePageInput`.
- `canonicalization` es el snapshot normalizado exacto que produjo el
  inventario: cada override y decisión aparece una vez y sus efectos/reasons
  coinciden con `inventoryRecords`; candidatos pendientes, decisiones omitidas
  o una canonical distinta se rechazan. El snapshot completo participa en
  `preparedDocumentHash`/`sampleHash` y nunca se reconstruye desde manifiesto
  durante publish/evaluación.
- el loader recalcula `processingFingerprint` desde `processing` con la fórmula
  única de 5.6 y exige igualdad con el nivel superior, con
  `metadata.processingFingerprint` y con todo envelope staged. También exige
  que PDF/inventario/canonicalización, geometría, render, OCR y políticas del
  payload coincidan con las páginas, records y chunks materializados; publish
  puede verificarlo sin leer manifiesto, model cache ni `source.json`;
- el validador exige además: `metadata.documentId` en todas las páginas;
  `metadata.contentHash == metadata.canonicalPdfSha256`; `pageId`, cada
  `lineId` y cada `pageArtifactHash` recalculados con 5.5/5.7; lista
  `pageArtifactHashes` uno-a-uno y en orden lógico; `lineIds` existentes,
  únicos dentro del chunk, todos `role=body` y en orden global
  `(logicalPageNumber,lineOrder)`; `originalText` igual a unir esas líneas con
  `"\n"`; `pageStart/pageEnd` iguales a min/max; `ocrConfidence` igual a
  `math.fsum(len(text)*confidence)/sum(len(text))` con tolerancia absoluta
  `1e-12`; y ningún chunk cruza una página con `continuityBreakBefore=true`.
- `canonicalPdfRelativePath` coincide con la derivación segura de 5.5 y
  `processingFingerprint`/`pageInventorySha256` coinciden en todos los
  envelopes y páginas donde se materializan;
- todos los `chunkId` son globalmente únicos y se recalculan con la función
  legada; `sectionPath` debe ser exactamente
  `["Diccionario Madoz", metadata.edition, entryTitle]`, `correctedText=null`,
  `cityQids=[]`, `entityQids=[]` y
  `historicalPeriod=metadata.historicalPeriod`; el bundle
  rechaza referencias a líneas inexistentes o una misma línea
  incluida dos veces dentro del mismo chunk. El overlap entre chunks
  consecutivos solo puede repetir el suffix/prefix exacto permitido por
  `processing.chunking.overlapLines` según 5.11, y caracteres/IDs de cada
  chunk respetan `processing.chunking.maxChunkChars` y el tope 512.

### 5.4 Campos públicos nuevos

`models.py` extrae a `DocumentMetadata` exactamente los campos documentales
existentes de `IngestRequest`: `documentId`, `sourceUrl`, `title`, `author`,
`edition`, `publicationYear`, `language`, `countryCode`, `sourceClass`,
`contentHash` y `rights: RightsMetadata`. `IngestRequest` hereda de ese modelo
y conserva su forma JSON histórica al añadir `chunks`; `rights` sigue anidado
y mantiene `status`, `uri`, `verifiedAt` e `isExplicitlyReusable` obligatorios.
No se cambia `RightsMetadata` ni se introduce un objeto `document` en el API.

`DocumentMetadata` añade exactamente estos opcionales, todos con default
`null` salvo las dos listas con `default_factory=list`:

- `workId: str|null`, 1..128;
- `volumeNumber: int|null`, 1..1000;
- `repositoryName: str|null`, 1..512;
- `historicalPeriod: str|null`, 1..64;
- `temporalScope: str|null`, 1..512;
- `attribution: str|null`, 1..2048;
- `sourceIsExactRecord: bool|null`;
- `canonicalPdfSha256: sha256:<64 hex>|null`;
- `processingFingerprint: sha256:<64 hex>|null`;
- `pageInventorySha256: sha256:<64 hex>|null`;
- `coverageStatus: unknown|partial_source|complete_source|null`;
- `coverageStatement: str|null`, 1..2048;
- `observedPrintedRanges: list[PrintedRange]`, 0..2000;
- `missingPrintedPages: list[str]`, 0..2000, regex impresa de 5.3;
- `coverageAcceptedForProduct: bool|null`;
- `coverageAcceptedAt: datetime con zona|null`.

Cuando cualquiera de los campos de cobertura tiene valor preparado, los seis
campos forman el mismo `CoverageMetadata` válido de 5.3; no se permiten estados
parciales incoherentes.

Mapeo único manifiesto→bundle; Qwen no elige aliases ni fuentes alternativas:

| Manifiesto/derivado validado | Campo del bundle |
|---|---|
| `document.documentId/title/author/edition/publicationYear/language/countryCode/sourceClass` | campos homónimos de `metadata` |
| `document.workId/volumeNumber/historicalPeriod/temporalScope` | campos homónimos de `metadata` |
| `source.sourceUrl/repositoryName/attribution` | campos homónimos de `metadata` |
| `source.isExactRecord` | `metadata.sourceIsExactRecord` y `publicationGate.sourceIsExactRecord` |
| `"sha256:" + source.expectedSha256` | `metadata.contentHash` y `metadata.canonicalPdfSha256` |
| fingerprint calculado por 5.6 | `metadata.processingFingerprint` y `PreparedDocument.processingFingerprint` |
| payload tipado normalizado de 5.6 | `PreparedDocument.processing` y `OcrEvaluationSample.processing` |
| `"sha256:" + selection.expectedPageInventorySha256` | `metadata.pageInventorySha256` y `PreparedDocument.pageInventorySha256` |
| `selection.inventoryVerifiedAt` | `PreparedDocument.inventoryVerifiedAt` |
| `source.rights.status/uri/verifiedAt/isExplicitlyReusable` | `metadata.rights` sin transformación de nombres |
| `coverage.status/statement/observedPrintedRanges/missingPrintedPages/acceptedForProduct/acceptedAt` | los seis campos planos de `metadata` y `publicationGate.coverage` |
| `selection.canonicalization` normalizada | `PreparedDocument.canonicalization` y `OcrEvaluationSample.canonicalization` |

En un `PreparedDocument`, todos los opcionales descriptivos/derivados añadidos
a `DocumentMetadata` son obligatorios y no nulos, salvo los nulls permitidos
por el estado de cobertura (`coverageStatement` y `coverageAcceptedAt`). Las
dos listas siempre están presentes. Se rechaza un bundle que omita un campo,
use el default HTTP o no coincida byte/valor con las copias de nivel superior.
La misma regla se aplica a `OcrEvaluationSample.metadata`. El manifest loader
crea este objeto; ni staging, evaluación ni publish vuelven a mapearlo.

Para el endpoint HTTP legado, un validador de `IngestRequest` exige que este
subconjunto permanezca íntegramente en su default `null`/lista vacía:
`sourceIsExactRecord`, `canonicalPdfSha256`, `processingFingerprint`,
`pageInventorySha256`, `coverageStatus`, `coverageStatement`,
`observedPrintedRanges`, `missingPrintedPages`,
`coverageAcceptedForProduct` y `coverageAcceptedAt`. Esos campos solo entran
por `PreparedDocument`; si aparece uno en HTTP, se rechaza el payload y se
indica usar el flujo `prepare`/`publish`. Con todos ausentes, la conducta
histórica se conserva. Los metadatos descriptivos nuevos y `entryTitle` sí son
opcionales en HTTP y participan en su request hash cuando tienen valor.

`ChunkInput` añade:

- `entryTitle: str | None = None`.

`lineIds` no se acepta en el HTTP de ingesta: un payload legado no contiene
páginas/líneas que satisfagan sus FKs. `ingest_models.py` define en cambio
`PreparedChunkInput`, con todos los campos de `ChunkInput` más
`lineIds: list[str]` obligatorio, único, ordenado, `min_length=1` y
`max_length=512`. `PreparedDocument.chunks` usa únicamente ese tipo.

Los records conservan **todos** sus campos v1 con tipo/nullability actual y
añaden exactamente lo siguiente; ninguno expone `canonicalPdfRelativePath`:

```text
DocumentRecord añade
  workId: str|null
  volumeNumber: int|null
  repositoryName: str|null
  historicalPeriod: str|null
  temporalScope: str|null
  attribution: str|null
  sourceIsExactRecord: bool|null
  canonicalPdfSha256: sha256:<64 hex>|null
  processingFingerprint: sha256:<64 hex>|null
  pageInventorySha256: sha256:<64 hex>|null
  inventoryVerifiedAt: datetime con zona|null
  coverageStatus: unknown|partial_source|complete_source|null
  coverageStatement: str|null
  observedPrintedRanges: list[PrintedRange]
  missingPrintedPages: list[str]
  coverageAcceptedForProduct: bool|null
  coverageAcceptedAt: datetime con zona|null

ChunkRecord añade
  entryTitle: str|null
  lineIds: list[sha256:<64 hex>]
  workId, volumeNumber, repositoryName, temporalScope, attribution:
    tipo/nullability idénticos a DocumentRecord
  sourceIsExactRecord, canonicalPdfSha256, processingFingerprint,
    pageInventorySha256, inventoryVerifiedAt: tipo/nullability idénticos a
    DocumentRecord
  coverageStatus, coverageStatement, observedPrintedRanges,
    missingPrintedPages, coverageAcceptedForProduct, coverageAcceptedAt:
    tipo/nullability idénticos a DocumentRecord
  rightsIsExplicitlyReusable: bool

SearchHit añade exactamente los mismos campos nuevos de ChunkRecord
```

Los tipos/límites de cada campo repetido son los de `DocumentMetadata`/5.3.
Para una fila v1 migrada, escalares nuevos son `null`, listas nuevas son `[]`,
`entryTitle=null` y `lineIds=[]`; `rightsIsExplicitlyReusable` se deriva de la
columna v1 obligatoria. Para un documento preparado, ninguno de los campos de
procedencia/cobertura añadidos puede caer al fallback v1.

Toda respuesta documental del piloto expone `coverageStatus=partial_source`,
el aviso, los seis huecos y el estado/fecha de las revisiones de cobertura y
derechos; la UI o un consumidor no debe inferir “completo” por el mero hecho de
que la búsqueda devuelva resultados.

Nuevas respuestas:

```text
SourceLineRecord
  lineId: sha256:<64 hex>
  lineOrder: int >= 0
  originalText: str
  confidence: float 0..1
  box: NormalizedBox
  orientationDegrees: 0|90|180|270|null
  role: body|header|footer|table|unknown

PageSummary
  pageId: sha256:<64 hex>
  documentId
  logicalPageNumber: int >= 1
  sourcePdfPageNumber: int >= 1
  leafSide: left|right|full
  continuityBreakBefore: bool
  printedPageLabel: str|null
  contentClass: normal|table|mixed_orientation
  textSource: ppocrv6
  qualityScore: float 0..1
  qualityFlags: list[str]
  workId: str
  volumeNumber: int
  repositoryName: str
  historicalPeriod: str
  temporalScope: str
  attribution: str
  sourceIsExactRecord: bool
  canonicalPdfSha256: sha256:<64 hex>
  processingFingerprint: sha256:<64 hex>
  pageInventorySha256: sha256:<64 hex>
  inventoryVerifiedAt: datetime con zona
  sourceUrl
  rightsStatus
  rightsUri
  rightsVerifiedAt
  rightsIsExplicitlyReusable: bool
  coverageStatus: unknown|partial_source|complete_source
  coverageStatement: str|null
  observedPrintedRanges: list[{start,end}]
  missingPrintedPages: list[str]
  coverageAcceptedForProduct: bool
  coverageAcceptedAt: datetime con zona|null

PageRecord extends PageSummary
  cropBox: NormalizedBox
  widthPx, heightPx, renderDpi: int > 0
  rasterizationPolicy
  rotationDegrees: 0|90|180|270
  imageSha256: sha256:<64 hex>
  foregroundRatio, meanConfidence, lowConfidenceRatio: float 0..1
  ocrEngine, ocrEngineVersion, ocrDetectionModel, ocrRecognitionModel
  originalText
  lines: list[SourceLineRecord]
```

La lista de páginas se ordena por `logicalPageNumber`; el detalle ordena líneas
por `lineOrder`. `qualityFlags`, `missingPrintedPages` y `lineIds` siempre son
listas (nunca `null`). Campos nuevos en documentos v1 migrados pueden ser
`null`; para un documento preparado y persistido por el esquema SQLite v2 son
obligatorios según estos contratos.

### 5.5 IDs

`identity.py` es la única implementación de JSON canónico para los IDs de
página/línea/chunk/artefacto/bundle/muestra de este apartado;
`registry.py` reexporta los nombres privados de ID legado que ya consumen
tests o módulos, pero no mantiene una segunda fórmula. El request hash HTTP de
compatibilidad sigue el contrato separado de 5.9.

Se usa JSON canónico con:

```python
json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
```

Fórmulas:

```text
pageId =
  "sha256:" + sha256(
    canonical({
      documentId,
      sourcePdfPageNumber,
      leafSide,
      cropBox,
      rotationDegrees,
      imageSha256
    })
  )

lineId =
  "sha256:" + sha256(
    canonical({
      pageId,
      lineOrder,
      originalText,
      box
    })
  )
```

Las coordenadas de `box` se redondean a seis decimales antes de formar el
ID.

El `chunkId` conserva exactamente la función actual basada en:

- `documentId`;
- `pageStart`;
- `pageEnd`;
- `sectionPath`;
- `originalText`.

Para Madoz:

```text
sectionPath = [
  "Diccionario Madoz",
  metadata.edition,
  entryTitle
]
```

No se hardcodea ningún número de tomo ni topónimo en chunking.

Conversión de hashes del PDF:

```text
canonicalPdfSha256 = "sha256:" + source.expectedSha256
pageInventorySha256 = "sha256:" + selection.expectedPageInventorySha256
contentHash = canonicalPdfSha256
raw filename = source.expectedSha256 + ".pdf"
```

No se vuelve a calcular un hash con otro formato para `contentHash`.

Ningún ID controlado por input se interpola como segmento de filesystem. Las
claves de almacenamiento son:

```text
documentStorageKey = sha256(UTF-8(documentId)).hexdigest()
processingFingerprintHex = quitar el prefijo validado "sha256:"
pageIdHex = quitar el prefijo validado "sha256:"
canonicalPdfRelativePath =
  "raw/" + documentStorageKey + "/" + source.expectedSha256 + ".pdf"
```

`canonicalPdfRelativePath` debe coincidir exactamente con esa derivación; no
se acepta una variante aportada por el bundle. Todas las uniones se resuelven,
comprueban bajo `dataRoot` y rechazan symlinks.

### 5.6 Processing fingerprint

`ingest_models.py` define `FingerprintPayload` como modelo camelCase,
`extra="forbid"` y `frozen=True`. Se construye con esta forma exacta:

```text
fingerprintSchemaVersion: literal 1
manifestSchemaVersion: literal 1
source:
  canonicalPdfSha256
selection:
  candidatePdfPageRanges
  pageInventorySha256
  splitSpreads
  gutterRatio
  innerGutterTrimRatio
  canonicalization: CanonicalizationSnapshot
  leafOverrides: lista normalizada completa, ordenada por (pdfPage,sideOrder)
  leafGeometry: lista ordenada de
    {pdfPage,side,cropBox,rotationDegrees,widthPx,heightPx}
software: SoftwareVersions
render: {dpi,rasterizationPolicy}
ocr:
  {textMode,engine,device,detectionModel,recognitionModel,language,
   documentOrientationClassification,documentUnwarping,textLineOrientation}
modelLock: ModelLockFingerprint
quality: {lowConfidenceThreshold}
policies: {layoutPolicy,entryPolicy}
chunking: {maxChunkChars,overlapLines}
```

`leafOverrides` incluye `contentClass`, rotación y todas las regiones/cajas
normalizadas, incluida su rotación OCR nullable. `leafGeometry` se calcula
para **todas** las hojas candidatas desde media/crop boxes, rotaciones y DPI
con la misma regla de redondeo de PyMuPDF antes de OCR; no depende de que una
página esté cacheada. El SHA del inventario liga sus bytes completos, mientras
`canonicalization` conserva además la decisión humana legible.

`FingerprintPayload.fingerprint()` es la única implementación del hash y usa
exactamente esta fórmula:

```text
processingFingerprint =
  "sha256:" + sha256(
    UTF-8(json.dumps(
      FingerprintPayload.model_dump(mode="json", by_alias=True,
                                    exclude_none=False),
      ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ))
  ).hexdigest()
```

No incluye rutas absolutas/locales, fecha, PID, ubicación del cache,
`sourceUrl`, derechos, aceptación de cobertura ni otros metadatos
descriptivos. Cambiar cualquiera de esos campos no invalida una página OCR;
cambiar cualquier byte/campo del payload sí crea otro fingerprint.

Vector golden obligatorio del payload completo mínimo (los valores repetidos
son hashes sintéticos, no artefactos reales):

```json
{
  "fingerprintSchemaVersion": 1,
  "manifestSchemaVersion": 1,
  "source": {"canonicalPdfSha256": "sha256:0000000000000000000000000000000000000000000000000000000000000000"},
  "selection": {
    "candidatePdfPageRanges": [{"start": 1, "end": 1}],
    "pageInventorySha256": "sha256:1111111111111111111111111111111111111111111111111111111111111111",
    "splitSpreads": false,
    "gutterRatio": 0.5,
    "innerGutterTrimRatio": 0.005,
    "canonicalization": {"defaultStatus": "include", "defaultOrder": "source_order", "duplicateDecisions": [], "pageOverrides": []},
    "leafOverrides": [],
    "leafGeometry": [{"pdfPage": 1, "side": "full", "cropBox": {"x0": 0.0, "y0": 0.0, "x1": 1.0, "y1": 1.0}, "rotationDegrees": 0, "widthPx": 100, "heightPx": 200}]
  },
  "software": {"pymupdf": "1.28.2", "paddleocr": "3.7.0", "paddlex": "3.7.2", "transformers": "5.16.1", "torch": "2.13.0", "numpy": "2.3.5"},
  "render": {"dpi": 300, "rasterizationPolicy": "pymupdf-page-render-v1"},
  "ocr": {"textMode": "ocr", "engine": "transformers", "device": "cpu", "detectionModel": "PP-OCRv6_medium_det", "recognitionModel": "PP-OCRv6_medium_rec", "language": "es", "documentOrientationClassification": false, "documentUnwarping": false, "textLineOrientation": true},
  "modelLock": {"schemaVersion": 1, "paddleOcrVersion": "3.7.0", "paddleXVersion": "3.7.2", "transformersVersion": "5.16.1", "engine": "transformers", "models": [{"name": "PP-OCRv6_medium_det", "files": [{"relativePath": "model.json", "sizeBytes": 1, "sha256": "sha256:2222222222222222222222222222222222222222222222222222222222222222"}]}, {"name": "PP-OCRv6_medium_rec", "files": [{"relativePath": "model.json", "sizeBytes": 1, "sha256": "sha256:3333333333333333333333333333333333333333333333333333333333333333"}]}]},
  "quality": {"lowConfidenceThreshold": 0.6},
  "policies": {"layoutPolicy": "madoz-two-column-v1", "entryPolicy": "madoz-entry-v1"},
  "chunking": {"maxChunkChars": 1500, "overlapLines": 2}
}
```

Su resultado obligatorio es
`sha256:21d527034ae1158ab887870c0a57236edbb3a3331bfbe982eccc0e34d7d70c75`.
La prueba fija ese literal; no lo genera y luego se compara consigo misma.

### 5.7 Staging

Directorio:

```text
/data/staging/{documentStorageKey}/{processingFingerprintHex}/
  source.json
  pages/{logicalPageNumber:06d}.json
  evaluation-samples/{sampleHashHex}.json
  prepared-document.json
  preparation-report.json
```

Reglas:

- toda escritura usa temporal en el mismo directorio y `os.replace`;
- cada JSON de página es un `StagedPage`; solo se reutiliza si el envelope
  valida y coinciden `pageArtifactHash`, fingerprint, PDF hash e inventory hash;
- `source.json` conserva manifiesto normalizado, SHA del PDF, SHA del inventario,
  canonicalización resuelta, cobertura declarada y el mismo
  `FingerprintPayload` incluido en bundle/muestra;
- `pageArtifactHash` es el SHA-256 del JSON canónico de `SourcePageInput`
  completo, incluidas todas sus líneas, cajas, roles y confianzas;
- una página corrupta se recalcula y se registra como warning;
- nunca se publica un bundle sin todas las hojas `include` del inventario
  resueltas ni con una anomalía pendiente;
- los derivados quedan para auditoría después de publicar;
- `OcrEvaluationSample` se valida con las mismas recomputaciones de
  `pageId`/`lineId`/`pageArtifactHash`/`chunkId`, texto, confianza, orden,
  roles y breaks que el bundle. No exige cubrir todo el inventario: exige
  exactamente la selección declarada y sus records `include`; el hash del
  inventario se comprueba contra el archivo verificado antes de construirla.
  Para chunking trata como break cualquier
  salto en la selección, sin alterar el `continuityBreakBefore` verdadero de
  la `SourcePageInput` staged. Su `sampleHash` usa JSON
  canónico y excluye únicamente `sampleHash` y `createdAt`. El literal
  `publishable=false` y un tipo distinto impiden que el loader de
  `PreparedDocument` o `publish` lo acepte;
- `PreparationReport.candidatePdfPages` es el total de pliegos de los rangos;
  `inventoryIncluded + inventoryExcludedDuplicates +
  inventoryExcludedNonbody` equivale al total de records cuando no hay
  pending; `logicalPages=inventoryIncluded=ocrPages=len(pages)` en un bundle
  exitoso; `blankPages`/`lowQualityPages` son subconjuntos únicos válidos y
  `chunks=len(bundle.chunks)`. El reporte de una ejecución resumida describe el
  resultado completo, no solo páginas recalculadas;
- ninguna imagen renderizada temporal queda fuera del staging al terminar;
- reejecutar `prepare` con los mismos bits/procesamiento y metadatos de fuente,
  cobertura o derechos actualizados reutiliza `StagedPage`, pero regenera atómicamente
  `source.json`, `prepared-document.json` y `preparation-report.json`;
- el PDF canónico queda en:

```text
/data/raw/{documentStorageKey}/{expectedSha256}.pdf
```

#### 5.7.1 Muestra OCR anterior al bundle completo

El gate R2 no puede depender de preparar las 71 hojas. El comando separado es:

```text
historical-corpus-ingest prepare-sample \
  --manifest PATH \
  --pages 39:full,41:full,...,109:full
```

Contrato:

- `--pages` acepta 1..64 refs únicas `PDF_PAGE:SIDE`, sin rangos implícitos;
  normaliza a orden `(canonicalSequenceIndex)` y rechaza una ref ausente,
  excluida, pendiente o cuyo lado no corresponde a `splitSpreads`;
- exige fuente/hash, inventario verificado, `ModelLock` y fingerprint igual que
  `prepare`, pero permite derechos/cobertura aún no aceptados;
- mantiene el lock exclusivo de preparación, usa una sola instancia OCR y
  procesa/reutiliza únicamente las páginas elegidas mediante el mismo
  `StagedPage`; no exige que las demás páginas existan;
- construye chunks sobre corridas lógicas consecutivas de la selección; cada
  salto cierra la entrada y el chunk. No cambia la página staged ni su ID;
- escribe atómicamente solo el `OcrEvaluationSample` bajo
  `evaluation-samples/{sampleHashHex}.json` y devuelve su path/hash como JSON;
  no crea `prepared-document.json`, no abre SQLite/TurboVec y no es publicable;
- `evaluate-ocr` acepta exclusivamente `--sample`; el loader rechaza un
  `PreparedDocument`, y `publish` acepta exclusivamente `--prepared` y rechaza
  una muestra aunque se renombre el archivo;
- el `prepare` completo posterior reutiliza las páginas staged válidas de la
  muestra y vuelve a ejecutar chunking sobre las 71 hojas y sus breaks reales.

### 5.8 Esquema SQLite v2

Migración aditiva:

Las columnas v1 `source_url`, `rights_status`, `rights_uri`,
`rights_verified_at` y `rights_is_explicitly_reusable` ya existen con
`NOT NULL`; se conservan y se alimentan desde `DocumentMetadata.sourceUrl` y
`DocumentMetadata.rights`. No se crean aliases ni columnas paralelas.

Columnas nuevas en `documents`:

```text
work_id TEXT
volume_number INTEGER
repository_name TEXT
historical_period TEXT
temporal_scope TEXT
attribution TEXT
source_is_exact_record INTEGER
canonical_pdf_relative_path TEXT
canonical_pdf_sha256 TEXT
processing_fingerprint TEXT
page_inventory_sha256 TEXT
inventory_verified_at TEXT
coverage_status TEXT
coverage_statement TEXT
observed_printed_ranges_json TEXT
missing_printed_pages_json TEXT
coverage_accepted_for_product INTEGER
coverage_accepted_at TEXT
```

Mapeo de persistencia, probado por round-trip:

| Autoridad del bundle | Columna `documents` |
|---|---|
| `metadata.sourceUrl` | `source_url` existente |
| `metadata.contentHash` | `content_hash` existente |
| `metadata.rights.status/uri/verifiedAt/isExplicitlyReusable` | `rights_status/rights_uri/rights_verified_at/rights_is_explicitly_reusable` existentes |
| `preparedDocumentHash` | `request_hash` existente |
| `metadata.workId/volumeNumber/repositoryName` | `work_id/volume_number/repository_name` |
| `metadata.historicalPeriod/temporalScope/attribution` | `historical_period/temporal_scope/attribution` |
| `publicationGate.sourceIsExactRecord` | `source_is_exact_record` |
| `canonicalPdfRelativePath` | `canonical_pdf_relative_path` |
| `metadata.canonicalPdfSha256` | `canonical_pdf_sha256` |
| `processingFingerprint` | `processing_fingerprint` |
| `pageInventorySha256/inventoryVerifiedAt` | `page_inventory_sha256/inventory_verified_at` |
| `publicationGate.coverage.status/statement` | `coverage_status/coverage_statement` |
| `publicationGate.coverage.observedPrintedRanges/missingPrintedPages` | `observed_printed_ranges_json/missing_printed_pages_json` |
| `publicationGate.coverage.acceptedForProduct/acceptedAt` | `coverage_accepted_for_product/coverage_accepted_at` |

Los JSON de rangos/listas usan el JSON canónico de 5.5. Para documentos v1,
solo las columnas nuevas quedan `null`; los campos v1 obligatorios nunca se
degradan a nullable.

Columnas nuevas en `chunks`:

```text
entry_title TEXT
chunk_order INTEGER
```

```sql
CREATE UNIQUE INDEX IF NOT EXISTS idx_chunks_document_order
ON chunks(document_id, chunk_order)
WHERE chunk_order IS NOT NULL;
```

Toda inserción v2 —HTTP o preparada— guarda la posición de la lista validada.
Filas v1 migradas conservan `null` y usan solo como fallback estable
`(page_start,page_end,chunk_id)`; no se inventa el orden histórico.

Tabla `source_pages`:

```sql
page_id TEXT PRIMARY KEY,
document_id TEXT NOT NULL,
logical_page_number INTEGER NOT NULL,
source_pdf_page_number INTEGER NOT NULL,
leaf_side TEXT NOT NULL,
continuity_break_before INTEGER NOT NULL,
crop_box_json TEXT NOT NULL,
printed_page_label TEXT,
width_px INTEGER NOT NULL,
height_px INTEGER NOT NULL,
render_dpi INTEGER NOT NULL,
rasterization_policy TEXT NOT NULL,
rotation_degrees INTEGER NOT NULL,
image_sha256 TEXT NOT NULL,
content_class TEXT NOT NULL,
foreground_ratio REAL NOT NULL,
text_source TEXT NOT NULL,
ocr_engine TEXT NOT NULL,
ocr_engine_version TEXT NOT NULL,
ocr_detection_model TEXT NOT NULL,
ocr_recognition_model TEXT NOT NULL,
mean_confidence REAL NOT NULL,
low_confidence_ratio REAL NOT NULL,
quality_score REAL NOT NULL,
quality_flags_json TEXT NOT NULL,
original_text TEXT NOT NULL,
processing_fingerprint TEXT NOT NULL,
UNIQUE(document_id, logical_page_number),
FOREIGN KEY(document_id) REFERENCES documents(document_id)
```

Tabla `source_lines`:

```sql
line_id TEXT PRIMARY KEY,
page_id TEXT NOT NULL,
line_order INTEGER NOT NULL,
original_text TEXT NOT NULL,
confidence REAL NOT NULL,
x0 REAL NOT NULL,
y0 REAL NOT NULL,
x1 REAL NOT NULL,
y1 REAL NOT NULL,
orientation_degrees INTEGER,
role TEXT NOT NULL,
UNIQUE(page_id, line_order),
FOREIGN KEY(page_id) REFERENCES source_pages(page_id)
```

Tabla `chunk_lines`:

```sql
chunk_id TEXT NOT NULL,
line_id TEXT NOT NULL,
chunk_line_order INTEGER NOT NULL,
PRIMARY KEY(chunk_id, line_id),
UNIQUE(chunk_id, chunk_line_order),
FOREIGN KEY(chunk_id) REFERENCES chunks(chunk_id),
FOREIGN KEY(line_id) REFERENCES source_lines(line_id)
```

`chunk_line_order` es el ordinal base cero dentro de
`PreparedChunkInput.lineIds`; nunca reutiliza el `line_order` local de la
página, que podría repetirse cuando un chunk abarca dos páginas.

Columnas v2 aditivas en `index_state` (nullable solo para poder migrar una fila
v1; todo estado v2 sano las exige no nulas):

```text
vector_index_backend TEXT
vector_index_bit_width INTEGER
authority_sha256 TEXT
artifact_sha256 TEXT
```

Journal singleton de sincronización:

```sql
CREATE TABLE IF NOT EXISTS index_sync_journal (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  operation TEXT NOT NULL CHECK (operation IN ('publish','http_ingest','repair')),
  target_generation INTEGER NOT NULL,
  target_index_version TEXT NOT NULL,
  target_corpus_index_version TEXT NOT NULL,
  target_authority_sha256 TEXT NOT NULL,
  embedding_model TEXT NOT NULL,
  embedding_dimension INTEGER NOT NULL,
  reranker_model TEXT NOT NULL,
  vector_index_backend TEXT NOT NULL,
  vector_index_bit_width INTEGER NOT NULL,
  chunking_policy_version TEXT NOT NULL,
  source_registry_version TEXT NOT NULL,
  document_count INTEGER NOT NULL,
  chunk_count INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
```

`target_authority_sha256` es `sha256:<64 hex>` de un stream determinista. Por
cada join `chunks`↔`embeddings` ordenado por `vector_id` concatena
`vector_id` como uint64 big-endian, longitud del BLOB como uint64 big-endian y
los bytes float32 little-endian almacenados. Antes de calcularlo se exige:

- exactamente un embedding por chunk y ningún embedding huérfano;
- `chunks.vector_id == embeddings.vector_id`, IDs únicos en `0..2^63-1`
  conforme a `_compute_vector_id` legado;
- BLOB de longitud exacta `embedding_dimension*4`, todos los float32 finitos;
- `chunk_count`, número de joins e IDs únicos iguales.

Al finalizar, `index_state.authority_sha256` recibe exactamente el
`target_authority_sha256` verificado. `artifact_sha256` es
`"sha256:" + sha256(bytes completos del index.tvim final).hexdigest()` para
TurboVec. El hash se toma del descriptor regular no-symlink ya sincronizado,
después de `os.replace`/fsync y antes del commit de finalización. Para el doble
InMemory de tests se usa el SHA del mismo stream autoridad; un estado runtime
persistente nunca admite esa variante.

El backend persistente v1/v2 es literalmente `turbovec` y bit width es
`2|3|4`. La versión objetivo se calcula desde JSON canónico de 5.5 exactamente
como:

```text
corpusRows = lista ordenada por documentId de
  {documentId, contentHash, requestHash}
corpusIndexVersion = "sha256:" + sha256(UTF-8(canonical(corpusRows))).hexdigest()
indexPayload = {
  corpusIndexVersion,
  embeddingModel,
  embeddingDimension,
  rerankerModel,
  vectorIndexBackend: "turbovec",
  vectorIndexBitWidth: bitWidth,
  chunkingPolicyVersion,
  sourceRegistryVersion
}
indexVersion = "sha256:" + sha256(UTF-8(canonical(indexPayload))).hexdigest()
```

`requestHash` es la columna `documents.request_hash`: hash HTTP legado o
`preparedDocumentHash`. Por ello, dos bundles con el mismo PDF/documentId pero
inventario, OCR, páginas o chunks distintos nunca comparten
`corpusIndexVersion`/`indexVersion`.

Protocolo de estado e índice:

1. `VectorIndex` añade `is_persistent: bool`,
   `contains_ids(ids)->set[int]`, `replace_all(ids,vectors)->None` y
   `artifact_sha256()->sha256:<64 hex>`.
   `InMemoryVectorIndex` declara `false`; `TurboVecIndex`, `true`.
2. En TurboVec, `replace_all` valida todo antes de mutar, construye un
   `IdMapIndex` nuevo, lo sincroniza a un temporal único en el mismo
   directorio, lo recarga y verifica dimensión, bit width, count y membresía;
   hace fsync del archivo, `os.replace`, fsync del directorio y solo entonces
   cambia `_index`. Falla cerrando y limpia el temporal sin alterar el índice
   anterior. El path final y el temporal deben ser regulares y no symlinks;
   `artifact_sha256()` hashea por streaming exactamente el archivo final.
3. Una inserción nueva abre `BEGIN IMMEDIATE`, rechaza un journal previo,
   escribe documento/chunks/embeddings y, en la misma transacción, calcula el
   estado objetivo sobre el corpus posterior. Reserva
   `target_generation=(generation vigente o 0)+1`, inserta el journal y hace
   commit. Todavía no actualiza `index_state`.
4. El servicio vuelve a cargar y validar **toda** la autoridad SQLite, llama
   una vez a `replace_all`, comprueba que `contains_ids(expected)==expected`
   y `count()==len(expected)`, y finaliza en otra `BEGIN IMMEDIATE`: recalcula
   corpus/autoridad, exige igualdad con el journal, upserta `index_state` con
   los valores target exactos, `authority_sha256` y el artifact hash leído
   después del swap, y elimina el journal en el mismo commit.
5. Si el proceso cae en cualquier punto, el journal queda pendiente. El modo
   `repair` nunca lo “adopta” sin trabajo: vuelve a construir desde toda la
   autoridad y finaliza con el mismo `target_generation`, de modo que varios
   reintentos solo consumen una generación.
6. Si no hay journal pero configuración, autoridad, artifact, count o membresía
   discrepan, `repair` crea primero un journal `operation=repair`. Si corpus,
   reranker, bit width y versiones de política no cambiaron, conserva
   `target_index_version`; si cambió una entrada permitida que forma la
   versión, usa el nuevo valor. En ambos casos incrementa una sola generación.
7. El modo API `verify` recalcula el hash de autoridad SQLite y el SHA del
   artefacto TurboVec, además de count/membresía; rechaza cualquier journal,
   autoridad inválida, `index_state` incompatible o diferencia con error
   estable `INDEX_REPAIR_REQUIRED`. Jamás llama `upsert`, `sync` ni
   `replace_all`.
   En corpus vacío y sano puede crear una vez el estado inicial con
   `generation=0` después de verificar índice vacío.
8. Un índice no persistente usado en tests se hidrata con `replace_all` tras
   validar SQLite y su `artifact_sha256` usa el stream autoridad, pero esa
   hidratación no modifica estado/generación. La vía runtime de producción
   siempre usa TurboVec persistente.
9. `build_service_from_env` recibe el argumento interno, no variable de
   entorno, `startup_policy: Literal["verify","repair"]="verify"`. El API
   solo usa el default; el CLI `publish` solo pasa `repair` después de obtener
   el lock exclusivo. Runtime pasa al servicio la configuración lógica
   `vector_index_backend="turbovec"` y el bit width validado; los índices
   InMemory de tests son dobles de esa proyección y no cambian esa identidad.
10. `ingest` HTTP e `ingest_prepared` comparten exactamente el protocolo
    journal/reemplazo/finalización. Tras una falla de reemplazo, la instancia
    marca el índice no disponible y búsqueda, versión y nuevas ingestas fallan
    con `INDEX_REPAIR_REQUIRED`; lecturas SQLite no densas pueden continuar.
    Un replay sano no abre transacción ni llama `replace_all`.

Un corpus no vacío exige que embedding model/dimensión del estado o journal
coincidan con el runtime; un cambio no se “repara” porque requeriría re-embed y
queda fuera de alcance. Un cambio explícito de reranker o bit width sí puede
materializarse solo por `repair-index` offline: crea nueva `indexVersion`,
reemplaza TurboVec desde los mismos embeddings y consume una generación. Una
fila v1 con columnas vectoriales nulas requiere esa adopción offline antes de
que el API v2 arranque.

La inicialización:

- crea tablas con `CREATE TABLE IF NOT EXISTS`;
- usa un helper `_ensure_column(table, column, declaration)` basado en
  `PRAGMA table_info`;
- no renombra ni elimina columnas;
- ejecuta todo antes de atender peticiones;
- puede repetirse;
- deja una base v1 utilizable como v2;
- inserta documento, páginas, líneas, chunks, joins, embeddings y su journal
  objetivo en una sola transacción SQLite;
- actualiza `_SCHEMA_VERSION` de `"1"` a `"2"` y
  `_SOURCE_REGISTRY_VERSION` de `"1"` a `"2"`;
- ejecuta `_migrate_v2()` con sentencias individuales dentro de
  `BEGIN IMMEDIATE`/`COMMIT`; una excepción ejecuta `ROLLBACK` y no deja
  columnas o tablas parciales. No usa `executescript()` dentro de esa
  transacción.

### 5.9 Compatibilidad del request hash

La función HTTP actual serializa todo `IngestRequest`. Añadir defaults
cambiaría los hashes legados. La nueva función debe:

1. aceptar sin cambios todos los JSON históricos y construir para el hash la
   misma proyección de campos que hoy, incluso `correctedText: null` y listas
   históricas vacías; no se exige que un `model_dump()` genérico omita los
   campos nuevos;
2. eliminar solo los campos HTTP nuevos cuando tengan su default:
   metadatos escalares nuevos en `null`, rangos/huecos vacíos y
   `entryTitle=null`;
3. rechazar antes de hashear cualquier campo marcado prepared-only en 5.4 e
   incluir todo campo descriptivo/`entryTitle` nuevo cuando tenga valor;
4. congelar en una prueba un hash calculado antes del cambio.

Fixture congelado antes de tocar `models.py`:

```text
payload: pods/historical-corpus-pod/examples/malaga-smoke-ingest.json
expected request hash:
sha256:042430c597e0336df2ed73ff9869544ad88d46449bf6635b1a5a49bb63f6d74a
```

La prueba copia o carga ese JSON sin modificarlo y demuestra el valor exacto;
no calcula la constante después del refactor.

`PreparedDocument.preparedDocumentHash` se calcula como
`"sha256:" + sha256(UTF-8(JSON canónico))` sobre el `model_dump` completo con
aliases, `exclude_none=False`, eliminando únicamente
`preparedDocumentHash`, `canonicalPdfRelativePath` y `preparedAt`. El loader
recalcula y compara antes de devolver el modelo. Ese hash preparado:

- incluye `DocumentMetadata`, `PublicationGateSnapshot` y la lista interna de
  chunks;
- incluye la lista ordenada de `pageArtifactHash`, no solo `pageId`;
- incluye `inventoryVerifiedAt` y todos los `inventoryRecords` ordenados;
- incluye el `processingFingerprint`;
- incluye el `FingerprintPayload` completo que permite recalcularlo;
- incluye el SHA canónico;
- incluye `pageInventorySha256` y cobertura documental;
- excluye la ruta local del PDF y `preparedAt`.

Al publicar, `documents.request_hash` guarda `preparedDocumentHash`; en la vía
HTTP histórica continúa guardando el request hash legado. En ambos casos
`documents.content_hash` conserva `metadata.contentHash`.

### 5.10 Orden de lectura

Después de recortar una página física:

1. aplicar rotación;
2. normalizar cajas a 0..1;
3. descartar resultados OCR con texto vacío;
4. unir palabras/boxes que el proveedor entregue como una sola línea;
5. conservar la orientación de cada línea como `0|90|180|270|null`;
6. marcar `role=table` si el centro de la caja cae dentro de una
   `tableRegion`, si `contentClass=table`, o si su orientación es 90/270;
7. clasificar entre las líneas restantes el 7 % superior como `header` y el
   5 % inferior como `footer`;
8. asignar `role=body` a toda línea restante; `unknown` se conserva en el enum
   para compatibilidad futura, pero el pipeline Madoz v1 nunca lo emite;
9. retirar temporalmente headers y footers; se ordenan cada uno por
   `(y0,x0,y1,x1,originalText)` y se emitirán antes/después del contenido;
10. cada `tableRegion` forma un bloque con su caja declarada. Sus líneas se
   ordenan por `(y0,x0,y1,x1,originalText)` en las coordenadas del crop OCR
   rotado antes de transformarlas de vuelta. Una página `contentClass=table`
   sin regiones forma un único bloque y usa las coordenadas finales; una línea
   table fuera de toda región es un bloque unitario;
11. para body y bloques table, separar por centro X; tratar como bloque
    transversal cualquiera que cruce el centro y ocupe más de 65 % del ancho;
12. ordenar bloques transversales por `(y0,x0)` y usarlos para dividir bandas;
    dentro de cada banda emitir columna izquierda y después derecha por
    `(y0,x0,y1,x1,originalText)`, expandiendo cada bloque table en su orden
    interno, y finalmente el transversal que cierra la banda;
13. el orden global es headers, contenido del paso 12 y footers. Antes de
    asignarlo se colapsan candidatos exactamente duplicados por texto,
    polígono, confianza y corrección; los empates restantes usan esa tupla
    completa como desempate y nunca el orden recibido del proveedor;
14. asignar `lineOrder` base cero y formar `SourcePageInput.originalText`
    uniendo todas las líneas en ese orden con `"\n"`;
15. conservar `header`, `footer` y `table` en procedencia, pero excluirlos del
    detector de entradas y chunks; solo `body` es publicable;
16. copiar `printedPageLabel` del inventario verificado; el OCR de preparación
    no puede corregirlo ni usarlo como ID.

Orientación OCR exacta:

- PaddleX 3.7 devuelve `textline_orientation_angles` como indicadores `0|1`;
  se convierten a corrección `0|180` multiplicando por 180;
- `ocr_backend` devuelve `ExtractedLineCandidate`; no decide roles, orden ni
  orientación absoluta;
- para el pase principal, layout toma el más largo de los cuatro lados de
  `polygon` (empate: primero en orden del proveedor), calcula
  `degrees(atan2(dy,dx)) mod 180` en ejes de imagen —por tanto positivo es
  horario— y lo aproxima a 0° o 90° solo si está a `<=15°`; fuera de esa
  tolerancia guarda `null` y no marca table por orientación;
- orientación final principal = `(eje + corrección180) mod 360`;
- una `tableRegion` con `ocrRotationDegrees` reemplaza las líneas principales
  cuyo centro cae dentro: OCRiza el crop rotado en sentido horario, transforma
  sus polígonos de vuelta y fija orientación original como
  `(ejeRotado + corrección180 - ocrRotationDegrees) mod 360`;
- en coordenadas normalizadas de la región, el forward horario 90° es
  `(u,v)->(1-v,u)` y su inversa `(u',v')->(v',1-u')`; para 270° es
  `(u,v)->(v,1-u)` e inversa `(u',v')->(1-v',u')`. Después se escala y traslada
  a `tableRegion.box`; la caja final es el envelope min/max del polígono;
- una `tableRegion` sin rotación solo asigna `role=table` a líneas existentes.

Calidad determinista por página:

- `foregroundRatio` es la proporción de píxeles con gris `<245`;
- `blank` exige `foregroundRatio<0.005` y cero caracteres extraídos; una hoja
  excluida por manifiesto no se intenta reclasificar como blank;
- `meanConfidence` pondera cada confianza por número de caracteres;
- `lowConfidenceRatio` divide los caracteres de líneas por debajo del umbral
  entre todos los caracteres;
- una blank confirmada usa `meanConfidence=1.0`, `lowConfidenceRatio=0.0` y
  `qualityScore=1.0`; una no blank sin texto usa respectivamente `0.0`, `1.0`
  y `0.0`;
- para las demás páginas,
  `qualityScore = clamp(0, 1, 0.7*meanConfidence + 0.3*(1-lowConfidenceRatio))`;
- `low_confidence` se activa si
  `meanConfidence<0.75` o `lowConfidenceRatio>0.25`;
- `mixed_orientation` se activa si existen al menos tres líneas horizontales
  y tres verticales;
- `table_heavy` se activa si los caracteres `role=table` son al menos 25 % de
  los caracteres no header/footer; si el denominador es cero, el ratio es 0 y
  el flag queda desactivado;
- `rotation_applied` se activa solo si el override manual no es cero.
- `oversize_body_line` se activa si una línea `role=body` supera
  `processing.maxChunkChars`; el texto se conserva completo en procedencia.

### 5.11 Detección de entradas y chunking

Entrada candidata:

- línea `role=body`;
- `madoz_chunking.py` expone una única función pura
  `detect_entry_title(original_text: str) -> str | None`; el chunker y la
  evaluación QW-17A deben usarla, sin copiar la heurística;
- se toma solo el prefijo anterior al **primer** punto, dos puntos, guion o
  raya mediante el patrón no voraz con grupo nombrado siguiente;

```text
^(?P<title>[^.:—\-\r\n]{2,100}?)(?P<delimiter>[.:—-])
```

- `entryTitle = match.group("title").strip()` con el `strip()` Unicode de
  Python; no colapsa espacios internos y excluye siempre el delimitador;
- tras ese trim, el título tiene 2..100 caracteres, su primer carácter es una
  letra Unicode mayúscula y contiene al menos dos letras;
- `letters = [c for c in entryTitle if c.isalpha()]` y el ratio es exactamente
  `sum(c.isupper() for c in letters) / len(letters)`; se acepta si es `>=0.75`.
  Dígitos, espacios y puntuación distinta del delimitador no entran en el
  denominador. Sin match o al fallar una condición, devuelve `None`;

Reglas:

- una entrada puede continuar en la página siguiente;
- si `nextLogicalPageNumber != previousLogicalPageNumber + 1` o la página
  siguiente tiene `continuityBreakBefore=true`, se cierra entrada/chunk y su
  prefijo vuelve a `unassigned_prefix`; nunca se finge continuidad sobre un
  hueco de la fuente;
- contenido anterior a la primera entrada detectada se marca
  `unassigned_prefix`, se cuenta en el reporte y no crea chunk en v1;
- dos entradas nunca comparten un chunk;
- una entrada produce un chunk mientras la unión con LF no supere
  `maxChunkChars` **ni** 512 `lineIds`; alcanzar cualquiera de los límites
  corta antes de la siguiente línea;
- una entrada mayor se corta solo entre líneas y cada fragmento contiene al
  menos una línea nueva no perteneciente solo al overlap;
- antes de detectar entradas, cualquier `body` con longitud mayor que
  `maxChunkChars` falla cerrado con `OVERSIZE_BODY_LINE`, página/lineId y sin
  truncar, partir dentro de la línea ni crear bundle/muestra. El
  `StagedPage` puede conservarse con `oversize_body_line` para diagnóstico;
- para todo fragmento posterior al primero de una entrada, el overlap candidato
  son exactamente las últimas `min(overlapLines, n)` líneas consecutivas del
  fragmento anterior, conservando su orden; sus caracteres, LF e IDs cuentan
  dentro de `maxChunkChars` y del límite de 512;
- se añade después al menos la siguiente línea nueva. Si overlap + esa línea no
  cabe en cualquiera de los dos límites, se retiran líneas del overlap desde
  la más antigua hasta que quepa; luego se agregan nuevas líneas en orden hasta
  el siguiente corte. Con la comprobación previa de línea sobredimensionada,
  esto garantiza progreso y nunca genera un chunk compuesto solo de overlap;
- `originalText` es la unión exacta con `"\n"`;
- `pageStart/pageEnd` son números de página lógica;
- `entryTitle` es exactamente el valor devuelto por `detect_entry_title`;
- `lineIds` sigue el orden de lectura;
- `ocrConfidence` conserva el contrato legado obligatorio y es el promedio
  PP-OCRv6 ponderado por caracteres de todas las líneas del chunk;
- páginas vacías no crean chunks;
- líneas con cualquier rol distinto de `body` se conservan en procedencia pero
  nunca alimentan el detector de entradas ni los chunks v1;
- si ninguna entrada se detecta en una página aislada de prueba, se reporta;
  no se inventa un título.

Orden canónico de chunks: para cada chunk se resuelven primera y última línea
por `(logicalPageNumber,lineOrder)` y se ordena la lista por
`(firstPage,firstLineOrder,lastPage,lastLineOrder,chunkId)`. La posición base
cero es `chunkOrder`. El validador de `PreparedDocument`, la persistencia,
`get_chunk_ids_for_document` e `IngestResult.chunkIds` usan ese mismo orden.
El overlap no altera la regla; el primer fragmento de una entrada conserva una
primera línea estrictamente anterior. Primer publish y todo replay devuelven
exactamente la misma lista, no el orden incidental de un `IN (...)` o dict.

La heurística debe evaluarse con ground truth. No se amplía hasta los 16
tomos mientras falle el gate de límites de entrada.

### 5.12 API de procedencia

Se añaden:

```text
GET /v1/documents/{document_id}/pages
GET /v1/documents/{document_id}/pages/{logical_page_number}
GET /v1/documents/{document_id}/pages/{logical_page_number}/image
```

- La lista devuelve resúmenes, no líneas.
- El detalle devuelve página y líneas ordenadas.
- La imagen renderiza solo el crop registrado desde el PDF canónico.
- El DPI del preview es fijo: 144.
- No se acepta una ruta, crop, DPI ni nombre de archivo del usuario.
- La ruta canónica se resuelve y se comprueba bajo `/data/raw`.
- Página o documento ausente devuelve el error 404 estructurado existente.
- PDF incoherente con el SHA almacenado devuelve 409, no una imagen.
- La verificación SHA del PDF se memoriza en proceso por
  `(ruta resuelta, tamaño, mtime_ns, sha esperado)`; solo se vuelve a leer el
  PDF completo en un fallo de caché o si cambia el `stat`.
- La caché LRU de verificación admite como máximo 16 entradas y nunca
  sustituye el chequeo de que la ruta siga bajo `/data/raw`.
- `previewPolicyVersion` es la constante literal
  `pymupdf-preview-crop-png-v1`; se incrementa ante cualquier cambio de
  semántica de crop, rotación, rasterización o codificación PNG.
- La clave del renderer se deriva exactamente como:

```text
previewRendererKey = sha256(UTF-8(
  previewPolicyVersion + "\n" + pymupdfVersion + "\n144"
)).hexdigest()
```

- El preview se cachea atómicamente en:

```text
/data/previews/{pageIdHex}-{previewRendererKey}.png
```

- Tras leer o producir el PNG final, la respuesta calcula el ETag fuerte
  exacto `"sha256:{sha256(PNG bytes).hexdigest()}"`. Un
  `If-None-Match` que coincida devuelve 304, cuerpo vacío y el mismo ETag;
  bytes PNG distintos nunca comparten ETag.
- Los endpoints GET siguen la política actual: loopback y sin bearer.

## 6. Métricas y gates

### 6.1 Formato gold de extracción de texto

JSONL, una página lógica por línea:

```json
{"documentId":"...","logicalPageNumber":3,"sourcePdfPageNumber":41,"pageClass":"mixed_orientation","referenceLines":[{"text":"MALAGA (PROVINCIA DE): ...","role":"body","orderAnchor":"MALAGA (PROVINCIA DE)"}],"entryBoundaries":[{"entryTitle":"MALAGA (PROVINCIA DE)","lineIndex":0,"charOffset":0}],"criticalTokens":["Málaga","Granada"]}
```

El archivo es UTF-8 de máximo 8 MiB y 64 filas, con LF final. Las claves
`(documentId,logicalPageNumber)` son únicas y deben coincidir uno-a-uno con
`OcrEvaluationSample.selectedPages`; `sourcePdfPageNumber` también debe
coincidir. Cada fila admite 0..500 `referenceLines` de 1..4096 caracteres,
0..500 boundaries y 0..128 tokens críticos únicos de 1..128 caracteres;
strings vacíos, controles, NaN/Inf y campos extra se rechazan.

- `pageClass` acepta `normal|table|mixed_orientation|blank`;
- `lineIndex` es base cero sobre `referenceLines`; en v1 cada boundary exige
  `charOffset=0`, apunta a una línea gold `role=body` y no puede compartir
  `lineIndex` con otro boundary de la misma página;
- `orderAnchor` es opcional, debe ser único en esa página tras normalización y
  se anota solo en líneas útiles para comprobar orden;
- `referenceText` se deriva uniendo `referenceLines[].text` con `"\n"`; no se
  almacena una segunda copia divergente;
- una página blank tiene listas vacías; toda página no blank contiene al
  menos una `referenceLine` y un token whitespace no vacío, por lo que
  CER/WER nunca dividen entre cero.

Normalización de evaluación:

- Unicode NFC;
- espacios consecutivos a uno;
- separación de palabras por whitespace;
- comparación case-sensitive para CER/WER;
- una segunda métrica case-insensitive solo informativa.

Cálculo exacto:

- CER micro = suma de distancias Levenshtein de caracteres por página no blank
  dividida por la suma de caracteres gold; WER micro usa tokens whitespace;
- el validador gold rechaza `criticalTokens` duplicados después de NFC y
  compactación de espacios; cada token único falla si no aparece como substring
  exacto en el texto evaluado tras esa misma normalización;
- `criticalTokenError = total de anotaciones de token ausentes / total de
  anotaciones de token gold` sobre todas las páginas; sin anotaciones vale
  `0.0`;
- una página falla si falta su `SourcePageInput` embebida en
  `OcrEvaluationSample`, el modelo/muestra no valida o una gold blank no queda
  `blank` y sin líneas body/table;
- para toda comparación aproximada,
  `normalizedDistance(a,b) = levenshtein(a,b) / max(len(a),len(b),1)` después
  de la normalización indicada;
- se alinean todas las líneas extraídas, en `lineOrder`, con todas las
  `referenceLines`, en orden, mediante DP global: inserción y borrado cuestan
  `1`, sustitución cuesta `normalizedDistance`; en empate se elige diagonal,
  luego borrar línea extraída y luego insertar línea gold. Una diagonal solo
  cuenta como par alineado si su distancia es `<=0.35`;
- los boundaries predichos se obtienen exclusivamente llamando a
  `detect_entry_title` de QW-13 sobre cada línea extraída `role=body`; cada
  resultado crea uno con `charOffset=0`. Es TP si su línea forma un par
  alineado con la línea gold del boundary y la distancia normalizada entre
  títulos es `<=0.20`. El alineamiento garantiza asignación one-to-one; los
  demás predichos son FP y los gold, FN;
- precisión/recall/F1 de boundaries se calculan micro sobre todas las páginas;
- cada `orderAnchor` debe aparecer exactamente una vez en las líneas extraídas; la
  exactitud de orden suma pares de anchors gold adyacentes que aparecen en
  orden creciente y divide por todos los pares gold adyacentes; anchor ausente
  o ambiguo hace incorrectos sus pares;
- el ratio low-confidence pondera caracteres, no número de líneas;
- división `0/0` vale `1.0` para precision/recall/F1 y exactitud; `x/0` no puede
  ocurrir tras validación.

Gate OCR para 24 páginas lógicas estratificadas:

| Métrica | Gate |
|---|---:|
| páginas fallidas | 0 |
| CER global | <= 0.08 |
| WER global | <= 0.18 |
| error de tokens críticos | <= 0.05 |
| F1 de límites de entrada | >= 0.90 |
| exactitud de orden de lectura | >= 0.95 |

La muestra de 24 páginas debe incluir:

- inicio, medio y final;
- tinta débil y bleed-through;
- tablas;
- entrada que cruza página;
- las PDF 41, 42, 52, 60, 70, 89–92 y 102–108, además de ocho páginas
  narrativas repartidas entre obispado, provincia, Hoya y ciudad;
- páginas con OCR embebido defectuoso para demostrar que PP-OCRv6 recupera los
  tokens o, si no lo hace, bloquear el gate;
- páginas con topónimos y cifras;
- páginas normales, mixtas, rotadas y tablas del piloto Málaga.

El reporte muestra además las mismas métricas por `pageClass` y `textSource`.
Los gates son globales, pero cualquier página fallida en un estrato hace
fallar el conjunto.

Qwen no crea el texto gold leyendo PP-OCRv6 ni la capa OCR embebida. La
transcripción gold se hace visualmente por una persona desde el facsímil.

### 6.2 Formato de recuperación

JSONL:

```json
{"id":"t11-malaga-provincia-001","query":"...","relevantTargets":[{"documentId":"madoz-1848-t11-malaga-partial-google-books","entryTitle":"MALAGA (PROVINCIA DE)","logicalPages":[3,4],"printedPages":["34","35"]}],"requiredTerms":["Málaga"]}
```

El archivo es UTF-8 de máximo 2 MiB y 500 filas con IDs únicos, 1..512
caracteres por query, 1..64 targets y 0..128 términos requeridos por caso;
listas, strings, páginas impresas/lógicas y campos extra usan validación
estricta y acotada antes de hacer la primera petición HTTP.

En cada target, `logicalPages` es una lista única, ascendente y no vacía;
`printedPages` tiene la misma longitud y su elemento `i` es la etiqueta
impresa esperada de `logicalPages[i]`. Antes de enviar una búsqueda, el
evaluador carga una sola vez documento y resúmenes de página para cada
`documentId`, exige que esa correspondencia sea exacta y rechaza nulls,
páginas ausentes o etiquetas incluidas en `missingPrintedPages`.

Un hit satisface un target si:

1. coincide `documentId`;
2. `entryTitle` coincide tras NFC, compactación de espacios y `casefold`;
3. el intervalo `pageStart..pageEnd` intersecta `logicalPages`.

Los tres requisitos son obligatorios. Cada target solo cuenta una vez aunque
lo satisfagan varios hits.

`printedPages` es obligatorio y solo valida cobertura: no participa en el
matching. El dataset sintético usa una cobertura sintética declarada en su
fixture y satisface la misma correspondencia.

Por cada caso se envía exactamente `POST /v1/search` con
`{"query": case.query, "limit": 20}`; no se filtra por los documentos
relevantes. Redirects HTTP están desactivados y cualquier 3xx, respuesta no
2xx o esquema inesperado falla el caso.

Métricas:

- Recall@20 por caso = targets distintos cubiertos en los 20 primeros / total
  de targets; el valor agregado es la media macro de casos;
- Precision@8 por caso = hits relevantes entre los primeros ocho / 8; si el
  API devuelve menos, las posiciones ausentes cuentan como no relevantes;
- MRR@20 = media de `1/rank` del primer hit relevante, o cero si no existe;
- presencia de términos = proporción de `requiredTerms` que aparece en al
  menos un `hit.text` relevante del top 20; término y texto usan NFC,
  whitespace compacto y `casefold` antes del substring match; lista vacía
  vale `1.0`;
- integridad estructural = hits top 20 cuyo chunk, todos sus `lineIds`, páginas
  y documento resuelven, dividido por todos los hits top 20; cero hits da 1.0;
- excepción, timeout o respuesta no válida hace fallar el caso y aporta cero a
  Recall/MRR.

Para integridad, el evaluador cachea por ID las respuestas: exige que
`GET /v1/chunks/{chunkId}` coincida con hit en chunk/document/page range,
resuelve `GET /v1/documents/{documentId}` y carga los detalles de cada página
del intervalo. La unión de sus líneas debe contener todos los `lineIds` del
chunk con `role=body`; cualquier 404, mismatch o ID ausente vuelve ese hit no
íntegro. No usa paths internos ni acceso directo a SQLite.

Gate de recuperación para al menos 20 consultas humanas:

| Métrica | Gate |
|---|---:|
| Recall@20 | >= 0.90 |
| MRR@20 | >= 0.75 |
| integridad estructural | 1.00 |
| consultas con excepción | 0 |

Precision@8 se reporta, pero el primer POC no la convierte en gate hasta
tener juicios de relevancia completos.

### 6.3 Gates de regresión por fase

El gate de código QW-20, que no tiene el PDF ni pesos privados, exige:

- suite histórica completa;
- tests nuevos;
- build de test;
- build de API;
- build de ingesta;
- `pip check` dentro de ambas imágenes;
- smoke del API determinista en Podman;
- reinicio del API con persistencia;
- replay idempotente;
- migración desde una base v1.

Antes de declarar terminado el POC real, R1 añade obligatoriamente smoke real
PP-OCRv6 sobre las 12 hojas indicadas y R2 añade el gold de 24. QW-20 no finge
ese gate ni descarga pesos: solo demuestra la implementación con fakes y
fixtures sintéticas. Antes de declarar producto publicado, R4/R5 añaden Qwen y
TurboVec reales, reinicio, replay/reparación y recuperación.

## 7. Protocolo obligatorio para Qwen

Qwen no recibe este plan entero como una orden de implementación única.
Codex lo divide por `QW-XX`.

Las referencias como “implementar 5.1” son navegación para Codex, nunca una
instrucción para que Qwen abra o interprete este documento completo. Antes de
cada llamada, Codex copia del apartado citado únicamente el contrato literal
necesario —tipos, invariantes, algoritmos y casos— dentro de un máximo de diez
requisitos atómicos. Si no cabe, divide la unidad por la frontera indicada; no
resume dejando decisiones abiertas ni pasa `tasks/plan.md` como contexto.

Para cada unidad:

1. Codex verifica la precondición y decide el contrato.
2. Qwen inspecciona solo símbolos conocidos con `inspect_literal` o hace
   investigación mecánica acotada con `research`.
3. Si hay una prueba nueva, Qwen la crea primero con `create_files`.
4. Se ejecuta la prueba roja con `validate` y se registra que falla por la
   capacidad ausente, no por sintaxis.
5. Un archivo de implementación nuevo usa `create_files`.
6. Un archivo existente usa `semantic_patch`.
7. Una sustitución exacta usa `replace_literal`.
8. Las validaciones decididas usan `validate`, máximo tres comandos por
   llamada.
9. Codex inspecciona el diff devuelto y el diff Git.
10. Solo se continúa si no hay cambios fuera del allow-list.

Límites por llamada Qwen:

- una responsabilidad;
- uno a tres archivos escribibles;
- cero a cuatro archivos de contexto;
- hasta diez requisitos atómicos;
- hasta tres comandos de validación;
- ninguna decisión de arquitectura;
- ningún retry de prompt cuando `qwen_called=false`: primero se corrige el
  protocolo.

No se permiten:

- editar en paralelo `models.py`, `registry.py`, `service.py` o
  `app.py`;
- regenerar un archivo existente completo;
- usar `qwen_worker.delegate`;
- añadir suppressions, tests saltados, stubs o TODOs;
- relajar seguridad, límites o gates para conseguir verde;
- añadir los archivos no rastreados preexistentes del workspace;
- ejecutar `git add .`;
- usar Docker o `docker compose`.

Entorno rápido de pruebas:

```bash
python3.12 -m venv /tmp/historical-corpus-madoz-venv

/tmp/historical-corpus-madoz-venv/bin/python -m pip install \
  -e "./pods/historical-corpus-pod[dev,ingest]"
```

Si el entorno ya existe y los pins no cambiaron, se reutiliza. Si cambian,
se recrea.

QW-00 usa la imagen baseline y no necesita ese venv. Al terminar QW-01 se
crea o reinstala el entorno antes de ejecutar QW-02.

## 8. Unidades de ejecución

### QW-00 — Baseline y protección del workspace

- [x] Completado: baseline Podman verde (`69 passed`) y workspace protegido.
- Depende de: ninguna.
- Escrituras: ninguna.
- Objetivo: demostrar que la rama y el baseline son sanos.
- Comprobar rama, estado y diff.
- Registrar todos los archivos no rastreados preexistentes y no tocarlos.
- Ejecutar la suite Podman de baseline.
- Confirmar que no hay un servicio histórico ejecutándose antes de pruebas
  destructivas sobre datos de prueba.
- Salida: evidencia de baseline; sin commit.

Validación:

```bash
podman build --target test \
  -t localhost/tour-guide-historical-corpus:test \
  pods/historical-corpus-pod

podman run --rm localhost/tour-guide-historical-corpus:test
```

Stop:

- cualquier test rojo;
- rama distinta;
- cambios tracked ajenos en archivos que este plan necesita.

### QW-01 — Dependencias y targets de imagen

- [x] Completado: imágenes test/ingest verdes, `69 passed`, `pip check` e
  imports `PyMuPDF 1.28.2`/`PaddleOCR 3.7.0`/`PaddleX 3.7.2` verificados como
  UID 10001.
- Depende de: QW-00.
- Archivos existentes escribibles:
  - `pods/historical-corpus-pod/pyproject.toml`
  - `pods/historical-corpus-pod/Containerfile`
- Contexto:
  - `deployment/podman/historical-corpus.compose.yml`
- Herramienta: `semantic_patch`.

Requisitos:

1. Añadir extra `preview` con `PyMuPDF==1.28.2`.
2. Añadir extra `ingest` con `PyMuPDF==1.28.2`, `PyYAML==6.0.2`,
   `paddleocr==3.7.0`, `paddlex==3.7.2` y `httpx2==2.12.0` para el evaluador
   HTTP del contenedor one-shot.
3. Cambiar únicamente el pin NumPy de este producto de `2.5.2` a `2.3.5`.
4. El target `runtime` instala `.[preview]`; el target `test` instala
   `.[dev,ingest]`.
5. Añadir target `ingest-runtime` desde `base`, instalando
   `.[ingest]`.
6. Añadir `PADDLEX_HOME=/model-cache/paddlex` y la variable efectiva de
   PaddleX 3.7.2 `PADDLE_PDX_CACHE_HOME=/model-cache/paddlex`; crear y asignar
   al UID 10001 los directorios de cache necesarios.
7. Instalar `libgl1` y `libglib2.0-0`, dependencias nativas mínimas del OpenCV
   arrastrado por PaddleX en `python:3.12-slim`.
8. No instalar `paddlepaddle`.
9. No cambiar los pins de FastAPI, Qwen, Torch, Transformers o TurboVec.
10. Ejecutar como `10001:10001` en todos los targets finales.

Validación:

```bash
podman build --target test \
  -t localhost/tour-guide-historical-corpus:test \
  pods/historical-corpus-pod

podman run --rm localhost/tour-guide-historical-corpus:test \
  sh -c 'python -m pip check && python -m pytest -q -p no:cacheprovider tests'

podman build --target ingest-runtime \
  -t localhost/tour-guide-historical-corpus-ingest:local \
  pods/historical-corpus-pod && \
podman run --rm \
  localhost/tour-guide-historical-corpus-ingest:local \
  python -c "import fitz,paddleocr,paddlex; print(fitz.VersionBind,paddleocr.__version__,paddlex.__version__)"
```

Stop:

- conflicto de resolución;
- `pip check` falla;
- no se pueden importar las versiones fijadas sin PaddlePaddle;
- regresión de baseline, TurboVec o backend determinista tras bajar NumPy.

QW-01 no instancia modelos ni descarga pesos. La única descarga autorizada
ocurre después mediante `prefetch-models`, que genera el lock verificable.

Commit de grupo después de QW-01:

```text
chore: add isolated Madoz ingestion runtime
```

### QW-02 — Extensión compatible de modelos públicos

- [x] Completado: `27` pruebas de contrato nuevas, `20` de API y `4` de
  registry verdes; los modelos compartidos evitan la dependencia circular.
- Depende de: QW-01.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_madoz_models.py`
- Implementación existente:
  - `pods/historical-corpus-pod/src/historical_corpus/models.py`
- Contexto:
  - `pods/historical-corpus-pod/tests/test_api.py`
  - `pods/historical-corpus-pod/tests/test_registry.py`

Secuencia:

1. `create_files` crea solo la prueba.
2. `validate` demuestra rojo por campos/modelos ausentes.
3. `semantic_patch` modifica solo `models.py`.
4. `validate` demuestra verde.

Requisitos:

- extraer `DocumentMetadata` como base sin cambiar la forma JSON de
  `IngestRequest`;
- añadir los campos públicos de 5.4;
- definir `PrintedRange` y `NormalizedBox` en `models.py` como tipos
  compartidos exactos de 5.3;
- añadir `PageSummary`, `PageRecord` y `SourceLineRecord`;
- conservar `extra="forbid"`;
- conservar todos los nombres y defaults antiguos;
- no elevar el máximo HTTP de chunks;
- validar hashes, rangos, QIDs, cajas y listas; rechazar por HTTP los campos
  prepared-only exactos de 5.4;
- demostrar que un payload legado conserva todos sus campos y valores
  históricos; el hash se congela en QW-04, después de adaptar el registry;
- demostrar rechazo de campos desconocidos y valores no finitos.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_models.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_api.py
```

### QW-03A — Identidad y modelos internos base

- [x] Completado en `identity.py`, `ingest_models.py` y
  `test_ingest_models.py`; 7 pruebas focalizadas y 58 pruebas combinadas
  pasan. La prueba se creó primero y falló por ausencia de los módulos; los
  modelos de fingerprint validan orden/unicidad tanto al proyectar como al
  cargarse directamente.
- Depende de: QW-02.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/identity.py`
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
  - `pods/historical-corpus-pod/tests/test_ingest_models.py`
- Contexto por llamada:
  - creación de prueba: `models.py`, `registry.py`;
  - creación de implementación: prueba roja, `models.py`, `registry.py`.
- Herramienta: `create_files`; una llamada crea solo la prueba, `validate`
  demuestra rojo, otra crea solo los dos módulos y `validate` demuestra verde.

Requisitos de implementación, copiados literalmente por Codex en <=10:

1. `identity.py` centraliza/exporta `canonical_json_bytes` y los IDs exactos de
   5.5; ningún otro módulo redefine sus opciones JSON.
2. `compute_chunk_id` copia byte por byte el algoritmo legado; QW-04 hará que
   `registry._compute_chunk_id` lo reexporte sin cambiar resultados/imports.
3. Importar y reutilizar `PrintedRange` desde `models.py`; implementar
   `CoverageMetadata` y `PublicationGateSnapshot` exactos de 5.3.
4. Importar y reutilizar `NormalizedBox` desde `models.py`; implementar
   `ExtractedLineCandidate`, `SourceLineInput` y `SourcePageInput` con límites
   y finitud exactos.
5. Implementar `PageInventoryRecord` de 5.1.1, snapshots tipados de
   canonicalización, `StagedPage`, `ModelLock`, `ModelLockFingerprint` y
   `ModelLockFingerprintEntry`.
6. Usar aliases camelCase y `extra="forbid"` recursivo.
7. Redondear cajas a seis decimales solo al formar IDs, nunca al persistir.
8. Validar orden/unicidad de líneas, flags, lock paths/modelos/files y
   datetimes con zona; probar que la proyección fingerprint conserva versiones,
   nombres y files ordenados pero excluye `cacheRelativePath`.
9. Serialización/IDs son deterministas y las pruebas fijan vectores exactos.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ingest_models.py
```

### QW-03B — Bundle completo y muestra OCR no publicable

- [x] Completado: payload de fingerprint tipado/inmutable con vector golden,
  bundle preparado, muestra OCR no publicable y reporte; validación
  adversarial de hashes, procedencia, inventario/canonicalización, geometría,
  IDs, líneas/chunks, cobertura y gates. Pasan 77 pruebas focalizadas y 51 de
  regresión del pod.
- Depende de: QW-03A.
- Archivos existentes, nunca escritos juntos en la misma llamada:
  - `pods/historical-corpus-pod/tests/test_ingest_models.py`
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
- Cada subllamada de prueba usa como contexto `ingest_models.py`, `identity.py`
  y `models.py`; cada implementación usa prueba roja, `identity.py` y
  `models.py`.

Subllamada 1 — formas y serialización:

1. `semantic_patch` añade solo pruebas de forma; `validate` demuestra rojo.
2. `semantic_patch` modifica solo `ingest_models.py`; `validate` queda verde.
3. Definir el `FingerprintPayload` estricto/inmutable de 5.6 y su método
   `fingerprint()` usando los bytes canónicos compartidos de `identity.py`.
4. Añadir `PreparedChunkInput`, `PreparedDocument` y `PreparationReport`
   exactos de 5.3, incluido `processing: FingerprintPayload`.
5. Añadir `OcrEvaluationPageRef`/`OcrEvaluationSample`, también con
   `processing`, exactos de 5.3/5.7.1.
6. `metadata` es `DocumentMetadata`; permitir 4096 chunks internos sin cambiar
   el máximo HTTP y mantener aliases/forbid/límites/orden deterministas.
7. Los loaders discriminan bundle/muestra y su serialización es estable.

Subllamada 2 — validación cruzada adversarial:

1. `semantic_patch` añade solo pruebas de tampering; `validate` demuestra rojo.
2. `semantic_patch` modifica solo `ingest_models.py`; `validate` queda verde.
3. Hacer coincidir gate, metadata, derechos y todas las copias del payload/hash
   conforme a 5.3–5.6.
4. Reconstruir inventario y validar su relación uno-a-uno con páginas, hashes
   de artefacto, IDs, orden y canonicalización.
5. Validar `lineIds` body, texto, páginas, confianza, breaks, límites y overlap
   exacto de cada chunk contra `processing.chunking`.
6. Exigir `sectionPath`, campos vacíos/corregidos y valores documentales
   exactos de 5.3/5.4.
7. Recalcular `preparedDocumentHash`/`sampleHash` exactamente como 5.7/5.9.
8. Probar por separado cada vínculo alterado y cada campo extra/no finito.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ingest_models.py
```

### QW-04 — Migración SQLite v1 → v2 y hash legado

- [x] Completado: migración aditiva y transaccional de SQLite v1 a v2,
  conservación de datos y hashes v1, esquema fresco idempotente, constraints
  de procedencia/journal y rollback integral ante fallo. Pasan 5 pruebas
  focalizadas y 27 de regresión de API/runtime.
- Depende de: QW-03B.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_registry_migration.py`
- Implementación existente:
  - `pods/historical-corpus-pod/src/historical_corpus/registry.py`
- Contexto por llamada:
  - creación de prueba: `registry.py`, `test_registry.py`,
    `examples/malaga-smoke-ingest.json`, `identity.py`;
  - implementación: prueba roja, `identity.py`, `models.py`,
    `ingest_models.py`.

Secuencia: `create_files` crea solo la prueba, `validate` rojo;
`semantic_patch` modifica solo `registry.py`, `validate` verde. Codex obtiene
el hash/fixture mediante `inspect_literal` antes y lo copia en los requisitos;
no añade un quinto contexto.

Requisitos:

- migración exacta de 5.8, incluida `index_sync_journal`;
- helper idempotente de columnas, `_SCHEMA_VERSION = "2"` y
  `_SOURCE_REGISTRY_VERSION = "2"`;
- no cambiar `_CHUNKING_POLICY_VERSION`;
- congelar el payload indicado en 5.9 y el valor exacto
  `sha256:042430c597e0336df2ed73ff9869544ad88d46449bf6635b1a5a49bb63f6d74a`;
- compatibilidad exacta descrita en 5.9;
- importar/reexportar desde `identity.py` el algoritmo `_compute_chunk_id`
  legado sin romper consumidores;
- construir la fixture DB v1 mediante el DDL v1 literal, sin abrir antes el
  `CorpusRegistry` nuevo;
- abrir dos veces la misma DB v1 migrada sin error;
- documentos y búsquedas v1 siguen recuperándose;
- migración con sentencias individuales y transacción explícita; una falla
  inyectada demuestra rollback completo.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_registry_migration.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_registry.py
```

### QW-05A — Persistencia atómica de páginas, líneas y joins

- [x] Completado: persistencia transaccional del bundle preparado, mapeo íntegro
  de documento/páginas/líneas/chunks/joins/embeddings/FTS, lecturas tipadas y
  ordenadas, ruta PDF exclusivamente persistida, conflictos explícitos y
  rollback sin filas parciales. Pasan 3 pruebas focalizadas y 178 de regresión.
- Depende de: QW-04.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_madoz_registry.py`
- Implementación existente:
  - `pods/historical-corpus-pod/src/historical_corpus/registry.py`
- Contexto de prueba: `registry.py`, `ingest_models.py`, `test_registry.py`.
- Contexto de implementación: prueba roja, `ingest_models.py`, `models.py`.
- Secuencia: `create_files` prueba, rojo; `semantic_patch` registry, verde.

Requisitos:

1. Añadir `atomically_insert_prepared_document` y un helper privado de filas
   común con la vía HTTP.
2. Insertar documento, páginas, líneas, chunks, joins y embeddings en una sola
   transacción; conflicto deja cero filas parciales.
3. Preservar `atomically_insert_document` y su resultado público.
4. Aplicar todo el mapeo bundle→columnas de 5.8, incluidas columnas v1 y
   `preparedDocumentHash`, con round-trip campo por campo.
5. Leer páginas/líneas en orden, persistir `chunk_order` y cargar
   `entryTitle`/`lineIds` en chunks/hits; IDs de resultado siguen 5.11.
6. Resolver el PDF solo desde la ruta canónica persistida; nunca aceptar una
   ruta de consulta.
7. Informar conflicto existente; el servicio decide replay idempotente antes
   de insertar.
8. Mantener/probar FKs, unicidades y rollback.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_registry.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_registry.py
```

### QW-05B — Autoridad SQLite y journal del índice

- [x] Completado: autoridad binaria exacta y validada, target tipado, journal
  transaccional para ambas inserciones, reparación/finalización reanudable con
  generación estable y estado vacío estricto. Pasan 19 pruebas focalizadas y
  181 de regresión adicional del pod.
- Nota de secuencia: la retirada del caller legado de `mark_index_state` queda
  cerrada por QW-06C, junto con `replace_all`; retirarlo antes dejaría el
  servicio sin una ruta válida de reconciliación entre QW-05B y QW-06C.
- Depende de: QW-05A.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_index_sync_journal.py`
- Implementación existente:
  - `pods/historical-corpus-pod/src/historical_corpus/registry.py`
- Contexto de prueba: `registry.py`, `test_madoz_registry.py`, `service.py`.
- Contexto de implementación: prueba roja, `ingest_models.py`, `models.py`.
- Secuencia: `create_files` prueba, rojo; `semantic_patch` registry, verde.

Requisitos:

1. Implementar la carga/validación completa de autoridad y
   `target_authority_sha256` exacto de 5.8, además de persistir/verificar
   `authority_sha256` y `artifact_sha256` en todo estado v2 sano.
2. Representar la configuración target con tipos internos, sin aceptar dicts
   libres ni valores del bundle.
3. Rechazar journal previo y crear el nuevo dentro de la misma transacción de
   ambas inserciones; una falla revierte corpus y journal.
4. Calcular target corpus/index versions, counts y generación exactamente una
   vez sobre el estado posterior, usando `request_hash` en las versiones.
5. Exponer lectura tipada del singleton pendiente.
6. Crear journal `repair` en `BEGIN IMMEDIATE` solo cuando no existe otro.
7. Finalizar en `BEGIN IMMEDIATE`: recomputar/bindear target, upsert exacto de
   `index_state` y delete del journal en un commit.
8. Crear estado sano de corpus vacío con generación 0 solo si no hay journal.
9. No permitir `mark_index_state` separado como bypass; adaptar consumidores.
10. Probar autoridad truncada/huérfana, rollback, crash simulado, retry con la
    misma generación y tampering del target.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_index_sync_journal.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_registry.py
```

### QW-06A — Reemplazo verificable de índices vectoriales

- [x] Completado: protocolo común ampliado, reemplazo íntegro/validado en
  memoria, swap TurboVec atómico mediante temporal exclusivo, recarga y
  verificación, fsync de archivo/directorio, hash real del artefacto y rechazo
  fail-closed de symlinks/rutas no regulares. Pasan 35 pruebas focalizadas y
  186 de regresión adicional del pod.
- Depende de: QW-05B.
- Archivos existentes escribibles:
  - `pods/historical-corpus-pod/src/historical_corpus/backends.py`
  - `pods/historical-corpus-pod/src/historical_corpus/turbovec_index.py`
  - `pods/historical-corpus-pod/tests/test_production_backends.py`
- Secuencia por llamada: `semantic_patch` solo prueba con ambos módulos como
  contexto, `validate` rojo; `semantic_patch` solo ambos módulos con la prueba
  roja como contexto, `validate` verde.

Requisitos:

1. Extender `VectorIndex` con `is_persistent`, `contains_ids`, `replace_all` y
   `artifact_sha256` exactos de 5.8, conservando métodos existentes.
2. `InMemoryVectorIndex` valida/reemplaza el dict completo, declara no
   persistente, devuelve solo IDs presentes y hashea el stream autoridad como
   artifact de test.
3. TurboVec usa `value in self._index` para membresía y declara persistente.
4. `replace_all` acepta cero o más IDs únicos y matriz exacta/finita.
5. Construir/sincronizar/reabrir/verificar el `IdMapIndex` temporal antes del
   swap, con dimensión y bit width configurados.
6. Hacer fsync temporal, `os.replace` y fsync de directorio bajo el lock; solo
   después intercambiar la instancia en memoria.
7. Rechazar paths final/temporal symlink o no regulares y limpiar solo el
   temporal propio ante error.
8. Una falla antes del replace conserva bytes, count, membresía e instancia
   anterior; probar hash de artefacto, persistencia tras reapertura y reemplazo
   por vacío.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_production_backends.py
```

### QW-06B — Contrato rojo de reconciliación del índice

- [x] Completado: contrato rojo determinista para corpus vacío, startup
  persistente sano, journal pendiente, drift de IDs/bytes, autoridad inválida,
  fallas antes/después del swap, retry de generación, replay HTTP y cambios de
  configuración/request hash. Los dos módulos de prueba compilan y la
  colección falla únicamente por la API de reconciliación aún ausente que
  implementa QW-06C.
- Depende de: QW-05B y QW-06A.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_index_reconciliation.py`
- Prueba existente escribible después:
  - `pods/historical-corpus-pod/tests/test_retrieval.py`
- Contexto para crear prueba: `service.py`, `runtime.py`, `registry.py`,
  `backends.py`.
- Contexto para actualizar regresión: `test_index_reconciliation.py`, `service.py`,
  `backends.py`, `registry.py`.
- Secuencia: `create_files` crea solo la prueba de reconciliación y `validate`
  demuestra rojo; después `semantic_patch` cambia únicamente el antiguo test
  de replay implícito y un segundo `validate` demuestra que ambos están rojos
  por capacidades ausentes, no por fixture/sintaxis. No se toca implementación.

El contrato prueba: corpus vacío; startup persistente sano; journal pendiente;
ID ausente y extra; autoridad inválida; falla antes/después de replace;
generación única en retry; mismo conjunto de IDs con bytes de vectores/archivo
alterados; dos bundles del mismo PDF con request hash distinto; configuración
incompatible; y que otra llamada a `ingest` en la misma instancia fallida no
repara implícitamente.

Validación roja esperada:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_index_reconciliation.py \
  pods/historical-corpus-pod/tests/test_retrieval.py
```

### QW-06C — Reconciliación y vía HTTP del servicio

- [x] Completado: snapshot target tipado, verificación global read-only,
  reparación por un único pipeline journal→autoridad→replace→verify→finalize,
  bloqueo estable `INDEX_REPAIR_REQUIRED`, replay HTTP sin escrituras y
  retirada de `mark_index_state`/upsert del servicio. Pasan las 15 pruebas
  de reconciliación, 24 de retrieval y 47 regresiones focalizadas; las dos
  pruebas runtime antiguas quedan rojas exclusivamente por el wiring explícito
  de política que corresponde a QW-06D.
- Depende de: QW-06B.
- Implementación existente:
  - `pods/historical-corpus-pod/src/historical_corpus/service.py`
- Contexto: `test_index_reconciliation.py`, `test_retrieval.py`, `backends.py`,
  `registry.py`.
- Herramienta: una `semantic_patch` solo sobre servicio, después `validate`.

Requisitos:

1. Implementar en el constructor `startup_policy=verify|repair` y parámetros
   lógicos tipados de backend/bit width, con defaults compatibles para tests.
2. Sustituir carga/upsert inicial por verificación global de autoridad,
   artifact, count e IDs; API persistente no escribe TurboVec al arrancar y el
   doble InMemory se hidrata sin generación.
3. Implementar un reconciliador único journal→autoridad→`replace_all`→verify→
   finalize y creación de journal repair cuando corresponde.
4. Hacer que `ingest(request)` use inserción+journal+reconciliador sin cambiar
   JSON, IDs ni derechos históricos.
5. Replay HTTP sano global no abre transacción/reemplazo ni cambia estado;
   devuelve `chunkIds` en el mismo `chunk_order`; conflicto conserva el error
   previo.
6. Autoridad/config embedding inválida falla antes de índice; falla de replace
   deja journal y bloquea operaciones densas con `INDEX_REPAIR_REQUIRED`.
7. Reparación idéntica conserva versión y usa una generación aun tras retry;
   cambio permitido de reranker/bit width genera nueva versión offline.
8. `close` sigue idempotente y no importa OCR ni modelos de ingesta.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_index_reconciliation.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_retrieval.py

```

### QW-06D — Wiring runtime de política y configuración vectorial

- [x] Completado: política interna tipada `verify|repair`, default read-only,
  reparación solo explícita, backend/bit width lógico propagado y ninguna
  variable de entorno capaz de habilitar repair. Pasan 14 pruebas focalizadas
  y las 244 pruebas completas del pod.
- Depende de: QW-06C.
- Archivos existentes escribibles, en llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_runtime.py`
  - `pods/historical-corpus-pod/src/historical_corpus/runtime.py`
- Contexto de prueba: `runtime.py`, `service.py`, `turbovec_index.py`.
- Contexto de implementación: prueba roja, `service.py`,
  `turbovec_index.py`.
- Secuencia: `semantic_patch` solo prueba, `validate` rojo; `semantic_patch`
  solo runtime, `validate` verde.

Requisitos:

1. Añadir argumento interno tipado
   `startup_policy: Literal["verify","repair"]="verify"`; no leerlo del env.
2. Pasarlo al servicio junto con backend literal `turbovec` y bit width ya
   validado.
3. El default API verifica; una llamada explícita repair reconcilia; ninguna
   otra configuración runtime cambia.
4. Probar bit width 2/3/4 en estado target, journal al startup, índice ausente
   y que una variable env inventada no habilita repair.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_runtime.py
```

### QW-06E — Ingesta preparada y lecturas de procedencia

- [x] Completado: ingesta de `PreparedDocument` con gates previos, replay
  estrictamente read-only, reconciliación compartida, PDF canónico verificado
  sin symlinks/escape y lecturas tipadas de página/procedencia. Pasan 15
  pruebas focalizadas y las 259 pruebas completas del pod.
- Depende de: QW-06D.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_prepared_ingest.py`
- Implementación existente posterior:
  - `pods/historical-corpus-pod/src/historical_corpus/service.py`
- Contexto para prueba: `service.py`, `ingest_models.py`, `registry.py`,
  `models.py`.
- Contexto para implementación: prueba roja, `ingest_models.py`, `registry.py`,
  `models.py`.
- Secuencia: `create_files` solo prueba, `validate` rojo; `semantic_patch`
  solo servicio, `validate` verde.

Requisitos:

1. Añadir `ingest_prepared(prepared)` sobre el helper journal/reconciliación
   de QW-06C, sin una segunda implementación de index sync.
2. Validar derechos reutilizables, source exacto y cobertura aceptada antes de
   embeddings/SQLite.
3. Derivar bajo `dataRoot` el PDF canónico, exigir regular no-symlink y SHA
   streaming igual al bundle antes de embeddings/SQLite.
4. Confiar solo en el `PreparedDocument` ya revalidado; no leer manifiesto,
   `source.json` ni OCR.
5. Replay preparado sano no escribe; hash/contenido/páginas/config distintos
   producen conflicto y `chunkIds` conserva exactamente orden 5.11.
6. Exponer servicio tipado para lista/detalle de páginas y path canónico solo
   al renderer interno, nunca como record público.
7. Probar gate por gate, orden de fallos antes de modelos, round-trip, replay,
   conflicto y procedencia; cerrar recursos por context manager.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_prepared_ingest.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_retrieval.py
```

Commit de grupo después de QW-02, QW-03A, QW-03B, QW-04, QW-05A, QW-05B,
QW-06A, QW-06B, QW-06C, QW-06D y QW-06E:

```text
feat: persist page-level provenance for historical corpus
```

### QW-07 — Bloqueos de corpus

- [x] Completado: context managers shared/exclusive no bloqueantes sobre
  `fcntl.flock`, permisos 0700/0600, descriptor retenido, error tipado y
  liberación garantizada. Pasan 7 pruebas, incluidas contenciones
  multiproceso reales.
- Depende de: QW-06E.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/locks.py`
  - `pods/historical-corpus-pod/tests/test_locks.py`
- Herramienta: `create_files`, prueba primero.

Secuencia:

1. primera llamada `create_files`: solo `tests/test_locks.py`;
2. `validate`: rojo por módulo ausente, no por sintaxis;
3. segunda llamada `create_files`: solo `locks.py`;
4. `validate`: verde.

Requisitos:

- context managers shared/exclusive;
- bloqueo no bloqueante;
- crear directorio con permisos seguros;
- conservar descriptor hasta salir;
- error tipado con ruta y modo, sin contenido sensible;
- prueba multiproceso real, no solo mock;
- liberar al salir incluso por excepción;
- Linux-only explícito, apropiado para contenedor Podman.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_locks.py
```

### QW-08 — API mantiene bloqueo compartido

- [x] Completado: la API owned adquiere shared lock antes del builder, arranca
  solo con `startup_policy="verify"`, conserva el lock durante el lifespan y
  cierra el servicio antes de liberarlo; la inyección de tests permanece sin
  acceso implícito al filesystem. Pasan 25 pruebas API, 7 de locks y las 271
  pruebas completas del pod.
- Depende de: QW-07.
- Archivos existentes:
  - `pods/historical-corpus-pod/src/historical_corpus/app.py`
  - `pods/historical-corpus-pod/tests/test_api.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/locks.py`
  - `pods/historical-corpus-pod/src/historical_corpus/runtime.py`
- Secuencia: `semantic_patch` modifica solo `test_api.py`, `validate` rojo;
  otra llamada modifica solo `app.py` usando la prueba roja más `locks.py` y
  `runtime.py` como contexto, `validate` verde.

Requisitos:

- adquirir shared lock antes de construir el servicio owned;
- construirlo únicamente con `startup_policy="verify"`; journal o divergencia
  impide startup con `INDEX_REPAIR_REQUIRED` y no repara bajo lock compartido;
- mantenerlo durante lifespan;
- cerrar primero servicio y luego lock;
- una app con servicio inyectado para tests no toca el filesystem salvo que
  se inyecte explícitamente un lock;
- fallo de lock impide startup;
- ninguna ruta cambia todavía.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_api.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_locks.py
```

Commit de grupo:

```text
feat: serialize corpus publication with runtime locks
```

### QW-09 — Carga y validación estructural del manifiesto

- [x] Completado: loader YAML seguro y limitado a 64 KiB, modelos strict
  `extra=forbid`, gates independientes de prepare/publish, resolución local
  contenida sin symlinks, hashes streaming e inspección real del PDF. Pasan
  29 pruebas focalizadas y las 300 pruebas completas del pod.
- Depende de: QW-03B.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/manifest.py`
  - `pods/historical-corpus-pod/tests/test_manifest.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/models.py`
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
- Secuencia: `create_files` crea solo `test_manifest.py`, `validate` rojo;
  otra llamada crea solo `manifest.py` con la prueba roja y ambos contextos,
  `validate` verde.

Requisitos:

- implementar 5.1 con `yaml.safe_load`;
- máximo 64 KiB de manifiesto;
- `isExactRecord` es obligatorio y `publish` exige `true`;
- separar validación estructural de validación de fuente; esta última usa
  `importsRoot` inyectable, containment y symlink safety;
- hash streaming en bloques;
- validar candidatos contra page count leído con PyMuPDF y validar unicidad,
  rango y conflictos de canonicalización/overrides/regiones por hoja;
- validar los literales, tipos estrictos y valores frontera de todos los campos
  `processing` definidos en 5.1;
- separar `prepare_allowed` de `publish_allowed`, incluidos gates de inventario,
  cobertura y derechos;
- no descargar URLs;
- errores indican campo, no vuelcan manifiesto completo; la fixture usa un PDF
  mínimo generado en memoria por test.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_manifest.py
```

### QW-10A — Fuente PDF, copia canónica y split de pliegos

- [x] Completado: copia canónica verificada y atómica, SHA memoizado con LRU 16,
  candidatos/split deterministas, render RGB orientado, diagnóstico embebido,
  raster dominante, dHash y preview 144 DPI; 11 pruebas específicas y 311 del
  servicio pasan.
- Depende de: QW-09.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/pdf_source.py`
  - `pods/historical-corpus-pod/tests/test_pdf_source.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/manifest.py`
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
- Secuencia: `create_files` crea solo `test_pdf_source.py`, `validate` rojo;
  otra llamada crea solo `pdf_source.py` con prueba roja y ambos contextos,
  `validate` verde.

Requisitos:

- copia canónica temporal + hash + `os.replace`, sin sobrescribir un destino
  con hash diferente;
- abrir solo PDF no cifrado e iterar una página a la vez sin retener pixmaps;
- generar hojas candidatas exactas de 5.2, sin asignar aún número lógico;
- render RGB a DPI y política explícitos, guardando dimensiones reales;
- aplicar rotación antes de hash/ID;
- exponer words embebidas solo para diagnóstico/inventario; nunca convertirlas
  en texto de un bundle publicable;
- exponer metadata del raster dominante y primitivas deterministas de dHash y
  crop que necesita el inventario;
- preview 144 DPI reutiliza la misma lógica de crop;
- verificador SHA memoizado y acotado por
  `(ruta resuelta, tamaño, mtime_ns, sha esperado)`; un cambio de `stat`
  fuerza un hash nuevo; LRU máximo 16 entradas.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_pdf_source.py
```

### QW-10B — Inventario y canonicalización de páginas

- [x] Completado: señales e identificadores deterministas, decisiones humanas de
  duplicados por componentes, secuencia/cobertura, JSONL canónico de hasta 2 MiB
  y carga verificada fail-closed; 48 pruebas específicas y 359 del servicio
  pasan.
- Depende de: QW-09 y QW-10A.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/page_inventory.py`
  - `pods/historical-corpus-pod/tests/test_page_inventory.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/manifest.py`
  - `pods/historical-corpus-pod/src/historical_corpus/pdf_source.py`
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
- En cada implementación se usa prueba roja, `manifest.py`, `pdf_source.py` e
  `ingest_models.py` como máximo; nunca se pasa el plan completo.
- Las pruebas de subllamadas 2/3 usan `page_inventory.py`, `manifest.py` e
  `ingest_models.py` como únicos contextos.

Subllamada 1 — señales por hoja:

1. `create_files` crea solo `test_page_inventory.py`; `validate` queda rojo.
2. `create_files` crea solo `page_inventory.py`; `validate` queda verde.
3. Emitir una fila por hoja candidata en orden PDF/side con raster dominante,
   candidates/label crudos, overrides y límites exactos de 5.1.1.
4. Implementar dHash, embedded text SHA y SimHash con vectores fijos.
5. Los bytes de señal no dependen de expected hash, review ni timestamps.
6. No ejecutar PP-OCRv6, red ni modelos.

Subllamada 2 — duplicados humanos:

1. `semantic_patch` añade solo pruebas de duplicados; `validate` queda rojo.
2. `semantic_patch` modifica solo `page_inventory.py`; `validate` queda verde.
3. Crear candidates/reasons con umbrales exactos, sin excluir automáticamente.
4. Validar par detectado, falso positivo y componentes confirmadas con un
   canonical humano común, incluidos chain y contradicción de overrides.
5. Derivar `exclude_duplicate`, `duplicateOf` y `near_duplicate` exactamente.

Subllamada 3 — secuencia, cobertura y JSONL:

1. `semantic_patch` añade solo pruebas de secuencia/cobertura; `validate` rojo.
2. `semantic_patch` modifica solo `page_inventory.py`; `validate` verde.
3. Ejecutar los ocho pases, flags, breaks, status e índices `1..M` de 5.1.1.
4. Exigir concordancia de cobertura y la excepción scan-only `unknown` solo
   con overrides humanos explícitos.
5. Serializar JSONL canónico con LF, 2 MiB/2000 filas, verificar hash/review y
   devolver páginas solo al quedar cero pendientes.
6. Cubrir saltos/retroceso/labels y correcciones PDF 91/107 con fixtures.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_page_inventory.py
```

### QW-11A — Adapter PP-OCRv6

- [x] Completado: adapter lazy PP-OCRv6 con los tres modelos reales bloqueados,
  prefetch atómico, verificación cerrada antes de construir el motor y parser
  estricto; 47 pruebas focalizadas y 406 pruebas completas pasan.
- Depende de: QW-10A.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/ocr_backend.py`
  - `pods/historical-corpus-pod/tests/test_ocr_backend.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
  - `pods/historical-corpus-pod/pyproject.toml`
- Secuencia: `create_files` crea solo `test_ocr_backend.py`, `validate` rojo;
  otra crea solo `ocr_backend.py` con prueba roja y ambos contextos,
  `validate` verde.

Requisitos:

- import lazy y factory PaddleOCR inyectable;
- modelos exactos, `engine="transformers"` y device explícito;
- documento orientation `false`, unwarping `false` y text-line orientation
  `true`;
- `prefetch_models` inicializa todos los modelos, hace una inferencia mínima y
  escribe `ModelLock` atómicamente con rutas relativas, tamaños y hashes;
- la inferencia normal exige directorios locales y verifica el lock completo
  antes de construir PaddleOCR; no permite descarga implícita;
- parsear arrays paralelos `rec_texts`, `rec_scores`, `rec_polys` y
  `textline_orientation_angles`; este último acepta solo class IDs `0|1` y se
  convierte en `correction180 = classId * 180`;
- devolver `ExtractedLineCandidate` sin decidir layout; exigir polígono de
  cuatro puntos, confianza 0..1 y rechazar longitudes distintas/NaN/inf;
- fallar cerrado si cambia el contrato de salida o un byte del modelo;
- unit tests sin red/pesos y prueba de lock corrupto, archivo extra, ausente o
  cambiado.

Unit tests sin red ni pesos reales:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ocr_backend.py
```

Smoke real posterior, solo después de QW-18A:

```bash
podman compose -f "$CORPUS_COMPOSE" \
  --profile ingest run --rm historical-corpus-ingest \
  ocr-smoke \
  --manifest /imports/madoz-t11.private.yml --imports-root /imports \
  --pdf-page 42 \
  --side full
```

Gate: al menos diez líneas no vacías, cajas válidas y confianza finita.

### QW-11B — Processing fingerprint cerrado

- [x] Completado: builder tipado con `CanonicalPdf`, geometría metadata-only
  contrastada contra el render, proyección completa del lock y vector golden
  exacto; 12 pruebas focalizadas y 418 pruebas completas pasan.
- Depende de: QW-10B y QW-11A.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/processing_fingerprint.py`
  - `pods/historical-corpus-pod/tests/test_processing_fingerprint.py`
- Contexto para prueba: `manifest.py`, `ingest_models.py`, `pdf_source.py`,
  `ocr_backend.py`.
- Contexto para implementación: prueba roja, `manifest.py`,
  `ingest_models.py`, `pdf_source.py`. Codex copia la firma exacta para leer el
  lock desde `ocr_backend.py`; no añade un quinto contexto.
- Secuencia: `create_files` solo prueba, `validate` rojo; `create_files` solo
  implementación, `validate` verde.

Requisitos:

1. Importar, nunca redefinir, `FingerprintPayload` desde `ingest_models.py` y
   exponer la interfaz exacta indicada abajo.
2. Construir cada campo desde objetos ya validados, sin dicts/paths/timestamps
   implícitos ni lectura de derechos.
3. Calcular `leafGeometry` completa y ordenada con la misma geometría/redondeo
   de render, sin rasterizar ni OCRizar.
4. Incluir snapshot canonical, overrides, SHA inventario y la proyección
   `ModelLockFingerprint` completa; tomar versiones reales instaladas de
   PyMuPDF, PaddleOCR, PaddleX, Transformers, Torch y NumPy, además de todas
   las políticas indicadas.
5. Obtener el hash solo mediante `payload.fingerprint()`; no duplicar la
   serialización/fórmula de 5.6.
6. Fijar el vector golden literal
   `sha256:21d527034ae1158ab887870c0a57236edbb3a3331bfbe982eccc0e34d7d70c75`.
7. Probar que cada ingrediente incluido cambia el hash y cada campo excluido
   no lo cambia; rechazar orden/NaN/path/model lock inválidos.

Interfaz que Codex copia literalmente:

```text
build_processing_fingerprint(
  manifest: MadozManifest,
  canonical_pdf: CanonicalPdf,
  page_inventory_sha256: str,
  model_lock: ModelLock,
  software_versions: SoftwareVersions | None = None
) -> tuple[FingerprintPayload, str]
```

`software_versions=None` lee las seis versiones instaladas; el valor inyectado
es un modelo estricto usado solo por tests. El segundo elemento siempre es
`payload.fingerprint()`.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_processing_fingerprint.py
```

### QW-12 — Layout de dos columnas

- [x] Completado: layout provider-neutral estable con columnas/bandas, roles,
  tablas rotadas 90/270, IDs y fórmulas de calidad exactas; 13 pruebas
  focalizadas y 431 pruebas completas pasan.
- Depende de: QW-11A.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/madoz_layout.py`
  - `pods/historical-corpus-pod/tests/test_madoz_layout.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
- Secuencia: `create_files` crea solo `test_madoz_layout.py`, `validate` rojo;
  otra crea solo `madoz_layout.py` con prueba roja e `ingest_models.py`,
  `validate` verde.

Requisitos:

- implementar 5.10;
- entrada independiente del proveedor OCR;
- orden estable ante input desordenado;
- roles de header/footer sin borrar líneas;
- asignar explícitamente `body` a todo remanente y probar que Madoz v1 no
  emite `unknown`;
- derivar el eje `0|90|null` del lado largo de `rec_poly` con tolerancia de 15°,
  combinarlo con `correction180` y transformar de vuelta polígonos de crops
  rotados; las regiones manuales producen `role=table` según 5.10;
- copiar printed page label nullable desde el inventario, sin redetectarlo;
- fórmulas de calidad exactas de 5.10;
- flags `blank`, `low_confidence`, `table_heavy`,
  `mixed_orientation`, `rotation_applied`, `oversize_body_line`;
- probar página izquierda, derecha, bloque transversal, tabla, rotación y
  empate de coordenadas.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_layout.py
```

### QW-13 — Segmentación de entradas y chunks

- [x] Completado: detección Unicode compartida, segmentación determinista por entrada,
  discontinuidades, límites de caracteres/512 IDs, overlap progresivo, confianza
  ponderada y orden canónico; 29 pruebas focalizadas y 460 pruebas completas pasan.
- Depende de: QW-12.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/madoz_chunking.py`
  - `pods/historical-corpus-pod/tests/test_madoz_chunking.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/models.py`
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
  - `pods/historical-corpus-pod/src/historical_corpus/identity.py`
- Secuencia: `create_files` crea solo `test_madoz_chunking.py`, `validate`
  rojo; otra crea solo `madoz_chunking.py` con prueba roja y los tres
  contextos, `validate` verde.

Requisitos:

1. Implementar 5.11 sin importar OCR/PyMuPDF.
2. Exportar la única `detect_entry_title`; probar primer punto/guion,
   delimitador excluido, trim/ratio Unicode y `MALAGA (PROVINCIA DE):`.
3. Devolver `PreparedChunkInput` con IDs preservados; nunca añadir `lineIds` al
   input HTTP.
4. No mezclar entry titles y cortar exactamente por discontinuidad/break.
5. Cortar solo entre líneas por chars/512 IDs; fallar una body sobredimensionada
   y probar 513 líneas cortas.
6. Aplicar overlap exacto/progresivo; probar retirada antigua por chars y que
   cuenta dentro de 512 IDs.
7. Calcular confianza ponderada y los demás campos derivados exactos.
8. Producir resultado idéntico en replays y orden canónico de 5.11.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_chunking.py
```

Commit de grupo después de QW-09, QW-10A, QW-10B, QW-11A, QW-11B, QW-12 y
QW-13:

```text
feat: prepare Madoz scans with traceable OCR
```

### QW-14A — Staging atómico y carga del bundle

- [x] Completado: rutas derivadas y contenidas, límites previos a lectura, JSON
  canónico, reemplazo atómico, cache de páginas fail-closed y loaders tipados con
  validación cruzada; 8 pruebas focalizadas y 468 pruebas completas pasan.
- Depende de: QW-03B y QW-10B.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_staging.py`
- Implementación nueva:
  - `pods/historical-corpus-pod/src/historical_corpus/staging.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
  - `pods/historical-corpus-pod/src/historical_corpus/page_inventory.py`

Secuencia: `create_files` solo para la prueba, `validate` rojo, segunda
`create_files` solo para implementación y `validate` verde.

Requisitos:

- resolver únicamente bajo un `dataRoot` inyectable la estructura exacta de
  5.7, rechazando symlinks, escapes y archivos no regulares;
- comprobar los límites de tamaño de artefactos de 5.3 antes de leer JSON;
- serializar Pydantic en JSON canónico y escribir temporal en el mismo
  directorio seguido de `os.replace`;
- reutilizar un `StagedPage` solo si valida envelope, `pageArtifactHash`,
  fingerprint, SHA PDF y SHA de inventario; corrupción o truncado es cache miss;
- escribir atómicamente `source.json`, `prepared-document.json` y
  `preparation-report.json` sin borrar páginas ya válidas;
- escribir/cargar por separado `OcrEvaluationSample` en la ruta de 5.7 y
  rechazar intercambio de tipos muestra/bundle;
- al cargar un bundle ejecutar todos los validadores cruzados de
  `PreparedDocument`, incluida la reconstrucción JSONL del inventario;
- no importar OCR, PyMuPDF, Qwen, TurboVec ni red;
- probar interrupción antes de `os.replace`, stale fingerprint, JSON corrupto,
  traversal, symlink y bundle/inventario incoherentes.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_staging.py
```

### QW-14B — Procesador puro de páginas Madoz

- [x] Completado: copia canónica verificada, backend OCR único y cerrable,
  procesado body/blank y segundo pase contiguo para regiones 90/270, con layout y
  chunking delegados; 8 pruebas focalizadas y 476 pruebas completas pasan.
- Depende de: QW-10A, QW-11A, QW-12 y QW-13.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_madoz_processor.py`
- Implementación nueva:
  - `pods/historical-corpus-pod/src/historical_corpus/madoz_processor.py`
- Contexto por llamada:
  - creación de prueba: `pdf_source.py`, `ocr_backend.py`, `madoz_layout.py`,
    `madoz_chunking.py`;
  - creación de implementación: prueba roja, `ocr_backend.py`,
    `madoz_layout.py`, `madoz_chunking.py`. Codex copia literalmente las
    firmas necesarias de `pdf_source.py`; no añade un quinto contexto.

Secuencia: `create_files` solo para la prueba, `validate` rojo, segunda
`create_files` solo para implementación y `validate` verde.

Interfaz decidida que Codex entrega literalmente a Qwen:

```text
prepare_source(manifest, imports_root, data_root) -> CanonicalPdf
open_processor(manifest, canonical_pdf, model_cache_root) -> context manager MadozProcessor
MadozProcessor.process_page(inventory_record) -> SourcePageInput
MadozProcessor.build_chunks(metadata, ordered_pages) -> list[PreparedChunkInput]
```

Requisitos:

- encapsular PDF source, un único adapter OCR por proceso, layout y chunker sin
  leer ni escribir staging;
- `prepare_source` verifica/copia el PDF canónico según 5.2;
- `open_processor` valida `ModelLock` antes de construir PP-OCRv6 y libera sus
  recursos al salir;
- `process_page` acepta solo record `include`, hace un crop a la vez, OCR
  principal y segundo pase únicamente por cada región rotada declarada;
- reemplazar dentro de cada región las líneas principales, transformar los
  polígonos de vuelta y producir la `SourcePageInput` exacta de 5.3/5.10;
- ignorar siempre texto embebido como contenido y conservar todo rol no-body
  solo como línea de procedencia;
- `build_chunks` delega en 5.11, respeta orden/breaks y excluye roles no body;
- comportamiento determinista y pruebas con fakes, incluida página blank,
  región girada, excepción OCR y cierre de recursos.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_processor.py
```

### QW-14C — Pipeline reanudable de preparación

- [x] Completado: orquestación bloqueada/no bloqueante, validación previa de
  fuente/inventario/model lock/fingerprint, resume por `StagedPage`, OCR único
  solo para misses, bundle/reporte/source atómicos y deterministas; 13 pruebas
  focalizadas y 481 pruebas completas pasan.
- Depende de: QW-07, QW-09, QW-10B, QW-11B, QW-14A y QW-14B.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_madoz_pipeline.py`
- Implementación nueva:
  - `pods/historical-corpus-pod/src/historical_corpus/madoz_pipeline.py`
- Contexto por llamada:
  - creación de prueba: `manifest.py`, `page_inventory.py`, `staging.py`,
    `madoz_processor.py`;
  - creación de implementación: prueba roja, `page_inventory.py`, `staging.py`,
    `madoz_processor.py`. Codex copia literalmente las firmas del loader de
    manifiesto, del context manager de `locks.py`, del loader del model lock y
    de `build_processing_fingerprint`; no añade contextos.

Cada subllamada escribe solo prueba o implementación. Para implementación se
usan prueba roja, `page_inventory.py`, `staging.py` y `madoz_processor.py`;
Codex copia literalmente las cuatro firmas externas ya indicadas.
Las pruebas de subllamadas 2/3 usan `madoz_pipeline.py`, `ingest_models.py` y
`staging.py` como únicos contextos.

Subllamada 1 — orquestación y orden:

1. `create_files` crea solo `test_madoz_pipeline.py`; `validate` queda rojo.
2. `create_files` crea solo `madoz_pipeline.py`; `validate` queda verde.
3. Validar manifiesto/fuente/inventario/model lock y construir
   `FingerprintPayload`+hash antes del primer OCR.
4. Adquirir el lock exclusivo/no bloqueante antes de raw/staging y mantenerlo.
5. Resolver excluidos sin OCR y procesar cada include en secuencia canónica
   con un solo `MadozProcessor`.
6. Respetar breaks y construir chunks solo tras resolver todas las incluidas.

Subllamada 2 — resume y fallos:

1. `semantic_patch` añade solo pruebas de resume/fallo; `validate` queda rojo.
2. `semantic_patch` modifica solo `madoz_pipeline.py`; `validate` queda verde.
3. Reutilizar solo `StagedPage` cuyo envelope/hash completo valida y recalcular
   una corrupta con warning.
4. Un cambio del payload de procesamiento invalida la página; cambios solo de
   metadatos/derechos/cobertura la reutilizan.
5. Excepción OCR/hash incorrecto/anomalía pendiente no deja bundle parcial;
   nunca importar Qwen/TurboVec.

Subllamada 3 — bundle y reporte:

1. `semantic_patch` añade solo pruebas de ensamblaje; `validate` queda rojo.
2. `semantic_patch` modifica solo `madoz_pipeline.py`; `validate` queda verde.
3. Emitir `PreparedDocument` solo con inventario completo, payload+fingerprint,
   hashes, gate y correspondencia records↔páginas validados.
4. Mapear metadata una sola vez con la tabla de 5.4 y escribir atómicamente
   source, bundle y `PreparationReport` coherente.
5. Regenerar esos tres al cambiar metadata/derechos/cobertura sin re-OCR y
   probar ejecución completa, hueco declarado y determinismo mediante fakes.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_pipeline.py
```

### QW-14D — Pipeline de muestra OCR no publicable

- [x] Completado: selección validada/ordenada de 1..64 refs, resume con el
  mismo `StagedPage`, cortes de chunk para selecciones dispersas y escritura
  exclusiva de `OcrEvaluationSample` no publicable; 14 pruebas del pipeline y
  490 pruebas completas pasan.
- Depende de: QW-14C.
- Archivos existentes escribibles, en llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_madoz_pipeline.py`
  - `pods/historical-corpus-pod/src/historical_corpus/madoz_pipeline.py`
- Contexto de implementación: prueba roja, `ingest_models.py`, `staging.py`,
  `madoz_processor.py`.
- Secuencia: `semantic_patch` solo prueba, `validate` rojo; `semantic_patch`
  solo implementación, `validate` verde.

Requisitos:

1. Añadir `prepare_evaluation_sample(manifest, refs, ...)` con contrato 5.7.1.
2. Validar/ordenar 1..64 refs contra inventario verificado y rechazar
   excluidas, pendientes, repetidas o lado inválido antes de OCR.
3. Mantener el mismo lock, fuente, model lock, fingerprint, procesador único y
   cache `StagedPage` del prepare completo.
4. Procesar/reutilizar solo seleccionadas; no exigir ni crear las restantes.
5. Chunkear corridas consecutivas con breaks de selección sin cambiar páginas
   staged/IDs.
6. Construir, validar y escribir atómicamente solo `OcrEvaluationSample`; no
   crear bundle/reporte ni abrir SQLite/TurboVec.
7. Probar selección dispersa, resume, tampering, ref excluida, límite 64,
   separación bundle/muestra y reutilización posterior por prepare completo.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_madoz_pipeline.py
```

### QW-15A — CLI base, manifiesto e inventario

- [x] Completado: CLI `argparse` con salida/error JSON y códigos reservados,
  validación opcional de fuente y construcción de inventario en ruta derivada
  mediante escritura atómica protegida contra symlinks; 6 pruebas CLI y 496
  pruebas completas pasan.
- Depende de: QW-09 y QW-10B.
- Prueba nueva:
  - `pods/historical-corpus-pod/tests/test_ingest_cli.py`
- Implementación nueva:
  - `pods/historical-corpus-pod/src/historical_corpus/cli.py`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/manifest.py`
  - `pods/historical-corpus-pod/src/historical_corpus/page_inventory.py`

Secuencia: `create_files` solo para la prueba, `validate` rojo, segunda
`create_files` solo para implementación y `validate` verde.

Subcomandos de esta unidad:

```text
historical-corpus-ingest validate-manifest --manifest PATH [--check-source]
historical-corpus-ingest build-inventory --manifest PATH [--output-root PATH]
```

Requisitos:

- usar `argparse`, stdout solo JSON y logs/errores solo stderr;
- reservar códigos 0 éxito, 2 input, 3 rights, 4 lock, 5 processing y
  6 publication;
- `--imports-root` default `/imports`; `validate-manifest` solo abre PDF con
  `--check-source`;
- `build-inventory` permite hash/review pendientes, acepta `--output-root` con
  default `/inventory-output` y aplica literalmente 5.1.1;
- resolver paths con containment/symlink safety y escribir únicamente el JSONL
  derivado mediante temporal + `os.replace`;
- ningún subcomando descarga URLs, modifica manifiesto o publica;
- tests de JSON stdout, stderr, códigos y rutas, sin red ni PDF real.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ingest_cli.py
```

### QW-15B — CLI de modelos, smoke, muestra y prepare

- [x] Completado: `prefetch-models`, `ocr-smoke`, `prepare-sample` y `prepare`
  respetan ownership del lock, descarga exclusiva, muestra no publicable y
  preparación reanudable sin SQLite/TurboVec; 13 pruebas CLI y 503 pruebas
  completas pasan, además de `compileall` y `pip check`.
- Depende de: QW-11A, QW-14D y QW-15A.
- Archivos existentes escribibles, en llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_ingest_cli.py`
  - `pods/historical-corpus-pod/src/historical_corpus/cli.py`
- Contexto de prueba: `cli.py`, `manifest.py`, `ocr_backend.py`,
  `madoz_pipeline.py`.
- Contexto de implementación: prueba roja, `manifest.py`, `ocr_backend.py`,
  `madoz_pipeline.py`. Codex copia literalmente la firma del lock exclusivo
  desde `locks.py`; no añade un quinto contexto.
- Secuencia: `semantic_patch` solo prueba, `validate` rojo; `semantic_patch`
  solo CLI, `validate` verde.

Subcomandos añadidos:

```text
historical-corpus-ingest prefetch-models --manifest PATH
historical-corpus-ingest ocr-smoke --manifest PATH --pdf-page N --side SIDE
historical-corpus-ingest prepare-sample --manifest PATH --pages REFS
historical-corpus-ingest prepare --manifest PATH
```

Requisitos:

- conservar contrato/códigos de QW-15A;
- los cuatro aceptan `--model-cache-root` default `/model-cache/paddlex`;
  smoke, muestra y prepare aceptan `--imports-root` default `/imports`;
- aplicar exactamente el ownership/lock de 4.4: CLI bloquea prefetch/smoke y
  los dos comandos de pipeline no vuelven a adquirir su lock;
- `prefetch-models` es el único comando autorizado a descargar y crea el
  `ModelLock` completo;
- `ocr-smoke` valida fuente/modelos y procesa solo la hoja solicitada sin crear
  bundle ni publicar;
- `prepare-sample` aplica el parser y contrato completo 5.7.1, imprime
  path/hash y nunca produce un archivo aceptable por `publish`;
- `prepare` ejecuta QW-14C, imprime rutas/reporte y nunca abre SQLite/TurboVec;
- tests con fakes cubren lock corrupto, smoke fallido, selección inválida,
  muestra válida/no publicable, resume y JSON de salida.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ingest_cli.py
```

### QW-15C — CLI de publicación y entry point

- [x] Completado: `publish` carga únicamente un `PreparedDocument` seguro desde
  `staging`, aplica los gates antes del servicio, verifica el PDF canónico y
  publica bajo lock con `startup_policy="repair"`; el entry point está instalado,
  las 20 pruebas CLI y las 510 pruebas completas pasan.
- Depende de: QW-06E, QW-07, QW-14C y QW-15B.
- Archivos existentes, primeras llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_ingest_cli.py`
  - `pods/historical-corpus-pod/src/historical_corpus/cli.py`
- Archivo existente, tercera llamada:
  - `pods/historical-corpus-pod/pyproject.toml`
- Contexto de prueba: `cli.py`, `runtime.py`, `locks.py`, `service.py`.
- Contexto de implementación: prueba roja, `runtime.py`, `locks.py`,
  `service.py`. Codex copia la firma exacta del loader tipado desde
  `staging.py`; no añade un quinto contexto.

Subcomando añadido:

```text
historical-corpus-ingest publish --prepared PATH
```

Requisitos:

1. Primera llamada `semantic_patch` modifica solo la prueba y conserva casos
   QW-15A y QW-15B; `validate` falla por comandos ausentes. Segunda modifica solo CLI
   y deja verde. La llamada de `pyproject.toml` ocurre después.
2. `publish` resuelve `--prepared` bajo `{dataRoot}/staging`, rechaza
   symlink/no regular y >128 MiB antes de leer una sola vez.
3. Desde esos bytes valida `PreparedDocument`, payload/fingerprint, hash,
   inventario, records↔páginas, ambos gates y PDF derivado/SHA antes de
   construir modelos; una muestra se rechaza. No relee manifiesto, imports ni
   `source.json`.
4. `publish` adquiere lock exclusivo no bloqueante antes del servicio y lo
   mantiene hasta cerrar; los gates fallan antes de construir modelos.
5. Construir exclusivamente con
   `build_service_from_env(startup_policy="repair")`; esto repara journal o
   divergencia desde SQLite antes de una nueva ingesta.
6. `publish` delega en `ingest_prepared`; Qwen sigue default y deterministic
   conserva el opt-in existente.
7. Devolver JSON/código estable para éxito, input, rights, lock, processing,
   conflicto e idempotent replay; `INDEX_REPAIR_REQUIRED` nunca es éxito.
8. Probar rights/cobertura/API vivo antes de modelos/escrituras, replay sano
   sin cambio y rechazo de muestra.
9. Tercera llamada `semantic_patch` añade solo el script exacto de abajo;
   reinstalar editable y validar tests más `--help`.

```toml
[project.scripts]
historical-corpus-ingest = "historical_corpus.cli:main"
```

Validación tras la primera llamada (rojo esperado) y tras la segunda (verde
obligatorio):

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ingest_cli.py
```

Validación de la tercera llamada:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pip install \
  -e "./pods/historical-corpus-pod[dev,ingest]" && \
/tmp/historical-corpus-madoz-venv/bin/historical-corpus-ingest --help
```

### QW-15D — CLI de reparación offline

- [x] Completado: `repair-index` usa la configuración runtime y el lock exclusivo
  compartido, repara con `startup_policy="repair"`, distingue reparación/no-op
  por generación y devuelve generación, versiones y conteos finales; pasan las
  29 pruebas CLI y las 519 pruebas completas.
- Depende de: QW-15C.
- Archivos existentes escribibles, en llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_ingest_cli.py`
  - `pods/historical-corpus-pod/src/historical_corpus/cli.py`
- Contexto de prueba: `cli.py`, `runtime.py`, `locks.py`, `service.py`.
- Contexto de implementación: prueba roja, `runtime.py`, `locks.py`,
  `service.py`.
- Secuencia: `semantic_patch` solo prueba, `validate` rojo; `semantic_patch`
  solo CLI, `validate` verde.

Añadir exactamente:

```text
historical-corpus-ingest repair-index
```

Requisitos:

1. No aceptar manifiesto, bundle, documento, path de índice ni flags de force.
2. Adquirir el mismo lock exclusivo no bloqueante y mantenerlo hasta cerrar el
   servicio; API vivo devuelve el código de lock sin cargar modelos.
3. Construir solo con `build_service_from_env(startup_policy="repair")` y la
   configuración runtime compartida; nunca re-embed.
4. Si hay journal/divergencia reparable, ejecutar el protocolo 5.8 y devolver
   JSON con `repaired=true`, generación/versiones/counts finales.
5. Si ya está sano, devolver `repaired=false` sin escritura/generación; si la
   autoridad/config embedding es inválida, fallar cerrado y conservar journal.
6. Probar journal tras crash, ID ausente/extra, sano, API vivo, retry y error
   `INDEX_REPAIR_REQUIRED`, siempre con fakes sin Qwen real.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ingest_cli.py
```

Commit de grupo QW-14A, QW-14B, QW-14C, QW-14D, QW-15A, QW-15B, QW-15C y
QW-15D:

```text
feat: add resumable Madoz preparation and publication
```

### QW-16 — Endpoints de procedencia

- [x] Completo (2026-09-03): los tres GET exponen inventario, detalle OCR y
  preview PNG fijo a 144 DPI sin autenticación ni parámetros de render. El
  preview verifica el PDF canónico antes de usar la caché, aplica nombre y
  clave versionados, escritura atómica, defensa frente a symlinks, ETag fuerte
  y 304 exacto; los fallos de procedencia conservan errores estructurados sin
  paths. Pasan las 534 pruebas completas.
- Depende de: QW-06E, QW-08 y QW-10A.
- Archivos existentes escribibles, en llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_api.py`
  - `pods/historical-corpus-pod/src/historical_corpus/app.py`
- Contexto de prueba:
  - `pods/historical-corpus-pod/src/historical_corpus/app.py`
  - `pods/historical-corpus-pod/src/historical_corpus/service.py`
  - `pods/historical-corpus-pod/src/historical_corpus/pdf_source.py`
  - `pods/historical-corpus-pod/src/historical_corpus/models.py`
- Contexto de implementación: prueba roja, `service.py`, `pdf_source.py`,
  `models.py`.
- Secuencia: `semantic_patch` solo prueba, `validate` rojo; `semantic_patch`
  solo app, `validate` verde.

Requisitos:

- tres GET de 5.12;
- handlers sync para trabajo bloqueante;
- preview fijo y seguro con clave versionada por la fórmula de 5.12;
- ETag fuerte/304 exactos de 5.12; probar misma respuesta cacheada, cambio de
  bytes PNG y cambio de `previewPolicyVersion`/versión de PyMuPDF;
- no exponer paths;
- no aceptar parámetros de render;
- mismos errores estructurados;
- pruebas de traversal indirecto mediante row corrupta;
- prueba de hash canónico incoherente;
- endpoints anteriores sin regresión.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_api.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_pdf_source.py
```

Commit:

```text
feat: expose page-level historical evidence
```

### QW-17A — Evaluación OCR reproducible

- [x] Completo (2026-09-03): formato gold JSONL estricto, cobertura exacta de
  `OcrEvaluationSample`, Levenshtein y alineamiento DP deterministas, métricas
  micro de OCR/críticos/boundaries/orden/low-confidence, estratos, gates y
  reporte sin textos completos. Pasan 20 pruebas específicas y las 554
  pruebas completas.
- Depende de: QW-14D.
- Archivos nuevos:
  - `pods/historical-corpus-pod/src/historical_corpus/evaluation.py`
  - `pods/historical-corpus-pod/tests/test_evaluation.py`
- Contexto por llamada: para prueba, `models.py`, `ingest_models.py` y
  `madoz_chunking.py`; para implementación, prueba roja, `models.py`,
  `ingest_models.py` y `madoz_chunking.py`.
- Secuencia: `create_files` crea solo prueba, `validate` rojo por módulo
  ausente; otra `create_files` crea solo módulo, `validate` verde.

Requisitos:

1. Implementar formato/validación gold y métricas OCR exactas de 6.1.
2. OCR recibe un `OcrEvaluationSample`, exige cobertura uno-a-uno del gold con
   `selectedPages` y jamás acepta `PreparedDocument`.
3. Levenshtein local determinista, sin dependencia nueva.
4. Implementar el DP/desempate, `detect_entry_title`, boundaries, error micro
   de críticos, order, estratos y divisiones por cero exactamente como 6.1.
5. JSON report incluye config, timestamp con zona, métricas por clase/fuente y
   pass/fail, con páginas ordenadas por número lógico.
6. No guardar textos completos en logs/report fuera de diferencias acotadas a
   256 caracteres.
7. Probar validadores, `charOffset!=0`, empate DP, todos los umbrales,
   detector compartido, críticos, orden, blank y selección divergente sin
   red/pesos.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_evaluation.py
```

### QW-17B — Evaluación de recuperación

- [x] Completo (2026-09-03): casos JSONL estrictos, allow-list SSRF del API
  local, transporte inyectable sin redirects con timeouts 3/30 s, validación
  lógica↔impresa, matching exacto de targets, Recall@20/Precision@8/MRR@20,
  términos e integridad estructural con cachés por ID. Pasan 57 pruebas de
  evaluación y las 591 pruebas completas.
- Depende de: QW-16 y QW-17A.
- Archivos existentes escribibles, en llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_evaluation.py`
  - `pods/historical-corpus-pod/src/historical_corpus/evaluation.py`
- Contexto de prueba: `evaluation.py`, `models.py`, `ingest_models.py`.
- Contexto de implementación: prueba roja, `models.py`, `ingest_models.py`.
- Secuencia: `semantic_patch` solo prueba, `validate` rojo; `semantic_patch`
  solo módulo, `validate` verde.

Requisitos:

1. Implementar formato, target matching, validación de huecos y métricas
   retrieval exactas de 6.2, incluidos 0 hits/excepciones.
2. Admitir únicamente esquema `http`, puerto `3010`, path base vacío o `/` y
   host literal `127.0.0.1`, `localhost` o `historical-corpus-api`; rechazar
   credenciales, query, fragment y redirects.
3. Aplicar timeout de conexión 3 s y total 30 s por consulta mediante
   transporte inyectable.
4. Ordenar casos por ID y devolver report config/timestamp/métricas/pass-fail
   sin textos completos.
5. Enviar `limit=20` sin filtros de relevancia; probar
   Recall/MRR/Precision/términos/integridad, mapeo exacto
   lógica↔impresa, targets múltiples, huecos, 3xx, timeout y ambas clases de
   host con transporte falso sin red.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_evaluation.py
```

### QW-17C — CLI de evaluación

- [x] Completo (2026-09-03): `evaluate-ocr` y `evaluate-retrieval` cargan
  exclusivamente inputs regulares dentro de sus raíces, rechazan escapes y
  symlinks, escriben reportes atómicos bajo `reports/`, no sobrescriben
  inputs y devuelven 0/5/2 para pass/gate/input. Pasan las 36 pruebas CLI,
  las 57 de evaluación y las 598 pruebas completas.
- Depende de: QW-15D y QW-17B.
- Archivos existentes escribibles, en llamadas separadas:
  - `pods/historical-corpus-pod/tests/test_ingest_cli.py`
  - `pods/historical-corpus-pod/src/historical_corpus/cli.py`
- Contexto de prueba: `cli.py`, `evaluation.py`, `staging.py`.
- Contexto de implementación: prueba roja, `evaluation.py`, `staging.py`.
- Secuencia: `semantic_patch` solo prueba, `validate` rojo; `semantic_patch`
  solo CLI, `validate` verde.

Añadir exactamente:

```text
historical-corpus-ingest evaluate-ocr --sample PATH --gold PATH --report PATH
historical-corpus-ingest evaluate-retrieval --api-base-url URL --cases PATH --report PATH
```

Requisitos:

1. Resolver muestra solo bajo `{dataRoot}/staging`, gold/cases solo bajo
   `importsRoot` y report solo bajo `{dataRoot}/reports`; rechazar symlink,
   no-regular y límites de 5.3/6.1/6.2. Report usa temporal+replace y no
   sobrescribe input.
2. `evaluate-ocr` carga exclusivamente `OcrEvaluationSample`; rechaza bundle,
   selección/gold divergentes y tampering antes de evaluar.
3. `evaluate-retrieval` aplica URL/timeouts y transporte del motor QW-17B.
4. Stdout es resumen JSON, stderr solo logs sin texto completo.
5. Código 0 solo si pasa; fallo de gate usa 5 y input inválido usa 2.
6. Probar ambos comandos, bundle disfrazado, path safety, report atómico y URL
   Compose con fakes.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_ingest_cli.py

/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_evaluation.py
```

Commit:

```text
feat: gate historical OCR and retrieval quality
```

### QW-18A — Entorno y Podman Compose

- [x] Completo (2026-09-03): entorno de ejemplo con import privado y ajustes
  de modelos, anchor compartido por API/ingesta y perfil `ingest` aislado,
  sin puertos ni restart, con mounts y hardening de UID 10001. El Compose y
  su override smoke parsean; la imagen `ingest-runtime` se construye y
  `historical-corpus-ingest --help` se ejecuta correctamente en Podman.
- Depende de: QW-15D y QW-17C.
- Archivos existentes:
  - `pods/historical-corpus-pod/.env.example`
  - `deployment/podman/historical-corpus.compose.yml`
- Contexto:
  - `pods/historical-corpus-pod/Containerfile`
  - `pods/historical-corpus-pod/src/historical_corpus/runtime.py`
  - `deployment/podman/historical-corpus.smoke.compose.yml`
- Herramienta: dos llamadas `semantic_patch` seriales.

Subllamada 1 — entorno documentado:

1. Modificar solo `.env.example`, usando Compose y runtime como contexto.
2. Añadir placeholders, nunca valores reales, para import dir y toda variable
   configurable del anchor siguiente.
3. Conservar nombres/defaults existentes y no añadir secretos, rutas privadas
   ni variables que habiliten repair desde env.
4. Validar `git diff --check` sobre ese archivo antes de continuar.

Validación de la subllamada 1:

```bash
git diff --check -- pods/historical-corpus-pod/.env.example
```

Subllamada 2 — Compose aislado:

1. Modificar solo `historical-corpus.compose.yml`, con Containerfile, runtime y
   smoke override como los tres contextos.
2. Añadir `historical-corpus-ingest` bajo profile `ingest`, imagen/target
   `ingest-runtime`, entrypoint exacto y `command: ["--help"]`.
3. Sin puertos/restart; compartir `/data` y `/model-cache`, montar `/imports`
   read-only y usar ejemplos trackeados si falta la variable.
4. Mantener read-only root, tmpfs endurecido, cap drop, no-new-privileges,
   UID 10001, init y pids limit.
5. Usar el anchor exacto siguiente para que API/publish no diverjan; ingest
   añade PADDLEX_HOME y conserva HF_HOME.
6. No tocar Compose/canario del backend ni socket Podman; el smoke override
   debe seguir parseando sin editarlo.

El anchor común contiene exactamente:

```text
HISTORICAL_CORPUS_DATA_DIR=/data
HISTORICAL_CORPUS_MODEL_BACKEND=${HISTORICAL_CORPUS_MODEL_BACKEND:-qwen}
HISTORICAL_CORPUS_ALLOW_DETERMINISTIC=${HISTORICAL_CORPUS_ALLOW_DETERMINISTIC:-false}
HISTORICAL_CORPUS_MODEL_BATCH_SIZE=${HISTORICAL_CORPUS_MODEL_BATCH_SIZE:-8}
HISTORICAL_CORPUS_MODEL_MAX_LENGTH=${HISTORICAL_CORPUS_MODEL_MAX_LENGTH:-8192}
HISTORICAL_CORPUS_TURBOVEC_BIT_WIDTH=${HISTORICAL_CORPUS_TURBOVEC_BIT_WIDTH:-4}
HISTORICAL_CORPUS_DEVICE=${HISTORICAL_CORPUS_DEVICE:-}
HISTORICAL_CORPUS_EMBEDDING_MODEL=${HISTORICAL_CORPUS_EMBEDDING_MODEL:-Qwen/Qwen3-Embedding-0.6B}
HISTORICAL_CORPUS_RERANKER_MODEL=${HISTORICAL_CORPUS_RERANKER_MODEL:-Qwen/Qwen3-Reranker-0.6B}
HF_HOME=/model-cache/huggingface
```

El API añade su admin token. Ingest añade `PADDLEX_HOME` y el bind de imports.
Ningún valor de publicación puede divergir del anchor usado por el API.

Validación; cada comando es autocontenido porque `validate` no conserva
exports entre procesos:

```bash
env PODMAN_COMPOSE_PROVIDER=podman-compose \
  HISTORICAL_CORPUS_ADMIN_TOKEN=plan-validation-token-not-for-production \
  HISTORICAL_CORPUS_IMPORT_DIR="$PWD/pods/historical-corpus-pod/examples" \
  podman compose -f "$PWD/deployment/podman/historical-corpus.compose.yml" \
  --profile ingest config

env PODMAN_COMPOSE_PROVIDER=podman-compose \
  HISTORICAL_CORPUS_ADMIN_TOKEN=plan-validation-token-not-for-production \
  HISTORICAL_CORPUS_IMPORT_DIR="$PWD/pods/historical-corpus-pod/examples" \
  podman compose -f "$PWD/deployment/podman/historical-corpus.compose.yml" \
  --profile ingest \
  build historical-corpus-ingest

env PODMAN_COMPOSE_PROVIDER=podman-compose \
  HISTORICAL_CORPUS_ADMIN_TOKEN=plan-validation-token-not-for-production \
  HISTORICAL_CORPUS_IMPORT_DIR="$PWD/pods/historical-corpus-pod/examples" \
  podman compose -f "$PWD/deployment/podman/historical-corpus.compose.yml" \
  --profile ingest \
  run --rm historical-corpus-ingest --help
```

### QW-18B — Runbook de preparación y evaluación

- [x] Completo (2026-09-03): runbook Podman fail-closed en diez fases desde
  import privado y SHA del PDF hasta inventario verificado, lock de modelos,
  smoke OCR, muestra/gold de 24 páginas, gate OCR y demostración de resume
  sobre las 71 hojas. No contiene publicación, repair, canario ni ingesta HTTP.
- Depende de: QW-18A.
- Archivo existente:
  - `docs/operations/historical-corpus-rag.md`
- Contexto:
  - `deployment/podman/historical-corpus.compose.yml`
  - `pods/historical-corpus-pod/.env.example`
  - `pods/historical-corpus-pod/src/historical_corpus/cli.py`
- Herramienta: `semantic_patch`.

El runbook usa `CORPUS_REPO`, `CORPUS_COMPOSE` y rutas absolutas, exporta
`PODMAN_COMPOSE_PROVIDER=podman-compose`, exige token e import dir privados y
añade una sección “Preparar sin publicar” con estas diez fases:

1. crear el directorio privado, copiar el PDF fuera de Git y verificar su SHA;
2. crear manifiesto privado con páginas 39–109, cobertura parcial, derechos
   pendientes e inventario/hash pendientes;
3. construir la imagen de ingesta y validar estructura más PDF;
4. ejecutar `build-inventory` montando el mismo directorio además como
   `/inventory-output:Z,U`, sin volver escribible `/imports`;
5. revisar solo flags, corregir `pageOverrides`, regenerar hasta cero anomalías
   sin resolver y fijar hash/status/timestamp de inventario;
6. repetir `validate-manifest --check-source` y comprobar exactamente 71 hojas,
   tramos 32–61/64–97/100–101/104–108 y seis huecos declarados;
7. ejecutar `prefetch-models`, conservar `model-lock.json` y desde entonces
   prohibir descargas implícitas;
8. ejecutar `ocr-smoke` exactamente sobre PDF 39, 41, 42, 52, 60, 68, 69,
   70, 89, 92, 102 y 108, todas `side=full`;
9. ejecutar `prepare-sample --pages` con las 24 refs exactas de R2, transcribir
   gold humano desde facsímiles, ejecutar `evaluate-ocr --sample` y detenerse
   si falla cualquier gate; todavía no ejecutar `prepare` completo;
10. solo tras aprobar R2, ejecutar `prepare` sobre las 71 hojas y repetirlo una
    vez para demostrar resume sin re-OCR de las páginas staged válidas.

La tabla operativa del runbook fija además la correspondencia inmutable:

```text
PDF:     39,41,42,43,47,52,57,60,68,69,70,71,89,90,91,92,102,103,104,105,106,107,108,109
lógica:   1, 3, 4, 5, 9,14,19,22,30,31,32,33,51,52,53,54, 64, 65, 66, 67, 68, 69, 70, 71
```

Validación documental, máximo tres comandos:

```bash
rg -F 'prepare-sample --manifest' docs/operations/historical-corpus-rag.md

rg -F 'PDF:     39,41,42,43,47,52,57,60,68,69,70,71,89,90,91,92,102,103,104,105,106,107,108,109' \
  docs/operations/historical-corpus-rag.md

git diff --check -- docs/operations/historical-corpus-rag.md
```

### QW-18C — Runbook de publicación, operación y rollback

- [x] Completo (2026-09-03): runbook separado de publicación con gates
  humanos, paridad de configuración, backup atómico, publish/API aislados,
  pruebas de health/retrieval/provenance, replay idempotente, reparación de
  journal sobre volumen clonado y rollback recuperable sin `down -v`.
- Depende de: QW-18B.
- Archivo existente:
  - `docs/operations/historical-corpus-rag.md`
- Contexto:
  - `deployment/podman/historical-corpus.compose.yml`
  - `pods/historical-corpus-pod/.env.example`
  - `pods/historical-corpus-pod/src/historical_corpus/cli.py`
- Herramienta: `semantic_patch` posterior sobre el mismo runbook.

Añadir una sección separada “Publicar el corpus parcial” con estas nueve fases:

1. confirmar por escrito derechos y aceptación consciente de cobertura parcial,
   actualizar ambos gates/timestamps en el manifiesto y repetir `prepare` para
   regenerar el bundle sin repetir OCR;
2. comprobar que API y publish comparten todos los parámetros runtime;
3. respaldar el volumen y parar API con `down`, nunca `-v`;
4. ejecutar `publish` y registrar document/index version y generation;
5. levantar solo API, nunca el perfil `ingest` como daemon;
6. probar health, index version, generación, búsqueda, página y preview;
7. ejecutar recuperación desde Compose con
   `--api-base-url http://historical-corpus-api:3010` y casos que no dependan de
   páginas ausentes;
8. probar replay sano y reparación controlada con `repair-index`, incluido un
   journal pendiente simulado; nunca borrar `index.tvim` a mano;
9. documentar rollback a imagen/backup anterior conservando volúmenes.

Prohibido en ambas secciones: `down -v`, publicar el import directory, montar
el socket Podman, exponer un puerto OCR, usar Docker o versionar token, ruta
privada, modelo descargado, PDF, inventario privado o bundle.

Validación documental:

```bash
rg -F 'repair-index' docs/operations/historical-corpus-rag.md

git diff --check -- docs/operations/historical-corpus-rag.md
```

### QW-19A — Manifiesto/inventario de ejemplo e ignores

- [x] Completo (2026-09-03): manifiesto estructural del tomo XI con SHA y
  metadatos reales pero gates pendientes, inventario de formato con dos filas
  totalmente sintéticas y ignores acotados para material privado/runtime sin
  ocultar fixtures PDF de pruebas.
- Depende de: QW-18C.
- Archivos nuevos:
  - `pods/historical-corpus-pod/examples/madoz-t11-malaga-partial.manifest.example.yml`
  - `pods/historical-corpus-pod/examples/page-inventory.example.jsonl`
- Archivo existente posterior, solo si el patrón no existe:
  - `.gitignore`
- Contexto:
  - `pods/historical-corpus-pod/src/historical_corpus/manifest.py`
  - `pods/historical-corpus-pod/src/historical_corpus/page_inventory.py`

Requisitos:

- manifiesto con hash/metadatos reales y `sourceUrl` del registro Google exacto;
- `isExactRecord=true`, pero los derechos permanecen explícitamente pendientes
  de revisar el uso previsto;
- candidatos 39–109, `partial_source`, tramos/huecos exactos, inventario/hash
  pendientes y los overrides/layout conocidos del contrato 5.1;
- el manifiesto puede validarse estructuralmente, pero no puede pasar
  `prepare` ni `publish`;
- inventario de formato con filas sintéticas y todos los campos, no 71 filas
  fingidas ni texto transcrito del libro;
- en llamada separada, ignorar `*.private.yml`, `*.private.jsonl`, imports,
  staging, reports y PDFs en el directorio runtime elegido;
- no ignorar fixtures PDF diminutos dentro de tests si se añadieran;
- no copiar el PDF primario de 145 MB ni el secundario de 209 MB al repositorio.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/historical-corpus-ingest \
  validate-manifest \
  --manifest pods/historical-corpus-pod/examples/madoz-t11-malaga-partial.manifest.example.yml

/tmp/historical-corpus-madoz-venv/bin/python -c '
from pathlib import Path
from historical_corpus.ingest_models import PageInventoryRecord
rows = Path("pods/historical-corpus-pod/examples/page-inventory.example.jsonl").read_text(encoding="utf-8").splitlines()
assert rows
for row in rows: PageInventoryRecord.model_validate_json(row)
'

git status --short
```

El primer comando debe informar “estructura válida; inventario, cobertura y
derechos pendientes; no válido para prepare/publish” con código 0.

### QW-19B — Ejemplos sintéticos de evaluación

- [x] Completo (2026-09-03): ejemplos OCR/retrieval totalmente sintéticos con
  dos casos, límite de entrada, tabla excluida, salto de continuidad y targets
  documento/entrada/página; las pruebas cargan los JSONL versionados mediante
  los parsers productivos y ejecutan ambos cálculos sin red.
- Depende de: QW-19A.
- Archivos nuevos:
  - `pods/historical-corpus-pod/examples/ocr-gold.example.jsonl`
  - `pods/historical-corpus-pod/examples/retrieval-cases.example.jsonl`
- Archivo existente posterior:
  - `pods/historical-corpus-pod/tests/test_evaluation.py`
- Contexto para crear ejemplos:
  - `pods/historical-corpus-pod/src/historical_corpus/evaluation.py`
  - `pods/historical-corpus-pod/src/historical_corpus/ingest_models.py`
- Contexto para parchear prueba: ambos ejemplos, `evaluation.py`,
  `ingest_models.py`.
- Secuencia: `create_files` crea solo ambos ejemplos; `semantic_patch` modifica
  solo `test_evaluation.py` para cargarlos; `validate` prueba los bytes reales.

Requisitos:

- ambos archivos validan contra 6.1/6.2 y tienen al menos dos casos;
- contenido totalmente sintético, sin inventar transcripción del libro;
- incluir boundary terminado en `:`, tabla excluida y continuidad rota;
- incluir recuperación con targets document/entry/page y términos requeridos;
- usar IDs con prefijo `synthetic-`; el manifiesto real no los referencia;
- ninguna query depende de las seis páginas impresas ausentes;
- la prueba abre ambos paths versionados, valida todas las filas con los
  parsers productivos y ejecuta al menos un cálculo OCR y uno retrieval; no
  duplica su contenido dentro del test.

Validación:

```bash
/tmp/historical-corpus-madoz-venv/bin/python -m pytest -q \
  pods/historical-corpus-pod/tests/test_evaluation.py
```

Commit de QW-18A, QW-18B, QW-18C, QW-19A y QW-19B:

```text
chore: operate Madoz ingestion with Podman
```

### QW-20 — Suite completa y revisión

- [ ] Pendiente.
- Depende de: QW-00, QW-01, QW-02, QW-03A, QW-03B, QW-04, QW-05A,
  QW-05B, QW-06A, QW-06B, QW-06C, QW-06D, QW-06E, QW-07, QW-08,
  QW-09, QW-10A, QW-10B, QW-11A, QW-11B, QW-12, QW-13, QW-14A,
  QW-14B, QW-14C, QW-14D, QW-15A, QW-15B, QW-15C, QW-15D, QW-16,
  QW-17A, QW-17B, QW-17C, QW-18A, QW-18B, QW-18C, QW-19A y QW-19B.
- Escrituras: ninguna salvo corrección focalizada aprobada.

Llamada `validate` 1, tres comandos:

```bash
podman build --target test \
  -t localhost/tour-guide-historical-corpus:test \
  pods/historical-corpus-pod

podman run --rm localhost/tour-guide-historical-corpus:test \
  sh -c 'python -m pip check && python -m pytest -q -p no:cacheprovider tests'

podman build --target runtime \
  -t localhost/tour-guide-historical-corpus:local \
  pods/historical-corpus-pod
```

Llamada `validate` 2, tres comandos:

```bash
podman run --rm localhost/tour-guide-historical-corpus:local \
  python -m pip check

podman build --target ingest-runtime \
  -t localhost/tour-guide-historical-corpus-ingest:local \
  pods/historical-corpus-pod

podman run --rm localhost/tour-guide-historical-corpus-ingest:local \
  python -m pip check
```

Llamada `validate` 3, tres comandos autocontenidos:

```bash
env PODMAN_COMPOSE_PROVIDER=podman-compose \
  HISTORICAL_CORPUS_ADMIN_TOKEN=plan-validation-token-not-for-production \
  HISTORICAL_CORPUS_IMPORT_DIR="$PWD/pods/historical-corpus-pod/examples" \
  podman compose -f "$PWD/deployment/podman/historical-corpus.compose.yml" \
  --profile ingest config

env PODMAN_COMPOSE_PROVIDER=podman-compose \
  HISTORICAL_CORPUS_ADMIN_TOKEN=plan-validation-token-not-for-production \
  HISTORICAL_CORPUS_IMPORT_DIR="$PWD/pods/historical-corpus-pod/examples" \
  podman compose -f "$PWD/deployment/podman/historical-corpus.compose.yml" \
  --profile ingest \
  run --rm historical-corpus-ingest --help

bash -euo pipefail -c '
  CORPUS_REPO="$(pwd -P)"
  CORPUS_COMPOSE="$CORPUS_REPO/deployment/podman/historical-corpus.compose.yml"
  CORPUS_SMOKE_COMPOSE="$CORPUS_REPO/deployment/podman/historical-corpus.smoke.compose.yml"
  export PODMAN_COMPOSE_PROVIDER=podman-compose
  export HISTORICAL_CORPUS_ADMIN_TOKEN=plan-validation-token-not-for-production
  export HISTORICAL_CORPUS_IMPORT_DIR="$CORPUS_REPO/pods/historical-corpus-pod/examples"
  project=tour-guide-historical-corpus-smoke
  cleanup() {
    podman compose -p "$project" -f "$CORPUS_COMPOSE" \
      -f "$CORPUS_SMOKE_COMPOSE" down
  }
  trap cleanup EXIT
  podman compose -p "$project" -f "$CORPUS_COMPOSE" \
    -f "$CORPUS_SMOKE_COMPOSE" up -d --build
  ready=0
  for attempt in $(seq 1 120); do
    if curl --fail --silent http://127.0.0.1:3010/health >/dev/null; then
      ready=1; break
    fi
    sleep 1
  done
  test "$ready" = 1
  curl --fail --silent -H "Authorization: Bearer $HISTORICAL_CORPUS_ADMIN_TOKEN" \
    -H "Content-Type: application/json" \
    --data-binary "@$CORPUS_REPO/pods/historical-corpus-pod/examples/malaga-smoke-ingest.json" \
    http://127.0.0.1:3010/v1/ingest >/dev/null
  curl --fail --silent -H "Content-Type: application/json" \
    --data-binary "@$CORPUS_REPO/pods/historical-corpus-pod/examples/malaga-smoke-search.json" \
    http://127.0.0.1:3010/v1/search >/dev/null
  podman compose -p "$project" -f "$CORPUS_COMPOSE" \
    -f "$CORPUS_SMOKE_COMPOSE" down
  podman compose -p "$project" -f "$CORPUS_COMPOSE" \
    -f "$CORPUS_SMOKE_COMPOSE" up -d
  curl --retry 120 --retry-delay 1 --retry-all-errors --fail --silent \
    http://127.0.0.1:3010/v1/index/version >/dev/null
'
```

La suite completa debe incluir explícitamente migración v1, rollback de
migración, replay sano, reparación TurboVec, locks, persistencia y reinicio.
Después Codex:

- inspección del diff;
- revisión de corrección, seguridad, rendimiento, compatibilidad y secretos
  con el skill de code review;
- confirmar que no hay cambios en canario, Narrative, backend o frontend;
- confirmar que el PDF no está tracked;
- confirmar que ninguna prueba se saltó.

Correcciones:

- una falla concreta permite una corrección Qwen acotada;
- una segunda falla del mismo parche permite takeover de Codex;
- una falla de arquitectura detiene la ejecución y actualiza este plan antes
  de seguir.

## 9. Ejecución sobre el PDF real

Esta sección ocurre solo después de QW-20.

### Gate R0 — Material privado

- [ ] Crear un import directory fuera de las rutas trackeadas.
- [ ] Copiar `Diccionario_geográfico_estadístico_his.pdf`.
- [ ] Recalcular y comparar
      `d20c9a01f68bd091490a008433e4f1d709dca370181a20b56ca99bbb31bc01ff`.
- [ ] Crear `madoz-t11.private.yml` desde el ejemplo.
- [ ] Mantener candidatos PDF 39–109, `partial_source`, seis huecos,
      `acceptedForProduct=false` y derechos pendientes.
- [ ] Ejecutar `build-inventory`; revisar solo anomalías, corregir el manifiesto
      y regenerar hasta obtener 71 hojas `include`, ninguna pendiente y orden
      canónico 1–71.
- [ ] Confirmar tramos impresos 32–61, 64–97, 100–101 y 104–108, con
      `continuityBreakBefore` antes de PDF 69, 103 y 105.
- [ ] Congelar SHA del inventario, `inventoryReviewStatus=verified` y timestamp.
- [ ] Ejecutar `prefetch-models`, guardar el lock en el volumen de modelos y
      comprobar todos sus hashes.
- [ ] Verificar que el manifiesto apunta al registro exacto
      `eboNAAAAIAAJ` y conserva atribución Google/Stanford.
- [ ] Registrar la decisión humana sobre uso previsto y condiciones.
- [ ] Solo una persona autorizada puede cambiar los gates. Si aprueba derechos,
      debe fijar juntos `rights.status=reviewed_reusable`,
      `rights.verifiedAt=<timestamp con zona>` e
      `isExplicitlyReusable=true`; si los rechaza, usa
      `reviewed_not_reusable`, timestamp y booleano `false`.
- [ ] La aceptación independiente de cobertura exige
      `coverage.acceptedForProduct=true` y `coverage.acceptedAt=<timestamp con
      zona>` sin alterar `partial_source`, tramos ni huecos.

Si no se completan ambos gates humanos, continuar solo hasta preparación y
evaluación OCR local; no publicar.

### Gate R1 — Smoke y calibración OCR del piloto Málaga

Ejecutar `ocr-smoke` con la selección explícita:

```text
PDF 39, 41, 42, 52, 60, 68, 69, 70, 89, 92, 102 y 108; side=full
```

Cubre:

- obispado, provincia, Hoya/partido y ciudad;
- límite real `MALAGA (PROVINCIA DE):`;
- los tres tipos de hueco/continuidad;
- narrativa, tabla normal, tabla girada completa y regiones giradas parciales.

Aceptación:

- 12 crops físicos `full`; al preparar, su número lógico procede únicamente
  del inventario, no del número PDF;
- cero crashes;
- todas las cajas válidas;
- `textSource=ppocrv6` en todas;
- regiones table se conservan en procedencia pero no entran en chunks; el
  cuerpo bajo la tabla de PDF 41 y bajo la tabla de PDF 60 sí entra;
- PDF 52 se gira 90° completo; PDF 42 y 70 ejecutan segundo pase regional y
  sus polígonos vuelven a coordenadas de página;
- revisión visual humana de las 12 páginas y sus previews;
- el piloto usa exactamente 300 DPI; la capa Google queda fuera del pipeline
  publicable y solo se conserva como evidencia diagnóstica del PDF;
- cualquier cambio futuro de modo, umbral o DPI cambia el fingerprint y exige
  repetir desde R1, no una elección manual dentro de este gate.

`ocr-smoke` no crea bundle ni toca SQLite/TurboVec. Sus artefactos diagnósticos
no se publican.

### Gate R2 — Gold de 24 páginas lógicas

- [ ] Crear una muestra no publicable, sin preparar las otras 47 hojas:

```bash
historical-corpus-ingest prepare-sample \
  --manifest /imports/madoz-t11.private.yml \
  --pages 39:full,41:full,42:full,43:full,47:full,52:full,57:full,60:full,68:full,69:full,70:full,71:full,89:full,90:full,91:full,92:full,102:full,103:full,104:full,105:full,106:full,107:full,108:full,109:full
```

- [ ] Verificar la correspondencia exacta antes de transcribir:

```text
PDF:     39,41,42,43,47,52,57,60,68,69,70,71,89,90,91,92,102,103,104,105,106,107,108,109
lógica:   1, 3, 4, 5, 9,14,19,22,30,31,32,33,51,52,53,54, 64, 65, 66, 67, 68, 69, 70, 71
```

- [ ] Transcribir ground truth humano.
- [ ] Ejecutar
      `evaluate-ocr --sample /data/staging/.../evaluation-samples/<hash>.json
      --gold /imports/madoz-t11.gold.private.jsonl
      --report /data/reports/madoz-t11-ocr-report.json`.
- [ ] Superar todos los gates de 6.1.
- [ ] Ajustar solo parámetros versionados; cualquier ajuste cambia
      fingerprint.

Si falla, no ejecutar `prepare` completo. La muestra conserva/reutiliza solo
sus 24 `StagedPage`. Gold se transcribe solo desde el facsímil y no contiene
respuestas supuestas para impresas 62–63, 98–99 o 102–103.

### Gate R3 — Preparación cerrada del corpus Málaga parcial

- [ ] Preparar exactamente las 71 hojas `include` del inventario PDF 39–109.
- [ ] Reutilizar las 24 páginas staged de R2 si sus envelopes siguen válidos;
      procesar solo las 47 restantes y rehacer chunking sobre el conjunto.
- [ ] Cero páginas fallidas.
- [ ] Cero `oversize_body_line`; no aceptar truncado ni chunks inválidos.
- [ ] Revisar todas las páginas low quality.
- [ ] Confirmar `textSource=ppocrv6`, SHA de inventario y fingerprint únicos.
- [ ] Confirmar que ningún chunk cruza los breaks antes de lógicas 31, 65 y 67
      —PDF 69, 103 y 105—.
- [ ] Confirmar que tablas quedan en procedencia y fuera de chunks.
- [ ] Confirmar que documento, reporte y bundle muestran `partial_source`, los
      cuatro tramos observados y los seis huecos.
- [ ] Confirmar número de entradas/chunks razonable y que obispado, provincia,
      Hoya/partido y ciudad tienen entradas separadas cuando corresponde.

### Gate R4 — Publicación aislada

Precondiciones:

- derechos con `status=reviewed_reusable`, `verifiedAt` con zona e
  `isExplicitlyReusable=true` por decisión humana;
- cobertura parcial comprendida, con `acceptedForProduct=true` y `acceptedAt`
  con zona por decisión humana;
- API detenido;
- backup recuperable del volumen;
- backend Qwen real;
- deterministic desactivado;
- bundle cerrado respecto de sus 71 hojas, sin llamarlo tomo/artículo completo,
  con fingerprint e inventario conocidos.

Secuencia:

```bash
CORPUS_REPO="$(git rev-parse --show-toplevel)"
CORPUS_COMPOSE="$CORPUS_REPO/deployment/podman/historical-corpus.compose.yml"
export PODMAN_COMPOSE_PROVIDER=podman-compose
export HISTORICAL_CORPUS_ADMIN_TOKEN="REEMPLAZAR_CON_TOKEN_PRIVADO"
export HISTORICAL_CORPUS_IMPORT_DIR="REEMPLAZAR_CON_RUTA_ABSOLUTA_PRIVADA"

podman compose -f "$CORPUS_COMPOSE" down

podman compose -f "$CORPUS_COMPOSE" \
  --profile ingest run --rm historical-corpus-ingest \
  publish --prepared /data/staging/.../prepared-document.json

podman compose -f "$CORPUS_COMPOSE" \
  up -d historical-corpus-api
```

Aceptar solo si:

- publish devuelve JSON de éxito;
- API healthy;
- el primer publish cambia `indexVersion` una vez;
- documento, páginas, líneas y chunks cuadran;
- replay exacto sano no duplica ni cambia `generation`/`indexVersion`;
- en un clon desechable del volumen, una reparación simulada con journal o ID
  TurboVec ausente ejecutada mediante `repair-index`, con autoridad SQLite
  completa, conserva `indexVersion`, aumenta `generation` una vez y vuelve a
  arrancar el API en `verify`; no se corrompe el volumen aceptado;
- búsqueda filtrada por `documentIds` funciona;
- preview coincide con página/boxes;
- reinicio conserva todos los datos.

### Gate R5 — Recuperación

- [ ] Crear al menos 20 consultas humanas sobre Málaga en el tomo XI,
      incluyendo provincia, obispado, ciudad, caminos, economía y población.
- [ ] Ninguna query/relevancia depende de las seis páginas impresas ausentes.
- [ ] Ejecutar evaluación desde el contenedor de ingesta contra
      `http://historical-corpus-api:3010`.
- [ ] Superar Recall@20, MRR e integridad.
- [ ] Hacer spot-check humano de ocho resultados.
- [ ] Confirmar que resultados/documento siguen exponiendo `partial_source` y
      los huecos, incluso cuando la respuesta es buena.
- [ ] Registrar latencia y memoria como métricas informativas.

### Gate R6 — Compatibilidad scan-only con tomo XVI (posterior)

No bloquea el producto Málaga ni la decisión R7. Demuestra después que el
mismo pipeline soporta una fuente sin capa OCR y con pliegos dobles:

- [ ] crear manifiesto privado del tomo XVI con su gate BNE;
- [ ] usar `textMode=ocr`, `splitSpreads=true`, inventario canónico y candidatos
      6–10, 171–173, 338–339;
- [ ] declarar `coverage.status=unknown`, statement descriptivo,
      `observedPrintedRanges=[]`, `missingPrintedPages=[]`,
      `acceptedForProduct=false` y `acceptedAt=null`; no inventar números
      impresos ni intentar publicar;
- [ ] como no existe texto embebido para inferir etiqueta, resolver las 20
      `label_missing` con overrides humanos explícitos: `6-left` es
      `exclude_nonbody` por bleed-through y las otras 19 hojas son `include`.
      Usar exactamente este bloque, sin `normalizedPrintedLabel`:

```yaml
pageOverrides:
  - {pdfPage: 6, side: left, canonicalStatus: exclude_nonbody, reason: Hoja de bleed-through no publicable verificada visualmente}
  - {pdfPage: 6, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 7, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 7, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 8, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 8, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 9, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 9, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 10, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 10, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 171, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 171, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 172, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 172, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 173, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 173, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 338, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 338, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 339, side: left, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
  - {pdfPage: 339, side: right, canonicalStatus: include, reason: Hoja scan-only incluida tras revisión visual}
```

- [ ] congelar un inventario verificado de 20 records/19 include, etiquetas
      nulas, sin pending; `candidate_range_break` y
      `continuityBreakBefore=true` aparecen en `171-left` (lógica 10) y
      `338-left` (lógica 16);
- [ ] anotar regiones rotadas en `8-left`, `8-right`, `172-left`, `172-right`
      y `173-right`; no inventar rotación en `173-left` ni girar el pliego;
- [ ] partir de 150 DPI y justificar con smoke cualquier upscale;
- [ ] ejecutar `prepare-sample` sobre las 19 refs include, superar smoke,
      trazabilidad y resume; no crear `PreparedDocument` ni publicar el tomo.

### Gate R7 — Decisión sobre canario

No se modifica canario automáticamente.

La decisión requiere:

- R0–R5 completos; R6 es evidencia adicional opcional;
- revisión de calidad humana;
- latencia/memoria aceptables;
- runbook de rollback probado;
- reconocimiento explícito de que el corpus Málaga disponible es parcial;
- autorización explícita del usuario para integrar.

## 10. Estrategia de commits

Commits previstos:

1. `chore: add isolated Madoz ingestion runtime`
2. `feat: persist page-level provenance for historical corpus`
3. `feat: serialize corpus publication with runtime locks`
4. `feat: prepare Madoz scans with traceable OCR`
5. `feat: add resumable Madoz preparation and publication`
6. `feat: expose page-level historical evidence`
7. `feat: gate historical OCR and retrieval quality`
8. `chore: operate Madoz ingestion with Podman`

Reglas:

- staging explícito por rutas;
- revisar `git diff --cached` antes de cada commit;
- no incluir archivos ajenos/untracked;
- no hacer push salvo solicitud explícita;
- no reescribir los commits de baseline ya existentes en la rama;
- si un grupo no queda verde, no se commitea.

## 11. Rollback

Código:

- volver a la imagen API anterior;
- conservar rama y commits para diagnóstico.

Datos:

- no usar `down -v`;
- conservar copia/backup del volumen antes de R4;
- una publicación fallida antes del commit SQLite no deja documento/journal;
- si SQLite confirma y TurboVec/finalización falla, queda un journal: mantener
  API detenido y ejecutar `repair-index`; un replay sano nunca se usa como
  reparación implícita;
- la reparación reemplaza todo TurboVec solo cuando embeddings, IDs, count y
  hash de autoridad SQLite validan y finaliza con la generación target del
  journal;
- si falta esa autoridad SQLite, no re-embebe ni improvisa: se restaura el
  backup del volumen;
- si la verificación posterior falla, detener API y restaurar el backup del
  volumen completo, no editar tablas a mano.

OCR:

- los bundles preparados son derivados;
- pueden regenerarse con otro fingerprint;
- nunca se mezclan páginas de fingerprints distintos;
- el PDF canónico no se borra automáticamente.

## 12. Fuera de alcance

- integración con Narrative;
- conexión desde backend o frontend;
- canario o tráfico real;
- 16 tomos;
- descarga automática desde internet;
- crawling;
- corrección OCR generativa;
- traducción;
- extracción semántica con LLM;
- geocodificación/QIDs automáticos;
- tablas estructuradas;
- búsqueda de imágenes;
- UI de administración;
- scheduler/queue;
- servicio OCR permanente;
- GPU como requisito;
- Kubernetes;
- Docker Compose;
- borrado o sustitución de documentos publicados.

## 13. Definición de terminado

### Código terminado

- [ ] QW-00, QW-01, QW-02, QW-03A, QW-03B, QW-04, QW-05A, QW-05B,
      QW-06A, QW-06B, QW-06C, QW-06D, QW-06E, QW-07, QW-08, QW-09,
      QW-10A, QW-10B, QW-11A, QW-11B, QW-12, QW-13, QW-14A, QW-14B,
      QW-14C, QW-14D, QW-15A, QW-15B, QW-15C, QW-15D, QW-16, QW-17A,
      QW-17B, QW-17C, QW-18A, QW-18B, QW-18C, QW-19A, QW-19B y QW-20
      completos.
- [ ] Suite completa verde en host/imagen según corresponda.
- [ ] API e ingest images construyen con Podman.
- [ ] `pip check` verde.
- [ ] Migración v1→v2 probada.
- [ ] Contratos legados sin regresión.
- [ ] Bloqueo impide publicación con API vivo.
- [ ] Prepare es reanudable y no toca el índice.
- [ ] Inventario determinista, hasheado y sin anomalías pendientes.
- [ ] Publish es idempotente y exige derechos más aceptación de cobertura.
- [ ] Procedencia página/línea/bbox recuperable.
- [ ] Preview seguro.
- [ ] Evaluaciones deterministas.
- [ ] Sin secretos, PDFs ni datos privados en Git.
- [ ] Sin cambios de canario.
- [ ] Diff revisado.

### POC técnico terminado sin publicación

- [ ] R0..R3 completos sobre las 71 hojas Málaga del tomo XI.
- [ ] PP-OCRv6 CPU aprobado con gold; Google OCR es solo baseline diagnóstico.
- [ ] Bundle preparado muestra `partial_source` y los seis huecos.
- [ ] Gates OCR aprobados y resume probado.

### Producto Málaga terminado

- [ ] Derechos y cobertura parcial aceptados expresamente por una persona.
- [ ] R4–R5 completos con Qwen/TurboVec reales, persistencia y rollback.
- [ ] Las consultas Málaga de R5 superan gates y revisión humana.
- [ ] La entrada provincial iniciada en PDF 41 conserva texto, páginas y
      previews correctos.
- [ ] Ninguna superficie presenta el corpus como íntegro ni responde desde las
      páginas impresas ausentes.

### Compatibilidad scan-only terminada

- [ ] R6 completo con una muestra del tomo XVI; no bloquea Málaga.

### Listo para canario

- [ ] R7 aprobado explícitamente.

Mientras falte la aprobación del uso/derechos de la digitalización, el máximo
estado permitido es:

```text
code_complete_prepared_not_published
```
