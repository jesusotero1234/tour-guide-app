# QA V8: selección esencial y búsqueda fiable — entrega para revisión por otro LLM

Fecha: 2026-08-14

Estado: **implementación canary corregida tras la primera, segunda y tercera revisión (Request
changes). La tercera revisión añadió la política de maxlag HTTP-200, el contrato de curador
(curator_contract_failed), la corroboración con dos citas, las sustituciones de un solo uso, los
spans sin pérdida de contenido y la limpieza CRLF del diff. El primer canary vivo de Málaga falló por
maxlag de Wikidata y quedó registrado con artefacto; pendiente re-ejecutarlo tras el fix y la
revisión final de este documento por otro LLM. El flujo productivo por defecto permanece intacto.**

## 1. Diagnóstico (origen del plan)

Dos fallos independientes detectados en `docs/working/62-seleccion-esencial-busqueda-v8-plan.md`:

1. **La ruta optimiza proximidad antes que relevancia editorial.** Un monumento céntrico puede
   satisfacer la cuota de flagships y desplazar al icono que define la ciudad. Además, el bucle de
   flagships de `buildDiversePrefix` comparaba la cantidad total seleccionada contra la cuota, no la
   cantidad real de flagships.
2. **La investigación mezcla descubrimiento, captura y validación en un flujo rígido** con seis
   búsquedas fijas, `country: 'ES'` fijo, hasta ocho capturas y Wikimedia capturado como HTML (403).

## 2. Contratos implementados

### 2.1 Selección esencial (`EssentialRouteSelectionV8.ts`)

- `requiredCanonicalIdsFromCoreV8(core)` — extrae los QIDs exactos del resolver editorial existente
  (`CanonicalTourCoreV6`).
- `selectEssentialRouteV8(candidates, requiredCanonicalIds, stopCount, options)` — los QIDs requeridos
  son restricciones duras: ningún flagship genérico puede sustituir un lugar requerido; los opcionales
  se puntúan por contribución narrativa, evidencia, variedad y cercanía a los requeridos.
- `wikidataId` se conserva durante ranking, selección y posicionamiento.

### 2.2 Geometría V8 (`TourGeometryV8.ts`)

```ts
type TourLegV8 =
  | { type: 'walking'; fromStopId: string; toStopId: string; durationSeconds: number }
  | { type: 'self_transfer'; fromStopId: string; toStopId: string; durationSeconds: null };
```

- Máximo dos bloques caminables y un `self_transfer` para 120 minutos.
- Texto fijo no generado por LLM: `La siguiente parada es {nombre}. Llega por el medio que prefieras
  y reanuda el recorrido allí.`
- Duración: `guidedDurationMinutes`, `externalTransferTimeIncluded: false`,
  copia `≈120 min de experiencia guiada + traslado libre`.
- `route_review_required` con `too_many_self_transfers` o `guided_duration_infeasible`; nunca elimina
  lugares esenciales.

### 2.3 Proveedores V7 (`NarrativeSourcesV7.ts`)

- `SearxngNarrativeDiscoveryProviderV7` — descubrimiento JSON self-hosted, idioma y país reales
  (`language`, `countryCode`), dominio de instancia validado (sin instancias públicas).
- `FirecrawlNarrativeCaptureProviderV7` — solo `/scrape` y `/map`; cloud (`api.firecrawl.dev`) lanza
  error; SSRF reutiliza `assertSafeNarrativeUrlV6`.
- `WikimediaNarrativeCaptureProviderV7` — captura vía la API oficial (`/w/api.php`), nunca HTML;
  registra `wikimediaRevision` exacto.
- `classifyNarrativeHttpFailureV7` — reintenta timeouts, 429 y 5xx; 402 se reporta como cuota; 403/404
  se clasifican sin reintento.

### 2.4 Autoridades dinámicas (`NarrativeAuthoritiesV7.ts`)

- `WikidataAuthorityProviderV7` — identidad, aliases e idiomas desde Wikibase; dominios P856 del
  lugar, la ciudad y hasta tres niveles de P131; solo claims HTTPS no obsoletos (rank deprecated
  ignorado).
