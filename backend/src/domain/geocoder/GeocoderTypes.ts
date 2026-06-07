export interface GeocodedCity {
  osmType: string;
  osmId: number;
  wikidataId: string | null;
  displayName: string;
  lat: number;
  lng: number;
  boundingBox: {
    minLat: number;
    maxLat: number;
    minLng: number;
    maxLng: number;
  };
}

export interface GeocoderError {
  type: 'NOT_FOUND' | 'RATE_LIMITED' | 'SERVER_ERROR' | 'NETWORK_ERROR';
  message: string;
  statusCode?: number;
}
