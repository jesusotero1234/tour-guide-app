import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../domain/poi/RawPoi';
import { EditorialCandidateSource, resolveEditorialCityCenter } from './EditorialCandidate';
import {
  buildEditorialEntitiesV4,
  editorialDistanceMetersV4,
  EditorialEntityCandidateV4,
} from './EditorialEntityV4';
import { LoadedEditorialEvaluationCase } from './EditorialEvaluationManifest';
import { LandmarkTieredPoi, tierPoisByLandmarkFame } from './LandmarkTiering';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import { PoiEnrichmentSnapshot, SnapshotPoiEnrichmentCache } from './PoiEnrichmentSnapshot';

interface PoolFixtureV4 {
  geocode: { lat: number; lng: number };
  rawPois: RawPoi[];
  sitelinks: Record<string, number>;
  wikidataMetadata: Record<string, { sitelinks: number; instanceOfLabels: string[] }>;
}

export interface EditorialEvaluationInputV4 {
  entities: EditorialEntityCandidateV4[];
  readyEntities: EditorialEntityCandidateV4[];
  prefilteredCount: number;
  evidenceGaps: Array<{ canonicalId: string; name: string; missing: string[] }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function maxCandidateDistance(requestedDuration: number): number {
  if (requestedDuration <= 120) return 3500;
  if (requestedDuration <= 180) return 4500;
  return 6000;
}

function toSources(enriched: Awaited<ReturnType<typeof enrichShortlistedPois>>, tiered: LandmarkTieredPoi[]): EditorialCandidateSource[] {
  return enriched.map((poi, index) => ({
    ...poi,
    fameScore: tiered[index]?.fameScore ?? 0,
    landmarkTier: tiered[index]?.landmarkTier,
  }));
}

export async function loadEditorialEvaluationInputV4(
  evaluationCase: LoadedEditorialEvaluationCase,
  fixturesDirectory: string,
  options: { allowHoldout?: boolean } = {}
): Promise<EditorialEvaluationInputV4> {
  if (evaluationCase.scope !== 'calibration' && options.allowHoldout !== true) {
    throw new Error(`V4 input loader refuses holdout case ${evaluationCase.id}`);
  }
  const slug = `${evaluationCase.city.toLowerCase()}-${evaluationCase.theme}`;
  const poolPath = join(fixturesDirectory, 'pools', `${slug}.json`);
  const sourcePath = join(fixturesDirectory, 'sources', `${slug}-${evaluationCase.language}.json`);
  if (!existsSync(poolPath) || !existsSync(sourcePath)) {
    throw new Error(`Missing frozen pool/source fixtures for ${evaluationCase.id}`);
  }
  const pool = readJson<PoolFixtureV4>(poolPath);
  const snapshot = readJson<PoiEnrichmentSnapshot>(sourcePath);
  const allTiered = tierPoisByLandmarkFame(
    pool.rawPois,
    pool.sitelinks,
    evaluationCase.theme as 'history',
    pool.wikidataMetadata
  );
  const cache = new SnapshotPoiEnrichmentCache(snapshot);
  const enriched = await enrichShortlistedPois(allTiered, evaluationCase.language, cache, 40);
  const sources = toSources(enriched, allTiered);
  const cityCenter = resolveEditorialCityCenter(sources, pool.geocode) ?? pool.geocode;
  const entities = buildEditorialEntitiesV4(sources, evaluationCase.language)
    .filter((entity) => editorialDistanceMetersV4(entity.coordinates, cityCenter)
      <= maxCandidateDistance(evaluationCase.durationMinutes));
  const readyEntities = entities.filter((entity) => entity.readiness.ready).sort((left, right) => (
    (right.baselineScore ?? right.fameScore) - (left.baselineScore ?? left.fameScore)
      || right.readiness.historicalSpecificCount - left.readiness.historicalSpecificCount
      || right.readiness.observableCount - left.readiness.observableCount
      || editorialDistanceMetersV4(left.coordinates, cityCenter)
        - editorialDistanceMetersV4(right.coordinates, cityCenter)
      || left.canonicalId.localeCompare(right.canonicalId)
  )).slice(0, 30);
  return {
    entities,
    readyEntities,
    prefilteredCount: Math.min(60, allTiered.length),
    evidenceGaps: entities.filter((entity) => !entity.readiness.ready).map((entity) => ({
      canonicalId: entity.canonicalId,
      name: entity.localName,
      missing: entity.readiness.missing,
    })),
  };
}