- `degradeAuthorityForMismatch` — si la página de un dominio registrado no coincide con ningún alias
  del lugar, se degrada a `discovery_only`.
- `buildAdaptiveSearchPlanV7` — hasta cuatro consultas deterministas y `/map` en un máximo de tres
  dominios oficiales (presupuesto `NARRATIVE_STOP_BUDGET_V7`).

### 2.5 Grounding por spans (`NarrativeSpansV7.ts`)

- `segmentCaptureIntoSpansV7` — spans estables con `evidenceSpanId` por párrafo, con división por
  frases en bloques largos (máx 700 caracteres).
- `verifySpanSelectionV7` — valida selección de 1 a 3 spans contiguos de la misma fuente y reconstruye
  la cita exacta desde el backend (el LLM nunca escribe citas literales).
- `assessNarrativeStopSuffiencyV7` — mínimo por parada: identidad confirmada, detalle observable,
  contribución histórica y al menos una de función/conflicto/rasgo.

### 2.6 Estados y diagnóstico (`NarrativeRunStateV8.ts`)

- Razones nuevas: `core_disagreement`, `required_identity_missing`, `too_many_self_transfers`,
  `guided_duration_infeasible`, `no_results`, `capture_blocked`, `parse_empty`,
  `authority_insufficient`, `curator_contract_failed`.
- `classifyRunBlockV8` devuelve solo la razón principal de mayor prioridad.
- `NarrativeRunDiagnosticsV8.appendPhase` registra por fase: proveedor, idioma, país, resultados,
  URLs mapeadas, HTTP final, autoridad, cache hit, huecos de evidencia, sustituciones, cobertura del
  núcleo editorial y número de traslados libres.

### 2.7 Orquestador canary (`NarrativeCanaryV8.ts`)

`runNarrativeCanaryV8(input, services)` une: resolución del core editorial → selección esencial →
geometría → investigación por parada (presupuesto determinista + `/map` + fase adaptativa solo si
quedan huecos) → verificación de spans → clasificación de bloqueo. Detiene la investigación en cuanto
la evidencia es suficiente. Si una parada **requerida** carece de evidencia, el run se bloquea y
explica; si la parada es **opcional**, una reserva del mismo bloque **reemplaza** la parada
(`reserveAttempts`, `substitutions`) y el run puede rescatarse sin regenerar el tour; tras una
sustitución se recalcula la geometría.

### 2.8 Correcciones de la primera revisión (Request changes)

- **Selector**: el bucle de flagships respeta `stopCount` (`selected.length < stopCount`), con test de
  reproducción (4 paradas solicitadas con 2 anchors + 3 flagships devuelve 4, no 5).
- **Geometría**: `orderTourStopsByProximityV8` ordena por nearest-neighbor antes de dividir bloques;
  A1,B1,A2,B2 produce los mismos dos bloques que A1,A2,B1,B2 (test añadido).
- **Contratos de proveedores**: Firecrawl `/map` parsea `links` en la raíz (formato v2.8.0 verificado
  en el checkout); SearXNG envía `language-<country>` real (sin `country: 'ES'` fijo); el orquestador
  usa SearXNG para `search` y Firecrawl para `mapOfficialSite` (composite en el script canary), y la
  interfaz `mapOfficialSite` acepta `language`/`countryCode`; el origen de `/map` se valida con
  `assertSafeNarrativeUrlV6` antes de enviarlo (SSRF).
- **Infraestructura**: `scripts/searxng-settings.yml` habilita `formats: [html, json]` (el default
  oficial devuelve 403 para JSON); el compose monta el settings y se une a la red bridge de Firecrawl;
  `SEARXNG_ENDPOINT=http://searxng:8080` (no 127.0.0.1, que no resuelve dentro del contenedor);
  `searxng-local.sh` verifica la red compartida.
- **Autoridades**: la ciudad se solicita con `labels|aliases|claims` (antes `claims` y fallaba con
  "Q2 labels must be an object"); el idioma enviado a Wikibase es el real del run (antes 7 fijos);
  `classifyNarrativeSourceAuthorityV7` ya no usa las listas fijas de V6: los proveedores devuelven
  `discovery_only` y el flujo aplica `classifyAgainstRegistryV7` (promueve dominios P856 registrados y
  degrada por mismatch de identidad) antes de capturar.
