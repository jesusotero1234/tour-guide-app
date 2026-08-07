import { EditorialEntityCandidateV4 } from './EditorialEntityV4';
import {
  optimizeEditorialRouteV4,
  reduceStoryCandidatesV4,
} from './EditorialRouteOptimizerV4';
import {
  EDITORIAL_STORY_MAP_SCHEMA_VERSION,
  EditorialStoryMapV4,
} from './EditorialStoryMapV4';
import {
  WALKING_MATRIX_SCHEMA_VERSION,
  WalkingMatrixSnapshotV4,
  walkingMatrixCandidateFingerprintV4,
} from './EditorialWalkingMatrixV4';

function entity(id: string, index: number, conflict: string | null = null): EditorialEntityCandidateV4 {
  return {
    canonicalId: id, siteId: `site:${id}`, sourceIds: [`node:${index}`], localName: id,
    category: 'other', coordinates: { lat: 40.4 + (index * 0.001), lng: -3.7 }, fameScore: 50,
    evidenceFacts: [], visitConflictGroup: conflict,
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 1, missing: [] },
  };
}

function storyMap(entities: EditorialEntityCandidateV4[], carrierIndexes = [0, 1, 2, 3]): EditorialStoryMapV4 {
  return {
    schemaVersion: EDITORIAL_STORY_MAP_SCHEMA_VERSION,
    centralQuestion: 'How did this city become what visitors see today?',
    beats: ['origins_urban_form', 'royal_state_power', 'public_life_ceremony', 'urban_expansion_reform'].map((code, index) => ({
      beatId: `b0${index + 1}`,
      contributionCode: code as any,
      era: ['medieval', 'early_modern', 'nineteenth_century', 'twentieth_century'][index] as any,
      focus: `Chapter ${index + 1}`,
      evidenceRefs: [`c${String(carrierIndexes[index] + 1).padStart(2, '0')}:e01`],
    })),
    candidates: Object.fromEntries(entities.map((_, index) => [`c${String(index + 1).padStart(2, '0')}`, {
      relativePriorityRank: index + 1,
      salienceLevel: index < 3 ? 4 - index : 1,
      observableStrength: 2,
      openingFit: index === carrierIndexes[0] ? 3 : 1,
      resolutionFit: index === carrierIndexes[3] ? 3 : 1,
      eraBuckets: [['medieval', 'early_modern', 'nineteenth_century', 'twentieth_century'][Math.min(index, 3)] as any],
      contributions: carrierIndexes.flatMap((carrierIndex, beatIndex) => carrierIndex === index ? [{
        beatId: `b0${beatIndex + 1}`, strength: 3 as const,
        evidenceRefs: [`c${String(index + 1).padStart(2, '0')}:e01`],
      }] : []),
    }])),
  };
}

function matrix(entities: EditorialEntityCandidateV4[], seconds = 120): WalkingMatrixSnapshotV4 {
  const sites = entities.map((item) => ({ siteId: item.siteId, lat: item.coordinates.lat, lng: item.coordinates.lng }));
  return {
    schemaVersion: WALKING_MATRIX_SCHEMA_VERSION,
    provider: { id: 'fossgis-osrm-foot', capturedAt: '2026-08-06T00:00:00.000Z' },
    candidateFingerprint: walkingMatrixCandidateFingerprintV4(sites),
    sites,
    legs: entities.map((_, from) => entities.map((__, to) => from === to
      ? { meters: 0, seconds: 0, reachable: true }
      : { meters: 150, seconds, reachable: true })),
  };
}

