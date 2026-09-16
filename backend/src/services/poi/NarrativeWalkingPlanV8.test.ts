import { WalkingRouteData, WalkingRouteUnavailableError } from '../WalkingRouteService';
import { planNarrativeWalkingRouteV8, measureNarrativeWalkingRouteV8 } from './NarrativeWalkingPlanV8';
import { tourStopsFromCandidatesV8 } from './TourGeometryV8';
import sevilla from './__fixtures__/sevilla-walking-plan-v8.json';
import { editorialDistanceMetersV5 } from './EditorialEvidenceV5';

const candidates = Array.from({ length: 10 }, (_, index) => ({
  wikidataId: `Q${index + 1}`, name: `Lugar ${index + 1}`,
  coordinates: { lat: 41 + index * 0.001, lng: 1 }, category: 'monument',
  importanceScore: 100 - index, evidenceScore: 10,
}));
const input = { candidates, requiredIds: ['Q1', 'Q2'], durationMinutes: 120,
  minStops: 5, preferredStops: 7, theme: 'history' };
function service(minutes: number) {
  return { getRoute: jest.fn(async (): Promise<WalkingRouteData> => ({
    provider: 'fossgis-osrm-foot', durationSeconds: minutes * 60, distanceMeters: 100,
    geometry: { type: 'LineString', coordinates: [[1, 41], [1, 41.001]] },
  })) };
}

function recordedSevillaService(adapt: (seconds: number, attempt: number) => number = seconds => seconds,
  routeSizes = [7, 6, 5, 7, 7, 7]) {
  const orders: string[][] = [];
  const getRoute = jest.fn(async (stops: Array<{ latitude: number; longitude: number }>): Promise<WalkingRouteData> => {
    const ids = stops.map(stop => sevilla.candidates.find(candidate =>
      candidate.coordinates.lat === stop.latitude && candidate.coordinates.lng === stop.longitude)!.wikidataId);
    if (!orders.length || orders[orders.length - 1].length === (routeSizes[orders.length - 1] ?? 7)) orders.push([ids[0]]);
    orders[orders.length - 1].push(ids[1]);
    const leg = sevilla.legs.find(item => item.fromStopId === ids[0] && item.toStopId === ids[1]);
    return { provider: 'fossgis-osrm-foot', durationSeconds: adapt(leg?.durationSeconds ?? 7200, orders.length),
      distanceMeters: 100, geometry: { type: 'LineString', coordinates: [[1, 41], [1, 41.001]] } };
  });
  return { getRoute, orders };
}