- **Curador**: las capturas `discovery_only` se rechazan como evidencia; una selección con
  `requiresIndependentCorroboration` exige dos publishers independientes.
- **Presupuesto**: `attemptedUrls` cuenta URLs intentadas (no solo capturas exitosas) y un 403 no se
  reintenta desde otra consulta.
- **Canary genérico**: el script ya no tiene `CITY_QIDS` ni lee `fixtures/candidates/{city}`; carga
  candidatos en vivo con `loadLiveCityCandidatesV8` (Overpass → Wikidata estructurado → tiering →
  shortlist de 60 → Wikipedia solo del shortlist), resuelve el QID de la ciudad con `resolveCityQidV7`
  (Wikidata search), ejecuta el resolver editorial real (prominencia + auditorías, o replay con
  `--core-artifact`), y usa idioma/país/tema/duración por argumento. La fase adaptativa usa el LLM
  (hasta cuatro consultas) en lugar de devolver vacío.

### 2.9 Correcciones de la segunda revisión (Request changes)

- **Redirecciones**: `NarrativeCanaryV8.addCapture` ya no reutiliza la autoridad de la URL solicitada
  cuando la captura termina en otro `finalUrl`; reclasifica `finalUrl` contra el registro y degrada a
  `discovery_only` si no pertenece (test: URL oficial que redirige a `evil.example` se rechaza).
- **Corroboración por proposición**: el mapa `corroborated` (por rol, nunca consultado) se sustituye
  por publishers por `propositionId`; una selección con `requiresIndependentCorroboration` solo se
  acepta cuando un segundo publisher independiente respalda la misma proposición (tests positivo y
  negativo).
- **Tour vacío**: `runNarrativeCanaryV8` activa `no_results` cuando `selection.route` queda vacío
  (candidatos y core vacíos) y devuelve `failed` en lugar de `ready_for_human_gate`.
- **Spans**: `segmentCaptureIntoSpansV7` ya no elimina spans duplicados por texto (podía hacer que
  una selección saltando un párrafo pareciera contigua); `verifySpanSelectionV7` reconstruye la cita
  como substring exacto del contenido original en lugar de normalizar espacios.
- **N+1 de Wikipedia**: `loadLiveCityCandidatesV8` hace shortlist real (`SHORTLIST_LIMIT=60`) antes
  de enriquecer; `enrichLivePoisV8` queda solo para Wikidata estructurado; la Wikipedia del shortlist
  se agrupa por idioma y por lotes de 50 títulos con peticiones seriales (intro + cuerpo por lote),
  `maxlag=5`, User-Agent (contacto pendiente de configurar uno real; el actual es un placeholder),
  caché y retry para timeout/429/todos los 5xx respetando `Retry-After` (los errores DNS no se
  reintentan; verificado por tests). Test: 251 POIs → `prefilteredCount=60` y ≤ 8 llamadas a
  Wikipedia. Nota: el shortlist de 60 limita la Wikipedia, pero Wikidata (`wbgetentities`) sigue
  viendo el pool completo previo al tiering.
- **Autoridades**: `wbGetEntities` pide idioma del run + `en` (labels locales); las revisiones de
  Wikidata se piden en un solo lote para el lugar, la ciudad y los ancestros (antes solo el lugar);
  P131 se recorre por niveles (hasta 3 niveles, todas las entidades de cada nivel) en lugar de 3
  entidades siguiendo solo la primera; `resolveCityQidV7` identifica el país por nombre localizado
  (`Intl.DisplayNames`) sin caso especial para ES.
- **SearXNG self-hosted**: el constructor rechaza cualquier host público (solo loopback, IPs privadas,
  sufijos `.local/.internal/.lan` o hostname de un solo label como el servicio de compose); antes solo
  denegaba `searx.be` y `searxng.org`.
- **Artefacto diagnóstico**: el script canary escribe `canary.json` y `diagnostics.private.json` con
  `status: failed` y el error aunque la carga viva falle (antes quedaban directorios vacíos en timeout).

### 2.10 Correcciones de la tercera revisión (Request changes)

