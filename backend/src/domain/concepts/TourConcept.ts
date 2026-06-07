export type ConceptRouteType =
  | 'historical'
  | 'architecture'
  | 'royal'
  | 'religious'
  | 'markets'
  | 'literature'
  | 'art'
  | 'general';

export type ConceptConfidence = 'high' | 'medium' | 'low';

export interface ConceptPoiRef {
  wikidata?: string;
  osmType: 'node' | 'way' | 'relation';
  osmId: number;
  name: string;
  lat: number;
  lng: number;
  category: string;
  landmarkTier: string;
  fameScore: number;
}

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
  anchorPois: ConceptPoiRef[];
  supportingPois: ConceptPoiRef[];
  signals: {
    poiCount: number;
    flagshipCount: number;
    majorCount: number;
    spreadMeters: number;
    overlapWithOthers: Record<string, number>;
    walkabilityOk: boolean;
  };
}

export interface CityConceptRejection {
  slug: string;
  reason: string;
}

export interface CityConceptDiscoveryResult {
  city: string;
  countryCode: string;
  language: string;
  computedAt: string;
  concepts: TourConcept[];
  rejected: CityConceptRejection[];
}
