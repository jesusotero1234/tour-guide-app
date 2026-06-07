import 'dotenv/config';
import { geocodeCity } from '../../src/infrastructure/geocoder/NominatimGeocoder';
import { fetchPoisForTheme } from '../../src/infrastructure/poi/OverpassPoiFetcher';
import { PostgresPoiCacheRepository } from '../../src/infrastructure/postgres/PostgresPoiCacheRepository';
import { prismaClient } from '../../src/infrastructure/db/prismaClient';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { Theme } from '../../src/domain/poi/themeTags';
import { fetchWikidataLandmarkMetadata, tierPoisByLandmarkFame } from '../../src/services/poi/LandmarkTiering';

/**
 * Diagnostic-only script. Runs the cheap prefilter half of the OSM pipeline
 * (geocode -> raw pool -> sitelinks -> landmark tiering) and STOPS before
 * enrichment/narration. Purpose: localize where expected "anchor" landmarks
 * die — raw pool, sitelinks lookup, or downstream selection.
 *
 * Usage:
 *   npx tsx scripts/validation/diagnose-shortlist.ts <city> <theme> <duration> ["Anchor A,Anchor B,..."]
 *
 * The anchor probe list is an EVALUATION oracle only (not a production input).
 * It defaults to a Madrid/history first-visit set; override via the 4th arg for
 * other cities.
 */

const DEFAULT_ANCHORS_BY_CITY: Record<string, string[]> = {
  madrid: [
    'Puerta del Sol',
    'Plaza Mayor',
    'Almudena',
    'Prado',
    'Palacio Real',
    'Puerta de Alcalá',
    'Templo de Debod',
    'Gran Vía',
  ],
};