- **Maxlag HTTP-200** (`MediaWikiRequestPolicyV8`): las peticiones a Wikidata (entidades y labels) y
  los lotes de Wikipedia se envuelven con `requestMediaWikiWithMaxlagPolicyV8`: si el cuerpo responde
  `error.code === "maxlag"` con HTTP 200, espera el lag reportado (máx 6 intentos y 180 s acumulados,
  sin subir `maxlag`) y reanuda; si persiste, lanza `MediaWikiMaxlagExhaustedErrorV8` con
  `code: "maxlag_exhausted"`, `attempts`, `totalWaitMs` y `lastLagSeconds`, y el script lo registra en
  `canary.json`. Tests con wait falso (sin sleeps reales): lag transitorio, espera por lag, agotamiento
  acotado y tope de presupuesto.
- **DNS ≠ timeout**: `classifyLiveGetFailureV8` ya no trata `ENOTFOUND`/`EAI_AGAIN`/`ENETUNREACH` como
  reintentables; solo timeout sin estado HTTP, 429 y todos los 5xx se reintentan respetando
  `Retry-After`.
- **Contrato de curador**: un `services.curate` que lanza error produce `curatorContractFailed`
  (nunca `capture_blocked`); spans inventados, de otra fuente o duplicados también marcan
  `curator_contract_failed`. `classifyRunBlockV8` da prioridad a `curator_contract_failed` y
  `parse_empty` sobre `authority_insufficient`. Una proposición sin corroboración no es fallo de
  contrato: simplemente no cubre el rol.
- **Corroboración con dos citas**: la proposición aceptada conserva la cita del primer publisher
  (pendiente) y la del segundo; el test exige dos `quote` con `sourceId` distintos del span
  controvertido.
- **Sustituciones de un solo uso**: `availableReserveIds` se retira antes de investigar la reserva;
  una reserva no sustituye dos paradas y las requeridas nunca se sustituyen. La ruta final se
  reconstruye desde `stops` (`position` actualizado), `selection.route`/`optionalIds`/
  `coverage.optionalCount` coinciden con `stops` y `geometry.blocks`, y las razones se recalculan desde
  `finalGeometry` (una sustitución que rompe la caminabilidad devuelve `too_many_self_transfers`; nunca
  `review_required` con `reasons: []` si la geometría tiene razón conocida).
- **Spans sin pérdida**: una frase >700 se divide en chunks (último espacio antes del carácter 700, o
  corte exacto si no hay espacio) conservando offsets absolutos y sin perder caracteres; la contigüidad
  se verifica por índices del array (no por orden lexicográfico de IDs); los IDs duplicados se rechazan
  como `duplicate_span`; una captura no vacía sin spans activa `parse_empty` sin llamar al curador.
- **Diff quirúrgico**: `RouteSelection.ts` restaurado a los EOLs del índice (mixed) conservando solo el
  fix del contador de flagships (`git diff --numstat`: 3/1) y `RouteSelection.test.ts` solo sus 32
  líneas añadidas.

## 3. Resultados de pruebas

Suites nuevas (jest, `backend/src/services/poi/`):

| Suite | Tests | Cobertura clave |
|---|---|---|
| `RouteSelection.test.ts` | 15 | contador real de flagships (bug corregido); stopCount respetado |
| `EssentialRouteSelectionV8.test.ts` | 8 | QID lejano permanece; flagship genérico no satisface otro QID; categorías balanceadas |
| `TourGeometryV8.test.ts` | 10 | dos bloques máx, un `self_transfer`, revisión sin eliminar esenciales, agrupación por proximidad |
| `NarrativeSourcesV7.test.ts` | 15 | SearXNG JSON con idioma/país reales; `/map` links raíz; SSRF origen; cloud rechazado; 429 reintenta, 403 no |
| `NarrativeAuthoritiesV7.test.ts` | 20 | P856+P131, claims obsoletos ignorados, ciudad sin labels tolerada, idioma+en, revisiones lugar/ciudad/ancestros, P131 por niveles, país genérico, clasificación por registro |
| `NarrativeSpansV7.test.ts` | 15 | spans estables, contiguidad por índice, duplicado rechazado (`duplicate_span`), frases >700 en chunks sin pérdida, cita como substring exacto, suficiencia mínima |
| `NarrativeRunStateV8.test.ts` | 13 | razones y prioridades (curator_contract_failed sobre authority_insufficient), registro por fase |
| `NarrativeCanaryV8.test.ts` | 20 | flujo completo, fase adaptativa, parada temprana, reserva de un solo uso, selección/paradas/geometría coherentes, redirección reclasificada, no_results, corroboración con dos citas, curator_contract_failed, parse_empty, diagnóstico por fase |
| `LiveCityCandidatesV8.test.ts` | 8 | loader vivo geocodifica y enriquece; shortlist 60 con 251 POIs y presupuesto serial pequeño; retry timeout/429/5xx respetando Retry-After y DNS sin retry; maxlag HTTP-200 con wait registrado |
| `MediaWikiRequestPolicyV8.test.ts` | 6 | maxlag HTTP-200 reintentado con wait falso, espera por lag, agotamiento acotado (6 intentos / 180 s) y tope de presupuesto |

