# 02 - Architecture Decisions (ADR Style)

This file captures architecture decisions in ADR format.

Status values:
- proposed
- accepted
- rejected

---

## ADR-019 — VoxCPM voice consistency uses stable profiles, not fake seeds

### Context

VoxCPM2 voice design is controlled by natural-language prompt descriptions. The public `VoxCPM.generate()` API reviewed on 2026-05-24 exposes prompt/reference audio controls and generation parameters, but not `seed`, `random_state`, `generator`, or `torch_generator`. The local host environment did not have `voxcpm` installed for import introspection without adding dependencies.

### Recommended decision

Keep **VoxCPM as primary** and make the existing `voice` parameter meaningful by mapping stable profile names such as `guide_en`, `guide_es`, and `guide_fr` to canonical voice descriptions. Preserve Kokoro as fallback with its existing deterministic named voice.

### Why it matters / risk reduced

- Avoids passing unsupported seed parameters that could break runtime generation.
- Improves cross-stop consistency without switching away from VoxCPM quality.
- Keeps fallback behavior unchanged and avoids broad async/job or provider-routing changes.

### Status

**accepted**

---

## ADR-020 — VoxCPM consistency uses cached reference audio

### Context

Stable voice descriptions reduce prompt drift, but VoxCPM Voice Design can still reinterpret a profile on every chunk. VoxCPM2 supports `reference_wav_path`, which lets generation condition each chunk on the same speaker reference.

### Recommended decision

Use a reusable bootstrap reference WAV per `language + provider + model + voiceProfile`. Store the reusable identity in `voice_reference_audio`, pass the row id to `voxcpm-pod` as `referenceId`, and let the pod create/reuse `AUDIO_CACHE/voice_references/<referenceId>.wav`. Keep Voice Design as the intra-pod fallback and Kokoro as backend provider fallback.

### Why it matters / risk reduced

- Conditions all chunks on one speaker reference instead of recreating a voice from text for every chunk.
- Avoids filesystem sharing between backend and pod; the pod owns local WAV paths required by VoxCPM.
- Keeps DB scope minimal: one audit/cache table, no `audio_assets` schema changes in this phase.

### Status

**accepted**

---

## ADR-001 - Local database choice

### Context

Project needs local-first persistence now, with low-friction migration to cloud later.

### Options

1. PostgreSQL local (containerized).
2. SQLite local.
3. Supabase local stack/CLI.

### Pros / Cons

1) PostgreSQL local
- Pros: closest to future Supabase cloud (Postgres), strong relational features, predictable migration path.
- Cons: requires container/runtime setup.

2) SQLite
- Pros: simplest startup.
- Cons: diverges from target Postgres behavior; future migration risk.

3) Supabase local stack
- Pros: cloud-parity with Supabase features.
- Cons: heavier operational setup for MVP.

### Recommended decision

Use **PostgreSQL local** as default.

### Status

**accepted**

---

## ADR-016 — VoxCPM primario con Kokoro como fallback

### Context

El usuario quiere VoxCPM como TTS principal por calidad de voz, pero Kokoro ya existe como ruta funcional en el `tts-pod` y debe quedar como respaldo. VoxCPM corre en `pods/voxcpm-pod` con `openbmb/VoxCPM2` en puerto `3006`; Kokoro corre en `pods/tts-pod` en puerto `3005`.

### Recommended decision

Adoptar **VoxCPM como proveedor primario** y **Kokoro como fallback** en una fase posterior de implementación, cableada desde `backend/src/services/orchestrationService.ts`.

### Why it matters / risk reduced

- Mejora calidad de voz sin perder la estabilidad de Kokoro como ruta probada.
- Reduce el riesgo de tours sin audio si VoxCPM falla, expira o devuelve audio inválido.
- Evita una migración big-bang de TTS: primero fallback, luego optimización de calidad.

### Status

**accepted**

---

## ADR-017 — Reparar seams de VoxCPM antes de optimizaciones mayores

### Context

VoxCPM corta texto a `600` caracteres, sintetiza chunks independientes y concatena con `np.concatenate()`, lo que puede crear clics, cortes o cambios de prosodia en uniones.

### Recommended decision

Planificar una mejora localizada en `pods/voxcpm-pod/src/services/voxcpm.py` y `pods/voxcpm-pod/src/utils/sanitize.py`: chunking más conservador, cortes por puntuación/frase y crossfade o pausa controlada entre chunks.

### Why it matters / risk reduced

- Ataca la causa probable de los artefactos sin sustituir el proveedor TTS.
- Reduce riesgo de introducir streaming o sesiones complejas antes de validar una solución simple.

### Status

**accepted**

---

## ADR-018 — Usar `llama3.1:8b` para narración larga

### Context

La narración larga hardcodea `NARRATIVE_MODEL = 'qwen3:4b'` en `pods/llm-pod/src/routes/narrativeLong.ts`. El default env del llm-pod es `gemma4:26b`, pero no está activo para esta ruta porque la narración sobrescribe el modelo. El usuario ya descargó `llama3.1:8b`.

### Recommended decision

Usar **`llama3.1:8b` como modelo recomendado para narración larga**, antes de considerar modelos mayores. Mantener mejoras de prompts y retry policy como cambios complementarios.

### Why it matters / risk reduced

- Mejora capacidad narrativa respecto a `qwen3:4b` con un presupuesto VRAM compatible con VoxCPM en una RTX 5080 de 16GB.
- Evita cargar `gemma4:26b` como solución por defecto, reduciendo riesgo de OOM.
- Mantiene el cambio acotado a `narrativeLong.ts` y reversible.

### Status

**accepted**

---

## ADR-002 - Persistence inside backend vs persistence-pod

### Context

Current architecture uses an extra persistence service (`supabase-pod`) over HTTP.

### Options

1. Keep persistence inside backend (modularized internally).
2. Keep separate persistence-pod.

### Pros / Cons

1) Persistence inside backend
- Pros: fewer moving parts, less latency, easier debugging for MVP.
- Cons: weaker service isolation if scaled later.

2) Persistence-pod
- Pros: clean service boundary, independent scaling/deployment.
- Cons: extra network hops, higher local complexity.

### Recommended decision

For MVP/local phase, **implement persistence inside backend** with clean internal interfaces.

Why it matters / risk reduced:
- Reduces operational complexity and internal network failure points during MVP.
- Prevents Supabase-specific persistence from becoming the primary domain abstraction.
- Keeps an easier path to extract persistence later if needed.

### Status

**accepted**

