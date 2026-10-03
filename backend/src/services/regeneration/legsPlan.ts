import { createHash } from 'crypto';
import { decodePolyline, encodePolyline, pairKey, type WalkingLegs } from '../WalkingLegs';

/**
 * The published tours of one route in five languages share their stops and coordinates, so the walking legs are computed once
 * per BASE route (about 52 of them) and copied, with each language's own place ids, to every tour of the base.
 */
export function baseKeyOf(tour: { countryCode: string; theme: string; places: Array<{ position: number; latitude: number; longitude: number }> }): string {
  const ordered = [...tour.places].sort((a, b) => a.position - b.position).map(p => p.latitude.toFixed(4) + ',' + p.longitude.toFixed(4));
  return createHash('sha256').update([tour.countryCode.toUpperCase(), tour.theme, ...ordered].join('|')).digest('hex').slice(0, 16);
}

/** Stops of a tour in route order: the correspondence between languages is the position in the route. */
export const stopsInOrder = <T extends { position: number }>(places: T[]): T[] => [...places].sort((a, b) => a.position - b.position);

/**
 * Re-keys the legs of a base to another tour of the same base. Geometry is stored from the smaller id to the larger one, so it
 * is reversed whenever the new ids sort the other way round.
 */
export function remapLegs(base: WalkingLegs, tourIds: string[]): WalkingLegs {
  if (tourIds.length !== base.stopIds.length || new Set(tourIds).size !== tourIds.length) throw new Error('The tour has a different number of stops than its base route');
  const geometries: Record<string, string> = {};
  for (let i = 0; i < base.stopIds.length; i++) for (let j = i + 1; j < base.stopIds.length; j++) {
    const baseA = base.stopIds[i], baseB = base.stopIds[j];
    const encoded = base.geometries[pairKey(baseA, baseB)];
    if (!encoded) throw new Error('The base route has no geometry for ' + baseA + ' and ' + baseB);
    const forward = baseA < baseB;                                   // direction in which `encoded` is stored, from the first id of the pair
    const [newA, newB] = [tourIds[i], tourIds[j]];
    // `encoded` runs from min(baseA, baseB) to max(baseA, baseB). Express it as running from baseA to baseB, then from newA to newB.
    const alongIJ = forward ? encoded : encodePolyline([...decodePolyline(encoded)].reverse());
    const needsNewForward = newA < newB;
    geometries[pairKey(newA, newB)] = needsNewForward ? alongIJ : encodePolyline([...decodePolyline(alongIJ)].reverse());
  }
  return { ...base, stopIds: [...tourIds], geometries };
}
