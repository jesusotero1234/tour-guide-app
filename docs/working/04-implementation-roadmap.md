# 04 - Implementation Roadmap

## Goal

Deliver a stable local-first MVP architecture without rewriting everything at once, while preserving a clean path to future Supabase/cloud adapters.

## Phase 1 - Stabilize contracts and documentation

Status: **completed**

Completion summary:
- Canonical contracts were defined and documented in `docs/working/06-canonical-contracts.md`.
- Contract mismatch matrix was created in `docs/working/07-contract-mismatch-matrix.md`.
- Canonical field naming was applied in runtime-facing type/mapping paths for Phase 1 scope.
- Build validation completed:
  - backend build: passed
  - supabase-pod build: passed
  - frontend build: passed
- Frontend lint cleanup removed Phase 1 build blockers; one non-blocking warning remains for `@next/next/no-img-element`.

Objectives:
- Define canonical shared data contracts only.
- Document known contract mismatches only.
- Make naming decisions for core fields only.

Steps:
1. Align canonical models (`Tour`, `Place`, `AudioAsset`, `TourRequest`, `TourResponse`).
2. Document frontend/backend/database contract mismatches in a single comparison section.
3. Decide canonical names for `country`, `countryCode`, `imageUrl`, `audioUrl`, `position`.
4. Record unresolved ambiguities as open questions in the agent log.

Phase 1 guardrails (must not do):
- Do not implement database changes yet.
- Do not refactor orchestration yet.
- Do not move folders yet.

Exit criteria:
- One shared contract definition approved.
- Canonical naming decisions documented for the required fields.
- Contract mismatches are explicitly documented and traceable.

## Phase 2 - Local PostgreSQL database

Status: **in progress**

Phase 2.1 validation status: **validated**

Phase 2.2 status: **completed**

Phase 2.2 completion summary:
- Minimal Prisma client wrapper exists at `backend/src/infrastructure/db/prismaClient.ts`.
- Isolated DB config/env module exists at `backend/src/config/database.ts`.
- Backend build validation passed after these additions.
- No runtime persistence behavior was changed (no route/controller/service/orchestration wiring).
- Repository interfaces are not implemented yet.

Phase 2.1 validation summary:
- Native PostgreSQL in WSL was used as the accepted local validation fallback.
- Container-based validation remains blocked in this environment by Podman TLS/certificate pull issues.
- Prisma migration baseline validated with native PostgreSQL:
  - `npm run prisma:migrate` passed.
  - Migration created/applied: `backend/prisma/migrations/20260517185240_init/migration.sql`.
- Prisma seed validated:
  - `npm run prisma:seed` passed.
- Backend compilation validated:
  - `npm run build` passed.
- Note: `prisma migrate dev` required `CREATEDB` privilege for user `tour_guide` due shadow database creation.
- Phase 3 is the next phase and is **not started**.

Objectives:
- Stand up local Postgres as default persistence.
- Create initial schema with versioned migrations.

Steps:
1. Add local Postgres service config.
2. Implement migration tooling baseline.
3. Create migration for `tours`, `places`, `audio_assets`, `generation_jobs`.
4. Add minimal seed data (optional for local debugging).

Exit criteria:
- Fresh environment can run migrations from zero.
- Schema reproducible in CI/local.

## Phase 3 - Repository and storage interfaces

Objectives:
- Decouple application logic from concrete persistence/storage implementation.

Steps:
1. Define repository interfaces (`TourRepository`, `PlaceRepository` if needed).
2. Define storage interface (`AudioStorage`).
3. Refactor use-cases/orchestrator to depend on interfaces.
4. Add in-memory/test doubles for fast tests.

Exit criteria:
- No application use-case directly imports DB vendor client.
- Dependency inversion is enforced at module boundary.

## Phase 4 - Persistence implementation

Status: **completed**

Completion summary:
- Postgres tour repository is active for `save`, `findById`, `listRecent`, and `list`.
- `listTours` no longer calls `supabase-pod` directly.
- Audio bytes are stored via `LocalFileAudioStorage`.
- Audio metadata is stored/read via `PostgresAudioAssetRepository`.
- Backend serves `/audio` statically.
- Supabase adapters remain as legacy/inactive files only.

Objectives:
- Implement local Postgres repositories and local audio storage adapter.

Steps:
1. Build `PostgresTourRepository` (create/get/list).
2. Build place persistence logic with ordering constraints.
3. Build `LocalFileAudioStorage` with deterministic path strategy.
4. Ensure transactional behavior where needed.

Exit criteria:
- Generate -> persist -> retrieve flow works without Supabase dependency.

Next phase: **Phase 5 - Orchestration cleanup**

## Phase 5 - Orchestration cleanup

Objectives:
- Make orchestration stateless per request and safer under concurrency.

Steps:
1. Remove mutable shared request state (`currentRequest`) from singleton flow.
2. Pass request context explicitly through method chain.
3. Improve error boundaries and partial-failure handling.
4. Add structured logging per request/job id.

Exit criteria:
- Concurrent generation requests do not leak/cross data.
- Partial failure behavior is explicit and documented.

## Phase 6 - Smoke tests

Objectives:
- Create confidence gates for critical user path.

Steps:
1. Add end-to-end smoke script for core flow:
   - generate tour
   - list tours
   - fetch single tour
   - fetch/place audio metadata
2. Add CI-friendly command with clear pass/fail output.
3. Add minimal health checks across required services.

Exit criteria:
- One command verifies critical flow in local/dev.

## Phase 7 - Future Supabase/cloud adapter

Objectives:
- Reintroduce cloud persistence as adapter, not hard dependency.

Steps:
1. Implement `SupabaseTourRepository` compatible with repository interfaces.
2. Implement `SupabaseAudioStorage` compatible with storage interface.
3. Add config-based provider selection.
4. Validate parity using same smoke tests.

Exit criteria:
- Local Postgres and Supabase cloud interchangeable via configuration.
- No business logic rewrite required for provider switch.

## Priority bands

## Runtime observability hotfix - two-level narration tracing

Status: **completed 2026-05-24**

Objective:
- Open the long-form narration generation black box without changing generation behavior or public API contracts.

Completion summary:
- Backend now creates a per-stop `traceId` and sends it to `llm-pod` `/narrative/stop/long`.
- Backend logs per-stop seed sizes, long-response `meta`, `droppedReasons`, and orchestration summaries with `traceId`.
- `llm-pod` normal logs now emit structured request, per-section attempt, fallback, and final summary events with correlation fields.
- `model.ts` no longer logs full prompts/raw content by default; it logs model settings, duration, `done_reason`, and `eval_count` metadata.
- When `NARRATIVE_DEBUG=true`, `llm-pod` writes one JSON trace per narrative stop under `.dev-logs/narrative/` from the detected repo root when available, falling back to the pod process working directory.
- Debug traces include full seed content, prompts, model options, raw LLM responses, parse/validation state, fallback text, timing, final sections, and narration preview.

Verification:
- `npm run build` in `pods/llm-pod` passed.
- `npm run build` in `backend` passed.

## Runtime hotfix plan - Generate Tour loading and audio verification

Status: **completed**

Completion summary:
- Generate Tour loading feedback is fixed by setting `{ isLoading: true, error: null }` atomically and removing the `isLoading: false` side effect from `setError`.
- Browser audio playback now uses same-origin Next.js `/api/audio/<filename>.wav` as the active local proxy over backend static `/audio` files.
- Audio diagnostics now log media error code, mapped label, network state, ready state, current source, and requested URL without triggering the Next.js dev overlay.
- Tour detail maps no longer use `react-leaflet` `MapContainer`; manual Leaflet lifecycle management avoids `Map container is already initialized` in React Strict Mode.
- WSL local browser access is documented and supported by `scripts/dev-up.sh`, which prints the browser-visible WSL IP and sets `NEXT_PUBLIC_API_URL` accordingly.

Objective:
- Confirm whether the active browser runtime is using the current loading UI and whether generated audio is actually saved and served from backend `/audio`.

Root-cause hypotheses:
1. Stale or wrong frontend runtime: `TourForm` already has `isLoading` UI, so no visible loading may mean the dev server/browser is serving old code, a different route, or HMR has not refreshed.
   - Why it matters / risk reduced: avoids adding duplicate loading components when the issue is deployment/runtime drift.
2. Form submission state changes too late to be noticed because the main thread/UI is blocked or the request is failing before paint.
   - Why it matters / risk reduced: focuses inspection on `handleSubmit`, `setLoading(true)`, and render timing instead of backend storage.
3. Generated tour response contains empty or legacy audio URLs for one or more places.
   - Why it matters / risk reduced: distinguishes audio-generation failure from audio-playback failure.
4. Audio files are written to a different relative directory than the Express static server serves, depending on backend process working directory.
   - Why it matters / risk reduced: catches the common `./data/audio` path mismatch without changing storage architecture.
5. Browser cannot decode the saved WAV or receives HTML/404/CORS instead of WAV bytes.
   - Why it matters / risk reduced: turns `Audio error: {}` into an HTTP/content verification problem.

Files/components to inspect before code changes:
- `frontend/src/components/form/TourForm.tsx` — current loading state, loading panel, and submit flow.
- `frontend/src/components/common/Button.tsx` — visible loading label/spinner behavior.
- `frontend/src/lib/api.ts` — generate endpoint, response handling, and surfaced errors.
- `frontend/src/components/tour/PlaceCard.tsx` — effective audio URL selection; proxy backend `/audio/<filename>.wav` URLs through same-origin Next.js.
- `frontend/src/components/tour/AudioPlayer.tsx` — media error diagnostics and loadeddata/error behavior.
- `frontend/src/app/api/audio/[id]/route.ts` — active local audio proxy for generated backend WAV filenames; legacy Supabase lookup remains for non-`.wav` ids.
- `backend/src/services/orchestrationService.ts` — `generateAudio()` TTS call, local save, metadata save, returned `audioUrl`.
- `backend/src/infrastructure/local-storage/LocalFileAudioStorage.ts` — filename and storage directory.
- `backend/src/server.ts` — static `/audio` mount and resolved storage path.
- `backend/src/infrastructure/postgres/PostgresAudioAssetRepository.ts` — derived `audioUrl` from stored `storagePath`.

Minimal implementation steps after verification:
1. Add an unmistakable generation progress surface only if the current panel is not rendered in the active app instance, ideally near the top of the form/page and tied to existing `isLoading`.
   - Why it matters / risk reduced: improves UX without changing orchestration or persistence.
