import { bestOpenPath } from './routeOrder';

/** The order in which a visitor walks a flexible tour. `recommended` is the published order and is never stored. */
export interface TourOrder { version: 1; mode: 'custom'; placeIds: string[]; startPlaceId: string; createdAt: string }

const PREFIX = 'tour-order:';
export const orderKey = (tourId: string, pilotVersion: string) => `${PREFIX}${tourId}:${pilotVersion}`;

const isPermutation = (ids: unknown, canonical: string[]): ids is string[] =>
  Array.isArray(ids) && ids.length === canonical.length && new Set(ids).size === ids.length && canonical.every(id => ids.includes(id));

/**
 * The saved custom order of a tour, or null. It is discarded when the tour's version changed (its fingerprint, `pilot.version`)
 * or when it is no longer a permutation of the tour's stops; orders saved for other versions of the same tour are removed.
 */
export function readTourOrder(tourId: string, pilotVersion: string, canonicalIds: string[]): TourOrder | null {
  try {
    const mine = orderKey(tourId, pilotVersion);
    for (const key of Object.keys(localStorage)) if (key.startsWith(PREFIX + tourId + ':') && key !== mine) localStorage.removeItem(key);
    const saved = JSON.parse(localStorage.getItem(mine) || 'null') as TourOrder | null;
    if (saved?.version === 1 && saved.mode === 'custom' && isPermutation(saved.placeIds, canonicalIds) && saved.placeIds.includes(saved.startPlaceId)) return saved;
    if (saved) localStorage.removeItem(mine);
  } catch { /* Storage is optional: the recommended order is always available. */ }
  return null;
}

export function saveTourOrder(tourId: string, pilotVersion: string, order: TourOrder) {
  try { localStorage.setItem(orderKey(tourId, pilotVersion), JSON.stringify(order)); } catch { /* Storage is optional. */ }
}

export function clearTourOrder(tourId: string, pilotVersion: string) {
  try { localStorage.removeItem(orderKey(tourId, pilotVersion)); } catch { /* Storage is optional. */ }
}

/** The stops in the order they will be walked: the saved custom order, or the published one. */
export const activeOrder = (canonicalIds: string[], saved: TourOrder | null): string[] => (saved ? saved.placeIds : canonicalIds);

/**
 * "Start at X" (plan 05 section 4.3): X first, then the stops not yet listened to in the cheapest walking order, then the stops
 * already listened to, in the order they had. The listened stops are never dropped.
 */
export function startFrom(canonicalIds: string[], current: string[], startPlaceId: string, listened: ReadonlySet<string>, cost: (a: string, b: string) => number, now = new Date()): TourOrder {
  const base = current.length === canonicalIds.length ? current : canonicalIds;
  const pending = base.filter(id => id !== startPlaceId && !listened.has(id));
  const done = base.filter(id => id !== startPlaceId && listened.has(id));
  return { version: 1, mode: 'custom', placeIds: [...bestOpenPath(startPlaceId, pending, cost), ...done], startPlaceId, createdAt: now.toISOString() };
}

/** True when the order is the published one, so that it does not need to be stored. */
export const isRecommended = (canonicalIds: string[], order: string[]) => canonicalIds.length === order.length && canonicalIds.every((id, i) => id === order[i]);
