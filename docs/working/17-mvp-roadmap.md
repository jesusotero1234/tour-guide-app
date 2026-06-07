# 17 — MVP Roadmap (Living Doc)

This document tracks the path from the current working state to a
shippable MVP. It builds on the OSM-first multilingual plan (doc 16)
and defines what "done" means concretely.

---

## MVP Vision

A solo traveler opens the app, picks a city, language, theme, and
duration, and gets a guided walking tour with audio narration at each
stop. The first stop welcomes them; the last stop says goodbye. A map
shows where to walk. They press play at each stop and learn about the
place in their language.

---

## MVP Definition (locked)

MVP is complete when all of the following are true:

1. User opens the app, sees a generation form
2. User picks city + language + theme + duration; submits
3. Tour generates successfully (cold cache may take several minutes for new cities; warm cache <10s)
4. User sees a map with numbered stop markers and a walking route line
5. User sees a current-stop card with name, image (when available), text narration, and a play button
6. Audio plays in the user's selected tour language
7. First stop's audio opens with a welcome introduction ("Welcome to this history tour of Valencia...")
8. Last stop's audio closes with a goodbye ("Thank you for walking with me through Valencia...")
9. User can press "Next stop" to advance through the tour
10. Audio works on mobile browsers (one iOS Safari test, one Android Chrome test)
11. Tour persists — user can revisit the same tour URL and replay any stop
12. Unsupported cities return a clear "we don't have a tour for this city yet" message (422 CITY_NOT_AVAILABLE)

### Explicitly NOT in MVP

- Real-time geolocation / "you are here" tracking
- Offline audio download
- Multi-day itineraries
- City autocomplete in form
- Photo galleries beyond a single image per stop
- User accounts / saved tours per user
- Tour sharing / social features

---

## Current State (as of 2026-05-20)

### What works end-to-end

- City + theme + language + duration selection via form
- Tour generation: OSM geocode -> Overpass POIs -> Wikipedia/Wikidata enrichment -> ranking -> narrative (qwen3:4b via llm-pod) -> persistence (Postgres)
- Variable-length narration: rich-seed POIs get ~280-360 words (4 sections); thin-seed POIs get ~100-160 words (2-3 sections) with honest "limited records" language
- Narration cache in Postgres keyed by (poi_id, language, theme, model_version)
- POI cache by (city, theme) with 30-day TTL
- Multilingual narration + VoxCPM WAV audio validated for en, es, fr, de
- Floor check: <5 ranked POIs returns CITY_NOT_AVAILABLE (HTTP 422)
- Frontend: form redirects to generated tour URL; tour detail page shows Leaflet map, current stop card, AudioPlayer, and Next stop control
- Attribution footer + /data-sources page

### What is broken or missing

| Item | Status | Blocker for MVP? |
|---|---|---|
| TTS pod | completed via dedicated VoxCPM pod on port 3006; Kokoro pod preserved for rollback | NO |
| Welcome intro on first stop | completed and E2E validated for en/es/fr/de | NO |
| Goodbye outro on last stop | completed and E2E validated for en/es/fr/de | NO |
| Map "next stop" interaction | completed minimal Leaflet map/current-stop/Next stop flow; browser/mobile automation not available in this environment | PARTIAL caveat |
| Phase 1-4 dedicated validation | code works via E2E but no dedicated per-phase test scripts exist | NO (doc discipline) |
| Phase 9 browser verification | backend verified, frontend not browser-checked | NO (doc discipline) |

---

## Architecture (current + planned additions)

