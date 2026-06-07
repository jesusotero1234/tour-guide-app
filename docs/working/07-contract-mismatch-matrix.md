# 07 - Contract Mismatch Matrix

## Scope

This matrix compares canonical contracts from `docs/working/06-canonical-contracts.md` against current code and schema definitions.

Referenced current files:
- Frontend types: `frontend/src/types/api.ts`
- Backend types: `backend/src/types/api.ts`
- Backend orchestration mappings: `backend/src/services/orchestrationService.ts`
- Supabase pod types: `pods/supabase-pod/src/types/api.ts`
- Supabase SQL schema: `pods/supabase-pod/sql/create_tables.sql`

Risk levels:
- High: likely runtime breakage/data loss/inconsistent UX.
- Medium: inconsistency causing mapping complexity or future migration friction.
- Low: cosmetic/incremental cleanup.

| Entity | Field | Canonical name | Current frontend name | Current backend name | Current database name | Current pod name if relevant | Problem | Recommended fix | Risk level |
|---|---|---|---|---|---|---|---|---|---|
| TourRequest | duration | `durationMinutes` | `duration` | `duration` | N/A (not persisted) | LLM request uses `duration` | Unit is implicit and naming differs from canonical. | Rename API/domain field to `durationMinutes`; keep temporary backward-compat parser for `duration`. | Medium |
| TourRequest | countryCode | `countryCode` required | `countryCode?` optional | `countryCode?` optional | N/A | Verification route requires countryCode at runtime | Optional typing allows missing required business context. | Make required in canonical API contract and validation, add temporary warning path if absent. | High |
| TourResponse/Tour | country | `country` | `country` required in `Tour` | missing in `TourResponse` | missing in `tours` table | missing in `supabase-pod` Tour type | Frontend expects country but backend response omits it; DB cannot persist it currently. | Add `country` end-to-end in API and persistence model. | High |
| TourResponse/Tour | countryCode | `countryCode` | not present in `Tour` type | not present in `TourResponse` | missing in `tours` table | missing in `supabase-pod` Tour type | Canonical geolocation key is not persisted/returned consistently. | Add `countryCode` end-to-end and enforce ISO-2 uppercase. | High |
| TourResponse/Tour | createdAt | `createdAt` | `created_at` | `created_at` | `created_at` | `created_at` | Timestamp naming inconsistent vs canonical API naming. | Canonicalize to `createdAt` at API/domain boundary; map to `created_at` in DB. | Medium |
| TourResponse/Tour | updatedAt | `updatedAt` | missing | missing | missing | missing | No update timestamp in current contracts/schema for tour records in MVP path. | Add `updatedAt` to API/domain contract; add `updated_at` in persistence schema phase. | Medium |
| TourResponse/Tour | durationMinutes | `durationMinutes` | missing | missing | missing | missing | Requested duration not represented in persisted/retrieved tour object. | Add `durationMinutes` to request/response/persistence schema. | Medium |
| Place | coordinates | `latitude`/`longitude` | `coordinates.lat`/`coordinates.lng` | `coordinates.lat`/`coordinates.lng` | `lat`/`lng` | `coordinates.lat`/`coordinates.lng` and DB writes `lat`/`lng` | Multiple coordinate shapes and names across layers increase mapping risk. | Canonical API/domain fields `latitude` and `longitude`; explicit adapter mapping to DB `lat`/`lng`. | Medium |
| Place | position | `position` required | missing in frontend `Place` type | missing in backend `Place` type but set in retrieval mapper | `position` | `position` | Ordering field exists in persistence but not consistently typed in API contracts. | Add `position` in frontend/backend Place contracts as required. | High |
| Place | imageUrl | `imageUrl` | `imageUrl` | `imageUrl?` | missing `image_url` column in SQL | pod types use `image_url?` and service reads/writes `image_url` | Code writes `image_url`, but current SQL schema does not define the column. | Add `image_url` to DB schema and map to API `imageUrl`. | High |
| Place | audioUrl | `audioUrl` | `audioUrl` required | not in backend `Place` type, manually injected in mapper | not in `places` table | audio URL comes via `audio_files` lookup and `.url` projection | Required in frontend but not guaranteed in backend type/persistence path; empty-string fallback hides errors. | Add `audioUrl?` to backend Place contract and explicit availability semantics. | Medium |
| Place | importanceScore | `importanceScore` | missing | missing | `importance_score` | `importance_score` | Score exists in verification/persistence but not in frontend/backend canonical contracts. | Add optional `importanceScore` at API/domain boundary with snake_case mapping in DB. | Low |
| AudioAsset | table/entity naming | `audio_assets` / `AudioAsset` | N/A | N/A | `audio_files` | `AudioFile` | Canonical plan and current schema use different entity names. | Keep DB table `audio_files` for now if needed, but define canonical domain `AudioAsset` and mapping layer. | Medium |
| AudioAsset | placeId | `placeId` | N/A | N/A | `place_id` | `place_id` | snake_case vs camelCase mismatch across boundary. | Canonicalize to `placeId` in API/domain; map in repository adapter. | Low |
| AudioAsset | storagePath | `storagePath` | N/A | N/A | `storage_path` | `storage_path` | snake_case vs camelCase mismatch. | Canonicalize to `storagePath` in API/domain; map in adapter. | Low |
| AudioAsset | createdAt | `createdAt` | N/A | N/A | `created_at` | `created_at` | Timestamp naming mismatch. | Canonicalize to `createdAt` in API/domain; map in adapter. | Low |
| AudioAsset | updatedAt | `updatedAt` optional | N/A | N/A | missing | missing | No updated timestamp currently tracked for audio records. | Add `updated_at` later if mutation/update lifecycle is required. | Low |
| GenerationJob | entity presence | `GenerationJob` | N/A | N/A | missing | missing | Job tracking contract exists in roadmap but no current schema/type implementation. | Introduce `generation_jobs` in Phase 2 schema plan; keep API optional until then. | Medium |

