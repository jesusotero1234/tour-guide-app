import { CandidateSignalsV3, CANDIDATE_SIGNALS_SCHEMA_VERSION, ROUTE_JURY_SCHEMA_VERSION } from './EditorialSelectionV3';
import {
  buildDeterministicEditorialArcV3,
  optimizeEditorialRoutePortfolioV3,
  selectRouteJuryWinnerV3,
} from './EditorialRoutePortfolioV3';
import { EditorialSiteCandidateV3 } from './EditorialSiteV3';

function site(id: string, lat: number, lng: number, category = 'square_civic'): EditorialSiteCandidateV3 {
  return {
    canonicalId: id, clusterId: id, memberCanonicalIds: [id], siteId: `site:${id}`, entityIds: [id], entities: [],
    localName: id, category: category as any, coordinates: { lat, lng }, fameScore: 50, themeScore: 50,
    firstVisitScore: 50, evidenceScore: 80, observableScore: 50, tier: 'strong', eligibleRoles: ['modern-city'],
    evidenceFacts: [], readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 1, missing: [] },
  };
}

function signals(values: Array<{ visit: number; omission: number }>): CandidateSignalsV3 {
  return {
    schemaVersion: CANDIDATE_SIGNALS_SCHEMA_VERSION,
    signals: Object.fromEntries(values.map((value, index) => [`c${String(index).padStart(2, '0')}`, {
      visitValueScore: value.visit, omissionCost: value.omission, primaryEvidence: 'e00',
    }])),
  };
}

describe('exact editorial route portfolio v3', () => {
  it('accepts a short, editorially complete route without filling 75% of the request', () => {
    const core = Array.from({ length: 5 }, (_, index) => site(`Q${index}`, 40.416 + (index * 0.001), -3.704));
    const filler = Array.from({ length: 3 }, (_, index) => site(`F${index}`, 40.4165 + (index * 0.001), -3.703));
    const sites = [...core, ...filler];
    const result = optimizeEditorialRoutePortfolioV3(sites, signals([
      ...core.map(() => ({ visit: 90, omission: 90 })),
      ...filler.map(() => ({ visit: 0, omission: 0 })),
    ]), 120);

    expect(result.status).toBe('selected');
    expect(result.maximumFeasiblePriorities).toBe(5);
    expect(result.finalists[0].metrics.estimatedTourMinutes).toBeLessThan(90);
    expect(result.finalists[0].sites).toHaveLength(5);
    expect(result.finalists[0].sites.every((item) => !item.canonicalId.startsWith('F'))).toBe(true);
  });

  it('keeps the feasible seven-stop Madrid backbone under the 120-minute ceiling', () => {
    const madrid = [
      site('Q171517', 40.417955, -3.714312, 'palace_castle'),
      site('Q849711', 40.415579, -3.714558, 'religious'),
      site('Q2711992', 40.4152, -3.7106),
      site('Q1123493', 40.41536, -3.7074),
      site('Q427163', 40.41694, -3.70355),
      site('Q1537446', 40.41917, -3.69306),
      site('Q1140634', 40.41999, -3.68874, 'monument'),
    ];
    const result = optimizeEditorialRoutePortfolioV3(
      madrid,
      signals(madrid.map(() => ({ visit: 90, omission: 90 }))),
      120
    );

    expect(result.status).toBe('selected');
    expect(result.maximumFeasiblePriorities).toBe(7);
    expect(result.finalists[0].sites).toHaveLength(7);
    expect(result.finalists[0].metrics.estimatedTourMinutes).toBeLessThanOrEqual(120);
    expect(result.finalists[0].metrics.overMaxSegments).toBe(0);
  });

  it('does not return no_route or detour to an unreachable high-priority stop', () => {
    const locals = Array.from({ length: 6 }, (_, index) => site(`L${index}`, 40.416 + (index * 0.001), -3.704));
    const remote = site('REMOTE', 40.5, -3.5);
    const result = optimizeEditorialRoutePortfolioV3(
      [...locals, remote],
      signals([...locals.map(() => ({ visit: 80, omission: 80 })), { visit: 100, omission: 100 }]),
      120
    );

    expect(result.status).toBe('selected');
    expect(result.finalists.every((route) => !route.sites.some((item) => item.canonicalId === 'REMOTE'))).toBe(true);
    expect(result.finalists.every((route) => route.metrics.overMaxSegments === 0)).toBe(true);
  });

  it('selects the jury winner by frozen weights and creates a covered deterministic arc', () => {
    const sites = Array.from({ length: 7 }, (_, index) => site(`Q${index}`, 40.416 + (index * 0.001), -3.704,
      index === 1 ? 'religious' : index === 2 ? 'palace_castle' : 'square_civic'));
    const portfolio = optimizeEditorialRoutePortfolioV3(sites, signals(sites.map(() => ({ visit: 80, omission: 80 }))), 120);
    expect(portfolio.finalists).toHaveLength(5);
    const jury = {
      schemaVersion: ROUTE_JURY_SCHEMA_VERSION,
      scores: Object.fromEntries(portfolio.finalists.map((route, index) => [route.slot, {
        paidTourScore: index === 3 ? 100 : 50,
        historicalArcScore: index === 3 ? 100 : 50,
        omissionSafetyScore: index === 3 ? 100 : 50,
        distinctivenessScore: index === 3 ? 100 : 50,
      }])),
    };
    const winner = selectRouteJuryWinnerV3(portfolio, jury);
    const arc = buildDeterministicEditorialArcV3(winner.winner);

    expect(winner.winner.slot).toBe('r03');
    expect(arc.arc[0]).toBe('opening');
    expect(arc.arc.at(-1)).toBe('resolution');
    const assignedRoles = new Set(arc.assignments.map((item) => item.role));
    expect(arc.arc.every((role) => assignedRoles.has(role))).toBe(true);
  });
});