---

## ADR-003 - Local audio storage strategy

### Context

Audio files are generated and must be stored/retrieved reliably during local development.

### Options

1. Local filesystem storage.
2. MinIO local (S3-compatible).
3. Direct Supabase Storage cloud.

### Pros / Cons

1) Local filesystem
- Pros: simplest local setup, fast iteration.
- Cons: non-cloud path semantics; needs adapter for cloud later.

2) MinIO
- Pros: cloud-like object storage behavior locally.
- Cons: extra infrastructure.

3) Supabase Storage cloud
- Pros: immediate cloud behavior.
- Cons: violates local-first objective; external dependency.

### Recommended decision

Use **local filesystem via `AudioStorage` interface** now, with a future cloud adapter.

### Status

**accepted**

---

## ADR-004 - Repository pattern / data access abstraction

### Context

Current persistence is implementation-specific. Need portability and testability.

### Options

1. Direct DB client calls from use cases.
2. Repository interfaces + concrete adapters.

### Pros / Cons

1) Direct DB calls
- Pros: less boilerplate initially.
- Cons: coupling, harder tests, expensive provider changes.

2) Repository interfaces
- Pros: clear boundaries, easier mocks/tests, easier cloud migration.
- Cons: moderate upfront design effort.

### Recommended decision

Adopt **repository + storage interfaces** for domain/application boundaries.

Initial repository interfaces for MVP:
- `TourRepository`
- `PlaceRepository`
- `AudioAssetRepository`

Why it matters / risk reduced:
- Removes direct infrastructure coupling from orchestration/business logic.
- Reduces refactor cost for local-to-cloud transition.
- Improves testability with mocks/fakes.

### Status

**accepted**

---

## ADR-005 - Prisma vs Drizzle vs raw SQL

### Context

Need migration discipline and reliable schema evolution for local Postgres and future cloud.

### Options

1. Prisma.
2. Drizzle.
3. Raw SQL migrations only.

### Pros / Cons

1) Prisma
- Pros: mature tooling, clear migration workflow, strong developer ergonomics.
- Cons: abstraction overhead; generated artifacts.

2) Drizzle
- Pros: lightweight, TypeScript-centric, explicit SQL feel.
- Cons: smaller ecosystem vs Prisma.

3) Raw SQL only
- Pros: maximum SQL control.
- Cons: more manual work; higher inconsistency risk across team.

### Recommended decision

Start with **Prisma** for speed/consistency unless team strongly prefers Drizzle.

### Status

**accepted and largely implemented**

Update 2026-05-29:
- The original palace-dominance diagnosis was valid and the scoring direction was applied in code.
- Latest live evidence suggests palace dominance is no longer the primary open failure mode.
- Remaining product risk now sits more in route composition for long tours than in this ADR itself.

---

## ADR-006 - Microservices vs modular monolith for MVP

### Context

Current service distribution is powerful but operationally heavy for MVP.

### Options

1. Keep full microservice-style runtime for MVP.
2. Shift core app to modular monolith; keep specialized AI pods only where needed.

### Pros / Cons

1) Full microservices
- Pros: strong long-term service boundaries.
- Cons: slow local iteration, complex debugging, high ops overhead.

2) Modular monolith core
- Pros: faster delivery, fewer failure points, simpler testing.
- Cons: requires explicit module boundaries discipline.

### Recommended decision

Adopt **modular monolith core for MVP**, preserving adapter boundaries for later service extraction.

Constraint for current project state:
- **Do not delete existing pods now**.
- Keep pods in place unless an explicit roadmap phase changes their role.
- Stabilize contracts and local persistence first.

Why it matters / risk reduced:
- Avoids disruptive restructuring before contracts/persistence are stable.
- Prevents big-bang migration risk.
- Preserves current integration surface while architecture is hardened.

### Status

**accepted**

---

## ADR-007 - Cloud target timing

### Context

The target cloud persistence is Supabase/PostgreSQL, but current objective is local-first implementation and stabilization.

### Options

1. Move to Supabase cloud now.
2. Stabilize local PostgreSQL first, then add Supabase adapter.

### Pros / Cons

1) Supabase cloud now
- Pros: immediate cloud integration.
- Cons: introduces external dependency, increases setup complexity, and can hide local architecture issues.

2) Local first, cloud later
- Pros: faster iteration, easier debugging, controlled architecture hardening.
- Cons: requires one later adapter/integration phase.

### Recommended decision

Use **local PostgreSQL now** and adopt **Supabase/PostgreSQL as a later cloud adapter target**.

Why it matters / risk reduced:
- Reduces early delivery risk.
- Keeps focus on contract stability and local MVP reliability.

### Status

**accepted**

---

## ADR-008 - Migration strategy

### Context

Schema changes need reproducibility across local/dev/future cloud environments.

### Options

1. Versioned migrations.
2. Manual ad-hoc schema edits.

### Pros / Cons

1) Versioned migrations
- Pros: reproducible, auditable, CI-friendly, rollback-capable.
- Cons: requires process discipline.

2) Manual schema edits
- Pros: fast for one-off changes.
- Cons: environment drift and high operational risk.

### Recommended decision

Adopt **versioned migrations** from the first persistence phase.

Why it matters / risk reduced:
- Prevents schema drift across environments.
- Lowers deployment and rollback risk.

### Status

**accepted**

---

## ADR-009 - Implementation strategy

### Context

Current system already has multiple moving pieces and a non-trivial orchestration flow.

### Options

1. Big-bang refactor.
2. Small phased implementation.

### Pros / Cons

1) Big-bang
- Pros: one-time architecture rewrite.
- Cons: high regression risk, long feedback cycle.

2) Phased
- Pros: safer delivery, incremental validation, easier rollback.
- Cons: takes multiple iterations.

### Recommended decision

Use **one phase at a time** with explicit entry/exit criteria.

Why it matters / risk reduced:
- Minimizes regressions.
- Keeps architecture changes measurable and reversible.

### Status

**accepted**

---

## ADR-010 - Frontend dev-server configuration stabilization

### Context

Next.js 15 dev requests for internal chunks (`/_next/static/chunks/webpack.js`, `main-app.js`) are returning HTTP 500. The active `frontend/next.config.mjs` contains unsupported/stale config (`webpackDevMiddleware`) and aggressive webpack optimization overrides that are unnecessary for the MVP and can destabilize dev chunk generation.

### Recommended decision

