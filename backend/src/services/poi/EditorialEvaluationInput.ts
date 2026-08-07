import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../domain/poi/RawPoi';
import {
  buildEditorialCandidateSet,
  EditorialCandidateSet,
  resolveEditorialCityCenter,
} from './EditorialCandidate';
import {
  buildEditorialRouteBriefRequest,
  EditorialRouteBriefRequest,
} from './EditorialRouteBrief';
import { LoadedEditorialEvaluationCase } from './EditorialEvaluationManifest';
import { LandmarkTieredPoi, tierPoisByLandmarkFame } from './LandmarkTiering';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import { PoiEnrichmentSnapshot, SnapshotPoiEnrichmentCache } from './PoiEnrichmentSnapshot';

interface PoolFixture {
  geocode: { lat: number; lng: number };
  rawPois: RawPoi[];
  sitelinks: Record<string, number>;
  wikidataMetadata: Record<string, { sitelinks: number; instanceOfLabels: string[] }>;
}

export interface EditorialEvaluationInput {
  candidateSet: EditorialCandidateSet;
  request: EditorialRouteBriefRequest;
  prefilteredCount: number;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function maxCandidateDistance(requestedDuration: number): number {
  if (requestedDuration <= 120) return 3500;
  if (requestedDuration <= 180) return 4500;
  return 6000;
}

export async function loadEditorialEvaluationInput(
  evaluationCase: LoadedEditorialEvaluationCase,
  fixturesDirectory: string,
  options: { allowHoldout?: boolean } = {}
): Promise<EditorialEvaluationInput> {
  if (evaluationCase.scope !== 'calibration' && options.allowHoldout !== true) {
    throw new Error(`Benchmark input loader refuses holdout case ${evaluationCase.id}`);
  }

  const slug = `${evaluationCase.city.toLowerCase()}-${evaluationCase.theme}`;
  const poolPath = join(fixturesDirectory, 'pools', `${slug}.json`);
  const sourcePath = join(
    fixturesDirectory,
    'sources',
    `${slug}-${evaluationCase.language}.json`
  );
  if (!existsSync(poolPath) || !existsSync(sourcePath)) {
    throw new Error(`Missing frozen pool/source fixtures for ${evaluationCase.id}`);
  }

  const pool = readJson<PoolFixture>(poolPath);
  const snapshot = readJson<PoiEnrichmentSnapshot>(sourcePath);
  const tiered = tierPoisByLandmarkFame(
    pool.rawPois,
    pool.sitelinks,
    evaluationCase.theme as 'history',
    pool.wikidataMetadata
  ).slice(0, 60);
  const enriched = await enrichShortlistedPois(
    tiered,
    evaluationCase.language,
    new SnapshotPoiEnrichmentCache(snapshot),
    20
  );
  const sources = enriched.map((poi, index) => ({
    ...poi,
    fameScore: (tiered[index] as LandmarkTieredPoi).fameScore,
    landmarkTier: (tiered[index] as LandmarkTieredPoi).landmarkTier,
  }));
  const candidateSet = buildEditorialCandidateSet(sources, {
    theme: evaluationCase.theme,
    language: evaluationCase.language,
    requestedDuration: evaluationCase.durationMinutes,
    cityCenter: resolveEditorialCityCenter(sources, pool.geocode),
    maxDistanceFromCenterMeters: maxCandidateDistance(evaluationCase.durationMinutes),
  });
  const request = buildEditorialRouteBriefRequest(candidateSet.candidates, {
    city: evaluationCase.city,
    theme: evaluationCase.theme,
    language: evaluationCase.language,
    requestedDuration: evaluationCase.durationMinutes,
  });

  return { candidateSet, request, prefilteredCount: tiered.length };
}