**Total: 130 tests, todos en verde (10 suites).** Los artefactos V6 y su replay no fueron modificados
(los archivos V6 existentes quedan intactos; solo `RouteSelection.ts` recibió las correcciones del
contador).

> Nota: tras la segunda revisión la suite V7/V8 sumaba 110 tests en 9 suites; la tercera revisión la
> deja en 130 tests en 10 suites (nueva `MediaWikiRequestPolicyV8.test.ts` y nuevos escenarios de
> curador, sustituciones y spans).

## 4. Diffs relevantes

- `backend/src/services/poi/RouteSelection.ts` — el bucle de flagships cuenta flagships reales y
  respeta `stopCount`.
- `backend/package.json` — nuevo script `quality:narrative:v8:canary`.
- `scripts/searxng-local.compose.yaml`, `scripts/searxng-settings.yml`, `scripts/searxng-local.sh`,
  `scripts/firecrawl-local.compose.yaml`, `scripts/smoke-v8-providers.sh`, `DOCKER-SETUP.md` —
  infraestructura SearXNG local (digest fijado, JSON habilitado, red compartida con Firecrawl) y
  smoke sin LLM.
- Archivos nuevos V8/V7 listados en la sección 2.

## 5. Cómo ejecutar la validación (canary vivo)

```bash
# 1) Infra local (Firecrawl primero: crea la red compartida)
./scripts/firecrawl-local.sh up
./scripts/searxng-local.sh up
./scripts/smoke-v8-providers.sh

# 2) Canary por ciudad (tres ciudades genéricas; Barcelona una sola vez).
#    El resolver editorial se ejecuta en vivo (prominencia + auditorías) o
#    se reproduce desde un snapshot con --core-artifact.
npm run quality:narrative:v8:canary -- --generate --allow-external --city-key=valencia --language=es --country=ES --theme=history --duration=120
npm run quality:narrative:v8:canary -- --generate --allow-external --city-key=toledo --language=es --country=ES --theme=history --duration=120
npm run quality:narrative:v8:canary -- --generate --allow-external --city-key=barcelona --language=es --country=ES --theme=history --duration=240
```

- El canary es genérico: sin `CITY_QIDS` ni fixtures por ciudad; idioma, país, tema y duración se
  pasan por argumento y el QID de la ciudad se resuelve desde Wikidata.
- Verificación manual Barcelona: Sagrada Família (Q48435) debe aparecer como identidad requerida y
  permanecer en la ruta. Si el resolver no la considera requerida, el canary devuelve revisión para QA;
  nunca se añade un hardcode.
