CREATE TABLE "voice_reference_audio" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "language" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "model" TEXT NOT NULL,
  "voice_profile" TEXT NOT NULL,
  "format" TEXT NOT NULL DEFAULT 'wav',
  "storage_path" TEXT NOT NULL,
  "duration_seconds" DOUBLE PRECISION,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "voice_reference_audio_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "voice_reference_audio_identity_unique" ON "voice_reference_audio"("language", "provider", "model", "voice_profile");
CREATE INDEX "voice_reference_audio_lookup_idx" ON "voice_reference_audio"("language", "provider", "model");