2. If loading state is set but not painted before the long request, yield one browser frame before starting `generateTour()` or move the loading panel outside any layout area that is not visible.
   - Why it matters / risk reduced: fixes perceived no-op behavior without changing backend flow.
3. If generated `place.audioUrl` is empty, instrument/backend-log the exact `generateAudio()` branch: missing place id, missing description, TTS non-success/no `audioData`, storage write failure, or metadata save failure.
   - Why it matters / risk reduced: identifies whether audio is not generated, not saved, or not returned.
4. If `place.audioUrl` is `http://localhost:3001/audio/<placeId>-<language>.wav` but playback fails, verify static serving path and content type/bytes before changing `AudioPlayer`.
   - Why it matters / risk reduced: avoids masking storage/server path errors in the frontend player.
5. Route browser playback through `frontend/src/app/api/audio/[id]/route.ts` for same-origin audio while keeping backend `/audio` as the canonical storage/serving boundary.
   - Why it matters / risk reduced: prevents browser CORS/CORP failures without changing backend storage architecture.

Verification checklist:
- Browser shows current `TourForm` loading UI immediately after submit: button text `Loading...` and status panel `Creating your tour...`.
- Network tab shows `POST <browser-visible-backend>/api/v1/tours/generate` pending while loading UI remains visible.
- Backend logs include `Generating audio for place`, `Saving audio locally`, and `Audio saved for ..., URL: http://localhost:3001/audio/...`.
- Generated tour JSON has each playable place `audioUrl` set to `http://localhost:3001/audio/<placeId>-<language>.wav`.
- `backend/data/audio/` contains matching non-empty WAV files for the generated place ids/language.
- Opening each backend audio URL directly returns HTTP 200 and plays/downloads WAV audio.
- Opening each proxied `/api/audio/<filename>.wav` URL returns HTTP 200 `audio/wav` from the frontend origin.
- `AudioPlayer` failure logs include `audioUrl`, `currentSrc`, `code`, mapped error label, `networkState`, and `readyState`.
- Re-test in a clean browser profile or with extensions disabled before treating the async-listener warning as app-owned.

Async listener warning policy:
- Treat `A listener indicated an asynchronous response...` as browser-extension noise by default. It is commonly emitted by Chrome extensions message listeners and is not a known symptom of this app's Generate Tour or AudioPlayer code. Escalate only if it reproduces in an incognito/clean profile with extensions disabled and correlates with a specific app network request or route handler.

## Frontend stabilization hotfix - city autocomplete and Next dev chunks

Status: **proposed**

Objective:
- Restore local frontend development stability and city/country suggestions with the smallest safe App Router changes.

Steps:
1. Simplify `frontend/next.config.mjs` to valid Next 15 defaults plus required project exceptions only.
   - Why it matters / risk reduced: removes obsolete config and risky chunk optimization overrides that can cause dev-server 500s before application code runs.
2. Add `frontend/src/app/api/geocoding/cities/route.ts` as a minimal same-origin server route for Nominatim city search.
   - Why it matters / risk reduced: avoids browser header/CORS limitations and centralizes service-identification headers server-side.
3. Update `frontend/src/services/geocoding.ts` to call the same-origin route and preserve the existing `LocationData` contract consumed by `LocationPicker`.
   - Why it matters / risk reduced: fixes suggestions without refactoring form UI state or introducing a second frontend data model.
4. Verify with `npm run build`; if a dev server is running, also verify `/_next/static/chunks/webpack.js`, `/_next/static/chunks/main-app.js`, and `/api/geocoding/cities?q=Paris`.
   - Why it matters / risk reduced: separates build-time validity from runtime dev-server and API behavior.

Guardrails:
- Do not change `LocationPicker` unless the preserved service contract proves insufficient.
- Do not introduce broad caching, debounce rewrites, or new dependencies in this hotfix.
- Treat the browser-extension async listener warning as noise unless it remains in a clean profile with extensions disabled.

Exit criteria:
- Frontend build passes.
- Dev chunks no longer return HTTP 500.
- City query returns mapped city/country suggestion JSON through the same-origin route.

### Critical now
- Phase 5

### Important next
- Phase 6

### Can follow after MVP stabilization
- Phase 7

---

## Phase 8 — Narration quality improvement (prompt engineering)

Status: **planned — not started**

### Diagnosis

The current narration pipeline (`NarrativeBuilder` → llm-pod `/narrative/stop/long` with `qwen3:4b`) produces structurally valid multi-section output (arrival, history, significance, transition), but the text quality is thin. Users report "basic/low quality" narration.

Root causes:
1. **Thin section prompts**: Each section prompt is ~150 tokens of system instruction with minimal persona depth, no sensory-detail instruction, and no concrete examples. The LLM has little guidance on what "good" looks like.
2. **No quality retry loop at section level**: The existing validation detects generic filler, repetition, and word-count violations, then falls back to hardcoded template text. It does not retry with refined prompts for borderline sections.
3. **Missing tour-level narrative arc**: Each stop is generated independently. No cross-stop theme threading, neighborhood progression, or callback references exist.
4. **Seed data framing is mechanical**: Rich Wikipedia/Wikidata data is injected as raw key-value strings (`wikipediaBody: ...`, `wikidataClaims: architect: ..., inception: ...`) without contextual interpretation guidance.

### Verification criteria

- Generate 3 test tours (different cities/themes/languages).
- Compare narration quality before/after using a manual rubric:
  - Engagement: Does it feel like a human guide speaking?
  - Sensory: Does it describe what the visitor sees, hears, or feels?
  - Factual density: Are concrete facts used naturally (not as lists)?
  - Flow: Do sections connect naturally?
- Validation gates (automated): no dropped sections, word count in range, no repetition, no language drift, no unsupported fact drift.
- Backend and llm-pod builds pass.

### Phase 8.1 — Rich narrator persona with sensory detail

**Scope**: Prompt files only in `pods/llm-pod/src/prompts/narrative/`.

**Files to modify**:
- `pods/llm-pod/src/prompts/narrative/types.ts` — `sectionSystem()` function
- `pods/llm-pod/src/prompts/narrative/arrival.ts` — `arrivalPrompt()`
- `pods/llm-pod/src/prompts/narrative/history.ts` — `historyPrompt()`
- `pods/llm-pod/src/prompts/narrative/significance.ts` — `significancePrompt()`
- `pods/llm-pod/src/prompts/narrative/transition.ts` — `transitionPrompt()`

**Changes**:
1. **`types.ts` / `sectionSystem()`**: Expand system prompt from ~150 tokens to ~400 tokens.
   - Add explicit narrator persona: "You are a warm, knowledgeable local guide who has lived in this city for 20 years. You speak with genuine enthusiasm, use vivid sensory language, and make every visitor feel like they're discovering a hidden gem."
   - Add sensory detail instruction: "When describing a place, include at least one sensory detail — what the visitor can see (materials, light, scale), hear (echoes, water, street sounds), or feel (textures, temperature, atmosphere)."
   - Add engagement pattern: "Pause occasionally with a rhetorical question. Use phrases like 'Notice how...', 'Imagine...', 'Look up and you'll see...'."
   - Add concrete "good example" output for a reference scenario.
   - Add explicit anti-patterns: "Never output generic tourist filler like 'a must-see destination' or 'steeped in history' without concrete supporting facts."

2. **`arrival.ts`**: Add visual-first opening instruction. For the first stop, add "Paint the scene — describe what the visitor sees as they arrive: the building's facade, the light at this time of day, the scale of the space."

3. **`history.ts`**: Add narrative framing instruction. "When presenting historical facts, use storytelling techniques: start with a hook ('In 1598, something happened here that changed...'), not a dry date recitation. If dates are unavailable, connect the place to a broader era using language like 'around the time when...'."

4. **`significance.ts`**: Add "So what?" framing. "After presenting facts, explicitly connect them to the tour theme. Answer: why should the visitor care about this place right now on this walk?"

5. **`transition.ts`**: Add callback instruction. "If previous stops shared a theme (e.g., royal history), make a brief callback: 'At our earlier stop, we saw how royal power was displayed — here, we see how ordinary citizens responded to that power.'"

**Why it matters / risk reduced**:
- Improves narration richness without changing the model, architecture, or validation system.
- The validation gates (repetition, drift, word count) ensure prompt changes don't introduce regressions.
- Can be tested and rolled back independently of any other change.

**Exit criteria**:
- All 4 section prompt files updated with richer instructions.
- `pods/llm-pod npx tsc --noEmit` passes.
- Manual quality review of 3 generated tours shows measurable improvement on the rubric.

### Phase 8.2 — Quality retry loop for borderline sections

**Scope**: `pods/llm-pod/src/routes/narrativeLong.ts` only.

**Files to modify**:
- `pods/llm-pod/src/routes/narrativeLong.ts` — `generateSection()` function

**Changes**:
1. Instead of 2 identical retries, implement a **progressive retry strategy**:
   - Attempt 1: Normal prompt (temperature 0.4).
   - Attempt 2 (if validation fails): Retry with `retry=true` (already supported — adds "Previous output failed quality checks. Rewrite..." instruction) at temperature 0.25.
   - Attempt 3 (if validation still fails): Retry with a **simplified prompt** that drops complex instructions and asks for a short, factual 2-sentence section.
   - If all 3 attempts fail: Use existing fallback.

2. Add a **minimum quality score** check: after validation passes, if the section is below 25 words (already checked) or consists of only generic phrases, escalate to the next retry level.

**Why it matters / risk reduced**:
- Reduces the frequency of template-fallback output for borderline sections.
- The progressive retry strategy gives the LLM more chances with adjusted guidance.
- Keeps the change within one file and one function.

**Exit criteria**:
- `pods/llm-pod npx tsc --noEmit` passes.
- Test with a deliberately thin-seed POI: fewer fallbacks to template text than before.
- No increase in generation time > 2× baseline.

### Phase 8.3 — (Future) Cross-stop narrative threading

**Status**: Deferred until Phase 8.1–8.2 results are validated.

If per-stop narration quality is satisfactory but tours still feel like disconnected segments:
- Add a `tourNarrativeState` parameter to `buildNarration()` that accumulates key themes/facts from previous stops.
- Pass accumulated state to the llm-pod so later stops can reference earlier ones.
- This requires a small contract change in `NarrativeBuilder.ts` and `narrativeLong.ts`.

---

## Phase 9 — Voice consistency fix

Status: **planned — not started**

### Diagnosis

