import 'dotenv/config';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { geocodeCity } from '../../src/infrastructure/geocoder/NominatimGeocoder';
import { fetchPoisForTheme } from '../../src/infrastructure/poi/OverpassPoiFetcher';
import { fetchCanonicalWikidataPois, mergeCanonicalWikidataPois } from '../../src/infrastructure/poi/WikidataCanonicalPoiFetcher';
import { PostgresPoiCacheRepository } from '../../src/infrastructure/postgres/PostgresPoiCacheRepository';
import { PostgresPoiEnrichmentCacheRepository } from '../../src/infrastructure/postgres/PostgresPoiEnrichmentCacheRepository';
import { prismaClient } from '../../src/infrastructure/db/prismaClient';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { Theme } from '../../src/domain/poi/themeTags';
import { classifyPoiTags } from '../../src/domain/poi/PoiClassification';
import { fetchWikidataLandmarkMetadata, tierPoisByLandmarkFame } from '../../src/services/poi/LandmarkTiering';
import { rankPois } from '../../src/services/poi/PoiRanker';
import { getHistoryPlaceProfile } from '../../src/services/poi/HistoryPlaceScoring';
import { getDurationPlan } from '../../src/services/poi/DurationPlanning';
import { enrichShortlistedPois } from '../../src/services/poi/PoiEnrichmentPipeline';
import {
  RecordingPoiEnrichmentCache,
  createEmptyPoiEnrichmentSnapshot,
} from '../../src/services/poi/PoiEnrichmentSnapshot';

/**
 * Captures frozen acceptance fixtures for a city/theme by running the front half of
 * the OSM pipeline (geocode -> raw pool -> sitelinks -> tier -> shortlist -> enrich ->
 * rank -> route candidates) and STOPPING before composition/narration. Writes:
 *
 *   fixtures/pools/<city>-<theme>.json        (Level 1: raw pool + sitelinks + geocode)
 *   fixtures/candidates/<city>-<theme>.json   (Level 2: route-candidate input to compose)
 *   fixtures/sources/<city>-<theme>-<lang>.json (Wikipedia/Wikidata replay data)
 *
 * One-time, slow (enrichment is networked). NEVER run in CI — fixtures are committed
 * artifacts, refreshed deliberately. See docs/architecture/tour-quality-fixtures-acceptance.md.
 *
 * Usage: npx tsx scripts/validation/capture-tour-fixtures.ts <city> <theme> <duration> [language]
 */

