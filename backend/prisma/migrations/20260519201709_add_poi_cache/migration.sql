-- CreateTable
CREATE TABLE "poi_cache" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "theme" TEXT NOT NULL,
    "fetched_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "payload" JSONB NOT NULL,

    CONSTRAINT "poi_cache_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "poi_cache_city_theme_key" ON "poi_cache"("city", "theme");
