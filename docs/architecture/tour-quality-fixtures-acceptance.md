# Tour Quality — Fixtures & Acceptance Oracle

Status: **design brief, not yet implemented**
Date: `2026-05-30`
Audience: another LLM / engineer implementing the regression harness for tour quality.

Related:
- `docs/architecture/tour-quality-landmark-tiering.md` — the design brief (tiering, set construction, composition). Read first.
- `docs/working/05-agent-log.md` (2026-05-30 entry) — the harvesting fix that unblocked this work.
- `backend/scripts/validation/diagnose-shortlist.ts` — existing stage-by-stage diagnostic; the seed of the capture tooling described here.

---

## 0. Why this exists

Tour quality is currently validated by **live runs** that take ~5 minutes each (Overpass fetch + 175s enrichment + 79s narration) and depend on external APIs that return **different data run-to-run** (we observed Overpass returning 91, 111, then 300 POIs across runs due to 504s). You cannot tune selection/composition heuristics safely against a moving, slow, network-bound target.

**Goal:** a deterministic, offline, fast regression suite that asserts **product quality** of the tour — not just code correctness — and runs in CI/`jest` with **zero network**.

This is the prerequisite for the remaining work (CASE 3: set construction — dedup, flagship coverage, ordering). Without it, every heuristic change is an eyeball gamble.

---

## 1. What the live run currently produces (baseline to lock in)

`Madrid / history / es / 240` after the harvesting fix (2026-05-30):

```
9 stops, 182 min, coverageRatio 0.758, degraded=false
1. Museo del Prado            [museum]
2. Estación de Atocha         [other]
3. Museo Nacional Centro de Arte Reina Sofía [museum]
4. Real Basílica de San Francisco el Grande  [religious]
5. Catedral de la Almudena    [religious]
6. Palacio Real               [palace_castle]   ← Q171517
7. Palacio Real de Madrid     [museum]           ← Q171517  (DUPLICATE of #6)
8. Puerta del Sol             [square_civic]
9. Plaza Mayor                [square_civic]
```

This is a good product result (real anchors present), with **two known defects** that the acceptance suite must catch on day one:

- **DEFECT A — duplicate landmark:** stops #6 and #7 are the same building (wikidata `Q171517`), mapped as two OSM elements. Dedup is by `osmType:osmId`, which does not collapse same-wikidata duplicates.
- **DEFECT B — dropped flagships:** Templo de Debod (`Q1140249`, shortlist rank 9, flagship) and Puerta de Alcalá (`Q1140634`, rank 15, flagship) are missing from the final tour despite being must-sees.

**Implementation rule:** write these two as *failing* acceptance tests first, then make them pass. They are the spec for the next phase.

---

## 2. Freeze at two levels

The pipeline has two distinct failure surfaces. Freeze a fixture for each so tests are deterministic and fast.

### Level 1 — Raw pool + sitelinks (validates harvesting → tiering → shortlist)

Captures the cheap front half. Lets tests assert: *"do the expected anchors survive into the top-N shortlist as flagship/major?"* — exactly where the harvesting bug lived. No enrichment needed.

```jsonc
// fixtures/pools/madrid-history.json
{
  "city": "Madrid",
  "theme": "history",
  "capturedAt": "2026-05-30",
  "geocode": { "lat": 40.4168, "lng": -3.7035, "boundingBox": { /* ... */ } },
  "rawPois": [ /* full RawPoi[] from Overpass — 300 items */ ],
  "sitelinks": { "Q160112": 80, "Q1123493": 37, "Q427163": 34, /* ... */ }
}
```

### Level 2 — Route-candidate input (validates set construction → composition)

Captures the exact array passed to `composeWalkingRoute`. This is the **highest-value fixture for the current CASE 3 work** because composition becomes fully deterministic and offline (it needs no network at all — `composeWalkingRoute` is already a pure function).

