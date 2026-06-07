# 09 - Phase 3 Step 3: Runtime Wiring Plan

## Scope

This document is **design-only**. It specifies exactly how to invert the
dependency between `orchestrationService.ts` / `tours.ts` controller and the
supabase-pod HTTP calls, so they depend on `TourRepository` and
`AudioAssetRepository` interfaces instead.

No Postgres implementation is introduced. A thin **supabase-pod adapter** is
introduced to satisfy the interfaces with the existing HTTP transport until
Phase 4 replaces it with a Prisma implementation.

---

## 1. Current State Summary

### OrchestrationService (`backend/src/services/orchestrationService.ts`)

The class is a singleton (`orchestrationService = new OrchestrationService()`
at line 650). It hard-codes five pod URLs in the constructor and calls them
directly with `axios`. The persistence-relevant calls are:

| Method | Transport call | Line(s) |
|---|---|---|
| `saveTour()` | `POST ${supabaseServiceUrl}/tours` | 534 |
| `saveTour()` | `POST ${supabaseServiceUrl}/places` (loop) | 583 |
| `generateAudio()` | `POST ${supabaseServiceUrl}/audio` | 479 |
| `retrieveTour()` | `GET ${supabaseServiceUrl}/tours/:id` | 150 |
| `getAudioUrlForPlace()` | `GET ${supabaseServiceUrl}/audio/place/:placeId` | 633 |

### tours controller (`backend/src/api/controllers/tours.ts`)

| Handler | Persistence-relevant call | Line(s) |
|---|---|---|
| `listTours` | `fetch(${supabaseServiceUrl}/tours?...)` directly | 85 |
| `getTour` | delegates to `orchestrationService.retrieveTour(id)` | 33 |
| `generateTour` | delegates to `orchestrationService.generateCompleteTour(request)` | 12 |

### Key structural problem

- `OrchestrationService` is a singleton constructed at module load time
  (`new OrchestrationService()` at line 650). It has no constructor parameters
  — all dependencies are hard-coded or resolved from `process.env` inside the
  constructor. This makes swapping the persistence layer impossible without
  modifying the class body.
- `listTours` controller bypasses orchestration entirely and calls the
  supabase-pod URL via `fetch` directly, using
  `orchestrationService.getSupabaseServiceUrl()` as a URL factory.
- `generateAudio()` mixes audio byte generation (TTS pod) with audio metadata
  persistence (supabase-pod upload). These are two separate concerns but
  currently entangled in one method.

---

## 2. Exact Runtime Seams to Replace

Only these 5 seams are in scope for Step 3. Nothing else.

### Seam 1 — `saveTour()` → `TourRepository.save()`
**File:** `orchestrationService.ts:531–624`
**Current:** `POST /tours` then loop `POST /places` via axios to supabase-pod.
**Target:** call `tourRepository.save(tour: Tour): Promise<Tour>`.

### Seam 2 — `retrieveTour()` → `TourRepository.findById()`
**File:** `orchestrationService.ts:148–209`
**Current:** `GET /tours/:id` via axios to supabase-pod, then inline audio URL
enrichment via `getAudioUrlForPlace`.
**Target:** call `tourRepository.findById(id)`, then
`audioAssetRepository.findByPlaceId(placeId)` for each place missing
`audioUrl`.

### Seam 3 — `getAudioUrlForPlace()` → `AudioAssetRepository.findByPlaceId()`
**File:** `orchestrationService.ts:630–646`
**Current:** `GET /audio/place/:placeId` via axios to supabase-pod.
**Target:** call `audioAssetRepository.findByPlaceId(placeId)`.

### Seam 4 — `listTours` controller → DEFERRED (not part of Step 3)
**File:** `controllers/tours.ts:57–113`
**Current:** `fetch(${supabaseServiceUrl}/tours?...)` directly in controller.
**Why deferred:** `listTours` currently accepts `city`, `theme`, `language`,
`limit`, and `offset` query parameters and forwards them to the supabase-pod.
`TourRepository.listRecent(limit)` only supports `limit`. Wiring `listTours`
to `listRecent` in Step 3 would silently drop `city`, `theme`, `language`, and
`offset` filter behavior with no explicit approval — a behaviour regression.