describe('editorial route optimizer v4', () => {
  it('keeps all beat carriers when reducing a larger assessed set', () => {
    const entities = Array.from({ length: 20 }, (_, index) => entity(`Q${index}`, index));
    const map = storyMap(entities, [12, 13, 14, 15]);
    const reduced = reduceStoryCandidatesV4(entities, map);
    expect(reduced).toHaveLength(18);
    expect([12, 13, 14, 15].every((index) => reduced.some((item) => item.entity.canonicalId === `Q${index}`))).toBe(true);
  });

  it('accepts an editorially complete four-stop route far below a 120-minute ceiling', () => {
    const entities = Array.from({ length: 6 }, (_, index) => entity(`Q${index}`, index));
    const result = optimizeEditorialRouteV4(entities, storyMap(entities), matrix(entities), 120);

    expect(result.status).toBe('selected');
    expect(result.finalists.length).toBeGreaterThanOrEqual(1);
    expect(result.finalists[0].entities).toHaveLength(4);
    expect(result.finalists[0].metrics.estimatedTourMinutes).toBeLessThan(75);
    expect(result.finalists[0].assignments).toHaveLength(4);
  });

  it('selects Plaza de la Villa because it carries origins instead of rewarding Congreso category diversity', () => {
    const entities = [
      entity('Palacio Real', 0), entity('Plaza de la Villa', 1), entity('Plaza Mayor', 2),
      entity('Puerta de Alcalá', 3), entity('Congreso', 4),
    ];
    const map = storyMap(entities, [1, 0, 2, 3]);
    const result = optimizeEditorialRouteV4(entities, map, matrix(entities), 120);

    expect(result.status).toBe('selected');
    expect(result.finalists.every((route) => route.entities.some((item) => item.canonicalId === 'Plaza de la Villa'))).toBe(true);
    expect(result.finalists.every((route) => !route.entities.some((item) => item.canonicalId === 'Congreso'))).toBe(true);
  });

  it('does not add a zero-marginal filler and respects conflicts and unreachable legs', () => {
    const entities = [
      entity('Q0', 0), entity('Q1', 1, 'same-stop'), entity('Q2', 2), entity('Q3', 3),
      entity('FILLER', 4, 'same-stop'),
    ];
    const map = storyMap(entities);
    map.candidates.c05.relativePriorityRank = 5;
    const walking = matrix(entities);
    walking.legs[2][4] = { meters: null, seconds: null, reachable: false };
    walking.legs[4][2] = { meters: null, seconds: null, reachable: false };
    const result = optimizeEditorialRouteV4(entities, map, walking, 120);

    expect(result.status).toBe('selected');
    expect(result.finalists.every((route) => !route.entities.some((item) => item.canonicalId === 'FILLER'))).toBe(true);
  });

  it('keeps two distinct high-value landmarks that deepen the same story ingredient', () => {
    const entities = Array.from({ length: 5 }, (_, index) => entity(`Q${index}`, index));
    const map = storyMap(entities);
    map.candidates.c05.salienceLevel = 3;
    map.candidates.c05.contributions = [{
      beatId: 'b04', strength: 3, evidenceRefs: ['c05:e01'],
    }];
    const result = optimizeEditorialRouteV4(entities, map, matrix(entities), 120, { maxStops: 5 });

    expect(result.finalists.some((route) => route.candidateSlots.includes('c05'))).toBe(true);
    const withDeepener = result.finalists.find((route) => route.candidateSlots.includes('c05'))!;
    expect(withDeepener.marginalContributions.c05.some((reason) => (
      reason === 'carries:b04' || reason === 'deepens:b04'
    ))).toBe(true);
  });

  it('recommends the first 15-minute extension when the core exceeds the requested ceiling', () => {
    const entities = Array.from({ length: 4 }, (_, index) => entity(`Q${index}`, index));
    const result = optimizeEditorialRouteV4(entities, storyMap(entities), matrix(entities, 240), 35, {
      minStops: 4, maxExtensionMinutes: 30,
    });

    expect(result.status).toBe('duration_extension_required');
    expect(result.recommendedDuration).toBe(50);
  });

  it('does not relax the requested segment cap while searching duration extensions', () => {
    const entities = Array.from({ length: 4 }, (_, index) => entity(`Q${index}`, index));
    const walking = matrix(entities, 240);
    walking.legs = walking.legs.map((row, from) => row.map((leg, to) => from === to ? leg : ({
      meters: 1600, seconds: 240, reachable: true,
    })));
    const result = optimizeEditorialRouteV4(entities, storyMap(entities), walking, 120, {
      minStops: 4, maxExtensionMinutes: 30,
    });

    expect(result.status).toBe('no_route');
  });
});
