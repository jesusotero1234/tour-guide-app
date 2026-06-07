/**
 * Common API types for the Description Pod
 */

// API response wrapper
export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ErrorDetails;
}

// Error response
export interface ErrorDetails {
  code: ErrorCode;
  message: string;
  details?: any;
}

// Error codes
export type ErrorCode =
  | 'VALIDATION_ERROR'  // Invalid request parameters
  | 'NOT_FOUND'         // Requested resource not found  
  | 'INTERNAL_ERROR'    // Internal server error
  | 'API_ERROR'         // Error from an external API
  | 'CONTENT_ERROR'     // Error generating content
  | 'LLM_ERROR';        // Error from LLM service

// Description types
export interface DescriptionRequest {
  place: PlaceInfo;
  language?: string;        // Language code (default: 'en')
  detailLevel?: DetailLevel; // Amount of detail (default: 'standard')
  style?: string;           // Description style  
  tourContext?: TourPositionContext; // Tour narrative context
}

export interface PlaceInfo {
  name: string;             // Place name
  category?: string;        // Place category (historical, museum, etc)
  city: string;             // City name
  country: string;          // Country name
  coordinates?: {           // Geographic coordinates
    lat: number;
    lng: number;
  };
  tags?: string[];          // Additional tags/keywords
}

// Tour position context for narrative storytelling
export interface TourPositionContext {
  position: TourPosition;   // Position in the tour sequence
  tourName?: string;        // Name of the tour
  tourTheme?: string;       // Overall theme of the tour
  previousStops?: Array<{   // Information about previous stops
    name: string;
    description?: string;
    highlightDetails?: string[];
  }>;
  nextStops?: Array<{       // Information about upcoming stops
    name: string;
    category?: string;
  }>;
  expectedDuration?: number; // Total tour duration in minutes
}

export type TourPosition = 'first' | 'middle' | 'last';

// Detail level for descriptions
export type DetailLevel = 'brief' | 'standard' | 'detailed';

// Description response
export interface DescriptionResponse {
  description: string;      // Generated description
  language: string;         // Language of the generated description
  metadata?: {
    sourceCount?: number;   // Number of sources used
    wordCount?: number;     // Number of words in description  
    keyTopics?: string[];   // Key topics covered
  };
}

// Context types
export interface ContextRequest {
  place: PlaceInfo;
  language?: string;
  contextType: ContextType;
  timeframe?: string;       // Historical timeframe if relevant
  tourContext?: TourPositionContext; // Tour narrative context
}

export type ContextType = 'historical' | 'cultural' | 'architectural' | 'general';

export interface ContextResponse {
  context: string;
  language: string;
  type: ContextType;
  metadata?: {
    timeframe?: string;
    wordCount?: number;
    keyFacts?: string[];
  };
}

// Tips types
export interface TipsRequest {
  place: PlaceInfo;
  language?: string;
  audience?: AudienceType;
  tipTypes?: TipType[];
  tourContext?: TourPositionContext; // Tour narrative context
}

export type AudienceType = 'general' | 'family' | 'solo' | 'couples' | 'seniors' | 'budget';
export type TipType = 'visiting' | 'photography' | 'timing' | 'practical' | 'cultural' | 'insider';

export interface TipsResponse {
  tips: Tip[];
  language: string;
}

export interface Tip {
  content: string;
  type: TipType;
  importance: number;       // 1-10 scale of importance
}
