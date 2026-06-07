export interface RouteStop {
  lat: number;
  lng: number;
  name: string;
}

export interface RouteValidationRequest {
  stops: RouteStop[];
  duration: number;  // desired tour duration in minutes
}

export interface RouteValidationResponse {
  valid: boolean;
  totalWalkingDistance: number;  // meters
  totalWalkingTime: number;      // minutes
  numStops: number;
  details: {
    stopDistances: number[];     // distances between consecutive stops
    averageDistance: number;
    stopDurations: number[];     // estimated time at each stop
    stops: Array<{
      original: RouteStop;
      importance: {
        score: number;          // 0-1 based on tags
        osmTags: string[];      // Relevant tags found
        isTouristAttraction: boolean;
        isHistorical: boolean;
        hasWikiInfo: boolean;
      };
      duplicateOf?: string;     // Name of duplicate if found
    }>;
    optimizedOrder?: RouteStop[];  // Suggested better order if found
    validationErrors?: RouteValidationError[];
  }
}

export interface RouteMetrics {
  totalDistance: number;
  averageDistance: number;
  maxDistance: number;
  minDistance: number;
  isCircular: boolean;
  compactnessScore: number;
}

export interface RouteValidationError {
  type: RouteErrorType;
  message: string;
  stopIndexes?: number[];
}

export type RouteErrorType = 
  | 'DISTANCE'
  | 'DURATION'
  | 'DUPLICATE'
  | 'LOW_IMPORTANCE'
  | 'COMPACTNESS';

// Constants for route validation
export const ROUTE_CONSTANTS = {
  MAX_STOP_DISTANCE: 1000,        // meters
  MIN_STOP_DURATION: 7,           // minutes
  MAX_STOP_DURATION: 10,          // minutes
  WALKING_SPEED: 4,               // km/h
  WALKING_SPEED_METERS_MIN: 66.7, // 4 km/h in meters/minute
  MAX_TOUR_DURATION: 240,         // minutes (4 hours)
  MIN_COMPACTNESS_SCORE: 0.6,     // minimum acceptable compactness (0-1)
  CIRCULAR_THRESHOLD: 500,        // meters from start to end to be considered circular
  MIN_IMPORTANCE_SCORE: 0.5       // minimum importance score for a stop
} as const;