Use the smallest valid Next.js config for the current MVP: keep `reactStrictMode: true`, keep `transpilePackages: ['react-leaflet']`, and preserve only the Node `fs` fallback if still needed by existing client bundling. Remove `webpackDevMiddleware` and custom optimization overrides.

### Why it matters / risk reduced

- Restores Next-owned defaults for React 19 / Next 15 dev chunking.
- Reduces the risk of debugging false frontend failures caused by obsolete config rather than application code.
- Keeps the change reversible and avoids a broader build-system rewrite.

### Status

**accepted and largely implemented**

Update 2026-05-29:
- The candidate-pool bottleneck that motivated this ADR has been materially reduced.
- Major-city pools now contain stronger landmark candidates.
- Remaining weakness is no longer primarily pool starvation but final route composition.

---

## ADR-011 - Frontend city geocoding through a same-origin route handler

### Context

City autocomplete currently calls Nominatim directly from browser code while attempting to set headers such as `User-Agent`. Browsers cannot reliably set all required service-identification headers, and cross-origin behavior can break suggestions while typing. The backend already has server-side Nominatim logic, but the smallest frontend-only boundary fix is a same-origin Next App Router route handler.

### Recommended decision

Add `frontend/src/app/api/geocoding/cities/route.ts` as a minimal server-side proxy for city search. Update `frontend/src/services/geocoding.ts` to call `/api/geocoding/cities?q=...` and keep the existing `LocationData` response shape used by `LocationPicker`.

### Why it matters / risk reduced

- Moves Nominatim calls to a server context where required headers and response mapping are controllable.
- Avoids exposing autocomplete UX to browser CORS/header limitations.
- Limits the UI change to one existing service function instead of refactoring `LocationPicker`.

### Status

**accepted and materially implemented**

Update 2026-05-29:
- The exact mechanism changed during implementation, but the architectural intent landed: Wikidata access is now serialized to avoid rate-limit races and the pipeline is safer under live runtime pressure.

---

## ADR-035 — Prefer product-credible long routes over hyper-compact degraded routes

### Context

After the earlier POI selection fixes landed, a live `Madrid/history/es/240` run still produced a weak tour product:
- 111 raw POIs
- 40 ranked candidates
- 6 final stops
- estimated tour length around 71 minutes
- degraded output with `coverageRatio ~= 0.297`

The shortlist already contained stronger landmarks. The primary remaining failure was the route-composition strategy itself:
- nearest-neighbor ordering anchors the route in a compact core
- hard segment rejection filters out broader prefixes
- long tours can collapse into short city-center walks even in landmark-rich cities

### Recommended decision

For long-duration city tours, product-fit should outrank local compactness when enough supply exists.

Concretely:
1. Add fixture-based acceptance tests for major-city history tours.
2. Scale segment tolerance with requested duration.
3. Treat very low coverage in landmark-rich cities as a composition failure, not just graceful degradation.
4. Retry degraded long tours with an alternative spatial ordering strategy before accepting the compact route.

### Why it matters / risk reduced

- Aligns output with what users expect from commercial city tours.
- Keeps the architecture data-driven instead of immediately falling back to hardcoded city lists.
- Targets the current bottleneck directly instead of adding more ranker heuristics on top of a failing composition step.

### Status

**proposed**

---

## ADR-012 - Diagnose Generate Tour loading and local audio path before redesign

### Context

User reports that pressing **Generate Tour** produces no visible loading feedback, then a later browser console warning appears: `A listener indicated an asynchronous response by returning true, but the message channel closed before a response was received`. The same session also shows `Audio error: {}` from `frontend/src/components/tour/AudioPlayer.tsx`. Current code state shows `TourForm` already renders a button loading spinner plus a loading status panel, `AudioPlayer` already logs detailed media diagnostics from `audio.error`, and `PlaceCard` passes absolute `http://localhost:3001/audio/...` URLs directly. Backend code still writes generated WAV bytes through `LocalFileAudioStorage`, records metadata through `PostgresAudioAssetRepository`, and serves files statically at `/audio`.

### Recommended decision

Treat this as a runtime verification/debugging seam, not an architecture rewrite. First verify that the submitted frontend instance is actually running the current `TourForm` code and that generated tour responses include authoritative backend audio URLs. Then verify file existence and HTTP playback for `backend/data/audio/<placeId>-<language>.wav` before changing persistence or player architecture.

### Why it matters / risk reduced

- Avoids chasing stale-browser, wrong-port, or wrong-working-tree symptoms with unnecessary code changes.
- Preserves the accepted local audio architecture while testing the exact contract: TTS pod returns bytes, backend saves bytes, DB stores metadata, `/audio` serves the file, frontend plays the absolute backend URL.
- Reduces risk of reintroducing the legacy Next `/api/audio/[id]` Supabase proxy into the canonical generated-audio path.
- Keeps the browser-extension async-listener warning separate from app errors unless reproduced in a clean profile.

### Status

**proposed**

---

## ADR-013 — Narration quality improvement strategy

### Context

Current narration output (via `NarrativeBuilder` → llm-pod `/narrative/stop/long` using `qwen3:4b`) produces technically valid but thin narration. The multi-section structure (arrival, history, significance, transition) is sound architecturally, but the actual text quality is constrained by model size, prompt depth, and lack of tour-level coherence.

### Options

**Option A: Improve current prompt engineering (simpler, faster)**
- Expand section prompts with richer persona instructions, sensory detail cues, and concrete "good/bad" examples.
- Add a post-generation quality-scoring step that retries weak sections.
- Pros: No architecture changes; lowest risk; quickest to deliver.
- Cons: `qwen3:4b` will always have a quality ceiling; prompt improvements alone may not be enough.

**Option B: Multi-pass narration generation (character/role-based)**
- Generate each section with a different "narrator persona" (historian, local guide, storyteller).
- Merge passes into a final curated script.
- Pros: Each pass can focus on one dimension; richer output potential.
- Cons: 3–4× LLM calls per stop; much slower generation; complex merge/conflict logic.

**Option C: Template-based with LLM enrichment**
- Pre-craft structural templates per position/theme/stop-type.
- Use LLM only to fill factual gaps and add natural transitions.
- Pros: Guaranteed structural quality; predictable output shape.
- Cons: Templates feel generic at scale; high maintenance burden; LLM is underused where facts are rich.

### Recommended decision

**Option A — improved prompt engineering** as the immediate step, with a staged upgrade path.

