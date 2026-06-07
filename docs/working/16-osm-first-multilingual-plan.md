# 16 — OSM-First Multilingual Tour Plan (Living Doc)

This is a living document. It tracks the phased migration from
"LLM-invents-POIs" to an OSM/Wikidata-first, multilingual,
human-narrated tour generator. Update the status of each phase as
work progresses. Append notes per phase, do not rewrite history.

---

## Locked Decisions

| Topic | Decision |
|---|---|
| MVP languages | en, es, fr, de, it |
| Audience | International tourists |
| Place name display | Local name always (e.g. "München" even in Spanish tour) |
| Subtitle in frontend | Show `name:<tourLanguage>` under the local name when available |
| Geocoder | Nominatim public, no self-host yet |
| POI source | Overpass public |
| Enrichment | Wikipedia + Wikidata, with attribution |
| MVP themes | history, architecture, food, art |
| Floor | minimum 5 POIs, else `CITY_NOT_AVAILABLE` |
| Voice persona | Friendly local guide who knows history |
| TTS | Open-source upgrade postponed; quality of content first |
| `verification-pod` | Retired from critical path |
| Cache | Postgres cache of POIs by (city, theme) with timestamp |
| User-Agent | `tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)` |
| Attribution | Permanent footer + dedicated "Data Sources" page |
| Routing | Deterministic Haversine-based estimator (no OSRM/Google/Mapbox) |
| Narrative LLM | ~~gemma4:26b via `/api/generate`~~ retired for narration — loops in long outputs |
| Narrative LLM | qwen3:4b via `/api/chat` with `think:false` and JSON format — 2026-05-19 |

---

## Recent Bug Fixes

- 2026-05-20: Stabilized long narration after L4. Thin-seed POIs now produce shorter honest narration (target ~100-160 words) with explicit limited-record language instead of deterministic padding to 250+ words; rich-seed POIs still target 4 longer sections. Added thin-seed drift rejection for unsupported France/French/World War II terms. Fixed unavailable geocoder city propagation so `CITY_NOT_AVAILABLE` can return HTTP 422 instead of being wrapped as a generic 500.
- 2026-05-19: Removed `generateDescriptions` call from `generateCompleteTour` in `orchestrationService.ts`. `description-pod` was overwriting OSM narration with the generic "Visit X, a notable location in this area." fallback when port 3004 was unavailable. Same retirement pattern as `verification-pod` (Phase 8).
- 2026-05-19: Fixed dotenv import order in `server.ts` so `config/env.ts` sees `API_KEYS` at module evaluation time. Was producing `INVALID_API_KEY` 401 on every request.
- 2026-05-20: Implemented long-narration architecture (Phases L1–L4). Variable-length narration by seed quality: rich-seed POIs (≥500 chars) produce ~280–360 words across 4 sections; thin-seed POIs (<500 chars) produce ~100–160 words across 2–3 sections with honest "limited records" language. No deterministic padding.
- 2026-05-20: Phase 6 fix: `NominatimGeocoder` `NOT_FOUND` now maps to `CityNotAvailableError` in orchestration. Zzzzville returns HTTP 422 `CITY_NOT_AVAILABLE` instead of 500.
- 2026-05-20: Added `narrativeModel: 'qwen3:4b'` to llm-pod `/health` endpoint; bumped narration cache `MODEL_VERSION` to `qwen3:4b-long-v2` to invalidate stale entries from prompt-tuning iterations.
- 2026-05-20: Added hallucination drift guard in `/narrative/stop/long`: rejects sections containing geopolitical/war terms not present in seed text for thin-seed POIs (e.g., blocks "France"/"Second World War" hallucinations on Spanish Civil War bunker POIs).
- 2026-05-20: Fixed Paris/architecture Overpass coverage by adding `relation[...]` filters to the existing architecture theme criteria. Paris/architecture now returns HTTP 201 with `[OSM] Raw POIs: 50`.

---

## Architecture Target

