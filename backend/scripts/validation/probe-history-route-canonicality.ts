import { readFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { classifyPoiTags } from '../../src/domain/poi/PoiClassification';
import { getDurationPlan } from '../../src/services/poi/DurationPlanning';
import { getHistoryPlaceProfile } from '../../src/services/poi/HistoryPlaceScoring';
import { tierPoisByLandmarkFame, WikidataLandmarkMetadata } from '../../src/services/poi/LandmarkTiering';
import { rankPois } from '../../src/services/poi/PoiRanker';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';
import {
  fetchCanonicalWikidataPois,
  mergeCanonicalWikidataPois,
} from '../../src/infrastructure/poi/WikidataCanonicalPoiFetcher';

interface PoolFixture {
  geocode: {
    lat: number;
    lng: number;
    boundingBox: {
      minLat: number;
      maxLat: number;
      minLng: number;
      maxLng: number;
    };
  };
  rawPois: RawPoi[];
  sitelinks?: Record<string, number>;
  wikidataMetadata?: Record<string, WikidataLandmarkMetadata>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function metadataFromCanonicalPoi(poi: RawPoi): WikidataLandmarkMetadata | null {
  const sitelinks = Number(poi.tags['canonical:sitelinks'] ?? 0);
  const instanceLabels = (poi.tags['canonical:instance_of'] ?? '')
    .split('|')
    .map((label) => label.trim())
    .filter(Boolean);

  if (!Number.isFinite(sitelinks) || sitelinks <= 0) {
    return null;
  }

  return { sitelinks, instanceOfLabels: instanceLabels };
}

function definedStringTags(tags: RawPoi['tags']): Record<string, string> {
  return Object.fromEntries(
    Object.entries(tags).filter((entry): entry is [string, string] => typeof entry[1] === 'string')
  );
}

async function main(): Promise<void> {
  const city = process.argv[2] || 'Berlin';
  const theme = process.argv[3] || 'history';
  const requestedDuration = Number(process.argv[4] || 240);
  const slug = `${city.toLowerCase()}-${theme}`;
  const fixturesDir = join(__dirname, '..', '..', 'fixtures');
  const pool = readJson<PoolFixture>(join(fixturesDir, 'pools', `${slug}.json`));
  const plan = getDurationPlan(requestedDuration);

  const geocoded = {
    osmType: 'fixture',
    osmId: 0,
    wikidataId: null,
    displayName: city,
    ...pool.geocode,
  };
  const canonicalPois = await fetchCanonicalWikidataPois(geocoded, 'history');
  const rawPois = mergeCanonicalWikidataPois(pool.rawPois, canonicalPois);
  const wikidataMetadata = { ...(pool.wikidataMetadata ?? {}) };
  const sitelinks = { ...(pool.sitelinks ?? {}) };

  for (const poi of rawPois) {
    const wikidataId = poi.tags.wikidata;
    if (!wikidataId || wikidataMetadata[wikidataId]) {
      continue;
    }

    const metadata = metadataFromCanonicalPoi(poi);
    if (metadata) {
      wikidataMetadata[wikidataId] = metadata;
      sitelinks[wikidataId] = metadata.sitelinks;
    }
  }

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

  console.log(JSON.stringify({
    city,
    requestedDuration,
    canonicalFound: canonicalPois.slice(0, 20).map((poi) => ({
      name: poi.name,
      qid: poi.tags.wikidata,
      kinds: poi.tags['canonical:instance_of'],
      sitelinks: Number(poi.tags['canonical:sitelinks'] ?? 0),
    })),
    rankedTop: ranked.slice(0, 20).map((poi) => ({
      name: poi.name,
      qid: poi.tags.wikidata,
      score: Number(poi.score.toFixed(2)),
      fameScore: Number(((poi as any).fameScore ?? 0).toFixed(2)),
      tier: (poi as any).landmarkTier,
      category: classifyPoiTags(poi.tags),
      history: getHistoryPlaceProfile(poi),
    })),
    route: routeSelection.route.map((poi) => ({
      name: poi.name,
      qid: poi.wikidataId,
      category: poi.category,
      historyPlaceScore: poi.historyPlaceScore,
      historyPlaceKinds: poi.historyPlaceKinds,
    })),
    diagnostics: routeSelection.diagnostics,
  }, null, 2));
}

main().catch((error) => {
  console.error('[probe-history-route-canonicality] failed:', error);
  process.exit(1);
});
