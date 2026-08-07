import { PoiCategory } from '../../domain/poi/PoiClassification';
import { EvidenceFact } from './EditorialCandidate';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  optimizeEditorialRoutePortfolioV5,
} from './EditorialRoutePortfolioV5';
import {
  WALKING_MATRIX_SCHEMA_VERSION,
  WalkingMatrixSnapshotV4,
  walkingMatrixCandidateFingerprintV4,
} from './EditorialWalkingMatrixV4';

function entity(
  id: string,
  index: number,
  options: {
    recognition?: number;
    firstVisit?: number;
    category?: PoiCategory;
    year?: number;
    conflict?: string | null;
  } = {}
): EditorialEntityCandidateV5 {
  const facts: EvidenceFact[] = [
    {
      id: `${id}:observable`, source: 'osm', sourceId: `node:${index}`,
      kind: 'observable', value: 'material: stone', observable: true,
    },
    {
      id: `${id}:claim`, source: 'wikidata', sourceId: id,
      kind: 'claim', value: `inception: ${options.year ?? 1800}`, observable: false,
    },
    {
      id: `${id}:context`, source: 'wikipedia', sourceId: id,
      kind: 'context', value: `El edificio transformó la ciudad en ${options.year ?? 1800}.`,
      observable: false,
    },
  ];
  return {
    canonicalId: id, siteId: `site:${id}`, sourceIds: [`node:${index}`], localName: id,
    category: options.category ?? 'other',
    coordinates: { lat: 40.4 + (index * 0.001), lng: -3.7 },
    fameScore: (options.recognition ?? 50) / 2,
    recognitionScore: options.recognition ?? 50,
    firstVisitScore: options.firstVisit ?? options.recognition ?? 50,
    evidenceFacts: facts, visitConflictGroup: options.conflict ?? null,
    readiness: {
      ready: true, observableCount: 1, contextCount: 1,
      historicalSpecificCount: 2, missing: [],
    },
  };
}

function matrix(
  entities: EditorialEntityCandidateV5[],
  seconds = 120,
  meters = 150
): WalkingMatrixSnapshotV4 {
  const sites = entities.map((item) => ({
    siteId: item.siteId, lat: item.coordinates.lat, lng: item.coordinates.lng,
  }));
  return {
    schemaVersion: WALKING_MATRIX_SCHEMA_VERSION,
    provider: { id: 'fossgis-osrm-foot', capturedAt: '2026-08-07T00:00:00.000Z' },
    candidateFingerprint: walkingMatrixCandidateFingerprintV4(sites),
    sites,
    legs: entities.map((_, from) => entities.map((__, to) => from === to
      ? { meters: 0, seconds: 0, reachable: true }
      : { meters, seconds, reachable: true })),
  };
}

