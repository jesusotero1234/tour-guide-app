import { EvidenceFact } from './EditorialCandidate';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import { ROUTE_JURY_SCHEMA_VERSION_V5, RouteJuryRequestV5 } from './EditorialRouteJuryV5';
import { optimizeEditorialRoutePortfolioV5 } from './EditorialRoutePortfolioV5';
import {
  replayEditorialSelectionV5,
  runEditorialSelectionV5,
} from './EditorialSelectionWorkflowV5';
import {
  WALKING_MATRIX_SCHEMA_VERSION,
  WalkingMatrixSnapshotV4,
  walkingMatrixCandidateFingerprintV4,
} from './EditorialWalkingMatrixV4';

function entity(id: string, index: number): EditorialEntityCandidateV5 {
  const facts: EvidenceFact[] = [
    { id: `${id}:o`, source: 'osm', sourceId: id, kind: 'observable', value: 'material: stone', observable: true },
    { id: `${id}:h`, source: 'wikidata', sourceId: id, kind: 'claim', value: `inception: 18${index}0`, observable: false },
    { id: `${id}:c`, source: 'wikipedia', sourceId: id, kind: 'context', value: `Historia de ${id} en 18${index}0.`, observable: false },
  ];
  return {
    canonicalId: id, siteId: `site:${id}`, sourceIds: [id], localName: id,
    category: index % 2 === 0 ? 'square_civic' : 'religious',
    coordinates: { lat: 40.4 + index * 0.001, lng: -3.7 }, fameScore: 40,
    recognitionScore: 80 - index, firstVisitScore: 70 - index, evidenceFacts: facts,
    readiness: { ready: true, observableCount: 1, contextCount: 1, historicalSpecificCount: 2, missing: [] },
    visitConflictGroup: null,
  };
}

function fixture() {
  const entities = Array.from({ length: 6 }, (_, index) => entity(`Q${index + 1}`, index + 1));
  const sites = entities.map((candidate) => ({
    siteId: candidate.siteId, lat: candidate.coordinates.lat, lng: candidate.coordinates.lng,
  }));
  const matrix: WalkingMatrixSnapshotV4 = {
    schemaVersion: WALKING_MATRIX_SCHEMA_VERSION,
    provider: { id: 'fossgis-osrm-foot', capturedAt: '2026-08-07T00:00:00.000Z' },
    candidateFingerprint: walkingMatrixCandidateFingerprintV4(sites), sites,
    legs: entities.map((_, from) => entities.map((__, to) => from === to
      ? { meters: 0, seconds: 0, reachable: true }
      : { meters: 180, seconds: 120, reachable: true })),
  };
  const portfolio = optimizeEditorialRoutePortfolioV5(entities, matrix, 120, { maxStops: 5 });
  return { matrix, portfolio };
}

function jury(request: RouteJuryRequestV5, reverse = false) {
  const ranking = request.routes.map((route) => route.routeSlot);
  if (reverse) ranking.reverse();
  const shortlist = ranking.slice(0, 3);
  const evidence = new Map(request.candidateCatalog.map((candidate) => [
    candidate.candidateSlot, candidate.facts[0].evidenceId,
  ]));
  return {
    schemaVersion: ROUTE_JURY_SCHEMA_VERSION_V5,
    ranking, shortlist,
    assessments: Object.fromEntries(request.routes.map((route) => [route.routeSlot, {
      verdict: 'acceptable', paidTourValue: 3, firstVisitCompleteness: 3,
      progression: 3, nonRedundancy: 3, omissionRisk: 'none', reasonCodes: ['grounded'],
    }])),
    routePlans: Object.fromEntries(shortlist.map((routeSlot) => {
      const route = request.routes.find((item) => item.routeSlot === routeSlot)!;
      return [routeSlot, {
        promise: `Promise ${routeSlot}`, centralQuestion: `Question ${routeSlot}`,
        stops: route.candidateSlots.map((candidateSlot, index) => ({
          candidateSlot,
          role: index === 0 ? 'opening_anchor'
            : index === route.candidateSlots.length - 1 ? 'resolution_anchor'
              : index === 2 ? 'turning_point' : 'chapter_anchor',
          uniqueContribution: `${routeSlot}:${candidateSlot}`,
          evidenceIds: [evidence.get(candidateSlot)],
        })),
        repairSuggestions: [],
      }];
    })),
  };
}

function deepSeekResponse(toolName: string, value: unknown) {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: toolName, arguments: JSON.stringify(value),
  } }] } }] } };
}

function requestFromBody(body: Record<string, unknown>): RouteJuryRequestV5 {
  const messages = body.messages as Array<{ content: string }>;
  return JSON.parse(messages[1].content.split('\n').slice(1).join('\n')) as RouteJuryRequestV5;
}

describe('editorial selection workflow v5', () => {
  it('runs two route juries, gives final ranking authority, and replays exactly from raw responses', async () => {
    const { matrix, portfolio } = fixture();
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      const toolName = ((body.tools as any[])[0].function.name) as string;
      return deepSeekResponse(toolName, jury(request, request.phase === 'final'));
    });
    const context = { city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120 };
    const result = await runEditorialSelectionV5(
      portfolio, matrix, context,
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      { apiKey: 'secret', post }
    );

    expect(result.status).toBe('selected');
    expect(post).toHaveBeenCalledTimes(2);
    expect(result.snapshot.callBudget.actualCallCount).toBe(2);
    expect(result.winner?.route.slot).toBe(result.finalCall?.value?.ranking[0]);
    const replay = replayEditorialSelectionV5(portfolio, matrix, context, result.snapshot);
    expect(replay.status).toBe('selected');
    expect(replay.winner?.route.candidateSlots).toEqual(result.winner?.route.candidateSlots);
  });

  it('fails closed after a semantic initial-jury error and never calls the final jury', async () => {
    const { matrix, portfolio } = fixture();
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      const invalid = jury(request);
      invalid.ranking[0] = 'r99';
      return deepSeekResponse('submit_initial_route_jury_v5', invalid);
    });
    const result = await runEditorialSelectionV5(
      portfolio, matrix,
      { city: 'Madrid', theme: 'history', language: 'es', requestedDuration: 120 },
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      { apiKey: 'secret', post }
    );

    expect(result.status).toBe('curator_failed');
    expect(result.failureStage).toBe('initial_jury');
    expect(post).toHaveBeenCalledTimes(1);
    expect(result.finalCall).toBeNull();
    expect(result.winner).toBeNull();
  });
});
