-- CreateTable
CREATE TABLE "city_concept_cache" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "computed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "city_concept_cache_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "tour_concepts" (
    "id" UUID NOT NULL,
    "city" TEXT NOT NULL,
    "country_code" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "route_type" TEXT NOT NULL,
    "angle" TEXT,
    "icon_key" TEXT,
    "estimated_stops" INTEGER NOT NULL,
    "suggested_duration_minutes" INTEGER NOT NULL,
    "confidence" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "anchor_poi_ids" JSONB NOT NULL,
    "supporting_poi_ids" JSONB NOT NULL,
    "signals" JSONB NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tour_concepts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "city_concept_cache_city_country_code_language_key" ON "city_concept_cache"("city", "country_code", "language");

-- CreateIndex
CREATE UNIQUE INDEX "tour_concepts_city_country_code_language_slug_key" ON "tour_concepts"("city", "country_code", "language", "slug");
