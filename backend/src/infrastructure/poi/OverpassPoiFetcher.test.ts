import { promises as fs } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { GeocodedCity } from '../../domain/geocoder/GeocoderTypes';
import { fetchPoisForTheme, buildQuery } from './OverpassPoiFetcher';
import { requestOverpass, OverpassCoordinatorError } from './OverpassCoordinator';
import { overpassQueryCache } from './OverpassQueryCache';
import { fetchStaticOsmPois } from './StaticOsmPoiFallback';

jest.mock('./OverpassCoordinator', () => ({
  ...jest.requireActual('./OverpassCoordinator'), requestOverpass: jest.fn(),
}));
jest.mock('./OverpassQueryCache', () => ({ overpassQueryCache: {
  directory: '/tmp/cache', ttlMs: 604800000,
  getOrFetch: jest.fn((_city, _query, load) => load()),
} }));
jest.mock('./StaticOsmPoiFallback', () => ({ fetchStaticOsmPois: jest.fn() }));
jest.mock('./WikidataCanonicalPoiFetcher', () => ({
  fetchCanonicalWikidataPois: jest.fn(async () => []), mergeCanonicalWikidataPois: jest.fn(pois => pois),
}));
const city: GeocodedCity = {
  osmType: 'relation', osmId: 170100, countryCode: 'FR', wikidataId: null, displayName: 'Nice', lat: 43.7, lng: 7.25,
  boundingBox: { minLat: 43.65, maxLat: 43.75, minLng: 7.2, maxLng: 7.3 },
};
const pois = [{ osmType: 'way' as const, osmId: 123, lat: 43.7, lng: 7.25, name: 'Museum', tags: { wikidata: 'Q123' } }];
const request = requestOverpass as jest.MockedFunction<typeof requestOverpass>;
const staticFallback = fetchStaticOsmPois as jest.MockedFunction<typeof fetchStaticOsmPois>;

describe('POI fetcher uses the shared map coordinator', () => {
  let directory: string;
  const previous = process.env.SOURCE_ACQUISITION_DIR;
  beforeEach(async () => {
    directory = await fs.mkdtemp(join(tmpdir(), 'source-fetcher-'));
    process.env.SOURCE_ACQUISITION_DIR = directory;
    jest.clearAllMocks();
    request.mockResolvedValue({ status: 'ok', coordinated: true, pois, cacheHit: false, provenance: { endpoint: 'provider' } });
    staticFallback.mockResolvedValue({ pois, provenance: { source: 'geofabrik-static' } });
  });
  afterEach(async () => {
    if (previous === undefined) delete process.env.SOURCE_ACQUISITION_DIR;
    else process.env.SOURCE_ACQUISITION_DIR = previous;
    await fs.rm(directory, { recursive: true, force: true });
  });
  it('passes the original complete query, identity, cache namespace and TTL unchanged', async () => {
    expect(await fetchPoisForTheme(city, 'art')).toEqual(pois);
    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({ cityKey: 'relation:170100', query: buildQuery(city, 'art'),
      cacheDirectory: '/tmp/cache', ttlMs: 604800000 });
    expect(request.mock.calls[0][0].query).toContain('43.65,7.2,43.75,7.3');
  });
  it('records structured shared waits without adding local retry loops', async () => {
    request.mockRejectedValue(new OverpassCoordinatorError({ status: 'waiting', coordinated: true, type: 'source_wait',
      message: 'Cooling down', attempts: 2, retryNotBefore: '2026-09-20T20:00:00Z' }));
    await expect(fetchPoisForTheme(city, 'art')).rejects.toThrow('Cooling down');
    expect(request).toHaveBeenCalledTimes(1);
    const failure = JSON.parse(await fs.readFile(join(directory, 'source-failure.json'), 'utf8'));
    expect(failure).toMatchObject({ coordinated: true, type: 'source_wait', attempts: 2, cityKey: 'relation:170100',
      retryNotBefore: '2026-09-20T20:00:00Z', query: buildQuery(city, 'art') });
  });
  it('does not download when the existing POI cache satisfies the request', async () => {
    (overpassQueryCache.getOrFetch as jest.Mock).mockResolvedValueOnce(pois);
    expect(await fetchPoisForTheme(city, 'art')).toEqual(pois);
    expect(request).not.toHaveBeenCalled();
  });
  it('uses the static country extract only after shared recovery is exhausted', async () => {
    request.mockRejectedValue(new OverpassCoordinatorError({ status: 'error', coordinated: true,
      type: 'source_recovery_exhausted', message: 'Recovery exhausted' }));
    expect(await fetchPoisForTheme(city, 'art')).toEqual(pois);
    expect(staticFallback).toHaveBeenCalledWith(expect.objectContaining({ city, queryHash: expect.stringMatching(/^[a-f0-9]{64}$/),
      areaLimit: 120, nodeLimit: 60 }));
  });
  it('queries reviewed identities directly and preserves them through the acquisition cap', async () => {
    const protectedPoi = { osmType: 'relation' as const, osmId: 999, lat: 43.701, lng: 7.251,
      name: 'Reviewed landmark', tags: { wikidata: 'Q999', wikipedia: 'en:Reviewed landmark', tourism: 'attraction' } };
    request.mockImplementation(async input => ({ status: 'ok', coordinated: true,
      pois: input.query.includes('Q999') ? [protectedPoi] : pois, cacheHit: false,
      provenance: { endpoint: 'provider' } }));

    const result = await fetchPoisForTheme(city, 'history', ['Q999']);

    expect(result.some(poi => poi.tags.wikidata === 'Q999')).toBe(true);
    expect(request.mock.calls.some(call => call[0].query.includes('["wikidata"~"^(Q999)$"]'))).toBe(true);
  });
  it('keeps failed history groups unavailable when both public and static sources fail', async () => {
    request.mockRejectedValue(new OverpassCoordinatorError({ status: 'error', coordinated: true,
      type: 'source_recovery_exhausted', message: 'Recovery exhausted' }));
    staticFallback.mockRejectedValue(new Error('Geofabrik checksum failed'));
    await expect(fetchPoisForTheme(city, 'history')).rejects.toThrow('Geofabrik checksum failed');
    const manifest = JSON.parse(await fs.readFile(join(directory, 'overpass-manifest.json'), 'utf8'));
    expect(manifest).toMatchObject({ status: 'unavailable', completedGroups: [], failedGroup: 0 });
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('fails closed and records a worker/protocol failure for the supervisor', async () => {
    request.mockRejectedValue(new Error('flock not found'));
    await expect(fetchPoisForTheme(city, 'art')).rejects.toThrow('flock not found');
    const failure = JSON.parse(await fs.readFile(join(directory, 'source-failure.json'), 'utf8'));
    expect(failure.type).toBe('coordinator_unavailable');
    expect(request).toHaveBeenCalledTimes(1);
  });
  it('rejects a malformed worker success instead of inventing an empty city', async () => {
    request.mockResolvedValue({ status: 'ok', coordinated: true });
    await expect(fetchPoisForTheme(city, 'art')).rejects.toThrow('missing POIs');
  });
});
