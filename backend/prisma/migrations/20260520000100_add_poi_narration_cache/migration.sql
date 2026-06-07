CREATE TABLE "poi_narration_cache" (
  "poi_id" TEXT NOT NULL,
  "language" TEXT NOT NULL,
  "theme" TEXT NOT NULL,
  "sections" JSONB NOT NULL,
  "narration" TEXT NOT NULL,
  "model_version" TEXT NOT NULL,
  "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "poi_narration_cache_pkey" PRIMARY KEY ("poi_id", "language", "theme")
);

CREATE INDEX "poi_narration_cache_model_version_idx" ON "poi_narration_cache"("model_version");