- No lanzar escritores hasta que ruta y evidencia hayan pasado sus gates.
- **Canary Málaga (2026-08-14)**: primer intento (sin el fix) murió en la primera petición
  `wbgetentities` con `error.code="maxlag"`, `lag=23.4`, artefacto en
  `backend/tmp/narrative-v8/narrative-v8-malaga-2026-08-14T15-33-08-118Z/canary.json`. Tras la
  política maxlag de la tercera revisión, el canary `narrative-v8-malaga-maxlag-fix-1` ejecutó el
  **Caso B (maxlag persistente)**: 6 intentos, 123.5 s de espera acumulada, último lag 24.65 s, y
  abandonó con `failure.code="maxlag_exhausted"` (attempts/totalWaitMs/lastLagSeconds en el artefacto),
  sin intentar SearXNG/Firecrawl después del fallo. El lag de Wikidata (>5 s) fue persistente durante
  la ventana; no hubo incremento de `maxlag` ni busy loop. No se alcanzó el core editorial; la
  re-ejecución cuando el lag de Wikidata baje debe llegar a core/SearXNG/Firecrawl (Caso A).
  La suite completa del backend da 915 tests (900 pasan, 14 fallan, 1 skip) en 129 suites; las 7
  suites fallidas fallan idénticas en el baseline limpio HEAD (verificado con `git worktree`):
  no hay regresión atribuible a este trabajo.

### 7. Run narrativo de Málaga (reproducción congelada del plan 63)

Run de referencia del pipeline editorial V6 con OpenRouter (`malaga-user-canary-openrouter-1`):

- Comando: `node -r ts-node/register scripts/validation/narrative-user-canary-v6.ts --generate
  --allow-external --profile=balanced_openrouter --prior-spend-usd=0 --city=Málaga
  --country=España --country-code=ES --theme=history --language=es --duration=120
  --run-id=malaga-user-canary-openrouter-1`.
- Artefactos: `backend/tmp/narrative-v6/malaga-user-canary-openrouter-1/` — `review.json`,
  `diagnostics.private.json`, `progress.private.jsonl`, `spend.private.jsonl`, `tour.md`.
- Estado final: `research_failed`; arquitecto/escritores/auditores/scorecard no se ejecutaron.
- Métricas: 8 paradas estructurales; 48 consultas fijas (6 por parada); 42 consultas sin resultados
  web; 0 capturas útiles en 7 paradas; 14 intentos de Wikimedia vía Firecrawl (403); Teatro Romano
  con 8 capturas pero `evidence_review_required`; 0 dossiers suficientes; 0 guiones.
- Causa raíz: `narrative-user-canary-v6.ts` llama a `researchNarrativeStopsV6` +
  `FirecrawlNarrativeSourceProviderV6`; el planner V6 exige 6 consultas con dominios de
  `narrativePrimaryAuthorityDomainsV6` (fallback Madrid) y V6 captura Wikipedia/Wikidata por
  Firecrawl `/scrape` (403). Referencias: `NarrativeResearchV6.ts`, `NarrativeSourcesV6.ts`.

Fingerprint de la ruta de Málaga para `--route-artifact` (QID, nombre, lat, lng):

| stopId | QID | lat | lng |
|---|---|---:|---:|
| alcazaba-de-malaga | Q3127243 | 36.7210199 | -4.4159336 |
| teatro-romano | Q3849447 | 36.7212854 | -4.4168967 |
| palacio-de-los-condes-de-buenavista | Q969308 | 36.7215590 | -4.4182724 |
| iglesia-catedral-de-la-encarnacion | Q1582758 | 36.7201789 | -4.4194100 |
| palacio-de-la-aduana | Q4155876 | 36.7199694 | -4.4171575 |
| muralla-nazari-y-muro-portuario | Q6032873 | 36.7183224 | -4.4204727 |
| plaza-de-toros-de-la-malagueta | Q523311 | 36.7203556 | -4.4107850 |
| castillo-de-gibralfaro | Q1049197 | 36.7233684 | -4.4116294 |

Baseline registrado antes de la implementación del plan 63:

- `npx tsc --noEmit`: limpio.
- Suites V7/V8 (10): 130/130 en verde.
- Suite completa: 915 tests (900 pasan, 14 fallan, 1 skip) en 129 suites; las 7 suites fallidas
  fallan idénticas en HEAD (baseline verificado con `git worktree`).

### 8. Ejecución del plan 63 (end-to-end V8) — estado real

Implementado por fases con gates (ver `docs/working/63-tour-end-to-end-v8-implementation-plan.md`):

- Fase 0: baseline registrado; reproducción `research_failed` del run V6 documentada; script V6
  congelado.