**Decision:** Leave `listTours` exactly as-is in Step 3. The seam is
**deferred** to a separately approved step that either:
(a) extends `TourRepository` with a `list(options: ListToursOptions)` method
    covering all current filter parameters, or
(b) explicitly approves dropping specific filters with documented rationale.

`getSupabaseServiceUrl()` remains on `OrchestrationService` because
`listTours` in the controller still calls it.

### Seam 5 — `generateAudio()` upload → remains on supabase-pod for now
**File:** `orchestrationService.ts:477–510`
**Current:** `POST ${supabaseServiceUrl}/audio` uploads audio bytes + creates
the metadata record.
**Target for Step 3:** **leave unchanged**. The upload path requires an
`AudioStorage` interface (Phase 3 Step 4 / separate approval) and a concrete
`LocalFileAudioStorage` (Phase 4). Replacing it now would require both
interfaces and implementations that are explicitly out of scope.

---

## 3. Dependency Injection Approach (no Prisma, no concrete class)

### Problem
`OrchestrationService` constructs itself. The controller imports the singleton
directly. Neither can receive injected dependencies today.

### Solution: constructor injection via module-level factory

The smallest safe change is:

1. Add `tourRepository` and `audioAssetRepository` as **constructor
   parameters** with TypeScript interface types to `OrchestrationService`.
2. Create adapter instances in `server.ts` and pass them to the constructor.
3. Export the `orchestrationService` singleton from `server.ts`.
   `listTours` is not wired in this step — it is deferred (see Seam 4).

```
server.ts (or a new bootstrap module)
  └─ creates SupabaseTourRepository (adapter)
  └─ creates SupabaseAudioAssetRepository (adapter)
  └─ passes both to new OrchestrationService(tourRepo, audioAssetRepo)
  └─ exports orchestrationService singleton
```

Note: `listTours` wiring is **deferred** (see Seam 4). The singleton is still
exported from `server.ts`; `listTours` continues to use
`orchestrationService.getSupabaseServiceUrl()` unchanged.

The adapters are thin wrappers that satisfy the interfaces using the existing
supabase-pod HTTP calls. They live in
`backend/src/infrastructure/supabase-adapter/`.

This means:
- Domain interfaces stay clean.
- Phase 4 replaces adapter classes with `PostgresTourRepository` — zero
  changes to orchestration or controllers.
- No DI framework needed.

---

## 4. Temporary Supabase-Pod Adapter

Yes, a temporary adapter is **required** to bridge the interface contract and
the existing supabase-pod HTTP transport until Phase 4.

### Files to create

#### `backend/src/infrastructure/supabase-adapter/SupabaseTourRepository.ts`

Implements `TourRepository`:
- `save(tour: Tour): Promise<Tour>` — maps `Tour` domain entity to supabase-pod
  wire format and calls `POST /tours` + `POST /places` loop (moves current
  `saveTour()` logic here verbatim, adapted to canonical types).
- `findById(id: string): Promise<Tour | null>` — calls `GET /tours/:id`,
  maps response to domain `Tour`. Returns `null` on 404.
- `listRecent(limit: number): Promise<Tour[]>` — calls
  `GET /tours?limit={limit}`, maps array to domain `Tour[]`.

#### `backend/src/infrastructure/supabase-adapter/SupabaseAudioAssetRepository.ts`

Implements `AudioAssetRepository`:
- `findByPlaceId(placeId: string): Promise<AudioAsset | null>` — calls
  `GET /audio/place/:placeId`, maps first result (sorted by `createdAt` desc)
  to domain `AudioAsset`. Returns `null` if empty.

These files use `axios` internally (infrastructure concern, allowed here). They
must not be imported from domain or service files — only from the bootstrap
wiring point.

---

## 5. Exact Files the Implementation-Agent May Edit/Create

