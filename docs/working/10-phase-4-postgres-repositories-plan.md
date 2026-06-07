# 10 - Phase 4: Local PostgreSQL Repository Implementation Plan

## Scope

Design-only. Specifies how to replace the temporary supabase-pod HTTP
adapters with local Prisma/PostgreSQL implementations, without changing
orchestration, controllers, or domain interfaces.

---

## 1. Current State After Phase 3

### What exists

| Layer | File | Status |
|---|---|---|
| Domain interfaces | `TourRepository`, `AudioAssetRepository` | frozen |
| Domain entities | `Tour`, `Place`, `AudioAsset` | frozen |
| Temporary adapters | `SupabaseTourRepository`, `SupabaseAudioAssetRepository` | active, call supabase-pod over HTTP |
| Prisma schema | `backend/prisma/schema.prisma` | applied, migration `20260517185240_init` |
| Prisma client | `backend/src/infrastructure/db/prismaClient.ts` | exists, not yet used by any repository |
| DB config | `backend/src/config/database.ts` | exists, not yet called at startup |
| Orchestration | `orchestrationService.ts` | depends on interfaces only; adapter instances injected at module load |
| `listTours` seam | controller `tours.ts:listTours` | still calls supabase-pod directly via `fetch`; **deferred** |
| `generateAudio` upload | `orchestrationService.ts:492` | still calls `POST /supabaseServiceUrl/audio`; **unchanged** |

### What the Prisma schema provides

The `schema.prisma` already maps all canonical fields correctly:

- `Tour` → `tours` table: `country_code`, `duration_minutes`, `created_at`, `updated_at`
- `Place` → `places` table: `lat`/`lng` (map to `latitude`/`longitude`), `importance_score`, `image_url`, `tour_id`, `position`; unique constraint on `(tour_id, position)`
- `AudioAsset` → `audio_assets` table: `place_id`, `storage_path`, `duration_seconds`; **no `audioUrl`/`url` column** — the public URL is a derived/runtime concern, not persisted

### Key gap: `AudioAsset.audioUrl` is not in the schema

The domain `AudioAsset` entity has an optional `audioUrl` field. The Prisma
`AudioAsset` model has no `url` or `audio_url` column — the supabase-pod
provided this as a runtime-constructed public URL. The Postgres repository
cannot return a meaningful `audioUrl` from the DB alone.

**Decision:** `PostgresAudioAssetRepository.findByPlaceId` returns `audioUrl:
undefined` (field absent). The consumer (`retrieveTour` in
`orchestrationService.ts`) already handles missing `audioUrl` gracefully —
it falls through to an empty string. This is an acceptable MVP state; a
`audioUrl` column can be added later when local file storage is introduced.

---

## 2. Recommended Phase 4 Substeps

### Step 1 — `PostgresTourRepository` (this plan covers Step 1 only)

Implement `TourRepository` using `prismaClient`.

Methods:
- `save(tour: Tour): Promise<Tour>` — create tour + places in a transaction.
- `findById(id: string): Promise<Tour | null>` — query with `include: { places: true }`, sorted by `position`.
- `listRecent(limit: number): Promise<Tour[]>` — query ordered by `createdAt desc` with `take: limit`.

### Step 2 — `PostgresAudioAssetRepository`

Implement `AudioAssetRepository` using `prismaClient`.

Method:
- `findByPlaceId(placeId: string): Promise<AudioAsset | null>` — query `audio_assets` where `place_id = placeId`, order by `created_at desc`, take 1.

### Step 3 — Bootstrap swap

Update `orchestrationService.ts` bottom (the `resolveSupabaseUrl` + singleton
block) to instantiate `PostgresTourRepository` and
`PostgresAudioAssetRepository` instead of the supabase adapters.

### Step 4 (deferred, separate approval) — Seam 4 / listTours

Wire `listTours` once a filter-capable repository method is added to
`TourRepository`.

---

## 3. Which Repository to Build First

**`PostgresTourRepository` first.**

Rationale:
- It covers two of the three replaced seams (Seam 1 `save`, Seam 2
  `findById`). The audio lookup (Seam 3) depends on places having Prisma-
  assigned UUIDs that come from the tour save — so `PostgresTourRepository`
  must work before `PostgresAudioAssetRepository` is useful.
- `save` requires a transaction (tour + places), making it the most
  structurally complex piece. Getting it right first reduces risk.
- `findById` and `listRecent` are straightforward Prisma reads once the
  schema mapping is confirmed.
- `PostgresAudioAssetRepository.findByPlaceId` is a single `findFirst` query
  and can be validated independently in Step 2.

---

## 4. Exact Files for Phase 4 Step 1

### May CREATE:
- `backend/src/infrastructure/postgres/PostgresTourRepository.ts`

### May EDIT:
- `backend/src/services/orchestrationService.ts`
  — only the bottom bootstrap block (`resolveSupabaseUrl` + singleton export):
  swap `SupabaseTourRepository` instantiation for `PostgresTourRepository`.
  `SupabaseAudioAssetRepository` remains until Step 2.
