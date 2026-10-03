import { pilotFingerprint, presentPilotTour } from './PilotRelease';
import type { Tour } from '../domain/entities/Tour';
import type { TourAudioState } from './TourAudioService';

/**
 * The backend is deployed before the data of the regeneration (plan 04 section 10.2). Every field added to the fingerprint
 * since then must be absent from the hash unless it has a value, or all 216 published tours stop being admitted.
 * These constants were computed with the code that was in production on 2026-10-01; they must never change for tours
 * that do not carry the new fields.
 */
const FULL = '489f7788a9cd0dea89c63f278238c87e291dd8a5849234e753e876cffc7c4c4c';
const MINIMAL = 'dfb40f3472e6234d266abb4e5b79b812f10240b31cb5f3177cec8fc85c3b347a';

const sourceCredits = {
  version: 'source-policy-test', items: [{ sourceId: 's1', title: 'Torres de Serranos', url: 'https://es.wikipedia.org/wiki/Torres_de_Serranos',
    attribution: 'Wikipedia', capturedAt: '2026-09-01T00:00:00.000Z', revisionUrl: 'https://es.wikipedia.org/w/index.php?oldid=1',
    license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', status: 'permitted', usage: 'text-adaptation' }],
};
const images = { version: 1, status: 'ready', sourceText: 'Texto de la primera parada en 1398.', images: [{ id: 'i1', role: 'primary', url: 'https://upload.wikimedia.org/a.jpg' }] };

function fixture(full: boolean): { tour: Tour; state: TourAudioState } {
  const ids = ['11111111-1111-4111-8111-111111111111', '22222222-2222-4222-8222-222222222222'];
  const tour = {
    id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', blueprintId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', city: 'Valencia', country: 'España',
    countryCode: 'ES', language: 'es', theme: 'history', durationMinutes: 120, status: 'published', createdAt: '2026-09-20', updatedAt: '2026-09-20',
    introduction: 'Valencia fue fundada en 138 a. C. y creció en el siglo XIV.',
    metadata: {
      ...(full ? { catalogTitle: 'Valencia esencial' } : {}),
      codexAuthor: { blueprintFingerprint: 'fp-1', legs: [] },
      pilotWalkingRoute: { provider: 'fossgis-osrm-foot', geometry: { type: 'LineString', coordinates: [[-0.3764, 39.4793], [-0.375, 39.47]] }, distanceMeters: 1200, durationSeconds: 900 },
    },
    places: ids.map((id, position) => ({
      id, tourId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', name: position ? 'Plaza de la Virgen' : 'Torres de Serranos',
      ...(full ? { nameInTourLanguage: position ? 'Plaza de la Virgen' : 'Torres de Serranos' } : {}),
      position, description: position ? 'Segunda parada, de 1262.' : 'Texto de la primera parada en 1398.',
      latitude: 39.47 + position / 100, longitude: -0.37, metadata: { sourceCredits, ...(full && !position ? { tourImages: images } : {}) },
    })),
  } as unknown as Tour;
  const state = {
    tourId: tour.id, status: 'completed', phase: 'completed', completedStops: 2, totalStops: 2,
    audioUrls: Object.fromEntries(ids.map(id => [id, '/api/backend/tours/x/audio/' + id])),
    audioVersions: { [ids[0]]: 'hash0.file0', [ids[1]]: 'hash1.file1' },
    transcripts: { [ids[0]]: 'Texto de la primera parada en 1398.', [ids[1]]: 'Segunda parada, de 1262.' },
    ...(full ? { introduction: { status: 'completed', text: 'Aviso.\n\nValencia fue fundada…', audioUrl: '/x', version: 'intro.file', durationSeconds: 60 } } : {}),
  } as unknown as TourAudioState;
  return { tour, state };
}

describe('pilotFingerprint stays byte-identical for tours without the new fields', () => {
  test('full legacy tour', () => {
    const { tour, state } = fixture(true);
    expect(pilotFingerprint(tour, state)).toBe(FULL);
  });

  test('minimal legacy tour', () => {
    const { tour, state } = fixture(false);
    expect(pilotFingerprint(tour, state)).toBe(MINIMAL);
  });

  test('absent, empty, null and undefined new fields do not change the hash', () => {
    const { tour, state } = fixture(true);
    (tour as unknown as Record<string, unknown>).introductionSpokenText = null;
    tour.places.forEach(place => { (place as unknown as Record<string, unknown>).spokenText = null; });
    expect(pilotFingerprint(tour, state)).toBe(FULL);
    (tour as unknown as Record<string, unknown>).introductionSpokenText = '';
    tour.places.forEach(place => { (place as unknown as Record<string, unknown>).spokenText = ''; });
    expect(pilotFingerprint(tour, state)).toBe(FULL);
    Object.assign(tour.metadata!, { orderFlexible: false, cueManifest: [], walkingLegsSha256: undefined });
    expect(pilotFingerprint(tour, state)).toBe(FULL);
  });
});

describe('the new fields enter the fingerprint when, and only when, they have a value', () => {
  const base = () => fixture(true);
  const withFields = (mutate: (tour: Tour) => void) => { const { tour, state } = base(); mutate(tour); return pilotFingerprint(tour, state); };

  test('spokenText of a stop and of the introduction', () => {
    const plain = pilotFingerprint(base().tour, base().state);
    const spoken = withFields(tour => { (tour.places[0] as { spokenText?: string }).spokenText = 'Texto de la primera parada en mil trescientos noventa y ocho.'; });
    const intro = withFields(tour => { tour.introductionSpokenText = 'Valencia fue fundada.'; });
    expect(new Set([plain, spoken, intro]).size).toBe(3);
    expect(withFields(tour => { (tour.places[0] as { spokenText?: string }).spokenText = 'Texto de la primera parada en mil trescientos noventa y ocho.'; })).toBe(spoken);
  });

  test('orderFlexible, the link clips and the walking legs', () => {
    const plain = pilotFingerprint(base().tour, base().state);
    const flexible = withFields(tour => { tour.metadata!.orderFlexible = true; });
    const cues = [{ kind: 'next' as const, placeId: 'b', text: 'Siguiente parada: B.', version: 'v1' }, { kind: 'first' as const, placeId: 'a', text: 'Primera parada: A.', version: 'v2' },
      { kind: 'finish' as const, text: 'Aquí termina el paseo.', version: 'v3' }];
    const withCues = withFields(tour => { tour.metadata!.cueManifest = cues; });
    const reordered = withFields(tour => { tour.metadata!.cueManifest = [...cues].reverse(); });
    const changed = withFields(tour => { tour.metadata!.cueManifest = cues.map(cue => ({ ...cue, version: cue.version + 'x' })); });
    const legs = withFields(tour => { tour.metadata!.walkingLegsSha256 = 'abc123'; });
    expect(new Set([plain, flexible, withCues, changed, legs]).size).toBe(5);
    expect(reordered).toBe(withCues);                      // the manifest is hashed in a canonical order
  });
});

describe('spokenText never leaves the backend', () => {
  test('the public tour has no spoken text, and neither do its transcripts', () => {
    const { tour, state } = fixture(true);
    tour.introductionSpokenText = 'Valencia fue fundada en ciento treinta y ocho antes de Cristo.';
    (tour.places[0] as { spokenText?: string }).spokenText = 'Texto de la primera parada en mil trescientos noventa y ocho.';
    (tour.metadata as { pilotRelease?: unknown }).pilotRelease = { approvalMode: 'owner-authorized', reviewedAt: '2026-09-01', fingerprint: 'x', scriptLicense: 'CC BY-SA 4.0', changes: 'c' };
    const json = JSON.stringify(presentPilotTour(tour, state));
    expect(json).not.toContain('spokenText');
    expect(json).not.toContain('mil trescientos noventa y ocho');
    expect(json).not.toContain('ciento treinta y ocho antes de Cristo');
    expect(json).toContain('Texto de la primera parada en 1398.');
  });
});
