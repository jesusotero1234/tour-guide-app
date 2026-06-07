# 11 - Audio Storage and Metadata Sequencing Plan

## Scope

Design-only. Addresses the write/read consistency problem that would arise if
Phase 4 Step 2 swapped `SupabaseAudioAssetRepository` for
`PostgresAudioAssetRepository` before the audio write path moves off
supabase-pod.

---

## 1. The Consistency Problem

`generateAudio()` currently:
1. Calls the TTS pod to generate audio bytes.
2. POSTs bytes to `supabase-pod /audio` — which stores the file in Supabase
   Storage **and** writes a row to the supabase-pod's own `audio_files` table
   with a public `url`.
3. Uses the returned `url` as `audioUrl` on the place in the response.

`retrieveTour()` / `getAudioUrlForPlace()` currently:
1. Calls `audioAssetRepository.findByPlaceId(placeId)`.
2. `SupabaseAudioAssetRepository` GETs `supabase-pod /audio/place/:id` — which
   reads from that same supabase-pod `audio_files` table and returns `url`.

**If `PostgresAudioAssetRepository` is swapped in before writes move:**
- Audio bytes + metadata continue going to supabase-pod only.
- The local `audio_assets` Prisma table receives zero rows.
- `findByPlaceId` on the Postgres repo returns `null` for every place.
- `audioUrl` is missing for all retrieved tours — **silent regression**.

**Conclusion: swapping only the read side is not safe yet.**

---

## 2. Answer to Each Sequencing Question

### Q1 — Should Phase 4 Step 2 still be PostgresAudioAssetRepository now?

**No.** It must be deferred until the write path also moves to local storage
(or at minimum writes a row to the local `audio_assets` table). Swapping reads
without writes produces the regression described above.

### Q2 — The safest next implementation step

**Keep `SupabaseAudioAssetRepository` active and unchanged.**
The safest next step is to introduce the `AudioStorage` interface (read path
and write path contract) so that `generateAudio()` can be wired behind it in
a follow-up step, **before** the Postgres read adapter is swapped in.

Alternatively (simpler MVP path): defer both the read and write swap
entirely until after Phase 5 orchestration cleanup, and treat the audio seam
as a single atomic swap in a later phase. This avoids partial consistency
windows.

**Recommended: defer the audio seam entirely until AudioStorage interface
is approved and implemented.** Phase 4 is declared complete after Step 1
(`PostgresTourRepository`). Phase 5 (orchestration cleanup) follows.
AudioStorage + `PostgresAudioAssetRepository` become a separate Phase 4b or
Phase 5 sub-task.

### Q3 — Must AudioStorage interface be introduced before local audio metadata reads?

**Yes**, if the goal is full local persistence. The audio write path
(`generateAudio()`) must write to a local location and record a local
`audio_assets` row **before** `PostgresAudioAssetRepository.findByPlaceId`
can return anything useful.

`AudioStorage` would handle bytes (save to local filesystem). The Prisma
repo would handle metadata (`audio_assets` row). Both must exist before the
read swap.

### Q4 — Should generateAudio() keep writing to supabase-pod temporarily?

**Yes, keep it unchanged for now.** The supabase-pod audio path is the
working baseline. Changing it requires:
- An `AudioStorage` interface (local file write + public URL derivation).
- A `LocalFileAudioStorage` implementation.
- A migration or schema change to add `audioUrl`/`url` to `audio_assets`
  (or a separate URL derivation strategy).
- Changes to `generateAudio()` to call the interface instead of axios.

These are non-trivial and should not be bundled with the Postgres read swap.

---

## 3. Updated Phase 4 Substep Sequence

Original plan (`docs/working/10-phase-4-postgres-repositories-plan.md`):
- Step 1: `PostgresTourRepository` ✅ **done**
- Step 2: `PostgresAudioAssetRepository`
- Step 3: Bootstrap cleanup

Revised sequence:

| Step | Task | Status |
|---|---|---|
| 4.1 | `PostgresTourRepository` + bootstrap swap | **done** |
| 4.2 | Declare Phase 4 complete at tour repository level | **ready to close** |
| 4.3 | AudioStorage interface (Phase 4b / Phase 5 sub-task) | **deferred — separate approval** |
| 4.4 | `LocalFileAudioStorage` implementation | **deferred** |
| 4.5 | Wire `generateAudio()` behind `AudioStorage` | **deferred** |
| 4.6 | `PostgresAudioAssetRepository` + bootstrap swap | **deferred** |
| 4.7 | Remove supabase-pod adapters | **deferred** |

