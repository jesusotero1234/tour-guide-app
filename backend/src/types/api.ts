import { TourConfidence, TourQualityRepairMetadata, TourQualityStatus } from './tourQuality';

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  tourId?: string;
  name: string;
  nameInTourLanguage?: string;
  description: string;
  descriptionSections?: Record<string, string>;
  position: number;
  latitude: number;
  longitude: number;
  coordinates?: Coordinates; // Deprecated compatibility shape
  importanceScore?: number;
  audioUrl?: string;
  imageUrl?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface TourRequest {
  city: string;
  country: string;         // Country name (e.g., "Spain")
  countryCode: string;     // ISO country code (e.g., "ES")
  theme: string;
  language: string;
  durationMinutes: number; // Canonical duration in minutes
  duration?: number; // Deprecated compatibility alias
}

export interface ConceptTourRequest {
  conceptSlug: string;
  city: string;
  country: string;
  countryCode: string;
  language: string;
  durationMinutes?: number;
}

export interface TourResponse {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  theme: string;
  title?: string;
  subtitle?: string;
  experienceLabel?: string;
  previewStopNames?: string[];
  language: string;
  durationMinutes: number;
  places: Place[];
  route?: Coordinates[];
  degraded?: boolean;
  degradationReason?: 'duration_below_requested' | null;
  coverageRatio?: number;
  qualityStatus?: TourQualityStatus;
  confidence?: TourConfidence;
  repair?: TourQualityRepairMetadata;
  requestedDurationMinutes?: number;
  recommendedDurationMinutes?: number;
  durationAdapted?: boolean;
  createdAt: string;
  updatedAt?: string;
}

export interface ApiError {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export interface FlexiblePassTourSummary {
  id: string;
  city: string;
  country: string;
  countryCode: string;
  language: string;
  theme: string;
  title: string;
   subtitle?: string;
   experienceLabel?: string;
  durationMinutes: number;
  stopCount: number;
  imageUrl?: string;
}

export interface FlexiblePassCitySummary {
  city: string;
  country: string;
  countryCode: string;
  language: string;
  availableTourCount: number;
  toursRequired: number;
  priceCents: number;
  currency: string;
}

export interface FlexiblePassOptionsResponse {
  city: string;
  country: string;
  countryCode: string;
  language: string;
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
  language: string;
  tourIds: string[];
}

export interface FlexiblePassQuoteResponse {
  city: string;
  countryCode: string;
  language: string;
  toursRequired: number;
  selectedTourCount: number;
  individualTotalCents: number;
  passPriceCents: number;
  savingsCents: number;
  currency: string;
  selectedTours: FlexiblePassTourSummary[];
}