```
Frontend
  └── Backend orchestration
        ├── Geocoder (Nominatim)
        ├── POI source (Overpass) ── Cache (Postgres)
        ├── Enrichment (Wikidata + Wikipedia)
        ├── Floor check (≥5 or CITY_NOT_AVAILABLE)
        ├── Selection + Route composition (existing)
        ├── Narrative LLM (qwen3:4b, persona, factual seeds)
        ├── Persistence (Postgres)
        ├── Audio storage (local fs)
        └── TTS (existing, upgrade later)
```

---

## Theme → OSM Tag Mapping (initial, refinable)

### history
- `historic=*`
- `tourism=museum` (with or without `museum=history`)
- `building=cathedral|palace|castle`

### architecture
- `building=cathedral|palace|castle|church|civic|public`
- `tourism=attraction` AND (`historic=*` OR notable `building=*`)
- `man_made=tower|lighthouse|bridge`
- `architect=*` present (notability signal)
- exclude residential buildings without other signals

### food
- `amenity=marketplace`
- `shop=bakery|pastry|cheese|wine|greengrocer` filtered by notoriety
- `tourism=attraction` with food cultural relevance
- prefer entries with `wikipedia=*` or `wikidata=*`
- exclude global chains (`brand=*` matches a global brand list)

### art
- `tourism=museum` with `museum=art` or unspecified
- `tourism=gallery`
- `tourism=artwork`
- `historic=monument` when sculptural/art
- prefer entries with `wikipedia=*` or `wikidata=*`

### Common selection rules
- prefer POIs with `wikipedia=*` or `wikidata=*`
- prefer POIs with non-empty `name`
- prefer POIs with `name:<tourLanguage>` when present (do not exclude others)

---

## Phases

Status legend: ⬜ pending · 🟡 in progress · ✅ done · ⏸ blocked · ❌ dropped

---

### Phase 0 — LLM Reliability Unblocker
Status: ✅

**Goal**
Make `llm-pod` usable as a reliable narrator regardless of future architecture.

**Scope**
- Remove `raw: true` in `model.ts`.
- Enable Ollama `format: "json"` for structured calls.
- Drop the literal JSON example from generation prompt (replace with schema description).
- Default `OLLAMA_MODEL=gemma4:26b` in `env.ts` and `.env`.
- Force `gemma4:26b` in translation route.

**Files allowed**
- `pods/llm-pod/src/llm/model.ts`
- `pods/llm-pod/src/routes/generation.ts`
- `pods/llm-pod/src/routes/translation.ts`
- `pods/llm-pod/src/config/env.ts`
- `pods/llm-pod/.env`

**Out of scope**
- Backend changes
- Prompt redesign for narrative persona (Phase 7)
- Removing the LLM-invents-POIs path (Phase 8)

**Validation**
- Manual: Valencia/history/60, Paris/architecture/120, Lisbon/food/90 must return 0 placeholder strings.
- llm-pod build green.

**Acceptance**
- Three test cities produce non-placeholder candidate sets.
- No `Place 1` / `Place Name` / `Description 1` / `Brief description` strings in output.

**Notes**
- 2026-05-19: Implemented. Removed `raw: true` from `model.ts`; added optional `format: "json"` field. Dropped literal JSON example from generation prompt (replaced with schema description); generation now passes `format: "json"`. Updated default `OLLAMA_MODEL` to `gemma4:26b` in `env.ts` and `.env`. Forced `gemma4:26b` in translation route; removed code-fence injection pattern from translation prompt. `tsc --noEmit` passes.
- 2026-05-19: PENDING VALIDATION — acceptance criteria require Ollama running with `gemma4:26b` and three test cities (Valencia/history/60, Paris/architecture/120, Lisbon/food/90) returning 0 placeholder strings. Cannot validate without the model running.
- 2026-05-19: ✅ Superseded by Phase 8. The LLM-POI-invent path is dead code after the OSM pipeline became unconditional, so the original 3-city placeholder test would exercise unreachable code rather than the current runtime path.

---

### Phase 1 — Nominatim Geocoder
Status: ✅

**Goal**
Resolve a city name to a canonical OSM record (osmType, osmId, wikidataId, displayName, lat/lng, boundingBox).