Why it matters / risk reduced:
- `qwen3:4b` is already producing structurally correct, validated output. The bottleneck is the quality of the instructions and context framing, not the model's ability to follow them.
- A richer system prompt with explicit persona, sensory detail instructions, and concrete "good example / bad example" pairs will lift output quality without architectural change.
- The existing validation system (word count, repetition detection, language signal, drift detection) already protects against regressions.
- If prompt engineering proves insufficient after measurement, a model upgrade (e.g., `qwen3:14b` or `gemma4:26b`) is the next natural step before multi-pass or template approaches.

### Status

**accepted**

---

## ADR-014 — Voice consistency strategy for TTS playback

### Context

The current TTS pipeline (`orchestrationService.generateAudio()`) sends `{ text, language }` to the tts-pod. No `voice` parameter is passed. The tts-pod defaults to `af_sarah` (a single Kokoro voice). Each tour stop generates a separate audio file via independent TTS calls. Users report voice changes mid-sentence or between segments, creating an inconsistent listening experience.

Root causes identified:
1. **No voice parameter in orchestration**: `generateAudio()` sends only `{ text, language }` — the TTS pod always uses its internal default.
2. **Independent Kokoro initialization per stop**: Each `spawn('python3', ...)` call re-initializes Kokoro from scratch, which can produce subtle voice-quality variance even with the same voice name.
3. **No multi-voice/narrator concept**: The system was designed for single-voice narration across all stops.

### Options

**Option A: Explicit voice ID in orchestration (ensure one consistent voice per tour)**
- Add `voice` field to the TTS call in `generateAudio()`.
- Pass a single, explicit `voice` parameter from orchestration for every stop in a tour.
- The tts-pod already accepts `voice` in `TTSRequest` — it is simply never sent by the caller.
- Pros: One-line change in `generateAudio()`; guarantees same voice name across stops; zero tts-pod changes.
- Cons: Does not fix intra-stop variance from per-call Kokoro re-initialization; voice quality still depends on each independent Python subprocess.

**Option B: Streaming TTS with session-persistent Kokoro instance**
- Keep one Kokoro process alive for the entire tour (session-level TTS).
- Stream audio segments, avoiding re-initialization variance.
- Pros: Eliminates per-call initialization variance; enables real-time concatenation of section audio.
- Cons: Major architecture change; Kokoro-ONNX Python library may not support session reuse well; complex stream management; harder error recovery.

**Option C: Pre-generated audio segments with consistent voice IDs + server-side concatenation**
- Generate all section audio for all stops of a tour in a single batch TTS call.
- Concatenate WAV files server-side.
- Pros: Consistent voice across all segments; one "session" of TTS per tour.
- Cons: Longer single-generation time; larger memory footprint; concatenation introduces click/pop artifacts at boundaries.

### Recommended decision

**Option A — explicit voice ID in orchestration** as the immediate fix, with a future path to session-level TTS.

Why it matters / risk reduced:
- The voice parameter is already supported by the tts-pod's `TTSRequest` interface — it is simply unused by the caller. This is the smallest possible change.
- Adding `voice: 'af_sarah'` (or a configurable default) to the `generateAudio()` TTS call ensures every stop in a tour uses the same voice name explicitly.
- This addresses the most audible problem (different voices between stops) without changing the tts-pod, the narration pipeline, or the frontend.
- The intra-stop variance (section boundaries within a single narration text) is secondary — section text is joined with `\n\n` and sent as one TTS call, so the Python TTS process handles it as one continuous generation.
- If subtle intra-stop variance persists after explicit voice ID, the next step is to investigate per-call Python-process variance in Kokoro or add a session-level TTS endpoint.

### Status

**accepted**

---

## ADR-015 — Model upgrade path for narration (qwen3:4b → larger model)

### Context

The `qwen3:4b` model used for `/narrative/stop/long` is a 4B-parameter model. While it produces structurally valid, validated output, the richness and engagement quality is limited by model capacity. Users report "basic/low quality" narration.

### Options

**Option A: Stay with qwen3:4b, improve prompts only**
- Pros: No new model pull; no GPU memory increase; fast generation.
- Cons: Quality ceiling may be too low for truly engaging narration.

**Option B: Upgrade to qwen3:14b or gemma4:26b for narration**
- Pros: Significantly richer, more natural narration; better handling of nuanced tone instructions; more engaging output.
- Cons: Slower generation; higher memory usage; gemma4:26b may not fit on consumer GPUs.

**Option C: Adaptive model routing by seed quality**
- Rich-seed POIs use the larger model; thin-seed POIs use the smaller model.
- Pros: Cost/quality tradeoff per POI.
- Cons: Adds routing complexity; thin-seed POIs still get low-quality narration.

### Recommended decision

Start with **Option A** (improve prompts on qwen3:4b), measure quality, then evaluate **Option B** (upgrade to qwen3:14b or gemma4:26b) if prompt improvements are insufficient.

Rationale:
1. The current prompt system is thin (~150 tokens per section). Even a 4B model can produce significantly better output with richer instruction, concrete examples, and better seed-data framing.
2. The validation system (word count, repetition, language signal, drift detection) provides objective quality gates that can measure the impact of prompt changes.
3. Model upgrade should be gated on evidence that prompt engineering has been exhausted, not done preemptively.

If a larger model is adopted later, the existing `/narrative/stop/long` endpoint supports model override via the `model.chat()` call — only the `NARRATIVE_MODEL` constant in `narrativeLong.ts` needs to change.

### Status

**accepted**

---

## ADR-019 — Graceful empty-audio handling (frontend-only)

### Context

The backend `generateCompleteTour()` is fully synchronous: audio is generated and saved before the tour response is returned. Users report seeing tours with no audio. The root cause is TTS failure for individual stops: when Kokoro or VoxCPM fails, `generateAudio()` sets `audioUrl: ''` and the frontend displays a tour with a broken or empty audio player. The user interprets this as "audio not ready yet."

### Options

1. Backend async: 202 Accepted + job polling.
2. Backend SSE streaming with progress events.
3. Frontend-only graceful empty-audio handling.

### Pros / Cons

1) 202 + polling
- Pros: truly async, backend can retry audio later.
- Cons: adds job queue infrastructure, changes both backend and frontend contracts, over-engineered for MVP where audio generation is synchronous and < 2 min.

2) SSE streaming
- Pros: real-time progress feedback.
- Cons: persistent connection management, complex error handling, major architecture change.

3) Frontend-only
- Pros: zero backend changes, zero DB changes, immediately improves UX for the actual failure mode (TTS silently fails).
- Cons: does not add retry/async generation — but the backend is already synchronous, so that is not needed.

### Recommended decision

