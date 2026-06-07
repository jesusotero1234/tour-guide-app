# 12 - Phase 4b: AudioStorage Interface and Local Audio Persistence Plan

## Scope

Design-only. Specifies how to move audio bytes and metadata off supabase-pod
and into local filesystem + local Postgres, in a sequence that keeps write/read
consistency at every step.

---

## 1. Current Audio Persistence Problem

`generateAudio()` in `orchestrationService.ts:423` currently:

1. Calls TTS pod (`POST /tts/generate`) → receives `audioData` (base64 bytes).
2. POSTs bytes to `supabase-pod /audio` (`orchestrationService.ts:482`) →
   supabase-pod stores file in Supabase Storage AND writes a row to its own
   `audio_files` table with a public `url`.
3. Uses the returned `url` as `audioUrl` on the place.

`retrieveTour()` / `getAudioUrlForPlace()` (`orchestrationService.ts:534`):
1. Calls `audioAssetRepository.findByPlaceId(placeId)`.
2. `SupabaseAudioAssetRepository` GETs `supabase-pod /audio/place/:id` →
   reads from supabase-pod `audio_files` table → returns `url`.

**The consistency constraint:** audio write and audio read must target the
same store. Swapping only the read side (to Postgres) while writes still go
to supabase-pod would produce zero rows in `audio_assets` → `findByPlaceId`
returns `null` → `audioUrl` disappears from all retrieved tours.

---

## 2. Recommended Phase 4b Substeps

| Step | Task | Scope |
|---|---|---|
| **4b.1** | Define `AudioStorage` interface | `backend/src/domain/storage/AudioStorage.ts` — new file only |
| **4b.2** | Implement `LocalFileAudioStorage` | `backend/src/infrastructure/local-storage/LocalFileAudioStorage.ts` — new file only |
| **4b.3** | Implement `PostgresAudioAssetRepository` | `backend/src/infrastructure/postgres/PostgresAudioAssetRepository.ts` — new file only |
| **4b.4** | Wire `generateAudio()` to use `AudioStorage` + `PostgresAudioAssetRepository` | Edit `orchestrationService.ts` bootstrap + `generateAudio()` body only |
| **4b.5** | Remove `SupabaseAudioAssetRepository` from bootstrap | Edit `orchestrationService.ts` bootstrap only |

Each step is independently buildable. Steps 4b.1–4b.3 are additive (new
files only). Step 4b.4 is the first runtime behavior change.

**Do not combine 4b.4 and 4b.5 into one step.** Run 4b.4 first with both
adapters present, verify the build, then remove the supabase adapter in
4b.5 once the local path is confirmed.

---

## 3. AudioStorage Interface Must Come Before PostgresAudioAssetRepository

**Yes, AudioStorage must be defined first.**

Reason: `PostgresAudioAssetRepository` only handles metadata reads
(`findByPlaceId`). The write path — saving audio bytes to disk and recording
the `storagePath` — belongs to `AudioStorage`. If `PostgresAudioAssetRepository`
is created before `AudioStorage`, the `storagePath` column would be empty for
all rows (nobody writes it), making `findByPlaceId` return records with an
unusable `storagePath` and no `audioUrl`.

The correct dependency order is:
```
AudioStorage interface (4b.1)
  └→ LocalFileAudioStorage (4b.2)   ← writes bytes, returns storagePath
  └→ PostgresAudioAssetRepository (4b.3)  ← writes metadata row, reads it back
      └→ wire into generateAudio() (4b.4)
```

---

## 4. Is Local Filesystem Storage Enough for MVP?

**Yes.** The `audio_assets` Prisma schema already has `storage_path`. The
domain `AudioAsset` entity already has `storagePath`. No schema change is
needed.

The `audioUrl` derivation strategy: use option (a) from `11-audio-storage-
and-metadata-plan.md:127` — serve audio files from a static route on the
backend, derive the URL from `storagePath` + a base URL config. This keeps
the schema frozen and does not require a migration.

Concrete plan:
- Audio files saved to a local directory, e.g.
  `AUDIO_STORAGE_PATH` env var (default: `./data/audio/`).
