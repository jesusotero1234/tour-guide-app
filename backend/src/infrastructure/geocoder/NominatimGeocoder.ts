import axios, { AxiosError } from 'axios';
import { GeocodedCity, GeocoderError } from '../../domain/geocoder/GeocoderTypes';

const USER_AGENT = 'tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)';
const NOMINATIM_BASE = 'https://nominatim.openstreetmap.org';
const MIN_INTERVAL_MS = 1000;

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

interface NominatimResult {
  osm_type: string;
  osm_id: number;
  display_name: string;
  lat: string;
  lon: string;
  boundingbox: [string, string, string, string];
  extratags?: {
    wikidata?: string;
  };
}

export async function geocodeCity(cityName: string): Promise<GeocodedCity> {
  await enforceRateLimit();

  let response;
  try {
    response = await axios.get<NominatimResult[]>(`${NOMINATIM_BASE}/search`, {
      params: {
        q: cityName,
        format: 'json',
        limit: 1,
        featuretype: 'city',
        extratags: 1,
      },
      headers: {
        'User-Agent': USER_AGENT,
        'Accept-Language': 'en',
      },
      timeout: 10000,
    });
  } catch (err) {
    const axiosErr = err as AxiosError;
    if (axiosErr.response?.status === 429) {
      const geocoderErr: GeocoderError = {
        type: 'RATE_LIMITED',
        message: 'Nominatim rate limit exceeded',
        statusCode: 429,
      };
      throw geocoderErr;
    }
    if (axiosErr.response) {
      const geocoderErr: GeocoderError = {
        type: 'SERVER_ERROR',
        message: `Nominatim server error: ${axiosErr.message}`,
        statusCode: axiosErr.response.status,
      };
      throw geocoderErr;
    }
    const geocoderErr: GeocoderError = {
      type: 'NETWORK_ERROR',
      message: `Network error calling Nominatim: ${axiosErr.message}`,
    };
    throw geocoderErr;
  }

  const results = response.data;
  if (!results || results.length === 0) {
    const geocoderErr: GeocoderError = {
      type: 'NOT_FOUND',
      message: `City not found: ${cityName}`,
    };
    throw geocoderErr;
  }

  const r = results[0];
  const bb = r.boundingbox;

  return {
    osmType: r.osm_type,
    osmId: r.osm_id,
    wikidataId: r.extratags?.wikidata ?? null,
    displayName: r.display_name,
    lat: parseFloat(r.lat),
    lng: parseFloat(r.lon),
    boundingBox: {
      minLat: parseFloat(bb[0]),
      maxLat: parseFloat(bb[1]),
      minLng: parseFloat(bb[2]),
      maxLng: parseFloat(bb[3]),
    },
  };
}
