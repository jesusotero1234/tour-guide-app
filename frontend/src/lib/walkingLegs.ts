import type { WalkingLegs } from '@/types/api';
import { haversineDistanceMeters } from './geo';

/** Walking speed and detour factor used when the legs have no figure for a pair: straight line * 1.3 at 1.3 m/s. */
export const WALKING_SPEED_MPS = 1.3;
export const DETOUR_FACTOR = 1.3;

export interface LatLng { latitude: number; longitude: number }

/** Straight-line distance in metres: the one implementation of the app lives in geo.ts. */
export const haversineMeters = haversineDistanceMeters;

/** Walking time with no routing data: the straight line, lengthened for the detours of a real street grid. */
export const estimatedSeconds = (straightMeters: number) => (straightMeters * DETOUR_FACTOR) / WALKING_SPEED_MPS;

const indexOf = (legs: WalkingLegs, id: string) => legs.stopIds.indexOf(id);

/** Seconds on foot between two stops, from the legs when they know both, otherwise from the coordinates. */
export function legSeconds(legs: WalkingLegs | null | undefined, a: string, b: string, points: Record<string, LatLng>): number {
  if (legs) {
    const i = indexOf(legs, a), j = indexOf(legs, b);
    const value = i >= 0 && j >= 0 ? legs.durationsSeconds[i]?.[j] : undefined;
    if (Number.isFinite(value)) return value as number;
  }
  return points[a] && points[b] ? estimatedSeconds(haversineMeters(points[a], points[b])) : Infinity;
}

export function legMeters(legs: WalkingLegs | null | undefined, a: string, b: string, points: Record<string, LatLng>): number {
  if (legs) {
    const i = indexOf(legs, a), j = indexOf(legs, b);
    const value = i >= 0 && j >= 0 ? legs.distancesMeters[i]?.[j] : undefined;
    if (Number.isFinite(value)) return value as number;
  }
  return points[a] && points[b] ? haversineMeters(points[a], points[b]) * DETOUR_FACTOR : Infinity;
}

/** Google/OSRM polyline, precision 5. Points are [lat, lng]. Returns null when the text is not a valid polyline. */
export function decodePolyline(encoded: string): Array<[number, number]> | null {
  const points: Array<[number, number]> = [];
  let index = 0, lat = 0, lng = 0;
  const read = (): number | null => {
    let result = 0, shift = 0, byte: number;
    do {
      if (index >= encoded.length) return null;
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) return null;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    const dLat = read(), dLng = read();
    if (dLat === null || dLng === null) return null;
    lat += dLat; lng += dLng;
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

const pairKey = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);

/**
 * The line to draw for a walk in this order: each leg's geometry in the direction of travel. A pair without a (valid) geometry
 * is returned as `{ from, to, line: null }` so the map can draw a dashed straight line there.
 */
export function orderedLegs(legs: WalkingLegs | null | undefined, order: string[]): Array<{ from: string; to: string; line: Array<[number, number]> | null }> {
  return order.slice(1).map((to, i) => {
    const from = order[i];
    const encoded = legs?.geometries?.[pairKey(from, to)];
    const decoded = encoded ? decodePolyline(encoded) : null;
    if (!decoded || decoded.length < 2) return { from, to, line: null };
    return { from, to, line: from < to ? decoded : [...decoded].reverse() };
  });
}

export function totalSeconds(legs: WalkingLegs | null | undefined, order: string[], points: Record<string, LatLng>): number {
  let total = 0;
  for (let i = 1; i < order.length; i++) total += legSeconds(legs, order[i - 1], order[i], points);
  return total;
}
