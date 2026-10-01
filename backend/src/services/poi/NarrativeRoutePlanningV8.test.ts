import { WalkingRouteService, WalkingRouteUnavailableError } from '../WalkingRouteService';
import { CanonicalTourCoreV6 } from './EditorialCoreResolverV6';
import { EssentialRouteCandidateV8 } from './EssentialRouteSelectionV8';
import { planNarrativeRouteWithRecoveryV8 as plan, RouteScopeReviewInputV8, RouteScopeVoteV8,
  validateRoutePlanningDecisionV8 } from './NarrativeRoutePlanningV8';
import { createCheckpoint, projectCheckpointStateForResumeV8 } from './NarrativeUserCanaryCheckpointV8';

const candidates: EssentialRouteCandidateV8[] = Array.from({ length: 8 }, (_, i) => ({
  wikidataId: `Q${i + 1}`, name: `Place ${i + 1}`, category: i % 2 ? 'historic' : 'church',
  coordinates: { lat: i === 1 ? 2 : i * 0.001, lng: 0 }, fameScore: 90 - i,
  importanceScore: 80 - i, landmarkTier: 'major',
}));
const core: CanonicalTourCoreV6 = {
  schemaVersion: 'canonical-tour-core-v1', cityKey: 'Test', theme: 'history', durationMinutes: 120,
  sourceFingerprint: 'source', status: 'approved', requirements: [
    { canonicalId: 'Q1', reasonCode: 'city_defining', omissionReason: 'City anchor', supportIds: ['Q1:history'], provenance: 'stable_model_consensus' },
    { canonicalId: 'Q2', reasonCode: 'first_visit_expectation', omissionReason: 'Remote chapter', supportIds: ['Q2:history'], provenance: 'stable_model_consensus' },
  ], audit: { provider: 'fake', model: 'fake', promptFingerprint: 'prompt', responseFingerprints: [], candidatePermutationSeeds: [], disputedCanonicalIds: [] },
};
const input = () => ({ candidates: structuredClone(candidates), core: structuredClone(core),
  requiredIds: ['Q1', 'Q2'], durationMinutes: 120, minStops: 5, preferredStops: 5, theme: 'history' });