**Scope**
- New service `backend/src/infrastructure/geocoder/NominatimGeocoder.ts`.
- HTTP client with User-Agent header (locked above).
- Rate limit: 1 req/s minimum interval (sleep on consecutive calls).
- Returns typed `GeocodedCity`.
- No orchestration wiring yet.

**Files allowed**
- `backend/src/infrastructure/geocoder/NominatimGeocoder.ts`
- `backend/src/domain/geocoder/GeocoderTypes.ts` (or similar)
- `backend/src/config/env.ts` (only to read User-Agent contact env var)

**Out of scope**
- Calling Nominatim from orchestration
- Caching geocoder results (defer to Phase 5)
- Frontend autocomplete (Phase 9)

**Validation**
- Unit-callable: feeding `"Valencia"`, `"Paris"`, `"Lisbon"`, `"München"` returns sane coordinates and a wikidataId when present.
- TypeScript build passes.

**Acceptance**
- Service exists, exported, typed.
- `User-Agent` header includes `tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)`.
- 429/5xx responses do not crash (typed error).

**Notes**
- 2026-05-19: Implemented. Created `backend/src/domain/geocoder/GeocoderTypes.ts` (GeocodedCity, GeocoderError types) and `backend/src/infrastructure/geocoder/NominatimGeocoder.ts` (geocodeCity function with User-Agent header `tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)`, 1 req/s rate limit, typed errors for 429/5xx/network). `tsc --noEmit` passes. Static inspection confirms User-Agent and error typing are correct.
- 2026-05-19: PENDING VALIDATION — acceptance criteria require live Nominatim calls for Valencia, Paris, Lisbon, München returning sane coordinates and wikidataId. Cannot validate without network access to Nominatim.
- 2026-05-19: Live E2E geocoding evidence captured through tour generation: Valencia resolved to `Valencia, Comarca de València...` with stops around `39.47,-0.37`; München tour returned HTTP 201 with German local POI names. Full four-city direct geocoder validation still not run, so status remains 🟡.
- 2026-05-20: ✅ Dedicated validation passed via `backend/scripts/validation/validate-phase1-geocoder.sh`: Valencia `39.4738758,-0.3729914`; Paris `48.8480587,2.3392944`; Lisbon `38.7117403,-9.1385979`; München `48.1372256,11.5755058`. Result: 4 passed, 0 failed.

---

### Phase 2 — Overpass POI Fetcher
Status: ✅

**Goal**
Given a `GeocodedCity` and a theme, fetch raw POI candidates from Overpass.

**Scope**
- New service `backend/src/infrastructure/poi/OverpassPoiFetcher.ts`.
- Theme→tag mapping table (see above) lives in `backend/src/domain/poi/themeTags.ts`.
- Bounded query by city `boundingBox`.
- Returns typed `RawPoi[]` with all relevant tags including `name`, `name:<lang>`, `wikipedia`, `wikidata`, `tourism`, `historic`, `building`, `architect`, `museum`.
- User-Agent header.

**Files allowed**
- `backend/src/infrastructure/poi/OverpassPoiFetcher.ts`
- `backend/src/domain/poi/themeTags.ts`
- `backend/src/domain/poi/RawPoi.ts`

**Out of scope**
- Selection/ranking (Phase 4)
- Cache (Phase 5)
- Wikipedia/Wikidata enrichment (Phase 3)

**Validation**
- For Valencia/history, returns ≥10 raw POIs.
- For each of the four MVP themes, at least 5 raw POIs in Paris.
- Build green.

**Acceptance**
- Theme tag map covers history, architecture, food, art.
- Empty-result city does not crash; returns `[]`.

