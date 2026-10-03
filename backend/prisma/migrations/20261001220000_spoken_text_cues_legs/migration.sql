-- Plan 02/03: spoken text, link clips between stops, and walking legs. Purely additive: old code ignores all of it.
-- After migrating production the app role also needs: GRANT SELECT ON tour_cue_audio, tour_walking_legs TO nomuvia_app;

-- AlterTable
ALTER TABLE "tours" ADD COLUMN     "introduction_spoken_text" TEXT;

-- AlterTable
ALTER TABLE "places" ADD COLUMN     "spoken_text" TEXT;

-- CreateTable
CREATE TABLE "tour_cue_audio" (
    "id" UUID NOT NULL,
    "tour_id" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "place_id" UUID,
    "language" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "spoken_text" TEXT NOT NULL,
    "format" TEXT NOT NULL DEFAULT 'mp3',
    "storage_path" TEXT NOT NULL,
    "duration_seconds" DOUBLE PRECISION,
    "metadata" JSONB NOT NULL DEFAULT '{}',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_cue_audio_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_walking_legs" (
    "tour_id" UUID NOT NULL,
    "data" JSONB NOT NULL,
    "sha256" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_walking_legs_pkey" PRIMARY KEY ("tour_id")
);

-- CreateIndex
CREATE INDEX "tour_cue_audio_tour_id_kind_place_id_idx" ON "tour_cue_audio"("tour_id", "kind", "place_id");

-- AddForeignKey
ALTER TABLE "tour_cue_audio" ADD CONSTRAINT "tour_cue_audio_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tour_walking_legs" ADD CONSTRAINT "tour_walking_legs_tour_id_fkey" FOREIGN KEY ("tour_id") REFERENCES "tours"("id") ON DELETE CASCADE ON UPDATE CASCADE;