```jsonc
// fixtures/candidates/madrid-history.json
{
  "city": "Madrid", "theme": "history", "requestedDuration": 240,
  "stopBounds": { "minStops": 6, "maxStops": 10 },
  "candidates": [
    {
      "name": "Museo del Prado",
      "wikidataId": "Q160112",
      "coordinates": { "lat": 40.4138, "lng": -3.6921 },
      "importance_score": 12.3,     // PoiRanker score
      "fameScore": 25.02,
      "landmarkTier": "flagship",
      "category": "museum"
    }
    // ... 40 shortlisted, enriched, ranked candidates
  ]
}
```

> Note: Level 2 capture requires running enrichment once (slow, networked) to populate `importance_score`. That is a **one-time capture cost**; the test replays the frozen snapshot offline. Re-capture only when ranker inputs change materially.

---

## 3. Capture tooling

Extend `diagnose-shortlist.ts` (or add a sibling `capture-fixture.ts`) with a `--write` mode that dumps both levels to `backend/fixtures/`. It already runs geocode → raw pool → sitelinks → tiering; add:
- write Level 1 after tiering;
- run enrichment + rank + build route candidates, then write Level 2.

Keep capture **explicit and manual** (never in CI) — fixtures are committed artifacts, refreshed deliberately.

---

## 4. The acceptance oracle

### 4.1 Core principle

The expected-anchor lists are an **evaluation oracle, NOT a production input.** Production must discover anchors via fame/tiering (already does). The oracle only verifies that discovery worked. **Never** import these lists into `src/`. If a future change makes production read them, the test is meaningless.

### 4.2 Per-city anchor sets (evaluation only)

Curated "a first-time visitor would expect these" sets. Used only to score test runs.

```jsonc
// fixtures/oracle/anchors.json  (TEST-ONLY)
{
  "Madrid/history":  ["Q160112" /*Prado*/, "Q1123493" /*Plaza Mayor*/, "Q427163" /*Puerta del Sol*/,
                      "Q849711" /*Almudena*/, "Q171517" /*Palacio Real*/, "Q1140249" /*Debod*/,
                      "Q1140634" /*Puerta de Alcalá*/, "Q239686" /*Reina Sofía*/],
  "Paris/history":   ["Q243" /*Tour Eiffel*/, "Q2981" /*Notre-Dame*/, "Q19675" /*Louvre*/,
                      "Q160236" /*Arc de Triomphe*/, "Q188856" /*Sacré-Cœur*/, ...],
  "Rome/history":    ["Q10285" /*Colosseo*/, "Q170494" /*Pantheon*/, "Q1010447" /*Fontana di Trevi*/,
                      "Q42182" /*Foro Romano*/, "Q12512" /*Castel Sant'Angelo*/, ...],
  "London/history":  ["Q9202" /*Tower of London*/, "Q41225" /*Big Ben/Westminster*/, "Q23311" /*Buckingham*/,
                      "Q123559" /*St Paul's*/, "Q2745" /*British Museum*/, ...]
}
```

> Q-ids must be verified at authoring time (the Paris/Rome/London ones above are placeholders to fill from the captured pools).

### 4.3 Assertions

Run against the frozen fixtures. Each is a quality gate.

**Level 1 (shortlist quality):**
1. **Anchor → shortlist coverage:** ≥ K of the city's anchor set appear in the top-N shortlist with tier `flagship` or `major`. (Madrid: expect ~7/8.)
2. **Sitelinks coverage:** ≥ 80% of wikidata-tagged POIs in the pool resolved `sitelinks > 0` (detects the silent-zero lookup failure).
3. **Tier sanity:** flagship count is within an expected band (not 0, not "everything").