```
Frontend (Next.js 15, :3000)
  ├── Tour form (city, language, theme, duration)
  ├── Tour view
  │     ├── Map (Leaflet, numbered markers, route polyline)
  │     ├── Current stop card (name, image, narration, audio player)
  │     └── "Next stop" button
  ├── Attribution footer
  └── /data-sources page

Backend (:3001, Express + TypeScript)
  ├── Geocoder (Nominatim)
  ├── POI source (Overpass) -> Cache (Postgres)
  ├── Enrichment (Wikipedia lead+body, Wikidata labels+claims)
  ├── Floor check (>=5 or CITY_NOT_AVAILABLE)
  ├── Ranking (PoiRanker, deterministic)
  ├── Narrative LLM (qwen3:4b via llm-pod, /narrative/stop/long)
  │     ├── Seed-quality classification (rich >= 500 chars, thin < 500)
  │     ├── 4-section structure: arrival, history, significance, transition
  │     ├── Welcome beat on position=first (NEW)
  │     └── Goodbye beat on position=last (NEW)
  ├── Narration cache (Postgres, keyed by poi_id/language/theme/model_version)
  ├── TTS (VoxCPM2 pod, multilingual, Kokoro retained as rollback) (NEW)
  ├── Audio storage (local filesystem)
  └── Persistence (Postgres: tours, places, audio_assets)

llm-pod (:3002, wraps Ollama qwen3:4b)
  ├── POST /narrative/stop (short, fallback)
  └── POST /narrative/stop/long (4-section, seed-quality aware)

voxcpm-pod (:3006, VoxCPM2 TTS)
  ├── POST /tts/generate (JSON: {text, language} -> {success, audioData, format})
  └── POST /tts/audio (text/plain URL response)
```

---

## Locked Decisions (additive to doc 16)

| Topic | Decision | Date |
|---|---|---|
| TTS engine for MVP | VoxCPM2 in dedicated pod on `:3006`; legacy Kokoro pod preserved for rollback | 2026-05-20 |
| Welcome/goodbye implementation | Template prefix + LLM body. Template gives structural reliability; LLM fills warmth. | 2026-05-20 |
| Cold generation time | No strict limit for MVP. Several minutes acceptable for new cities. Warm cache <10s. | 2026-05-20 |
| L1 acceptance criterion | Rewritten to match variable-length reality (see below) | 2026-05-20 |
| Validation scripts | Reusable shell scripts in `backend/scripts/validation/` | 2026-05-20 |

---

## Revised L1 Acceptance Criterion

> **L1 Acceptance (revised 2026-05-20):**
>
> - Seed enrichment populates `wikipediaLead`, `wikipediaBody`,
>   `wikidataClaims`, and `osmTags` for every ranked POI.
> - For POIs with `wikipedia=*` or `wikidata=*` OSM tags, body + claims
>   yield >=500 chars of seed material. (Verified by sampling 5 such
>   POIs across Valencia, Paris, Munchen.)
> - For POIs without those OSM tags, enrichment passes through with
>   `osmTags`-only seed. Narration policy in L2 handles these as
>   `seedQuality: 'thin'`.
> - No exceptions thrown for POIs missing any source.
>
> **Out of scope of L1:** raising the percentage of OSM POIs with
> `wikidata=*` tags — that depends on OSM contributors and is observed,
> not engineered.

---

## Sessions

### Session N+1 — Documentation Discipline (no code changes)

**Goal:** Flip Phases 1, 2, 3, 4, 9 to completed by running their
dedicated validations. Write reusable validation scripts. Apply L1
acceptance rewrite to doc 16.

**Estimated time:** 1.5 hours

**Tasks:**

1. Create `backend/scripts/validation/` directory
2. Write `validate-phase1-geocoder.sh`:
   - Call `geocodeCity` for Valencia, Paris, Lisbon, Munchen
   - Assert: lat/lng are sane, wikidataId present for all four
   - Output: PASS/FAIL per city with captured coordinates
3. Write `validate-phase2-overpass.sh`:
   - Generate tours for Paris with themes: history, architecture, food, art
   - Assert: each theme returns >=5 raw POIs in backend log
4. Write `validate-phase3-enrichment.sh`:
   - Pick 5 named Paris POIs with known Wikipedia/Wikidata entries
   - Verify descriptions in fr and en, non-empty attribution
5. Write `validate-phase4-ranker.sh`:
   - Run Valencia/history ranking
   - Capture top-N, eyeball output for sensibility
