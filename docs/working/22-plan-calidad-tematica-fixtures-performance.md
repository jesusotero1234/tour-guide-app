# 22 — Plan: calidad temática + fixtures + performance (theme `history`)

> **Propósito.** Documento de trabajo ejecutable, autocontenido, para continuar el trabajo
> de calidad/performance del pipeline de tours sin contexto previo. Persiste el plan que se
> envió a refinamiento remoto (Ultraplan). Continúa de
> [`21-handoff-fixtures-y-defectos.md`](./21-handoff-fixtures-y-defectos.md).
>
> Estado de entrada (verificado): `npx jest --runInBand` verde en `backend/`
> (7 suites / 38 tests / 3 skipped). Madrid/history protegido por fixtures + aceptación.
>
> **Estado actual tras ejecución:** `npx jest --runInBand` verde en `backend/`
> (7 suites / 150 tests / 1 skipped). Aceptación activa para Madrid, Berlin, Paris,
> Roma, Amsterdam, Barcelona, Toulouse, Toledo, Valencia y Malaga. London sigue skip.
>
> **Decisiones del usuario ya tomadas:**
> - **Toledo:** capturar pool primero, confirmar el tag admisor y su `P31` ANTES de codear.
> - **Performance:** medir primero → batch de Wikidata → decidir el cache persistente con datos.
>
> Mantener este doc en **español**, tono honesto/crítico. No hardcodear landmarks en `src/`.

---

## 1. Contexto en una frase

La meta real es que un usuario nuevo escriba una ciudad (p. ej. Berlin) y obtenga un buen
tour automáticamente en `history`. El batch `history/es/240` muestra ciudades buenas
(Berlin, Paris, Roma, Amsterdam), mixtas (Malaga, Valencia, Lisboa) y rotas
(Toulouse, Toledo, Castellón). Dos problemas: **calidad temática** (entra basura) y
**performance** (~189-205s por ciudad hasta stops, dominado por enrichment).

---

## 2. Diagnóstico (causa raíz, con rutas exactas)

### 2.1 Performance — cuello estructural y muy visible
- `backend/src/infrastructure/enrichment/wikidataClient.ts:25-39` —
  `runSerializedWikidataRequest` **serializa globalmente** todas las llamadas a Wikidata,
  con `MIN_INTERVAL_MS = 1500`. El `enrichConcurrency = 4` de
  `orchestrationService.ts:479-485` **no aplica** a Wikidata (se encola).
- Por POI con `wikidata` hay ~3 llamadas serializadas: `enrichFromWikidata` (labels) +
  `enrichFromWikidataClaims` (claims) + `fetchLabels` (resolver Q-ids). 40 × 3 × 1.5s ≈ **180s**.
- `fetchWikidataSitelinkCounts` (`LandmarkTiering.ts:105-151`) **ya batchea** (50/llamada):
  es el patrón correcto y barato; el enrichment por-POI no lo sigue.
- **El enrichment NO se cachea**: `PostgresPoiCacheRepository` solo cachea el pool OSM crudo.
  Cada generación re-enriquece desde cero.

### 2.2 Calidad temática — basura por filtros amplios + fama pura
- `backend/src/domain/poi/themeTags.ts` admite catch-alls anchos para `history`:
  `tourism=attraction`+`wikidata|wikipedia` (32-40), `tourism=museum`+`wikidata|wikipedia`
  (44-49), `historic`+`wikidata|wikipedia` (101-106). Cualquier objeto notable entra si
  tiene wikidata, sin importar si es histórico.
- `OverpassPoiFetcher.isLowValueHistoryPoi` (`OverpassPoiFetcher.ts:82-94`) solo filtra
  `historic=aircraft`, rides y theme parks. **No** filtra naves/satélites/vehículos/cohetes.
  → Toulouse: Chang'e 4, Soyuz, ERS-2, Astrovan (exhibits de la Cité de l'espace) entran
  como `tourism=attraction`+wikidata.
