import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { enrichShortlistedPois } from '../../src/services/poi/PoiEnrichmentPipeline';
import { PoiEnrichmentSnapshot, SnapshotPoiEnrichmentCache } from '../../src/services/poi/PoiEnrichmentSnapshot';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';

interface PoolFixture {
  rawPois: RawPoi[];
}

interface CandidateFixture {
  city: string;
  country?: string;
  countryCode?: string;
  theme: string;
  requestedDuration: number;
  stopBounds: { minStops: number; maxStops: number };
  candidates: Array<{
    name: string;
    wikidataId: string | null;
    coordinates: { lat: number; lng: number };
    importance_score: number;
    fameScore: number;
    landmarkTier: string;
    category: string;
    historyPlaceScore?: number;
    historyPlaceKinds?: string[];
    historyIsEventSiteLike?: boolean;
    historyIsMuseumLike?: boolean;
  }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

async function main(): Promise<void> {
  const city = process.argv[2] || 'Barcelona';
  const theme = process.argv[3] || 'history';
  const language = process.argv[4] || 'fr';
  const llmServiceUrl = process.argv[5] || process.env.LLM_SERVICE_URL || 'http://localhost:3002';
  const country = process.argv[6];
  const countryCode = process.argv[7];
  const slug = `${city.toLowerCase()}-${theme}`;
  const fixtures = join(__dirname, '..', '..', 'fixtures');

  const pool = readJson<PoolFixture>(join(fixtures, 'pools', `${slug}.json`));
  const candidateFixture = readJson<CandidateFixture>(join(fixtures, 'candidates', `${slug}.json`));
  const sourceSnapshot = readJson<PoiEnrichmentSnapshot>(
    join(fixtures, 'sources', `${slug}-${language}.json`)
  );
  const routeSelection = composeWalkingRoute(
    candidateFixture.candidates,
    candidateFixture.requestedDuration,
    candidateFixture.theme,
    candidateFixture.stopBounds
  );

  const rawByQid = new Map(
    pool.rawPois
      .filter((poi) => poi.tags.wikidata)
      .map((poi) => [poi.tags.wikidata as string, poi])
  );
  const routePois = routeSelection.route.map((stop) => {
    const poi = stop.wikidataId ? rawByQid.get(stop.wikidataId) : undefined;
    if (!poi) throw new Error(`Frozen raw POI missing for ${stop.name} (${stop.wikidataId})`);
    return poi;
  });
  const enriched = await enrichShortlistedPois(
    routePois,
    language,
    new SnapshotPoiEnrichmentCache(sourceSnapshot)
  );
  const enrichedByQid = new Map(
    enriched.map((poi) => [poi.tags.wikidata as string, poi])
  );

  const places = [];
  for (let index = 0; index < routeSelection.route.length; index++) {
    const stop = routeSelection.route[index];
    const poi = enrichedByQid.get(stop.wikidataId as string);
    if (!poi) throw new Error(`Frozen enrichment missing for ${stop.name}`);
    const position = index === 0 ? 'first' : index === routeSelection.route.length - 1 ? 'last' : 'middle';
    const localName = poi.enriched.nameTranslations[language] || stop.name;
    const response = await axios.post(`${llmServiceUrl}/narrative/stop/long`, {
      traceId: crypto.randomUUID(),
      localName,
      seeds: {
        wikipediaLead: poi.enriched.wikipediaLead,
        wikipediaBody: poi.enriched.wikipediaBody,
        wikidataClaims: poi.enriched.wikidataClaims,
        osmTags: poi.enriched.osmTags,
        wikivoyage: poi.enriched.wikivoyage,
      },
      theme,
      language,
      previousStopName: routeSelection.route[index - 1]?.name,
      nextStopName: routeSelection.route[index + 1]?.name,
      tourStopNames: routeSelection.route.map((routeStop) => routeStop.name),
      position,
      cityName: city,
      totalStops: routeSelection.route.length,
      stopIndex: index,
      tourDurationMinutes: candidateFixture.requestedDuration,
    }, { timeout: 180000 });
    const narration = response.data;
    if (!narration?.narration || !narration?.sections) {
      throw new Error(`Narrative service returned an empty result for ${stop.name}`);
    }

    places.push({
      id: `fixture-${index + 1}`,
      tourId: 'fixture-candidate',
      name: poi.enriched.nameTranslations[language] || stop.name,
      description: narration.narration,
      descriptionSections: narration.sections || undefined,
      latitude: stop.coordinates.lat,
      longitude: stop.coordinates.lng,
      position: index,
      importanceScore: stop.importance_score,
      metadata: {
        sourcePoi: {
          osmType: poi.osmType,
          osmId: poi.osmId,
          wikidata: poi.tags.wikidata,
          wikipedia: poi.tags.wikipedia,
          category: stop.category,
          landmarkTier: stop.landmarkTier,
          fameScore: stop.fameScore,
          osmTags: poi.tags,
        },
        narrationMeta: narration.meta,
      },
    });
    console.log(`[fixture-replay] ${index + 1}/${routeSelection.route.length}: ${stop.name}`);
  }

  const now = new Date().toISOString();
  const tour = {
    id: 'fixture-candidate',
    city,
    country: country || candidateFixture.country || 'Unknown',
    countryCode: countryCode || candidateFixture.countryCode || '',
    theme,
    language,
    durationMinutes: candidateFixture.requestedDuration,
    metadata: {
      generationMode: 'frozen-fixture-replay',
      sourceSnapshot: `${slug}-${language}.json`,
      routeDiagnostics: routeSelection.diagnostics,
    },
    places,
    createdAt: now,
    updatedAt: now,
  };

  mkdirSync(join(fixtures, 'tours'), { recursive: true });
  const output = join(fixtures, 'tours', `${slug}-${language}-candidate.json`);
  writeFileSync(output, JSON.stringify(tour, null, 2));
  console.log(`[fixture-replay] wrote ${output}`);
}

main().catch((error) => {
  console.error('[fixture-replay] failed:', error);
  process.exit(1);
});
