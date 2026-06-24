import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { geocodeCity } from '../../src/infrastructure/geocoder/NominatimGeocoder';
import { fetchPoisForTheme } from '../../src/infrastructure/poi/OverpassPoiFetcher';
import { fetchCanonicalWikidataPois, mergeCanonicalWikidataPois } from '../../src/infrastructure/poi/WikidataCanonicalPoiFetcher';
import { classifyPoiTags } from '../../src/domain/poi/PoiClassification';
import { getHistoryPlaceProfile } from '../../src/services/poi/HistoryPlaceScoring';
import { getDurationPlan } from '../../src/services/poi/DurationPlanning';
import { fetchWikidataLandmarkMetadata, tierPoisByLandmarkFame } from '../../src/services/poi/LandmarkTiering';
import { rankPois } from '../../src/services/poi/PoiRanker';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';
import { assessHistoryTourPreflight } from '../../src/services/poi/HistoryTourCapacity';

const DEFAULT_CITIES = [
  'Prague',
  'Vienna',
  'Lisbon',
  'Athens',
  'Istanbul',
  'London',
  'Sevilla',
  'Granada',
  'Toledo',
  'Valencia',
  'Florence',
  'Venice',
  'Edinburgh',
  'Budapest',
  'Krakow',
  'Amsterdam',
  'Berlin',
  'Roma',
  'Paris',
  'Malaga',
  'Toulouse',
];

function getArgValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
}

function definedStringTags(tags: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

async function inspectCity(city: string, requestedDuration: number) {
  const geocoded = await geocodeCity(city);
  const rawOsmPois = await fetchPoisForTheme(geocoded, 'history');
  const canonicalPois = await fetchCanonicalWikidataPois(geocoded, 'history');
  const rawPois = mergeCanonicalWikidataPois(rawOsmPois, canonicalPois);
  const wikidataIds = rawPois
    .map((poi) => poi.tags.wikidata)
    .filter((wikidataId): wikidataId is string => typeof wikidataId === 'string' && wikidataId.length > 0);
  const wikidataMetadata = await fetchWikidataLandmarkMetadata(wikidataIds);
  const sitelinks = Object.fromEntries(
    Object.entries(wikidataMetadata).map(([wikidataId, metadata]) => [wikidataId, metadata.sitelinks])
  );
  const plan = getDurationPlan(requestedDuration);
  const shortlistSize = Math.min(rawPois.length, Math.max(plan.candidateCount, 40));
  const tiered = tierPoisByLandmarkFame(rawPois, sitelinks, 'history', wikidataMetadata).slice(0, shortlistSize);
  const enriched = tiered.map((poi) => ({
    ...poi,
    enriched: {
      nameTranslations: {},
      description: null,
      wikipediaLead: null,
      wikipediaBody: null,
      wikidataClaims: null,
      osmTags: definedStringTags(poi.tags),
      wikivoyage: null,
      descriptionLanguage: null,
      attribution: {},
    },
  }));
  const ranked = rankPois(enriched, geocoded.lat, geocoded.lng, 'history').slice(0, plan.candidateCount);
  const routeCandidates = ranked.map((poi) => {
    const historyProfile = getHistoryPlaceProfile(poi);
    return {
      name: poi.name || poi.tags.name || '',
      wikidataId: poi.tags.wikidata ?? null,
      coordinates: { lat: poi.lat, lng: poi.lng },
      importance_score: poi.score,
      fameScore: (poi as any).fameScore,
      landmarkTier: (poi as any).landmarkTier,
      category: classifyPoiTags(poi.tags),
      historyPlaceScore: historyProfile.score,
      historyPlaceKinds: historyProfile.kinds,
      historyIsEventSiteLike: historyProfile.isEventSiteLike,
      historyIsMuseumLike: historyProfile.isMuseumLike,
    };
  });
  const routeSelection = composeWalkingRoute(routeCandidates, requestedDuration, 'history', {
    minStops: plan.minStops,
    maxStops: plan.maxStops,
  });
  const preflight = assessHistoryTourPreflight(routeCandidates, requestedDuration, {
    degraded: routeSelection.diagnostics.degraded,
    coverageRatio: routeSelection.diagnostics.coverageRatio,
  });

  return {
    city,
    requestedDurationMinutes: requestedDuration,
    rawPoiCount: rawPois.length,
    candidateCount: routeCandidates.length,
    decision: preflight.decision,
    tier: preflight.tier,
    recommendedDurationMinutes: preflight.recommendedDurationMinutes,
    reasons: preflight.reasons,
    protectedAnchorCount: preflight.protectedAnchorCount,
    strongHistoryPlaceCount: preflight.strongHistoryPlaceCount,
    secondaryPlaceShare: preflight.secondaryPlaceShare,
    topAnchors: preflight.topAnchors,
    route: routeSelection.route.map((stop) => ({
      name: stop.name,
      wikidataId: stop.wikidataId ?? null,
      category: stop.category,
      historyPlaceScore: stop.historyPlaceScore,
    })),
    routeDiagnostics: routeSelection.diagnostics,
  };
}

async function main(): Promise<void> {
  const requestedDuration = Number(getArgValue('duration') || 240);
  const cityArg = getArgValue('cities');
  const cities = cityArg
    ? cityArg.split(',').map((city) => city.trim()).filter(Boolean)
    : DEFAULT_CITIES;
  const shouldWrite = process.argv.includes('--write');
  const results = [];

  for (const city of cities) {
    try {
      const result = await inspectCity(city, requestedDuration);
      results.push(result);
      console.log(`[history-preflight] ${city}: ${result.decision} / ${result.tier} / recommended ${result.recommendedDurationMinutes}m`);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown_error';
      results.push({
        city,
        requestedDurationMinutes: requestedDuration,
        decision: 'block',
        tier: 'insufficient_data',
        recommendedDurationMinutes: 0,
        reasons: ['preflight_error'],
        error: message,
      });
      console.warn(`[history-preflight] ${city}: failed — ${message}`);
    }
  }

  const report = {
    generatedAt: new Date().toISOString(),
    requestedDurationMinutes: requestedDuration,
    cities: results,
    summary: results.reduce<Record<string, number>>((summary, result: any) => {
      summary[result.decision] = (summary[result.decision] ?? 0) + 1;
      return summary;
    }, {}),
  };

  if (shouldWrite) {
    const outDir = join(__dirname, '..', '..', 'fixtures', 'reviews');
    mkdirSync(outDir, { recursive: true });
    const outPath = join(outDir, `history-preflight-canary-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    writeFileSync(outPath, JSON.stringify(report, null, 2));
    console.log(`[history-preflight] wrote ${outPath}`);
  }

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error('[history-preflight] failed:', error);
  process.exit(1);
});
