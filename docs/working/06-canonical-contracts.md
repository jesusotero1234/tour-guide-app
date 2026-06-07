# 06 - Canonical Contracts

## Scope

This document defines the canonical Phase 1 data contracts only. It is documentation-only and does not imply runtime implementation yet.

Canonical naming decisions applied here:
- `country`
- `countryCode`
- `imageUrl`
- `audioUrl`
- `position`
- `durationMinutes`
- `latitude`
- `longitude`
- `createdAt`
- `updatedAt`

## Conventions

- API/domain contract naming uses camelCase.
- Persistence layer may use snake_case internally, but mapping must be explicit.
- `source of truth` in this phase = this file (`docs/working/06-canonical-contracts.md`) until shared runtime types are introduced.

---

## TourRequest

### Purpose

Input payload to request tour generation.

| Field | Type | Required | Description | Source of truth | Notes |
|---|---|---|---|---|---|
| `city` | `string` | yes | City name selected by user. | `06-canonical-contracts.md` | Human-readable city label. |
| `country` | `string` | yes | Country name selected by user. | `06-canonical-contracts.md` | Must remain explicit, not inferred by backend defaults. |
| `countryCode` | `string` | yes | ISO-3166-1 alpha-2 uppercase code. | `06-canonical-contracts.md` | Example: `ES`, `FR`. |
| `theme` | `"architecture" \| "history" \| "food"` | yes | Tour theme. | `06-canonical-contracts.md` | Extendable later with controlled enum evolution. |
| `language` | `"en" \| "es" \| "fr" \| "de" \| "it"` | yes | Requested output language. | `06-canonical-contracts.md` | Canonical list should match UI choices. |
| `durationMinutes` | `number` | yes | Requested tour duration in minutes. | `06-canonical-contracts.md` | Replaces ambiguous `duration`; canonical unit is minutes. |

---

## TourResponse

### Purpose

API response for generated or retrieved tour.

| Field | Type | Required | Description | Source of truth | Notes |
|---|---|---|---|---|---|
| `id` | `string` (UUID) | yes | Unique tour identifier. | `06-canonical-contracts.md` | UUID string at API boundary. |
| `city` | `string` | yes | Tour city. | `06-canonical-contracts.md` | Mirrors request or persisted value. |
| `country` | `string` | yes | Tour country. | `06-canonical-contracts.md` | Must be present in response for UI consistency. |
| `countryCode` | `string` | yes | ISO country code. | `06-canonical-contracts.md` | Required for map/integration consistency. |
| `theme` | `string` | yes | Tour theme. | `06-canonical-contracts.md` | Should align with request enum. |
| `language` | `string` | yes | Tour language. | `06-canonical-contracts.md` | Should align with request language. |
| `durationMinutes` | `number` | yes | Effective duration for generated tour. | `06-canonical-contracts.md` | Could equal requested duration or adjusted value. |
| `places` | `Place[]` | yes | Ordered list of tour stops. | `06-canonical-contracts.md` | Order is represented by `position`. |
| `createdAt` | `string` (ISO-8601) | yes | Creation timestamp. | `06-canonical-contracts.md` | API returns normalized ISO timestamp. |
| `updatedAt` | `string` (ISO-8601) | no | Last update timestamp. | `06-canonical-contracts.md` | Optional for early flows if immutable. |

---

## Tour

### Purpose

Domain-level persisted tour aggregate used in retrieval/listing.

| Field | Type | Required | Description | Source of truth | Notes |
|---|---|---|---|---|---|
| `id` | `string` (UUID) | yes | Tour identifier. | `06-canonical-contracts.md` | Same identifier across layers. |
| `city` | `string` | yes | Tour city. | `06-canonical-contracts.md` |  |
| `country` | `string` | yes | Tour country. | `06-canonical-contracts.md` |  |
| `countryCode` | `string` | yes | ISO country code. | `06-canonical-contracts.md` |  |
| `theme` | `string` | yes | Tour theme. | `06-canonical-contracts.md` |  |
| `language` | `string` | yes | Tour language. | `06-canonical-contracts.md` |  |
| `durationMinutes` | `number` | yes | Planned duration in minutes. | `06-canonical-contracts.md` | Canonical persisted duration field. |
| `places` | `Place[]` | yes | Ordered stops. | `06-canonical-contracts.md` | Must include deterministic `position`. |
| `createdAt` | `string` (ISO-8601) | yes | Creation timestamp. | `06-canonical-contracts.md` |  |
| `updatedAt` | `string` (ISO-8601) | yes | Update timestamp. | `06-canonical-contracts.md` | Can equal createdAt initially. |

---

## Place

