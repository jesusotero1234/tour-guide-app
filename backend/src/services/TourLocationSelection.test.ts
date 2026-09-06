import { isTourLocationSelection, resolveSelectedTourLocation } from './TourLocationSelection';
import type { NarrativeAuthorityV7Get } from './poi/NarrativeAuthoritiesV7';

const seville = {
  source: { provider: 'nominatim' as const, osmType: 'relation' as const, osmId: 342563 },
  coordinates: { lat: 37.3886303, lng: -5.9953403 },
};

const place = {
  osm_type: 'relation',
  osm_id: 342563,
  addresstype: 'city',
  name: 'Seville',
  lat: '37.3886303',
  lon: '-5.9953403',
  address: { country_code: 'es', city: 'Seville' },
  namedetails: { 'name:es': 'Sevilla' },
  extratags: { wikidata: 'Q8717' },
};

function mockGet(data: unknown, status = 200): NarrativeAuthorityV7Get {
  return jest.fn().mockResolvedValue({ data, status });
}

describe('isTourLocationSelection', () => {
  it('accepts the Seville fixture', () => {
    expect(isTourLocationSelection(seville)).toBe(true);
  });

  it.each([
    ['null', null],
    ['array', [seville]],
    ['string', 'seville'],
    ['missing source', { coordinates: seville.coordinates }],
    ['source array', { source: [], coordinates: seville.coordinates }],
    ['missing coordinates', { source: seville.source }],
    ['coordinates array', { source: seville.source, coordinates: [] }],
    ['wrong provider', { ...seville, source: { ...seville.source, provider: 'geocoding' } }],
    ['wrong osmType', { ...seville, source: { ...seville.source, osmType: 'planet' } }],
    ['osmId zero', { ...seville, source: { ...seville.source, osmId: 0 } }],
    ['osmId negative', { ...seville, source: { ...seville.source, osmId: -1 } }],
    ['osmId fractional', { ...seville, source: { ...seville.source, osmId: 1.5 } }],
    ['osmId unsafe integer', { ...seville, source: { ...seville.source, osmId: Number.MAX_SAFE_INTEGER + 1 } }],
    ['lat null', { ...seville, coordinates: { lat: null, lng: seville.coordinates.lng } }],
    ['lat array', { ...seville, coordinates: { lat: [1], lng: seville.coordinates.lng } }],
    ['lat NaN', { ...seville, coordinates: { lat: NaN, lng: seville.coordinates.lng } }],
    ['lat Infinity', { ...seville, coordinates: { lat: Infinity, lng: seville.coordinates.lng } }],
    ['lat out of range', { ...seville, coordinates: { lat: 91, lng: seville.coordinates.lng } }],
    ['lng out of range', { ...seville, coordinates: { lat: seville.coordinates.lat, lng: 181 } }],
  ])('rejects %s', (_label, value) => {
    expect(isTourLocationSelection(value)).toBe(false);
  });
});

describe('resolveSelectedTourLocation', () => {
  it('returns the provider Wikidata QID and uses the fixed lookup URL with required options', async () => {
    const get = mockGet([place]);
    const result = await resolveSelectedTourLocation(
      { city: 'Seville', countryCode: 'es', location: seville },
      get,
    );
    expect(result).toEqual({ wikidataQid: 'Q8717' });
    expect(get).toHaveBeenCalledTimes(1);
    expect(get).toHaveBeenCalledWith(
      'https://nominatim.openstreetmap.org/lookup',
      {
        osm_ids: 'R342563',
        format: 'jsonv2',
        addressdetails: '1',
        extratags: '1',
        namedetails: '1',
        'accept-language': 'en',
      },
    );
  });

  it('accepts the Spanish alias Sevilla', async () => {
    const get = mockGet([place]);
    const result = await resolveSelectedTourLocation(
      { city: 'Sevilla', countryCode: 'es', location: seville },
      get,
    );
    expect(result).toEqual({ wikidataQid: 'Q8717' });
  });

  it('does not allow a fake client wikidataQid field to override the provider link', async () => {
    const get = mockGet([place]);
    const result = await resolveSelectedTourLocation(
      { city: 'Seville', countryCode: 'es', location: { ...seville, wikidataQid: 'Q999999' } as never },
      get,
    );
    expect(result).toEqual({ wikidataQid: 'Q8717' });
  });

  it('returns an empty object when the wikidata tag is missing', async () => {
    const get = mockGet([{ ...place, extratags: {} }]);
    const result = await resolveSelectedTourLocation(
      { city: 'Seville', countryCode: 'es', location: seville },
      get,
    );
    expect(result).toEqual({});
  });

  it('rejects invalid public input before calling HTTP', async () => {
    const get = mockGet([place]);
    await expect(
      resolveSelectedTourLocation(
        { city: 'Seville', countryCode: 'es', location: { ...seville, source: { ...seville.source, osmId: -1 } } },
        get,
      ),
    ).rejects.toThrow('DESTINATION_REVIEW_REQUIRED: invalid selected location');
    expect(get).not.toHaveBeenCalled();
  });

  it('propagates the original transport error', async () => {
    const get = jest.fn().mockRejectedValue(new Error('network down'));
    await expect(
      resolveSelectedTourLocation({ city: 'Seville', countryCode: 'es', location: seville }, get),
    ).rejects.toThrow('network down');
  });

  it('throws LOCATION_LOOKUP_UNAVAILABLE for non-success status', async () => {
    const get = mockGet([place], 503);
    await expect(
      resolveSelectedTourLocation({ city: 'Seville', countryCode: 'es', location: seville }, get),
    ).rejects.toThrow('LOCATION_LOOKUP_UNAVAILABLE');
  });

  it.each([
    ['mismatched osm_type', { ...place, osm_type: 'node' }],
    ['mismatched osm_id', { ...place, osm_id: 999999 }],
    ['wrong country', { ...place, address: { country_code: 'fr', city: 'Seville' } }],
    ['wrong name', { ...place, name: 'Madrid', address: { country_code: 'es', city: 'Madrid' }, namedetails: { 'name:es': 'Madrid' } }],
    ['coordinates over 1km', { ...place, lat: '37.5', lon: '-5.9953403' }],
    ['non-city addresstype', { ...place, addresstype: 'suburb' }],
    ['invalid provider lat', { ...place, lat: 'abc' }],
    ['invalid provider lon', { ...place, lon: '999' }],
    ['invalid wikidata link', { ...place, extratags: { wikidata: 'Q0' } }],
  ])('rejects %s', async (_label, data) => {
    const get = mockGet([data]);
    await expect(
      resolveSelectedTourLocation({ city: 'Seville', countryCode: 'es', location: seville }, get),
    ).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
  });

  it.each([
    ['missing result', []],
    ['multiple results', [place, place]],
    ['non-array data', { osm_type: 'relation' }],
  ])('rejects %s', async (_label, data) => {
    const get = mockGet(data);
    await expect(
      resolveSelectedTourLocation({ city: 'Seville', countryCode: 'es', location: seville }, get),
    ).rejects.toThrow('DESTINATION_REVIEW_REQUIRED');
  });
});