- `docs/working/05-agent-log.md`
- `docs/working/10-phase-4-postgres-repositories-plan.md` (this file, if
  needed to record Step 1 completion status)

### Must NOT touch:
- `backend/src/domain/` — all domain files frozen.
- `backend/prisma/schema.prisma` — frozen.
- `backend/prisma/migrations/` — frozen.
- `backend/src/api/controllers/tours.ts` — frozen.
- `backend/src/api/routes/tours.ts` — frozen.
- `backend/src/infrastructure/supabase-adapter/` — keep both adapters;
  `SupabaseAudioAssetRepository` is still in use until Step 2.
- `frontend/` — not touched.
- `pods/` — not touched.
- `backend/src/config/database.ts` — not modified; `getDatabaseUrl()` is
  used internally by prismaClient already.

---

## 5. `PostgresTourRepository` Implementation Notes

### Field mapping (schema → domain)

| Prisma field | Domain field | Note |
|---|---|---|
| `id` (UUID string) | `id` | same |
| `city` | `city` | same |
| `country` | `country` | same |
| `countryCode` (maps to `country_code`) | `countryCode` | Prisma handles mapping |
| `theme` | `theme` | same |
| `language` | `language` | same |
| `durationMinutes` (maps to `duration_minutes`) | `durationMinutes` | Prisma handles mapping |
| `createdAt` (maps to `created_at`) | `createdAt` | ISO string in domain; `Date` in Prisma → `.toISOString()` |
| `updatedAt` (maps to `updated_at`) | `updatedAt` | same |
| `places` (relation) | `places: Place[]` | include in queries |

Place field mapping:

| Prisma field | Domain field | Note |
|---|---|---|
| `id` | `id` | same |
| `tourId` (maps to `tour_id`) | `tourId` | Prisma handles mapping |
| `name` | `name` | same |
| `description` | `description` | same |
| `latitude` (maps to `lat`) | `latitude` | Prisma handles mapping |
| `longitude` (maps to `lng`) | `longitude` | Prisma handles mapping |
| `position` | `position` | same |
| `importanceScore` (maps to `importance_score`) | `importanceScore` | Prisma handles mapping |
| `imageUrl` (maps to `image_url`) | `imageUrl` | Prisma handles mapping |
| `createdAt` | `createdAt` | `.toISOString()` |
| `updatedAt` | `updatedAt` | `.toISOString()` |
| _(not in schema)_ | `audioUrl` | always `undefined` from DB; enriched at orchestration layer |

### `save` — transaction requirement

`save` must create the tour and all its places atomically. Use
`prismaClient.$transaction`:

```
prismaClient.$transaction(async (tx) => {
  const dbTour = await tx.tour.create({ data: { ...tourFields } });
  for (const place of tour.places) {
    await tx.place.create({ data: { ...placeFields, tourId: dbTour.id } });
  }
  return dbTour;
});
```

The `places` table has a unique constraint on `(tour_id, position)` — the
transaction ensures no partial writes leave the DB in an inconsistent state.

### `save` — create-only contract

Per Phase 3 Step 1 approved decision: `save` is create-only. If a tour with
the same `id` already exists, the Prisma unique constraint on `id` will cause
a `P2002` error. The implementation should let that propagate (do not catch
and silently upsert).

### `findById` — `audioUrl` enrichment

`findById` returns domain `Place` objects with `audioUrl: undefined`.
`retrieveTour` in `orchestrationService.ts` already iterates places and calls
`audioAssetRepository.findByPlaceId(place.id)` for each missing `audioUrl` —
this path works correctly whether the audio asset is served by the supabase
adapter or the future Postgres adapter.

### `listRecent` — order and shape

```
prismaClient.tour.findMany({
  take: limit,
  orderBy: { createdAt: 'desc' },
  include: { places: { orderBy: { position: 'asc' } } }
});
```

Places must be included and ordered by `position` so the domain invariant
(ordered collection) is preserved.

---

## 6. Explicit Non-Goals for Phase 4 Step 1

- No `PostgresAudioAssetRepository`. Step 2.
- No changes to `SupabaseAudioAssetRepository` — still active.
- No `AudioStorage` interface or implementation.
- No `PlaceRepository`.
- No `listTours` wiring.
- No `generateAudio` upload path changes.
- No Prisma schema or migration changes.
- No controller or route changes.
- No frontend or pods changes.
- No `GenerationJob` repository — out of Phase 4 scope.

---

## 7. Validation Commands

Run from `backend/`:

```bash
npm run build
```

Expected: zero TypeScript errors.

Additionally, to verify the Postgres implementation works at runtime, the
native WSL PostgreSQL must be running and `DATABASE_URL` must be set. The
following manual smoke check can be run if the DB is available:

