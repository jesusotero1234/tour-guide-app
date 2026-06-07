# POI Selection Pipeline Rework Plan

> **⚠️ Partially superseded (2026-05-30).** The quality diagnosis and the long-tour
> composition direction have been deepened and made implementation-ready in
> [Tour Quality — Landmark Tiering, Set Construction & Composition](./tour-quality-landmark-tiering.md).
> Read that doc first for the current plan (fame-based landmark tiering, set construction,
> soft walkability, and the order of work). This document remains valid for the
> already-closed items (taxonomy, ranker cleanup, duration extraction, enrichment serialization).

Status: partially implemented and revised after live Madrid runtime

## Goal

Stabilize the active POI selection and walking-route composition pipeline before adding more heuristics.

This document captures:
- the current architecture,
- the main structural problems,
- the target design direction,
- the execution order for implementation.

## Current Status

Implemented after this plan was created:
- backend Jest baseline for POI selection logic
- shared POI classification module used by ranking and composition
- `PoiRanker` simplified to ordering only
- route selection extracted to a pure helper with tests
- duration planning extracted to a shared helper
- Wikidata client serialization to avoid concurrent rate-limit races

New live runtime evidence from `Madrid / history / es / 240`:
- the candidate pool is no longer the primary bottleneck
- the ranked shortlist already contains strong landmarks
- the final route still collapses into a compact inner-center cluster
- estimated route duration stayed far below target (`coverageRatio ~= 0.297`)

This changed the diagnosis:
- the main open problem is now long-tour route composition and product-fit,
- not only POI harvesting or simple ranker weight tuning.

## Current Architecture

Active pipeline in `backend/src/services/orchestrationService.ts`:

1. geocode city
2. fetch raw POIs from cache or Overpass
3. enrich all fetched POIs with Wikidata and Wikipedia
4. rank enriched POIs with `PoiRanker`
5. cut `topN` based on requested duration
6. compose walking route from the shortlisted candidates
7. apply category diversity while building the selected prefix
8. repair duration if the route is too short
9. generate narration for the final route

Supporting modules:
- `backend/src/domain/poi/themeTags.ts`: theme-specific OSM retrieval logic
- `backend/src/infrastructure/poi/OverpassPoiFetcher.ts`: prioritized candidate harvesting
- `backend/src/services/poi/PoiRanker.ts`: scalar ranking score
- `backend/src/infrastructure/enrichment/*`: Wikidata/Wikipedia enrichment

## Current Strengths

- The macro pipeline shape is correct: retrieve, enrich, select, compose, narrate.
- Candidate harvesting happens before ranking and narration.
- Route degradation is explicit instead of silent.
- The repo already contains postmortem evidence that candidate-pool failures must be fixed upstream, not patched downstream.

## Structural Problems

### 1. Responsibility boundaries are blurred

- Fetching contains product semantics through large hand-authored OSM filters.
- Ranking mixes notability, thematic fit, centrality, and category bias in one scalar score.
- Composition is repairing category skew and duration problems that often originate earlier.

### 2. Taxonomy logic is duplicated

- Category-sensitive ranking lives in `PoiRanker.ts`.
- Category inference for diversity lives separately in `orchestrationService.ts`.
- This creates drift risk: ranking and diversity can reason about the same POI differently.

### 3. Duration is fragmented across stages

Requested duration currently affects:
- candidate count,
- stop bounds,
- route feasibility,
- repair heuristics,
- degraded output status.

This is workable, but difficult to tune safely because the same product requirement is encoded in several disconnected knobs.

### 4. Diversity is too late in the pipeline

- The current diversity logic operates after global ranking and after spatial ordering.
- If the shortlist is already skewed, diversity can only soften the skew, not correct it.

### 5. Enrichment reliability is a product-critical dependency

- Ranking quality improves sharply when enrichment works.
- If enrichment partially fails, the system falls back to OSM-tag bias.
- This makes route quality unstable across runtime conditions and cities.

### 6. Validation is too weak for safe heuristic iteration

- Existing validation is mostly manual or eyeball-based.
- There is no fixture-based regression suite to detect over-skew by category or city.

## Architecture Direction

The base logic is salvageable. A full rewrite is not the recommended first move.

The target direction is to make stage contracts clearer without replacing the whole pipeline:

1. retrieval
2. normalization and canonical POI classification
3. enrichment
4. ranking
5. shortlist selection under duration constraints
6. route ordering and composition
7. narration and assets

Key design rule:

Different stages may use the same POI facts, but they should not each define their own taxonomy or their own interpretation of duration.

## Product Direction

The product target is not just "valid historical POIs".

The target is a tour that feels close to what a commercial tourism page would offer for a first visit:
- recognizable landmarks,
- a coherent story of the city,
- reasonable variety,
- plausible walking structure,
- duration that roughly matches the request.

Important consequence:

For a landmark-rich city, a compact 60-90 minute route for a 240-minute request is not acceptable graceful degradation. It is a selection/composition failure.

The system should prefer:
- a somewhat broader but product-credible route,
- over a tiny hyper-compact cluster of merely valid POIs.

## Execution Plan

### Phase A: validation baseline

Objective:
- create deterministic tests around the ranking and classification logic before further tuning.

Planned work:
- add backend Jest configuration if missing
- add unit tests for POI classification
- add unit tests for ranking ordering and missing-enrichment safety

Expected outcome:
- future heuristic changes can be measured instead of eyeballed

### Phase B: canonical taxonomy

Objective:
- create one shared POI category classifier used by both ranking and route diversity.

Planned work:
- add a shared POI classification module
- make `PoiRanker` depend on that module
- make route composition use the same category output

Expected outcome:
- ranking and diversity operate on the same category model

### Phase C: responsibility cleanup

Objective:
- remove small but real boundary leaks before deeper tuning.

Planned work:
- make `PoiRanker` responsible only for ordering, not internal slicing
- keep shortlist cutting in orchestration where duration context already exists

Expected outcome:
- less duplicated responsibility around `topN`

### Phase D: enrichment hardening

Objective:
- reduce the chance that runtime enrichment instability dominates route quality.

Planned work:
- audit concurrency and retry behavior for Wikidata requests
- add regression checks for low-enrichment scenarios

Expected outcome:
- ranking quality degrades more predictably under external API pressure

### Phase E: duration model simplification

Objective:
- reduce fragmented duration logic only after baseline validation exists.

Planned work:
- consolidate duration knobs into clearer selection/composition constraints

Expected outcome:
- easier tuning and fewer accidental regressions

### Phase F: fixture-driven product validation

Objective:
- validate the route against product expectations, not only code-level correctness.

Planned work:
- add frozen fixture pools for major-city history tours
- define acceptance checks for long-duration routes
- verify both landmark coverage and route plausibility

Expected outcome:
- future changes are measured against a realistic tour-product bar

### Phase G: long-tour composition correction

Objective:
- stop long tours from collapsing into a tiny walkable core when the city has enough supply.

Planned work:
- scale segment tolerance with requested duration
- treat low coverage in landmark-rich cities as a composition failure
- retry degraded routes with an alternative spatial ordering strategy
- optimize walkability after landmark/product coverage, not before it

Expected outcome:
- long tours stay believable as tour products rather than short local walks

## Closed Items

Closed or substantially addressed from the original plan:
- validation baseline: started and in use
- canonical taxonomy: implemented
- ranker responsibility cleanup: implemented
- enrichment hardening: partially implemented through serialized Wikidata access and safer tests
- duration planning extraction: implemented

## Open Items

Open architectural work before more heuristic tuning:
- fixture-based multi-city acceptance tests
- route composition changes for long tours
- explicit product-fit checks for landmark-rich cities
- only after that: further ranker tuning if still necessary

## Risks

- Overfitting the history theme and breaking architecture, food, or art.
- Increasing abstraction too early and making the code harder to inspect.
- Treating composition as the place to fix upstream retrieval or ranking failures.
- Continuing to tune heuristics without a regression baseline.

## Decision

Recommended path:
- do not rewrite the whole POI pipeline now
- do not keep adding heuristics on top of the current structure without cleanup
- do not jump yet to archetype-heavy selection frameworks
- first validate and fix long-tour composition against product-like city-tour expectations

## Implementation Order

1. keep the implemented baseline and shared taxonomy as the stable base
2. add frozen acceptance fixtures for major-city history tours
3. fix long-tour route composition and degraded-route retry strategy
4. verify live runs against Madrid, Paris, Rome, and London style expectations
5. only then continue with additional ranking or retrieval heuristics if still needed
