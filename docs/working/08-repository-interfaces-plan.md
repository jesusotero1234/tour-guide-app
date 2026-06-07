# 08 - Repository Interfaces Plan (Phase 3 Step 1)

## Scope

This document is **design-only**. It specifies which repository interfaces will
exist for Phase 3, the exact method signatures using canonical names from
`docs/working/06-canonical-contracts.md`, and the target file paths. No
TypeScript files are created in this step. No backend code is modified.

References:
- Roadmap: `docs/working/04-implementation-roadmap.md` (Phase 3, Steps 1-4)
- Canonical contracts: `docs/working/06-canonical-contracts.md`
- Mismatch matrix: `docs/working/07-contract-mismatch-matrix.md`
- Open ADR question source: `docs/working/05-agent-log.md` entry dated
  `2026-05-17T18:12:17Z`

---

## 1. Which repository interfaces will exist in Phase 3

### 1.1 `TourRepository` — **mandatory now**

Justification:
- Orchestration's `generate -> persist -> retrieve` flow today calls
  `saveTour(...)` and `GET /tours/:id` against the supabase-pod
  (`backend/src/services/orchestrationService.ts:104,150`). These are exactly
  the seams that must be inverted to remove vendor coupling per Phase 3 exit
  criterion ("No application use-case directly imports DB vendor client").
- `tours` listing and single-tour retrieval are public controller endpoints
  in `backend/src/api/controllers/tours.ts`, so an interface boundary here has
  immediate cleanup value.

### 1.2 `PlaceRepository` — **deferred (do NOT introduce in Phase 3 Step 2)**

Decision: defer.

Justification (resolves open ADR question from `05-agent-log.md`
`2026-05-17T18:12:17Z`):
- Today, places are never persisted or retrieved independently of a tour.
  Every place mutation in `orchestrationService.ts` is part of a tour save or
  a tour read.
- Treating places as a child collection of `Tour` keeps the aggregate boundary
  honest and avoids transactional gaps (place ordering by `position` is only
  meaningful within a tour).
- A dedicated `PlaceRepository` may be introduced later if and only if a
  use-case appears that mutates places without rewriting the parent tour
  (e.g., reordering, individual place edits). That use-case does not exist
  today.
- This matches the "if needed" qualifier in
  `04-implementation-roadmap.md:90`.

Implication: place persistence/retrieval responsibility lives on
`TourRepository` for now (the tour aggregate owns its ordered places).

### 1.3 `AudioAssetRepository` — **mandatory now (read-only surface)**

Decision: introduce, but with a **narrow read-only contract** in Phase 3.

Justification:
- The orchestration retrieve path calls `getAudioUrlForPlace(places[i].id)`
  (`orchestrationService.ts:169`) which is a metadata lookup distinct from the
  tour aggregate. The controller's per-place audio metadata endpoint also
  needs this.
- Writes today happen via `POST /audio` against the supabase-pod
  (`orchestrationService.ts:479`). For Phase 3 Step 1 we deliberately keep
  writes **out of `AudioAssetRepository`** and treat audio file persistence as
  belonging to the future `AudioStorage` interface (Phase 3 Step 2). The
  metadata record is a separate concern; including it as a write method now
  would conflate "store the bytes" with "record the metadata".
- Net: `AudioAssetRepository` exposes only the methods orchestration and
  controllers actually call today for retrieval. Write API is deferred to
  Phase 4 when persistence implementation lands and the boundary between
  metadata and storage is concrete.

---

## 2. Method signatures (canonical names only)

All field names below come from `docs/working/06-canonical-contracts.md`.
Domain entities are referenced by name; their TypeScript declarations live in
a shared domain types module to be specified in Phase 3 Step 2 (NOT in this
step). For the purpose of this plan, treat `Tour`, `Place`, and `AudioAsset`
as the canonical shapes defined in section 06.

### 2.1 `TourRepository`

```ts
// Plan only - not to be created in this step.
// Target path: backend/src/domain/repositories/TourRepository.ts

export interface TourRepository {
  // Create/persist a fully-formed tour aggregate (tour + ordered places).
  // Implementation must assign ids if absent and persist places with their
  // canonical `position`. Returns the persisted aggregate.
  save(tour: Tour): Promise<Tour>;

  // Retrieve a tour aggregate (with ordered places) by id.
  // Returns null when not found. Implementations MUST NOT throw on not-found.
  findById(id: string): Promise<Tour | null>;

  // List tours for the listing endpoint. Ordering and pagination kept minimal
  // for MVP: newest first by `createdAt`. Pagination is intentionally left
  // out of Phase 3 Step 1 to match current controller behavior; a follow-up
  // can introduce a `ListToursOptions` parameter without breaking callers.
  listRecent(limit: number): Promise<Tour[]>;
}
```

Notes:
- No `update`, `delete`, or `findByPlaceId` methods. None are required by
  the current orchestration flow or controller endpoints.
- No vendor types (`PrismaClient`, `axios`, supabase responses) appear in the
  signature. The interface is implementation-agnostic.
- Place ordering is the repository's responsibility via the canonical
  `position` field on `Place` (see contracts section 06, line referencing
  `position`).

### 2.2 `AudioAssetRepository`

