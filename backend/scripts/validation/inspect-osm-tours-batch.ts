import 'dotenv/config';
import { geocodeCity } from '../../src/infrastructure/geocoder/NominatimGeocoder';
import { fetchPoisForTheme } from '../../src/infrastructure/poi/OverpassPoiFetcher';
import { PostgresPoiCacheRepository } from '../../src/infrastructure/postgres/PostgresPoiCacheRepository';
import { PostgresPoiEnrichmentCacheRepository } from '../../src/infrastructure/postgres/PostgresPoiEnrichmentCacheRepository';
import { prismaClient } from '../../src/infrastructure/db/prismaClient';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { Theme } from '../../src/domain/poi/themeTags';
import { classifyPoiTags } from '../../src/domain/poi/PoiClassification';
import { fetchWikidataLandmarkMetadata, tierPoisByLandmarkFame } from '../../src/services/poi/LandmarkTiering';
import { rankPois } from '../../src/services/poi/PoiRanker';
import { getDurationPlan } from '../../src/services/poi/DurationPlanning';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';
import { enrichShortlistedPois } from '../../src/services/poi/PoiEnrichmentPipeline';
import { computeTourConfidence } from '../../src/services/tourQuality/TourConfidenceGate';

export async function inspectCity(city: string, theme: Theme, language: string, requestedDuration: number) {
  const startedAt = Date.now();
  const geocoded = await geocodeCity(city);
  const poiCache = new PostgresPoiCacheRepository(prismaClient);
  const poiEnrichmentCache = new PostgresPoiEnrichmentCacheRepository(prismaClient);
  let rawPois: RawPoi[] | null = await poiCache.get(city, theme);
  if (!rawPois) {
    rawPois = await fetchPoisForTheme(geocoded, theme);
    if (rawPois.length > 0) {
      await poiCache.set(city, theme, rawPois);
    }
  }

  const wikidataMetadata = await fetchWikidataLandmarkMetadata(
    rawPois.map((poi) => poi.tags.wikidata).filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0)
  );
  const sitelinks = Object.fromEntries(Object.entries(wikidataMetadata).map(([wikidataId, metadata]) => [wikidataId, metadata.sitelinks]));

  const plan = getDurationPlan(requestedDuration);
  const shortlistSize = Math.min(rawPois.length, Math.max(plan.candidateCount, 40));
  const shortlist = tierPoisByLandmarkFame(rawPois, sitelinks, theme, wikidataMetadata).slice(0, shortlistSize);

  const enriched = await enrichShortlistedPois(shortlist, language, poiEnrichmentCache, 4);

  const ranked = rankPois(enriched, geocoded.lat, geocoded.lng).slice(0, plan.candidateCount);
  const candidates = ranked.map((poi) => ({
    name: poi.name || poi.tags.name || '',
    wikidataId: poi.tags.wikidata ?? null,
    coordinates: { lat: poi.lat, lng: poi.lng },
    importance_score: poi.score,
    fameScore: (poi as any).fameScore,
    landmarkTier: (poi as any).landmarkTier,
    category: classifyPoiTags(poi.tags),
  }));

  const route = composeWalkingRoute(candidates, requestedDuration, theme, {
    minStops: plan.minStops,
    maxStops: plan.maxStops,
  });
  const wikidataTaggedCount = rawPois.filter((poi) => Boolean(poi.tags.wikidata)).length;
  const resolvedSitelinks = rawPois.filter((poi) => {
    const wikidataId = poi.tags.wikidata;
    return Boolean(wikidataId && (sitelinks[wikidataId] ?? 0) > 0);
  }).length;
  const sitelinksResolvedRatio = wikidataTaggedCount > 0 ? resolvedSitelinks / wikidataTaggedCount : 0;
  const maxSitelinks = Object.values(sitelinks).reduce((max, count) => Math.max(max, count), 0);
  const routeCategoryCounts = route.route.reduce<Map<string, number>>((counts, place) => {
    const category = (place as any).category || 'other';
    counts.set(category, (counts.get(category) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const routeMaxCategoryShare = route.route.length > 0
    ? Math.max(...Array.from(routeCategoryCounts.values())) / route.route.length
    : 1;
  const routeWikidataIds = route.route
    .map((place) => (place as any).wikidataId)
    .filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0);
  const routeDuplicateWikidataCount = routeWikidataIds.length - new Set(routeWikidataIds).size;
  const routeFlagshipCount = route.route.filter((place) => (place as any).landmarkTier === 'flagship').length;
  const confidence = computeTourConfidence({
    input: {
      rawPoolSize: rawPois.length,
      wikidataTaggedCount,
      sitelinksResolvedRatio,
      maxSitelinks,
    },
    output: {
      shortlistSize: candidates.length,
      routeDuplicateWikidataCount,
      routeMaxCategoryShare,
      routeFlagshipCount,
      degraded: route.diagnostics.degraded,
      coverageRatio: route.diagnostics.coverageRatio,
      stopCount: route.route.length,
    },
  });

  return {
    city,
    ok: true,
    elapsedMs: Date.now() - startedAt,
    rawPoiCount: rawPois.length,
    candidateCount: candidates.length,
    degraded: route.diagnostics.degraded,
    degradationReason: route.diagnostics.degradationReason,
    coverageRatio: Number(route.diagnostics.coverageRatio.toFixed(3)),
    estimatedTourMinutes: Math.round(route.diagnostics.estimatedTourMinutes),
    stopCount: route.route.length,
    confidence,
    stops: route.route.map((place, index) => ({
      index: index + 1,
      name: place.name,
      wikidataId: (place as any).wikidataId ?? null,
      landmarkTier: (place as any).landmarkTier ?? null,
      fameScore: (place as any).fameScore ?? null,
      category: (place as any).category ?? null,
    })),
  };
}

async function main(): Promise<void> {
  const theme = (process.argv[2] || 'history') as Theme;
  const language = process.argv[3] || 'es';
  const durationMinutes = Number(process.argv[4] || '240');
  const cities = process.argv.slice(5);

  if (cities.length === 0) {
    throw new Error('Usage: npx tsx scripts/validation/inspect-osm-tours-batch.ts <theme> <language> <duration> <city...>');
  }

  const results = [];
  for (const city of cities) {
    try {
      results.push(await inspectCity(city, theme, language, durationMinutes));
    } catch (error) {
      results.push({
        city,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  console.log(JSON.stringify({ theme, language, durationMinutes, results }, null, 2));
  await prismaClient.$disconnect();
}

if (require.main === module) {
  main().catch(async (error) => {
    console.error('[inspect-osm-tours-batch] failed:', error);
    try { await prismaClient.$disconnect(); } catch { /* ignore */ }
    process.exit(1);
  });
}
