// Translation types
export interface PlaceTranslationRequest {
  places: Array<{
    english: string;
    country: string;
    city: string;
  }>;
  targetType: 'osm';
}

export interface PlaceTranslation {
  english: string;
  osm: string;
  alternatives: string[];
}

export interface PlaceTranslationResponse {
  translations: PlaceTranslation[];
}

// Generation types
export interface GenerateTourRequest {
  city: string;
  country: string;
  countryCode?: string;  // Optional, defaulted to 'ES'
  interests?: string[];  // Optional
  duration?: number;     // Optional, defaulted to 60 minutes
  maxStops?: number;     // Optional, defaulted to 5
}

export interface TourStop {
  name: string;
  description: string;
  estimatedDuration: number;
  coordinates: {
    lat: number;
    lng: number;
  };
}

export interface GenerateTourResponse {
  places: TourStop[];
}

// LLM prompt/response types
export type PromptFunction = (opts: any) => Promise<any>;

export interface LLMResponse {
  success: boolean;
  content: string;
  error?: string;
  metadata?: {
    model?: string;
    temperature?: number;
    num_predict?: number;
    format?: string;
    think?: boolean;
    durationMs?: number;
    done_reason?: string;
    eval_count?: number;
  };
}
