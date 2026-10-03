# 07 · Limpieza del backend

Estado: **7.1 hecho el 3 de octubre** (rama `cleanup/7-1-dead-code`; etiqueta de recuperación `archive/pre-cleanup-20261001`); el resto de los borrados (7.2, 7.3, 7.4, 7.8) espera tu decisión; informe en [`resultados/07-limpieza.md`](resultados/07-limpieza.md) · Depende de: [01](01-fase0-backend-base.md). Es preferible hacerlo **después** de [04](04-regeneracion-y-publicacion.md), para no mover código mientras se regenera el catálogo; los pasos 7.1 y 7.9 pueden adelantarse.

Los anexos de `anexos/` se generaron con `anexos/reach.py`, un grafo estático de
`import`, `require`, `import()` literal, `require.resolve` y `jest.mock`, más 5 aristas
de procesos lanzados. Contiene:

- `reachability-prod-core.txt`: el núcleo de producción (servidor piloto + cadena Europa), 136 archivos y 36.752 líneas.
- `reachability-a-pilot-essential.txt`: el subconjunto del servidor en modo piloto, 75 archivos y 20.681 líneas.
- `reachability-b-pipeline-only.txt`: lo que solo usa el pipeline de lote (16 archivos).
- `reachability-dev-legacy-only.txt`: solo el camino de desarrollo y el antiguo, 62 archivos y 10.262 líneas.
- `reachability-c-tests-only-sources.txt`: código no de prueba al que **solo** llegan las pruebas (96 archivos, 29.554 líneas). De ellos, 90 también los usan scripts de experimento.
- `reachability-c-tests-exercising-only-dead-code.txt`: pruebas que solo ejercitan código muerto.
- `reachability-d-unreachable.txt`: inalcanzable desde el servidor, el pipeline y las pruebas; solo lo usan scripts de experimento (51 archivos, 8.873 líneas).

Regenerarlos antes de borrar nada:
`REACH_OUT=<scratch> python3 docs/plans/20261001-audio-paradas-ui-backend/anexos/reach.py`.
Hay un falso positivo: `scripts/build-narrative-assets.cjs` sí se usa (`npm run build`, `predev`).

## Reglas

- **Antes de borrar:** crear la etiqueta `archive/pre-cleanup-20261001`, que sirve de recuperación. **Borrar requiere autorización del usuario**, con la lista exacta por bloque.
- **Cada bloque de borrado es un commit** que pasa `scripts/check-all.sh` ([01](01-fase0-backend-base.md) §3.1), el arranque del servidor en modo piloto y un `--dry-run` del pipeline de lote.
- No tocar `backend/tmp`, los datos de las etapas ni nada que lea un script de producción sin comprobarlo antes en `reachability-prod-core.txt`.

## 7.1 Experimentos y código muerto (bajo riesgo)

1. **Scripts de experimento** en `backend/scripts/validation/`: 47 scripts + 4 `validate-phase*.sh` (lista en `reachability-d-unreachable.txt`). Eliminarlos junto con sus 28 entradas en `backend/package.json` → `scripts`. Las 19 restantes no están conectadas.
2. **Fuentes solo alcanzables desde pruebas** (`reachability-c-tests-only-sources.txt`): `Autonomous*`, `NarrativePilot*`, `NarrativeMadrid*`, `Editorial*V3–V7`, `NarrativeBenchmark*`, `NarrativeCanaryV8`, `NarrativeUserCanaryV8`, `NarrativeRunStateV8`, `TourQualityEvaluator` y otros. Eliminarlas junto con sus pruebas (`reachability-c-tests-exercising-only-dead-code.txt`, 75 archivos, 12.806 líneas).
3. **`prisma/seed.ts`**, `scripts/audit/multi-route-overlap.ts` y `src/services/poi/EditorialEvaluationInputV3.ts`: confirmar con el usuario si el seed se usa en desarrollo.
4. **Resultado esperado:** unas 38.000 líneas de código y 12.800 de pruebas menos. Las suites que fallan sobre módulos muertos (`AutonomousNarrativePilotV1`, `NarrativePilotDeepSeekV1`, `NarrativeCalibrationV6`) desaparecen.

## 7.2 Camino antiguo y generación desde la app (decisión del usuario)

**Situación:**

- **Camino antiguo:**
  - `POST /tours/generate` → `orchestrationService.ts` (2.491 líneas) → `NarrativeBuilder` → `llm-pod` (Ollama), más `verification-pod`, `ConceptDiscoveryService` y `passes`;
  - tablas `PoiCache`, `PoiNarrationCache`, `CityConceptCache`, `TourConcept`, `EnrichmentCache` y `VoiceReferenceAudio`.