6. Manual browser check for Phase 9:
   - Open Munchen/history/es tour in browser
   - Verify: local name heading + tour-language subtitle
   - Verify: footer visible on `/`, `/tours`, `/tours/[id]`, `/data-sources`
   - Verify: `/data-sources` renders all 5 sources
   - Capture screenshots as evidence
7. Edit `docs/working/16-osm-first-multilingual-plan.md`:
   - Flip Phases 1, 2, 3, 4 to completed with dated validation evidence
   - Flip Phase 9 to completed with dated browser evidence
   - Apply revised L1 acceptance criterion text
   - Flip L1 to completed with dated note referencing the new criterion

**Acceptance:**
- All 4 validation scripts exist and run green
- Living doc shows Phases 1-9 + L1 all completed with evidence
- `npx tsc --noEmit` still passes in backend (no code changes, but verify)

**Risks:**
- Nominatim/Overpass rate limits may slow API calls (1 req/s). Budget ~30 min.
- Paris food/art themes may have <5 POIs if Overpass returns sparse data. Report honestly.

---

### Session N+2 — TTS + Welcome/Goodbye Narration

**Status:** Completed with CLI/E2E evidence on 2026-05-20. Valencia/en plus Madrid/es, Paris/fr, and München/de generated successfully with 5 stops, 5/5 audio URLs, HTTP 200 WAV checks, first-stop welcome wording, and final-stop goodbye/thanks wording. Manual audio listening was not possible in this CLI environment.

**Goal:** Audio generation works end-to-end for one full tour in en,
es, fr, de. First stop has a welcome, last stop has a goodbye.

**Estimated time:** 3-4 hours

**Tasks:**

#### Part A — Replace Kokoro with Piper TTS

1. Read `pods/tts-pod/README.md` and `pods/tts-pod/src/services/kokoro.ts`
   to understand the current service interface
2. Install Piper TTS:
   - Download Piper binary for Linux (pre-built, no GPU needed)
   - Download voice models for: en_US, es_ES, fr_FR, de_DE, it_IT
   - Each voice model is ~30-60MB ONNX file
   - Place in `pods/tts-pod/models/piper/`
3. Create `pods/tts-pod/src/services/piper.ts`:
   - Spawns Piper CLI: `echo "text" | piper --model <model> --output_file <file>`
   - Reads the WAV output, base64-encodes it
   - Returns same interface as `kokoroService.generateSpeech()`
   - Language routing: map `en` -> `en_US-lessac-medium.onnx`, `es` -> `es_ES-mls_10246-low.onnx`, etc.
4. Update `pods/tts-pod/src/routes/tts.ts`:
   - Import `piperService` instead of `kokoroService`
   - Keep the same route shape (`/tts/generate`, `/tts/audio`)
5. Update `pods/tts-pod/src/config/env.ts`:
   - Add `piperBinary` path config
   - Update `supportedLanguages` to include es, de
6. Validate:
   - `npm run dev` in tts-pod starts on :3005
   - `curl -X POST http://localhost:3005/tts/generate -H 'Content-Type: application/json' -d '{"text":"Hola, bienvenido a Valencia","language":"es"}'`
   - Returns `{success: true, audioData: "...", format: "wav"}`
   - Repeat for en, fr, de

#### Part B — Welcome and Goodbye narration beats

7. Add tour-level metadata to the `/narrative/stop/long` request:
   - New optional fields in `LongNarrativePromptInput`:
     `cityName?: string`, `totalStops?: number`, `tourDurationMinutes?: number`
   - Backend `orchestrationService.ts` passes these when calling `buildNarration`
   - `NarrativeBuilder.ts` forwards them to the llm-pod request
8. Modify `pods/llm-pod/src/prompts/narrative/arrival.ts`:
   - When `input.position === 'first'`:
     Prepend a deterministic template prefix to the user prompt:
     ```
     IMPORTANT: This is the FIRST stop of the tour. Begin the section with
     a warm welcome like "Welcome to this {theme} walking tour of {cityName}.
     We will visit {totalStops} places over about {tourDurationMinutes} minutes.
     Our first stop is {localName}." Then continue with the arrival narration.
     ```
