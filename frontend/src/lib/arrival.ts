import { haversineMeters, type LatLng } from './walkingLegs';

/** A stop counts as reached inside 35 m, or inside the reading's own accuracy when that is worse (plan 05 section 5.2). */
export const ARRIVAL_METERS = 35;
export const CONSECUTIVE_READINGS = 2;

export interface Reading extends LatLng { accuracy?: number }

export const arrivalRadius = (reading: Reading) => Math.max(ARRIVAL_METERS, Number.isFinite(reading.accuracy) ? (reading.accuracy as number) : 0);

/**
 * Counts, per stop, the consecutive readings inside its radius. One reading is not enough: GPS jumps, and the notice must not
 * flicker or fire for a stop the visitor only walked past. A reading outside resets the count.
 */
export function updateStreaks(streaks: Record<string, number>, reading: Reading, stops: Array<{ id: string } & LatLng>): Record<string, number> {
  const next: Record<string, number> = {};
  for (const stop of stops) next[stop.id] = haversineMeters(reading, stop) <= arrivalRadius(reading) ? (streaks[stop.id] ?? 0) + 1 : 0;
  return next;
}

export const reached = (streaks: Record<string, number>, id: string) => (streaks[id] ?? 0) >= CONSECUTIVE_READINGS;
