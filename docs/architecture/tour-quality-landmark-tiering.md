# Tour Quality Rework — Landmark Tiering, Set Construction & Composition

Status: **partially implemented** — landmark tiering + set construction landed; harvesting bug found & fixed (see Update log).
Date: `2026-05-30`

## Update log

**2026-05-30 — Harvesting bug found and fixed (correction to this doc).**
After landmark tiering + set construction were implemented, Madrid/history/240 still missed
obvious anchors (Sol, Mayor, Almudena, Prado). A stage-by-stage diagnostic
(`backend/scripts/validation/diagnose-shortlist.ts`) proved the anchors were **absent from the
raw Overpass pool** — i.e. a harvesting failure, not a selection failure. Root cause in
`OverpassPoiFetcher.ts`: (1) `out center tags 25` truncated each query by element-type order
(node → way → relation), starving the relation/way-mapped icons; (2) a no-pagination loop that
re-issued identical queries. **This corrects §4 of this doc, which wrongly listed the Overpass
fetcher under "keep" — it had a structural harvesting bug that reading the code did not reveal
(Overpass emit-order only shows up when you run it).** Fix: type-partitioned `out` (areas 120 /
nodes 60), single honest pass per group, retry-on-504, total cap 150→300. Result: pool 111→300,
all anchors now enter the shortlist as flagship (Prado #1, Mayor #2, Sol #3, Palacio Real #5,
Debod #9, Almudena #14, Alcalá #15). Diagnosis now correctly points to set-construction (CASE 3).
Full detail in `docs/working/05-agent-log.md`.
Audience: **another LLM / engineer picking up this work cold.** This doc is self-contained. You should not need to re-derive the analysis; everything needed to act is here, with exact file paths, line references, code excerpts, type contracts, and an execution order.

Related docs:
- `docs/architecture/poi-selection-rework-plan.md` — prior plan (superseded in part by this doc).
- `docs/working/20-madrid-history-tour-postmortem.md` — original failure evidence.
- `docs/architecture/tour-selection.md` — current selection overview.

---

## 0. TL;DR

The walking-tour pipeline produces tours that are *valid* but *not product-credible* for a first-time visitor. For `Madrid / history / es / 240min` it selects well-documented but secondary POIs (Instituto Cervantes, Palacio Longoria, Catedral del Redentor) and **misses the obvious must-sees** (Puerta del Sol, Plaza Mayor, Palacio Real area as a coherent core).

**Root cause is architectural, not a tuning issue:** the system has **no notion of fame or "must-see" landmark tier**, and its two relevant layers contradict each other:

- `PoiRanker` scores **documentation density** (has wikidata, has wikipedia, article length, claims) — *not fame*. The score saturates, so many secondary POIs tie with true icons.
- `RouteSelection` then **overrides** that order, optimizing primarily for **duration fit** and applying a **hard walkability filter** that silently discards any candidate set containing a geographically separated icon.

Net effect: one layer tries to surface good POIs; the other discards them by geometry and backfills with central, well-documented filler. Improving duration only yields **more mediocre stops**, not better ones — exactly what the latest run shows (10 stops / 181 min: coverage up, quality flat).

**This fails identically in every large city** (Rome would drop the Colosseum, Paris the Eiffel Tower / Sacré-Cœur, London the Tower) because all the failing mechanisms are city-agnostic.

**The fix is a partial redesign, not a rewrite.** Add one new stage (landmark tiering from open signals, no hardcoded per-city lists) and reorient two existing stages (set selection by icon coverage; composition with *soft* walkability). The unlocking signal — **Wikidata sitelinks count + Wikipedia pageviews** — also fixes the enrichment time bottleneck (393s) because it lets you shortlist cheaply *before* deep-enriching.

---

## 1. System context

### 1.1 Current pipeline

Active path lives in `backend/src/services/orchestrationService.ts`, method `generatePlacesFromOsm` (around lines 368-550):

1. **Geocode city** — `geocodeCity` (Nominatim). Returns centroid + bounding box.
2. **Fetch raw POIs** — `poiCache.get(city, theme)` else `fetchPoisForTheme` (Overpass).
3. **Enrich ALL POIs** — Wikidata + Wikidata claims + Wikipedia, batched at concurrency 4 (lines 450-458).
4. **Rank** — `rankPois(enriched, centroidLat, centroidLng)` (PoiRanker).
5. **Cut topN** — `ranked = allRanked.slice(0, topN)` where `topN = getCandidateCount(duration)` (line 462-464).
6. **Compose walking route** — `composeWalkingRoute(routeCandidates, duration, theme, stopBounds)` (line 502).
7. **Narrate** — `buildNarration` per final stop (lines 508-543).

### 1.2 The measured run that motivates this work

Request: `city=Madrid, theme=history, language=es, duration=240`.

Before recent composition tweaks: 6 stops, 71 min, coverageRatio 0.297, degraded=true.
After tweaks: 10 stops, 181 min, coverageRatio 0.752, degraded=false.

Final 10 stops (the "after" state — still wrong as a product):

1. Instituto Cervantes
2. Plaza de Chueca
3. Palacio Longoria - SGAE
4. Catedral del Redentor
5. Palacio de Liria
6. Palacio Real de Madrid
7. Real Basílica de San Francisco el Grande
8. Capilla de Nuestra Señora y de san Juan de Letrán
9. Catedral Castrense de las Fuerzas Armadas
10. Mercado de San Miguel

Missing, expected for a first-time Madrid history tour: **Puerta del Sol, Plaza Mayor, Catedral de la Almudena, Puerta de Alcalá, Templo de Debod, Museo del Prado**. The postmortem confirms these *are present in the candidate pool* — so this is not a harvesting failure.

### 1.3 Stage timings (same run)

| Stage | Time |
|---|---|
| Geocode city | 606 ms |
| Load POI cache / fetch Overpass | 34 ms |
| **Enrich 111 POIs** | **393,058 ms** |
| Rank POIs | 1 ms |
| Compose walking route | 1 ms |
| **Generate narration (10 stops)** | **113,485 ms** |
| Total | 507,186 ms |

Two bottlenecks: **enrichment (time)** and **selection/composition (quality)**. They share a root cause (§2.8).

---

## 2. Findings (evidence-anchored)

Each finding cites the exact file and lines so you can verify before changing.

### F1 — `score` measures documentation density, not fame

`backend/src/services/poi/PoiRanker.ts:21-77`, function `scorePoi`:

```ts
if (poi.tags.wikidata) score += 3;
if (poi.tags.wikipedia) score += 2;
if (poi.name && poi.name.trim().length > 0) score += 1;
if (poi.enriched.description) score += 2;
const wikipediaLength = poi.enriched.wikipediaBody?.length ?? 0;
if (wikipediaLength >= 2000) score += 2;
else if (wikipediaLength > 1000) score += 1;
// + claims, + tourism=attraction (+2), + heritage, etc.
```

None of these measure **visitor salience**. They measure *editorial coverage*. Palacio Longoria, Instituto Cervantes and Puerta del Sol all max out the same signals.

**The score saturates.** The notability ceiling is low and many POIs reach it. When the top candidates tie on "notability", the real tiebreakers become (a) the OSM tag bonus and (b) the centroid distance penalty. So **between a global icon and a merely well-documented building, the ranker cannot discriminate.** By construction.

### F2 — Centroid distance penalty punishes the icons you want

`PoiRanker.ts:72-74`:

```ts
const distKm = haversineKm(poi.lat, poi.lng, centroidLat, centroidLng);
score -= Math.min(distKm * 0.5, 5);
```

Plaza Mayor / Puerta del Sol sit on the centroid → fine. But Palacio Real, Templo de Debod, Puerta de Alcalá, the Prado are 1-2 km out → they lose 0.5-1 point. With a saturated score, that half point lets a perfectly-central secondary POI outrank an icon. **Geography is being baked into the notion of quality.** A famous landmark 2 km away is still famous; distance is a *composition* concern, not a *quality* concern.

### F3 — Walkability is a HARD filter that discards entire icon-bearing sets

`backend/src/services/poi/RouteSelection.ts:283-285`, inside `evaluateRouteCandidates`:

```ts
const metrics = estimateRouteMetrics(orderedPrefix, maxSegmentMeters);
if (metrics.hasOverMaxSegment) {
  continue;   // <-- discards the WHOLE candidate set
}
```

`maxSegmentMeters` is 1800 at 240min (`getMaxSegmentMeters`, RouteSelection.ts:226-242). A **single** leg longer than that → the entire prefix is thrown away. The POIs that create long legs are exactly the peripheral icons (Debod, Prado, Retiro, Puerta de Alcalá). Mechanical result: **any route containing a separated icon is dropped**, and compact filler clusters win. This is the "exceso de optimización por walkability" — not a suspicion, it is literally coded as a hard filter. There is also **no log** when a set is dropped this way, so the failure is invisible.

### F4 — Set selection optimizes duration first; fame is a weak tiebreaker

`RouteSelection.ts:244-255`, `rankSelectionCandidates`:

```ts
if (a.durationGap !== b.durationGap) return a.durationGap - b.durationGap;     // PRIMARY
if (a.importanceSum !== b.importanceSum) return b.importanceSum - a.importanceSum; // tiebreak
if (a.metrics.outOfIdealSegments !== b.metrics.outOfIdealSegments) ...
```

The primary criterion for choosing among candidate routes is **"which best fills 240 minutes."** Importance sum is a 2nd-level tiebreaker — and that importance is the saturated score from F1. **Composition never has "did we include the city's signature landmarks" as an objective.**

### F5 — `orderRouteCandidates` walks the wrong neighborhood

`RouteSelection.ts:157-215`. It anchors at one of the 3 POIs closest to the centroid, then does pure nearest-neighbor:

```ts
const startAnchor = ... slice(0, Math.min(3, candidates.length))
                       .sort((a,b) => getImportanceScore(b) - getImportanceScore(a))[0];
// then greedy nearest-neighbor over the rest
```

The centroid of the 40 ranked candidates is pulled toward **density of documented buildings** (Chueca / Salamanca / Malasaña), not the historic Habsburg core (Sol / Mayor / Palacio). NN from there walks into the dense cluster and never leaves. That is why Chueca / Longoria / Liria came out and Sol / Mayor did not.

### F6 — The "ideal segment" band contradicts long tours

`RouteSelection.ts:101`:

```ts
if (estimatedSegmentMeters < 300 || estimatedSegmentMeters > 900) {
  outOfIdealSegments += 1;
}
```

A 240-minute tour **needs** long legs to cover ground. A heuristic that penalizes legs > 900m pushes toward the compact cluster. This is coherent for a 90-minute free walking tour, not a 4-hour city intro.

### F7 — No "landmark tier" anywhere, so the failure is general

Nothing in the system knows Sol / Mayor / Palacio Real are non-negotiable for a Madrid intro. Because F1-F6 are city-agnostic, **this fails identically in every large city**: Rome loses the Colosseum (far + long leg), Paris the Eiffel Tower / Sacré-Cœur, London the Tower. Not a Madrid quirk — the expected behavior of this architecture.

### F8 — Enrichment time bottleneck shares the root cause

`orchestrationService.ts:400-458`. Each POI does up to 3 sequential network calls (`enrichFromWikidata`, `enrichFromWikidataClaims`, `enrichFromWikipedia`), Wikidata is serialized to avoid rate-limit races, and **all 111 POIs are enriched before any selection happens**. 393s.

The fix for *time* and the fix for *quality* are the same: there is a **cheap, batchable fame signal** (§3.3) that should run *before* enrichment, to shortlist ~40 candidates and deep-enrich only those. Today, enrichment is doing the heavy lifting that tiering should do cheaply and early.

### Confirming nits (tech debt)

- `estimatedDuration: 20` set per candidate in `orchestrationService.ts:498` is **ignored**; `estimateRouteMetrics` hardcodes 7 min/stop (`RouteSelection.ts:80`). Dead field.
- `getMaxCategoryRatio` (`RouteSelection.ts:217-224`) keys off `importance_score >= 7.5` — a threshold coupled to absolute values of a saturating score. Any scoring change breaks this silently.
- `buildDiversePrefix` (`RouteSelection.ts:116-155`) relies on object identity (`selected.includes`, `remaining.indexOf`) over spread copies. Works today, fragile.

---

## 3. Target architecture

**Do not rewrite.** The macro shape (retrieve → enrich → select → compose → narrate) is correct. The fix is: **add one stage (tiering) and reorient two (set construction, ordering)** so they stop contradicting each other.

### 3.1 Separate the four collapsed concerns

These are conflated today into two layers that fight. Make them explicit:

| Concern | Responsibility | Today |
|---|---|---|
| **Quality scoring** | Notability / fame only | Mixed with tag, centrality, category in one scalar (F1) |
| **Landmark tiering** | Discretize fame into tiers (flagship / major / supporting / filler) | **Does not exist** (F7) |
| **Set construction** | Pick the *set* satisfying coverage constraints (≥N flagships, category mix, geographic spread) | Greedy-by-scalar, duration-first (F4) |
| **Route ordering** | Order the *fixed* set; walkability is a *soft cost* | Hard walkability filter can delete flagships (F3, F5) |

### 3.2 Proposed pipeline

```
retrieve
  → fame-prefilter        (CHEAP: batched sitelinks/pageviews, no deep enrich)
  → shortlist (~40)
  → deep-enrich shortlist ONLY     (fixes the 393s)
  → quality score          (notability/fame, no geography)
  → landmark tiering       (flagship / major / supporting / filler)
  → SET CONSTRUCTION       (constraint-based: ≥2-3 flagships, category caps, spread; duration as a SOFT range)
  → ROUTE ORDERING         (NN/2-opt; walkability SOFT cost; never delete a flagship)
  → narration
```

### 3.3 The unlocking signal: open, language-agnostic fame proxies (no hardcoded lists)

This is the answer to "how do we get must-see without per-city hardcoded lists."

1. **Wikidata sitelinks count** — the number of Wikipedia language editions a Q-item has. The single best open proxy for global fame. Approx: Puerta del Sol ~40+ sitelinks; Palacio Longoria ~a dozen; a minor church 1-2. **Currently unused.** Fetch **batched** via `wbgetentities` with many Q-ids in one call → cheap. (Q-ids come straight from OSM `wikidata` tags, available pre-enrichment.)
2. **Wikipedia pageviews** — Wikimedia REST pageviews API. Direct popularity. Icons have orders of magnitude more views. Good second axis.
3. **Wikidata `instance of` / heritage** — World Heritage Site, Bien de Interés Cultural, tourist attraction → tier bonus.
4. **OSM structural hint** — icons are usually mapped as `way`/`relation` with `wikidata` + `tourism=attraction`.

**Tier is defined relative to the city's own distribution**, not absolute thresholds: e.g. top quantile of a combined (sitelinks, pageviews) score = `flagship`, next band = `major`, etc. Relative-to-city thresholds **generalize automatically** to any city, in any language, with no hardcoded names.

**Optional safety net (NOT the primary mechanism):** a thin curated per-city allowlist may override the long tail. The system must produce a credible tour **without** it. If you find yourself depending on the allowlist, the tiering signal is mis-tuned.

### 3.4 Set construction objective

With ~40 candidates this is a small combinatorial problem; greedy-with-coverage-terms or short beam search is plenty.

**Maximize total saliency subject to constraints:**
- **Must include** ≥2-3 `flagship`-tier POIs (hard).
- **Category caps** — no category exceeds a ratio (reuse `classifyPoiTags` taxonomy).
- **Geographic spread** — must cover the historic core, not collapse to a <400m radius.
- **Duration** — a **soft** acceptable range, *not* the objective (this is the key inversion vs F4).

Walkability becomes a **soft penalty** during ordering, never a set-elimination filter. A long leg → soft cost, or a "5 min metro/taxi" transition hint between clusters — but **the flagship stays**. A real city intro includes Debod even if it means a longer walk.

### 3.5 Suggested type contracts (per stage)

Make stage boundaries explicit in types so an LLM/engineer can implement each independently:

```ts
// after retrieve + fame-prefilter
interface ScoredCandidate extends RawPoi {
  fame: {
    sitelinks: number;          // wikidata sitelink count
    pageviews: number | null;   // recent avg, null if unavailable
    heritage: boolean;          // WHS / BIC / etc.
  };
  fameScore: number;            // combined, city-relative-normalizable
}

// after tiering
type LandmarkTier = 'flagship' | 'major' | 'supporting' | 'filler';
interface TieredCandidate extends ScoredCandidate {
  tier: LandmarkTier;
  category: PoiCategory;        // from existing classifyPoiTags
}

// after set construction (before ordering)
interface SelectedSet {
  members: TieredCandidate[];   // satisfies coverage constraints
  diagnostics: {
    flagshipCount: number;
    categoryHistogram: Record<PoiCategory, number>;
    spatialSpreadMeters: number;
  };
}

// after ordering — reuse existing RouteSelectionResult shape
```

**Design rule:** different stages may use the same POI facts, but **no stage defines its own taxonomy or its own interpretation of duration.** One classifier (`classifyPoiTags`), one duration model.

---

## 4. What to keep vs change

| Keep | Change |
|---|---|
| Macro shape (retrieve→enrich→select→compose→narrate) | `score` as quality metric → reorient to fame (F1) |
| ~~Overpass fetcher (pool is already good)~~ **← WRONG, see Update log: had a harvesting bug, now fixed** | Hard segment filter (F3) → soft cost |
| Shared taxonomy `classifyPoiTags` | Centroid anchor + pure NN (F5) → anchor on historic core / flagship cluster |
| Explicit route degradation diagnostics | `rankSelectionCandidates`: duration as constraint, not objective (F4) |
| Pure helpers with tests (RouteSelection / DurationPlanning) | Distance penalty inside score (F2) → move to composition as soft cost |
| Duration planning structure | "ideal segment" 300-900m band for long tours (F6) |
| | Enrich-all-then-rank → fame-prefilter → enrich-shortlist (F8) |

---

## 5. Tests / fixtures (build these FIRST)

Without these you iterate blind: each live run is ~8 minutes. You must validate **product quality**, not just code correctness.

1. **Frozen pools** (JSON fixtures) per large city: Madrid, Rome, Paris, London × `history`. Capture the real Overpass + enrichment pool once and freeze it. Fully deterministic, zero network in tests.
2. **Must-see coverage acceptance:** given Madrid/history/240 pool, the final tour **must** contain ≥N of an expected icon set (Sol, Mayor, Palacio Real, Almudena, Debod, Puerta de Alcalá…). This expected set is the **evaluation oracle, NOT a production input** — production must discover them via tiering; the test only verifies it did.
3. **Anti-skew:** no category > X% of the tour; no tour with ≥3 memorial/artwork stops.
4. **Duration for rich cities:** 240min in a rich city ⇒ reasonable `coverageRatio` **and** ≥M flagships. High coverage with zero flagships = failure, not success.
5. **Geographic spread:** the tour must cover the historic core, not collapse to a <400m radius (catches the cluster bug).
6. **Tiering regression (unit, no network):** given mocked sitelinks/pageviews, assigned tiers match expectations.
7. **Generalization:** the same asserts run across all 4 cities. Passing Madrid but failing Rome = overfitting.

---

## 6. Implementation order (pragmatic)

1. **Fixtures + acceptance tests first.** Freeze pools, define must-see coverage. Without this you are blind. Unblocks everything.
2. **Instrument the current failure.** Log sets discarded by the hard segment filter (F3) and the spatial spread of the final tour (F5). Confirm with data before changing.
3. **Cheap fame signal + tiering.** Integrate sitelinks (batched `wbgetentities`) + pageviews. Add `tier` to candidates. Measure against fixtures.
4. **Move fame-prefilter before enrichment** → shortlist → enrich only the shortlist. Fixes the 393s along the way.
5. **Composition: hard walkability → soft.** Remove the `continue` at RouteSelection.ts:283-285; convert to penalty. Re-run acceptance tests.
6. **Set construction with flagship constraint** + anchor ordering on the flagship cluster instead of the centroid.
7. **Only then**, if still needed, re-tune score weights.
8. Validate live on Madrid / Rome / Paris / London.

**Do not touch fine ranker weights before step 7.** That is the trap to avoid: tuning the order of a shortlist when the real problems are the missing tier and the contradicting composition layer.

---

## 7. Risks

- **R1 (biggest):** tuning `scorePoi` weights will not fix this — the problem is that the score doesn't encode fame AND composition overrides the order. Every hour on weights is misdirected.
- **R2:** the hard segment filter (F3) may be silently dropping the best sets with no trace. Add logging before changing (step 2).
- **R3:** magic thresholds tied to the saturating score (7.5, ratios) are fragile; any scoring change causes invisible regressions without fixtures.
- **R4:** without product-quality tests, you can't tell if a change helps or hurts except via 8-minute live runs.
- **R5:** overfitting to `history`. The history theme tags are huge; food/art are thin (`themeTags.ts`). Fixes for Madrid/history may not transfer — test across cities and themes.

---

## 8. Verdict

**The base pipeline's macro shape is still valid, but the selection and composition layers need a partial redesign — not cosmetic tuning — before any further heuristic work.**

The system has never had a notion of fame or must-see. Its two relevant layers contradict each other: scoring tries to surface the good POIs; composition discards them by geometry and backfills with central, well-documented filler. While that holds, improving duration produces **more** mediocre stops, not better ones — exactly the latest run (10 stops / 181 min: coverage up, quality flat).

The fix is not a rewrite. **Add one stage (landmark tiering from open signals — Wikidata sitelinks + Wikipedia pageviews — with no per-city hardcoded lists) and reorient two (set selection by icon coverage; composition with soft walkability).** The same fame signal that fixes quality also fixes the enrichment time bottleneck, because it lets you shortlist cheaply before deep-enriching. That is the highest-leverage change available.

---

## Appendix A — Key file map

| Concern | File |
|---|---|
| Orchestration / pipeline glue | `backend/src/services/orchestrationService.ts` (`generatePlacesFromOsm`, ~368-550) |
| Ranking (quality scalar) | `backend/src/services/poi/PoiRanker.ts` |
| Route selection / composition | `backend/src/services/poi/RouteSelection.ts` |
| Duration planning | `backend/src/services/poi/DurationPlanning.ts` |
| POI taxonomy (shared) | `backend/src/domain/poi/PoiClassification.ts` |
| Theme → OSM filters | `backend/src/domain/poi/themeTags.ts` |
| Overpass fetch / priority groups | `backend/src/infrastructure/poi/OverpassPoiFetcher.ts` |
| Wikidata enrich | `backend/src/infrastructure/enrichment/WikidataEnricher.ts`, `WikidataClaimsEnricher.ts`, `wikidataClient.ts` |
| Wikipedia enrich | `backend/src/infrastructure/enrichment/WikipediaEnricher.ts` |
| POI cache | `backend/src/infrastructure/postgres/PostgresPoiCacheRepository.ts` |

## Appendix B — Exact change points (line refs at time of writing)

- Distance penalty to remove from scoring: `PoiRanker.ts:72-74`.
- Hard walkability filter to soften: `RouteSelection.ts:283-285`.
- Duration-first route ranking to invert: `RouteSelection.ts:244-255`.
- Centroid anchor + NN to re-anchor: `RouteSelection.ts:157-215`.
- Ideal-segment band to relax for long tours: `RouteSelection.ts:101`.
- Category-ratio threshold coupled to score: `RouteSelection.ts:217-224`.
- Enrich-all-before-select to invert: `orchestrationService.ts:450-464`.
- Dead `estimatedDuration` field: `orchestrationService.ts:498` vs `RouteSelection.ts:80`.

## Appendix C — Signals cheat-sheet for tiering

| Signal | Source | Cost | Pre-enrich available? |
|---|---|---|---|
| Wikidata sitelinks count | `wbgetentities` (batched) | Cheap (1 call / many Qids) | Yes (Qid from OSM tag) |
| Wikipedia pageviews | Wikimedia REST pageviews API | Medium (per-article) | Yes (title from OSM tag) |
| Heritage designation | Wikidata claims | Already fetched in deep enrich | Partial |
| `instance of` types | Wikidata claims | Deep enrich | No |
| `tourism=attraction` + way/relation | OSM tags | Free | Yes |

Tier assignment is **relative to the city's own distribution** of the combined (sitelinks, pageviews) score → generalizes to any city without hardcoded lists.
