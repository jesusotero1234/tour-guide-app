import { EvidenceFact } from './EditorialCandidate';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import { RouteJuryV5, ROUTE_JURY_SCHEMA_VERSION_V5 } from './EditorialRouteJuryV5';
import {
  buildEditorialRepairPortfolioV5,
  selectEditorialRouteWinnerV5,
} from './EditorialRouteRepairV5';
import {
  EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5,
  EditorialPortfolioCandidateV5,
  EditorialRoutePortfolioV5,
  EditorialRouteV5,
  evaluateEditorialRouteOrderV5,
} from './EditorialRoutePortfolioV5';
import {
  WALKING_MATRIX_SCHEMA_VERSION,
  WalkingMatrixSnapshotV4,
  walkingMatrixCandidateFingerprintV4,
} from './EditorialWalkingMatrixV4';

function entity(id: string, index: number, conflict: string | null = null): EditorialEntityCandidateV5 {
  const facts: EvidenceFact[] = [
    { id: `${id}:o`, source: 'osm', sourceId: id, kind: 'observable', value: 'material: stone', observable: true },
    { id: `${id}:h`, source: 'wikidata', sourceId: id, kind: 'claim', value: `inception: 18${index}0`, observable: false },
    { id: `${id}:c`, source: 'wikipedia', sourceId: id, kind: 'context', value: `Historia propia de ${id} en 18${index}0.`, observable: false },
  ];
  return {
    canonicalId: id, siteId: `site:${id}`, sourceIds: [`node:${index}`], localName: id,
    category: 'other', coordinates: { lat: 40.4 + index * 0.001, lng: -3.7 },
    fameScore: 40, recognitionScore: 80 - index, evidenceFacts: facts,
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 2, missing: [] },
    visitConflictGroup: conflict,
  };
}

function fixture() {
  const candidates = Array.from({ length: 6 }, (_, index): EditorialPortfolioCandidateV5 => ({
    slot: `c0${index + 1}`, entity: entity(`Q${index + 1}`, index + 1), eraBuckets: ['nineteenth_century'],
  }));
  const sites = candidates.map((candidate) => ({
    siteId: candidate.entity.siteId,
    lat: candidate.entity.coordinates.lat,
    lng: candidate.entity.coordinates.lng,
  }));
  const matrix: WalkingMatrixSnapshotV4 = {
    schemaVersion: WALKING_MATRIX_SCHEMA_VERSION,
    provider: { id: 'fossgis-osrm-foot', capturedAt: '2026-08-07T00:00:00.000Z' },
    candidateFingerprint: walkingMatrixCandidateFingerprintV4(sites), sites,
    legs: candidates.map((_, from) => candidates.map((__, to) => from === to
      ? { meters: 0, seconds: 0, reachable: true }
      : { meters: 200, seconds: 150, reachable: true })),
  };
  const makeRoute = (slot: string, candidateSlots: string[]): EditorialRouteV5 => (
    evaluateEditorialRouteOrderV5(slot, candidateSlots, candidates, matrix, 120, 120, ['c05', 'c06'])!
  );
  const portfolio: EditorialRoutePortfolioV5 = {
    schemaVersion: EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5,
    status: 'selected', requestedDuration: 120, searchedDuration: 120, recommendedDuration: null,
    candidates, protectedCandidateSlots: ['c05', 'c06'], uncoveredProtectedCandidateSlots: [],
    routes: [
      makeRoute('r01', ['c01', 'c02', 'c03', 'c04', 'c06']),
      makeRoute('r02', ['c01', 'c03', 'c05', 'c04', 'c06']),
      makeRoute('r03', ['c02', 'c03', 'c04', 'c06']),
    ],
    diagnostics: { exploredStateCount: 30, retainedStateCount: 20, truncatedDepths: [] },
    reason: null,
  };
  const plan = (route: EditorialRouteV5, suggestions: any[] = []) => ({
    promise: `Promise ${route.slot}`, centralQuestion: `Question ${route.slot}`,
    stops: route.candidateSlots.map((candidateSlot, index) => ({
      candidateSlot,
      role: index === 0 ? 'opening_anchor' as const
        : index === route.candidateSlots.length - 1 ? 'resolution_anchor' as const
          : 'chapter_anchor' as const,
      uniqueContribution: `${route.slot}:${candidateSlot}`,
      evidenceIds: [`Q${Number(candidateSlot.slice(1))}:o`],
    })),
    repairSuggestions: suggestions,
  });
  const jury: RouteJuryV5 = {
    schemaVersion: ROUTE_JURY_SCHEMA_VERSION_V5,
    ranking: ['r01', 'r02', 'r03'], shortlist: ['r01', 'r02', 'r03'],
    assessments: Object.fromEntries(portfolio.routes.map((route) => [route.slot, {
      verdict: 'strong', paidTourValue: 4, firstVisitCompleteness: 4,
      progression: 4, nonRedundancy: 4, omissionRisk: 'none', reasonCodes: ['grounded'],
    }])),
    routePlans: {
      r01: plan(portfolio.routes[0], [{
        removeSlot: 'c02', addSlot: 'c05', insertAfterSlot: 'c01',
        reason: 'Adds a missing landmark', evidenceIds: ['Q5:o'],
      }]),
      r02: plan(portfolio.routes[1], [{
        removeSlot: 'c03', addSlot: null, insertAfterSlot: null,
        reason: 'Remove repetition', evidenceIds: ['Q3:o'],
      }]),
      r03: plan(portfolio.routes[2]),
    },
  };
  return { candidates, matrix, portfolio, jury };
}

