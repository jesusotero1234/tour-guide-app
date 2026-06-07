# 21 — Handoff: harness de fixtures + defectos abiertos de calidad de tour

> **Propósito.** Documento autocontenido para que otro LLM continúe el trabajo de
> calidad de selección/composición de tours sin contexto previo. Cuenta **qué se
> hizo**, **qué está en curso** y **qué falta**, con rutas de archivo exactas y
> criterios de aceptación. Generalizable a otras ciudades, no solo Madrid.
>
> Lectura previa recomendada:
> - `docs/architecture/tour-quality-landmark-tiering.md` (diseño de tiering)
> - `docs/architecture/tour-quality-fixtures-acceptance.md` (diseño del harness)
> - `docs/working/05-agent-log.md` (entradas: fix de harvesting + dedup DEFECT A)
> - `docs/working/20-madrid-history-tour-postmortem.md`

---

## 1. Contexto en una frase

El pipeline de tours (geocode → pool OSM → sitelinks → tiering → shortlist →
enrich → rank → composición de ruta) ya produce tours creíbles para Madrid tras
arreglar el bug de harvesting, pero **siguen cayéndose landmarks obvios** en la
construcción del set, y **falta congelar el comportamiento bueno como regresión**
(fixtures + tests de aceptación) para Madrid/Paris/Rome/London.

---

## 2. Qué se hizo (terminado y verificado)

### 2.1 Fix de harvesting — starvation de relations/ways  ✅
- **Archivo:** `backend/src/infrastructure/poi/OverpassPoiFetcher.ts`
- **Causa raíz:** Overpass emite elementos en orden de tipo (node → way →
  relation) y `out center tags N` truncaba con un flood de nodes, dejando fuera
  los landmarks icónicos (que en OSM son relations/ways).
- **Fix:** salida particionada por geometría — dos bloques `out center tags`
  separados (áreas con `AREA_FETCH_LIMIT=120`, nodes con `NODE_FETCH_LIMIT=60`),
  `PRIORITIZED_POI_TOTAL_LIMIT=300`, retry/backoff (`MAX_FETCH_RETRIES=2`,
  reintentando ante 429/502/503/504 y timeouts), `OVERPASS_QUERY_TIMEOUT_S=60`.
- **Resultado:** pool 111 → ~291-300; todos los anchors de Madrid llegan al
  shortlist como flagship.

### 2.2 DEFECT A — landmarks duplicados  ✅
- **Archivos:** `backend/src/domain/poi/dedupePois.ts` (+ `dedupePois.test.ts`, 5 tests verdes).
- **Fix:** `dedupeByWikidata()` colapsa elementos con el mismo `wikidata` id,
  quedándose con el más rico (más tags; desempate por rango de geometría
  relation > way > node). POIs sin `wikidata` nunca se fusionan; orden estable.
- Se llama dentro de `fetchPoisForTheme` antes de devolver el pool
  (loguea "collapsed N wikidata duplicates"; observado: 9 en Madrid).

### 2.3 Harness de fixtures + aceptación  ✅ (creado, corriendo verde salvo 1 hallazgo real)
- **Captura:** `backend/scripts/validation/capture-tour-fixtures.ts`
  Corre la mitad delantera del pipeline y para antes de composición/narración.
  Escribe:
  - `backend/fixtures/pools/<slug>.json` (geocode, rawPois, sitelinks) — Nivel 1
  - `backend/fixtures/candidates/<slug>.json` (requestedDuration, stopBounds,
    candidates con name/wikidataId/coordinates/importance_score/fameScore/
    landmarkTier/category) — Nivel 2
  Guard de honestidad: rechaza escribir si la cobertura de sitelinks < 0.5.
  Uso: `npx tsx scripts/validation/capture-tour-fixtures.ts Madrid history 240 es`
- **Oráculo (solo-test):** `backend/fixtures/oracle/anchors.json` — anchors de
  Madrid/history con qids verificados. Paris/Rome/London vacíos (placeholders).
  **Nunca importar desde `src/`**; producción debe DESCUBRIR anchors vía fame/tiering.
- **Tests:** `backend/src/services/poi/TourQuality.acceptance.test.ts`
  Table-driven sobre `['Madrid/history','Paris/history','Rome/history','London/history']`.
  Si faltan fixtures, registra un `describe.skip` con placeholder (no toca los
  fixtures null — esto se corrigió: `describe.skip` SÍ ejecuta el cuerpo del callback).
  - **Nivel 1 (shortlist):** cobertura sitelinks ≥ 0.8; anchors presentes como
    flagship/major; banda de flagship sana; sin wikidata duplicado.
  - **Nivel 2 (tour final):** sin wikidataId duplicado (guard de DEFECT A);
    `degraded === false` y `coverageRatio ∈ [0.7, 1.2]`; cobertura de anchors
    ≥ `ceil(anchors/2)`; share máximo de categoría ≤ 0.7.
  - `it.todo` para DEFECT B.