9. Modify `pods/llm-pod/src/prompts/narrative/transition.ts`:
   - When `input.position === 'last'`:
     Replace transition user prompt with a goodbye prompt:
     ```
     This is the LAST stop of the tour. Instead of guiding to a next stop,
     write a warm goodbye: thank the visitor for walking with you through
     {cityName}, reflect briefly on what they have seen, and wish them well.
     ```
10. Bump `MODEL_VERSION` in `NarrativeBuilder.ts` to `qwen3:4b-long-v3`
    to invalidate cached narrations that lack welcome/goodbye

#### Part C — End-to-end validation

11. Restart all services (llm-pod, tts-pod, backend)
12. Generate Valencia/history/en/60 (cold, fresh cache)
13. Validate:
    - Every stop has non-empty `audioUrl`
    - First stop description starts with welcome text
    - Last stop description ends with goodbye text
    - WAV files exist in `backend/data/audio/`
    - Frontend AudioPlayer plays them
14. Generate Madrid/art/es/60 — same checks in Spanish
15. Generate Paris/history/fr/60 — same checks in French
16. Generate Munchen/history/de/60 — same checks in German

**Acceptance:**
- TTS pod starts on :3005, responds to health check
- Audio generated in en, es, fr, de (4 direct curl tests)
- Welcome text present in first stop of each test tour
- Goodbye text present in last stop of each test tour
- `npx tsc --noEmit` passes in backend and llm-pod and tts-pod
- Frontend AudioPlayer plays the generated audio

**Risks:**
- Piper binary may not be available for WSL/Windows. Fallback: build from
  source or use a Docker container for Piper.
- Piper voice quality varies by language. Spanish and German medium-quality
  voices are adequate for MVP; high-quality voices are larger downloads.
- Large text (300+ words) may need chunking for Piper. Max input varies
  by model. Test with the longest narration from Valencia.

---

### Session N+3 — Map UX + Walking Flow

**Status:** Partially completed with caveat on 2026-05-20. Minimal Leaflet map/current-stop/Next stop flow is implemented and TypeScript passes. Frontend route serves HTTP 200 and Next compiles `/tours/[id]`. Full browser/mobile/audio walkthrough could not be completed because browser automation binaries and audio playback are unavailable in this environment.

**Goal:** Solo-traveler can navigate a tour visually: see the route,
advance between stops, hear audio at each stop.

**Estimated time:** 1-1.5 hours

**Tasks:**

1. Audit `frontend/src/components/tour/map/`:
   - Read all files in components/, hooks/, providers/, types/, utils/
   - Document: what renders today, what's missing
2. Verify or build the MVP walking UI on `/tours/[id]`:
   - **Map region:** Leaflet MapContainer with numbered markers for each stop
     and a polyline connecting them in order
   - **Current stop card:** bottom sheet or sidebar with stop name, image,
     narration text, AudioPlayer, "Next stop" button
   - **Stop progression:** "Next stop" button advances the active stop index,
     recenters the map on the new marker, triggers audio autoplay
   - **Visual state:** current stop marker is highlighted (different color
     or size); past stops are greyed out; future stops are default
3. Wire the form result flow:
   - After generation completes, redirect to `/tours/[id]`
   - First stop is automatically active
   - Audio autoplays on page load (or shows a "Start tour" button if
     autoplay is blocked by browser policy)
4. Mobile sanity:
   - Test on a phone-sized viewport (Chrome DevTools device mode)
   - Map takes ~60% of screen, current stop card takes ~40%
   - Audio controls are thumb-reachable
5. Validate:
   - Walk through a Valencia tour entirely in browser
   - Map shows all stops with route
   - "Next stop" advances correctly
   - Audio plays for each stop
   - Welcome on first, goodbye on last

**Acceptance:**
- Map renders with correct markers and route polyline
- "Next stop" button advances and recenters
- Audio plays per stop
- Responsive on mobile viewport
- No console errors on the tour page

