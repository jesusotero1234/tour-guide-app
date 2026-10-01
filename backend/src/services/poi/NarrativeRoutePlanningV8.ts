import { WalkingRouteService, WalkingRouteUnavailableError } from '../WalkingRouteService';
import { CanonicalTourCoreV6 } from './EditorialCoreResolverV6';
import { EssentialRouteCandidateV8 } from './EssentialRouteSelectionV8';
import { NarrativeWalkingPlanV8, planNarrativeWalkingRouteV8 } from './NarrativeWalkingPlanV8';
import { allocateNarrationTargetsV8 } from './NarrativeDurationTargetsV8';
import { editorialDistanceMetersV5 } from './EditorialEvidenceV5';

export const ROUTE_SCOPE_POLICY_V8 = 'walking-v8-scoped-1' as const;
export interface RouteScopeVoteV8 {
  proposalId: string | null; reason: string;
  omissions: Array<{ canonicalId: string; reason: string; supportIds: string[] }>;
}
export interface RouteRecoveryProposalV8 {
  id: string; scope: string; requiredIds: string[]; plan: NarrativeWalkingPlanV8;
}
export interface RoutePlanningDecisionV8 {
  schemaVersion: 'route-planning-v8-1'; policy: typeof ROUTE_SCOPE_POLICY_V8;
  cityCore: CanonicalTourCoreV6; protectedIds: string[]; pinnedIds: string[]; pinnedOrder: string[];
  originalMinutes: number; scope: string; requiredIds: string[]; omissions: RouteScopeVoteV8['omissions'];
  cityCoverageRatio: number; scopeCoverageRatio: number; selectedStopIds: string[];
  alternatives: Array<{ id: string; scope: string; stopIds: string[]; minutes: number; durationFit: string }>;
  votes: RouteScopeVoteV8[];
}
export class RouteRecoveryReviewRequiredV8 extends Error {
  constructor(public readonly diagnostics: Record<string, unknown>) {
    super('route_review_required: ' + diagnostics.reason);
  }
}
type WalkingService = Pick<WalkingRouteService, 'getRoute'>;
type PlanningInput = {
  candidates: EssentialRouteCandidateV8[]; requiredIds: string[]; durationMinutes: number;
  minStops: number; preferredStops: number; theme: string; core: CanonicalTourCoreV6;
  pinnedIds?: string[]; pinnedOrder?: string[]; now?: () => number;
};
export type RouteScopeReviewInputV8 = {
  core: CanonicalTourCoreV6; protectedIds: string[]; proposals: RouteRecoveryProposalV8[];
};
export function validateRoutePlanningDecisionV8(value: unknown, stopIds?: string[]): RoutePlanningDecisionV8 {
  const d = value as RoutePlanningDecisionV8;
  if (!d || d.schemaVersion !== 'route-planning-v8-1' || d.policy !== ROUTE_SCOPE_POLICY_V8
    || !d.scope?.trim() || !Array.isArray(d.selectedStopIds) || !Array.isArray(d.requiredIds)
    || !Array.isArray(d.protectedIds) || !Array.isArray(d.pinnedIds) || !Array.isArray(d.pinnedOrder)
    || !Array.isArray(d.omissions) || !Array.isArray(d.votes) || d.votes.length !== 3
    || !d.cityCore || d.cityCore.status !== 'approved' || !Array.isArray(d.cityCore.requirements)
    || !Number.isFinite(d.originalMinutes) || d.originalMinutes <= 0
    || !Array.isArray(d.alternatives) || d.alternatives.length > 3) throw new Error('invalid route planning decision');
  for (const list of [d.selectedStopIds, d.requiredIds, d.protectedIds, d.pinnedIds, d.pinnedOrder]) {
    if (new Set(list).size !== list.length || list.some(id => !/^Q\d+$/.test(id))) throw new Error('invalid planning identities');
  }
  if (stopIds && JSON.stringify(d.selectedStopIds) !== JSON.stringify(stopIds)) throw new Error('planning route changed');
  const protectedIds = sorted([...d.pinnedIds, ...d.pinnedOrder, ...d.cityCore.requirements.filter(r =>
    r.reasonCode === 'city_defining' || r.provenance === 'reviewed_override').map(r => r.canonicalId)]);
  const omitted = d.cityCore.requirements.filter(r => !d.selectedStopIds.includes(r.canonicalId));
  const required = sorted([...d.pinnedIds, ...d.pinnedOrder, ...d.cityCore.requirements.filter(r =>
    d.selectedStopIds.includes(r.canonicalId)).map(r => r.canonicalId)]);
  if (!same(protectedIds, d.protectedIds) || !same(required, d.requiredIds)
    || !protectedIds.every(id => d.selectedStopIds.includes(id))
    || d.scopeCoverageRatio !== 1 || !d.cityCore.requirements.length
    || d.cityCoverageRatio !== (d.cityCore.requirements.length - omitted.length) / d.cityCore.requirements.length
    || !same(d.omissions.map(o => o.canonicalId), omitted.map(r => r.canonicalId))) throw new Error('invalid planning coverage');
  const selected = d.alternatives.find(a => JSON.stringify(a.stopIds) === JSON.stringify(d.selectedStopIds));
  if (!selected || selected.durationFit !== 'within_target' || selected.scope !== d.scope
    || !Number.isFinite(selected.minutes) || selected.minutes < d.cityCore.durationMinutes * 0.9
    || selected.minutes > d.cityCore.durationMinutes * 1.1) throw new Error('invalid planning alternative');
  for (const vote of d.votes) {
    if (vote.proposalId !== selected.id || !vote.reason?.trim() || !Array.isArray(vote.omissions)
      || vote.omissions.length !== omitted.length || !same(vote.omissions.map(o => o.canonicalId), omitted.map(r => r.canonicalId))) throw new Error('invalid planning consensus');
    for (const o of vote.omissions) {
      const r = omitted.find(r => r.canonicalId === o.canonicalId)!;
      if (!o.reason?.trim() || !Array.isArray(o.supportIds) || !o.supportIds.length
        || o.supportIds.some(id => !r.supportIds.includes(id))) throw new Error('invalid planning evidence');
    }
  }
  if (JSON.stringify(d.omissions) !== JSON.stringify(d.votes[0].omissions)) throw new Error('planning explanation changed');
  return d;
}
const sorted = (ids: string[]) => [...new Set(ids)].sort();
const same = (a: string[], b: string[]) => JSON.stringify(sorted(a)) === JSON.stringify(sorted(b));
const coordinates = (c: EssentialRouteCandidateV8) => c.coordinates ?? { lat: c.latitude!, lng: c.longitude! };
const normalize = (plan: NarrativeWalkingPlanV8): NarrativeWalkingPlanV8 => {
  const byId = new Map(plan.selection.route.map(c => [c.wikidataId, c]));
  return { ...plan, selection: { ...plan.selection,
    route: plan.geometry.stops.map((s, position) => ({ ...byId.get(s.stopId)!, position })) } };
};
function usable(plan: NarrativeWalkingPlanV8, required: string[], duration: number): boolean {
  if (plan.timingSource !== 'walking_graph' || plan.geometry.status !== 'walkable'
    || plan.durationFit !== 'within_target' || plan.geometry.transferCount !== 0
    || plan.geometry.legs.some(l => l.type !== 'walking') || plan.geometry.stops.length > 12) return false;
  const ids = plan.geometry.stops.map(s => s.stopId);
  if (!required.every(id => ids.includes(id))) return false;
  return allocateNarrationTargetsV8({ durationMinutes: duration,
    walkingSeconds: plan.geometry.legs.reduce((n, l) => n + (l.durationSeconds ?? 0), 0),
    stops: ids.map(stopId => ({ stopId, required: required.includes(stopId) })),
  }).every(t => t.targetSeconds >= 120);
}