async function main(): Promise<void> {
  const city = process.argv[2] || 'Madrid';
  const theme = (process.argv[3] || 'history') as Theme;
  const requestedDuration = Number(process.argv[4] || '240');
  const language = process.argv[5] || 'es';

  const fixturesDir = join(__dirname, '..', '..', 'fixtures');
  const slug = `${city.toLowerCase()}-${theme}`;

  console.log(`Capturing fixtures for ${city}/${theme}/${requestedDuration}...`);

  const geocoded = await geocodeCity(city);

  const poiCache = new PostgresPoiCacheRepository(prismaClient);
  const poiEnrichmentCache = new PostgresPoiEnrichmentCacheRepository(prismaClient);
  const capturedAt = new Date().toISOString();
  const recordingCache = new RecordingPoiEnrichmentCache(
    poiEnrichmentCache,
    createEmptyPoiEnrichmentSnapshot({ city, theme, language, capturedAt })
  );
  let rawPois: RawPoi[] | null = await poiCache.get(city, theme);
  if (!rawPois) {
    rawPois = await fetchPoisForTheme(geocoded, theme);
    if (rawPois.length > 0) await poiCache.set(city, theme, rawPois);
  } else if (theme === 'history') {
    const canonicalPois = await fetchCanonicalWikidataPois(geocoded, theme);
    rawPois = mergeCanonicalWikidataPois(rawPois, canonicalPois);
  }
  console.log(`Raw pool: ${rawPois.length}`);

  const wikidataMetadata = await fetchWikidataLandmarkMetadata(
    rawPois.map((p) => p.tags.wikidata).filter((id): id is string => typeof id === 'string' && id.length > 0)
  );
  const sitelinks = Object.fromEntries(Object.entries(wikidataMetadata).map(([wikidataId, metadata]) => [wikidataId, metadata.sitelinks]));

  const plan = getDurationPlan(requestedDuration);
  const shortlistSize = Math.min(rawPois.length, Math.max(plan.candidateCount, 40));
  const tiered = tierPoisByLandmarkFame(rawPois, sitelinks, theme, wikidataMetadata);
  const shortlist = tiered.slice(0, shortlistSize);

  // Capture honesty: refuse to write a degraded snapshot.
  const withWikidata = rawPois.filter((p) => Boolean(p.tags.wikidata));
  const sitelinkCoverage = withWikidata.length
    ? withWikidata.filter((p) => (sitelinks[p.tags.wikidata as string] ?? 0) > 0).length / withWikidata.length
    : 1;
  if (sitelinkCoverage < 0.5) {
    throw new Error(`Refusing to write fixture: sitelinks coverage ${(sitelinkCoverage * 100).toFixed(0)}% too low (lookup likely failed).`);
  }

  console.log(`Enriching ${shortlist.length} shortlisted POIs (slow)...`);
  const enriched = await enrichShortlistedPois(shortlist, language, recordingCache, 4);

  const ranked = rankPois(enriched, geocoded.lat, geocoded.lng, theme).slice(0, plan.candidateCount);

  // Route-candidate shape mirrors orchestrationService (the input to composeWalkingRoute),
  // plus wikidataId for acceptance assertions.
  const candidates = ranked.map((poi) => {
    const historyProfile = theme === 'history' ? getHistoryPlaceProfile(poi) : null;
    return {
      name: poi.name || poi.tags.name || '',
      wikidataId: poi.tags.wikidata ?? null,
      coordinates: { lat: poi.lat, lng: poi.lng },
      importance_score: poi.score,
      fameScore: (poi as any).fameScore,
      landmarkTier: (poi as any).landmarkTier,
      category: classifyPoiTags(poi.tags),
      ...(historyProfile ? {
        historyPlaceScore: historyProfile.score,
        historyPlaceKinds: historyProfile.kinds,
        historyIsEventSiteLike: historyProfile.isEventSiteLike,
        historyIsMuseumLike: historyProfile.isMuseumLike,
      } : {}),
    };
  });

  mkdirSync(join(fixturesDir, 'pools'), { recursive: true });
  mkdirSync(join(fixturesDir, 'candidates'), { recursive: true });
  mkdirSync(join(fixturesDir, 'sources'), { recursive: true });

  const capturedOn = capturedAt.slice(0, 10);

  writeFileSync(
    join(fixturesDir, 'pools', `${slug}.json`),
    JSON.stringify({ city, theme, capturedAt: capturedOn, geocode: { lat: geocoded.lat, lng: geocoded.lng, boundingBox: geocoded.boundingBox }, rawPois, sitelinks, wikidataMetadata }, null, 2)
  );
  writeFileSync(
    join(fixturesDir, 'candidates', `${slug}.json`),
    JSON.stringify({ city, theme, requestedDuration, capturedAt: capturedOn, stopBounds: { minStops: plan.minStops, maxStops: plan.maxStops }, candidates }, null, 2)
  );
  writeFileSync(
    join(fixturesDir, 'sources', `${slug}-${language}.json`),
    JSON.stringify(recordingCache.toSnapshot(), null, 2)
  );

  const sourceSnapshot = recordingCache.toSnapshot();
  console.log(
    `Wrote pool (${rawPois.length} POIs), candidates (${candidates.length}), and source snapshot `
    + `(${Object.keys(sourceSnapshot.wikidata).length} Wikidata, ${Object.keys(sourceSnapshot.wikipedia).length} Wikipedia).`
  );
  await prismaClient.$disconnect();
}

main().catch(async (error) => {
  console.error('[capture-tour-fixtures] failed:', error);
  try { await prismaClient.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