**Risks:**
- Leaflet SSR in Next.js App Router requires `dynamic({ ssr: false })`.
  The existing map module likely handles this, but verify.
- Browser autoplay policies may block audio. Mitigation: show a
  "Tap to start" overlay on first visit.
- Map tile attribution must include "OpenStreetMap contributors" (already
  in footer; confirm it's in the Leaflet attribution control too).

---

### Session N+4 — Real-User Trial (external)

**Goal:** Walk a real tour. Capture concrete failure modes.

**Steps:**
1. Pick Madrid or Valencia
2. Generate a tour in your native language (es)
3. Open on your phone
4. Walk to the first 2-3 stops
5. Play audio at each stop
6. Note everything that breaks, feels wrong, or is missing

**Capture for each stop:**
- Did audio play? Quality?
- Did the narration mention the right place?
- Did the welcome/goodbye feel natural?
- Could you find the next stop using the map?
- Any factual errors?
- How long did generation take?

**Deliverable:** A bullet list of issues to fix in Session N+5.

---

### Session N+5 — Hardening (conditional on N+4 feedback)

Only if N+4 surfaces issues:
- TTS voice quality / prosody adjustments
- Narration tone per theme
- Per-language pronunciation fixes
- Generation time optimization
- Mobile UX polish
- Offline-friendly audio caching

---

## File change summary (planned, not yet executed)

### Session N+1 (no source code changes)
- `backend/scripts/validation/validate-phase1-geocoder.sh` — new
- `backend/scripts/validation/validate-phase2-overpass.sh` — new
- `backend/scripts/validation/validate-phase3-enrichment.sh` — new
- `backend/scripts/validation/validate-phase4-ranker.sh` — new
- `docs/working/16-osm-first-multilingual-plan.md` — update phase statuses + L1 rewrite

### Session N+2
- `pods/tts-pod/src/services/piper.ts` — new (replaces kokoro)
- `pods/tts-pod/src/routes/tts.ts` — update import
- `pods/tts-pod/src/config/env.ts` — add piper config, update languages
- `pods/tts-pod/models/piper/` — new directory with voice model files
- `pods/llm-pod/src/prompts/narrative/types.ts` — add cityName/totalStops/tourDurationMinutes to input
- `pods/llm-pod/src/prompts/narrative/arrival.ts` — welcome beat for position=first
- `pods/llm-pod/src/prompts/narrative/transition.ts` — goodbye beat for position=last
- `backend/src/services/narrative/NarrativeBuilder.ts` — pass tour metadata, bump MODEL_VERSION
- `backend/src/services/orchestrationService.ts` — pass city/stopCount/duration to buildNarration

### Session N+3
- `frontend/src/components/tour/map/` — audit and fix as needed
- `frontend/src/app/tours/[id]/page.tsx` — wire map + stop progression + audio autoplay
- `frontend/src/components/tour/PlaceCard.tsx` — possible "Next stop" button integration

---

## How to roll back

### TTS (Session N+2)
- Revert `tts-pod/src/routes/tts.ts` to import `kokoroService`
- Delete `piper.ts` and `models/piper/`
- TTS pod reverts to Kokoro (en/fr/it only)

### Welcome/Goodbye (Session N+2)
- Revert arrival.ts and transition.ts prompts
- Bump MODEL_VERSION to force regeneration without welcome/goodbye
- Narration reverts to neutral per-stop style

### Map UX (Session N+3)
- Frontend changes only; backend is unaffected
- Revert the tour page component to its pre-session state

---

## Open Questions (parking lot)

- Cache TTL exact value (placeholder 30 days, revisit after user trial)
- Global chain brand list for `food` theme exclusions
- Whether to include `name:<tourLanguage>` in TTS as pronunciation cue
- Piper voice selection per language (medium vs high quality, male vs female)
- Whether to chunk long narrations for TTS or pass as single block
- Audio format: WAV (current) vs MP3 (smaller, better for mobile)