- Filename: `{placeId}-{language}.{format}` — deterministic and idempotent.
- Public URL: `http://backend-host:PORT/audio/{filename}` — served by a
  static file route or a dedicated audio endpoint added in Phase 6.
- `storagePath` written to `audio_assets` row = relative path
  (e.g. `{placeId}-en.wav`).
- `audioUrl` returned to callers = constructed at read time from `storagePath`
  + base URL. No extra column needed.

---

## 5. Interface Specifications

### `AudioStorage` (`backend/src/domain/storage/AudioStorage.ts`)

```ts
export interface SaveAudioResult {
  storagePath: string;
  audioUrl: string;
}

export interface AudioStorage {
  save(
    placeId: string,
    language: string,
    format: string,
    audioData: Buffer | string  // base64 string or Buffer
  ): Promise<SaveAudioResult>;
}
```

Notes:
- `save` is the only method needed for MVP. No `delete`, no `list`.
- `storagePath` is the relative path written to the DB.
- `audioUrl` is the public URL the frontend uses to play the audio.
- `audioData` accepts base64 string (what TTS pod returns) or Buffer.
- `AudioStorage` must not import Prisma, axios, or Express.

### `LocalFileAudioStorage` (`backend/src/infrastructure/local-storage/LocalFileAudioStorage.ts`)

Implements `AudioStorage`:
- Derives filename from `{placeId}-{language}.{format}`.
- Writes decoded base64 bytes to `{AUDIO_STORAGE_PATH}/{filename}`.
- Creates directory if it does not exist.
- Returns `{ storagePath: filename, audioUrl: baseUrl + filename }`.
- `baseUrl` injected via constructor (env var `AUDIO_BASE_URL`, default
  `http://localhost:3001/audio/`).

### `PostgresAudioAssetRepository` (`backend/src/infrastructure/postgres/PostgresAudioAssetRepository.ts`)

Implements `AudioAssetRepository`:

```ts
// save: write metadata row after file is stored
save(asset: Omit<AudioAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioAsset>;

// findByPlaceId: most recent by createdAt desc
findByPlaceId(placeId: string): Promise<AudioAsset | null>;
```

Wait — the current `AudioAssetRepository` interface only has `findByPlaceId`.
A `save` method does not exist on the interface. Phase 4b Step 4 (wiring
`generateAudio()`) will need to call `save` on the metadata repo. Therefore
**`AudioAssetRepository` interface must be extended** before implementing
`PostgresAudioAssetRepository`.

Extension required (Step 4b.1 prerequisite, done in a single atomic step):

```ts
export interface AudioAssetRepository {
  findByPlaceId(placeId: string): Promise<AudioAsset | null>;
  save(asset: Omit<AudioAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioAsset>;
}
```

`SupabaseAudioAssetRepository` must also implement `save` (can be a no-op
stub that throws `"Not implemented"` since supabase-pod handles the write
internally — the stub is never called while supabase-pod is active).

`audioUrl` on the returned `AudioAsset` from `PostgresAudioAssetRepository`:
constructed from `storagePath` + `baseUrl` at read time (no DB column needed).

---

## 6. Exact Files for Phase 4b Step 1 (Interface Only)

This is the smallest safe first step. Zero runtime behavior changes.

### May CREATE:
- `backend/src/domain/storage/AudioStorage.ts` — interface only

### May EDIT:
- `backend/src/domain/repositories/AudioAssetRepository.ts`
  — add `save` method to interface
- `backend/src/infrastructure/supabase-adapter/SupabaseAudioAssetRepository.ts`
  — add stub `save()` that throws `"Not implemented: use supabase-pod write path"`
- `docs/working/05-agent-log.md`

### Must NOT touch:
- `backend/src/services/orchestrationService.ts`
- `backend/prisma/schema.prisma` or migrations
- `backend/src/infrastructure/postgres/` (any existing file)
- `backend/src/infrastructure/db/prismaClient.ts`
- `backend/src/api/controllers/` or `routes/`
- `frontend/`, `pods/`

---

## 7. Validation Commands