function service() {
  return { getRoute: jest.fn<ReturnType<WalkingRouteService['getRoute']>, Parameters<WalkingRouteService['getRoute']>>(
    async stops => ({ provider: 'fossgis-osrm-foot', distanceMeters: 1000,
      durationSeconds: stops.some(s => s.latitude > 1) ? 6000 : 1200,
      geometry: { type: 'LineString', coordinates: stops.map(s => [s.longitude, s.latitude]) } })) };
}
function approve({ core: original, proposals }: RouteScopeReviewInputV8): Promise<RouteScopeVoteV8[]> {
  const proposal = proposals[0], ids = proposal.plan.geometry.stops.map(s => s.stopId);
  const vote = { proposalId: proposal.id, reason: 'Coherent compact history scope',
    omissions: original.requirements.filter(r => !ids.includes(r.canonicalId)).map(r => ({
      canonicalId: r.canonicalId, reason: 'Remote chapter outside this walking scope', supportIds: r.supportIds,
    })) };
  return Promise.resolve([vote, structuredClone(vote), structuredClone(vote)]);
}
test('feasible route bypasses scope review and preserves normalized order', async () => {
  const data = input(); data.candidates = data.candidates.filter(c => c.wikidataId !== 'Q2');
  data.requiredIds = ['Q1']; data.core.requirements.splice(1);
  const review = jest.fn(approve), result = await plan(data, service(), review);
  expect(result.decision).toBeNull(); expect(review).not.toHaveBeenCalled();
  expect(result.plan.selection.route.map(c => c.wikidataId)).toEqual(result.plan.geometry.stops.map(s => s.stopId));
});
test('overlong model core recovers with evidence and separate coverage; cache is directed', async () => {
  const data = input(), original = structuredClone(data), walking = service();
  const review = jest.fn(approve), result = await plan(data, walking, review);
  expect(result.plan.geometry.guidedDurationMinutes).toBe(115);
  expect(result.decision?.protectedIds).toEqual(['Q1']);
  expect(result.decision?.omissions.map(o => o.canonicalId)).toEqual(['Q2']);
  expect(result.decision?.cityCoverageRatio).toBe(0.5); expect(result.decision?.scopeCoverageRatio).toBe(1);
  expect(review).toHaveBeenCalledTimes(1); expect(data).toEqual(original);
  expect(validateRoutePlanningDecisionV8(result.decision, result.plan.geometry.stops.map(s => s.stopId))).toEqual(result.decision);
  const keys = walking.getRoute.mock.calls.map(([stops]) => JSON.stringify(stops));
  expect(new Set(keys).size).toBe(keys.length);
  expect(result.plan.selection.route.map(c => c.wikidataId)).toEqual(result.decision?.selectedStopIds);
  const tampered = structuredClone(result.decision!); tampered.cityCoverageRatio = 1;
  expect(() => validateRoutePlanningDecisionV8(tampered)).toThrow('coverage');
  expect(() => validateRoutePlanningDecisionV8(result.decision, ['Q1'])).toThrow('route changed');
});
test.each(['pinned', 'city_defining', 'reviewed_override'])('protected remote identity cannot disappear: %s', async kind => {
  const data = input();
  if (kind === 'city_defining') data.core.requirements[1].reasonCode = 'city_defining';
  if (kind === 'reviewed_override') data.core.requirements[1].provenance = 'reviewed_override';
  const review = jest.fn(approve);
  await expect(plan({ ...data, pinnedIds: kind === 'pinned' ? ['Q2'] : [] }, service(), review)).rejects.toThrow('protected_core_infeasible');
  expect(review).not.toHaveBeenCalled();
});
test.each(['disagreement', 'evidence'])('rejects invalid review %s', async kind => {
  await expect(plan(input(), service(), async request => {
    const votes = await approve(request);
    if (kind === 'disagreement') votes[2].proposalId = null;
    else votes[0].omissions[0].supportIds = ['Q1:history'];
    return votes;
  })).rejects.toThrow(kind === 'disagreement' ? 'disagreement' : 'evidence');
});
test('provider outage is not proof of excessive distance', async () => {
  const walking = service(); walking.getRoute.mockRejectedValue(new WalkingRouteUnavailableError());
  await expect(plan(input(), walking, approve)).rejects.toThrow('walking_provider_unavailable');
});
test('invalid identities, coordinates and cancellation fail before review', async () => {
  const data = input(); data.candidates.push(data.candidates[0]);
  await expect(plan(data, service(), approve)).rejects.toThrow('unique QIDs');
  await expect(plan({ ...input(), candidates: candidates.slice(2) }, service(), approve)).rejects.toThrow('required_identity_missing');
  const invalid = input(); invalid.candidates[0].coordinates!.lat = NaN;
  await expect(plan(invalid, service(), approve)).rejects.toThrow('coordinates');
  const controller = new AbortController(); controller.abort(new Error('cancelled'));
  await expect(plan(input(), service(), approve, controller.signal)).rejects.toThrow('cancelled');
});
test('permutation of candidates produces the same scoped selection', async () => {
  const first = await plan(input(), service(), approve);
  const second = await plan({ ...input(), candidates: [...candidates].reverse() }, service(), approve);
  expect(first.decision).toEqual(second.decision);
});
test.each([108, 132, 133, 138, 139])('scoped policy checks requested margin at %i minutes', async minutes => {
  const walking = service();
  walking.getRoute.mockImplementation(async stops => ({ provider: 'fossgis-osrm-foot',
    durationSeconds: (minutes - 49) * 10, distanceMeters: 1000,
    geometry: { type: 'LineString', coordinates: stops.map(s => [s.longitude, s.latitude]) } }));
  const result = plan({ ...input(), minStops: 7, preferredStops: 7 }, walking, approve);
  if (minutes <= 132) expect((await result).plan.geometry.guidedDurationMinutes).toBe(minutes);
  else await expect(result).rejects.toThrow('route_review_required');
});
test('additional routing stops at deadline and never requests an editorial approval for partial routes', async () => {
  let clock = 0;
  const review = jest.fn(approve);
  const data = input();
  data.candidates.push(...Array.from({ length: 5 }, (_, i) => ({ ...candidates[0], wikidataId: `Q${20 + i}`,
    fameScore: 500, coordinates: { lat: 3 + i * 0.001, lng: 0 } })));
  await expect(plan({ ...data, now: () => clock += 120_000 }, service(), review)).rejects.toThrow('routing_budget_exhausted');
  expect(review).not.toHaveBeenCalled();
});
test('checkpoint preserves scoped decision for research and drops it when replanning', async () => {
  const result = await plan(input(), service(), approve), decision = result.decision!;
  const checkpoint = createCheckpoint({ schemaVersion: 'narrative-user-canary-checkpoint-v8',
    completedPhase: 'route', run: { runId: 'test', createdAt: '2026-09-20', city: 'Test', cityQid: 'Q99',
      language: 'es', profile: 'test', requestFingerprint: 'request', priorSpendUsd: 0.01, routePolicy: decision.policy },
    core: { requiredIds: decision.requiredIds, coverageRatio: 1, disagreement: false },
    candidates: {},
    route: { stops: decision.selectedStopIds.map(stopId => ({ stopId })) },
    routePlanning: JSON.parse(JSON.stringify(decision)),
    planningInputs: { coreArtifactPath: '/saved/core.json', coreArtifactSha256: 'sha256' },
  });
  expect(projectCheckpointStateForResumeV8(checkpoint, 'research').routePlanning).toEqual(decision);
  const reroute = projectCheckpointStateForResumeV8(checkpoint, 'route');
  expect(reroute.routePlanning).toBeUndefined(); expect(reroute.planningInputs).toEqual(checkpoint.planningInputs);
  const { fingerprint, ...payload } = checkpoint;
  expect(() => createCheckpoint({ ...payload, core: { requiredIds: ['Q1', 'Q2'], coverageRatio: 1, disagreement: false } })).toThrow('planning core mismatch');
});