function normalize(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

function poiDisplayName(poi: RawPoi): string {
  return poi.name || poi.tags.name || '(unnamed)';
}

async function main(): Promise<void> {
  const city = process.argv[2] || 'Madrid';
  const theme = (process.argv[3] || 'history') as Theme;
  const duration = Number(process.argv[4] || '240');
  const anchorArg = process.argv[5];

  const anchors = anchorArg
    ? anchorArg.split(',').map((a) => a.trim()).filter(Boolean)
    : DEFAULT_ANCHORS_BY_CITY[normalize(city)] ?? [];

  // topN/shortlist size mirrors orchestrationService.generatePlacesFromOsm.
  const candidateCountByDuration =
    duration <= 75 ? 8 : duration <= 120 ? 10 : duration <= 180 ? 30 : duration <= 240 ? 40 : 50;

  console.log(`\n=== Shortlist diagnostic: ${city} / ${theme} / ${duration}min ===\n`);

  // 1. Geocode
  const geocoded = await geocodeCity(city);
  console.log(`Geocoded: ${geocoded.displayName} (centroid ${geocoded.lat.toFixed(4)}, ${geocoded.lng.toFixed(4)})`);

  // 2. Raw pool (cache -> Overpass), reporting which source was used.
  const poiCache = new PostgresPoiCacheRepository(prismaClient);
  const forceOverpass = process.env.FORCE_OVERPASS === '1';
  let source = 'cache';
  let rawPois: RawPoi[] | null = forceOverpass ? null : await poiCache.get(city, theme);
  if (!rawPois) {
    source = forceOverpass ? 'overpass (forced)' : 'overpass';
    rawPois = await fetchPoisForTheme(geocoded, theme);
  }
  rawPois = rawPois ?? [];
  console.log(`Raw pool: ${rawPois.length} POIs (source: ${source})`);

  // 3. Sitelinks
  const wikidataIds = rawPois
    .map((poi) => poi.tags.wikidata)
    .filter((id): id is string => typeof id === 'string' && id.length > 0);
  const wikidataMetadata = await fetchWikidataLandmarkMetadata(wikidataIds);
  const sitelinkCounts = Object.fromEntries(Object.entries(wikidataMetadata).map(([wikidataId, metadata]) => [wikidataId, metadata.sitelinks]));

  // 4. Sitelinks coverage — the silent-failure detector.
  const withWikidata = rawPois.filter((p) => Boolean(p.tags.wikidata));
  const withSitelinks = withWikidata.filter((p) => (sitelinkCounts[p.tags.wikidata as string] ?? 0) > 0);
  const noWikidata = rawPois.length - withWikidata.length;
  console.log('\n--- Sitelinks coverage ---');
  console.log(`POIs with wikidata tag:        ${withWikidata.length}/${rawPois.length}`);
  console.log(`  of those, sitelinks > 0:     ${withSitelinks.length}/${withWikidata.length}` +
    (withWikidata.length ? ` (${Math.round((withSitelinks.length / withWikidata.length) * 100)}%)` : ''));
  console.log(`POIs without wikidata tag:     ${noWikidata}/${rawPois.length}`);
  if (withWikidata.length > 0 && withSitelinks.length / withWikidata.length < 0.5) {
    console.log('  ⚠️  LOW sitelinks coverage — fame ranking is likely running blind (lookup bug / rate-limit).');
  }

  // 5. Tier + shortlist
  const tiered = tierPoisByLandmarkFame(rawPois, sitelinkCounts, theme as any, wikidataMetadata);
  const shortlistSize = Math.min(tiered.length, Math.max(candidateCountByDuration, 40));
  const shortlist = tiered.slice(0, shortlistSize);
  const tierHistogram = shortlist.reduce<Record<string, number>>((h, p) => {
    h[p.landmarkTier] = (h[p.landmarkTier] ?? 0) + 1;
    return h;
  }, {});
  console.log(`\n--- Shortlist (${shortlist.length} of ${tiered.length}) ---`);
  console.log('Tier histogram:', JSON.stringify(tierHistogram));
  console.log('Rank  Tier        Sitelinks  Fame    Name');
  shortlist.forEach((poi, i) => {
    console.log(
      `${String(i + 1).padStart(3)}.  ${poi.landmarkTier.padEnd(10)}  ${String(poi.fame.sitelinks).padStart(8)}  ${poi.fameScore.toFixed(2).padStart(6)}  ${poiDisplayName(poi)}`
    );
  });

  // 6. Anchor trace — the decisive output.
  if (anchors.length > 0) {
    console.log('\n--- Anchor trace (case localization) ---');
    const tieredIndexByPoi = new Map(tiered.map((p, i) => [p, i] as const));
    for (const anchor of anchors) {
      const needle = normalize(anchor);
      const matches = tiered.filter((p) => normalize(poiDisplayName(p)).includes(needle));
      if (matches.length === 0) {
        console.log(`  ❌ "${anchor}": NOT in raw pool  → CASE 1 (harvesting/cache). Constraints downstream cannot help.`);
        continue;
      }
      for (const m of matches) {
        const globalRank = (tieredIndexByPoi.get(m) ?? -1) + 1;
        const inShortlist = globalRank <= shortlist.length;
        const sl = m.fame.sitelinks;
        const qid = m.tags.wikidata ?? '(no wikidata tag)';
        if (sl === 0 && m.tags.wikidata) {
          console.log(`  ⚠️  "${poiDisplayName(m)}" [${qid}]: in pool, sitelinks=0  → CASE 2 (tiering lookup bug). rank ${globalRank}, tier ${m.landmarkTier}, shortlisted=${inShortlist}`);
        } else if (!inShortlist) {
          console.log(`  ⚠️  "${poiDisplayName(m)}" [${qid}]: in pool, sitelinks=${sl}, but rank ${globalRank} > shortlist(${shortlist.length})  → fame too low / scoring gap`);
        } else {
          console.log(`  ✅ "${poiDisplayName(m)}" [${qid}]: in shortlist (rank ${globalRank}, sitelinks=${sl}, tier ${m.landmarkTier})  → if missing from final tour, CASE 3 (set-construction).`);
        }
      }
    }
  }

  console.log('\n=== End diagnostic ===\n');
  await prismaClient.$disconnect();
}

main().catch(async (error) => {
  console.error('[diagnose-shortlist] failed:', error);
  try { await prismaClient.$disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