### May **create** (new files):
- `backend/src/infrastructure/supabase-adapter/SupabaseTourRepository.ts`
- `backend/src/infrastructure/supabase-adapter/SupabaseAudioAssetRepository.ts`

### May **edit** (existing files — minimal surgical changes only):
- `backend/src/services/orchestrationService.ts`
  - Add `tourRepository: TourRepository` and
    `audioAssetRepository: AudioAssetRepository` constructor parameters.
  - Replace `saveTour()` body to delegate to `this.tourRepository.save(...)`.
  - Replace `retrieveTour()` body to delegate to
    `this.tourRepository.findById(...)` + `this.audioAssetRepository.findByPlaceId(...)`.
  - Replace `getAudioUrlForPlace()` body to delegate to
    `this.audioAssetRepository.findByPlaceId(...)`.
  - Remove private `saveTour()` method (logic moves to adapter).
  - **Remove** the module-level `export const orchestrationService = new OrchestrationService()` singleton line — the singleton is now created in `server.ts`.
  - Add imports for domain interfaces (`TourRepository`, `AudioAssetRepository`).
  - Keep `getSupabaseServiceUrl()` — still needed by `listTours` controller.
- `backend/src/server.ts`
  - Create adapter instances.
  - Create `orchestrationService` with injected adapters.
  - Export singleton for use by routes.

### Must **not** edit in Step 3:
- `backend/src/api/controllers/tours.ts` — **do not touch**. `listTours` seam
  is deferred; `getTour` and `generateTour` delegate to orchestration which
  is already being refactored above.
- `backend/src/api/routes/tours.ts` — **do not touch**.

### May **edit** (docs):
- `docs/working/05-agent-log.md`
- `docs/working/09-phase-3-step-3-runtime-wiring-plan.md` (this file)

### Must **not** touch:
- `backend/src/domain/` — all domain files are frozen after Step 2.
- `backend/prisma/` — schema and migrations frozen.
- `backend/src/infrastructure/db/prismaClient.ts` — not used yet.
- `backend/src/config/database.ts` — not used yet.
- `backend/src/types/api.ts` — unchanged; `TourRequest`/`TourResponse` still
  used at HTTP boundary.
- `frontend/` — not touched.
- `pods/` — not touched.
- `backend/src/middleware/` — not touched.

---

## 6. Explicit Non-Goals for Step 3

- No `PostgresTourRepository`. Phase 4.
- No `PlaceRepository`. Deferred.
- No `AudioStorage` interface. Separate approved step.
- No `generateAudio()` upload path changes. Stays on supabase-pod for now.
- No removal of supabase-pod container or its configuration.
- No removal of the `coordinates` compatibility shape from response mapping
  (still needed for frontend).
- No Phase 5 orchestration cleanup (mutable `currentRequest` state, parallel
  request safety). Out of scope.
- No change to LLM, verification, description, or TTS pod calls.
- No new test files. Phase 3 Step 4.
- No changes to `listTours` controller or its filter parameters (`city`,
  `theme`, `language`, `limit`, `offset`). Seam 4 is explicitly deferred to
  a separately approved step. Current behaviour is preserved exactly.

---

## 7. Validation Commands

Run from `backend/`:

```bash
npm run build
```

Expected: zero TypeScript errors, zero warnings.

No runtime validation is possible without running pods. The build gate is the
sole acceptance criterion for Step 3. If the build passes and the seams above
are replaced, Step 3 is complete.

---

## 8. Exit Criterion for Step 3

All of the following must be true:

1. `npm run build` in `backend/` passes with zero errors.
2. `orchestrationService.ts` no longer calls `axios.get/post` to
   `supabaseServiceUrl` for tour save, tour retrieve, or audio URL lookup
   (only the `generateAudio()` upload call to supabase-pod may remain).
3. `OrchestrationService` constructor accepts `TourRepository` and
   `AudioAssetRepository` parameters.
4. No Prisma client, Prisma type, or Supabase cloud SDK is imported in any
   new or modified file.