describe('deterministic editorial route repair v5', () => {
  it('keeps the top two originals, applies grounded suggestions, and revalidates every alternative', () => {
    const { candidates, matrix, portfolio, jury } = fixture();
    const repaired = buildEditorialRepairPortfolioV5(portfolio, jury, matrix, 120);

    expect(repaired.portfolio.routes.length).toBeGreaterThanOrEqual(3);
    expect(repaired.portfolio.routes.length).toBeLessThanOrEqual(6);
    expect(repaired.diagnostics.operationCounts.original).toBeGreaterThanOrEqual(2);
    expect(repaired.diagnostics.operationCounts.jury_suggestion).toBeGreaterThanOrEqual(1);
    expect(Object.values(repaired.provenance).some((item) => item.operation === 'delete')).toBe(true);
    expect(Object.values(repaired.provenance).some((item) => item.operation === 'reverse')).toBe(true);
    expect(repaired.portfolio.routes.some((route) => (
      route.candidateSlots.includes('c05') && !route.candidateSlots.includes('c02')
    ))).toBe(true);
    for (const route of repaired.portfolio.routes) {
      expect(evaluateEditorialRouteOrderV5(
        route.slot, route.candidateSlots, candidates, matrix, 120, 120,
        portfolio.protectedCandidateSlots
      )).not.toBeNull();
    }
  });

  it('discards a suggested remote swap instead of trusting the jury geometry', () => {
    const { matrix, portfolio, jury } = fixture();
    matrix.legs = matrix.legs.map((row, from) => row.map((leg, to) => (
      from !== to && (from === 4 || to === 4)
        ? { meters: 2000, seconds: 1500, reachable: true }
        : leg
    )));
    const repaired = buildEditorialRepairPortfolioV5(portfolio, jury, matrix, 120);

    expect(repaired.diagnostics.discarded.some((item) => (
      item.operation === 'jury_suggestion' && item.reason === 'physical_constraints'
    ))).toBe(true);
    expect(repaired.portfolio.routes.every((route) => !(
      route.candidateSlots.includes('c05') && !route.candidateSlots.includes('c02')
    ))).toBe(true);
  });

  it('obeys final jury order and skips a route that fails deterministic revalidation', () => {
    const { matrix, portfolio, jury } = fixture();
    const repaired = buildEditorialRepairPortfolioV5(portfolio, jury, matrix, 120);
    const [first, second, third] = repaired.portfolio.routes;
    const finalJury: RouteJuryV5 = {
      ...jury,
      ranking: repaired.portfolio.routes.map((route) => route.slot).reverse(),
      shortlist: [third.slot, second.slot, first.slot],
      assessments: Object.fromEntries(repaired.portfolio.routes.map((route) => [route.slot, {
        verdict: 'acceptable', paidTourValue: 3, firstVisitCompleteness: 3,
        progression: 3, nonRedundancy: 3, omissionRisk: 'none', reasonCodes: ['final'],
      }])),
      routePlans: Object.fromEntries([third, second, first].map((route) => [route.slot, {
        promise: route.slot, centralQuestion: route.slot,
        stops: route.candidateSlots.map((candidateSlot, index) => ({
          candidateSlot,
          role: index === 0 ? 'opening_anchor' : index === route.candidateSlots.length - 1
            ? 'resolution_anchor' : 'chapter_anchor',
          uniqueContribution: `${route.slot}:${candidateSlot}`,
          evidenceIds: [`Q${Number(candidateSlot.slice(1))}:o`],
        })),
        repairSuggestions: [],
      }])),
    } as RouteJuryV5;

    expect(selectEditorialRouteWinnerV5(repaired.portfolio, finalJury, matrix)?.route.slot)
      .toBe(third.slot);
    third.candidateSlots = [third.candidateSlots[0], third.candidateSlots[0], ...third.candidateSlots.slice(2)];
    expect(selectEditorialRouteWinnerV5(repaired.portfolio, finalJury, matrix)?.route.slot)
      .toBe(second.slot);
  });
});