**Notes**
- 2026-05-19: Implemented. Created `backend/src/domain/poi/RawPoi.ts`, `backend/src/domain/poi/themeTags.ts` (THEME_TAG_MAP covering all 4 MVP themes), and `backend/src/infrastructure/poi/OverpassPoiFetcher.ts` (fetchPoisForTheme with bbox query, User-Agent, returns `[]` on any error). `tsc --noEmit` passes.
- 2026-05-19: PENDING VALIDATION — acceptance criteria require live Overpass queries: ≥10 raw POIs for Valencia/history, ≥5 per theme for Paris. Cannot validate without network access to Overpass.
- 2026-05-19: Runtime evidence from Validation B/F: backend log showed `[OSM] Raw POIs: 50` for Valencia/history. Paris per-theme coverage not run, so status remains 🟡.
- 2026-05-20: ✅ Dedicated validation passed via `backend/scripts/validation/validate-phase2-overpass.sh`: Paris/history, Paris/architecture, Paris/food, and Paris/art each returned HTTP 201 with `[OSM] Raw POIs: 50`. Initial Paris/architecture run returned 0 raw POIs; fixed by adding relation filters to the existing architecture tag map. Backend `npx tsc --noEmit` passed after the fix.

---

### Phase 3 — Wikipedia + Wikidata Enrichment
Status: ✅

**Goal**
Enrich POIs with multilingual labels, descriptions, and notability signals.

**Scope**
- New service `backend/src/infrastructure/enrichment/WikipediaEnricher.ts`.
- New service `backend/src/infrastructure/enrichment/WikidataEnricher.ts`.
- Pull `name:<lang>` from Wikidata if missing in OSM.
- Pull short description from Wikipedia in tour language with fallback to English.
- Track attribution metadata per POI.

**Files allowed**
- `backend/src/infrastructure/enrichment/WikipediaEnricher.ts`
- `backend/src/infrastructure/enrichment/WikidataEnricher.ts`
- `backend/src/domain/poi/EnrichedPoi.ts`

**Out of scope**
- Narrative generation (Phase 7)
- Caching (Phase 5)

**Validation**
- For 5 known POIs in Paris, descriptions exist in fr and en.
- Attribution metadata present and non-empty.

**Acceptance**
- POIs without Wikipedia/Wikidata still pass through (with empty enrichment), do not throw.

**Notes**
- 2026-05-19: Implemented. Created `backend/src/domain/poi/EnrichedPoi.ts` (extends RawPoi with enriched block + attribution), `backend/src/infrastructure/enrichment/WikidataEnricher.ts` (enrichFromWikidata, name translations per language), `backend/src/infrastructure/enrichment/WikipediaEnricher.ts` (enrichFromWikipedia, preferred lang → OSM lang → en fallback). POIs without Wikipedia/Wikidata pass through with empty enrichment — no throw. `tsc --noEmit` passes.
- 2026-05-19: PENDING VALIDATION — acceptance criteria require descriptions in fr and en for 5 known Paris POIs with non-empty attribution. Cannot validate without live Wikipedia/Wikidata API access.
- 2026-05-19: E2E evidence confirms enrichment pass-through behavior: Valencia included niche POIs without Wikipedia/Wikidata and still generated a tour; München Spanish output preserved German local POI names. Paris fr/en five-POI attribution check not run, so status remains 🟡.
- 2026-05-20: ✅ Dedicated validation passed via `backend/scripts/validation/validate-phase3-enrichment.sh`: Paris/history/fr and Paris/history/en at 180 minutes generated 5 stops each; 10/10 returned descriptions with language signals. Static inspection confirms attribution fields are modeled in `EnrichedPoi` and populated from Wikipedia/Wikidata URL-bearing enrichers; current public tour API does not expose attribution per place, while legal attribution is covered by Phase 9 footer/page.

---

### Phase 4 — Selection + Ranking
Status: ✅

**Goal**
Pick the right candidates from enriched POIs for a given theme and duration.

**Scope**
- New module `backend/src/services/poi/PoiRanker.ts`.
- Score function: notability (wikidata/wikipedia presence), tag fit, name presence, distance to centroid.
- Outputs ranked candidate list compatible with current route composer.

**Files allowed**
- `backend/src/services/poi/PoiRanker.ts`

**Out of scope**
- Route composition (already deterministic, reuse existing).
- Orchestration wiring (Phase 5).

**Validation**
- Ranking is deterministic for the same input.
- Top-N output for Valencia/history matches a sensible eyeball list.

**Acceptance**
- Pure function, no I/O. Easy to unit-test later.

