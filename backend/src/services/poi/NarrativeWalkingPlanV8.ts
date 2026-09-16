import { WalkingRouteService, WalkingRouteUnavailableError } from '../WalkingRouteService';
import { EssentialRouteCandidateV8, EssentialRouteSelectionResultV8, selectEssentialRouteV8 } from './EssentialRouteSelectionV8';
import { editorialDistanceMetersV5 } from './EditorialEvidenceV5';
import { TourGeometryStopV8, TourGeometryV8PrunedResult, orderTourStopsByProximityV8, pruneOptionalStopsForWalkabilityV8, tourStopsFromCandidatesV8 } from './TourGeometryV8';

type WalkingService = Pick<WalkingRouteService, 'getRoute'>;
export interface NarrativeWalkingPlanV8 {
  selection: EssentialRouteSelectionResultV8<EssentialRouteCandidateV8>;
  geometry: TourGeometryV8PrunedResult;
  timingSource: 'walking_graph' | 'geometric';
  durationFit: 'within_target' | 'short' | 'long' | 'unknown';
}

// ponytail: planned seven-minute stays are not measured TTS or observation time.
// Keep the existing product assumption explicit until those measurements exist.
export async function measureNarrativeWalkingRouteV8(
  stops: TourGeometryStopV8[], durationMinutes: number, service: WalkingService,
  signal?: AbortSignal
): Promise<TourGeometryV8PrunedResult> {
  signal?.throwIfAborted();
  if (!Number.isFinite(durationMinutes) || durationMinutes <= 0 || stops.length < 2
    || new Set(stops.map(stop => stop.stopId)).size !== stops.length) {
    throw new Error('invalid walking duration input');
  }
  const legs: TourGeometryV8PrunedResult['legs'] = [];
  for (let index = 1; index < stops.length; index += 1) {
    signal?.throwIfAborted();
    const from = stops[index - 1], to = stops[index];
    const route = await service.getRoute([from, to].map(stop => ({
      latitude: stop.coordinates.lat, longitude: stop.coordinates.lng,
    })));
    signal?.throwIfAborted();
    if (!Number.isFinite(route.durationSeconds) || route.durationSeconds < 0) {
      throw new Error('invalid walking duration response');
    }
    legs.push({ type: 'walking', fromStopId: from.stopId, toStopId: to.stopId,
      durationSeconds: Math.ceil(route.durationSeconds) });
  }
  const guidedDurationMinutes = Math.ceil(stops.length * 7
    + legs.reduce((sum, leg) => sum + (leg.durationSeconds ?? 0), 0) / 60);
  const tooLong = guidedDurationMinutes > durationMinutes * 1.15;
  return { timingSource: 'walking_graph', durationFit: durationFit(guidedDurationMinutes, durationMinutes),
    status: tooLong ? 'route_review_required' : 'walkable',
    reason: tooLong ? 'guided_duration_infeasible' : null,
    blocks: [{ stopIds: stops.map(stop => stop.stopId) }], legs,
    guidedDurationMinutes, externalTransferTimeIncluded: false, transferCount: 0,
    requestedDuration: durationMinutes, stops, removedOptionalIds: [] };
}

function durationFit(minutes: number, requested: number): NarrativeWalkingPlanV8['durationFit'] {
  return minutes < requested * 0.9 ? 'short' : minutes > requested * 1.1 ? 'long' : 'within_target';
}

async function refineWalkingOrder(
  plan: NarrativeWalkingPlanV8, service: WalkingService, signal?: AbortSignal,
): Promise<NarrativeWalkingPlanV8> {
  const stops = plan.geometry.stops;
  if (plan.timingSource !== 'walking_graph' || plan.durationFit === 'short' || stops.length < 3) return plan;
  const distance = (order: TourGeometryStopV8[]) => order.slice(1).reduce((sum, stop, index) =>
    sum + editorialDistanceMetersV5(order[index].coordinates, stop.coordinates), 0);
  const originalDistance = distance(stops);
  const seen = new Set([JSON.stringify(stops.map(stop => stop.stopId))]);
  const alternatives: Array<{ stops: TourGeometryStopV8[]; distance: number }> = [];
  for (let from = 0; from < stops.length; from++) {
    for (let to = 0; to < stops.length; to++) {
      if (from === to) continue;
      const order = [...stops];
      order.splice(to, 0, order.splice(from, 1)[0]);
      const key = JSON.stringify(order.map(stop => stop.stopId));
      if (seen.has(key)) continue;
      seen.add(key);
      const meters = distance(order);
      if (meters < originalDistance) alternatives.push({ stops: order, distance: meters });
    }
  }
  let best = plan;
  const walkingSeconds = (geometry: TourGeometryV8PrunedResult) =>
    geometry.legs.reduce((sum, leg) => sum + (leg.durationSeconds ?? 0), 0);
  // One pass only: use coordinates to shortlist, real streets to choose.
  for (const alternative of alternatives.sort((a, b) => a.distance - b.distance).slice(0, 2)) {
    signal?.throwIfAborted();
    let geometry: TourGeometryV8PrunedResult;
    try {
      geometry = await measureNarrativeWalkingRouteV8(alternative.stops, plan.geometry.requestedDuration, service, signal);
    } catch (error) {
      signal?.throwIfAborted();
      if (error instanceof WalkingRouteUnavailableError) break; // Retain the measured route already available.
      throw error;
    }
    if (geometry.durationFit !== 'within_target' || geometry.status !== 'walkable'
      || walkingSeconds(geometry) >= walkingSeconds(best.geometry)) continue;
    const byId = new Map(plan.selection.route.map(stop => [stop.wikidataId, stop]));
    const route = geometry.stops.map((stop, position) => ({ ...byId.get(stop.stopId)!, position }));
    best = { ...plan, selection: { ...plan.selection, route }, geometry, durationFit: 'within_target' };
  }
  return best;
}

