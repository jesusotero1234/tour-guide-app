import { CityConceptDiscoveryResult, ConceptTourRequest, FlexiblePassCitySummary, FlexiblePassOptionsResponse, FlexiblePassQuoteRequest, FlexiblePassQuoteResponse, GenerationJob, Tour, TourRequest, TourListParams, Language, WalkingRoute } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';
const FRONTEND_TOUR_API = '/api/backend';
const walkingRouteRequests = new Map<string, Promise<WalkingRoute>>();

export type { TourListParams } from '@/types/api';

export type ApiRequestError = Error & {
  status?: number;
  retryAfterMs?: number;
  code?: string;
  details?: unknown;
};

function createApiRequestError(errorData: unknown, fallbackMessage: string): ApiRequestError {
  const payload = errorData && typeof errorData === 'object' && 'error' in errorData
    ? (errorData as { error?: { message?: string; code?: string; details?: unknown } }).error
    : undefined;
  const err = new Error(payload?.message || fallbackMessage) as ApiRequestError;
  err.code = payload?.code;
  err.details = payload?.details;
  return err;
}

function isWalkingRoute(value: unknown): value is WalkingRoute {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const route = value as Record<string, unknown>;
  const geometry = route.geometry;
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) return false;
  const lineString = geometry as Record<string, unknown>;

  return route.provider === 'fossgis-osrm-foot'
    && typeof route.distanceMeters === 'number'
    && Number.isFinite(route.distanceMeters)
    && route.distanceMeters >= 0
    && typeof route.durationSeconds === 'number'
    && Number.isFinite(route.durationSeconds)
    && route.durationSeconds >= 0
    && lineString.type === 'LineString'
    && Array.isArray(lineString.coordinates)
    && lineString.coordinates.length >= 2
    && lineString.coordinates.every((coordinate) => (
      Array.isArray(coordinate)
      && coordinate.length === 2
      && typeof coordinate[0] === 'number'
      && Number.isFinite(coordinate[0])
      && coordinate[0] >= -180
      && coordinate[0] <= 180
      && typeof coordinate[1] === 'number'
      && Number.isFinite(coordinate[1])
      && coordinate[1] >= -90
      && coordinate[1] <= 90
    ));
}

export async function generateTour(request: TourRequest): Promise<Tour> {
  try {
    console.log(`Generating tour for ${request.city}, theme: ${request.theme}, duration: ${request.duration || 'default'}`);
    console.log('Full tour request:', request);
    
    const response = await fetch(`${API_BASE_URL}/v1/tours/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      },
      body: JSON.stringify(request),
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Tour generation error:', errorData);
      throw createApiRequestError(errorData, 'Failed to generate tour');
    }
    
    const tourData = await response.json();
    console.log(`Tour generated successfully with ${tourData.places?.length || 0} places`);
    
    return tourData;
  } catch (error) {
    console.error('Error generating tour:', error);
    // Re-throw errors that already carry a code (e.g. CITY_NOT_AVAILABLE)
    if (error && typeof error === 'object' && 'code' in error) throw error;
    throw new Error('Failed to generate tour. Please try again.');
  }
}

export async function getCityConcepts(city: string, countryCode: string, language: Language): Promise<CityConceptDiscoveryResult> {
  try {
    const queryParams = new URLSearchParams({ countryCode, language });
    const response = await fetch(`${API_BASE_URL}/v1/cities/${encodeURIComponent(city)}/concepts?${queryParams.toString()}`, {
      headers: {
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      const err = new Error(errorData.error?.message || 'Failed to fetch city concepts') as Error & { code?: string };
      err.code = errorData.error?.code;
      throw err;
    }

    const data = await response.json();
    return data.data as CityConceptDiscoveryResult;
  } catch (error) {
    console.error('Error fetching city concepts:', error);
    if (error && typeof error === 'object' && 'code' in error) throw error;
    throw new Error('Failed to fetch city concepts. Please try again.');
  }
}

export async function generateTourFromConcept(request: ConceptTourRequest): Promise<Tour> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/tours/generate-from-concept`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw createApiRequestError(errorData, 'Failed to generate concept tour');
    }

    return await response.json();
  } catch (error) {
    console.error('Error generating concept tour:', error);
    if (error && typeof error === 'object' && 'code' in error) throw error;
    throw new Error('Failed to generate tour from concept. Please try again.');
  }
}