```ts
// Plan only - not to be created in this step.
// Target path: backend/src/domain/repositories/AudioAssetRepository.ts

export interface AudioAssetRepository {
  // Get the audio asset associated with a place, if any.
  // Returns null when the place has no audio yet.
  findByPlaceId(placeId: string): Promise<AudioAsset | null>;
}
```

Notes:
- Single read method. Matches the only orchestration consumer today
  (`getAudioUrlForPlace`). The controller's per-place audio endpoint maps
  onto the same call.
- No `save`/`create` here. Audio write paths (bytes + metadata creation)
  belong to the `AudioStorage` interface in Phase 3 Step 2 and the concrete
  implementation in Phase 4.

### 2.3 `PlaceRepository`

Deferred. No interface is planned for Phase 3.

---

## 3. Target file paths

Plan-only. These paths describe where interface files will live when Step 2
creates them. Do **not** create these files in Step 1.

- `backend/src/domain/repositories/TourRepository.ts`
- `backend/src/domain/repositories/AudioAssetRepository.ts`

Optional supporting locations (Step 2 will confirm; not created now):
- `backend/src/domain/entities/Tour.ts`
- `backend/src/domain/entities/Place.ts`
- `backend/src/domain/entities/AudioAsset.ts`

Rationale for `backend/src/domain/...`:
- Clean separation from `backend/src/infrastructure/db/` (Prisma client) and
  `backend/src/services/` (orchestration). Domain layer must not depend on
  either.
- Mirrors the dependency direction required by Phase 3 exit criterion: use
  cases depend on domain interfaces; infrastructure depends on domain, not
  the other way around.

---

## 4. Explicit non-goals for Phase 3 Step 1

This step does NOT do any of the following. All are deferred to later steps.

- No concrete Postgres implementation (`PostgresTourRepository`,
  `PostgresAudioAssetRepository`). Phase 4.
- No changes to `backend/src/services/orchestrationService.ts`. Phase 3
  Step 3.
- No controller or route changes (`backend/src/api/controllers/tours.ts`,
  any route file). Phase 3 Step 3 / Phase 4.
- No in-memory test doubles, fakes, or stubs. Phase 3 Step 4.
- No `AudioStorage` interface design. Phase 3 Step 2.
- No domain entity TypeScript files created. Phase 3 Step 2.
- No Prisma schema changes. Migrations are frozen at
  `20260517185240_init`.
- No removal of legacy compatibility aliases (`duration`, `created_at`,
  `image_url`). Tracked in Phase 1/2 deferred lists.
- No resolution of `route` vs ordered `places` debate at API boundary
  (open question from contracts doc).

---

## 5. Exit criterion for Step 1

Step 1 is complete only when **all** of the following hold:

1. This document (`docs/working/08-repository-interfaces-plan.md`) exists with
   the sections above filled in.
2. The user has explicitly reviewed and **approved** the design in this
   document. No automatic progression.
3. The closing entry in `docs/working/05-agent-log.md` references this file
   and lists any new open questions surfaced during design.

Step 2 (creation of the interface TypeScript files under
`backend/src/domain/repositories/`) **must not begin** until criterion 2 is
met. The user signals approval explicitly; silence is not approval.

---

## 6. Impact of open canonical-contract questions on these signatures

From `docs/working/06-canonical-contracts.md:149-151`:

| # | Open question | Affects Phase 3 Step 1 interfaces? | Note |
|---|---|---|---|
| 1 | Should `countryCode` be required at API boundary immediately? | **No** | Already required in canonical `Tour`/`TourRequest`. Repository interfaces consume domain entities, so they inherit `countryCode` as required regardless of how the API boundary handles legacy clients. |
| 2 | Should `TourResponse` include `route` explicitly, or treat `places` ordered by `position` as the canonical route source? | **No** | `route` is an API-shaping concern, not a persistence concern. `TourRepository.findById` returns places ordered by `position`; deriving `route` happens above the repository layer. |
| 3 | Should API payloads expose `tourId` and place timestamps in MVP, or keep them persistence-internal? | **No** | Repository returns domain entities including `tourId` on `Place`. API/controller layer decides whether to project them out. Interface signatures are unaffected. |

None of the three open questions block Step 1. They will be revisited when
API mappers are touched (Phase 3 Step 3 or later).

---

## 7. New open questions surfaced by this design

1. Should `TourRepository.listRecent(limit: number)` accept a default limit
   constant defined alongside the interface, or should the caller always
   pass an explicit limit? (Affects ergonomics, not correctness.)
2. When `TourRepository.save(tour)` is called with a tour whose `id` already
   exists, should the contract be "upsert", "reject", or "undefined"?
   Current orchestration only creates new tours, so any choice works today;
   the contract should still be stated explicitly before Step 2.
3. Should `AudioAssetRepository.findByPlaceId` return the most recent asset
   when multiple exist for the same place, or should the contract assert
   one-asset-per-place? Today the supabase-pod returns a single record, but
   the schema does not enforce uniqueness.
4. Will Phase 3 Step 2 also introduce a shared domain entity module
   (`backend/src/domain/entities/`) for `Tour`, `Place`, `AudioAsset`, or
   will interfaces transitively import from `backend/src/types/api.ts`?
   Recommended: new domain entities module; defer decision to Step 2
   planning.