- **Generación desde la app:** `GenerationJobService` → `MultilingualTourGenerator` → `CodexTourProcess` con **Codex CLI y cuenta de ChatGPT** (`billing:'ChatGPT quota'`, `narrative-codex-live-v8.ts:25`). Es un riesgo de condiciones de uso y de escalado, y no puede ejecutarse en servidor.
- **En producción**, la generación solo se hace por lotes, de forma offline.

**Opciones:**

- **(A, recomendada)** Eliminar el camino antiguo completo y la generación desde la app. El único camino es el lote.
  - Borra `reachability-dev-legacy-only.txt` (62 archivos), las rutas `/tours/generate*`, `/generation-jobs*`, `/cities`, `/passes` y `/tours/:id/audio` (POST), y el frontend antiguo de [06](06-ui.md) F.
- **(B)** Conservar la generación desde la app detrás de un indicador de desarrollo y eliminar solo el camino antiguo.

**Tras la opción A:** migración Prisma para eliminar las tablas antiguas y las creadas en tiempo de ejecución (`poi_enrichment_cache`, `tour_quality_review_queue`), **solo después de comprobar en producción** que están vacías o no se usan, y con un `pg_dump` previo.

## 7.3 Sacar el pipeline de producción de `scripts/validation/`

- **Son 12 archivos de producción** con nombres de experimento:
  - `narrative-user-canary-v8.ts`, de 2.343 líneas: el trabajador de preparación real;
  - `narrative-{codex-live,author-canary-material,tour-welcome,astra-tour-batching,codex-author,codex-auditor,temporal-rule,audit-calibration,writer-benchmark,writer-briefing-pilot}-v8.ts`;
  - `narrative-blueprint-author-v8.ts`, que solo usa la app (desaparece con 7.2-A).
- **Destino:** `backend/src/pipeline/` con nombres honestos (por ejemplo `prepare-blueprint.ts`, `author-material.ts`, `welcome-prompt.ts`, `combined-prompt.ts`, `temporal-rule.ts`).
- **Hay que actualizar** quién los lanza:
  - `deepseek-europe-prepare.cjs:77` y `deepseek-batch-prepare.cjs:63`;
  - `CodexTourProcess.ts:27-28` y `CodexTourGenerator.ts:21` (si siguen);
  - `tsconfig.generation-worker.json` y `scripts/build-narrative-assets.cjs`.
- **Cuidado:** `text-inputs-lock.json` liga el sha del **prompt**, no la ruta. Mover sin cambiar el contenido no debe invalidar lotes. Comprobarlo reanudando un lote terminado con `--dry-run`.

## 7.4 Unificar los dos juegos de scripts de lote

- España (`deepseek-batch-*`) y Europa (`deepseek-europe-*`) son casi copias (los dos `prepare` difieren en 167 líneas). También se solapan `tour-audio-batch.cjs` y `deepseek-europe-audio.cjs`.
- **Cambio:** un único juego parametrizado (`batch-prepare`, `batch-text`, `batch-translate`, `batch-audio`, `batch-publish`) con `--stage` y un manifiesto. Puede tomar como plantilla la herramienta de [04](04-regeneracion-y-publicacion.md).
- Conservar los antiguos hasta que el nuevo haya producido una ciudad completa de punta a punta.

## 7.5 Versiones en paralelo dentro del núcleo (riesgo medio; incremental)

- **Pares vivos a la vez:** `NarrativeSources` V6+V7, `NarrativeDossier` V6+V8, `NarrativeArcArchitect` V6+V8, `NarrativeEditorialAgents` V6+V8 y `NarrativeEditorialWorkflow` V6+V8. El núcleo tiene 18 archivos V6 (8.146 líneas), 3 V7, 1 V5 y 40 V8.
- **Cambio, por pares:**
  1. identificar qué exporta la V6 que la V8 usa;
  2. moverlo a un módulo sin sufijo;
  3. borrar el resto de la V6.

  Un commit por par, con pruebas.
- **Servidor piloto más ligero:** hoy carga 38 archivos de `poi` (16.947 líneas) a través de `pilot.ts` → `TourBlueprint.ts` → `NarrativeArcArchitectV8`, `NarrativeRoutePlanningV8` y `TourDestinationResolver`.
  - Extraer un `TourBlueprintRepository` mínimo (`isCurrent`, `findById`) y `SourceCredits` sin importar el código de planificación.
  - **Medir la memoria** antes y después. Es relevante por el incidente del 1 de octubre.

## 7.6 `backend/tmp` (18 GB, 43.467 archivos)

