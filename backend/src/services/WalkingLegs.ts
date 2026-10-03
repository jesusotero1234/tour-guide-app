import { createHash } from 'crypto';

/**
 * Walking time, distance and geometry between EVERY pair of stops of a tour (plan 03 section 7), so the player can
 * start anywhere and reorder the rest. Stored in tour_walking_legs; metadata.walkingLegsSha256 mirrors its hash.
 */
export interface WalkingLegs {
  version: 1;
  provider: string;
  computedAt: string;
  stopIds: string[];
  durationsSeconds: number[][];
  distancesMeters: number[][];
  /** "<idA>|<idB>" with idA < idB, polyline (precision 5, [lat, lng]) in the direction A -> B. */
  geometries: Record<string, string>;
}

/** Google/OSRM polyline algorithm, precision 5. Points are [lat, lng]. */
export function encodePolyline(points: Array<[number, number]>): string {
  let out = '', lastLat = 0, lastLng = 0;
  const put = (value: number) => {
    let v = value < 0 ? ~(value << 1) : value << 1;
    while (v >= 0x20) { out += String.fromCharCode((0x20 | (v & 0x1f)) + 63); v >>= 5; }
    out += String.fromCharCode(v + 63);
  };
  for (const [lat, lng] of points) {
    const a = Math.round(lat * 1e5), b = Math.round(lng * 1e5);
    put(a - lastLat); put(b - lastLng);
    lastLat = a; lastLng = b;
  }
  return out;
}

export function decodePolyline(encoded: string): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  let index = 0, lat = 0, lng = 0;
  const read = (): number => {
    let result = 0, shift = 0, byte: number;
    do {
      if (index >= encoded.length) throw new Error('Truncated polyline');
      byte = encoded.charCodeAt(index++) - 63;
      if (byte < 0 || byte > 63) throw new Error('Invalid polyline');
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += read(); lng += read();
    points.push([lat / 1e5, lng / 1e5]);
  }
  return points;
}

/** Where the legs are stored. Read only by GET /tours/:id/walking-legs, never by admission or the catalogue. */
export interface WalkingLegsStore { find(tourId: string): Promise<{ data: unknown; sha256: string } | null> }

export const pairKey = (a: string, b: string) => (a < b ? a + '|' + b : b + '|' + a);

function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical((value as Record<string, unknown>)[k])]));
  return value;
}

/** Identity of the legs: provider and computedAt are left out so that recomputing the same legs does not change it. */
export function walkingLegsSha256(legs: WalkingLegs): string {
  const { version, stopIds, durationsSeconds, distancesMeters, geometries } = legs;
  return createHash('sha256').update(JSON.stringify(canonical({ version, stopIds, durationsSeconds, distancesMeters, geometries }))).digest('hex');
}

/** True when `value` is a complete set of legs for exactly these stops. */
export function validWalkingLegs(value: unknown, placeIds: string[]): value is WalkingLegs {
  const legs = value as WalkingLegs | null;
  if (!legs || legs.version !== 1 || !Array.isArray(legs.stopIds) || legs.stopIds.length !== placeIds.length
    || new Set(legs.stopIds).size !== placeIds.length || !placeIds.every(id => legs.stopIds.includes(id))) return false;
  const n = legs.stopIds.length;
  const square = (m: unknown) => Array.isArray(m) && m.length === n && m.every((row: unknown, i: number) => Array.isArray(row) && row.length === n
    && row.every((cell: unknown, j: number) => typeof cell === 'number' && Number.isFinite(cell) && cell >= 0 && (i !== j || cell === 0)));
  if (!square(legs.durationsSeconds) || !square(legs.distancesMeters) || !legs.geometries || typeof legs.geometries !== 'object') return false;
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const encoded = legs.geometries[pairKey(legs.stopIds[i], legs.stopIds[j])];
    if (typeof encoded !== 'string' || !encoded) return false;
    try { if (decodePolyline(encoded).length < 2) return false; } catch { return false; }
  }
  return Object.keys(legs.geometries).length === (n * (n - 1)) / 2;
}

export interface LegRoute { distanceMeters: number; durationSeconds: number; coordinates: Array<[number, number]> /* GeoJSON [lng, lat] */ }
export type LegRouter = (from: { latitude: number; longitude: number }, to: { latitude: number; longitude: number }) => Promise<LegRoute>;

/** One route per unordered pair; durations and distances are symmetric, the geometry is stored A -> B (idA < idB). */
export async function computeWalkingLegs(stops: Array<{ id: string; latitude: number; longitude: number }>, route: LegRouter,
  provider = 'fossgis-osrm-foot', now: () => Date = () => new Date()): Promise<WalkingLegs> {
  const n = stops.length;
  const zero = () => Array.from({ length: n }, () => new Array<number>(n).fill(0));
  const durations = zero(), distances = zero(), geometries: Record<string, string> = {};
  for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
    const [first, second] = stops[i].id < stops[j].id ? [stops[i], stops[j]] : [stops[j], stops[i]];
    const result = await route(first, second);
    if (!Number.isFinite(result.distanceMeters) || !Number.isFinite(result.durationSeconds) || result.coordinates.length < 2) {
      throw new Error('Invalid route between ' + first.id + ' and ' + second.id);
    }
    durations[i][j] = durations[j][i] = Math.round(result.durationSeconds);
    distances[i][j] = distances[j][i] = Math.round(result.distanceMeters);
    geometries[pairKey(first.id, second.id)] = encodePolyline(result.coordinates.map(([lng, lat]) => [lat, lng] as [number, number]));
  }
  return { version: 1, provider, computedAt: now().toISOString(), stopIds: stops.map(s => s.id), durationsSeconds: durations, distancesMeters: distances, geometries };
}