**Phase 5 (orchestration cleanup — mutable `currentRequest`, concurrency)
should proceed in parallel or before the audio seam work**, since it is
independent.

---

## 4. Why Not Add audioUrl Column to audio_assets Now?

The Prisma `audio_assets` schema has no `url`/`audioUrl` column. Adding one
requires a new migration and a decision about URL construction strategy
(local filesystem path vs absolute URL vs relative path). This is a
schema design decision that should be approved separately, not silently
bundled into a Phase 4 Step 2.

Options (to decide when AudioStorage is planned):
- (a) Store a `storagePath` only; derive URL at API layer from a base path
  config. No schema change needed.
- (b) Store an `audioUrl` column populated at write time. Requires migration.
- (c) Keep `audioUrl` out of `audio_assets` entirely; join via a separate
  URL derivation service at read time.

Recommended option: (a) — store `storagePath`, derive URL at API layer.
Requires no schema change and is already what the `storagePath` field in the
`AudioAsset` domain entity is designed for.

---

## 5. Immediate Next Safe Step (Phase 5 Step 1)

With the audio seam deferred, the next safest step is **Phase 5 Step 1:
remove the mutable `currentRequest` singleton state** from
`OrchestrationService`.

Current problem (`orchestrationService.ts:14,61`):
```
private currentRequest?: TourRequest;
...
this.currentRequest = request;  // set at top of generateCompleteTour()
```

`verifyPlaces`, `fetchImagesForPlaces`, `generateDescriptions`, and
`generateInitialPlaces` all read `this.currentRequest` to get `country`,
`countryCode`, `city`. This means concurrent requests will cross-contaminate
each other's data.

Phase 5 Step 1 is safe, independent of the audio seam, and has no schema
or interface changes.

---

## 6. Copy/Paste-Ready Prompt for the Next Implementation Step

```
Use the implementation-agent.

Task: Execute Phase 5 Step 1 only — eliminate the mutable
currentRequest singleton state from OrchestrationService by passing
request context explicitly to the methods that need it.

Context:
- Phase 4 Step 1 is complete (PostgresTourRepository active).
- Audio seam (generateAudio, SupabaseAudioAssetRepository) is explicitly
  deferred. Do not touch it.
- Phase 5 Step 1 plan: docs/working/11-audio-storage-and-metadata-plan.md
  section 5.
- The bug: OrchestrationService stores this.currentRequest at the top of
  generateCompleteTour() and private methods read from it. Concurrent
  requests overwrite each other's country/city/countryCode context.

Scope: refactor OrchestrationService private methods to accept the
context they need as explicit parameters instead of reading from
this.currentRequest. Remove the this.currentRequest field entirely.

Allowed files/actions:
You may edit:
- backend/src/services/orchestrationService.ts

You may edit docs:
- docs/working/05-agent-log.md

Files you must NOT touch:
- backend/src/domain/ (any file)
- backend/prisma/ (schema or migrations)
- backend/src/infrastructure/ (any file)
- backend/src/api/controllers/ (any file)
- backend/src/api/routes/ (any file)
- backend/src/middleware/ (any file)
- frontend/ (any file)
- pods/ (any file)

Rules:
- Do not change any method's public signature (generateCompleteTour,
  retrieveTour are public — their signatures must not change).
- Do not change AudioAssetRepository or generateAudio() upload path.
- Do not add new public methods.
- Do not touch repository adapters or bootstrap block.
- Pass country, countryCode, city as explicit parameters to:
    generateInitialPlaces(), verifyPlaces(), fetchImagesForPlaces(),
    generateDescriptions().
- Remove this.currentRequest field and its assignment.
- After edits, run npm run build from backend/ and confirm it passes.
- Confirm git diff -- backend/src/api/controllers/tours.ts
  backend/src/api/routes/tours.ts produces no output.
- Append a closing entry to docs/working/05-agent-log.md recording:
    - what changed
    - that currentRequest field is removed
    - build result
    - controllers/routes unchanged
    - audio seam unchanged
    - next step requiring separate approval
```
