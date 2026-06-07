# 03 - Local Database Plan

## Objective

Define a local-first persistence strategy that is simple for MVP and compatible with future Supabase cloud migration.

## Recommended default

Use **PostgreSQL local** (containerized) as the default database.

Validated fallback in this environment:
- Native PostgreSQL in WSL is an accepted fallback when container runtime/image pull is blocked by local TLS/certificate issues.

Rationale:
- Matches Supabase core engine (PostgreSQL).
- Preserves SQL features and behavior across environments.
- Reduces migration friction from local to cloud.

## Scope

This plan defines the first data model and migration approach for:
- `tours`
- `places`
- `audio_assets`
- `generation_jobs`

## Initial table design

### 1) tours

Purpose:
- Store top-level tour metadata.

Suggested columns:
- `id` UUID PK
- `city` TEXT NOT NULL
- `country` TEXT NOT NULL
- `country_code` TEXT NOT NULL
- `theme` TEXT NOT NULL
- `language` TEXT NOT NULL
- `duration_minutes` INTEGER NOT NULL
- `status` TEXT NOT NULL DEFAULT 'created'
- `metadata` JSONB NOT NULL DEFAULT '{}'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `updated_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

### 2) places

Purpose:
- Store ordered stops for each tour.

Suggested columns:
- `id` UUID PK
- `tour_id` UUID NOT NULL FK -> tours(id) ON DELETE CASCADE
- `name` TEXT NOT NULL
- `description` TEXT NOT NULL
- `lat` DOUBLE PRECISION NOT NULL
- `lng` DOUBLE PRECISION NOT NULL
- `position` INTEGER NOT NULL
- `importance_score` DOUBLE PRECISION
- `image_url` TEXT
- `source` TEXT
- `metadata` JSONB NOT NULL DEFAULT '{}'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

Constraints/indexes:
- Unique `(tour_id, position)`
- Index `tour_id`

### 3) audio_assets

Purpose:
- Track audio files generated per place/language.

Suggested columns:
- `id` UUID PK
- `place_id` UUID NOT NULL FK -> places(id) ON DELETE CASCADE
- `language` TEXT NOT NULL
- `format` TEXT NOT NULL
- `storage_path` TEXT NOT NULL
- `duration_seconds` INTEGER
- `metadata` JSONB NOT NULL DEFAULT '{}'
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

Constraints/indexes:
- Index `place_id`
- Optional unique `(place_id, language, format)` based on overwrite policy

### 4) generation_jobs

Purpose:
- Trace orchestration/generation lifecycle and failures.

Suggested columns:
- `id` UUID PK
- `tour_id` UUID FK -> tours(id) ON DELETE SET NULL
- `status` TEXT NOT NULL
- `step` TEXT
- `error_message` TEXT
- `error_details` JSONB
- `started_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()
- `finished_at` TIMESTAMPTZ
- `created_at` TIMESTAMPTZ NOT NULL DEFAULT NOW()

## Migration strategy

- Use versioned migrations from day one (tooling to be finalized by ADR-005).
- Keep migrations deterministic and replayable.
- Enforce one migration per logical schema change.
- Track migration history in VCS.

Prisma operational note:
- `prisma migrate dev` uses a shadow database and therefore requires `CREATEDB` privilege for the migration role (in this project: `tour_guide`) during local validation.

## Data-access boundary

To avoid hard coupling:
- Application layer depends on `TourRepository` and `AudioStorage` interfaces.
- Postgres local implementation lives in infrastructure layer.
- Supabase adapter can later implement the same interfaces.

## Path to Supabase cloud

Because schema is PostgreSQL-compatible, migration can be incremental:

1. Keep domain contracts unchanged.
2. Keep repository/storage interfaces unchanged.
3. Introduce `SupabaseTourRepository` and `SupabaseAudioStorage` adapters.
4. Switch via configuration/DI, not business-logic rewrite.

Result:
- Local-first productivity now.
- Cloud transition later with minimal code disruption.

## Open risks to validate

- Exact naming convention (`audio_files` vs `audio_assets`) must be standardized.
- Decide if `generation_jobs` is mandatory in MVP or optional in Phase 2.
- Define retention policy for local audio files and failed job artifacts.
