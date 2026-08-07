import { EvidenceFact } from './EditorialCandidate';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  buildRouteJuryRequestV5,
  ROUTE_JURY_SCHEMA_VERSION_V5,
  RouteJuryRequestV5,
  validateRouteJuryV5,
} from './EditorialRouteJuryV5';
import {
  EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5,
  EditorialPortfolioCandidateV5,
  EditorialRoutePortfolioV5,
  EditorialRouteV5,
} from './EditorialRoutePortfolioV5';

function entity(id: string, index: number): EditorialEntityCandidateV5 {
  const evidenceFacts: EvidenceFact[] = [
    { id: `${id}:o`, source: 'osm', sourceId: `node:${index}`, kind: 'observable', value: 'material: stone', observable: true },
    { id: `${id}:h`, source: 'wikidata', sourceId: id, kind: 'claim', value: `inception: 18${index}0`, observable: false },
    { id: `${id}:c`, source: 'wikipedia', sourceId: id, kind: 'context', value: `La reforma de 18${index}0 cambió la ciudad y su vida pública.`, observable: false },
  ];
  return {
    canonicalId: id, siteId: `site:${id}`, sourceIds: [`node:${index}`], localName: `Lugar ${id}`,
    category: 'other', coordinates: { lat: 40.4 + index * 0.001, lng: -3.7 },
    fameScore: 50, recognitionScore: 70 - index, evidenceFacts, visitConflictGroup: null,
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 2, missing: [] },
  };
}

function route(slot: string, candidates: EditorialPortfolioCandidateV5[], slots: string[]): EditorialRouteV5 {
  const entities = slots.map((candidateSlot) => candidates.find((item) => item.slot === candidateSlot)!.entity);
  return {
    slot, candidateSlots: slots, entities,
    metrics: {
      walkingMeters: 900, walkingMinutes: 12, interpretationMinutes: 29,
      estimatedTourMinutes: 41, maxSegmentMeters: 350, maxSegmentMinutes: 5,
    },
    vector: { saturatedRecognition: 250, eraCount: 2, categoryCount: 1, evidenceFloor: 3, distinctiveness: 0.5 },
    protectedCandidateSlots: slots.slice(0, 2), paretoOptimal: true,
  };
}

function portfolio(): EditorialRoutePortfolioV5 {
  const candidates = Array.from({ length: 5 }, (_, index): EditorialPortfolioCandidateV5 => ({
    slot: `c0${index + 1}`, entity: entity(`Q${index + 1}`, index + 1),
    eraBuckets: ['nineteenth_century'],
  }));
  return {
    schemaVersion: EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5,
    status: 'selected', requestedDuration: 120, searchedDuration: 120, recommendedDuration: null,
    candidates, protectedCandidateSlots: ['c01', 'c02'], uncoveredProtectedCandidateSlots: [],
    routes: [
      route('r01', candidates, ['c01', 'c02', 'c03', 'c04']),
      route('r02', candidates, ['c01', 'c03', 'c05', 'c04']),
      route('r03', candidates, ['c02', 'c03', 'c04', 'c05']),
    ],
    diagnostics: { exploredStateCount: 20, retainedStateCount: 10, truncatedDepths: [] },
    reason: null,
  };
}