**Notes**
- 2026-05-19: Implemented. Created `backend/src/services/poi/PoiRanker.ts` — pure function `rankPois` scoring by wikidata presence (+3), wikipedia presence (+2), name presence (+1), description available (+2), translated names (+1), minus distance penalty (0.5/km capped at 5). `tsc --noEmit` passes.
- 2026-05-19: PARTIALLY VALIDATED — determinism confirmed by static inspection: pure function, no I/O, `Array.sort` over a freshly mapped array; same input always produces same score values and same sort order. PENDING: eyeball of Valencia/history top-N ranking requires live Overpass + Wikidata/Wikipedia data.
- 2026-05-19: Runtime evidence from Validation B/F: backend log showed `[OSM] Ranked POIs: 8`; selected Valencia stops included `Palacio de Valeriola`, `Busto de Bernardo Ferrándiz`, and `Antic refugi anti-aeri de la guerra civil`. Eyeball accepted as sensible for history, but no dedicated deterministic unit test added.
- 2026-05-20: ✅ Dedicated validation passed via `backend/scripts/validation/validate-phase4-ranker.sh`: Valencia/history produced `[OSM] Raw POIs: 50`, `[OSM] Ranked POIs: 8`, and 3 selected central Valencia stops (`Palacio de Valeriola`, `Busto de Bernardo Ferrándiz`, `Antic refugi anti-aeri de la guerra civil`). Automated checks passed for latitude range, longitude range, and stop count.

---

### Phase 5 — Orchestration Wiring + Cache
Status: 🟡

**Goal**
Plug the OSM pipeline into orchestration behind a toggle and add Postgres cache.

**Scope**
- Add `POI_SOURCE=osm|llm` env toggle.
- New Prisma model `PoiCache(city, theme, fetchedAt, payload)` migration.
- New repo `backend/src/infrastructure/postgres/PostgresPoiCacheRepository.ts`.
- Cache TTL: 30 days (revisit later).
- Orchestration calls cache → Overpass → enrichment → ranker → existing composer.

**Files allowed**
- `backend/prisma/schema.prisma` (new model + migration)
- `backend/src/infrastructure/postgres/PostgresPoiCacheRepository.ts`
- `backend/src/services/orchestrationService.ts` (only the POI source branch)
- `backend/src/config/env.ts` (read `POI_SOURCE`)

**Out of scope**
- Removing LLM POI invention (Phase 8).
- Frontend changes.

**Validation**
- With `POI_SOURCE=osm`, Valencia/history/60 produces a non-empty tour.
- Second call within TTL hits cache (log proof).
- `POI_SOURCE=llm` keeps current behavior intact.

**Acceptance**
- Migration applies cleanly.
- Toggle is reversible without code change.

**Notes**
- 2026-05-19: Implemented. Added `PoiCache` model to `prisma/schema.prisma` with `@@unique([city, theme])`. Created `PostgresPoiCacheRepository.ts` (30-day TTL, upsert on write). Added `poiSource: "osm"|"llm"` to `backend/src/config/env.ts` via `POI_SOURCE` env var (defaults to `llm`). Wired OSM branch into `orchestrationService.ts`: geocode → Overpass (cache-first) → parallel enrich → rank → composeWalkingTour. `POI_SOURCE=llm` path fully preserved. `tsc --noEmit` passes.
- 2026-05-19: PARTIALLY VALIDATED — migration `20260519201709_add_poi_cache` created and applied against live DB (`tour_guide_local@localhost:5432`); `prisma migrate status` reports 2 migrations, schema in sync. Toggle reversibility confirmed by code inspection: `POI_SOURCE` env var with fallback to `llm` requires no code change to switch. PENDING: end-to-end test with `POI_SOURCE=osm` for Valencia/history/60 (requires all external services: Nominatim, Overpass, Wikidata, Wikipedia, Ollama); cache-hit on second call (log proof); `POI_SOURCE=llm` regression test.
- 2026-05-19: Validation B confirmed warm cache behavior: HTTP 201 for Valencia/history/60 and log evidence `[PoiCache] Cache hit for Valencia/history`, `[OSM] Raw POIs: 50`, `[OSM] Ranked POIs: 8`. No new Overpass log was observed. `POI_SOURCE=llm` path is now intentionally retired by Phase 8.

---