5. `controllers/tours.ts` and `routes/tours.ts` are **unchanged** (verified
   by `git diff`).
6. `docs/working/05-agent-log.md` records the Step 3 closing entry.

---

## 9. Copy/Paste-Ready Implementation Prompt

```
Use the implementation-agent.

Task: Execute Phase 3 Step 3 only — wire TourRepository and
AudioAssetRepository interfaces into OrchestrationService via temporary
supabase-pod adapters. The listTours seam is explicitly excluded from this
step (see Seam 4 in docs/working/09-phase-3-step-3-runtime-wiring-plan.md).

Context:
- Phase 3 Step 2 is complete. Domain entities and repository interfaces exist
  under backend/src/domain/.
- Read docs/working/09-phase-3-step-3-runtime-wiring-plan.md fully before
  writing a single line.
- Canonical contracts: docs/working/06-canonical-contracts.md.

Approved decisions:
- OrchestrationService receives TourRepository and AudioAssetRepository as
  constructor parameters (constructor injection).
- Two temporary adapter classes satisfy the interfaces using existing
  supabase-pod HTTP calls:
    backend/src/infrastructure/supabase-adapter/SupabaseTourRepository.ts
    backend/src/infrastructure/supabase-adapter/SupabaseAudioAssetRepository.ts
- The singleton orchestrationService is created in backend/src/server.ts,
  not at the bottom of orchestrationService.ts.
- generateAudio() upload path (POST /audio to supabase-pod) is NOT changed.
- listTours controller is NOT changed. Seam 4 is deferred. Do not touch
  backend/src/api/controllers/tours.ts or backend/src/api/routes/tours.ts.
- getSupabaseServiceUrl() must be kept on OrchestrationService — listTours
  still calls it.

Seams to replace in this step (Seams 1, 2, 3 only):
- Seam 1: saveTour() body → tourRepository.save()
- Seam 2: retrieveTour() body → tourRepository.findById() +
  audioAssetRepository.findByPlaceId() per place
- Seam 3: getAudioUrlForPlace() body → audioAssetRepository.findByPlaceId()

Files you may CREATE:
- backend/src/infrastructure/supabase-adapter/SupabaseTourRepository.ts
- backend/src/infrastructure/supabase-adapter/SupabaseAudioAssetRepository.ts

Files you may EDIT:
- backend/src/services/orchestrationService.ts
- backend/src/server.ts
- docs/working/05-agent-log.md

Files you must NOT touch (hard stop):
- backend/src/api/controllers/tours.ts
- backend/src/api/routes/tours.ts
- backend/src/domain/ (any file)
- backend/prisma/ (schema or migrations)
- backend/src/infrastructure/db/prismaClient.ts
- backend/src/config/database.ts
- backend/src/types/api.ts
- backend/src/middleware/ (any file)
- frontend/ (any file)
- pods/ (any file)

Rules:
- Do not import Prisma types or use prismaClient anywhere.
- Do not create PostgresTourRepository.
- Do not create PlaceRepository.
- Do not create AudioStorage.
- Do not change generateAudio() upload path (POST /audio to supabase-pod).
- Do not remove supabase-pod URL config from OrchestrationService — still
  needed for LLM, verification, description, TTS pod calls and audio upload.
- Keep getSupabaseServiceUrl() on OrchestrationService unchanged.
- Use only canonical camelCase field names in domain-facing code.
  Snake_case mapping lives in adapters only.
- After all edits, run npm run build from backend/ and confirm it passes.
- Confirm controllers/tours.ts and routes/tours.ts are unchanged (git diff).
- Append a closing entry to docs/working/05-agent-log.md recording:
    - files created/edited
    - which seams were replaced (1, 2, 3)
    - seams explicitly NOT replaced (Seam 4 listTours — deferred)
    - build result
    - confirmation that generateAudio() upload is unchanged
    - confirmation that controllers/routes were not touched
    - confirmation that no Prisma/Postgres code was introduced
    - next step requiring separate approval
```