After Phase 4b Step 1 (interface only):

```bash
cd backend && npm run build
```

Expected: zero errors. The only type change is adding `save` to
`AudioAssetRepository` interface and a stub implementation on
`SupabaseAudioAssetRepository`. Build must still pass.

After Phase 4b Step 2 (`LocalFileAudioStorage`):

```bash
cd backend && npm run build
```

After Phase 4b Step 3 (`PostgresAudioAssetRepository`):

```bash
cd backend && npm run build
```

After Phase 4b Step 4 (wire `generateAudio()`):

```bash
cd backend && npm run build
git diff -- backend/src/api/controllers/tours.ts backend/src/api/routes/tours.ts
git diff -- backend/prisma/schema.prisma
```

No runtime validation possible without TTS + local DB running. Build is the
mandatory gate at each step.

---

## 8. Out-of-Scope Rules for All Phase 4b Steps

- No `listTours` wiring.
- No Phase 5 Step 2 (error boundaries) — separate.
- No schema migration for `audioUrl` column — using `storagePath` + derived
  URL instead.
- No changes to `TourRepository` or `PostgresTourRepository`.
- No frontend or pod changes.
- No `GenerationJob` repository.
- Do not remove `SupabaseAudioAssetRepository` until Step 4b.5 (last step).
- Do not touch `retrieveTour()` — it already handles `audioUrl: undefined`
  gracefully via the audio enrichment loop.

---

## 9. Copy/Paste-Ready Implementation Prompt — Phase 4b Step 1

```
Use the implementation-agent.

Task: Execute Phase 4b Step 1 only — define AudioStorage interface and
extend AudioAssetRepository with a save method.

Context:
- Phase 4b plan: docs/working/12-phase-4b-audio-storage-plan.md.
  Read section 5 and 6 fully before writing a single line.
- Prisma schema is frozen. Do not modify it.
- generateAudio() is not changed in this step.

Approved decisions:
- AudioStorage interface lives at backend/src/domain/storage/AudioStorage.ts.
- AudioStorage.save accepts placeId, language, format, audioData (base64
  string) and returns { storagePath: string; audioUrl: string }.
- AudioAssetRepository gains one new method:
    save(asset: Omit<AudioAsset, 'id' | 'createdAt' | 'updatedAt'>): Promise<AudioAsset>
- SupabaseAudioAssetRepository gets a stub save() that throws
  "Not implemented: supabase-pod handles audio writes".
  This stub is never called at runtime while supabase-pod is active.

Files you may CREATE:
- backend/src/domain/storage/AudioStorage.ts

Files you may EDIT:
- backend/src/domain/repositories/AudioAssetRepository.ts
  (add save method only)
- backend/src/infrastructure/supabase-adapter/SupabaseAudioAssetRepository.ts
  (add stub save() only)
- docs/working/05-agent-log.md

Files you must NOT touch (hard stop):
- backend/src/services/orchestrationService.ts
- backend/prisma/ (schema or migrations)
- backend/src/infrastructure/postgres/ (any file)
- backend/src/infrastructure/db/prismaClient.ts
- backend/src/infrastructure/local-storage/ (do not create yet)
- backend/src/api/controllers/ (any file)
- backend/src/api/routes/ (any file)
- backend/src/middleware/ (any file)
- frontend/ (any file)
- pods/ (any file)

Rules:
- AudioStorage must not import Prisma, axios, or Express.
- AudioAssetRepository must not import Prisma or axios.
- SupabaseAudioAssetRepository stub save() must not silently succeed —
  it must throw so any accidental call is visible.
- After all edits, run npm run build from backend/ and confirm it passes.
- Confirm git diff -- backend/src/api/controllers/tours.ts
  backend/src/api/routes/tours.ts produces no output.
- Confirm git diff -- backend/prisma/schema.prisma produces no output.
- Append a closing entry to docs/working/05-agent-log.md recording:
    - files created/edited
    - that no runtime behavior changed
    - build result
    - confirmation schema/controllers/routes unchanged
    - next step requiring separate approval: Phase 4b Step 2
      (LocalFileAudioStorage implementation)
```