describe('bounded duration-aware walking plan V8', () => {
  it.each([[11, 7, 115], [6, 9, 111], [20, 5, 115]])(
    'uses %i minute legs to choose %i stops without losing essentials', async (minutes, count, total) => {
      const routing = service(minutes);
      const result = await planNarrativeWalkingRouteV8(input, routing);
      expect(result.timingSource).toBe('walking_graph');
      expect(result.durationFit).toBe('within_target');
      expect(result.geometry.stops).toHaveLength(count);
      expect(result.geometry.guidedDurationMinutes).toBe(total);
      expect(result.geometry.stops.map(stop => stop.stopId)).toEqual(expect.arrayContaining(input.requiredIds));
      expect(result.geometry.legs.every(leg => leg.type === 'walking')).toBe(true);
      if (count === 7) expect(routing.getRoute).toHaveBeenCalledTimes(6);
    });
  it('does not repeat a route when there are no extra candidates', async () => {
    const routing = service(6);
    const result = await planNarrativeWalkingRouteV8({ ...input, candidates: candidates.slice(0, 7) }, routing);
    expect(result.durationFit).toBe('short');
    expect(routing.getRoute).toHaveBeenCalledTimes(6);
  });
  it('labels provider failure as geometric fallback, never as verified timing', async () => {
    const routing = service(11);
    routing.getRoute.mockRejectedValue(new WalkingRouteUnavailableError());
    const result = await planNarrativeWalkingRouteV8(input, routing);
    expect(result.timingSource).toBe('geometric');
    expect(result.durationFit).toBe('unknown');
    expect(result.geometry.stops.map(stop => stop.stopId)).toEqual(expect.arrayContaining(input.requiredIds));
  });
  it('propagates cancellation, invalid input and unexpected failures', async () => {
    const routing = service(11), controller = new AbortController(); controller.abort();
    await expect(planNarrativeWalkingRouteV8(input, routing, controller.signal)).rejects.toThrow();
    await expect(planNarrativeWalkingRouteV8({ ...input, durationMinutes: 0 }, routing)).rejects.toThrow('invalid');
    await expect(planNarrativeWalkingRouteV8({ ...input, requiredIds: ['Q999'] }, routing)).rejects.toThrow('required_identity_missing');
    expect(routing.getRoute).not.toHaveBeenCalled();
    routing.getRoute.mockRejectedValue(new Error('unexpected'));
    await expect(planNarrativeWalkingRouteV8(input, routing)).rejects.toThrow('unexpected');
  });
  it('measures checkpoint order unchanged, without selecting or reordering stops', async () => {
    const stops = tourStopsFromCandidatesV8(candidates.slice(0, 3), input.requiredIds).reverse();
    const routing = service(11);
    const result = await measureNarrativeWalkingRouteV8(stops, 120, routing);
    expect(result.blocks[0].stopIds).toEqual(stops.map(stop => stop.stopId));
    expect(result.legs[0]).toMatchObject({ fromStopId: 'Q3', toStopId: 'Q2', durationSeconds: 660 });
    expect(result.stops).toEqual(stops);
    expect(routing.getRoute).toHaveBeenCalledTimes(2);
  });
  it.each([[2], [3]])('does not invent stops when only %i candidates are available', async (count) => {
    const available = candidates.slice(0, count);
    const routing = service(1);
    const result = await planNarrativeWalkingRouteV8({
      candidates: available, requiredIds: ['Q1'], durationMinutes: 60, minStops: 5, preferredStops: 5, theme: 'history',
    }, routing);
    expect(result.selection.route).toHaveLength(count);
    expect(result.geometry.stops).toHaveLength(count);
    const availableIds = new Set(available.map(c => c.wikidataId));
    expect(result.geometry.stops.every(stop => availableIds.has(stop.stopId))).toBe(true);
    expect(result.durationFit).toBe('short');
  });

  it('fits the saved Sevilla route after the loader excludes the human identity', async () => {
    const routing = recordedSevillaService(undefined, [7, 7, 7]);
    const result = await planNarrativeWalkingRouteV8({ ...input, requiredIds: sevilla.requiredIds,
      candidates: sevilla.candidates.filter(candidate => candidate.wikidataId !== sevilla.excludedHumanId),
    }, routing);
    expect(result.geometry.guidedDurationMinutes).toBe(111);
    expect(result.geometry.requestedDuration).toBe(120);
    expect(result.durationFit).toBe('within_target');
    expect(result.selection.route).toHaveLength(7);
    expect(result.selection.optionalIds).toContain('Q1046529');
    expect(result.selection.selectedRequiredIds).toEqual(sevilla.requiredIds);
    expect(routing.orders).toHaveLength(3);
    expect(routing.orders[1][0]).toBe('Q1046529'); // 107 minutes: outside duration tolerance.
    expect(result.geometry.blocks[0].stopIds).toEqual(routing.orders[2]);
    expect(result.selection.route.map(stop => stop.wikidataId)).toEqual(routing.orders[2]);
    expect(result.selection.route.map(stop => stop.position)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const uniqueLegs = new Set(routing.getRoute.mock.calls.map(([points]) => JSON.stringify(points)));
    expect(uniqueLegs.size).toBe(9); // Six original legs and only three new directed legs.
  });

  it('replaces a distant optional after count changes fail, preserving coverage and input', async () => {
    // This candidate is a valid distant building in this scenario; no identity filtering runs here.
    const places = sevilla.candidates.map(candidate => candidate.wikidataId === sevilla.excludedHumanId
      ? { ...candidate, wikidataId: 'Q777777', name: 'Remote historic building' } : { ...candidate });
    const original = structuredClone(places);
    const routing = recordedSevillaService();
    const result = await planNarrativeWalkingRouteV8({ ...input, requiredIds: sevilla.requiredIds,
      candidates: places }, routing);
    expect(routing.orders.map(order => order.length)).toEqual([7, 6, 5, 7, 7, 7]);
    expect(result.geometry.guidedDurationMinutes).toBe(111);
    expect(result.durationFit).toBe('within_target');
    expect(result.selection.route.map(stop => stop.wikidataId)).not.toContain('Q777777');
    expect(result.selection.optionalIds).toEqual(['Q1046529', 'Q2274061', 'Q2665595']);
    expect(result.selection.coverage).toEqual({ requiredCovered: true, requiredRatio: 1, optionalCount: 3 });
    expect(result.selection.selectedRequiredIds).toEqual(sevilla.requiredIds);
    expect(new Set(result.geometry.stops.map(stop => stop.stopId)).size).toBe(7);
    expect(places).toEqual(original);
  });

  it('caps independent substitutions at two and keeps the closer short proposal when neither helps', async () => {
    const routing = recordedSevillaService((seconds, attempt) => attempt > 3 ? 7200 : seconds);
    const result = await planNarrativeWalkingRouteV8({ ...input, requiredIds: sevilla.requiredIds,
      candidates: sevilla.candidates }, routing);
    expect(routing.orders.map(order => order.length)).toEqual([7, 6, 5, 7, 7]);
    expect(new Set(routing.orders.map(order => JSON.stringify(order))).size).toBe(5);
    expect(routing.orders[3]).not.toContain(sevilla.excludedHumanId);
    expect(routing.orders[4]).toContain(sevilla.excludedHumanId); // Exclusions are independent.
    expect(routing.orders.every(order => sevilla.requiredIds.every(id => order.includes(id)))).toBe(true);
    expect(result.geometry.guidedDurationMinutes).toBe(84);
    expect(result.geometry.requestedDuration).toBe(120);
    expect(result.durationFit).toBe('short');
  });

  it.each(['provider', 'unexpected', 'cancel'])('preserves %s behavior during substitution', async kind => {
    const controller = new AbortController();
    const routing = recordedSevillaService((seconds, attempt) => {
      if (attempt <= 3) return seconds;
      if (kind === 'cancel') { controller.abort(); return seconds; }
      throw kind === 'provider' ? new WalkingRouteUnavailableError() : new Error('unexpected substitution failure');
    });
    const run = planNarrativeWalkingRouteV8({ ...input, requiredIds: sevilla.requiredIds,
      candidates: sevilla.candidates }, routing, controller.signal);
    if (kind === 'provider') {
      const result = await run;
      expect(result.timingSource).toBe('geometric');
      expect(result.durationFit).toBe('unknown');
      expect(result.geometry.requestedDuration).toBe(120);
    } else {
      await expect(run).rejects.toThrow(kind === 'unexpected' ? 'unexpected substitution failure' : /abort/i);
    }
    expect(routing.orders).toHaveLength(4);
  });

  it('keeps the measured original when geometric shortcuts are worse on real streets', async () => {
    const routing = recordedSevillaService((seconds, attempt) => attempt > 1 ? seconds + 1000 : seconds, [7, 7, 7]);
    const result = await planNarrativeWalkingRouteV8({ ...input, requiredIds: sevilla.requiredIds,
      candidates: sevilla.candidates.filter(stop => stop.wikidataId !== sevilla.excludedHumanId) }, routing);
    expect(routing.orders).toHaveLength(3);
    expect(new Set(routing.orders.map(order => JSON.stringify(order))).size).toBe(3);
    expect(result.geometry.guidedDurationMinutes).toBe(116);
    expect(result.geometry.blocks[0].stopIds).toEqual(routing.orders[0]);
  });

  it('can improve a misplaced third stop, without a special rule for the final stop', async () => {
    const points = [
      [40.0198, -2.9967], [40.0028, -2.997], [40.001, -2.9888], [40.0152, -2.9834],
      [40.0005, -2.9989], [40.0131, -2.9965], [40.0186, -2.9844],
    ];
    const places = points.map(([lat, lng], index) => ({ ...candidates[index], coordinates: { lat, lng } }));
    const initialIds = [0, 5, 3, 6, 2, 1, 4];
    const originalMeters = initialIds.slice(1).reduce((sum, index, i) => sum
      + editorialDistanceMetersV5(places[initialIds[i]].coordinates, places[index].coordinates), 0);
    const routing = { getRoute: jest.fn(async (stops: Array<{ latitude: number; longitude: number }>): Promise<WalkingRouteData> => ({
      provider: 'fossgis-osrm-foot', distanceMeters: 100,
      durationSeconds: editorialDistanceMetersV5(
        { lat: stops[0].latitude, lng: stops[0].longitude },
        { lat: stops[1].latitude, lng: stops[1].longitude }) / originalMeters * 70 * 60,
      geometry: { type: 'LineString', coordinates: [[1, 41], [1, 41.001]] },
    })) };
    const result = await planNarrativeWalkingRouteV8({ ...input, candidates: places, requiredIds: ['Q1'] }, routing);
    expect(result.geometry.blocks[0].stopIds).toEqual(['Q1', 'Q6', 'Q7', 'Q4', 'Q3', 'Q2', 'Q5']);
    expect(result.durationFit).toBe('within_target');
    expect(result.geometry.guidedDurationMinutes).toBeLessThan(120);
    expect(result.selection.route.map(stop => stop.wikidataId)).toEqual(result.geometry.blocks[0].stopIds);
    expect(routing.getRoute.mock.calls.length).toBeLessThanOrEqual(18);
  });

  it.each(['provider', 'unexpected', 'cancel'])('handles %s failure during optional order improvement', async kind => {
    const controller = new AbortController();
    const routing = recordedSevillaService((seconds, attempt) => {
      if (attempt === 1) return seconds;
      if (kind === 'cancel') { controller.abort(); return seconds; }
      throw kind === 'provider' ? new WalkingRouteUnavailableError() : new Error('unexpected order failure');
    }, [7, 7, 7]);
    const run = planNarrativeWalkingRouteV8({ ...input, requiredIds: sevilla.requiredIds,
      candidates: sevilla.candidates.filter(stop => stop.wikidataId !== sevilla.excludedHumanId) }, routing, controller.signal);
    if (kind === 'provider') {
      const result = await run;
      expect(result.geometry.guidedDurationMinutes).toBe(116);
      expect(result.timingSource).toBe('walking_graph');
      expect(result.durationFit).toBe('within_target');
    } else {
      await expect(run).rejects.toThrow(kind === 'unexpected' ? 'unexpected order failure' : /abort/i);
    }
    expect(routing.orders).toHaveLength(2);
  });
});
