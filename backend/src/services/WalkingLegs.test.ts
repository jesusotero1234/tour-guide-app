import { completeCueManifest, cueText } from './TourCues';
import { computeWalkingLegs, decodePolyline, encodePolyline, pairKey, validWalkingLegs, walkingLegsSha256 } from './WalkingLegs';

describe('polyline codec', () => {
  it('matches the reference example of the algorithm', () => {
    const points: Array<[number, number]> = [[38.5, -120.2], [40.7, -120.95], [43.252, -126.453]];
    expect(encodePolyline(points)).toBe('_p~iF~ps|U_ulLnnqC_mqNvxq`@');
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual(points);
  });
  it('round-trips at precision 5 and refuses garbage', () => {
    const path: Array<[number, number]> = [[39.47932, -0.37639], [39.47001, -0.37501], [39.4699, -0.3749]];
    expect(decodePolyline(encodePolyline(path))).toEqual(path);
    expect(() => decodePolyline('_p~iF~ps|')).toThrow();
    expect(() => decodePolyline(' ')).toThrow();
  });
});

describe('link-clip templates', () => {
  it('fill the destination name in every language, with no replacement-pattern surprises', () => {
    expect(cueText('first', 'es', 'Torres de Serranos')).toBe('Ahora, vamos hacia Torres de Serranos.');
    expect(cueText('next', 'de', "Straße $& 'x'")).toBe("Weiter zu Straße $& 'x'.");
    for (const lang of ['es', 'en', 'fr', 'de', 'it']) expect(cueText('finish', lang)).not.toContain('{name}');
    expect(() => cueText('next', 'es')).toThrow();
    expect(() => cueText('next', 'pt', 'X')).toThrow();
  });
  it('a manifest is complete only with every first, every next and one finish', () => {
    const ids = ['a', 'b'];
    const v = 'a'.repeat(64) + '.' + 'b'.repeat(64);
    const full = [{ kind: 'first', placeId: 'a', text: 't', version: v }, { kind: 'first', placeId: 'b', text: 't', version: v },
      { kind: 'next', placeId: 'a', text: 't', version: v }, { kind: 'next', placeId: 'b', text: 't', version: v }, { kind: 'finish', text: 't', version: v }];
    expect(completeCueManifest(full, ids)).toBe(true);
    expect(completeCueManifest(full.slice(1), ids)).toBe(false);
    expect(completeCueManifest([...full.slice(0, 4), { ...full[4], placeId: 'a' }], ids)).toBe(false);
    expect(completeCueManifest([...full.slice(0, 4), { kind: 'first', placeId: 'a', text: 't', version: v }], ids)).toBe(false);   // duplicate
    expect(completeCueManifest(full.map(e => ({ ...e, version: 'ZZ' })), ids)).toBe(false);
    expect(completeCueManifest(full.map(e => ({ ...e, text: ' ' })), ids)).toBe(false);
  });
});

describe('walking legs', () => {
  const stops = [{ id: 'c', latitude: 39.47, longitude: -0.37 }, { id: 'a', latitude: 39.48, longitude: -0.38 }, { id: 'b', latitude: 39.49, longitude: -0.36 }];
  const router = jest.fn(async (from: { latitude: number }, to: { latitude: number }) => ({
    distanceMeters: Math.abs(to.latitude - from.latitude) * 100000, durationSeconds: Math.abs(to.latitude - from.latitude) * 100000 / 1.3,
    coordinates: [[-0.37, from.latitude], [-0.36, to.latitude]] as Array<[number, number]> }));

  it('asks once per unordered pair, in a fixed direction, and the result is valid', async () => {
    router.mockClear();
    const legs = await computeWalkingLegs(stops, router, 'fossgis-osrm-foot', () => new Date('2026-10-01T00:00:00Z'));
    expect(router).toHaveBeenCalledTimes(3);
    expect(legs.stopIds).toEqual(['c', 'a', 'b']);
    expect(Object.keys(legs.geometries).sort()).toEqual([pairKey('a', 'b'), pairKey('a', 'c'), pairKey('b', 'c')].sort());
    expect(legs.durationsSeconds[0][1]).toBe(legs.durationsSeconds[1][0]);
    expect(legs.durationsSeconds[1][1]).toBe(0);
    expect(validWalkingLegs(legs, ['a', 'b', 'c'])).toBe(true);
  });

  it('is rejected when anything is missing, wrong or not finite', async () => {
    const legs = await computeWalkingLegs(stops, router);
    const ids = ['a', 'b', 'c'];
    const clone = () => JSON.parse(JSON.stringify(legs));
    expect(validWalkingLegs(legs, ['a', 'b'])).toBe(false);
    expect(validWalkingLegs(legs, ['a', 'b', 'x'])).toBe(false);
    const missing = clone(); delete missing.geometries[pairKey('a', 'b')];
    expect(validWalkingLegs(missing, ids)).toBe(false);
    const broken = clone(); broken.geometries[pairKey('a', 'b')] = '!!';
    expect(validWalkingLegs(broken, ids)).toBe(false);
    const diagonal = clone(); diagonal.durationsSeconds[0][0] = 5;
    expect(validWalkingLegs(diagonal, ids)).toBe(false);
    const infinite = clone(); infinite.distancesMeters[0][1] = null;
    expect(validWalkingLegs(infinite, ids)).toBe(false);
    expect(validWalkingLegs({ ...clone(), version: 2 }, ids)).toBe(false);
  });

  it('its hash ignores provider and computedAt but not the content', async () => {
    const a = await computeWalkingLegs(stops, router, 'p1', () => new Date('2026-10-01T00:00:00Z'));
    const b = await computeWalkingLegs(stops, router, 'p2', () => new Date('2027-01-01T00:00:00Z'));
    expect(walkingLegsSha256(a)).toBe(walkingLegsSha256(b));
    expect(walkingLegsSha256(a)).toMatch(/^[a-f0-9]{64}$/);
    b.durationsSeconds[0][1] += 1; b.durationsSeconds[1][0] += 1;
    expect(walkingLegsSha256(a)).not.toBe(walkingLegsSha256(b));
  });

  it('refuses an invalid route instead of storing it', async () => {
    await expect(computeWalkingLegs(stops, async () => ({ distanceMeters: NaN, durationSeconds: 1, coordinates: [[0, 0], [1, 1]] }))).rejects.toThrow('Invalid route');
    await expect(computeWalkingLegs(stops, async () => ({ distanceMeters: 1, durationSeconds: 1, coordinates: [[0, 0]] }))).rejects.toThrow('Invalid route');
  });
});
