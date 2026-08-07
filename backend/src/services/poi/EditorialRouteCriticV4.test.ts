import { EditorialEntityCandidateV4 } from './EditorialEntityV4';
import { EditorialRoutePortfolioV4 } from './EditorialRouteOptimizerV4';
import {
  buildRouteCriticRequestV4,
  ROUTE_CRITIC_SCHEMA_VERSION,
  selectRouteCriticWinnerV4,
  validateRouteCriticV4,
} from './EditorialRouteCriticV4';
import { EDITORIAL_STORY_MAP_SCHEMA_VERSION, EditorialStoryMapV4, StoryMapRequestV4 } from './EditorialStoryMapV4';

function entity(id: string): EditorialEntityCandidateV4 {
  return {
    canonicalId: id, siteId: `site:${id}`, sourceIds: [id], localName: id, category: 'other',
    coordinates: { lat: 1, lng: 1 }, fameScore: 50, evidenceFacts: [], visitConflictGroup: null,
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 1, missing: [] },
  };
}

const storyRequest: StoryMapRequestV4 = {
  city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
  candidates: ['c01', 'c02', 'c03', 'c04', 'c05'].map((slot) => ({
    slot, localName: slot, category: 'other', fameScore: 50,
    facts: [{ slot: 'e01', kind: 'context', value: `Evidence for ${slot}` }],
  })),
};

const storyMap: EditorialStoryMapV4 = {
  schemaVersion: EDITORIAL_STORY_MAP_SCHEMA_VERSION,
  centralQuestion: 'How did Madrid redefine public power?',
  beats: ['b01', 'b02', 'b03', 'b04'].map((beatId, index) => ({
    beatId, contributionCode: 'civic_government', era: 'cross_era', focus: `Focus ${index + 1}`,
    evidenceRefs: [`c0${index + 1}:e01`],
  })),
  candidates: Object.fromEntries(storyRequest.candidates.map((candidate, index) => [candidate.slot, {
    relativePriorityRank: index + 1, salienceLevel: 3, observableStrength: 2,
    openingFit: index === 0 ? 3 : 1, resolutionFit: index === 3 ? 3 : 1,
    eraBuckets: ['cross_era'],
    contributions: index < 4 ? [{ beatId: `b0${index + 1}`, strength: 3, evidenceRefs: [`${candidate.slot}:e01`] }] : [],
  }])),
};

function route(slot: string, candidateSlots: string[]) {
  return {
    slot, candidateSlots, entities: candidateSlots.map((item) => entity(item)),
    assignments: candidateSlots.slice(0, 4).map((candidateSlot, index) => ({ beatId: `b0${index + 1}`, candidateSlot, strength: 3 })),
    marginalContributions: Object.fromEntries(candidateSlots.map((item) => [item, ['carries']])),
    metrics: { walkingMeters: 1000, walkingMinutes: 15, dwellMinutes: 35, estimatedTourMinutes: 50, maxSegmentMeters: 400, maxSegmentMinutes: 6 },
    scores: { beatCoverage: 4, beatStrength: 12, priorityCoverage: 20, curatorPriorityCoverage: 10, recognitionCoverage: 10, salienceTotal: 12, observableFloor: 2, observableAverage: 2, eraCount: 1, boundaryFit: 6 },
    paretoOptimal: true as const,
  };
}

const portfolio: EditorialRoutePortfolioV4 = {
  status: 'selected', finalists: [route('r01', ['c01', 'c02', 'c03', 'c04']), route('r02', ['c01', 'c02', 'c03', 'c04', 'c05'])],
  requestedDuration: 120, searchedDuration: 120, recommendedDuration: null, exploredStateCount: 10, reason: null,
  reducedCandidates: storyRequest.candidates.map((candidate, index) => ({
    slot: candidate.slot, entity: entity(candidate.slot), assessment: storyMap.candidates[candidate.slot],
  })),
};

describe('grounded route critic v4', () => {
  const request = buildRouteCriticRequestV4(portfolio, storyMap, storyRequest, {
    city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
  });

  function criticValue() {
    return {
      schemaVersion: ROUTE_CRITIC_SCHEMA_VERSION,
      ranking: ['r01', 'r02'],
      assessments: Object.fromEntries(['r01', 'r02'].map((slot) => [slot, {
        coherence: 'strong', avoidableRedundancy: slot === 'r02', omissionRisk: 'none',
        reasonCodes: ['clear_progression'], evidenceRefs: ['c01:e01'],
      }])),
    };
  }

  it('shows the critic evidence, marginal reasons and high-priority omissions', () => {
    expect(request.routes[0].stops[0].narrativeContributions[0].evidence[0].value).toBe('Evidence for c01');
    expect(request.routes[0].stops[0].marginalReasons).toEqual(['carries']);
    expect(request.routes[0].omittedHighPriority[0].candidateSlot).toBe('c05');
    expect(request.routes[0].coveredBeatIds).toEqual(['b01', 'b02', 'b03', 'b04']);
  });

  it('rejects duplicated routes and invented evidence references', () => {
    const duplicate = criticValue();
    duplicate.ranking = ['r01', 'r01'];
    expect(() => validateRouteCriticV4(duplicate, request)).toThrow('duplicates');
    const invented = criticValue();
    invented.assessments.r01.evidenceRefs = ['c99:e99'];
    expect(() => validateRouteCriticV4(invented, request)).toThrow('invalid');
  });

  it('can select only the top-ranked Pareto finalist', () => {
    const critic = validateRouteCriticV4(criticValue(), request);
    expect(selectRouteCriticWinnerV4(portfolio, critic).slot).toBe('r01');
    expect(() => selectRouteCriticWinnerV4({ ...portfolio, finalists: portfolio.finalists.slice(0, 1) }, null)).not.toThrow();
  });

  it('will not publish a finalist the critic itself marks weak or redundant', () => {
    const raw = criticValue();
    raw.assessments.r01.coherence = 'weak';
    raw.assessments.r02.avoidableRedundancy = true;
    const critic = validateRouteCriticV4(raw, request);

    expect(() => selectRouteCriticWinnerV4(portfolio, critic)).toThrow(
      'no coherent, non-redundant finalist'
    );
  });

  it('lets the critic veto routes but not override higher paid value among accepted routes', () => {
    const raw = criticValue();
    raw.ranking = ['r02', 'r01'];
    raw.assessments.r02.avoidableRedundancy = false;
    const critic = validateRouteCriticV4(raw, request);
    const higherValuePortfolio = {
      ...portfolio,
      finalists: portfolio.finalists.map((item, index) => ({
        ...item,
        scores: { ...item.scores, priorityCoverage: index === 0 ? 11 : 10 },
      })),
    };

    expect(selectRouteCriticWinnerV4(higherValuePortfolio, critic).slot).toBe('r01');
  });
});
