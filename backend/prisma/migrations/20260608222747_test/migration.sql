-- CreateTable
CREATE TABLE "enrichment_cache" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "place_name" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "query" TEXT NOT NULL,
    "results" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ttl_hours" INTEGER NOT NULL DEFAULT 720,

    CONSTRAINT "enrichment_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "enrichment_cache_city_place_name_theme_language_key" ON "enrichment_cache"("city", "place_name", "theme", "language");
