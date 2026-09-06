import { WalkingRouteData, WalkingRouteUnavailableError } from '../WalkingRouteService';
import { planNarrativeWalkingRouteV8, measureNarrativeWalkingRouteV8 } from './NarrativeWalkingPlanV8';
import { tourStopsFromCandidatesV8 } from './TourGeometryV8';

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
});
