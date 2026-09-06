import { normalizeNarrativeIdentityTextV8 } from './poi/NarrativeAuthoritiesV7';
import type { NarrativeAuthorityV7Get } from './poi/NarrativeAuthoritiesV7';

export interface TourLocationSelection {
  source: {
    provider: 'nominatim';
    osmType: 'node' | 'way' | 'relation';
    osmId: number;
  };
  coordinates: { lat: number; lng: number };
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown> : undefined;
}

function validCoordinate(value: unknown, limit: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && Math.abs(value) <= limit;
}

export function isTourLocationSelection(value: unknown): value is TourLocationSelection {
  const selection = record(value);
  const source = record(selection?.source);
  const coordinates = record(selection?.coordinates);
  return source?.provider === 'nominatim'
    && typeof source.osmType === 'string' && ['node', 'way', 'relation'].includes(source.osmType)
    && typeof source.osmId === 'number' && Number.isSafeInteger(source.osmId) && source.osmId > 0
    && validCoordinate(coordinates?.lat, 90) && validCoordinate(coordinates?.lng, 180);
}

function review(reason: string): never {
  throw new Error('DESTINATION_REVIEW_REQUIRED: ' + reason);
}

function providerCoordinate(value: unknown, limit: number): number {
  const parsed = typeof value === 'string' && value.trim() ? Number(value) : value;
  if (!validCoordinate(parsed, limit)) review('selected city has invalid provider coordinates');
  return parsed;
}

function distanceMeters(a: TourLocationSelection['coordinates'], b: TourLocationSelection['coordinates']): number {
  const radians = (degrees: number) => degrees * Math.PI / 180;
  const h = Math.sin(radians(b.lat - a.lat) / 2) ** 2
    + Math.cos(radians(a.lat)) * Math.cos(radians(b.lat)) * Math.sin(radians(b.lng - a.lng) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}

/** Re-fetch the OSM object; public request fields cannot supply a trusted Wikidata ID. */
export async function resolveSelectedTourLocation(
  input: { city: string; countryCode: string; location: TourLocationSelection },
  get: NarrativeAuthorityV7Get
): Promise<{ wikidataQid?: string }> {
  if (!isTourLocationSelection(input.location)) review('invalid selected location');
  const { source, coordinates } = input.location;
  const prefix = { node: 'N', way: 'W', relation: 'R' }[source.osmType];
  const response = await get('https://nominatim.openstreetmap.org/lookup', {
    osm_ids: prefix + source.osmId,
    format: 'jsonv2',
    addressdetails: '1',
    extratags: '1',
    namedetails: '1',
    'accept-language': 'en',
  });
  if (typeof response.status !== 'number' || response.status < 200 || response.status >= 300) {
    throw new Error('LOCATION_LOOKUP_UNAVAILABLE');
  }
  if (!Array.isArray(response.data) || response.data.length !== 1) {
    review('selected OSM city was not uniquely found');
  }
  const place = record(response.data[0]);
  if (!place || place.osm_type !== source.osmType || Number(place.osm_id) !== source.osmId) {
    review('selected OSM identity does not match the provider');
  }
  if (!['city', 'town', 'village'].includes(String(place.addresstype))) {
    review('selected OSM object is not a city, town or village');
  }
  const address = record(place.address);
  if (typeof address?.country_code !== 'string'
    || address.country_code.toUpperCase() !== input.countryCode.toUpperCase()) {
    review('selected city does not match the country');
  }
  const names = [
    place.name, address.city, address.town, address.village,
    typeof place.display_name === 'string' ? place.display_name.split(',')[0] : undefined,
    ...Object.values(record(place.namedetails) ?? {}),
  ];
  const name = normalizeNarrativeIdentityTextV8(input.city);
  if (!name || !names.some(value => typeof value === 'string'
    && normalizeNarrativeIdentityTextV8(value) === name)) {
    review('selected city does not match the name');
  }
  const providerCoordinates = {
    lat: providerCoordinate(place.lat, 90),
    lng: providerCoordinate(place.lon, 180),
  };
  // Allow small centroid updates, but require re-selection after a material location change.
  if (distanceMeters(coordinates, providerCoordinates) > 1000) {
    review('selected city coordinates do not match the provider');
  }
  const qid = record(place.extratags)?.wikidata;
  if (qid === undefined) return {};
  if (typeof qid !== 'string' || !/^Q[1-9][0-9]*$/u.test(qid)) {
    review('selected city has an invalid Wikidata link');
  }
  return { wikidataQid: qid };
}