export async function planNarrativeRouteWithRecoveryV8(
  input: PlanningInput, service: WalkingService,
  review: (input: RouteScopeReviewInputV8) => Promise<RouteScopeVoteV8[]>, signal?: AbortSignal,
): Promise<{ plan: NarrativeWalkingPlanV8; decision: RoutePlanningDecisionV8 | null }> {
  signal?.throwIfAborted();
  const candidates = [...input.candidates].sort((a, b) => String(a.wikidataId).localeCompare(String(b.wikidataId)));
  const ids = candidates.map(c => c.wikidataId!);
  if (new Set(ids).size !== ids.length || ids.some(id => !/^Q\d+$/.test(id))
    || candidates.some(c => { const p = coordinates(c); return !Number.isFinite(p.lat)
      || !Number.isFinite(p.lng) || Math.abs(p.lat) > 90 || Math.abs(p.lng) > 180; })) {
    throw new Error('invalid route candidates: unique QIDs and coordinates required');
  }
  if (input.core.status !== 'approved' || input.core.durationMinutes !== input.durationMinutes
    || input.core.theme !== input.theme || !same(input.requiredIds, input.core.requirements.map(r => r.canonicalId))) {
    throw new Error('route core does not match planning request');
  }
  const pinnedIds = sorted([...(input.pinnedIds ?? []), ...(input.pinnedOrder ?? [])]);
  const requiredIds = sorted([...input.requiredIds, ...pinnedIds]);
  if (!requiredIds.every(id => ids.includes(id))) throw new Error('required_identity_missing');
  const protectedIds = sorted([...pinnedIds, ...input.core.requirements.filter(r =>
    r.reasonCode === 'city_defining' || r.provenance === 'reviewed_override').map(r => r.canonicalId)]);
  const now = input.now ?? Date.now;
  let recoveryStarted: number | null = null, calls = 0;
  const cache = new Map<string, ReturnType<WalkingService['getRoute']>>();
  const measured: WalkingService = { getRoute: stops => {
    signal?.throwIfAborted();
    const key = JSON.stringify(stops);
    const saved = cache.get(key);
    if (saved) return saved;
    if (recoveryStarted !== null) {
      if (calls >= 60 || now() - recoveryStarted >= 120_000) {
        throw new RouteRecoveryReviewRequiredV8({ reason: 'routing_budget_exhausted' });
      }
      calls++;
    }
    const pending = service.getRoute(stops);
    cache.set(key, pending);
    return pending;
  } };
  let overlongMinutes: number | undefined;
  let baseline = normalize(await planNarrativeWalkingRouteV8({ ...input, candidates: input.candidates, requiredIds, preferFeasible: true,
    onAttempt: attempt => { if (attempt.durationFit === 'long') overlongMinutes ??= attempt.geometry.guidedDurationMinutes; },
  }, measured, signal));
  const pinnedOrder = input.pinnedOrder ?? [];
  if (pinnedOrder.length && JSON.stringify(baseline.geometry.stops.map(s => s.stopId)) !== JSON.stringify(pinnedOrder)) {
    throw new RouteRecoveryReviewRequiredV8({ reason: 'explicit_route_order_locked' });
  }
  if (usable(baseline, requiredIds, input.durationMinutes)) return { plan: baseline, decision: null };
  if (baseline.timingSource !== 'walking_graph') {
    throw new RouteRecoveryReviewRequiredV8({ reason: 'walking_provider_unavailable' });
  }
  if (overlongMinutes === undefined && baseline.durationFit !== 'long' && baseline.geometry.reason !== 'guided_duration_infeasible') {
    throw new RouteRecoveryReviewRequiredV8({ reason: baseline.durationFit === 'short'
      ? 'route_too_short' : 'insufficient_narration_budget', originalMinutes: baseline.geometry.guidedDurationMinutes });
  }
  // Preserve successful existing routes. Only a failed route gets a stable
  // alternative starting order, which may retain the entire city core (Rome).
  if (!pinnedOrder.length && JSON.stringify(ids) !== JSON.stringify(input.candidates.map(c => c.wikidataId))) {
    recoveryStarted = now();
    try {
      const reordered = normalize(await planNarrativeWalkingRouteV8({ ...input, candidates, requiredIds,
        preferFeasible: true }, measured, signal));
      if (usable(reordered, requiredIds, input.durationMinutes)) return { plan: reordered, decision: null };
      if (reordered.timingSource === 'walking_graph') baseline = reordered;
    } catch (error) {
      signal?.throwIfAborted();
      if (!(error instanceof RouteRecoveryReviewRequiredV8)) throw error;
    }
  }
  const alternatives: RoutePlanningDecisionV8['alternatives'] = [];
  const fail = (reason: string): never => { throw new RouteRecoveryReviewRequiredV8({ reason,
    originalMinutes: overlongMinutes ?? baseline.geometry.guidedDurationMinutes, alternatives, protectedIds, calls }); };
  if (pinnedOrder.length) return fail('explicit_route_order_locked');
  const removable = input.core.requirements.filter(r => !protectedIds.includes(r.canonicalId)).map(r => r.canonicalId);
  if (!removable.length) return fail('protected_core_infeasible');
  const byId = new Map(candidates.map(c => [c.wikidataId!, c]));
  const anchors = protectedIds.length ? protectedIds : [
    [...input.requiredIds].sort((a, b) => (byId.get(b)!.fameScore ?? 0) - (byId.get(a)!.fameScore ?? 0) || a.localeCompare(b))[0],
  ].filter(Boolean);
  const distance = (a: string, b: string) => editorialDistanceMetersV5(coordinates(byId.get(a)!), coordinates(byId.get(b)!));
  const detour = (id: string) => Math.min(...anchors.map(anchor => distance(id, anchor)));
  removable.sort((a, b) => detour(b) - detour(a) || a.localeCompare(b));
  const proposals: RouteRecoveryProposalV8[] = [], seen = new Set<string>(), seenRoutes = new Set<string>();
  recoveryStarted ??= now();
  for (const count of [1, 2, removable.length]) {
    const omitted = removable.slice(0, count).filter(id => !anchors.includes(id));
    const key = sorted(omitted).join(',');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    const scopedRequired = requiredIds.filter(id => !omitted.includes(id));
    const centre = scopedRequired.length ? scopedRequired : anchors;
    // Nearby candidates can enrich the retained historical anchors; omitted
    // identities cannot return as optionals and null coordinates never pass.
    const pool = candidates.filter(c => scopedRequired.includes(c.wikidataId!)
      || (!omitted.includes(c.wikidataId!) && Math.min(...centre.map(a => distance(c.wikidataId!, a))) <= 1400));
    if (pool.length < input.minStops) continue;
    try {
      const plan = normalize(await planNarrativeWalkingRouteV8({ ...input, candidates: pool, preferFeasible: true,
        requiredIds: scopedRequired }, measured, signal));
      const stopIds = plan.geometry.stops.map(s => s.stopId), routeKey = sorted(stopIds).join(',');
      const scope = anchors.slice(0, 3).map(id => byId.get(id)!.name).join(' · ');
      const id = `scope-${seen.size}`;
      alternatives.push({ id, scope, stopIds, minutes: plan.geometry.guidedDurationMinutes, durationFit: plan.durationFit });
      if (seenRoutes.has(routeKey) || !usable(plan, sorted([...scopedRequired, ...protectedIds]), input.durationMinutes)) continue;
      seenRoutes.add(routeKey);
      proposals.push({ id, scope, requiredIds: scopedRequired, plan });
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof RouteRecoveryReviewRequiredV8) break;
      if (!(error instanceof WalkingRouteUnavailableError)) throw error;
    }
  }
  if (!proposals.length) return fail(calls >= 60 || now() - recoveryStarted >= 120_000
    ? 'routing_budget_exhausted' : 'no_feasible_scope');
  const votes = await review({ core: input.core, protectedIds, proposals });
  signal?.throwIfAborted();
  if (votes.length !== 3 || votes.some(v => !v.proposalId || v.proposalId !== votes[0].proposalId)) return fail('scope_review_disagreement');
  const chosen = proposals.find(p => p.id === votes[0].proposalId);
  if (!chosen) return fail('invalid_scope_proposal');
  const selectedStopIds = chosen.plan.geometry.stops.map(s => s.stopId);
  const missing = input.core.requirements.filter(r => !selectedStopIds.includes(r.canonicalId));
  for (const vote of votes) {
    if (!vote.reason?.trim() || !Array.isArray(vote.omissions)
      || vote.omissions.length !== missing.length
      || !same(vote.omissions.map(o => o.canonicalId), missing.map(r => r.canonicalId))) return fail('invalid_scope_omissions');
    for (const omission of vote.omissions) {
      const requirement = missing.find(r => r.canonicalId === omission.canonicalId)!;
      if (!omission.reason?.trim() || protectedIds.includes(omission.canonicalId)
        || !Array.isArray(omission.supportIds) || !omission.supportIds.length
        || omission.supportIds.some(s => !requirement.supportIds.includes(s))) return fail('invalid_scope_evidence');
    }
  }
  return { plan: chosen.plan, decision: {
    schemaVersion: 'route-planning-v8-1', policy: ROUTE_SCOPE_POLICY_V8, cityCore: input.core,
    protectedIds, pinnedIds, pinnedOrder, originalMinutes: overlongMinutes ?? baseline.geometry.guidedDurationMinutes,
    scope: chosen.scope, requiredIds: chosen.requiredIds, selectedStopIds, omissions: votes[0].omissions,
    cityCoverageRatio: (input.requiredIds.length - missing.length) / input.requiredIds.length,
    scopeCoverageRatio: 1, alternatives, votes,
  } };
}
