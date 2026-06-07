import { CityConceptDiscoveryResult, ConceptTourRequest, FlexiblePassCitySummary, FlexiblePassOptionsResponse, FlexiblePassQuoteRequest, FlexiblePassQuoteResponse, Tour, TourRequest, TourListParams, Language } from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001/api';

export type { TourListParams } from '@/types/api';

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
      const err = new Error(errorData.error?.message || 'Failed to generate tour') as Error & { code?: string };
      err.code = errorData.error?.code;
      throw err;
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
      const err = new Error(errorData.error?.message || 'Failed to generate concept tour') as Error & { code?: string };
      err.code = errorData.error?.code;
      throw err;
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
    
    const response = await fetch(`${API_BASE_URL}/v1/tours/${id}`, {
      headers: {
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      }
    });
    
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
    const url = `${API_BASE_URL}/v1/tours${queryString ? `?${queryString}` : ''}`;
    
    const response = await fetch(url, {
      headers: {
        'X-API-Key': process.env.NEXT_PUBLIC_API_KEY || 'development-api-key'
      }
    });
    
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
