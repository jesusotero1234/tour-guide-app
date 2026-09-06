export type Language = 'en' | 'es' | 'fr' | 'de' | 'it';

export interface LocationData {
  city: string;
  country: string;
  countryCode?: string;  // ISO country code (e.g., "es")
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface TourRequest {
  city: string;
  country: string;
  countryCode: string; // ISO country code (e.g., "ES")
  theme: 'architecture' | 'history' | 'food';
  language: Language;
  durationMinutes: number; // Canonical duration field in minutes
  duration?: number; // Deprecated compatibility alias
}

export type ConceptRouteType = 'historical' | 'architecture' | 'royal' | 'religious' | 'markets' | 'literature' | 'art' | 'general';
export type ConceptConfidence = 'high' | 'medium' | 'low';

export interface TourConcept {
  slug: string;
  title: string;
  routeType: ConceptRouteType;
  angle: string;
  iconKey: string;
  estimatedStops: number;
  suggestedDurationMinutes: number;
  confidence: ConceptConfidence;
  reason: string;
}

export interface CityConceptDiscoveryResult {
  city: string;
  countryCode: string;
  language: string;
  computedAt: string;
  concepts: TourConcept[];
  rejected: Array<{ slug: string; reason: string }>;
}

export interface ConceptTourRequest {
  conceptSlug: string;
  city: string;
  country: string;
  countryCode: string;
  language: Language;
  durationMinutes?: number;
}

export interface FlexiblePassCitySummary {
  city: string;
  country: string;
  countryCode: string;
  language: Language;
  availableTourCount: number;
  toursRequired: number;
  priceCents: number;
  currency: string;
}

export interface FlexiblePassTourSummary {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  language: Language;
  theme: string;
  title: string;
   subtitle?: string;
   experienceLabel?: string;
  durationMinutes: number;
  stopCount: number;
  imageUrl?: string;
}

export interface FlexiblePassOptionsResponse {
  city: string;
  country: string;
  countryCode: string;
  language: Language;
  toursRequired: number;
  priceCents: number;
  individualPriceCents: number;
  savingsCents: number;
  currency: string;
  tours: FlexiblePassTourSummary[];
}

export interface FlexiblePassQuoteRequest {
  city: string;
  countryCode: string;
  language: Language;
  tourIds: string[];
}

export interface FlexiblePassQuoteResponse {
  city: string;
  countryCode: string;
  language: Language;
  toursRequired: number;
  selectedTourCount: number;
  individualTotalCents: number;
  passPriceCents: number;
  savingsCents: number;
  currency: string;
  selectedTours: FlexiblePassTourSummary[];
}

export interface Tour {
  reviewSummary?: { findingCount: number; guidedDurationMinutes: number; transferCount: number; durationFit: string; languageFindingCount?: number; narrationMinutes?: number; durationMeasured?: boolean; narrationWithinTarget?: boolean };
  id: string;
  city: string;
  country: string;
  countryCode: string;
  theme: string;
   title?: string;
   subtitle?: string;
   experienceLabel?: string;
   previewStopNames?: string[];
  language: Language;
  durationMinutes: number;
  status: 'draft' | 'review' | 'published' | 'archived';
  introduction?: string;
  requestedDurationMinutes?: number;
  recommendedDurationMinutes?: number;
  durationAdapted?: boolean;
  places: Place[];
  createdAt: string;
  updatedAt?: string;
  created_at?: string; // Deprecated compatibility alias
}

export interface GenerationJob {
  id: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  step: 'queued' | 'sourcing' | 'routing' | 'planning_narrative' | 'narrating' | 'validating' | 'repairing' | 'publishing' | 'completed' | 'failed';
  progress: {
    completedStops: number;
    totalStops: number;
    message?: string;
  };
  result?: {
    tourId: string;
    durationAdapted?: boolean;
    requestedDurationMinutes?: number;
    recommendedDurationMinutes?: number;
    reviewRequired?: boolean;
  };
  error?: {
    code: string;
    message: string;
    details?: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface WalkingRoute {
  provider: 'fossgis-osrm-foot';
  geometry: {
    type: 'LineString';
    coordinates: Array<[longitude: number, latitude: number]>;
  };
  distanceMeters: number;
  durationSeconds: number;
}

export interface Place {
  id: string;
  name: string;
  nameInTourLanguage?: string;
  description: string;
   descriptionSections?: Record<string, string>;
  audioUrl?: string;
  position: number;
  latitude: number;
  longitude: number;
  coordinates?: {
    lat: number;
    lng: number;
  }; // Deprecated compatibility shape
  imageUrl?: string;
}

export type Theme = 'architecture' | 'history' | 'food';

export interface TourListParams {
  city?: string;
  countryCode?: string;
  theme?: Theme;
  language?: Language;
  readyOnly?: boolean;
  limit?: number;
  offset?: number;
}