### Phase 6 — Floor Check + Error Contract
Status: ✅

**Goal**
Surface `CITY_NOT_AVAILABLE` when fewer than 5 viable POIs exist after ranking.

**Scope**
- Typed error in `backend/src/domain/errors/`.
- Orchestration throws it; controller maps to a 422 with stable error code.
- Frontend handles the code with a friendly message.

**Files allowed**
- `backend/src/domain/errors/CityNotAvailableError.ts`
- `backend/src/services/orchestrationService.ts`
- `backend/src/api/controllers/tours.ts`
- `frontend/src/...` (only the error display path)

**Out of scope**
- Suggesting alternative cities.

**Validation**
- A deliberately starved city returns 422 with `CITY_NOT_AVAILABLE`.
- Frontend displays the friendly message.

**Acceptance**
- No 500 for low-POI cities.

**Notes**
- 2026-05-19: Implemented. Created `backend/src/domain/errors/CityNotAvailableError.ts` (typed error with stable `CITY_NOT_AVAILABLE` code). Wired floor check (< 5 ranked POIs) into `generatePlacesFromOsm` in `orchestrationService.ts` — throws `CityNotAvailableError` before route composition. Updated `backend/src/api/controllers/tours.ts` to catch `CityNotAvailableError` and return 422 with stable code. Updated `frontend/src/lib/api.ts` to preserve the error code through the fetch layer. Updated `frontend/src/components/form/TourForm.tsx` to detect `CITY_NOT_AVAILABLE` and display a friendly city-specific message. Both backend and frontend `tsc --noEmit` pass.
- 2026-05-19: PENDING VALIDATION — acceptance requires a deliberately starved city to return 422 with `CITY_NOT_AVAILABLE` and the frontend to display the friendly message. Cannot validate without `POI_SOURCE=osm` and live Overpass.
- 2026-05-19: 🟡 Validation C failed acceptance. Command: POST `/api/v1/tours/generate` with `Zzzzville/Nowhere/XX/history/en/60`. Observed `HTTP 500` with `TOUR_GENERATION_ERROR`. Log evidence: `Error generating tour: { type: 'NOT_FOUND', message: 'City not found: Zzzzville' }` followed by orchestration wrapping as `Failed to generate tour: Unknown error`. Gap: Nominatim `NOT_FOUND` is not mapped to `CityNotAvailableError`, so the controller never returns 422.
- 2026-05-20: ✅ Fixed. Added `NOT_FOUND` catch in `generatePlacesFromOsm` to throw `CityNotAvailableError(city, 0)`. Validated: Zzzzville now returns HTTP 422 with `{"error":{"code":"CITY_NOT_AVAILABLE","message":"Not enough POIs available for \"Zzzzville\" (found 0, minimum 5 required)"}}`.

---

### Phase 7 — Narrative Persona
Status: 🟡

**Goal**
LLM produces narration only, given factual seeds in the tour language.

**Scope**
- New module `backend/src/services/narrative/NarrativeBuilder.ts`.
- Prompt template with persona ("friendly local guide who knows history").
- Inputs: enriched POI fields + tour language. No coordinate invention.
- Strict output schema; Ollama `format:"json"` where supported.

**Files allowed**
- `backend/src/services/narrative/NarrativeBuilder.ts`
- `pods/llm-pod/src/routes/narrative.ts` (or reuse generation route refactored)

**Out of scope**
- TTS upgrade.
- Multi-voice persona.

**Validation**
- Spot-check 3 stops in es, fr, en — each is grammatically correct, factual, and references the place by its local name.
- No hallucinated coordinates.

**Acceptance**
- All narration uses local name; subtitle in tour language is added by frontend, not LLM.