**Level 2 (final tour quality):**
4. **Anchor → final-tour coverage:** ≥ M of the anchor set appear in the final route. (This is the headline product metric. **DEFECT B** makes Debod/Alcalá fail this today.)
5. **No duplicate landmark:** no two stops share a `wikidataId`. (**DEFECT A** fails this today.)
6. **Category anti-skew:** no single `PoiCategory` exceeds X% of stops; no tour with ≥3 `memorial`/`artwork`.
7. **Geographic spread:** route radius covers the historic core; not collapsed to < 400 m, not blown out beyond the duration's plausible reach.
8. **Duration fit:** `coverageRatio` within [0.7, 1.15] for a landmark-rich city; not `degraded`.
9. **Flagship floor:** final tour contains ≥ required flagships for the duration (the constraint set-construction already claims to enforce).

### 4.4 Generalization gate

The **same** assertion code runs across Madrid / Paris / Rome / London. A change that fixes Madrid but regresses Rome must fail. This is the guard against overfitting `history`/Madrid (a named risk in the design brief).

---

## 5. Test harness shape

```
backend/
  fixtures/
    pools/        madrid-history.json, paris-history.json, ...   (Level 1)
    candidates/   madrid-history.json, ...                       (Level 2)
    oracle/       anchors.json                                   (TEST-ONLY)
  src/services/poi/
    TourQuality.acceptance.test.ts
```

- `TourQuality.acceptance.test.ts` loads fixtures, runs `tierPoisByLandmarkFame` (Level 1) and `composeWalkingRoute` (Level 2) **with no network**, and asserts §4.3.
- Table-driven over the city list so adding a city = adding two fixtures + one oracle entry.
- Fast (pure functions over frozen JSON) → runs in the normal `jest` suite.

---

## 6. Implementation order

1. **Wikidata dedup** in harvesting/tiering (collapse same-`wikidataId` POIs, keep the richest element). Fixes DEFECT A. Cheap, high impact — do first, independently of fixtures.
2. **Capture Level 1 + Level 2 fixtures for Madrid/history** from the current good run.
3. **Write `TourQuality.acceptance.test.ts`** with assertions §4.3. Encode DEFECT A and DEFECT B as the initial expectations. A passes (after step 1); B fails — that failing test is the spec for step 4.
4. **Set-construction tuning** to satisfy anchor→final coverage (DEFECT B): get Debod/Alcalá in without losing plausibility. Likely needs the "historic core coverage" notion and/or a higher flagship floor with smarter spatial cost.
5. **Add Paris / Rome / London fixtures + oracle entries.** Run the generalization gate. Fix what regresses.
6. Only then, further ranker/fame tuning if still needed.

---

## 7. Pitfalls & maintenance

- **OSM data drift.** Fixtures freeze a snapshot; real OSM changes (a POI retagged, a new wikidata link). Policy: fixtures are intentionally stale and refreshed deliberately (e.g. quarterly or when a live run diverges from fixtures). Record `capturedAt`. Do **not** auto-refresh in CI — that reintroduces non-determinism.
- **Sitelinks drift.** Wikidata sitelink counts change slowly; frozen in the fixture, so tests stay stable. Re-capture with the pool.
- **Oracle leakage.** Keep `oracle/anchors.json` out of `src/`. Add a lint/test check that no production file imports from `fixtures/oracle/`.
- **Don't over-fit the oracle.** Anchor sets should be the genuinely obvious must-sees, ~6-10 per city. If you find yourself adding obscure POIs to make a test pass, the fame logic is wrong — fix the logic, not the oracle.
- **Capture honesty.** Level 2 capture depends on enrichment, which can partially fail. Capture should assert sitelinks coverage and enrichment completeness before writing, so a degraded capture doesn't become a misleading "golden" fixture.

---

## 8. Definition of done

- Madrid/history acceptance test green for assertions 1-3, 5-9; assertion 4 (anchor coverage) green after set-construction tuning includes Debod/Alcalá.
- No duplicate-wikidata stops in any city.
- Paris/Rome/London fixtures present; generalization gate green.
- Heuristic changes can be evaluated in seconds offline instead of ~5-minute live runs.
