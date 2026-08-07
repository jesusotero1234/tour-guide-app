ALTER TABLE "tours"
ADD COLUMN IF NOT EXISTS "introduction" TEXT;

UPDATE "tours"
SET "status" = 'draft'
WHERE "status" = 'created';

ALTER TABLE "tours"
ALTER COLUMN "status" SET DEFAULT 'draft';

ALTER TABLE "generation_jobs"
ADD COLUMN IF NOT EXISTS "idempotency_key" TEXT,
ADD COLUMN IF NOT EXISTS "request" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "progress" JSONB NOT NULL DEFAULT '{}',
ADD COLUMN IF NOT EXISTS "result" JSONB;

UPDATE "generation_jobs"
SET "idempotency_key" = "id"::text
WHERE "idempotency_key" IS NULL;

ALTER TABLE "generation_jobs"
ALTER COLUMN "idempotency_key" SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "generation_jobs_idempotency_key_key"
ON "generation_jobs"("idempotency_key");
