import { NextRequest, NextResponse } from 'next/server';

interface NominatimResult {
  place_id: number;
  lat: string;
  lon: string;
  display_name: string;
  addresstype: string;
  osm_type: 'node' | 'way' | 'relation';
  osm_id: number;
  address: {
    city?: string;
    town?: string;
    village?: string;
    country?: string;
    country_code?: string;
  };
}

const NOMINATIM_BASE_URL = 'https://nominatim.openstreetmap.org';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const query = request.nextUrl.searchParams.get('q')?.trim();

  if (!query) {
    return NextResponse.json([]);
  }

  const response = await fetch(
    `${NOMINATIM_BASE_URL}/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&featuretype=city`,
    {
      headers: {
        'User-Agent': 'TourGuideApp/1.0',
        'Accept-Language': 'en-US,en;q=0.5',
      },
    }
  );

  if (!response.ok) {
    return NextResponse.json(
      { error: 'Failed to fetch city suggestions' },
      { status: response.status }
    );
  }

  const results = (await response.json()) as NominatimResult[];
  const cities = results
    .filter((result) => {
      const validAddresstype = ['city', 'town', 'village'].includes(result.addresstype);
      const validOsmType = ['node', 'way', 'relation'].includes(result.osm_type);
      const validOsmId = Number.isSafeInteger(result.osm_id) && result.osm_id > 0;
      const lat = Number(result.lat);
      const lng = Number(result.lon);
      const validCoords =
        typeof result.lat === 'string' && result.lat.trim() !== '' &&
        typeof result.lon === 'string' && result.lon.trim() !== '' &&
        Number.isFinite(lat) &&
        Number.isFinite(lng) &&
        lat >= -90 &&
        lat <= 90 &&
        lng >= -180 &&
        lng <= 180;

      return validAddresstype && validOsmType && validOsmId && validCoords;
    })
    .map((result) => {
      const cityName = result.address.city || result.address.town || result.address.village;

      return {
        city: cityName || result.display_name.split(',')[0].trim(),
        country: result.address.country || '',
        countryCode: result.address.country_code?.toUpperCase() || '',
        coordinates: {
          lat: Number(result.lat),
          lng: Number(result.lon),
        },
        source: {
          provider: 'nominatim',
          osmType: result.osm_type,
          osmId: result.osm_id,
        },
      };
    })
    .filter((location) => location.city && location.country && location.countryCode);

  return NextResponse.json(cities);
}