The TTS pipeline (`orchestrationService.generateAudio()`) does not pass a `voice` parameter to the tts-pod. Each stop generates audio through an independent `spawn('python3', ...)` call that initializes Kokoro from scratch. The tts-pod's `TTSRequest` interface already supports a `voice` field — it is simply unused by the caller.

### Verification criteria

- Generate a tour with 3+ stops.
- Verify that every TTS request in the backend logs includes the same `voice` value.
- Manually listen to the audio for 3 consecutive stops: voice should sound consistent (same timbre, pace, tone).
- Backend build passes.

### Phase 9.1 — Explicit voice ID in orchestration

**Scope**: One function in one file.

**Files to modify**:
- `backend/src/services/orchestrationService.ts` — `generateAudio()` method (line ~870)

**Change**:
```typescript
// Before (current):
const ttsResponse = await axios.post(`${this.ttsServiceUrl}/tts/generate`, {
  text: place.description,
  language,
  metadata: { position, isFirst, isLast, placeName: place.name }
});

// After:
const ttsResponse = await axios.post(`${this.ttsServiceUrl}/tts/generate`, {
  text: place.description,
  language,
  voice: 'af_sarah',  // explicit consistent voice for the tour
  metadata: { position, isFirst, isLast, placeName: place.name }
});
```

Optionally, make the voice configurable via an environment variable (`TTS_DEFAULT_VOICE`) or a parameter on the tour request for future multi-voice/narrator support.

**Why it matters / risk reduced**:
- This is the smallest possible change — one added field in one HTTP request body.
- The tts-pod's `TTSRequest` already accepts `voice` (line 7 of `pods/tts-pod/src/types/api.ts`).
- The tts-pod's `kokoro.ts` already uses `voice` from the request with a default of `'af_sarah'` (line 59).
- No tts-pod changes. No frontend changes. No database changes.
- Eliminates the risk of the tts-pod using different voice names across stops.

**Exit criteria**:
- `backend npx tsc --noEmit` passes.
- Generated tour audio has consistent voice across all stops (manual listening test).
- Backend logs confirm `voice: 'af_sarah'` in every TTS request.

### Phase 9.2 — (Future) Session-level TTS for intra-stop consistency

**Status**: Deferred until Phase 9.1 is validated and intra-stop variance is confirmed as a problem.

If voice still changes within a single stop (between sections):
1. Add a `/tts/session` endpoint to the tts-pod that initializes Kokoro once and accepts multiple text segments.
2. Modify `generateAudio()` to send all sections of a stop in one session call.
3. This requires tts-pod and orchestration changes — significantly more scope than Phase 9.1.

---

## Phase 10 — Model upgrade for narration (conditional)

Status: **gated on Phase 8 results**

If prompt engineering (Phase 8.1–8.2) does not achieve satisfactory narration quality on `qwen3:4b`:

### Phase 10.1 — Model constant switch

**Files to modify**:
- `pods/llm-pod/src/routes/narrativeLong.ts` — `NARRATIVE_MODEL` constant (line 10)

**Change**: `const NARRATIVE_MODEL = 'qwen3:14b';` (or `'gemma4:26b'` if the host can run it).

**Why it matters / risk reduced**:
- The `/narrative/stop/long` endpoint already supports model override via `model.chat()` with configurable model parameter.
- Changing one constant is the smallest possible model upgrade.
- The existing validation system will catch any regressions from the new model's output style.
- If the new model produces worse output (hallucinations, drift), the constant can be reverted instantly.

### Phase 10.2 — (Future) Adaptive model routing

If the larger model is too slow for all stops, add adaptive routing:
- Rich-seed POIs (seed chars ≥ 500) use the larger model.
- Thin-seed POIs use `qwen3:4b` with improved prompts.
- Controlled by the `seedQuality` field already computed in `narrativeLong.ts`.

---

## Actualización 2026-05-24 — Plan acordado VoxCPM + llama3.1:8b

Status: **completed 2026-05-24**

Nota: estos pasos son de planificación. No habrá cambios de producción hasta que una fase de implementación modifique código explícitamente.

### Phase 11 — TTS provider routing: VoxCPM primary, Kokoro fallback

Archivo futuro:
- `backend/src/services/orchestrationService.ts`

Pasos:
1. Llamar primero a VoxCPM (`pods/voxcpm-pod`, puerto `3006`).
2. Validar timeout/audio no vacío.
3. Si falla, llamar a Kokoro (`pods/tts-pod`, puerto `3005`) y continuar con el guardado actual.

Why it matters / risk reduced:
- Mejora calidad de voz sin perder una ruta operativa probada.
- Reduce riesgo de tours sin audio por fallo puntual de VoxCPM.

Acceptance criteria:
- VoxCPM se usa cuando está sano.
- Kokoro se usa automáticamente si VoxCPM falla.
- El contrato API de tour y el almacenamiento de audio no cambian.

### Phase 12 — VoxCPM seam reduction

Archivos futuros:
- `pods/voxcpm-pod/src/services/voxcpm.py`
- `pods/voxcpm-pod/src/utils/sanitize.py`

Pasos:
1. Reducir y ajustar chunking desde los `600` chars actuales.
2. Cortar preferentemente por puntuación/frases completas.
3. Sustituir `np.concatenate()` directo por crossfade corto o pausa controlada.

Why it matters / risk reduced:
- Reduce clics y cortes audibles sin rediseñar todo el TTS.
- Mantiene el cambio localizado y reversible.

Acceptance criteria:
- Narraciones largas no presentan seams fuertes en escucha manual.
- No hay regresión significativa de duración o estabilidad.

### Phase 13 — Narration model and quality upgrade

Archivos futuros:
- `pods/llm-pod/src/routes/narrativeLong.ts`
- `pods/llm-pod/src/prompts/narrative/types.ts`
- `pods/llm-pod/src/prompts/narrative/arrival.ts`
- `pods/llm-pod/src/prompts/narrative/history.ts`
- `pods/llm-pod/src/prompts/narrative/significance.ts`
- `pods/llm-pod/src/prompts/narrative/transition.ts`

Pasos:
1. Cambiar `NARRATIVE_MODEL` de `qwen3:4b` a `llama3.1:8b` en `narrativeLong.ts`.
2. Añadir retry progresivo en `narrativeLong.ts` para secciones débiles.
3. Enriquecer prompts por sección para guía local, detalle sensorial, historia con gancho, significancia temática y transiciones naturales.

Why it matters / risk reduced:
- `llama3.1:8b` ya está disponible y ofrece mejor calidad esperada que `qwen3:4b` sin el coste de `gemma4:26b`.
- Mejora texto y audio percibido por el usuario sin cambios de contrato.

Acceptance criteria:
- `/narrative/stop/long` usa `llama3.1:8b`.
- 3 tours de prueba muestran narración más rica y sin drift factual evidente.
- Las validaciones existentes de longitud, repetición e idioma siguen pasando.

Implementation progress:
- Phase 1 — Narration model switch: **completed 2026-05-24**.
  - `pods/llm-pod/src/routes/narrativeLong.ts` now uses `llama3.1:8b` for long narration.
  - Validation: `npm run build` in `pods/llm-pod` passed.
- Phase 2 — Backend TTS provider fallback: **completed 2026-05-24**.
  - Backend tries VoxCPM from `TTS_POD_URL` first when configured, then falls back to Kokoro from `TTS_SERVICE_URL` or the existing Kokoro default.
  - TTS requests now include a stable `voice` field (`TTS_DEFAULT_VOICE` or `af_sarah`).
  - Validation: `npm run build` in `backend` passed.
- Phase 3 — VoxCPM seam reduction: **completed 2026-05-24**.
  - VoxCPM chunk joins now use a short crossfade helper instead of direct raw concatenation.
  - Chunking remains sentence-aware, with a conservative max chunk size reduction from 600 to 500 characters.
  - Voice prompt behavior is preserved for every chunk.
  - Validation: `python3 -m py_compile src/services/voxcpm.py src/utils/sanitize.py` in `pods/voxcpm-pod` passed.
  - Limitation: runtime audio listening/model verification was not run from this CLI session.
- Phase 4 — Prompt quality improvements: **completed 2026-05-24**.
  - Narrative prompts now emphasize a warm local guide persona, sensory orientation, micro-story history, theme relevance, and stronger transition/closing beats.
  - Strict JSON and factuality constraints are preserved.
  - Validation: `npm run build` in `pods/llm-pod` passed.
  - Limitation: manual 3-tour quality review was not run from this CLI session.

---

## Phase 14 — UX fixes: empty audio, navigation, and thin-data narration

Status: **planned — not started**

Three user-reported UX issues addressed in a single lightweight phase. All changes are frontend-only or llm-pod-only; no backend, DB, or contract changes.

### Issue 1: Tour shown before audio ready

#### Diagnosis

The backend `generateCompleteTour()` is fully synchronous — audio is generated and saved before the response is returned. The user sees tours with empty audio URLs because TTS fails silently for some stops (`generateAudio()` returns `audioUrl: ''`). The frontend `AudioPlayer` receives an empty URL and shows a broken/error state. The user interprets this as "audio not ready," but it has actually already failed.

#### Plan: Frontend-only graceful empty-audio handling

**Files to modify:**
- `frontend/src/components/tour/AudioPlayer.tsx` — empty `audioUrl` handling
- `frontend/src/components/tour/PlaceCard.tsx` — pass-through empty-audio state
- `frontend/src/app/tours/[id]/page.tsx` — missing-audio banner