- `LandmarkTiering.scoreLandmarkFame` (`LandmarkTiering.ts:26-52`) puntúa por
  `log2(sitelinks)`. Objetos globalmente famosos (Chang'e 4) → muchos sitelinks → **flagship**.
  La fama **promueve** la basura. No hay puerta de relevancia temática.
- **`P31` (instanceOf) se obtiene en `WikidataClaimsEnricher.ts:5-11` pero NO se usa** para
  filtrar ni rankear. Es la señal más general y de mayor palanca, y está sin usar.
- Toledo: "stop = ciudad" es el mismo patrón (entidad enorme, sitelinks altísimos, sube a
  flagship). El **tag exacto** que la admite se confirma con captura (decisión tomada).

### 2.3 Tiering relativo manufactura flagships en ciudades débiles
- `assignLandmarkTier` (`LandmarkTiering.ts:54-68`) es **percentil puro**. Una ciudad débil
  (Castellón) siempre fabrica "flagships" de su mejor-de-lo-débil. Parcialmente estructural,
  no un bug. Perseguirlo invita overfitting.

### 2.4 El harness de fixtures NO cubre harvest ni enrichment
- `TourQuality.acceptance.test.ts` corre sobre pools/candidates **congelados**. Cambiar
  `themeTags`/`OverpassPoiFetcher`/ranking **invalida** los fixtures (recapturar).
- No detecta regresiones de harvest (inputs congelados) ni de batching de enrichment
  (candidates congelados). Solo tiene anchors **positivos**; Paris/Rome/London vacíos
  (`anchors.json:13-15`).
- `composeWalkingRoute` ya **no** es el cuello para estas ciudades: Toulouse/Toledo son
  problemas de **admisión + scoring de candidatos**, aguas arriba de composición.

---

## 3. Plan por fases (ejecutable)

### Fase 0 — Baselines y confirmación (read-only, networked)
- [x] Baseline de **timing por stage** para 2-3 ciudades (el orquestador ya loguea `[Timing]`).
- [x] **Toledo: capturar pool primero** y confirmar el tag admisor + `P31` antes de codear.
- Comandos (CWD = `backend/`):
  ```bash
  # timing + stops por ciudad (usa cache de pool si existe)
  npx tsx scripts/validation/inspect-osm-tours-batch.ts history es 240 Berlin Paris Rome Toulouse Toledo
  # inspección detallada de una ciudad rota
  FORCE_OVERPASS=1 npx tsx scripts/validation/diagnose-shortlist.ts Toledo history 240 es
  ```

Resultado aplicado:
- Toledo entraba por `heritage=1` + `wikidata` con `place=city`, `wikidata=Q5836`, `P31=municipality of Spain`.
- Baseline pre-fix a stops: ~189-205s/ciudad.

### Fase 1 — Calidad temática (cambios pequeños y generales)
Palanca central: **usar `P31`** como puerta de relevancia por **tipo de entidad**, no por nombre.
- [x] Extender la llamada **ya batcheada** de sitelinks (`fetchWikidataSitelinkCounts`) para
  traer también `P31` en la misma request (≤50/batch, barato): da el tipo **antes** del
  shortlist y pre-calienta datos para claims.
- [x] Rechazar en tiering por `P31` con sets **generales**:
  - no-históricos (spacecraft, satellite, rocket, vehicle, aircraft, road vehicle…) → fuera de `history`.
  - área (city, municipality, administrative territorial entity…) → no es un stop.
- [x] Endurecer `isLowValueHistoryPoi` con señales **estructurales** (no nombres) como red secundaria.
- [ ] **No** ampliar filtros "por flexibilidad": admitir menos basura, no más cosas.

Resultado aplicado:
- Toulouse/history: fuera `Chang'e 4`, `Véhicule Soyouz`, `Satellite ERS-2`, `Astrovan` y `Aeroscopia` del shortlist alto / tour final.
- Toledo/history: fuera la entidad ciudad como shortlist #1 y como stop final.

### Fase 2 — Fixtures como regresión del fix
- [x] Recapturar fixtures de Madrid (cambió harvest/ranking).
- [x] Capturar **Berlin, Paris, Roma, Amsterdam** (señal real; Berlin = meta de producto).
- [x] Capturar **Barcelona/history** como ciudad control adicional.
- [x] Poblar `anchors.json` con anchors verificados a mano (el guard offline obliga a que cada
  QID exista en el pool congelado).
- [x] **Extender el harness con anchors negativos** (must-NOT-appear): capturar Toulouse/Toledo
  *después* del fix y congelar que Chang'e 4 / Soyuz / la entidad-ciudad NO aparezcan.
- [x] Activar ciudades nuevas en `CITY_THEMES` (`TourQuality.acceptance.test.ts:53`).
- Comando de captura:
  ```bash
  npx tsx scripts/validation/capture-tour-fixtures.ts Berlin history 240 de
  ```

### Fase 3 — Tunear thresholds contra evidencia
- [ ] Con ≥3 ciudades buenas verdes, subir `coverageRatio`/cobertura-de-anchors/share-de-categoría
  a lo que el pipeline logra de forma estable. Fijar baseline verde de regresión.

### Fase 4 — Performance (solo tras calidad bloqueada por tests) — medir → batch → cache condicional
- [ ] **Paso A (medir):** baseline de timing por stage (Fase 0).
- [x] **Paso B (batch, primero):** reemplazar las ~3 llamadas serializadas por-POI por llamadas
  batcheadas (`wbgetentities` con `props=labels|claims`, ≤50 ids) sobre todo el shortlist
  + un batch para resolver labels de Q-ids de claims. **Behavior-preserving**.
- [x] **Paso C (cache, condicional):** si tras el batch el tiempo sigue molesto o se repiten
  ciudades/idiomas, persistir cache de enrichment en Postgres por `(wikidataId, lang)` y
  `(wikipediaTitle, lang)`. **Decidir con los números** del Paso A/B.
- **NO** reducir `candidateCount`/`shortlistSize` para ganar tiempo (degrada calidad).
- **NO** subir concurrencia contra Wikidata (429 + no determinismo). El fix es **menos requests**.

Resultado aplicado:
- Re-run post-fix a stops en ciudades fuertes: ~52-86s/ciudad, contra ~189-205s antes.
- Cache persistente implementado en Postgres (`poi_enrichment_cache`) para Wikidata y Wikipedia.
- Benchmark de warm cache:
  - Berlin: ~48s primera corrida útil con cache nuevo → ~17.6s segunda corrida.
  - Paris: ~49s / ~16.1s ya con parte del cache poblado → ~18.0s warm cache estable.

Artefactos ya capturados post-fix:
- `madrid-history.json` recapturado con `wikidataMetadata`.
- `berlin-history.json`, `paris-history.json`, `roma-history.json`, `amsterdam-history.json`, `barcelona-history.json`.
- `toulouse-history.json` y `toledo-history.json` capturados para futura regresión con anchors negativos.
- `valencia-history.json` y `malaga-history.json` promovidos a la segunda ola de aceptación.

---

## 4. Riesgos

- **Overfitting:** denylist por nombre = overfitting. Usar solo `P31`/tipos estructurales.
- **Regresiones silenciosas:** fixtures congelados no ven harvest ni batching de enrichment.
  Sin parity check, batchear Wikidata podría cambiar datos sin que falle ningún test.
- **Fixtures stale:** tocar `themeTags`/`OverpassPoiFetcher`/ranking invalida fixtures.
- **Tiering relativo:** subir la barra por Castellón puede romper ciudades buenas.
- **Falsas optimizaciones:** más concurrencia o recortar counts.

---

## 5. Validación obligatoria ANTES de tocar performance

1. `npx jest --runInBand` verde desde `backend/` (estado actual: 7 suites / 150 / 1 skip).
2. Suite de aceptación **activa y verde** para Madrid + ≥2 ciudades buenas con `anchors.json` poblado.
3. Anchors **negativos** para Toulouse/Toledo congelados y verdes.
4. **Parity check de enrichment**: script que compara enrichment viejo vs batcheado para una
   ciudad y asegura candidates idénticos (nombres, claims, descripción, fameScore, tier, category).
5. Baseline de timing por stage registrada (Fase 0).

---

## 6. Decisiones / orden recomendado

- **Sí** al orden calidad → fixtures → performance, con corrección: los fixtures de ciudades
  buenas se capturan **después** del fix de calidad (si no, se congela comportamiento viejo).
- **Prioridad de fixtures ejecutada:** Berlin, Paris, Roma, Amsterdam (Madrid recapturado).
- **Segunda ola ejecutada:** Barcelona, Valencia, Malaga.
- **Regresión negativa ejecutada:** Toulouse/Toledo con anchors negativos.
- **No** fixturear todavía Castellón ni Lisboa.
- **Toulouse:** causa visible, accionable ya (puerta `P31`). **Toledo:** capturar pool primero.

## 7. Estado actual / siguiente paso

- **Amsterdam sí** quedó en la primera tanda de fixtures junto con Berlin/Paris/Roma.
- **Valencia y Malaga** quedaron suficientemente sólidas y ya se promovieron a aceptación.
- **Lisboa** queda fuera de la ola actual: demasiado sesgada a Belém y corta en variedad.
- Siguiente paso honesto si se continúa: parity check explícito del enrichment cacheado vs no cacheado
  y luego decidir si merece la pena recortar más latencia o si la prioridad pasa a nuevos themes/ciudades.
