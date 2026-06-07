// Error types
export type ErrorCode = 
  | 'VALIDATION_ERROR' 
  | 'NOT_FOUND' 
  | 'INTERNAL_ERROR' 
  | 'API_ERROR'
  | 'INVALID_REQUEST'
  | 'NETWORK_ERROR'
  | 'TIMEOUT'
  | 'CITY_MISMATCH'
  | 'INVALID_COORDINATES'
  | 'LOCATION_NOT_FOUND';

export interface ErrorResponse {
  error: {
    code: ErrorCode;
    message: string;
    details?: {
      field?: string;
      message: string;
      value?: unknown;
    };
  };
}

// Place types
export type PlaceCategory = 'tourist' | 'historical' | 'religious' | 'natural' | 'other';
export type PlaceAccessibility = 'public' | 'private' | 'limited' | 'unknown';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface PlaceNames {
  english: string;
  local: string;
  alternatives: string[];
}

export interface PlaceVerificationRequest {
  name: string;
  coordinates: Coordinates;
  city: string;
  country: string;
  countryCode: string;
}

export interface CoordinateCorrection {
  distance: number;
  provided: Coordinates;
  actual: Coordinates;
}

export interface PlaceVerificationResponse {
  valid: boolean;
  exists: boolean;
  inCity: boolean;
  names?: PlaceNames;
  details?: {
    osmId: string;
    type: string;
    confidence: number;
    category: PlaceCategory;
    accessibility: PlaceAccessibility;
    coordinates: Coordinates;
    coordinateCorrection?: CoordinateCorrection;
  };
}

// OpenStreetMap types
export interface OpenStreetMapAddress {
  tourism?: string;
  road?: string;
  neighbourhood?: string;  // Added for historic area detection
  quarter?: string;        // Added for historic district detection
  suburb?: string;
  city?: string;
  town?: string;
  village?: string;        // Added for smaller settlements
  hamlet?: string;         // Added for very small settlements
  state?: string;
  municipality?: string;
  country?: string;
  country_code?: string;
  postcode?: string;
  district?: string;      // Added for district information
  region?: string;        // Added for regional context
}

export interface OpenStreetMapResult {
  place_id: number;
  osm_id: string;
  osm_type: string;
  lat: string;
  lon: string;
  display_name: string;
  class: string;
  type: string;
  importance?: number;
  address?: OpenStreetMapAddress;
  tags?: Record<string, string>;
  extratags?: Record<string, string>;
  namedetails?: Record<string, string>;
  wikipedia?: string;
  wikidata?: string;
  tourism?: string;
  historic?: string;
  amenity?: string;
  leisure?: string;
  building?: string;
  access?: string;
  opening_hours?: string;
  heritage?: string;
  natural?: string;
  entrance?: string;
  fee?: string;
}

// Route types
export interface RouteStop {
  name: string;
  names?: PlaceNames;  // Add translations to route stops
  lat: number;
  lng: number;
}

export interface RouteVerificationRequest {
  stops: RouteStop[];
  city: string;
  country: string;
  countryCode: string;
  duration: number;
}

export interface ValidationError {
  type: 'INVALID_LOCATION' | 'DISTANCE' | 'DURATION' | 'DUPLICATE';
  message: string;
  stopIndexes?: number[];
}

export interface RouteStopDetails {
  original: RouteStop;
  importance: number;
  duplicateOf?: string;
  osmCoordinates?: Coordinates;  // Add OSM-verified coordinates
}

export interface RouteVerificationResponse {
  valid: boolean;
  totalWalkingDistance: number;
  totalWalkingTime: number;
  numStops: number;
  details: {
    stopDistances: number[];
    averageDistance: number;
    stopDurations: number[];
    stops: RouteStopDetails[];
    optimizedOrder?: RouteStop[];
    validationErrors: ValidationError[];
  };
}