**Option 3 — frontend-only graceful empty-audio handling.**

When `place.audioUrl` is empty on the tour detail page, the audio player component shows a "Audio not available for this stop" message instead of a broken player. The tour detail page also shows a one-line banner if any stops are missing audio.

### Why it matters / risk reduced

- Eliminates the false impression that audio is "still loading" when it has already failed.
- No backend changes, no DB schema changes, no pod changes.
- Fixes the observable symptom with the smallest possible change.

### Status

**proposed**

---

## ADR-020 — "Create New Tour" button on tour detail page

### Context

After tour generation, `TourForm` redirects to `/tours/[id]`. The header already contains a "Generate New Tour" link, but users report being stuck and unable to create a new tour after finishing a walkthrough. The header link exists but may be overlooked in immersive walkthrough UX or on mobile.

### Options

1. Add a "Create New Tour" button at the bottom of the tour detail page.
2. Redirect to home after tour creation instead of the detail page.
3. Both: keep current behavior and add a bottom button.

### Pros / Cons

1) Bottom button only
- Pros: one file, one component, zero risk.
- Cons: does not fix the "header link is overlooked" problem.

2) Redirect to home
- Pros: immediate access to form.
- Cons: user never sees the completed tour they just waited for.

3) Both
- Pros: preserves current behavior (tour detail shown) AND adds obvious CTA at end.
- Cons: still does not fix header visibility (but the bottom button addresses the real pain point).

### Recommended decision

**Option 1 — add a "Create New Tour" button at the bottom of the tour detail page**, styled consistently with existing design. The header nav is already present; this button serves as a completion action for users who finish the walkthrough.

### Why it matters / risk reduced

- One file change (`frontend/src/app/tours/[id]/page.tsx`), zero backend/pod changes.
- Improves discoverability without removing the existing header nav.
- Keeps the "Back to Tours" link and adds the new button as an additive change.

### Status

**proposed**

---

## ADR-021 — Thin-data narration quality improvement

### Context

Narration quality drops for later tour stops because POIs are increasingly "thin" — less Wikipedia/Wikidata seed data. The `narrativeLong.ts` route classifies stops with < 500 chars of seed data as `thin`, applies a reduced word target (35-55 vs 70-90), a more cautious system prompt, lower `max_tokens` (180 vs 260), and strict fact-drift checking. When the LLM cannot produce valid output in 2 attempts, `fallbackSection()` returns formulaic i18n template text that is nearly identical across stops.

### Options

**Option A: Better fallback templates** — improve `fallbackSection()` with more varied, guide-like text.

**Option B: Reduce validation strictness** — increase thin-data retries from 2 to 3 with progressive strategy, raise word target from 35-55 to 45-65.

**Option C: Multi-stop context** — pass accumulated tour state so later stops reference earlier ones. Requires contract changes.

### Recommended decision

**Options A + B combined as an immediate improvement.** Option C is deferred.

Specific changes:
1. (`narrativeLong.ts`): Increase thin-data retry attempts from 2 to 3 with progressive strategy (normal → cooler with retry flag → simplified short-factual).
2. (`narrativeLong.ts`): Raise thin-data word target from `'35 to 55'` to `'45 to 65'`.
3. (`narrativeLong.ts`): Improve `fallbackSection()` templates to be less formulaic — add natural variation, guide-like tone, and per-section personality across all 5 supported languages.

### Why it matters / risk reduced

- All changes in one file. No backend, frontend, DB, or contract changes.
- Existing validation gates (word count, repetition, language drift, fact drift) remain unchanged.
- Progressive retry was already planned in Phase 8.2 — this is a narrower implementation targeted at thin-data stops.
- Templates remain the safety net; they are just better templates.

### Status

**proposed**

---

## ADR-022 — POI selection quality for "history" theme

### Context

Live test (Madrid, 2026-05-24): a "history" tour (French, 240 min) selected 6 stops — 5 statues/memorials and only 1 iconic location (Kilómetro Cero). Major landmarks (Palacio Real, Plaza Mayor, Catedral de la Almudena, Museo del Prado) were completely absent from the candidate pool.

Root causes identified:
1. **`themeTags.ts` (lines 8-18)**: The `historic=*` filter returns predominantly statues (`historic=monument`) and memorials (`historic=memorial`) in OSM. No `tourism=attraction[historic]`, `historic=castle`, `historic=palace`, or standalone `building=cathedral` tags.
2. **`PoiRanker.ts` (lines 20-41)**: Binary presence scoring — wikidata (+3), wikipedia (+2), name (+1), description (+2), translations (+1). No notability weighting (pageviews, article length, claim density). A minor statue with Wikidata scores the same as a royal palace with Wikidata.
3. **No logging of rejected POIs**: The pipeline silently drops POIs below `topN`, making selection quality impossible to debug.

### Options

**Option A: Expand theme tags only**
- Add `tourism=attraction[historic]`, `historic=castle`, `historic=palace`, `building=cathedral` to history theme.
- Pros: Single file change, purely additive, immediately enriches candidate pool.
- Cons: Only increases quantity — doesn't differentiate quality within the pool.

**Option B: Add notability weighting to PoiRanker only**
- Add Wikipedia article length bonus, Wikidata claim density bonus, OSM category bonus.
- Pros: Differentiates iconic landmarks from minor POIs.
- Cons: Won't help if iconic landmarks aren't even in the candidate pool (theme tags issue).

**Option C: Both (tags + ranking) + logging**
- Expand theme tags to include buildings/attractions.
- Add notability weighting so major landmarks outrank minor ones.
- Add structured logging of rejected POIs for debugging.
- Pros: Comprehensive fix addressing both pool composition and selection ranking.
- Cons: 3 files changed (still narrow scope).

### Recommended decision

**Option C — both tags and ranking improvements, with logging.** Phased as:

1. **N-4.1**: Expand `themeTags.ts` history tags (additive, no breaking changes).
2. **N-4.3**: Add logging of rejected/selected POIs in `orchestrationService.ts` (zero behavioral change).
3. **N-4.2**: Add notability weighting to `PoiRanker.ts` (calibrated using N-4.3 log data).

### Why it matters / risk reduced

- The current tour product fails at the most basic expectation: a "history" tour should include historic buildings, not just statues.
- The fix is additive — no tags removed, no contracts changed, no pods touched.
- Logging enables future calibration without guesswork.
- Other themes (architecture, art, food) are unaffected.

### Status

**proposed**

---

## ADR-023 — VoxCPM voice consistency strategy

