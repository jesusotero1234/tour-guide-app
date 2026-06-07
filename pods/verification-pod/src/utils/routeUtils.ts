import { 
  RouteStop, 
  RouteMetrics, 
  RouteValidationError,
  ROUTE_CONSTANTS
} from '../types/route';
import { calculateDistance } from './placeUtils';

/**
 * Calculate distances between consecutive stops in a route
 */
export function calculateRouteDistances(stops: RouteStop[]): number[] {
  const distances: number[] = [];
  
  for (let i = 0; i < stops.length - 1; i++) {
    const current = stops[i];
    const next = stops[i + 1];
    distances.push(calculateDistance(
      current.lat,
      current.lng,
      next.lat,
      next.lng
    ));
  }
  
  return distances;
}

/**
 * Calculate various metrics for route evaluation
 */
export function calculateRouteMetrics(stops: RouteStop[]): RouteMetrics {
  const distances = calculateRouteDistances(stops);
  const totalDistance = distances.reduce((sum, dist) => sum + dist, 0);
  const averageDistance = totalDistance / distances.length;
  const maxDistance = Math.max(...distances, 0);
  const minDistance = distances.length > 0 ? Math.min(...distances) : 0;
  
  // Check if route returns close to start
  const isCircular = stops.length > 1 && calculateDistance(
    stops[0].lat,
    stops[0].lng,
    stops[stops.length - 1].lat,
    stops[stops.length - 1].lng
  ) <= ROUTE_CONSTANTS.CIRCULAR_THRESHOLD;

  // Calculate compactness score
  const compactnessScore = calculateCompactnessScore(stops);

  return {
    totalDistance,
    averageDistance,
    maxDistance,
    minDistance,
    isCircular,
    compactnessScore
  };
}

/**
 * Calculate route compactness score (0-1)
 * Lower scores indicate more spread out routes
 */
function calculateCompactnessScore(stops: RouteStop[]): number {
  if (stops.length < 2) return 1;

  // Calculate center point
  const center = {
    lat: stops.reduce((sum, stop) => sum + stop.lat, 0) / stops.length,
    lng: stops.reduce((sum, stop) => sum + stop.lng, 0) / stops.length
  };

  // Calculate average distance from center
  const distances = stops.map(stop => 
    calculateDistance(stop.lat, stop.lng, center.lat, center.lng)
  );

  const avgDistance = distances.reduce((sum, dist) => sum + dist, 0) / distances.length;
  const maxAllowedRadius = ROUTE_CONSTANTS.MAX_STOP_DISTANCE * (stops.length / 2);

  // Score based on average distance vs maximum allowed
  return Math.max(0, Math.min(1, 1 - (avgDistance / maxAllowedRadius)));
}

/**
 * Calculate estimated stop durations
 */
export function calculateStopDurations(stops: RouteStop[], totalDuration: number): number[] {
  const distances = calculateRouteDistances(stops);
  const totalWalkingTime = calculateRouteWalkingTime(distances);
  const remainingTime = Math.max(0, totalDuration - totalWalkingTime);
  const baseStopTime = remainingTime / stops.length;

  return Array(stops.length).fill(0).map(() => 
    Math.min(
      Math.max(baseStopTime, ROUTE_CONSTANTS.MIN_STOP_DURATION),
      ROUTE_CONSTANTS.MAX_STOP_DURATION
    )
  );
}

/**
 * Calculate total walking time for the route
 */
export function calculateRouteWalkingTime(distances: number[]): number {
  const totalDistance = distances.reduce((sum, dist) => sum + dist, 0);
  return totalDistance / ROUTE_CONSTANTS.WALKING_SPEED_METERS_MIN;
}

/**
 * Validate route basics (stop count and duration)
 */
export function validateBasics(
  stops: RouteStop[], 
  duration: number
): RouteValidationError[] {
  const errors: RouteValidationError[] = [];

  // Check minimum stop count
  if (stops.length < 2) {
    errors.push({
      type: 'DISTANCE',
      message: 'Route must have at least 2 stops'
    });
  }

  // Check if duration is within allowed range
  if (duration <= 0 || duration > ROUTE_CONSTANTS.MAX_TOUR_DURATION) {
    errors.push({
      type: 'DURATION',
      message: `Tour duration must be between 1 and ${ROUTE_CONSTANTS.MAX_TOUR_DURATION} minutes`
    });
  }

  // Check if average stop duration would be reasonable
  const distances = calculateRouteDistances(stops);
  const walkingTime = calculateRouteWalkingTime(distances);
  const remainingTime = duration - walkingTime;
  const avgStopTime = remainingTime / stops.length;

  if (avgStopTime < ROUTE_CONSTANTS.MIN_STOP_DURATION) {
    errors.push({
      type: 'DURATION',
      message: 'Tour duration is too short for the number of stops'
    });
  }

  return errors;
}

/**
 * Check if route compactness is acceptable
 */
export function validateCompactness(stops: RouteStop[]): RouteValidationError[] {
  const metrics = calculateRouteMetrics(stops);
  const errors: RouteValidationError[] = [];

  if (metrics.compactnessScore < ROUTE_CONSTANTS.MIN_COMPACTNESS_SCORE) {
    errors.push({
      type: 'COMPACTNESS',
      message: `Route is not compact enough (score: ${metrics.compactnessScore.toFixed(2)} < ${ROUTE_CONSTANTS.MIN_COMPACTNESS_SCORE})`
    });
  }

  return errors;
}
