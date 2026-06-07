// Base types from the main application
export interface Coordinates {
  lat: number;
  lng: number;
}

export interface Place {
  id: string;
  name: string;
  description: string;
  coordinates: Coordinates;
  position: number;
  importanceScore?: number;
  imageUrl?: string;
  importance_score?: number; // Deprecated compatibility alias
  image_url?: string; // Deprecated compatibility alias
}

// Extended types for database
export interface Tour {
  id: string;
  city: string;
  country?: string;
  countryCode?: string;
  theme: string;
  language: string;
  durationMinutes?: number;
  places: Place[];
  route?: Coordinates[];
  createdAt?: string;
  updatedAt?: string;
  created_at: string; // Deprecated compatibility alias
  user_id?: string;
  metadata?: Record<string, any>;
}

export interface AudioFile {
  id: string;
  placeId?: string;
  place_id: string; // Deprecated compatibility alias
  language: string;
  format: string;
  storagePath?: string;
  storage_path: string; // Deprecated compatibility alias
  createdAt?: string;
  updatedAt?: string;
  created_at: string; // Deprecated compatibility alias
  metadata?: Record<string, any>;
}

// Request/Response types
export interface CreateTourRequest {
  tour: Omit<Tour, 'id' | 'created_at'>;
}

export interface UpdateTourRequest {
  id: string;
  tour: Partial<Omit<Tour, 'id' | 'created_at'>>;
}

export interface ListToursRequest {
  city?: string;
  theme?: string;
  language?: string;
  limit?: number;
  offset?: number;
}

export interface ListToursResponse {
  tours: Tour[];
  total: number;
  hasMore: boolean;
}

export interface UploadAudioRequest {
  place_id: string;
  language: string;
  format: string;
  audioData: string; // Base64 encoded audio data
  metadata?: Record<string, any>;
}

export interface ApiError {
  code: string;
  message: string;
  details?: any;
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: ApiError;
}