### Purpose

Single tour stop with geospatial and media fields.

| Field | Type | Required | Description | Source of truth | Notes |
|---|---|---|---|---|---|
| `id` | `string` (UUID) | yes | Place identifier. | `06-canonical-contracts.md` |  |
| `tourId` | `string` (UUID) | yes | Parent tour identifier. | `06-canonical-contracts.md` | Required in persistence/domain; may be omitted in some API views. |
| `name` | `string` | yes | Place name. | `06-canonical-contracts.md` |  |
| `description` | `string` | yes | Narrative text for the stop. | `06-canonical-contracts.md` |  |
| `latitude` | `number` | yes | Latitude in decimal degrees. | `06-canonical-contracts.md` | Replaces generic `lat` in canonical contract. |
| `longitude` | `number` | yes | Longitude in decimal degrees. | `06-canonical-contracts.md` | Replaces generic `lng` in canonical contract. |
| `position` | `number` | yes | Order in the tour route (0-based). | `06-canonical-contracts.md` | Canonical route ordering field. |
| `importanceScore` | `number` | no | Relevance score from verification/ranking. | `06-canonical-contracts.md` | Optional until scoring is consistently produced. |
| `imageUrl` | `string` | no | Public image URL for the place. | `06-canonical-contracts.md` | Canonical camelCase at API/domain boundary. |
| `audioUrl` | `string` | no | Public audio URL for narrated stop. | `06-canonical-contracts.md` | Canonical camelCase at API/domain boundary. |
| `createdAt` | `string` (ISO-8601) | no | Place creation timestamp. | `06-canonical-contracts.md` | Optional in API payloads for MVP. |
| `updatedAt` | `string` (ISO-8601) | no | Place update timestamp. | `06-canonical-contracts.md` | Optional in API payloads for MVP. |

---

## AudioAsset

### Purpose

Metadata record for a generated audio file associated to a place.

| Field | Type | Required | Description | Source of truth | Notes |
|---|---|---|---|---|---|
| `id` | `string` (UUID) | yes | Audio asset identifier. | `06-canonical-contracts.md` |  |
| `placeId` | `string` (UUID) | yes | Place identifier the audio belongs to. | `06-canonical-contracts.md` |  |
| `language` | `string` | yes | Audio language. | `06-canonical-contracts.md` | Should align to tour/place language constraints. |
| `format` | `string` | yes | Audio format (`wav`, `mp3`, etc.). | `06-canonical-contracts.md` |  |
| `storagePath` | `string` | yes | Internal storage path (filesystem/object path). | `06-canonical-contracts.md` | Not always exposed directly to frontend. |
| `audioUrl` | `string` | no | Public URL to consume audio. | `06-canonical-contracts.md` | Optional until public URL strategy is finalized. |
| `createdAt` | `string` (ISO-8601) | yes | Creation timestamp. | `06-canonical-contracts.md` |  |
| `updatedAt` | `string` (ISO-8601) | no | Last update timestamp. | `06-canonical-contracts.md` | Optional unless mutable metadata is introduced. |

---

## GenerationJob

### Purpose

Track orchestration/generation progress and failures without coupling to implementation internals.

| Field | Type | Required | Description | Source of truth | Notes |
|---|---|---|---|---|---|
| `id` | `string` (UUID) | yes | Job identifier. | `06-canonical-contracts.md` |  |
| `tourId` | `string` (UUID) | no | Linked tour identifier when available. | `06-canonical-contracts.md` | May be absent for early failures. |
| `status` | `"queued" \| "running" \| "completed" \| "failed"` | yes | Job lifecycle status. | `06-canonical-contracts.md` | Minimal canonical state machine. |
| `step` | `string` | no | Current/last step (`generate_places`, `verify_places`, etc.). | `06-canonical-contracts.md` | Optional if not tracked yet. |
| `errorCode` | `string` | no | Stable error classification code. | `06-canonical-contracts.md` | Optional; useful for diagnostics. |
| `errorMessage` | `string` | no | Human-readable failure description. | `06-canonical-contracts.md` |  |
| `createdAt` | `string` (ISO-8601) | yes | Creation timestamp. | `06-canonical-contracts.md` |  |
| `updatedAt` | `string` (ISO-8601) | yes | Last status update timestamp. | `06-canonical-contracts.md` |  |

---

## Open questions

1. Should `countryCode` be required at API boundary immediately, or temporarily optional with strict warning until all clients are aligned?
2. Should `TourResponse` include `route` explicitly, or treat `places` ordered by `position` as the canonical route source?
3. Should API payloads expose `tourId` and place timestamps in MVP, or keep those fields persistence-internal at first?