export async function listFlexiblePassCities(language: Language): Promise<FlexiblePassCitySummary[]> {
  try {
    const queryParams = new URLSearchParams({ language });
    const response = await fetch(`${API_BASE_URL}/v1/passes/flexible/cities?${queryParams.toString()}`, {
      headers: {
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to fetch flexible pass cities');
    }

    const data = await response.json();
    return data.data as FlexiblePassCitySummary[];
  } catch (error) {
    console.error('Error fetching flexible pass cities:', error);
    throw new Error('Failed to fetch flexible pass cities. Please try again.');
  }
}

export async function getFlexiblePassOptions(city: string, countryCode: string, language: Language): Promise<FlexiblePassOptionsResponse> {
  try {
    const queryParams = new URLSearchParams({ city, countryCode, language });
    const response = await fetch(`${API_BASE_URL}/v1/passes/flexible/options?${queryParams.toString()}`, {
      headers: {
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      }
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to fetch flexible pass options');
    }

    const data = await response.json();
    return data.data as FlexiblePassOptionsResponse;
  } catch (error) {
    console.error('Error fetching flexible pass options:', error);
    throw new Error('Failed to fetch flexible pass options. Please try again.');
  }
}

export async function quoteFlexiblePass(request: FlexiblePassQuoteRequest): Promise<FlexiblePassQuoteResponse> {
  try {
    const response = await fetch(`${API_BASE_URL}/v1/passes/flexible/quote`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      },
      body: JSON.stringify(request),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Failed to quote flexible pass');
    }

    const data = await response.json();
    return data.data as FlexiblePassQuoteResponse;
  } catch (error) {
    console.error('Error quoting flexible pass:', error);
    throw new Error('Failed to quote flexible pass. Please try again.');
  }
}

export async function getTour(id: string): Promise<Tour> {
  try {
    console.log(`Fetching tour with ID: ${id}`);
    
    const response = await fetch(`${FRONTEND_TOUR_API}/tours/${encodeURIComponent(id)}`);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Tour fetch error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to fetch tour');
    }
    
    const tourData = await response.json();
    console.log(`Tour fetched successfully with ${tourData.places?.length || 0} places`);
    
    return tourData;
  } catch (error) {
    console.error('Error fetching tour:', error);
    throw new Error('Failed to fetch tour. Please try again.');
  }
}

export function getWalkingRoute(id: string): Promise<WalkingRoute> {
  const existingRequest = walkingRouteRequests.get(id);
  if (existingRequest) return existingRequest;

  const request = (async () => {
    const response = await fetch(
      `${FRONTEND_TOUR_API}/tours/${encodeURIComponent(id)}/walking-route`
    );
    const payload = await response.json();
    if (!response.ok) {
      throw createApiRequestError(payload, 'Walking route is unavailable');
    }

    const route = payload && typeof payload === 'object' && 'data' in payload
      ? (payload as { data: unknown }).data
      : null;
    if (!isWalkingRoute(route)) {
      throw new Error('Walking route is unavailable');
    }

    return route;
  })();

  walkingRouteRequests.set(id, request);
  const forgetRequest = () => {
    if (walkingRouteRequests.get(id) === request) walkingRouteRequests.delete(id);
  };
  void request.then(forgetRequest, forgetRequest);
  return request;
}

export async function listTours(params?: TourListParams): Promise<Tour[]> {
  try {
    console.log('Fetching tours with params:', params);
    
    // Build query string from params
    const queryParams = new URLSearchParams();
    if (params?.city) queryParams.append('city', params.city);
    if (params?.countryCode) queryParams.append('countryCode', params.countryCode);
    if (params?.theme) queryParams.append('theme', params.theme);
    if (params?.language) queryParams.append('language', params.language);
    if (typeof params?.readyOnly === 'boolean') queryParams.append('readyOnly', String(params.readyOnly));
    if (params?.limit) queryParams.append('limit', params.limit.toString());
    if (params?.offset) queryParams.append('offset', params.offset.toString());
    
    const queryString = queryParams.toString();
    const url = `${FRONTEND_TOUR_API}/tours${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url);
    
    if (!response.ok) {
      const errorData = await response.json();
      console.error('Tours list fetch error:', errorData);
      throw new Error(errorData.error?.message || 'Failed to fetch tours');
    }
    
    const data = await response.json();
    const tours = data.data?.tours || [];
    console.log(`Fetched ${tours.length} tours successfully`);
    
    return tours;
  } catch (error) {
    console.error('Error listing tours:', error);
    throw new Error('Failed to fetch tours. Please try again.');
  }
}

export async function createGenerationJob(request: TourRequest): Promise<GenerationJob> {
  const response = await fetch(`${FRONTEND_TOUR_API}/generation-jobs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(request),
  });
  const data = await response.json();
  if (!response.ok) throw createApiRequestError(data, 'Failed to start tour generation');
  return data as GenerationJob;
}

export async function getGenerationJob(id: string): Promise<GenerationJob> {
  const response = await fetch(`${FRONTEND_TOUR_API}/generation-jobs/${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = createApiRequestError(data, 'Failed to load generation progress');
    error.status = response.status;
    const retryAfter = response.headers.get('retry-after')?.trim();
    if (retryAfter) {
      const delay = /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000
        : /[a-z]/i.test(retryAfter) ? Date.parse(retryAfter) - Date.now() : NaN;
      if (Number.isFinite(delay)) error.retryAfterMs = Math.max(0, delay);
    }
    throw error;
  }
  return data as GenerationJob;
}