## Priority mismatches to resolve first (Phase 1 outputs)

1. `country` and `countryCode` missing from persisted/returned tour contracts.
2. `position` not consistently typed in frontend/backend Place contract.
3. `image_url` expected by code but absent in current SQL schema.
4. `duration` vs `durationMinutes` canonical naming and requiredness.
5. Timestamp and snake_case/camelCase boundary mapping policy.

## Phase 1 resolution status

Resolved in Phase 1:
- TourRequest `duration` -> canonical `durationMinutes` introduced with compatibility alias.
- TourRequest `countryCode` requiredness aligned in frontend/backend request typing and backend validation.
- TourResponse/Tour `country` and `countryCode` mapped in backend response shaping.
- TourResponse/Tour timestamp normalization (`createdAt` at API/domain boundary) introduced with compatibility handling.
- TourResponse/Tour `durationMinutes` added in request/response shaping.
- Place `position` added to frontend/backend contracts and response mapping.
- Place `audioUrl` availability semantics aligned to optional at contract level.
- Place transport now supports canonical `latitude`/`longitude` with compatibility mapping from `coordinates` and persistence values.

Deferred to Phase 2 (DB/persistence scope):
- Enforce NOT NULL constraints and full migration hardening for `country`, `country_code`, and `duration_minutes`.
- Standardize and migrate persistence naming fully (`created_at/updated_at`, snake_case mapping policy) with versioned migrations.
- Finalize `updatedAt` consistency across all persisted entities.
- Introduce and wire `generation_jobs` table and related runtime flow.

Deferred to later phases (cloud/adapters):
- Canonical domain name `AudioAsset` vs current persistence table/service naming (`audio_files` / `AudioFile`) full normalization.
- Supabase/cloud adapter parity and provider-switch validation.

Validation note:
- Phase 1 build blockers are cleared (backend, supabase-pod, frontend builds pass).

## Open questions

1. Should canonical API immediately enforce `countryCode` required, or allow temporary compatibility mode for existing clients?
2. Should `coordinates` object remain a transport shape while canonical domain uses `latitude`/`longitude`, or should both API and domain fully switch now?
3. Should `audioUrl` be optional in frontend contract to represent generation/storage lag explicitly?
