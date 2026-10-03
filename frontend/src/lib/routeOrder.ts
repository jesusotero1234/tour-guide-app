export type RouteCost = (from: string, to: string) => number;

const MAX_EXACT = 12;                                    // Held-Karp: 2^12 * 12 * 12 is about 590,000 operations

function pathCost(path: string[], cost: RouteCost): number {
  let total = 0;
  for (let i = 1; i < path.length; i++) total += cost(path[i - 1], path[i]);
  return total;
}

/**
 * The cheapest open walk that begins at `start` and visits every id once (it does not return). `ids` does not include `start`.
 * The result is `[start, ...ids in the best order]`. Up to 12 ids it is exact (Held-Karp); beyond that it is a nearest-neighbour
 * walk improved with 2-opt, good enough for the 40 stops a tour may have. Ties keep the order of `ids`, so the result is stable.
 */
export function bestOpenPath(start: string, ids: string[], cost: RouteCost): string[] {
  const n = ids.length;
  if (n === 0) return [start];
  if (n === 1) return [start, ids[0]];
  const found = n <= MAX_EXACT ? exact(start, ids, cost) : heuristic(start, ids, cost);
  // When the order given is already as cheap as the best one found, keep it: a recommended order that is optimal stays as it is.
  const given = [start, ...ids];
  return pathCost(given, cost) <= pathCost(found, cost) + 1e-9 ? given : found;
}

function exact(start: string, ids: string[], cost: RouteCost): string[] {
  const n = ids.length, full = (1 << n) - 1;
  const best = new Float64Array((1 << n) * n).fill(Infinity), from = new Int8Array((1 << n) * n).fill(-1);
  for (let j = 0; j < n; j++) best[(1 << j) * n + j] = cost(start, ids[j]);
  for (let mask = 1; mask <= full; mask++) {
    for (let last = 0; last < n; last++) {
      const here = best[mask * n + last];
      if (!(mask & (1 << last)) || here === Infinity) continue;
      for (let next = 0; next < n; next++) {
        if (mask & (1 << next)) continue;
        const candidate = here + cost(ids[last], ids[next]), slot = (mask | (1 << next)) * n + next;
        if (candidate < best[slot]) { best[slot] = candidate; from[slot] = last; }
      }
    }
  }
  let last = 0;
  for (let j = 1; j < n; j++) if (best[full * n + j] < best[full * n + last]) last = j;
  const order: number[] = [];
  for (let mask = full; last >= 0;) { order.push(last); const previous = from[mask * n + last]; mask &= ~(1 << last); last = previous; }
  return [start, ...order.reverse().map(i => ids[i])];
}

function heuristic(start: string, ids: string[], cost: RouteCost): string[] {
  const left = [...ids], path = [start];
  while (left.length) {
    let pick = 0;
    for (let i = 1; i < left.length; i++) if (cost(path[path.length - 1], left[i]) < cost(path[path.length - 1], left[pick])) pick = i;
    path.push(left.splice(pick, 1)[0]);
  }
  let improved = true;
  while (improved) {
    improved = false;
    let current = pathCost(path, cost);
    for (let i = 1; i < path.length - 1; i++) for (let j = i + 1; j < path.length; j++) {
      const candidate = [...path.slice(0, i), ...path.slice(i, j + 1).reverse(), ...path.slice(j + 1)];
      const total = pathCost(candidate, cost);
      if (total < current - 1e-9) { path.splice(0, path.length, ...candidate); current = total; improved = true; }
    }
  }
  return path;
}