**Changes:**
1. **`AudioPlayer.tsx`**: When `audioUrl` is empty or falsy, skip creating the `Audio` element entirely. Instead, render a muted "Audio not available for this stop" state (no error, no spinner, just a quiet note).
2. **`PlaceCard.tsx`**: No structural changes needed — the existing `audioError` state already propagates. The `getEffectiveAudioUrl()` already returns `''` for empty URLs. The `AudioPlayer` handles the empty case (change #1).
3. **`[id]/page.tsx`**: After fetching the tour, check if `tour.places.some(p => !p.audioUrl)`. If true, show a small info banner: "Some stops do not have audio — these were unavailable during generation."

**Why it matters / risk reduced:**
- Zero backend changes. Zero DB changes. Zero pod changes.
- Eliminates the false "still loading" impression when audio has failed.
- The root cause (TTS failures) is logged by the backend already — this just improves the UX around the failure.

**Verification criteria:**
- `frontend npx tsc --noEmit` passes.
- Load a tour where some places have empty `audioUrl`. AudioPlayer shows "Audio not available" instead of a broken player.
- Tour detail page shows the missing-audio banner when applicable.
- Tours where all places have audio still work identically.

---

### Issue 2: Can't create new tour after one is done

#### Diagnosis

The header already has a "Generate New Tour" link. Users report being "stuck" on the tour detail page. The header link may be overlooked on mobile or during immersive walkthrough. The tour detail page has a "Back to Tours" link but no direct "Create New Tour" button.

#### Plan: Add a "Create New Tour" button at the bottom of the tour detail page

**Files to modify:**
- `frontend/src/app/tours/[id]/page.tsx`

**Change:**
- After the walkthrough controls (the "Next stop" / "End of tour" section), add a secondary button:
  ```
  <Link href="/" className="...">Create New Tour</Link>
  ```
- Style it consistently with the existing design system: `border border-darkBrown rounded-lg px-4 py-2 text-darkBrown hover:bg-darkBrown hover:text-beige transition-colors`.
- Place it below the existing walkthrough controls, separated by a small margin, so it appears after the user finishes the tour.

**Why it matters / risk reduced:**
- One file, one `<Link>` component, zero risk.
- The header nav is kept as-is; this is additive.
- The "Back to Tours" link is also preserved.
- Addresses the real UX pain point: after finishing a walkthrough, the user wants an obvious way to start another.

**Verification criteria:**
- `frontend npx tsc --noEmit` passes.
- Tour detail page shows a "Create New Tour" button below the walkthrough controls.
- Clicking the button navigates to `/` (home page with the tour form).
- The "Back to Tours" link and header navigation still work.

---

### Issue 3: Narration quality drops at end

#### Diagnosis

Later tour stops have less seed data from Wikipedia/Wikidata ("thin" mode: < 500 chars). The `narrativeLong.ts` route applies:
- Reduced word target: 35-55 words (vs 70-90 for rich stops)
- More cautious system prompt: "The public record is limited..."
- Lower `max_tokens`: 180 (vs 260)
- Strict fact-drift checking
- Only 2 identical retry attempts, then fallback to formulaic `fallbackSection()` template text

The fallback templates are i18n'd but highly formulaic — nearly identical text across stops, which makes the end of the tour feel repetitive and low-quality.

#### Plan: Improve thin-data handling (llm-pod only)

**Files to modify:**
- `pods/llm-pod/src/routes/narrativeLong.ts`

**Changes:**

1. **Increase thin-data retry attempts from 2 to 3** with a progressive strategy inside `generateSection()`:
   - Attempt 1: Normal prompt (temperature 0.4, `retry: false`)
   - Attempt 2: Cooler prompt with retry flag (temperature 0.25, `retry: true`)
   - Attempt 3: Simplified short-factual prompt at temperature 0.2 — instruct the LLM to produce a short, factual 2-sentence section without complex instructions
   - If all 3 attempts fail: use existing `fallbackSection()`

   Implementation: Change the `for` loop in `generateSection()` from `attempt < 2` to `attempt < 3`, and add simplified-prompt logic for attempt 2+.

2. **Raise thin-data word target** from `'35 to 55'` to `'45 to 65'` in `policyFor()`.

3. **Improve `fallbackSection()` templates** to be less formulaic:
   - Add natural variation: rotate through 2-3 alternative phrasings per section per language
   - Add guide-like tone: conversational, observational, personal
   - Add per-section personality:
     - Arrival: "Let me show you what catches the eye here..."
     - History: "What the records tell us, though incomplete, is..."
     - Significance: "This place matters to our walk because..."
     - Transition (last stop): warm goodbye with city name and theme callback
   - Maintain existing safety: no invented facts, no dates/people/events beyond provided data

**Why it matters / risk reduced:**
- All changes in one file (`narrativeLong.ts`). No backend, frontend, DB, or contract changes.
- Existing validation gates (word count, repetition, language drift, fact drift) remain unchanged.
- The progressive retry was already planned in Phase 8.2 — this is a narrower implementation.
- Templates remain the last-resort safety net; they just sound better.

**Verification criteria:**
- `pods/llm-pod npx tsc --noEmit` passes.
- Generate a tour. Verify backend logs show thin-data stops are attempted up to 3 times.
- Thin-data word target in system prompts says "45 to 65" instead of "35 to 55".
- Fallback template text for thin-data stops sounds more guide-like and varied (manual review).
- Rich-data stops are unaffected.

---

## Phase N-4 — POI selection improvements (themeTags + PoiRanker)

Status: **completed 2026-05-24**

Completion summary:
- `backend/src/domain/poi/themeTags.ts` now adds specific history filters for castles, palaces, manors, city gates/walls, cathedrals, historic churches, and historic tourist attractions before the generic `historic=*` filters.
- `backend/src/services/poi/PoiRanker.ts` now adds notability weighting from Wikipedia body length, relevant Wikidata claims, and OSM category fit (`historic=castle|palace`, `tourism=attraction`, `building=cathedral`).
- `backend/src/services/orchestrationService.ts` now logs selected POIs and a capped rejected-POI sample below the `topN` cutoff with score/type/debug signals.
- Validation: `npm run build` in `backend` passed; `npm test -- --runInBand` found no backend tests; a local ranker sanity check confirmed an enriched Palacio Real candidate outranks a generic memorial/statue candidate.
- Limitation: live Madrid/Paris/London history tour verification was not run from this CLI session because it requires external/runtime services.

Postmortem reinforcement 2026-05-24:
- Created `docs/working/20-madrid-history-tour-postmortem.md` after inspecting the generated Madrid/history tour and `poi_cache` contents.
- Replaced the single flat history Overpass query with prioritized fetch groups in `themeTags.ts` and `OverpassPoiFetcher.ts`.
- Restricted broad `historic=*` fallback to POIs with Wikidata/Wikipedia and added notable attractions/museums/buildings so Madrid landmarks enter the pool.
- Reduced dev cache TTL to 1h and purged stale Madrid/history cache.
- Strengthened `PoiRanker.ts` to favor landmarks/buildings and penalize memorial/artwork/aircraft POIs.
- Validation: fresh Madrid/history pool includes Palacio Real, Catedral de la Almudena, Puerta de Alcalá, Puerta del Sol, Plaza Mayor, and Museo de Historia de Madrid; backend build passed.

### Diagnosis

Live test: Madrid "history" tour (French, 240 min) selected 6 stops — 5 statues/memorials + 1 iconic location (Kilómetro Cero). Missing: Palacio Real, Plaza Mayor, Catedral de la Almudena, Museo del Prado, Templo de Debod, Gran Vía.

**Root causes** (documented in `docs/architecture/tour-selection.md`):

1. **`themeTags.ts` "history" tags** (lines 8-18): The `historic=*` filter returns ALL historic-tagged nodes, which in OSM are predominantly statues (`historic=monument`) and memorials (`historic=memorial`). Missing: `tourism=attraction[historic]`, `historic=castle`, `historic=palace`, `building=cathedral` standalone.

2. **`PoiRanker.ts` scoring** (lines 20-41): Binary presence scoring — wikidata (+3), wikipedia (+2), name (+1), description (+2), translations (+1), distance penalty. No notability weighting (pageviews, article length, claim count). A statue with Wikidata entry scores the same as a royal palace with Wikidata entry.

3. **No logging of rejected POIs**: The pipeline silently drops POIs below `topN` — impossible to debug which important landmarks were excluded and why.

### Verification criteria

- Generate 3 test tours (Madrid/history, Paris/history, London/history).
- Verify that each tour includes ≥ 2 major buildings/attractions (not just statues/memorials).
- `npm run build` in backend passes.
- No breaking changes to other themes (architecture, food, art).

### Phase N-4.1 — Expand history theme tags

**Scope**: One file.

**File to modify**:
- `backend/src/domain/poi/themeTags.ts`

**Changes**: Add specific historic building/attraction tags before the generic `historic=*` filter:
- `historic=castle`, `historic=palace`, `historic=manor`, `historic=city_gate`, `historic=citywalls`
- `building=cathedral`, `building=church[historic]`
- `tourism=attraction[historic]` (covers Palacio Real, Plaza Mayor, etc.)

Full proposed tags in `docs/architecture/tour-selection.md`, Fase N-4.1.

**Why it matters / risk reduced**:
- Enriches the candidate pool with buildings and attractions instead of only statues.
- Purely additive — no tags removed.
- Overpass union (OR) means more filters = more candidates, not fewer.

**Exit criteria**:
- `npm run build` in backend passes.
- Madrid "history" tour candidate pool includes buildings (verify via [OSM] logs).

### Phase N-4.2 — Add notability weighting to PoiRanker

**Scope**: One file.

**File to modify**:
- `backend/src/services/poi/PoiRanker.ts`

**Changes**:
1. **Wikidata claim bonus**: +1 per relevant claim (inception, architect, heritage, significant event), max +3.
2. **Wikipedia article length bonus**: `wikipediaBody.length > 2000` → +2, `> 5000` → +3.
3. **OSM category bonus**: `historic=castle`/`historic=palace` → +2, `tourism=attraction` → +1, `building=cathedral` → +1.

**Why it matters / risk reduced**:
- Differentiates major landmarks from minor POIs with the same binary Wikidata presence.
- Rewards buildings and attractions over generic statues.

**Exit criteria**:
- `npm run build` in backend passes.
- Iconic POIs (Palacio Real, Museo del Prado) score higher than minor statues in test tours.

### Phase N-4.3 — Log rejected POIs

**Scope**: One file.

**File to modify**:
- `backend/src/services/orchestrationService.ts` — `generatePlacesFromOsm()` method (after ~line 574)

**Change**: Add structured `[OSM] Rejected POIs` and `[OSM] Selected POIs` log arrays with name, score, and OSM type.

**Why it matters / risk reduced**:
- Makes POI selection transparent and debuggable.
- Provides data to calibrate N-4.1 and N-4.2 without changing behavior.

**Exit criteria**:
- Backend logs show rejected POIs with name, score, and OSM type.
- `npm run build` in backend passes.

---

## Phase TTS-4 — Voice consistency across stops (seed investigation + stable VoxCPM profiles)

Status: **completed 2026-05-24**

Completion summary:
- Reviewed upstream `openbmb/VoxCPM` API documentation/source for `VoxCPM.generate()`: no `seed`, `random_state`, `generator`, or `torch_generator` parameter is exposed. Local import introspection was not possible because `voxcpm` is not installed in the host CLI environment.
- `pods/voxcpm-pod/src/services/voxcpm.py` now makes the `voice` parameter meaningful through stable `guide_<lang>` profiles and safe explicit descriptions.
- `backend/src/services/orchestrationService.ts` now sends `VOXCPM_VOICE_PROFILE || guide_<language>` to VoxCPM while preserving `TTS_DEFAULT_VOICE || af_sarah` for Kokoro fallback.
- VoxCPM remains the primary provider for all stops when configured; Kokoro fallback behavior is preserved. The planned hybrid stop-1/rest split was not implemented because the lowest-risk improvement was to keep VoxCPM and make its voice prompt stable/observable.
- Validation: `python3 -m py_compile src/services/voxcpm.py src/routes/tts.py` passed; `npm run build` in `backend` passed.
- Limitation: without seed/reference audio, VoxCPM can still vary subtly between calls; runtime audio/listening tests were not run from this CLI session.

### Diagnosis

Live test: VoxCPM produced excellent voice quality across all 6 Madrid stops, but the voice timbre/tone varied slightly between stops. Each VoxCPM `/tts/generate` call independently interprets the voice description prompt — there is no seed or voice-ID system.

**Root cause** (documented in `docs/architecture/voice-consistency.md`):

1. **VoxCPM is text-description based** (`voxcpm.py:51-78`): `desc = VOICE_DESCRIPTIONS.get(lang, ...)` → `prompt = f"({desc}){chunk}"` → `self.model.generate(text=prompt)`. The model interprets `(desc)` fresh each call — no determinism guarantee.

2. **The `voice` API parameter is ignored** (`voxcpm.py:59`): `TTSRequest.voice` is accepted in the function signature but never used to influence generation. VoxCPM2 has no named-voice system like Kokoro.

3. **No seed parameter is currently passed** (`voxcpm.py:78`): `self.model.generate(text=prompt, cfg_value=2.0, inference_timesteps=10)` — no `seed`, `random_state`, or `generator`.

4. **Kokoro is deterministic**: Named voice files (`af_sarah`) produce consistent output across calls. Currently used as fallback only.

### Options table (full in `docs/architecture/voice-consistency.md`)

| Option | Approach | Risk | Quality |
|--------|----------|------|---------|
| A: Kokoro fallback | VoxCPM stop 1, Kokoro rest | Bajo | Media (timbre cambia entre motores) |
| B: Seed en VoxCPM2 | Pasar seed fijo a `model.generate()` | Bajo (si existe) | Alta (VoxCPM consistente) |
| C: Ajustar cfg/timesteps | Reducir `cfg_value`, aumentar `inference_timesteps` | Medio (posible degradación) | Media |
| D: Misma descripción | Ya se hace — no resuelve | Nulo | No aplica |

### Recommended path

```
1. INVESTIGAR seed en VoxCPM2
   ├─ ¿Existe seed/random_state?
   │  ├─ SÍ → Phase TTS-4.2: implementar seed fijo
   │  └─ NO → Phase TTS-4.3: híbrido VoxCPM stop 1 + Kokoro resto
```

### Verification criteria

- Generate a tour with 3+ stops.
- Manual listening test: voice should NOT perceptibly change between consecutive stops.
- If seed works: verify waveform similarity across stops.
- `python3 -m py_compile src/services/voxcpm.py` in voxcpm-pod passes.
- `npm run build` in backend passes.

### Phase TTS-4.1 — Investigate VoxCPM2 seed support

**Scope**: Research only — no code changes.

**Task**: Review `openbmb/VoxCPM2` documentation and API for `seed`, `random_state`, `generator`, or `torch_generator` parameters on `model.generate()`. If found, test with fixed seed on 3 identical prompts and compare waveforms.

**Why it matters / risk reduced**:
- Determines if the optimal solution (consistent VoxCPM) is feasible.
- Prevents implementing a hybrid workaround if a simple seed parameter exists.

**Exit criteria**:
- Documentation reviewed.
- If seed exists: 3-stop test shows identical/near-identical waveforms.
- Finding recorded in agent log.

### Phase TTS-4.2 — Implement seed (if supported)

**Scope**: One file, one line (conditional on TTS-4.1 result).

**File to modify**:
- `pods/voxcpm-pod/src/services/voxcpm.py` — line 78

**Change**:
```python
# Before:
wav = self.model.generate(text=prompt, cfg_value=2.0, inference_timesteps=10)

# After:
wav = self.model.generate(text=prompt, cfg_value=2.0, inference_timesteps=10, seed=42)
```

**Why it matters / risk reduced**:
- Smallest possible change — one parameter.
- Makes VoxCPM output deterministic across stops.
- Preserves VoxCPM voice quality for all stops.

**Exit criteria**:
- `python3 -m py_compile src/services/voxcpm.py` passes.
- 3 stops with identical text → identical/near-identical audio (manual listening + waveform check).

### Phase TTS-4.3 — Hybrid fallback (if seed not supported)

**Scope**: One file (conditional on TTS-4.1 negative result).

**File to modify**:
- `backend/src/services/orchestrationService.ts` — provider selection logic (~lines 896-899)

**Change**: First stop uses VoxCPM primary, stops 2..N use Kokoro only.

**Why it matters / risk reduced**:
- First stop gets maximum voice quality (first impression).
- Remaining stops get consistent voice (Kokoro determinism).
- Acceptable trade-off if VoxCPM cannot be made deterministic.

**Exit criteria**:
- `npm run build` in backend passes.
- Backend logs confirm stop 1 uses VoxCPM, stops 2..N use Kokoro.
- Manual listening: stop 1 voice quality is excellent (VoxCPM), stops 2..N are consistent (Kokoro).

---

## Phase TTS-5 — VoxCPM reference-audio consistency

Status: **completed 2026-05-24**

Completion summary:
- `voxcpm-pod` now resolves or creates a reusable bootstrap reference WAV keyed by the backend-provided `referenceId` for `voxcpm + MODEL_ID + language + voiceProfile`.
- Chunks are generated first with the same `reference_wav_path`/`reference_id`; if that path fails, the pod logs the failure and falls back to the existing Voice Design mode.
- Sentence-aware chunking now targets ~420 characters and splits on full sentence endings.
- Chunk stitching keeps crossfade, adds `VOXCPM_CHUNK_SILENCE_MS` configurable silence (default 20ms), and normalizes the final waveform.
- Backend/Prisma now persist one `voice_reference_audio` row per `language + provider + model + voiceProfile`, and backend passes that row id as `referenceId` to VoxCPM.
- Pod-side auditing still writes `AUDIO_CACHE/voice_references/manifest.json` for local path/debug visibility.
- Validation: `python3 -m py_compile src/services/voxcpm.py src/routes/tts.py src/utils/sanitize.py` in `pods/voxcpm-pod` passed; `npx prisma validate`, `npx prisma migrate dev --name add_voice_reference_audio_cache`, `npx prisma migrate status`, and `npm run build` in `backend` passed.

Objective:
- Make VoxCPM chunks reuse one stable reference audio per language/provider/model/voice profile so every chunk is conditioned on the same speaker reference instead of relying only on fresh Voice Design inference.

Desired flow:
1. Narration text from backend.
2. TTS cleanup in `voxcpm-pod`.
3. Sentence-aware chunking around 350-450 characters using full sentence boundaries.
4. Resolve reusable voice reference for language + provider + model + voice profile.
5. If absent, generate a short bootstrap reference clip using current Voice Design prompt and persist/audit the reference.
6. Generate all chunks with the same `reference_wav_path`/`reference_id`.
7. Stitch chunks with existing crossfade plus small configurable silence.
8. Normalize final audio.
9. If reference mode fails, fall back to current Voice Design mode.

Scope for first iteration:
- Pod-side implementation plus minimal DB/backend audit integration.
- Use `reference_wav_path` / `reference_id` only.
- Defer Ultimate Cloning inputs (`prompt_wav_path` + `prompt_text`).
- Preserve VoxCPM primary and Kokoro fallback behavior.
- No broad async/job architecture.

Files planned:
- `pods/voxcpm-pod/src/services/voxcpm.py`
- `pods/voxcpm-pod/src/routes/tts.py`
- `pods/voxcpm-pod/src/utils/sanitize.py`
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260524150000_add_voice_reference_audio_cache/migration.sql`
- `backend/prisma/migrations/20260524155320_add_voice_reference_audio_cache/migration.sql`
- `backend/src/services/orchestrationService.ts`
- `docs/architecture/voice-consistency.md`
- `docs/working/05-agent-log.md`

Exit criteria:
- `python3 -m py_compile src/services/voxcpm.py src/routes/tts.py src/utils/sanitize.py` passes in `pods/voxcpm-pod`.
- VoxCPM logs indicate whether reference mode or Voice Design fallback was used.
- Reference clips are reused by stable key and not regenerated for every chunk.
- Backend/Kokoro fallback contracts remain unchanged.

---

## Phase N-5 — POI selection quality: fix palace dominance and Wikidata 429 failures

Status: **partially implemented; follow-up composition work required**

Update 2026-05-29:
- Large parts of this phase have already landed in code: shared POI taxonomy, ranker cleanup, route-selection extraction with tests, duration-planning extraction, and serialized Wikidata access.
- The latest live `Madrid/history/240` run changed the diagnosis again: the main open failure is no longer simple palace dominance. The route now mixes plazas/market/religious/palace, but still collapses to a compact 71-minute core (`coverageRatio ~= 0.297`).
- Therefore, N-5.1 through N-5.3 should be considered materially addressed or folded into implemented work, while the remaining open issue is route composition for long first-visit city tours.

### Diagnosis (2026-05-24 postmortem round 2)

After Phase N-4 + postmortem reinforcement, the Madrid/history tour now selects buildings and palaces instead of statues/memorials — but the new problem is **palace over-dominance**. A 240-min Madrid history test selected 6 stops: 5 palaces + Puerta del Sol.

Root causes (three compounding):

1. **Query bias (priority groups)**: Group 1 fetches 75 palaces/castles/heritage items first. Groups 3-4 (which would catch plazas, markets, general attractions) get few/no remaining slots in the 150-POI cap. Missing OSM tag categories: `place=square` (plazas), `amenity=marketplace` (markets), `highway=pedestrian` (famous streets).

2. **Scoring bias (PoiRanker)**: Palaces get +5 from OSM tags alone (+3 `historic=palace` + +2 `building=palace`). Plaza Mayor would get at most +2 (`tourism=attraction`). The rankings are dominated by type bonuses rather than actual significance.

3. **Wikidata 429 rate limiting**: `Promise.all` fires up to 300 concurrent requests to Wikidata. This triggers 429 (Too Many Requests), causing nearly all enrichment to fail. Without Wikipedia bodies or Wikidata claims, the notability-based scoring bonuses (wikipedia body length +2, wikidata claims +1-3) never activate. All POIs have "thin" seed quality, making the OSM tag bias the sole differentiator.

### Verification criteria

- Generate Madrid/history tour (240 min). Verify ≥ 2 non-palace landmarks appear (plazas, markets, notable buildings).
- Verify Wikidata enrichment succeeds for ≥ 30% of POIs (not all 429 failures).
- `npm run build` in backend passes.
- No breaking changes to architecture, food, or art themes.

---

### Phase N-5.1 — Rebalance PoiRanker OSM category bonuses

**Scope**: One file. **Impact**: Highest — directly fixes the auto-domination of palaces in rankings.

**File to modify**:
- `backend/src/services/poi/PoiRanker.ts` — `scorePoi()` function (lines 42-51)

**Current code** (lines 42-51):
```typescript
  // OSM category fit: prefer historic buildings/places over commemorative markers.
  if (poi.tags.historic === 'castle' || poi.tags.historic === 'palace') score += 3;
  if (poi.tags.building === 'cathedral' || poi.tags.building === 'palace' || poi.tags.building === 'castle') score += 2;
  if (poi.tags.tourism === 'attraction') score += 2;
  if (poi.tags.tourism === 'museum') score += 1;
  if (poi.tags.heritage) score += 1;
  if (poi.tags.historic === 'memorial') score -= 2;
  if (poi.tags.tourism === 'artwork') score -= 1;
  if (poi.tags.historic === 'aircraft') score -= 3;
```

**Changes**:
```typescript
  // OSM category fit: prefer notable landmarks over commemorative markers.
  // Palaces/castles reduced from +3→+1 and +2→+1 to prevent auto-domination.
  if (poi.tags.historic === 'castle' || poi.tags.historic === 'palace') score += 1;
  if (poi.tags.building === 'cathedral' || poi.tags.building === 'palace' || poi.tags.building === 'castle') score += 1;
  if (poi.tags.tourism === 'attraction') score += 2;
  // Additional bonus for verified notable attractions (has wikidata or wikipedia)
  if (poi.tags.tourism === 'attraction' && (poi.tags.wikidata || poi.tags.wikipedia)) score += 1;
  if (poi.tags.tourism === 'museum') score += 1;
  if (poi.tags.heritage) score += 1;
  // New: reward iconic city squares, markets, and pedestrian streets
  if (poi.tags.place === 'square') score += 2;
  if (poi.tags.amenity === 'marketplace') score += 1;
  if (poi.tags.highway === 'pedestrian') score += 1;
  // Penalties unchanged
  if (poi.tags.historic === 'memorial') score -= 2;
  if (poi.tags.tourism === 'artwork') score -= 1;
  if (poi.tags.historic === 'aircraft') score -= 3;
```

**Net effect**: A palace now scores +2 from OSM tags (was +5). Plaza Mayor scores +5 (+2 attraction, +2 square, +1 verified). This brings iconic non-palace landmarks into competitive range.

**Why it matters / risk reduced**:
- Single-file change, no contracts/DB/pods affected.
- Even with failed Wikidata enrichment, the OSM tag bonuses no longer auto-select palaces.
- Addresses the root cause directly — the scoring formula itself, not just what enters the pool.

**Exit criteria**:
- `npm run build` in backend passes.
- Local ranker test: enriched Plaza Mayor (with wikidata) outscores a generic palace without wikidata.

---

### Phase N-5.2 — Add missing OSM categories to history theme + rebalance priority groups

**Scope**: Two files. **Impact**: High — ensures plazas, markets, and pedestrian streets enter the candidate pool.

**Files to modify**:
1. `backend/src/domain/poi/themeTags.ts` — history priority groups
2. `backend/src/infrastructure/poi/OverpassPoiFetcher.ts` — fetchPoisForTheme() (lines 119-143)

**Changes to `themeTags.ts`** (priorityGroups array):

Current Group 2 (historic attractions + museums) — add plaza, marketplace, and pedestrian street filters:
```typescript
// ADD to Group 2 (after existing filters):
'node["place"="square"]["wikidata"]',
'way["place"="square"]["wikidata"]',
'relation["place"="square"]["wikidata"]',
'node["place"="square"]["wikipedia"]',
'way["place"="square"]["wikipedia"]',
'relation["place"="square"]["wikipedia"]',
'node["amenity"="marketplace"]["wikidata"]',
'way["amenity"="marketplace"]["wikidata"]',
'relation["amenity"="marketplace"]["wikidata"]',
'node["amenity"="marketplace"]["wikipedia"]',
'way["amenity"="marketplace"]["wikipedia"]',
'relation["amenity"="marketplace"]["wikipedia"]',
```

Current Group 3 (general attractions with wikidata/wikipedia) — add highway=pedestrian:
```typescript
// ADD to Group 3 (after existing filters):
'node["highway"="pedestrian"]["wikidata"]',
'way["highway"="pedestrian"]["wikidata"]',
'relation["highway"="pedestrian"]["wikidata"]',
'node["highway"="pedestrian"]["wikipedia"]',
'way["highway"="pedestrian"]["wikipedia"]',
'relation["highway"="pedestrian"]["wikipedia"]',
```

**Changes to `OverpassPoiFetcher.ts`** — rebalance per-group limits + add interleaving:

Current code (lines 128-139):
```typescript
  for (const filters of priorityGroups) {
    const pois = await fetchPoisForFilters(city, theme, filters, 75);
    for (const poi of pois) {
      if (theme === 'history' && isLowValueHistoryPoi(poi)) continue;
      const key = `${poi.osmType}:${poi.osmId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(poi);
      if (merged.length >= 150) break;
    }
    if (merged.length >= 150) break;
  }
```

Replace with **round-robin interleaving** that gives every group at least 25 slots before any group gets more:
```typescript
  const MAX_TOTAL = 150;
  const PER_ROUND = 25;
  const seen = new Set<string>();
  const merged: RawPoi[] = [];

  // Round-robin: fetch PER_ROUND from each group, repeat until cap or groups exhausted
  let groupIndex = 0;
  const groupRemaining: number[] = priorityGroups.map(() => PER_ROUND);

  while (merged.length < MAX_TOTAL && groupRemaining.some(n => n > 0)) {
    // Find the next group that still has remaining quota
    for (let attempt = 0; attempt < priorityGroups.length; attempt++) {
      const idx = (groupIndex + attempt) % priorityGroups.length;
      if (groupRemaining[idx] <= 0) continue;
      
      const fetchLimit = Math.min(groupRemaining[idx], PER_ROUND);
      const pois = await fetchPoisForFilters(city, theme, priorityGroups[idx], fetchLimit);
      
      for (const poi of pois) {
        if (theme === 'history' && isLowValueHistoryPoi(poi)) continue;
        const key = `${poi.osmType}:${poi.osmId}`;
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(poi);
        if (merged.length >= MAX_TOTAL) break;
      }
      
      groupRemaining[idx] -= fetchLimit;
      if (merged.length >= MAX_TOTAL) break;
    }
    groupIndex = (groupIndex + 1) % priorityGroups.length;
    
    // Safety: if no group got any new POIs this round, break to avoid infinite loop
    if (merged.length === previousLength) break;
    previousLength = merged.length;
  }
```

**Why this matters / risk reduced**:
- Guarantees Groups 3-4 (attractions, generic historic) always get at least 25 slots, regardless of how many palaces exist.
- Previously: Group 1 fills 75, Group 2 fills ~50, remaining 25 for Groups 3-4 — often 0.
- Now: Each group gets 25, then another 25 each if cap not reached. Maximum per group: 50 (2 rounds).
- Missing tag categories (plazas, markets, pedestrian streets) added so they're actually queried.

**Exit criteria**:
- `npm run build` in backend passes.
- Fresh history theme Overpass check shows POIs with `place=square`, `amenity=marketplace`, or `highway=pedestrian` tags in the pool.
- All 4 groups contribute POIs to the merged result (log verification).

---

### Phase N-5.3 — Wikidata enrichment: add retry with backoff and reduce concurrency

**Scope**: Three files. **Impact**: High — enables notability-based scoring to work, improves narration seed quality.

**Files to modify**:
1. `backend/src/infrastructure/enrichment/WikidataEnricher.ts` — add retry logic
2. `backend/src/infrastructure/enrichment/WikidataClaimsEnricher.ts` — add retry logic
3. `backend/src/services/orchestrationService.ts` — replace concurrent `Promise.all` with batched processing

**Changes to `WikidataEnricher.ts`** — add retry wrapper and increase interval:

Current `MIN_INTERVAL_MS` (line 5): `500`
Change to: `1500`

Current `enrichFromWikidata()` (lines 24-65): Wraps the axios call in try/catch, returns null on any error. No retry.

Add a retry helper before the function:
```typescript
const MAX_RETRIES = 3;
const RETRY_BASE_DELAY_MS = 2000;

async function withRetry<T>(fn: () => Promise<T>, label: string): Promise<T> {
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      return await fn();
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (axiosErr.response?.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_BASE_DELAY_MS * Math.pow(2, attempt);
        console.warn(`[WikidataEnricher] 429 on ${label}, retry ${attempt + 1}/${MAX_RETRIES} after ${delay}ms`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      throw err; // Non-429 or max retries exhausted
    }
  }
  throw new Error(`Retries exhausted for ${label}`);
}
```

Wrap the axios call inside `enrichFromWikidata()`:
```typescript
// Before (line 28):
const response = await axios.get(WIKIDATA_API, { ... });

// After:
const response = await withRetry(
  () => axios.get(WIKIDATA_API, { ... }),
  `labels for ${wikidataId}`
);
```

**Changes to `WikidataClaimsEnricher.ts`** — same pattern:

Current `MIN_INTERVAL_MS` (line 5): `500`
Change to: `1500`

Add the same `withRetry` helper. Wrap the claims fetch (line 69) and the labels fetch (line 41) in `withRetry`.

**Changes to `orchestrationService.ts`** — batched enrichment (lines 521-571):

Current code:
```typescript
const enriched: EnrichedPoi[] = await Promise.all(
  rawPois.map(async (poi): Promise<EnrichedPoi> => {
    // ... enrichment logic per POI
  })
);
```

Replace with batched processing (process 5 POIs at a time):
```typescript
const ENRICH_CONCURRENCY = 5;

async function enrichBatch(pois: RawPoi[]): Promise<EnrichedPoi[]> {
  const results: EnrichedPoi[] = [];
  for (let i = 0; i < pois.length; i += ENRICH_CONCURRENCY) {
    const batch = pois.slice(i, i + ENRICH_CONCURRENCY);
    const batchResults = await Promise.all(
      batch.map(async (poi): Promise<EnrichedPoi> => {
        // ... same enrichment logic per POI ...
      })
    );
    results.push(...batchResults);
    // Log batch progress
    console.log(`[OSM] Enriched batch ${Math.floor(i / ENRICH_CONCURRENCY) + 1}/${Math.ceil(pois.length / ENRICH_CONCURRENCY)}: ${results.length}/${pois.length} POIs`);
  }
  return results;
}

const enriched: EnrichedPoi[] = await enrichBatch(rawPois);
```

**Why it matters / risk reduced**:
- HTTPS 429s are the #1 reason enrichment fails. With retry + reduced concurrency, most requests should succeed.
- Successful enrichment means notability bonuses (Wikipedia body length, Wikidata claims) can activate, making the ranker more intelligent than OSM tags alone.
- Better narration: richer seed data → fewer thin-mode fallbacks → better end-of-tour quality.
- Batch processing also adds progress logging, which improves observability (currently there's a long silent period during enrichment).

**Exit criteria**:
- `npm run build` in backend passes.
- Generate a tour. Backend logs show enrichment batches progressing (not all silently failing).
- Verify that ≥ 30% of enriched POIs have `wikipediaBody` or `wikidataClaims` populated (not all null).
- Backend logs show 429 retry messages when rate limiting occurs (not silent null returns).

---

### Phase N-5.4 — Route composition: relax segment constraints for high-importance POIs (optional)

**Scope**: One file. **Impact**: Lower — fine-tunes route composition to avoid dropping important POIs just because of walkability.

**File to modify**:
- `backend/src/services/orchestrationService.ts` — `composeWalkingTour()` method (lines 415-489)

**Current behavior**:
- Max segment distance: 1200m (crow-flies × 1.3 = ~1560m walking)
- Segments > 1200m cause the entire prefix to be rejected (`hasOverMaxSegment` → skip)
- Ideal segment: 300-900m
- Tour duration must be 75%-115% of requested

**Problem**: The route composition sorts by duration fit first, then ideal segments, then importance sum. A good POI at position N+1 that creates a 1250m segment causes the entire N+1 prefix to be rejected, and the route falls back to the N-prefix (without that POI).

**Proposed change** (minimal):
1. Increase `hasOverMaxSegment` threshold from 1200m to **1500m** (line 336 in `estimateRouteMetrics`)
2. In the ranking function (lines 469-477), add a tiebreaker for `importanceSum` before `outOfIdealSegments`:
```typescript
const rankCandidates = (a, b) => {
  if (a.durationGap !== b.durationGap) return a.durationGap - b.durationGap;
  // Prioritize importance over ideal segments
  if (b.importanceSum !== a.importanceSum) return b.importanceSum - a.importanceSum;
  if (a.metrics.outOfIdealSegments !== b.metrics.outOfIdealSegments) 
    return a.metrics.outOfIdealSegments - b.metrics.outOfIdealSegments;
  return 0;
};
```

**Why it matters / risk reduced**:
- Prevents important non-palace landmarks (that may be slightly geographically outlying) from being dropped just for walkability reasons.
- The ranking change reorders priority: duration fit first, then importance, then walkability — so a route with slightly worse walkability but much better stops is preferred.
- Low risk: only changes thresholds/priorities, not the algorithm structure.

**Exit criteria**:
- `npm run build` in backend passes.
- Madrid history tour (240 min) no longer drops Plaza Mayor or other important non-palace POIs due to walkability constraints.
- Walking distance remains reasonable (< 5km total for a 240-min route).

---

### Dependency order

```
N-5.2 (add categories + interleave)  ── independent
        │
N-5.1 (rebalance scoring)            ── independent, but benefits from N-5.2's richer pool
        │
N-5.3 (Wikidata retry + batching)    ── independent, enables notability scoring
        │
N-5.4 (route composition tuning)     ── depends on N-5.1+N-5.2 (needs good POIs to route)
```

Historical note: this was the recommended order before the 2026-05-29 live rerun.

Current interpretation:
- N-5.1: effectively implemented in revised ranker/category logic
- N-5.2: effectively implemented in prioritized history harvesting and broader category support
- N-5.3: materially addressed by serialized Wikidata access and safer enrichment flow
- N-5.4: too narrow as written; the remaining issue is broader long-tour composition behavior

### Closeout

Phase N-5 should no longer be treated as an untouched future plan.

What remains open from this area has moved to a new composition/product-fit phase:
- fixture-driven acceptance for major-city history tours
- route composition changes for long-duration requests
- degraded-route retry using broader spatial spread

---

## Phase N-6 — Long-tour composition and first-visit city-tour quality

Status: **planned — next recommended POI phase**

### Diagnosis

Live runtime now shows:
- the candidate pool is rich enough in major cities like Madrid,
- the shortlist contains strong landmarks,
- but the final route can still collapse into a hyper-compact city-center cluster,
- causing severe under-coverage of requested duration and weak first-visit tourist value.

The failure mode is product-facing:
- a 240-minute city history tour should resemble a commercially plausible city introduction,
- not a 70-minute cluster of locally valid points.

### Scope

1. Add frozen fixture-based acceptance cases for major-city history tours.
2. Treat low coverage in landmark-rich cities as a composition failure, not acceptable degradation.
3. Scale segment tolerance with requested duration.
4. Retry degraded long tours with an alternative spatial ordering strategy.
5. Evaluate route quality by landmark coverage plus plausibility, then walkability.

### Verification criteria

- Major-city history fixtures pass deterministic acceptance checks.
- A long Madrid history tour no longer collapses to ~70 minutes when the pool contains enough strong landmarks.
- `npm test -- --runInBand` in backend passes.
- `npm run build` in backend passes.

### Rollback strategy

Each phase is independently reversible:
- `git checkout -- backend/src/services/poi/PoiRanker.ts` (N-5.1)
- `git checkout -- backend/src/domain/poi/themeTags.ts backend/src/infrastructure/poi/OverpassPoiFetcher.ts` (N-5.2)
- `git checkout -- backend/src/infrastructure/enrichment/WikidataEnricher.ts backend/src/infrastructure/enrichment/WikidataClaimsEnricher.ts backend/src/services/orchestrationService.ts` (N-5.3)
- `git checkout -- backend/src/services/orchestrationService.ts` (N-5.4)

---

## Phase 15 — VoxCPM TTS stabilization (crash fixes)

Status: **planned — not started**

### Diagnosis

After Phase TTS-5 (reference-audio consistency), live usage revealed critical failures in the VoxCPM pod that make the TTS pipeline unreliable:

1. **`reference_id` rejected by `model.generate()`** (`voxcpm.py:197-200`): The upstream API only accepts `reference_wav_path`, not `reference_id`. Every reference-mode chunk incurs a guaranteed TypeError + retry.

2. **CUDA device-side assert crashes** (`index out of bounds: 0 <= tmp5 < 8192`): 420-char chunks produce token sequences that exceed VoxCPM2's 8192-token vocabulary. This poisons the CUDA context, making ALL subsequent `model.generate()` calls fail until process restart.

3. **No CUDA crash containment**: After `torch.AcceleratorError`, the pod continues accepting requests but every call fails. The fallback chain (reference -> Voice Design -> backend Kokoro -> empty URL) breaks because Voice Design also crashes on the poisoned context.

4. **Kokoro ECONNREFUSED**: Backend always includes Kokoro as fallback provider but Kokoro is on port 3005 (often not running). No pre-flight health check.

5. **Minimal text sanitization**: Sanitizer only handles markdown. Doesn't strip emojis, brackets, URLs, or other characters that can confuse VoxCPM's prompt format `(description)text`.

6. **Voice profile mismatch**: Log shows `guide_fr` for a Spanish place — language-to-voice mapping has no validation.

### Verification criteria

- Generate a tour with 3+ stops using VoxCPM primary.
- No CUDA device-side asserts in logs.
- No `TypeError: reference_id` warnings in logs.
- VoxCPM pod survives all stops without process restart.
- Backend health check excludes Kokoro when not running (log evidence).
- All chunks produce valid audio (verified by listening to generated WAV files).
- `python3 -m py_compile src/services/voxcpm.py src/utils/sanitize.py src/routes/tts.py` passes in `pods/voxcpm-pod`.
- `npm run build` passes in `backend`.

---

### Phase 15.1 — Remove `reference_id` from `model.generate()` call

**Scope**: One method in one file.

**Files to modify**:
- `pods/voxcpm-pod/src/services/voxcpm.py` — `_generate_reference_chunk()` (lines 195-216)

**Changes**:
1. Remove `reference_id=reference["id"]` from the `model.generate()` call at line 200.
2. Remove the try/except `TypeError` fallback block (lines 204-216) — it's no longer needed.
3. Keep `reference["id"]` usage in logging only (line 209 is removed, but lines 137 and 168 still reference it safely).

**Before (current)**:
```python
def _generate_reference_chunk(self, text: str, reference: dict):
    try:
        return self.model.generate(
            text=text,
            reference_wav_path=reference["path"],
            reference_id=reference["id"],       # <-- REMOVE
            cfg_value=2.0,
            inference_timesteps=10,
        )
    except TypeError as error:
        if "reference_id" not in str(error):
            raise
        logger.warning(...)
        return self.model.generate(
            text=text,
            reference_wav_path=reference["path"],
            cfg_value=2.0,
            inference_timesteps=10,
        )
```

**After**:
```python
def _generate_reference_chunk(self, text: str, reference: dict):
    return self.model.generate(
        text=text,
        reference_wav_path=reference["path"],
        cfg_value=2.0,
        inference_timesteps=10,
    )
```

**Why it matters / risk reduced**:
- Eliminates 2x inference calls per chunk (first always fails). At 5 chunks per stop, 6 stops = 30 wasted calls.
- Removes the fragile `TypeError` string-matching hack.

**Exit criteria**:
- `python3 -m py_compile src/services/voxcpm.py` passes.
- No `reference_id` in any `model.generate()` call site (grep verification).
- `reference["id"]` still appears in log statements only (lines 137, 168).

---

### Phase 15.2 — Reduce chunk size from 420 to 250 chars

**Scope**: One constant in one file.

**Files to modify**:
- `pods/voxcpm-pod/src/utils/sanitize.py` — `chunk_text()` (line 22)

**Change**:
```python
# Before (current):
def chunk_text(text: str, max_chars: int = 420) -> list[str]:

# After:
def chunk_text(text: str, max_chars: int = 250) -> list[str]:
```

Also update the `chunk_text()` call site in `voxcpm.py` line 125 if it passes an explicit value (currently it does not — it uses the default).

**Why it matters / risk reduced**:
- Primary fix for CUDA device-side assert (`index out of bounds: 0 <= tmp5 < 8192`).
- At 250 chars, expected max tokens ≈ 125-175 (well within safe range).
- Sentence-aware splitting preserved — no mid-sentence breaks.

**Exit criteria**:
- `python3 -m py_compile src/utils/sanitize.py` passes.
- Default `max_chars` value is 250.

---

### Phase 15.3 — Add strict text sanitization

**Scope**: One function in one file.

**Files to modify**:
- `pods/voxcpm-pod/src/utils/sanitize.py` — `sanitize_text()` (lines 4-19)

**Changes** (add BEFORE existing markdown stripping):
1. **Strip emojis and non-printable Unicode**: Remove characters in Unicode categories So (Symbol, Other), Cn (Unassigned), and control chars < 0x20 (except newline). Keep letters, numbers, punctuation, spaces.
2. **Remove bracket/parenthesis groups**: Strip content inside `[...]` and `{...}` that could confuse the `(description)text` prompt format.
3. **Replace URLs**: Match `http://...`, `https://...`, `www....` patterns and replace with `[link]`.
4. **Expand common abbreviations**: "St." -> "Saint", "Ave." -> "Avenue", "km" -> "kilometers", "m" -> "meters" (context-aware: only when preceded by a digit).

**After existing markdown stripping**:
5. **Collapse multiple spaces**: Already done at line 17.
6. **Strip leading/trailing whitespace**: Already done at line 19.

**Why it matters / risk reduced**:
- Parentheses in text body can confuse VoxCPM's `(description)text` prompt format.
- Emojis and URLs have no audible value but can produce garbage token IDs.
- Abbreviation expansion improves TTS pronunciation.

**Exit criteria**:
- `python3 -m py_compile src/utils/sanitize.py` passes.
- Test with sample text containing emojis, URLs, brackets, and abbreviations produces clean output.

---

### Phase 15.4 — Catch `torch.AcceleratorError` and exit pod

**Scope**: Two methods in one file, plus route handler.

**Files to modify**:
- `pods/voxcpm-pod/src/services/voxcpm.py` — `generate_speech()` (lines 106-178)
- `pods/voxcpm-pod/src/routes/tts.py` — `generate()` (lines 21-31)

**Changes**:

1. **`voxcpm.py`**: Add `import os` (or `import sys`) at top. Wrap the generation body in `try: ... except torch.AcceleratorError: ...`:
   - In `generate_speech()`: catch at the top level so reference mode AND voice design mode failures are both captured.
   - Log: `"FATAL: CUDA context poisoned by device-side assert. Exiting pod."`
   - Return `{"success": False, "error": "CUDA context corrupted — pod restarting"}`.
   - Call `os._exit(1)` to force process termination.

2. **`tts.py`**: In the `generate()` route handler (line 22-31), check for the specific error message. If it matches the CUDA corruption message, return HTTP `503 Service Unavailable` instead of HTTP 200 with error body.

3. **`voxcpm.py`**: In `_generate_with_voice_design()` (lines 180-186) and `_generate_with_reference()` (lines 188-193): mark these as NOT catching `torch.AcceleratorError` — let it bubble up to `generate_speech()`.

**Why it matters / risk reduced**:
- Prevents a dead pod from accepting and failing further requests.
- The backend falls back to Kokoro (or empty URL) for the current request only.
- Process supervision (Docker restart, systemd, or manual restart) brings the pod back for subsequent tours.

**Exit criteria**:
- `python3 -m py_compile src/services/voxcpm.py src/routes/tts.py` passes.
- Grep: `torch.AcceleratorError` appears in an except clause in `voxcpm.py`.
- Grep: `os._exit(1)` or `sys.exit(1)` appears in the same except block.
- Pod returns 503 (not 200) on CUDA assert.

---

### Phase 15.5 — Add token-count pre-check

**Scope**: One helper, called from two methods.

**Files to modify**:
- `pods/voxcpm-pod/src/services/voxcpm.py` — `_generate_with_voice_design()` (line 180), `_generate_reference_chunk()` (line 195)

**Change**: Add a helper function (module-level or static method):

```python
def _estimate_tokens(text: str, desc: str = "") -> int:
    """Conservative estimate: ~3 chars per token for English-like text."""
    return max(1, (len(text) + len(desc)) // 3)
```

In both generation methods, before calling `model.generate()`:
- Calculate estimated tokens for the prompt.
- If > 500, log a warning: `"Chunk exceeds safe token limit: {estimated} estimated tokens (max 500). Skipping."`
- Skip this chunk (return empty/None) rather than sending it to the GPU.

**Why it matters / risk reduced**:
- Defense-in-depth: even with 250-char chunks and sanitization, some edge cases could produce unexpectedly long token sequences (e.g., very long words, Unicode characters that tokenize to multiple tokens).
- The log message provides actionable diagnostics instead of an opaque CUDA assert.

**Exit criteria**:
- `python3 -m py_compile src/services/voxcpm.py` passes.
- `_estimate_tokens` helper exists and is called before every `model.generate()`.

---

### Phase 15.6 — Add Kokoro health check in backend

**Scope**: One method in one file, ~5 lines of code.

**Files to modify**:
- `backend/src/services/orchestrationService.ts` — `generateAudio()` (lines 864-1000)

**Change**: Before the per-place loop (around line 917 where `providers` array is built):

```typescript
// Before building providers list, check if Kokoro is reachable
let kokoroAvailable = false;
if (this.kokoroServiceUrl) {
  try {
    await axios.get(`${this.kokoroServiceUrl}/health`, { timeout: 3000 });
    kokoroAvailable = true;
  } catch {
    console.warn('Kokoro TTS pod is not reachable — excluding from fallback chain');
  }
}

const providers = [
  ...(this.voxcpmServiceUrl ? [{ name: 'VoxCPM', url: this.voxcpmServiceUrl }] : []),
  ...(kokoroAvailable ? [{ name: 'Kokoro', url: this.kokoroServiceUrl }] : [])
];
```

If Kokoro has no `/health` endpoint, use `HEAD /` with a short timeout instead.

**Why it matters / risk reduced**:
- Avoids guaranteed ECONNREFUSED + timeout on every stop when Kokoro is down.
- One health check per tour, not per stop.
- Reduces empty-audio failures.

**Exit criteria**:
- `npm run build` in backend passes.
- When Kokoro is down, log shows "Kokoro TTS pod is not reachable" and providers array has only VoxCPM (or is empty if VoxCPM also down).
- When Kokoro is up, providers array includes Kokoro as before.

---

### Phase 15.7 — Validate voice profile mapping

**Scope**: One method in one file.

**Files to modify**:
- `backend/src/services/orchestrationService.ts` — `generateAudio()` method, around line 870

**Change**: After constructing `voxcpmVoice`:

```typescript
const voxcpmVoice = process.env.VOXCPM_VOICE_PROFILE || `guide_${(language || 'en').slice(0, 2)}`;

// Validate that the constructed profile is a known VoxCPM voice profile
const KNOWN_VOXCPM_PROFILES = ['guide_en', 'guide_es', 'guide_fr', 'guide_de', 'guide_it'];
const effectiveVoice = KNOWN_VOXCPM_PROFILES.includes(voxcpmVoice) 
  ? voxcpmVoice 
  : (console.warn(`Unknown VoxCPM voice profile "${voxcpmVoice}", falling back to guide_en`), 'guide_en');
```

Use `effectiveVoice` instead of `voxcpmVoice` throughout the method. Add a tour-level log: `console.log(`Tour language: ${language}, VoxCPM voice profile: ${effectiveVoice}`)`.

**Why it matters / risk reduced**:
- Prevents French voice on Spanish tours.
- The tour-level log makes language/profile mismatches immediately visible.
- Fallback to `guide_en` is safe — English voice description is the most tested.

**Exit criteria**:
- `npm run build` in backend passes.
- Log shows "Tour language: es, VoxCPM voice profile: guide_es" for Spanish tours.
- Unknown language codes (e.g., "pt") fall back to `guide_en` with a warning.

---

### Dependency order

```
15.1 (remove reference_id)  ── independent
        │
15.2 (reduce chunk size)    ── independent
        │
15.3 (strict sanitization)  ── independent, but benefits from 15.2's smaller chunks
        │
15.4 (CUDA error exit)      ── depends on 15.2 (fewer crashes), independent otherwise
        │
15.5 (token pre-check)      ── independent, best done after 15.2-15.3
        │
15.6 (Kokoro health check)  ── independent (backend only)
        │
15.7 (voice profile validate) ── independent (backend only)
```

**Recommended execution order**: 15.1, 15.2, 15.3 first (pod-side crash fixes) → 15.4, 15.5 (crash containment) → 15.6, 15.7 (backend hardening).

### Rollback strategy

Each phase is a single-file change. Revert any phase independently:
- `git checkout -- pods/voxcpm-pod/src/services/voxcpm.py` (for 15.1, 15.4, 15.5)
- `git checkout -- pods/voxcpm-pod/src/utils/sanitize.py` (for 15.2, 15.3)
- `git checkout -- backend/src/services/orchestrationService.ts` (for 15.6, 15.7)

### Phase 16 — DevOps/infrastructure (deferred)

These items are identified but deferred until Phase 15 crash fixes are validated:

1. **Add VoxCPM to docker-compose.dev.yml**: Currently only supabase-pod occupies port 3006. VoxCPM needs a docker-compose service entry with GPU passthrough.
2. **Set up process supervision**: Docker `restart: unless-stopped` or systemd unit for the VoxCPM pod so it auto-restarts after `os._exit(1)` in Phase 15.4.
3. **Add CUDA-ready health check endpoint**: `/health` endpoint on VoxCPM pod that returns 200 only if `model.generate()` succeeds on a tiny test prompt. Backend can use this before including VoxCPM in the providers list.
