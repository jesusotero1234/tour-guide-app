import { readFileSync } from 'fs';
import { join } from 'path';
import { RawPoi } from '../../domain/poi/RawPoi';
import { buildEditorialCandidateSet, resolveEditorialCityCenter } from './EditorialCandidate';
import { buildEditorialRouteBriefRequest } from './EditorialRouteBrief';
import { loadEditorialEvaluationCases } from './EditorialEvaluationManifest';
import { LandmarkTieredPoi, tierPoisByLandmarkFame } from './LandmarkTiering';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import { PoiEnrichmentSnapshot, SnapshotPoiEnrichmentCache } from './PoiEnrichmentSnapshot';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const MANIFEST = join(FIXTURES, 'oracle', 'editorial-v2-manifest.json');

interface PoolFixture {
  geocode: { lat: number; lng: number };
  rawPois: RawPoi[];
  sitelinks: Record<string, number>;
  wikidataMetadata: Record<string, { sitelinks: number; instanceOfLabels: string[] }>;
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

describe('editorial v2 calibration candidate gate', () => {
  const evaluationCases = loadEditorialEvaluationCases(MANIFEST);

  it.each(evaluationCases)('$id surfaces 100% of its duration-specific oracle before curation', async (evaluationCase) => {
    const slug = `${evaluationCase.city.toLowerCase()}-${evaluationCase.theme}`;
    const pool = readJson<PoolFixture>(join(FIXTURES, 'pools', `${slug}.json`));
    const snapshot = readJson<PoiEnrichmentSnapshot>(
      join(FIXTURES, 'sources', `${slug}-${evaluationCase.language}.json`)
    );
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
      maxDistanceFromCenterMeters: evaluationCase.durationMinutes <= 120 ? 3500 : 4500,
    });
    const candidateIds = new Set(candidateSet.candidates.flatMap((candidate) => candidate.memberCanonicalIds));
    const request = buildEditorialRouteBriefRequest(candidateSet.candidates, {
      city: evaluationCase.city,
      theme: evaluationCase.theme,
      language: evaluationCase.language,
      requestedDuration: evaluationCase.durationMinutes,
    });
    const sentCandidateIds = new Set(request.candidates.flatMap((sentCandidate) => (
      candidateSet.candidates.find((candidate) => candidate.canonicalId === sentCandidate.canonicalId)?.memberCanonicalIds ?? []
    )));

    expect(evaluationCase.oracle.stops.filter((anchor) => !candidateIds.has(anchor.qid))).toEqual([]);
    expect(evaluationCase.oracle.stops.filter((anchor) => !sentCandidateIds.has(anchor.qid))).toEqual([]);
    expect(new Set(candidateSet.candidates.map((candidate) => candidate.clusterId)).size).toBe(candidateSet.candidates.length);
    expect(candidateSet.candidates.every((candidate) => candidate.evidenceFacts.length >= 4)).toBe(true);
    expect(candidateSet.candidates.every((candidate) => candidate.evidenceFacts.some((fact) => fact.observable))).toBe(true);
  });
});