### Context

Live test (Madrid, 2026-05-24): VoxCPM produced excellent voice quality across all 6 stops, but the voice timbre/tone varied slightly between stops. Each `/tts/generate` call independently interprets the voice description prompt — no seed, no voice-ID, no determinism guarantee.

Root causes:
1. **Text-description based** (`voxcpm.py:51-78`): `prompt = f"({desc}){chunk}"` — the model interprets the voice description fresh each call.
2. **`voice` parameter ignored** (`voxcpm.py:59`): The API accepts `voice` but VoxCPM2 has no named-voice system.
3. **No seed parameter** (`voxcpm.py:78`): `model.generate()` receives `cfg_value=2.0, inference_timesteps=10` — no reproducibility.
4. **Kokoro is deterministic**: Named voice files produce consistent output, but Kokoro is fallback-only.

### Options

**Option A: Kokoro for all stops**
- Pros: Deterministic, consistent voice. Already working.
- Cons: Voice quality significantly lower than VoxCPM. Regression from current state.

**Option B: VoxCPM seed (if supported)**
- Pros: VoxCPM quality + deterministic output. Optimal solution.
- Cons: Requires VoxCPM2 to support a seed/reproducibility parameter. Unknown if supported.

**Option C: Hybrid — VoxCPM stop 1, Kokoro rest**
- Pros: First stop gets max quality. Remaining stops are consistent (Kokoro determinism). Simple implementation.
- Cons: Audible timbre change between stop 1 and stop 2 (different TTS engines).

**Option D: Adjust cfg_value / inference_timesteps**
- Pros: No API changes.
- Cons: Doesn't solve the root cause (non-deterministic inference). May degrade quality.

### Recommended decision

**Conditional path:**

1. **TTS-4.1**: Investigate VoxCPM2 seed/reproducibility support first.
2. **If seed exists** → **Option B**: Pass fixed seed to `model.generate()` in `voxcpm.py:78`. One-line change.
3. **If seed does not exist** → **Option C**: Hybrid — VoxCPM for first stop, Kokoro for stops 2..N. Change in `orchestrationService.ts` provider selection logic.

### Why it matters / risk reduced

- VoxCPM voice quality is a key differentiator — abandoning it for Kokoro would be a regression.
- Seed support (if it exists) is the optimal path: one parameter, zero trade-offs.
- Hybrid is an acceptable fallback: first impression (stop 1) gets the best voice, and the rest are consistent.
- The investigation (TTS-4.1) is zero-risk — research only, no code changes.

### Status

**accepted**

---

## ADR-024 — Remove `reference_id` from VoxCPM `model.generate()` call

### Context

The Phase TTS-5 (reference-audio consistency) implementation introduced `reference_id` as a parameter to `model.generate()` in `_generate_reference_chunk()` (`voxcpm.py` lines 197-200). The upstream VoxCPM2 API does not accept `reference_id` — it only accepts `reference_wav_path`. This causes a `TypeError` on every reference-mode chunk, caught and retried without it (lines 204-216), adding latency and log noise.

### Recommended decision

Remove `reference_id` from the `model.generate()` call entirely. Keep it only for internal pod tracking (logging, manifest audit). Pass `reference_wav_path` as the sole reference parameter.

### Why it matters / risk reduced

- Eliminates a guaranteed first-attempt failure on every reference-mode chunk.
- Each reference-mode chunk currently takes 2x inference calls (first fails, second succeeds). A 5-chunk stop does 10 calls instead of 5.
- Removes the fragile `TypeError` string-matching hack that couples the pod to a specific exception message.

### Status

**accepted**

---

## ADR-025 — Reduce VoxCPM chunk size from 420 to 250 characters

### Context

Live logs show CUDA device-side asserts: `index out of bounds: 0 <= tmp5 < 8192` during VoxCPM2 inference. VoxCPM2 has vocabulary size 8192. The error indicates a token index exceeding the vocab boundary. Progress bars show 610-844 inference steps per chunk — very long sequences. The current chunk size of 420 characters (set during Phase TTS-5) produces token counts that can exceed the model's effective context window or expose edge cases in the tokenizer.

### Recommended decision

Reduce `max_chars` from 420 to 250 in `chunk_text()` (`pods/voxcpm-pod/src/utils/sanitize.py` line 22). Keep the sentence-aware splitting to avoid mid-sentence breaks. At ~250 chars, the expected token count should be well within the safe range (< 500 tokens).

### Why it matters / risk reduced

- CUDA device-side asserts kill the CUDA context. Every subsequent `model.generate()` call fails until the pod process restarts. This is a crash-loop for the entire TTS pipeline.
- A CUDA context poison cascades: reference mode fails -> fallback to Voice Design also crashes -> backend falls back to Kokoro -> Kokoro is not running -> empty audio URL.
- 250 chars is still efficient: a typical 500-word narration produces ~10 chunks (vs ~6 at 420), which is a ~1.6x increase in chunk count but eliminates crashes.

### Status

**accepted**

---

## ADR-026 — Exit pod on CUDA device-side assert

### Context

When VoxCPM2 encounters `torch.AcceleratorError` (CUDA device-side assert), the CUDA context is permanently poisoned. Every subsequent `model.generate()` call — regardless of mode (reference or Voice Design) — will fail. The pod is effectively dead but continues accepting requests and returning errors or garbage.

### Recommended decision

Catch `torch.AcceleratorError` specifically in `generate_speech()` (and its sub-methods). When caught:
1. Log the fatal error.
2. Return HTTP `503 Service Unavailable` with a clear error message.
3. Call `os._exit(1)` or `sys.exit(1)` to force process termination.
4. Rely on external supervision (systemd, Docker restart policy, or the dev launcher script) to restart the pod.

### Why it matters / risk reduced

- Prevents a dead pod from accepting and silently failing further requests.
- The backend fallback chain (VoxCPM -> Kokoro -> empty URL) can trigger on the 503 for the current request, then the restarted pod handles subsequent requests.
- Without this, the user gets 6 stops of empty audio (or garbage) because one CUDA assert poisoned the pod early in the first stop.

### Status

**accepted**

---

## ADR-027 — Add strict text sanitization for VoxCPM

### Context

The current sanitizer (`sanitize.py`) only handles markdown formatting. It does not strip emojis, special Unicode characters, bracket/parenthesis groups, or URLs. The Voice Design mode constructs prompts as `f"({desc}){part}"` where parentheses denote the voice description prefix and `{part}` is the sanitized text. If `{part}` itself contains parentheses, brackets, or other prompt-formatting chars, the model may misinterpret the prompt structure.