```bash
DATABASE_URL="postgresql://tour_guide:tour_guide_dev@localhost:5432/tour_guide_local?schema=public" \
  npx ts-node -e "
    const { PostgresTourRepository } = require('./src/infrastructure/postgres/PostgresTourRepository');
    const { prismaClient } = require('./src/infrastructure/db/prismaClient');
    const repo = new PostgresTourRepository(prismaClient);
    repo.listRecent(5).then(tours => { console.log('listRecent OK:', tours.length); prismaClient.\$disconnect(); }).catch(e => { console.error(e); prismaClient.\$disconnect(); });
  "
```

This is optional — `npm run build` is the mandatory gate. Runtime validation
requires the DB to be up, which is environment-dependent.

---

## 8. Exit Criterion for Phase 4 Step 1

All of the following must be true:

1. `npm run build` in `backend/` passes with zero errors.
2. `backend/src/infrastructure/postgres/PostgresTourRepository.ts` exists and
   implements all three `TourRepository` methods.
3. The orchestration singleton now uses `PostgresTourRepository` for the tour
   adapter and still uses `SupabaseAudioAssetRepository` for audio.
4. No Prisma queries appear in `orchestrationService.ts` directly.
5. `backend/src/api/controllers/tours.ts` and `routes/tours.ts` are unchanged
   (verified by `git diff`).
6. `backend/prisma/schema.prisma` is unchanged (verified by `git diff`).
7. `docs/working/05-agent-log.md` records the Phase 4 Step 1 closing entry.

---

## 9. Copy/Paste-Ready Implementation Prompt for Phase 4 Step 1

```
Use the implementation-agent.

Task: Execute Phase 4 Step 1 only — implement PostgresTourRepository and
swap the tour adapter in the orchestration bootstrap.

Context:
- Phase 3 is committed (86aa228).
- Phase 4 plan is at docs/working/10-phase-4-postgres-repositories-plan.md.
  Read it fully before writing a single line.
- Prisma schema is at backend/prisma/schema.prisma. Do not modify it.
- Prisma client singleton is at backend/src/infrastructure/db/prismaClient.ts.
- Domain interface is at backend/src/domain/repositories/TourRepository.ts.
- Domain entities are at backend/src/domain/entities/.
- Canonical field names: docs/working/06-canonical-contracts.md.

Approved decisions:
- PostgresTourRepository uses prismaClient (the existing singleton).
- save() uses prismaClient.$transaction to create tour + places atomically.
- save() is create-only; do not catch Prisma P2002 and silently upsert.
- findById() uses include: { places: { orderBy: { position: 'asc' } } }.
- listRecent(limit) uses orderBy: { createdAt: 'desc' }, take: limit,
  include: { places: { orderBy: { position: 'asc' } } }.
- Place.audioUrl is always undefined from the DB (no audioUrl column);
  orchestration enriches it via audioAssetRepository.findByPlaceId().
- Prisma Date fields are mapped to ISO string via .toISOString() in the
  domain mapper.
- After creating PostgresTourRepository, update the bottom bootstrap block
  in backend/src/services/orchestrationService.ts to use
  PostgresTourRepository instead of SupabaseTourRepository.
  SupabaseAudioAssetRepository stays unchanged (Phase 4 Step 2 replaces it).

Files you may CREATE:
- backend/src/infrastructure/postgres/PostgresTourRepository.ts

Files you may EDIT:
- backend/src/services/orchestrationService.ts
  (bootstrap block only — the resolveSupabaseUrl function and singleton
  export at the bottom of the file; do not touch any other method)
- docs/working/05-agent-log.md

Files you must NOT touch (hard stop):
- backend/src/domain/ (any file)
- backend/prisma/ (schema or migrations)
- backend/src/infrastructure/db/prismaClient.ts
- backend/src/config/database.ts
- backend/src/infrastructure/supabase-adapter/ (any file)
- backend/src/api/controllers/tours.ts
- backend/src/api/routes/tours.ts
- backend/src/middleware/ (any file)
- frontend/ (any file)
- pods/ (any file)

Rules:
- Do not import axios in PostgresTourRepository.
- Do not create PostgresAudioAssetRepository (Phase 4 Step 2).
- Do not create AudioStorage or PlaceRepository.
- Do not modify Prisma schema or migrations.
- Do not change generateAudio() upload path.
- Do not wire listTours.
- Use only canonical camelCase field names in domain-facing code.
- Use prismaClient from backend/src/infrastructure/db/prismaClient.ts.
- After all edits, run npm run build from backend/ and confirm it passes.
- Confirm git diff -- backend/src/api/controllers/tours.ts
  backend/src/api/routes/tours.ts produces no output.
- Confirm git diff -- backend/prisma/schema.prisma produces no output.
- Append a closing entry to docs/working/05-agent-log.md recording:
    - file created
    - bootstrap change made
    - seams now served by Postgres (save, findById, listRecent)
    - seams still on supabase adapter (findByPlaceId — Step 2)
    - build result
    - confirmation controllers/routes/schema unchanged
    - confirmation no axios in PostgresTourRepository
    - next step requiring separate approval (Phase 4 Step 2)
```
