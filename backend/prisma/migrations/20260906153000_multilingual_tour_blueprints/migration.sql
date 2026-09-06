CREATE TABLE "tour_blueprints" (
  "id" UUID NOT NULL, "base_key" TEXT NOT NULL, "revision" INTEGER NOT NULL,
  "status" TEXT NOT NULL, "snapshot" JSONB, "revalidate_after" TIMESTAMP(3),
  "lease_owner" TEXT, "lease_expires_at" TIMESTAMP(3),
  "attempt_count" INTEGER NOT NULL DEFAULT 0,
  "accounted_spend_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  "spend_limit_usd" DOUBLE PRECISION NOT NULL, "error" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tour_blueprints_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tour_blueprints_base_key_revision_key" ON "tour_blueprints"("base_key", "revision");
ALTER TABLE "tours" ADD COLUMN "blueprint_id" UUID;
CREATE INDEX "tours_blueprint_id_language_idx" ON "tours"("blueprint_id", "language");
ALTER TABLE "tours" ADD CONSTRAINT "tours_blueprint_id_fkey" FOREIGN KEY ("blueprint_id")
  REFERENCES "tour_blueprints"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "generation_jobs"
  ADD COLUMN "attempt_count" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "accounted_spend_usd" DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN "spend_limit_usd" DOUBLE PRECISION;
