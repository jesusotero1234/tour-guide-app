import { createHash } from 'crypto';
import { pieceAudioId, regenUuid, renderJobId } from './ids';
import { reassignImages } from './images';
import type { TourImage, TourImageSet } from '../../domain/entities/TourImage';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('ids', () => {
  it('are canonical UUIDs, as the audio store validates them', () => {
    for (const id of [regenUuid('a', 'b'), pieceAudioId('run', 'tour', 'cue:next', 'place', 'Siguiente parada: X.'), renderJobId('run', 'es', 3)]) expect(id).toMatch(UUID);
  });
  it('are deterministic, and depend on every part, spoken text included', () => {
    const base = pieceAudioId('run', 'tour', 'stop', 'p1', 'texto');
    expect(pieceAudioId('run', 'tour', 'stop', 'p1', 'texto')).toBe(base);
    for (const other of [pieceAudioId('run2', 'tour', 'stop', 'p1', 'texto'), pieceAudioId('run', 'tour2', 'stop', 'p1', 'texto'), pieceAudioId('run', 'tour', 'introduction', 'p1', 'texto'),
      pieceAudioId('run', 'tour', 'stop', 'p2', 'texto'), pieceAudioId('run', 'tour', 'stop', 'p1', 'texto distinto')]) expect(other).not.toBe(base);
    expect(renderJobId('run', 'es', 1)).not.toBe(renderJobId('run', 'es', 2));
    expect(renderJobId('run', 'es', 1)).not.toBe(renderJobId('run', 'fr', 1));
  });
});

const image = (id: string, role: 'primary' | 'detail', index: number, text: string): TourImage => ({
  id, role, paragraphId: 'old', paragraphIndex: index, paragraphText: text, caption: 'c', alt: 'a', url: 'https://upload.wikimedia.org/' + id, sourceUrl: 's', sourceTitle: 't',
  author: 'a', license: 'l', licenseUrl: 'u', attribution: 'at', changes: 'none', width: 1, height: 1, entityId: 'Q1', identityEvidence: 'wikidata-p18', verifiedAt: 'v', visualReason: 'r' });
const set = (images: TourImage[], sourceText = 'old'): TourImageSet => ({ version: 1, sourceText, status: 'ready', images });

describe('reassignImages', () => {
  const p1 = 'La puerta se levantó en 1398 y defendía la entrada norte de la ciudad.';
  const p2 = 'Durante la guerra sirvió de almacén de obras de arte del museo.';
  const p3 = 'Hoy se puede subir a lo alto y entender la forma de la muralla antigua.';

  it('keeps a photo on its paragraph when the text did not change, and rebinds the source text', () => {
    const { images, moves } = reassignImages(set([image('a', 'primary', 0, p1)]), [p1, p2].join('\n\n'));
    expect(images!.sourceText).toBe([p1, p2].join('\n\n'));
    expect(images!.images[0]).toMatchObject({ paragraphIndex: 0, paragraphText: p1 });
    expect(images!.images[0].paragraphId).toBe(createHash('sha256').update(p1 + ':0').digest('hex'));
    expect(moves).toEqual([{ imageId: 'a', from: 0, to: 0, method: 'exact', score: 1 }]);
  });

  it('follows a paragraph that moved, and one that was lightly edited', () => {
    const edited = 'La puerta se levantó en 1398 y defendía la entrada norte de la ciudad vieja.';
    const { images, moves } = reassignImages(set([image('a', 'primary', 0, p1), image('b', 'detail', 1, p2)]), [p3, p2, edited].join('\n\n'));
    expect(images!.images.map(i => i.paragraphIndex)).toEqual([2, 1]);
    expect(images!.images[0].paragraphText).toBe(edited);
    expect(moves.map(m => m.method)).toEqual(['similar', 'exact']);
  });

  it('never leaves a photo without a paragraph, and flags the guesses', () => {
    const unrelated = 'Aquí se celebraba el mercado de la seda cada domingo por la mañana.';
    const { images, moves } = reassignImages(set([image('a', 'primary', 0, p1)]), [unrelated, p3 + ' ' + 'puerta'].join('\n\n'));
    expect(images!.images[0].paragraphIndex).toBeGreaterThanOrEqual(0);
    expect(['nearest', 'first']).toContain(moves[0].method);
    const none = reassignImages(set([image('a', 'primary', 0, p1)]), 'Zzz yyy.\n\nQqq www.');
    expect(none.moves[0]).toMatchObject({ method: 'first', to: 0 });
  });

  it('is a no-op for a stop without photos and empties the set for an empty text', () => {
    expect(reassignImages(undefined, 'x')).toEqual({ images: undefined, moves: [] });
    expect(reassignImages(set([image('a', 'primary', 0, p1)]), '').images!.images).toEqual([]);
  });
});

import { computeWalkingLegs, decodePolyline, pairKey, validWalkingLegs, walkingLegsSha256 } from '../WalkingLegs';
import { baseKeyOf, remapLegs, stopsInOrder } from './legsPlan';