export async function planNarrativeWalkingRouteV8(input: {
  candidates: EssentialRouteCandidateV8[]; requiredIds: string[];
  durationMinutes: number; minStops: number; preferredStops: number; theme: string;
}, service: WalkingService = new WalkingRouteService(), signal?: AbortSignal): Promise<NarrativeWalkingPlanV8> {
  signal?.throwIfAborted();
  if (!Number.isFinite(input.durationMinutes) || input.durationMinutes <= 0
    || !Number.isInteger(input.minStops) || input.minStops < 2
    || !Number.isInteger(input.preferredStops) || input.preferredStops < input.minStops
    || input.preferredStops > 12) throw new Error('invalid walking plan input');
  const select = (count: number, excludedId?: string) => {
    const candidates = excludedId
      ? input.candidates.filter(candidate => candidate.wikidataId !== excludedId) : input.candidates;
    const selection = selectEssentialRouteV8(candidates, input.requiredIds, count,
      { requestedDuration: input.durationMinutes, theme: input.theme });
    if (selection.missingRequiredIds.length) {
      throw new Error(`required_identity_missing: ${selection.missingRequiredIds.join(', ')}`);
    }
    return selection;
  };
  const initial = select(input.preferredStops);
  let best: NarrativeWalkingPlanV8 | null = null;
  const measuredOrders = new Set<string>();
  const attempt = async (selection: typeof initial) => {
    const stops = orderTourStopsByProximityV8(tourStopsFromCandidatesV8(selection.route, input.requiredIds));
    const key = JSON.stringify(stops.map(stop => stop.stopId));
    if (measuredOrders.has(key)) return;
    measuredOrders.add(key);
    const geometry = await measureNarrativeWalkingRouteV8(stops, input.durationMinutes, service, signal);
    const candidate: NarrativeWalkingPlanV8 = { selection, geometry, timingSource: 'walking_graph',
      durationFit: durationFit(geometry.guidedDurationMinutes, input.durationMinutes) };
    const distance = Math.abs(geometry.guidedDurationMinutes - input.durationMinutes);
    const previousDistance = best ? Math.abs(best.geometry.guidedDurationMinutes - input.durationMinutes) : Infinity;
    if (!best || distance < previousDistance
      || (distance === previousDistance && stops.length < best.geometry.stops.length)) best = candidate;
  };
  try {
    await attempt(initial);
    // Explicit cast: assignment happens in the awaited closure, outside TS flow analysis.
    const first = best as NarrativeWalkingPlanV8 | null;
    if (!first) throw new Error('walking route has no measurable selection');
    if (first.durationFit === 'within_target') return await refineWalkingOrder(first, service, signal);
    const counts = first.durationFit === 'short'
      ? [input.preferredStops + 1, input.preferredStops + 2].filter(count => count <= 12)
      : Array.from({ length: input.preferredStops - input.minStops }, (_, index) => input.preferredStops - index - 1);
    for (const count of counts) {
      signal?.throwIfAborted();
      await attempt(select(count));
      const current = best as NarrativeWalkingPlanV8 | null;
      if (current?.durationFit === 'within_target') return await refineWalkingOrder(current, service, signal);
    }
    // Try replacing at most two low-priority optionals, without accumulating exclusions.
    const initialIds = new Set(initial.route.map(stop => stop.wikidataId));
    const optionals = initial.route.filter(stop => stop.wikidataId
      && initial.optionalIds.includes(stop.wikidataId)
      && !input.requiredIds.includes(stop.wikidataId)).reverse().slice(0, 2);
    for (const optional of optionals) {
      signal?.throwIfAborted();
      const replacement = select(input.preferredStops, optional.wikidataId);
      if (!replacement.route.some(stop => !initialIds.has(stop.wikidataId))) continue;
      await attempt(replacement);
      const current = best as NarrativeWalkingPlanV8 | null;
      if (current?.durationFit === 'within_target') return await refineWalkingOrder(current, service, signal);
    }
    return await refineWalkingOrder(best!, service, signal);
  } catch (error) {
    signal?.throwIfAborted();
    if (!(error instanceof WalkingRouteUnavailableError)) throw error;
    // A provider outage must not erase the existing route or masquerade as graph timing.
    return { selection: initial, timingSource: 'geometric', durationFit: 'unknown',
      geometry: { ...pruneOptionalStopsForWalkabilityV8(
        tourStopsFromCandidatesV8(initial.route, input.requiredIds), input.requiredIds,
        input.durationMinutes, input.minStops), timingSource: 'geometric', durationFit: 'unknown' } };
  }
}