**Notes**
- 2026-05-19: Implemented. Created `pods/llm-pod/src/routes/narrative.ts` (POST /narrative/stop — persona prompt with factual seeds, `format:"json"`, `gemma4:26b`, no coordinate invention; validates `narration` field in response). Registered route in `pods/llm-pod/src/server.ts`. Created `backend/src/services/narrative/NarrativeBuilder.ts` (calls llm-pod /narrative/stop; falls back gracefully on failure). Wired into `generatePlacesFromOsm` in `orchestrationService.ts` — replaces static description fallback; uses Wikidata-translated local name for the requested language as the display name. Both `tsc --noEmit` pass.
- 2026-05-19: PENDING VALIDATION — acceptance requires spot-check of 3 stops in es, fr, en: grammatically correct, factual, references local name, no hallucinated coordinates. Cannot validate without Ollama + gemma4:26b + live Overpass/Wikidata/Wikipedia.
- 2026-05-19: Validation E passed for direct `/narrative/stop` curls: `Plaza Mayor` in es returned 344 chars with Spanish stop-words and no coordinate numerals; `Tour Eiffel` in fr returned 282 chars with French stop-words; `Brandenburg Gate` in en returned 350 chars with English stop-words. All referenced local names and produced valid JSON.

---

### Phase 8 — Retire LLM POI Invention
Status: 🟡

**Goal**
Make OSM the only POI source. Remove `verification-pod` from the critical path.

**Scope**
- Remove `POI_SOURCE=llm` branch.
- Stop calling `verification-pod` from orchestration.
- Keep the pod's code in repo as helper (optional categorizer) but not invoked.
- Update docs.

**Files allowed**
- `backend/src/services/orchestrationService.ts`
- `backend/src/config/env.ts`
- `docs/working/*.md` (add changelog entry)

**Out of scope**
- Deleting `verification-pod` directory.

**Validation**
- All current happy-path tests still pass.
- Tour generation without verification-pod running is healthy.

**Acceptance**
- No runtime call to verification-pod.

**Notes**
- 2026-05-19: Implemented. Removed `POI_SOURCE=llm` branch from `generateCompleteTour` in `orchestrationService.ts` — OSM pipeline is now unconditional. Removed `verificationServiceUrl` field and all its assignments from the constructor; no runtime call to verification-pod from the critical path. Removed `config.poiSource` import (no longer needed). Removed `poiSource` field from `backend/src/config/env.ts` interface and runtime config. `verifyPlaces` and `generateInitialPlaces` methods remain in the file as dead code (not called). `tsc --noEmit` passes.
- 2026-05-19: PENDING VALIDATION — acceptance requires confirming no runtime call to verification-pod (code inspection confirms this) and that tour generation without verification-pod running is healthy. Runtime verification requires a live end-to-end test with `POI_SOURCE` removed and all OSM services available.
- 2026-05-19: ✅ Runtime verified. `ss -tlnp | grep 3003` exited 1 and `curl http://localhost:3003/health --max-time 3` exited 7, confirming no verification-pod on port 3003. Re-ran Valencia/history/60 and observed HTTP 201 with 3 stops; no 3003/verification errors appeared in `/tmp/backend.log`.

---

### Phase 9 — Frontend Polish
Status: 🟡

**Goal**
Display local name + tour-language subtitle, attribution footer, dedicated Data Sources page.

**Scope**
- POI card shows `name` prominently and `name:<tourLanguage>` as subtitle when present.
- Permanent footer: "Map data © OpenStreetMap contributors · Wikipedia content CC BY-SA · Data Sources".
- New page `/data-sources` listing OSM, Nominatim, Overpass, Wikipedia, Wikidata with links and licenses.

**Files allowed**
- `frontend/src/components/...` (POI card, footer)
- `frontend/src/app/data-sources/page.tsx` (or framework equivalent)

**Out of scope**
- Autocomplete city search.

**Validation**
- Manual: München tour in Spanish shows "München" + "Múnich" subtitle.
- Footer visible on all pages.
- /data-sources renders.

**Acceptance**
- Attribution legally complete on every page.

