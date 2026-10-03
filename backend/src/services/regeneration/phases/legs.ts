import { createHash } from 'crypto';
import { WalkingRouteService } from '../../WalkingRouteService';
import { computeWalkingLegs, validWalkingLegs, walkingLegsSha256, type LegRoute, type LegRouter, type WalkingLegs } from '../../WalkingLegs';
import { baseKeyOf, remapLegs, stopsInOrder } from '../legsPlan';
import type { ManifestTour } from '../plan';
import { selectTours, type Ctx } from './context';

/** The public OSRM router, one request at a time and no faster than the service allows (≤ 1 request per second). */
export function publicRouter(service = new WalkingRouteService()): LegRouter {
  return async (from, to) => {
    let last: unknown;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const route = await service.getRoute([from, to]);
        return { distanceMeters: route.distanceMeters, durationSeconds: route.durationSeconds, coordinates: route.geometry.coordinates };
      } catch (error) {
        last = error;
        await new Promise(done => setTimeout(done, 2000 * attempt));
      }
    }
    throw last;
  };
}

/** Every route that was fetched is kept on disk, so a resumed or repeated run does not ask the public router again. */
function cachedRouter(ctx: Ctx): LegRouter {
  return async (from, to) => {
    const key = createHash('sha256').update([from, to].map(p => p.latitude.toFixed(6) + ',' + p.longitude.toFixed(6)).join('>')).digest('hex');
    const file = ['legs', 'cache', key + '.json'];
    if (ctx.stage.exists(...file)) return ctx.stage.read<LegRoute>(...file);
    const route = await ctx.deps.router(from, to);
    ctx.stage.write(route, ...file);
    return route;
  };
}

/** Plan 03 section 7: legs are computed once per base route and copied, with each language's ids, to every tour of the base. */
export async function legsPhase(ctx: Ctx) {
  const { stage, deps } = ctx;
  stage.require('legs');
  const tours = selectTours(ctx);
  const bases = new Map<string, ManifestTour[]>();
  for (const tour of tours) bases.set(tour.baseKey, [...(bases.get(tour.baseKey) ?? []), tour]);
  const router = cachedRouter(ctx);
  for (const [baseKey, group] of bases) {
    const reference = group[0];
    const stops = stopsInOrder(reference.places).map(p => ({ id: p.placeId, latitude: p.latitude, longitude: p.longitude }));
    const file = ['legs', 'base-' + baseKey + '.json'];
    let base = stage.readOr<WalkingLegs | null>(null, ...file);
    if (!base || base.stopIds.join() !== stops.map(s => s.id).join()) {
      base = await computeWalkingLegs(stops, router, 'fossgis-osrm-foot', deps.now);
      if (!validWalkingLegs(base, stops.map(s => s.id))) throw new Error('Invalid walking legs for base route ' + baseKey);
      stage.write(base, ...file);
    }
    for (const tour of group) {
      const ids = stopsInOrder(tour.places).map(p => p.placeId);
      const legs = ids.join() === base.stopIds.join() ? base : remapLegs(base, ids);
      if (!validWalkingLegs(legs, ids)) throw new Error('Invalid walking legs for tour ' + tour.tourId);
      stage.write({ tourId: tour.tourId, baseKey, sha256: walkingLegsSha256(legs), legs }, 'legs', tour.tourId + '.json');
    }
  }
  deps.log(`legs: ${bases.size} base routes, ${tours.length} tours`);
  if (stage.list('legs').length) stage.writeReceipt('legs', stage.list('legs'), { bases: bases.size, tours: tours.length });
  return { bases: bases.size, tours: tours.length };
}

export { baseKeyOf };
