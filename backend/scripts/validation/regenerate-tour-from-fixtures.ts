import 'dotenv/config';
import axios from 'axios';
import crypto from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../src/domain/poi/RawPoi';
import { enrichShortlistedPois } from '../../src/services/poi/PoiEnrichmentPipeline';
import { PoiEnrichmentSnapshot, SnapshotPoiEnrichmentCache } from '../../src/services/poi/PoiEnrichmentSnapshot';
import { composeWalkingRoute } from '../../src/services/poi/RouteSelection';
import { auditTourText, buildTourIntroduction, buildTourNarrativePlan } from '../../src/services/narrative/TourTextQuality';

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
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith('--'));
  const city = positional[0] || 'Barcelona';
  const theme = positional[1] || 'history';
  const language = positional[2] || 'fr';
  const llmServiceUrl = positional[3] || process.env.LLM_SERVICE_URL || 'http://localhost:3002';
  const country = positional[4];
  const countryCode = positional[5];
  const selectedPositions = new Set(
    (args.find((arg) => arg.startsWith('--stops='))?.split('=')[1] || '')
      .split(',')
      .filter(Boolean)
      .map((value) => Number(value) - 1)
      .filter((value) => Number.isInteger(value) && value >= 0)
  );
  const slug = `${city.toLowerCase()}-${theme}`;
  const fixtures = join(__dirname, '..', '..', 'fixtures');
  const output = join(fixtures, 'tours', `${slug}-${language}-candidate.json`);

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
  const narrativePlan = buildTourNarrativePlan({
    city,
    theme,
    language,
    placeNames: routeSelection.route.map((routeStop) => routeStop.name),
  });
  const previousTour = selectedPositions.size > 0 && existsSync(output)
    ? readJson<{ places?: Array<Record<string, unknown>> }>(output)
    : undefined;
  if (selectedPositions.size > 0 && !previousTour?.places) {
    throw new Error(`Cannot regenerate selected stops without an existing artifact: ${output}`);
  }

  const places: Array<Record<string, unknown>> = [];
  for (let index = 0; index < routeSelection.route.length; index++) {
    const stop = routeSelection.route[index];
    if (selectedPositions.size > 0 && !selectedPositions.has(index)) {
      const existingPlace = previousTour?.places?.[index];
      if (!existingPlace) throw new Error(`Existing artifact is missing stop ${index + 1}`);
      places.push(existingPlace);
      console.log(`[fixture-replay] reused ${index + 1}/${routeSelection.route.length}: ${stop.name}`);
      continue;
    }
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
      tourPromise: narrativePlan.promise,
      centralQuestion: narrativePlan.centralQuestion,
      narrativeRole: narrativePlan.stopRoles[index]?.role,
      openingArchetype: narrativePlan.stopRoles[index]?.openingArchetype,
      transitionPurpose: narrativePlan.stopRoles[index]?.transitionPurpose,
      editorialRepairInstructions: selectedPositions.size > 0
        ? ['Rewrite only this stop with a distinct opening, main idea, and closing. Do not repeat formulas used by other stops.']
        : undefined,
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
  const introduction = buildTourIntroduction({
    city,
    theme,
    language,
    durationMinutes: candidateFixture.requestedDuration,
    firstStopName: routeSelection.route[0]?.name || city,
    plan: narrativePlan,
  });
  const textAudit = auditTourText({
    introduction,
    language,
    places: places.map((place, position) => ({
      id: String(place.id || `fixture-${position + 1}`),
      position,
      name: String(place.name || routeSelection.route[position]?.name || ''),
      description: String(place.description || ''),
      metadata: place.metadata as never,
    })),
  });
  const tour = {
    id: 'fixture-candidate',
    city,
    country: country || candidateFixture.country || 'Unknown',
    countryCode: countryCode || candidateFixture.countryCode || '',
    theme,
    language,
    durationMinutes: candidateFixture.requestedDuration,
    status: 'draft',
    introduction,
    metadata: {
      generationMode: 'frozen-fixture-replay',
      sourceSnapshot: `${slug}-${language}.json`,
      routeDiagnostics: routeSelection.diagnostics,
      narrativePlan,
      textAudit,
    },
    places,
    createdAt: now,
    updatedAt: now,
  };

  mkdirSync(join(fixtures, 'tours'), { recursive: true });
  writeFileSync(output, JSON.stringify(tour, null, 2));
  console.log(`[fixture-replay] wrote ${output}`);
  console.log(`[fixture-replay] text audit ${textAudit.passed ? 'PASS' : 'FAIL'} (${textAudit.score}): ${textAudit.reasons.join(', ') || 'no issues'}`);
}

main().catch((error) => {
  console.error('[fixture-replay] failed:', error);
  process.exit(1);
});
