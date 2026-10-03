-- Inverse of migration.sql, kept next to it (Prisma ignores this file). Run with the migration role, after a pg_dump.
-- Rows in the dropped tables and the two text columns are lost: take the dump first.
DROP TABLE IF EXISTS "tour_walking_legs";
DROP TABLE IF EXISTS "tour_cue_audio";
ALTER TABLE "places" DROP COLUMN IF EXISTS "spoken_text";
ALTER TABLE "tours" DROP COLUMN IF EXISTS "introduction_spoken_text";
DELETE FROM "_prisma_migrations" WHERE "migration_name" = '20261001220000_spoken_text_cues_legs';
