import { RouteStop } from '../types/route';
import { calculateDistance } from './placeUtils';

/**
 * Simple nearest neighbor algorithm for route optimization
 * Returns a new array of stops in optimized order
 */
export function optimizeRoute(stops: RouteStop[]): RouteStop[] {
  if (stops.length <= 2) return [...stops];

  const remaining = [...stops];
  const result: RouteStop[] = [remaining.shift()!];

  while (remaining.length > 0) {
    const current = result[result.length - 1];
    let minDistance = Infinity;
    let nextIndex = 0;

    // Find nearest unvisited stop
    for (let i = 0; i < remaining.length; i++) {
      const distance = calculateDistance(
        current.lat,
        current.lng,
        remaining[i].lat,
        remaining[i].lng
      );

      if (distance < minDistance) {
        minDistance = distance;
        nextIndex = i;
      }
    }

    result.push(remaining[nextIndex]);
    remaining.splice(nextIndex, 1);
  }

  // If the optimized route is longer than the original, return original
  const originalDistance = calculateTotalDistance(stops);
  const optimizedDistance = calculateTotalDistance(result);

  if (optimizedDistance >= originalDistance) {
    return [...stops];
  }

  return result;
}

/**
 * Calculate total distance of a route
 */
function calculateTotalDistance(route: RouteStop[]): number {
  let total = 0;
  for (let i = 0; i < route.length - 1; i++) {
    total += calculateDistance(
      route[i].lat,
      route[i].lng,
      route[i + 1].lat,
      route[i + 1].lng
    );
  }
  return total;
}
