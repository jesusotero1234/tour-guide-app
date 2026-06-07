# 14 - Phase 4 Closeout Plan

## Conclusion

Phase 4 can be treated as functionally complete.

Why this matters:
- The Phase 4 goal was to remove the backend runtime dependency on Supabase for the core persistence path.
- That goal is now met for generate, save, retrieve, list, audio file storage, and audio metadata lookup.

Risk reduced:
- Core backend persistence no longer depends on `supabase-pod` availability.
- Audio read/write consistency now stays within local backend + Postgres + local filesystem.

## What was verified from allowed files

- `orchestrationService.ts` bootstraps `PostgresTourRepository`, `PostgresAudioAssetRepository`, and `LocalFileAudioStorage`.
- `generateAudio()` saves bytes through `LocalFileAudioStorage` and persists metadata through `PostgresAudioAssetRepository`.
- `controllers/tours.ts:listTours` delegates to `orchestrationService.listTours()` and no longer fetches `supabase-pod`.
- `server.ts` serves `/audio` statically.
- Legacy Supabase adapter files still exist, but the active bootstrap does not instantiate them.

## Remaining Supabase runtime references

These remain inside `backend/src/services/orchestrationService.ts` but do not appear to be active runtime dependencies anymore:

- `private supabaseServiceUrl: string;`
- `getSupabaseServiceUrl()`
- constructor assignment of `supabaseServiceUrl`
- constructor log line for `Supabase: ...`
- `resolveSupabaseUrl()`
- `const _supabaseUrl = resolveSupabaseUrl();`

Why this matters:
- They make the runtime look partially dependent on Supabase even though the active bootstrap is local-first now.

Risk reduced by cleaning them up:
- Reduces future confusion during debugging and onboarding.
- Reduces the chance that later work accidentally reintroduces a dead config path.

## Recommendation on legacy Supabase adapter files

Keep them for now, but mark them as legacy/deprecated in a later cleanup pass. Do not delete them as part of Phase 4 closeout.

Why this matters:
- They may still be useful as compatibility references for a future Phase 7 cloud adapter.

Risk reduced:
- Avoids deleting fallback knowledge before the replacement architecture is fully stabilized and smoke-tested.

## Smallest safe cleanup

If a runtime cleanup is approved, keep it extremely narrow:

1. Remove dead Supabase bootstrap/config references from `orchestrationService.ts` only.
2. Do not touch repository behavior, schema, migrations, frontend, pods, or Phase 5 concerns.

Why this matters:
- This finishes closeout without changing persistence behavior.

Risk reduced:
- Prevents a cleanup task from turning into orchestration refactoring.

## Closeout decision

- Mark Phase 4 as complete.
- Track one optional micro-cleanup for dead Supabase config/reference removal.
- Start Phase 5 only after that closeout decision is recorded.