function validJury(request: RouteJuryRequestV5): any {
  const shortlist = request.routes.slice(0, 3).map((routeItem) => routeItem.routeSlot);
  const facts = new Map(request.candidateCatalog.map((candidate) => [
    candidate.candidateSlot, candidate.facts[0].evidenceId,
  ]));
  return {
    schemaVersion: ROUTE_JURY_SCHEMA_VERSION_V5,
    ranking: request.routes.map((routeItem) => routeItem.routeSlot),
    shortlist,
    assessments: Object.fromEntries(request.routes.map((routeItem) => [routeItem.routeSlot, {
      verdict: 'strong', paidTourValue: 4, firstVisitCompleteness: 4,
      progression: 4, nonRedundancy: 4, omissionRisk: 'none', reasonCodes: ['coherent_arc'],
    }])),
    routePlans: Object.fromEntries(request.routes.slice(0, 3).map((routeItem) => [routeItem.routeSlot, {
      promise: `Promesa ${routeItem.routeSlot}`,
      centralQuestion: `Pregunta ${routeItem.routeSlot}`,
      stops: routeItem.candidateSlots.map((candidateSlot, index) => ({
        candidateSlot,
        role: index === 0 ? 'opening_anchor'
          : index === routeItem.candidateSlots.length - 1 ? 'resolution_anchor'
            : index === 2 ? 'turning_point' : 'chapter_anchor',
        uniqueContribution: `Contribución ${candidateSlot} en ${routeItem.routeSlot}`,
        evidenceIds: [facts.get(candidateSlot)],
      })),
      repairSuggestions: [],
    }])),
  };
}

describe('route-conditioned editorial jury v5', () => {
  const input = portfolio();
  const request = buildRouteJuryRequestV5(input, {
    phase: 'initial', city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120,
  });

  it('sends complete routes and grounded catalog facts without deterministic decision scores', () => {
    expect(request.routes).toHaveLength(3);
    expect(request.candidateCatalog).toHaveLength(5);
    expect(request.candidateCatalog.every((candidate) => candidate.facts.length <= 4)).toBe(true);
    const serialized = JSON.stringify(request);
    for (const forbidden of ['oracle', 'greedy', 'paretoOptimal', 'protectedCandidate', 'saturatedRecognition']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('accepts a complete grounded response', () => {
    const result = validateRouteJuryV5(validJury(request), request);
    expect(result.shortlist).toEqual(['r01', 'r02', 'r03']);
    expect(result.routePlans.r01.stops.map((stop) => stop.candidateSlot))
      .toEqual(request.routes[0].candidateSlots);
  });

  it('rejects incomplete responses and invented route IDs', () => {
    const incomplete = validJury(request);
    delete incomplete.assessments.r03;
    expect(() => validateRouteJuryV5(incomplete, request)).toThrow('assessments');

    const invented = validJury(request);
    invented.ranking[0] = 'r99';
    expect(() => validateRouteJuryV5(invented, request)).toThrow('ranking');
  });

  it('rejects invented candidates, foreign evidence, and a plan that changes route order', () => {
    const inventedCandidate = validJury(request);
    inventedCandidate.routePlans.r01.repairSuggestions = [{
      removeSlot: 'c02', addSlot: 'c99', insertAfterSlot: 'c01',
      reason: 'Swap', evidenceIds: ['Q2:o'],
    }];
    expect(() => validateRouteJuryV5(inventedCandidate, request)).toThrow('addSlot');

    const foreignEvidence = validJury(request);
    foreignEvidence.routePlans.r01.stops[0].evidenceIds = ['Q2:o'];
    expect(() => validateRouteJuryV5(foreignEvidence, request)).toThrow('evidenceIds');

    const reordered = validJury(request);
    [reordered.routePlans.r01.stops[1], reordered.routePlans.r01.stops[2]] = [
      reordered.routePlans.r01.stops[2], reordered.routePlans.r01.stops[1],
    ];
    expect(() => validateRouteJuryV5(reordered, request)).toThrow('fixed route order');
  });

  it('requires three non-rejected shortlisted routes with opening and resolution boundaries', () => {
    const rejected = validJury(request);
    rejected.assessments.r03.verdict = 'reject';
    expect(() => validateRouteJuryV5(rejected, request)).toThrow('non-rejected');

    const wrongBoundary = validJury(request);
    wrongBoundary.routePlans.r01.stops[0].role = 'chapter_anchor';
    expect(() => validateRouteJuryV5(wrongBoundary, request)).toThrow('opening_anchor');
  });
});