### 2.4 Fixtures de Madrid capturados  ✅
- `backend/fixtures/pools/madrid-history.json` (~291 POIs)
- `backend/fixtures/candidates/madrid-history.json` (40 candidatos:
  29 flagship + 11 major; categorías square_civic 7, museum 13, religious 4,
  other 11, palace_castle 5).

---

## 3. Qué está en curso (estado exacto al hacer el handoff)

Estado corregido tras continuar el trabajo:

```
Madrid/history
  ✓ oracle aligned with captured pool fixture
  Level 1
    ✓ resolves sitelinks for the large majority
    ✓ surfaces the expected anchors into the shortlist as flagship/major
    ✓ has a sane flagship band
    ✓ has no duplicate wikidata id in the shortlist
  Level 2
    ✓ no duplicate landmark (DEFECT A guard)
    ✓ not degraded + coverageRatio en banda
    ✓ meaningful share of anchors
    ✓ does not collapse into a single category
    ✓ includes Templo de Debod and Puerta de Alcalá
Paris/Rome/London  ○ skipped (sin fixtures)

Tests: 3 skipped, 10 passed, 13 total
```

**Corrección del diagnóstico de Reina Sofía:** el rojo original NO era un bug de
pipeline. En los fixtures congelados, Reina Sofía sí estaba presente tanto en el
pool como en los candidatos, con `wikidata=Q460889`, `sitelinks=45`, tier
`flagship` y `fameScore=22.57`. El oráculo estaba mal curado con `Q239686`, así
que el test reportaba un falso “landmark ausente”.

**Fix aplicado:**
- `backend/fixtures/oracle/anchors.json`: `Q239686` → `Q460889` para “Museo Reina Sofía”.
- `backend/src/services/poi/TourQuality.acceptance.test.ts`: guard offline que
  verifica que todo QID del oráculo exista en `rawPois` del pool congelado. Si
  se vuelve a curar un QID inexistente, falla con el nombre del anchor huérfano.

**DEFECT B también quedó resuelto:** ya no quedó como `it.todo`. La composición
final ahora mantiene Debod y Puerta de Alcalá con una regla general en
`RouteSelection.ts`, sin hardcodear QIDs.

---

## 4. Qué falta (plan accionable, en orden)

### Paso 1 — Capturar fixtures de Paris / Rome / London y poblar el oráculo
- Correr el script de captura para cada ciudad (history, 240, idioma local o en).
- Verificar a mano los anchors must-see de cada ciudad y poblar
  `backend/fixtures/oracle/anchors.json` con qids verificados (hoy están `[]`).
- El guard offline nuevo hace cumplir automáticamente que cada QID curado exista
  de verdad en el pool congelado.
- Al tener fixtures + anchors, los `describe.skip` pasan a activos
  automáticamente. Esto valida que los fixes generalizan más allá de Madrid.

### Paso 2 — Tunear thresholds contra evidencia (NO antes)
- Los umbrales del test son conservadores/placeholder. Una vez Madrid esté
  limpio y haya ≥2 ciudades capturadas, ajustar
  `coverageRatio`, cobertura de anchors y share de categoría a lo que el
  pipeline logra de forma estable, para fijar una baseline verde de regresión.

### Paso 3 — Regresión completa
- `npx jest --runInBand` desde `backend/` y confirmar sin regresiones
  (baseline previa: 21/21 + 5 dedup; ahora + suite de aceptación).

---

## 5. Notas operativas para el siguiente LLM

- **CWD de Bash es `backend/`**, NO la raíz del repo. Usar rutas absolutas o
  relativas a `backend`. Para tocar `docs/` usar ruta absoluta
  `/mnt/c/.../tour-guide-app/docs/...`.
- La captura es **lenta y networked** (enrichment + Wikidata). No correr en CI;
  los fixtures son artefactos commiteados, se refrescan deliberadamente.
- `FORCE_OVERPASS=1` fuerza re-fetch en `diagnose-shortlist.ts`.
- Mantener la documentación en **español** y un tono honesto/crítico (no complaciente).
- No hardcodear landmarks por nombre/qid en `src/`; el oráculo de qids vive solo
  en fixtures de test.