### Recommended decision

Add a pre-sanitization step in `sanitize_text()` that:
1. Strips emojis and non-printable Unicode characters.
2. Removes content inside square brackets `[...]` and curly braces `{...}`.
3. Replaces URLs with `[link]`.
4. Converts common abbreviations (e.g., "St." -> "Saint", "km" -> "kilometers").
5. Preserves the existing markdown stripping.

### Why it matters / risk reduced

- The VoxCPM Voice Design prompt format `(description)text` is fragile. Parentheses in the text body can confuse the model's interpretation of where the voice description ends and the text begins.
- URLs, emojis, and brackets have no audible benefit but can produce garbage phonemes or crash the tokenizer.
- A clean text input reduces the likelihood of unexpected model behavior and CUDA errors.

### Status

**accepted**

---

## ADR-028 — Add token-count pre-check before VoxCPM generation

### Context

The CUDA device-side assert (`index out of bounds: 0 <= tmp5 < 8192`) indicates that the model received a token that exceeds its vocabulary. This can happen when:
1. A chunk contains characters that produce unexpected token IDs.
2. A chunk + voice description prefix produces more tokens than the model can handle.
3. The model's context window is exceeded, causing numeric overflow in attention indices.

### Recommended decision

Add a pre-check in `_generate_with_voice_design()` and `_generate_reference_chunk()` that estimates the token count of the prompt. If the estimated count exceeds a safe threshold (e.g., 500 tokens), either:
1. Reject the chunk and log a warning.
2. Or dynamically re-chunk to a smaller size.

Use a simple heuristic: `estimated_tokens = len(text) / 3` for English and similar languages (conservative: ~3 chars/token). For the voice description prefix, count its estimated tokens separately.

### Why it matters / risk reduced

- Catches over-long prompts before they reach the GPU, preventing CUDA context corruption.
- Provides an actionable log message ("Chunk too large: X estimated tokens, max 500") instead of an opaque CUDA assert.
- Works even if the root cause is a character/tokenizer interaction (e.g., a Unicode char that tokenizes to many tokens).

### Status

**proposed**

---

## ADR-029 — Add Kokoro health check before including as fallback

### Context

The backend provider chain (`orchestrationService.ts` lines 917-920) always includes Kokoro as the final fallback. If Kokoro is not running, the backend still attempts it, gets `ECONNREFUSED`, and returns an empty audio URL. This wastes time (~3-5 seconds per stop for the connection timeout) and produces silent failures.

### Recommended decision

Before the per-place audio generation loop, perform a one-time health check on the Kokoro URL (`GET /health` or `HEAD /`). If unreachable, exclude it from the provider list. Log the exclusion so operators know Kokoro is down.

### Why it matters / risk reduced

- Avoids a guaranteed failure + timeout on every stop when Kokoro is down.
- Makes the empty-audio failure mode immediate (no provider available) rather than delayed after failed attempts.
- The health check runs once per tour, not once per stop — negligible overhead.

### Status

**accepted**

---

## ADR-030 — Simplify voice reference data flow (pod resolves locally)

### Context

Currently, the backend resolves a `voxcpmReferenceId` (UUID) via `resolveVoxCpmVoiceReference()` and passes it to the pod as `referenceId`. The pod then uses this ID to look up or create a local WAV file in `AUDIO_CACHE/voice_references/`. This creates two independent caches (backend `voice_reference_audio` table and pod `manifest.json`) that can drift. The pod doesn't actually use the ID to fetch audio from the backend — it uses it as a stable key for its own local cache.

### Recommended decision

Keep the current dual-cache design as-intended for now, but add clear documentation: the backend audit table is for operator visibility; the pod cache is for runtime. Do not attempt to sync them. In a future phase, the backend could pass `referenceWavPath` directly instead of `referenceId`, eliminating the pod's need to resolve its own cache key.

### Why it matters / risk reduced

- Prevents confusion about which system "owns" the reference audio.
- The current design works correctly as long as both caches use the same stable key derivation (language + provider + model + voiceProfile).
- No code changes in this phase — documentation only.

### Status

**proposed**

---

## ADR-031 — Fix language-to-voice-profile mapping in orchestration

### Context

Log line: `VoxCPM voice profile for [Spanish place]: guide_fr (seed: unsupported, referenceId: ...)` — a Spanish-language tour stop received the French voice profile. The code at `orchestrationService.ts` line 870 constructs `guide_${(language || 'en').slice(0, 2)}`. If `language` is `'fr'` when it should be `'es'`, this is a frontend bug or test artifact. But the code should also validate that the profile exists before using it.

### Recommended decision

1. Add a profile existence check in `resolveVoxCpmVoiceReference()`: if `guide_${lang}` is not a known profile, log a warning and fall back to `guide_en`.
2. Log the resolved language at the tour level (not per-place) so the operator can see what language the frontend sent.

### Why it matters / risk reduced

- A Spanish tourist hearing French-accented narration is a visible product defect.
- The frontend bug (if present) needs detection. This log line is the detection mechanism.
- The fallback prevents silent voice-profile mismatches from reaching the user.

### Status

**accepted**

---

## ADR-032 — Rebalance PoiRanker scoring to reduce palace dominance

### Context

After Phase N-4, the candidate pool includes both palaces and non-palace landmarks (plazas, markets, attractions). However, the current scoring formula gives palaces a +5 OSM bonus (+3 `historic=palace` + +2 `building=palace`) while a plaza like Plaza Mayor gets at most +2 (`tourism=attraction`). This means palaces auto-dominate the top-N ranking regardless of actual significance. In a live Madrid/history test (240 min), the router selected 6 stops — 5 palaces and only 1 non-palace (Puerta del Sol). Plaza Mayor, Mercado de San Miguel, and other iconic landmarks were rejected below the topN cutoff.

The Wikidata 429 issue (ADR-034) compounds this: without enrichment data (Wikipedia bodies, Wikidata claims), the notability-based bonuses added in N-4 never activate, so the OSM tag bonuses become the sole differentiator.

### Recommended decision

Rebalance OSM category bonuses so non-palace landmarks can compete:

| Tag | Current | New | Rationale |
|-----|---------|-----|-----------|
| `historic=castle` or `historic=palace` | +3 | +1 | Reduce dominance; palaces are common in European cities |
| `building=cathedral` or `building=palace` or `building=castle` | +2 | +1 | Same — reduce stacking effect |
| `tourism=attraction` | +2 | +2 | Keep — this is the generic "notable place" signal |
| `tourism=attraction` + has wikidata or wikipedia tag | — | +1 | Bonus for verified attractions (Plaza Mayor, Mercado San Miguel) |
| `place=square` | — | +2 | New — iconic city squares (Plaza Mayor, Puerta del Sol) |
| `amenity=marketplace` | — | +1 | New — historic markets (Mercado de San Miguel) |
| `highway=pedestrian` | — | +1 | New — famous pedestrian streets (Gran Via) |
| `tourism=museum` | +1 | +1 | Unchanged |
| `heritage` | +1 | +1 | Unchanged |
| `historic=memorial` | -2 | -2 | Unchanged |
| `tourism=artwork` | -1 | -1 | Unchanged |
| `historic=aircraft` | -3 | -3 | Unchanged |

**Net effect**: A palace now gets +2 (was +5). Plaza Mayor gets +5 (+2 tourism=attraction, +2 place=square, +1 verified attraction with wikidata). This makes iconic plazas competitive with palaces.

### Why it matters / risk reduced

- Directly addresses the scoring bias identified in the Madrid postmortem.
- Single-file change, purely additive (no tags removed, only bonuses adjusted).
- No contract, DB, or pod changes.
- Addresses the root cause even when Wikidata enrichment fails (palaces still get less relative advantage from OSM tags alone).

### Status

**proposed**

---

## ADR-033 — Restructure history theme priority groups for balanced POI representation

### Context

The current history theme priority groups in `themeTags.ts` are:

- **Group 1** (75 limit): historic palaces/castles/manors/city gates/citywalls + cathedrals + heritage items
- **Group 2** (75 limit): tourism=attraction[historic/heritage] + tourism=museum[wikidata/wikipedia]
- **Group 3** (75 limit): tourism=attraction[wikidata/wikipedia]
- **Group 4** (75 limit): historic[wikidata/wikipedia]

Total cap: 150 POIs. In Madrid, Group 1 fetches 75 palaces/castles/heritage items. Group 2 adds ~50 historic attractions/museums. Groups 3-4 (which would catch plazas, markets, generic attractions) get at most 25 remaining slots — often 0. Many iconic landmarks (plazas, markets) are never in the pool.

Missing OSM tag categories entirely: `place=square` (plazas), `amenity=marketplace` (markets), `highway=pedestrian` (famous streets).

### Recommended decision

1. **Add missing tag categories** to priority groups:
   - `place=square` with `wikidata` or `wikipedia` → add to Group 2 or 3
   - `amenity=marketplace` with `wikidata` or `wikipedia` → add to Group 2 or 3
   - `highway=pedestrian` with `wikidata` or `wikipedia` → add to Group 3

2. **Rebalance per-group limits** so all groups contribute:
   - Group 1: reduce from 75 to **50** (palaces/castles/heritage are abundant)
   - Group 2: reduce from 75 to **50** (historic attractions)
   - Group 3: reduce from 75 to **50** (general attractions with notability)
   - Group 4: reduce from 75 to **50** (generic historic with notability)
   - Keep total cap at 150

3. **Add interleaved fetching** in `OverpassPoiFetcher.ts`:
   - Instead of fetching all 50 from Group 1 before Group 2, fetch in rounds of 25 per group
   - This guarantees Groups 3-4 always get at least some slots
   - OR simpler: reorder groups so the broadest categories (attractions) come first

### Why it matters / risk reduced

- Ensures plazas, markets, and pedestrian streets enter the candidate pool.
- Balanced pool composition means the ranker has real choices, not just which palace to pick.
- Without this fix, scoring improvements (ADR-032) can only rank what's in the pool — and the pool is still palace-heavy.
- The interleaving approach prevents any single group from monopolizing the cap.

### Status

**proposed**

---

## ADR-034 — Add Wikidata API retry with exponential backoff and reduce enrichment concurrency

### Context

The enrichment pipeline in `orchestrationService.ts` (lines 521-571) uses `Promise.all(rawPois.map(async (poi) => { ... }))` — all POIs (up to 150) are enriched concurrently. Each POI triggers:

1. `enrichFromWikidata()` → GET wikidata.org/w/api.php (labels)
2. `enrichFromWikidataClaims()` → GET wikidata.org/w/api.php (claims) + possibly another GET for label resolution

This means up to **300 concurrent requests** to Wikidata's public API — well beyond Wikidata's polite usage guidelines (typically ~1 req/s for unauthenticated access). The result is HTTP 429 (Too Many Requests) responses, which are silently caught and returned as `null`. All POIs end up with "thin" seed quality: `wikipediaLead: 0, wikipediaBody: 0, wikidataClaims: 2, wikivoyage: 0`.

Both `WikidataEnricher.ts` and `WikidataClaimsEnricher.ts` have a 500ms `MIN_INTERVAL_MS` between requests, but this is **per-enricher-instance only** — the concurrent `Promise.all` means all requests fire simultaneously, and the per-instance delay only gates sequential calls within a single enricher.

### Recommended decision

Three changes, applied to the Wikidata enrichment files and the orchestration caller:

1. **Add exponential backoff retry** on 429 responses in both `WikidataEnricher.ts` and `WikidataClaimsEnricher.ts`:
   - On 429: retry up to 3 times with delays of 2s, 4s, 8s
   - On other errors: fail immediately (no retry)
   - Keep existing `enforceRateLimit()` for pre-request spacing

2. **Increase per-instance MIN_INTERVAL_MS** from 500ms to **1500ms** to stay within Wikidata's recommended rate (~1 req/s with safety margin).

3. **Reduce enrichment concurrency** in `orchestrationService.ts`:
   - Replace `Promise.all(rawPois.map(...))` with batched sequential processing (e.g., 5 concurrent at a time using a simple semaphore or `p-limit`-style batching)
   - This prevents the "thundering herd" of 300 concurrent requests
   - Process POIs in batches of 5-10, with a short delay between batches

### Why it matters / risk reduced

- Without enrichment, the notability-based scoring bonuses (Wikipedia body length +2, Wikidata claims +1-3) never activate. The ranker falls back to OSM tag bonuses — which currently favor palaces (ADR-032 addresses the scoring side).
- Successful enrichment also improves narration quality (richer seed data means better LLM output with fewer fallbacks).
- The batching approach respects Wikidata's infrastructure while keeping total enrichment time manageable.
- Retry logic handles transient rate limits gracefully instead of silently failing.

### Status

**proposed**