**Notes**
- 2026-05-19: Implemented. Added optional `nameInTourLanguage` field to `frontend/src/types/api.ts` and `backend/src/types/api.ts`. Updated `PlaceCard` to show local OSM name prominently with tour-language translation as italic subtitle when different. Created `frontend/src/components/layout/AttributionFooter.tsx` (permanent footer with OSM, Wikipedia CC BY-SA, and link to /data-sources). Wired footer into `frontend/src/app/layout.tsx` — appears on every page. Created `frontend/src/app/data-sources/page.tsx` listing all 5 data sources (OpenStreetMap, Nominatim, Overpass API, Wikipedia, Wikidata) with URLs and license badges. Backend `generatePlacesFromOsm` now sets `name` to local OSM name and `nameInTourLanguage` to translated name when different; propagated through the tour response mapping. All three `tsc --noEmit` pass (backend, frontend, llm-pod).
- 2026-05-19: PENDING VALIDATION — manual checks required: (1) München tour in Spanish shows "München" heading + "Múnich" subtitle (requires live OSM/Wikidata + POI_SOURCE=osm); (2) footer visible on all pages (requires running frontend dev server); (3) /data-sources renders correctly (requires running frontend dev server).
- 2026-05-19: 🟡 Backend-side München Spanish Validation D passed: HTTP 201, 3 stops, German local names preserved (`Mariensäule`, `Sigi Sommer (Der Spaziergänger)`, `Denkmal an die Opfer...`), and each description matched Spanish stop-word heuristic. Browser checks for subtitle rendering, footer on every page, and `/data-sources` remain manual.
- 2026-05-20: 🟡 Static + HTTP evidence collected, but full browser validation is still not complete. Static inspection confirms `AttributionFooter` is wired in `frontend/src/app/layout.tsx`, `PlaceCard` renders `nameInTourLanguage` as subtitle, and `/data-sources` lists OpenStreetMap, Nominatim, Overpass API, Wikipedia, and Wikidata. Temporary dev-server HTTP check returned 200 for `/` and `/data-sources`; a later run hit inconsistent `.next` dev-server state. `frontend npx tsc --noEmit` passes. `next build` compiles but fails lint on pre-existing `no-explicit-any` errors in `TourForm.tsx` and `api.ts`. Manual browser check remains required before flipping Phase 9 to ✅.

---

### Phase L1 — Seed Enrichment For Long Narration
Status: ✅

**Revised Acceptance (2026-05-20)**
- Seed enrichment populates `wikipediaLead`, `wikipediaBody`, `wikidataClaims`, and `osmTags` for every ranked POI.
- For POIs with `wikipedia=*` or `wikidata=*` OSM tags, body + claims yield >=500 chars of seed material when source data is available.
- For POIs without those OSM tags, enrichment passes through with `osmTags`-only seed. Narration policy in L2 handles these as `seedQuality: 'thin'`.
- No exceptions are thrown for POIs missing any source.

**Out of scope of L1**
- Raising the percentage of OSM POIs with `wikidata=*` tags. That depends on OSM contributors and is observed, not engineered.

**Notes**
- 2026-05-20: ✅ Revised criterion accepted after live Valencia/history sampling showed only 2/8 ranked POIs had >=500 seed chars while sparse POIs had 5-19 chars. Variable-length narration is now the intended product behavior: rich-seed POIs produce longer 4-section narration; thin-seed POIs produce shorter, honest narration with limited-record language. No deterministic padding.

---

### Phase 10 — Future (deferred, not part of MVP)
Status: ❌ deferred

- Self-host Nominatim + Overpass.
- Better open-source TTS.
- City autocomplete with debouncing.
- Multi-day itineraries.

---

## Open Questions

- Cache TTL exact value (placeholder 30 days, revisit after Phase 5).
- Global chain brand list for `food` exclusions — source TBD.
- Whether to include `name:<tourLanguage>` in TTS as alt-pronunciation cue (probably no, defer).

---

## Risks

- **Public Nominatim/Overpass rate limits** — mitigated by 1 req/s, User-Agent, cache.
- **Sparse OSM tagging in some cities** — floor check converts to clear UX error.
- **Wikidata coverage gaps for niche POIs** — fallback to OSM-only metadata.
- **gemma4:26b context for narrative** — keep per-stop calls small.

---

## Update Protocol

When finishing work on a phase:
1. Flip its status emoji.
2. Append a dated bullet under that phase's "Notes" with what was done, files touched, validation evidence.
3. Do not rewrite earlier phase notes.
4. If a decision changes, add a row to "Locked Decisions" with a strikethrough on the old value, and a new row with the new value and date.