describe('base routes and walking legs', () => {
  const place = (position: number, latitude: number, longitude: number) => ({ position, latitude, longitude });
  const tour = (places: ReturnType<typeof place>[]) => ({ countryCode: 'es', theme: 'history', places });

  it('the same route has the same base key in every language, whatever order the rows come in', () => {
    const a = tour([place(0, 39.47931, -0.37639), place(1, 39.47, -0.375)]);
    expect(baseKeyOf(a)).toBe(baseKeyOf({ ...a, countryCode: 'ES', places: [...a.places].reverse() }));
    expect(baseKeyOf(a)).not.toBe(baseKeyOf({ ...a, theme: 'food' }));
    expect(baseKeyOf(a)).not.toBe(baseKeyOf(tour([place(0, 39.47, -0.375), place(1, 39.47931, -0.37639)])));      // the order of the route matters
    expect(baseKeyOf(a)).toMatch(/^[a-f0-9]{16}$/);
  });

  const stops = [{ id: 'm', latitude: 39.47, longitude: -0.37 }, { id: 'c', latitude: 39.48, longitude: -0.38 }, { id: 'x', latitude: 39.49, longitude: -0.36 }];
  const router = async (a: { latitude: number; longitude: number }, b: { latitude: number; longitude: number }) => ({
    distanceMeters: 1000 * Math.abs(a.latitude - b.latitude) * 100, durationSeconds: 60, coordinates: [[a.longitude, a.latitude], [(a.longitude + b.longitude) / 2, (a.latitude + b.latitude) / 2 + 0.001], [b.longitude, b.latitude]] as Array<[number, number]> });

  it('remapping keeps matrices, validates for the new ids and reverses geometry exactly when the order of the ids flips', async () => {
    const base = await computeWalkingLegs(stops, router);
    const newIds = ['b', 'a', 'z'];                               // 'm' < 'c' is false but 'b' < 'a' is false too; 'a' < 'z'
    const remapped = remapLegs(base, newIds);
    expect(validWalkingLegs(remapped, newIds)).toBe(true);
    expect(remapped.durationsSeconds).toEqual(base.durationsSeconds);
    // base pair (c, m) is stored c -> m; for the tour it is the pair (a, b) stored a -> b. Stops: base m = tour b, base c = tour a: same direction.
    expect(decodePolyline(remapped.geometries[pairKey('a', 'b')])).toEqual(decodePolyline(base.geometries[pairKey('c', 'm')]));
    // base pair (m, x) is stored m -> x; for the tour it is (b, z), stored b -> z: m -> x again, same direction.
    expect(decodePolyline(remapped.geometries[pairKey('b', 'z')])).toEqual(decodePolyline(base.geometries[pairKey('m', 'x')]));
    const flipped = remapLegs(base, ['z', 'a', 'b']);            // base m=z, c=a, x=b: pair (m,x)=(z,b) is stored b -> z = x -> m: reversed
    expect(decodePolyline(flipped.geometries[pairKey('b', 'z')])).toEqual([...decodePolyline(base.geometries[pairKey('m', 'x')])].reverse());
    expect(validWalkingLegs(flipped, ['z', 'a', 'b'])).toBe(true);
  });

  it('whatever the ids are, every geometry runs from the place of the smaller id to the place of the larger one', async () => {
    const base = await computeWalkingLegs(stops, router);
    const near = (a: [number, number], b: { latitude: number; longitude: number }) => Math.abs(a[0] - b.latitude) < 1e-4 && Math.abs(a[1] - b.longitude) < 1e-4;
    for (const ids of [['a', 'b', 'c'], ['c', 'b', 'a'], ['b', 'c', 'a'], ['x', 'a', 'm'], ['q', 'z', 'k'], ['z', 'y', 'x']]) {
      const legs = remapLegs(base, ids);
      expect(validWalkingLegs(legs, ids)).toBe(true);
      for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) {
        const [lo, hi] = ids[i] < ids[j] ? [i, j] : [j, i];            // stop index of the smaller and of the larger id
        const path = decodePolyline(legs.geometries[pairKey(ids[i], ids[j])]);
        expect(near(path[0], stops[lo])).toBe(true);
        expect(near(path[path.length - 1], stops[hi])).toBe(true);
      }
    }
  });

  it('the hash of the remapped legs is stable and differs from the base when the ids differ', async () => {
    const base = await computeWalkingLegs(stops, router);
    expect(walkingLegsSha256(remapLegs(base, ['b', 'a', 'z']))).toBe(walkingLegsSha256(remapLegs(base, ['b', 'a', 'z'])));
    expect(walkingLegsSha256(remapLegs(base, ['b', 'a', 'z']))).not.toBe(walkingLegsSha256(base));
  });

  it('refuses a tour that does not fit its base', async () => {
    const base = await computeWalkingLegs(stops, router);
    expect(() => remapLegs(base, ['a', 'b'])).toThrow('different number');
    expect(() => remapLegs(base, ['a', 'a', 'b'])).toThrow('different number');
    expect(stopsInOrder([{ position: 2 }, { position: 0 }, { position: 1 }]).map(p => p.position)).toEqual([0, 1, 2]);
  });
});