- Fase 1: política externa única (headers, Retry-After segundos/fecha, espera min 5 s de maxlag,
  UA central real, clasificador tiempo explícito/429/5xx/maxlag; DNS/refused/TLS/genérico sin retry)
  integrada en loader, autoridades y capturador Wikimedia.
- Fase 2: ciudad fail-closed con P17/P297, `city_identity_review_required` (sin primer resultado);
  QID desde `pageprops`; QID obligatorio en ruta V8 (`osm:*` fuera + `identityUnresolved`); caché de
  entidades y chunks de 50 para P131; match con labels+aliases normalizado; Wikipedia exacta
  `established_source` (publisher `wikimedia`).
- Fase 3: `NarrativeDossierV8` (contratos de curator agregado, citas por `content.slice`, IDs
  deterministas, corroboración por publisher, gates `minimumEvidenceReady`/`writerReady`, adaptador
  validado con `buildNarrativeDossierV6`).
- Fase 4: `NarrativeResearchV8` (Wikimedia API primero, queries deterministas, `/map`, presupuesto
  de 12 capturas, packet 40 spans/30k, curación agregada, parada en `writerReady`, adaptativas).
- Fase 5: canary delega en el módulo V8; sustituciones por `writerReady`; reason
  `evidence_review_required`; ruta/geometría/dossiers coherentes.
- Fase 6: `narrative-user-canary-v8.ts` (replay `--route-artifact`, preflight, dossiers, editorial
  V6, `tour.md`); se corrigió la caché de entidades que ocultaba sitelinks y los IDs de span
  truncados por el LLM.
- Fase 7: modo live cableado; el canary live de Málaga cargó 161 POIs y bloqueó en
  `maxlag_exhausted` (externo, `retryableLater: true`).

Resultados de los canaries (artefactos en `backend/tmp/narrative-v8/`):

- `narrative-v8-malaga-replay-1..4`: replay con `--route-artifact` (review.json V6) — la
  investigación llegó a capturar la Wikipedia por API (1 fuente/parada) y falló por evidencia real:
  SearXNG local devolvió 0 resultados (degradado) y el curador DeepSeek produjo violaciones de
  contrato (soportes duplicados, spans no contiguos, nombres fuera de evidencia) rechazadas por el
  backend (`evidence_review_required` por parada). Cero planner V6 y cero scraping HTML Wikimedia.
- `narrative-v8-malaga-live-1`: modo live — `maxlag_exhausted` en la carga de candidatos (bloqueo
  externo acotado).

Validación al cierre de la implementación:

- `npx tsc --noEmit`: limpio.
- Suites V7/V8/nuevas (12): 145/145 en verde.
- Suite completa: 930 tests (915 pasan, 14 fallan en las 7 suites del baseline HEAD, 1 skip); sin
  regresiones nuevas.
- Smoke local: 10/11; el fallo es `Firecrawl /v2/search` sin resultados web por la degradación de
  SearXNG (externo), no del código.

Pendientes del plan 63 (no declarar completado): test 12.7 end-to-end sin red (8 entradas → 8
dossiers/guiones/tour.md), matriz completa 12.x restante, Experimento D (generalización),
diagnósticos por petición completos, revisión final por otro LLM y actualización de coste exacto.

## 6. Notas para el revisor

Responder únicamente `Approve` o `Request changes`. Cada objeción debe citar una sección o evidencia
concreta, explicar el riesgo y proponer la corrección mínima. Revisar especialmente:

- Que no haya lógica específica de Barcelona (los tests usan QIDs de ejemplo; la ciudad real solo se
  valida en el canary vivo, sin fixtures).
- Que una identidad imprescindible nunca pueda sustituirse por una cuota genérica
  (`selectEssentialRouteV8` + test `does not let a generic flagship satisfy another required QID`).
- Que SearXNG y Firecrawl Cloud no sean dependencias externas (SearXNG solo localhost, digest fijado;
  cloud rechazado en el constructor del proveedor).
- Que el sistema no intente resolver cómo viaja el usuario (el `self_transfer` no contiene navegación,
  transporte ni duración).
- Que la duración no incluya implícitamente el traslado libre (`externalTransferTimeIncluded: false`
  y copia separada).
