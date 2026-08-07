import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../domain/poi/RawPoi';
import {
  buildEditorialCandidateSet,
  EditorialCandidateSet,
  EditorialCandidateSource,
  resolveEditorialCityCenter,
} from './EditorialCandidate';
import { LoadedEditorialEvaluationCase } from './EditorialEvaluationManifest';
import { LandmarkTieredPoi, tierPoisByLandmarkFame } from './LandmarkTiering';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import { PoiEnrichmentSnapshot, SnapshotPoiEnrichmentCache } from './PoiEnrichmentSnapshot';
import { buildEditorialSitesV3, EditorialSiteCandidateV3 } from './EditorialSiteV3';

interface PoolFixtureV3 {
  geocode: { lat: number; lng: number };
  rawPois: RawPoi[];
  sitelinks: Record<string, number>;
  wikidataMetadata: Record<string, { sitelinks: number; instanceOfLabels: string[] }>;
}

export interface EditorialEvaluationInputV3 {
  candidateSet: EditorialCandidateSet;
  sites: EditorialSiteCandidateV3[];
  readySites: EditorialSiteCandidateV3[];
  prefilteredCount: number;
  evidenceGaps: Array<{ siteId: string; name: string; missing: string[] }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function maxCandidateDistance(requestedDuration: number): number {
  if (requestedDuration <= 120) return 3500;
  if (requestedDuration <= 180) return 4500;
  return 6000;
}

export async function loadEditorialEvaluationInputV3(
  evaluationCase: LoadedEditorialEvaluationCase,
  fixturesDirectory: string,
  options: { allowHoldout?: boolean } = {}
): Promise<EditorialEvaluationInputV3> {
  if (evaluationCase.scope !== 'calibration' && options.allowHoldout !== true) {
    throw new Error(`V3 input loader refuses holdout case ${evaluationCase.id}`);
  }
  const slug = `${evaluationCase.city.toLowerCase()}-${evaluationCase.theme}`;
  const poolPath = join(fixturesDirectory, 'pools', `${slug}.json`);
  const sourcePath = join(fixturesDirectory, 'sources', `${slug}-${evaluationCase.language}.json`);
  if (!existsSync(poolPath) || !existsSync(sourcePath)) {
    throw new Error(`Missing frozen pool/source fixtures for ${evaluationCase.id}`);
  }

  const pool = readJson<PoolFixtureV3>(poolPath);
  const snapshot = readJson<PoiEnrichmentSnapshot>(sourcePath);
  const allTiered = tierPoisByLandmarkFame(
    pool.rawPois,
    pool.sitelinks,
    evaluationCase.theme as 'history',
    pool.wikidataMetadata
  );
  const shortlist = allTiered.slice(0, 60);
  const cache = new SnapshotPoiEnrichmentCache(snapshot);
  const [shortlistEnriched, allEnriched] = await Promise.all([
    enrichShortlistedPois(shortlist, evaluationCase.language, cache, 20),
    enrichShortlistedPois(allTiered, evaluationCase.language, cache, 40),
  ]);
  const toSources = (enriched: typeof shortlistEnriched, tiered: LandmarkTieredPoi[]): EditorialCandidateSource[] => (
    enriched.map((poi, index) => ({
      ...poi,
      fameScore: tiered[index].fameScore,
      landmarkTier: tiered[index].landmarkTier,
    }))
  );
  const shortlistSources = toSources(shortlistEnriched, shortlist);
  const allSources = toSources(allEnriched, allTiered);
  const candidateSet = buildEditorialCandidateSet(shortlistSources, {
    theme: evaluationCase.theme,
    language: evaluationCase.language,
    requestedDuration: evaluationCase.durationMinutes,
    cityCenter: resolveEditorialCityCenter(shortlistSources, pool.geocode),
    maxDistanceFromCenterMeters: maxCandidateDistance(evaluationCase.durationMinutes),
  });
  const sites = buildEditorialSitesV3(candidateSet.candidates, allSources, evaluationCase.language);
  const shortlistScore = (site: EditorialSiteCandidateV3): number => (
    (site.tier === 'essential' ? 40 : site.tier === 'strong' ? 20 : 0)
      + site.firstVisitScore + site.fameScore
  );
  const readySites = sites.filter((site) => site.readiness.ready).sort((left, right) => (
    shortlistScore(right) - shortlistScore(left)
      || right.evidenceScore - left.evidenceScore
      || left.canonicalId.localeCompare(right.canonicalId)
  )).slice(0, 18);
  return {
    candidateSet,
    sites,
    readySites,
    prefilteredCount: shortlist.length,
    evidenceGaps: sites.filter((site) => !site.readiness.ready).map((site) => ({
      siteId: site.siteId,
      name: site.localName,
      missing: site.readiness.missing,
    })),
  };
}
