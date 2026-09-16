CREATE TABLE "tour_introduction_audio" (
    "id" UUID NOT NULL,
    "tour_id" UUID NOT NULL,
    "language" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'mp3',
    "storage_path" TEXT NOT NULL,
    "duration_seconds" INTEGER,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tour_introduction_audio_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "tour_introduction_audio_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "tour_introduction_audio_tour_id_language_idx" ON "tour_introduction_audio"("tour_id", "language");