- **Datos vivos, que no son temporales:**
  - `static-osm-fallback` (12 GB; valor por defecto en `StaticOsmPoiFallback.ts:80`);
  - `pilot-batch-europe-20260920` (3,9 GB);
  - `narrative-v8`, `source-control`, `osm-cache` (`OverpassQueryCache.ts:96`) y `blueprint-inputs`.

  **Cambio:** variable `TOUR_DATA_DIR`, por defecto `backend/tmp` para no romper nada, y documentarla. Moverlos es opcional y decisión del usuario.
- **60 entradas (874 MB) que no referencia ningún código:** proponer al usuario archivarlas fuera del repo. No borrarlas sin su visto bueno.

## 7.7 Documentación

- **Solo describen el camino antiguo:**
  - `ARCHITECTURE.md` (`:17` `/tours/generate`, `:35` llm-pod/Ollama, `:46` Kokoro);
  - `tour-generation-architecture.html`;
  - `docs/architecture/{tts-pipeline,voice-consistency,vram-budget,narration-pipeline,tour-selection,integration-architecture,containerization-strategy,tour-guide-app,README,tour-quality-landmark-tiering,poi-selection-rework-plan}.md`.
- **Siguen siendo correctos:** `historical-corpus-service-v1.md`, `internationalization-plan.md` y `tour-quality-rubric.md`.
- **Cambio:**
  - reescribir `ARCHITECTURE.md` con el sistema actual: frontend Next.js en modo piloto, API piloto de solo lectura, pipeline de lote DeepSeek, VoxCPM2 local, publicación por paquetes, texto hablado y enlaces;
  - mover los documentos antiguos a `docs/archive/`, con una línea «Histórico: describe el pipeline anterior a septiembre de 2026»;
  - el `docs/README.md` actual enlaza archivos que no existen (`architecture/system-overview.md`): corregirlo.
- **No mover los documentos que el código lee en tiempo de ejecución:**
  - `docs/tours/regla-editorial-fechas-audioguias.md`, que lee `narrative-temporal-rule-v8.ts`;
  - `docs/operations/narrative-author-context-pack-20260906/malagueta-oneshot.md`, que lee `narrative-codex-live-v8.ts:48`;
  - los recursos que usa `build-narrative-assets.cjs`.

  Mejor aún, copiarlos a `backend/src/pipeline/assets/` y leerlos desde ahí.

## 7.8 Pods

- **`voxcpm-pod`:** se usa como `.venv` local, no como contenedor. Documentarlo y revisar si su `Dockerfile` sigue sirviendo.
- **`historical-corpus-pod`:** solo con `--rag=on`; producción usa `--rag=off`. Conservarlo y documentarlo.
- **Con 7.2-A se eliminan** `llm-pod` y `verification-pod`.
- **Se eliminan siempre** `tts-pod` (Kokoro, 336 MB), `description-pod` y `supabase-pod`. También sus entradas en `docker-compose*.yml`, `podman-compose.yaml` y `scripts/dev-*.sh`.

## 7.9 Pruebas y CI

0. **Fallos conocidos:** son 7 suites (lista en [01](01-fase0-backend-base.md) §1). `CodexTourGenerator` desaparece con 7.2-A (o se arregla con 7.2-B), y las 3 de módulos muertos se eliminan en 7.1. Actualizar `scripts/check-all.known-failures.txt` en cada paso.
1. **Arreglar las 3 suites del núcleo que fallan:** `NarrativeEditorialAgentsV6` y `EditorialStructuredLlmV6`, por nombres de modelo que han cambiado, y `LandmarkTiering`. Revisar si la prueba o el código está desactualizado y explicarlo en el commit.
2. **Conectar las pruebas que no se ejecutan:**
   - `npm run test:admin`, para las de Python de `scripts/admin`;
   - `npm run test:node`, para las de `node --test`;
   - `npm run typecheck`, que incluya las pruebas y el pipeline (hoy no se comprueban sus tipos).
3. **CI en GitHub Actions** (`.github/workflows/ci.yml`, el remoto es `github.com/jesusotero1234/tour-guide-app`):
   - backend: `tsc`, Jest, `test:admin` y `test:node`;
   - voxcpm-pod: solo pruebas de CPU (normalizador, `prepare_input`, `sanitize`), con un venv mínimo sin torch si es posible;
   - frontend: `tsc`, lint y build.

   **Subir el workflow requiere autorización del usuario.**

## Criterios de aceptación

- [ ] Etiqueta de archivo creada. Bloques 7.1–7.4 confirmados con `check-all.sh` en verde.
- [ ] Decisión 7.2 tomada por el usuario y aplicada.
- [ ] `ARCHITECTURE.md` describe el sistema real y los documentos antiguos están archivados.
- [ ] CI funcionando en GitHub.
- [ ] Informe en `resultados/07-limpieza.md` con las líneas eliminadas, la memoria del servidor piloto antes y después, y las suites arregladas.