describe('editorial route portfolio v5', () => {
  it('searches all thirty candidates with a BigInt visited set', () => {
    const entities = Array.from({ length: 30 }, (_, index) => entity(
      `Q${String(index + 1).padStart(2, '0')}`,
      index,
      { recognition: index === 29 ? 100 : 40 - index }
    ));
    const result = optimizeEditorialRoutePortfolioV5(entities, matrix(entities), 120, {
      minStops: 4, maxStops: 4,
    });

    expect(result.status).toBe('selected');
    expect(result.candidates).toHaveLength(30);
    expect(result.protectedCandidateSlots).toContain('c30');
    expect(result.routes.some((route) => route.candidateSlots.includes('c30'))).toBe(true);
  });

  it('protects first-visit landmarks and rare era-category carriers before beam truncation', () => {
    const entities = Array.from({ length: 12 }, (_, index) => entity(
      `Q${String(index + 1).padStart(2, '0')}`,
      index,
      {
        recognition: index === 11 ? 1 : 100 - index,
        firstVisit: index === 11 ? 100 : 50 - index,
        category: index === 10 || index === 11 ? 'square_civic' : 'other',
        year: index === 9 || index === 11 ? 1400 : 1800,
      }
    ));
    const result = optimizeEditorialRoutePortfolioV5(entities, matrix(entities), 120, {
      minStops: 4, maxStops: 4, beamWidth: 24, labelsPerBoundary: 2,
    });

    expect(result.protectedCandidateSlots).toContain('c12');
    expect(result.routes.some((route) => route.candidateSlots.includes('c12'))).toBe(true);
    expect(result.uncoveredProtectedCandidateSlots).not.toContain('c12');
  });

  it('returns the same deterministic portfolio when candidate input order changes', () => {
    const entities = [
      entity('Q1', 0, { category: 'palace_castle', year: 1400 }),
      entity('Q2', 1, { category: 'religious', year: 1600 }),
      entity('Q3', 2, { category: 'square_civic', year: 1800 }),
      entity('Q4', 3, { category: 'memorial', year: 1950 }),
      entity('Q5', 4, { category: 'museum', year: 2005 }),
    ];
    const walking = matrix(entities);
    const first = optimizeEditorialRoutePortfolioV5(entities, walking, 120);
    const second = optimizeEditorialRoutePortfolioV5([...entities].reverse(), walking, 120);

    expect(second.routes.map((route) => route.candidateSlots)).toEqual(
      first.routes.map((route) => route.candidateSlots)
    );
    expect(second.protectedCandidateSlots).toEqual(first.protectedCandidateSlots);
  });

  it('retains distinct orders of the same set instead of keeping only the shortest path', () => {
    const entities = Array.from({ length: 4 }, (_, index) => entity(`Q${index + 1}`, index));
    const result = optimizeEditorialRoutePortfolioV5(entities, matrix(entities), 120, {
      minStops: 4, maxStops: 4,
    });
    const sameBoundary = result.routes.filter((route) => (
      route.candidateSlots[0] === 'c01' && route.candidateSlots.at(-1) === 'c04'
    ));

    expect(sameBoundary.length).toBeGreaterThanOrEqual(2);
    expect(new Set(sameBoundary.map((route) => route.candidateSlots.join('>'))).size)
      .toBe(sameBoundary.length);
  });

  it('ranks a complete short core ahead of a redundant fifth stop', () => {
    const entities = [100, 90, 80, 70, 1].map((recognition, index) => entity(
      `Q${index + 1}`, index, { recognition, category: 'other', year: 1800 }
    ));
    const result = optimizeEditorialRoutePortfolioV5(entities, matrix(entities), 120, {
      minStops: 4, maxStops: 5,
    });

    expect(result.status).toBe('selected');
    expect(result.routes[0].candidateSlots).toHaveLength(4);
    expect(result.routes[0].metrics.estimatedTourMinutes).toBeLessThan(64);
    expect(result.routes[0].candidateSlots).not.toContain('c05');
  });

  it('does not add a remote stop to consume the requested duration', () => {
    const entities = Array.from({ length: 5 }, (_, index) => entity(
      index === 4 ? 'REMOTE' : `Q${index + 1}`, index,
      { recognition: index === 4 ? 100 : 50 }
    ));
    const walking = matrix(entities);
    walking.legs = walking.legs.map((row, from) => row.map((leg, to) => (
      from !== to && (from === 4 || to === 4)
        ? { meters: 2000, seconds: 25 * 60, reachable: true }
        : leg
    )));
    const result = optimizeEditorialRoutePortfolioV5(entities, walking, 120);

    expect(result.status).toBe('selected');
    expect(result.routes.every((route) => !route.entities.some((item) => item.canonicalId === 'REMOTE')))
      .toBe(true);
  });

  it('excludes evidence-incomplete candidates and never combines a visit conflict', () => {
    const entities = Array.from({ length: 6 }, (_, index) => entity(
      `Q${index + 1}`, index, { conflict: index === 0 || index === 1 ? 'same-visit' : null }
    ));
    entities[5].recognitionScore = 100;
    entities[5].readiness = {
      ready: false, observableCount: 1, contextCount: 0,
      historicalSpecificCount: 0, missing: ['context', 'historical_specific'],
    };
    const result = optimizeEditorialRoutePortfolioV5(entities, matrix(entities), 120);

    expect(result.candidates.some((candidate) => candidate.entity.canonicalId === 'Q6')).toBe(false);
    expect(result.routes.every((route) => !(
      route.entities.some((candidate) => candidate.canonicalId === 'Q1')
      && route.entities.some((candidate) => candidate.canonicalId === 'Q2')
    ))).toBe(true);
  });

  it('recommends the first fifteen-minute extension without relaxing segment limits', () => {
    const entities = Array.from({ length: 4 }, (_, index) => entity(`Q${index + 1}`, index));
    const result = optimizeEditorialRoutePortfolioV5(entities, matrix(entities, 240), 35, {
      minStops: 4, maxStops: 4, maxExtensionMinutes: 30,
    });
    expect(result.status).toBe('duration_extension_required');
    expect(result.recommendedDuration).toBe(50);

    const remote = matrix(entities, 240, 1600);
    const impossible = optimizeEditorialRoutePortfolioV5(entities, remote, 120, {
      minStops: 4, maxStops: 4, maxExtensionMinutes: 30,
    });
    expect(impossible.status).toBe('no_route');
  });
});
