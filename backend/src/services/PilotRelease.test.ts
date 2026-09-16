import { admittedToPilot, pilotFingerprint, presentPilotTour, PilotRelease } from './PilotRelease';
import { SOURCE_POLICY_VERSION } from './poi/SourceUsePolicy';
import type { Tour } from '../domain/entities/Tour';
import type { TourAudioState } from './TourAudioService';
export function pilotFixture() {
  const tour: Tour = { id: '11111111-1111-4111-8111-111111111111', city: 'City', country: 'Spain', countryCode: 'ES',
    theme: 'history', language: 'es', durationMinutes: 60, status: 'published', introduction: 'Introducción',
    createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z',
    places: ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'].map((id, position) => ({
      id, tourId: '11111111-1111-4111-8111-111111111111', name: 'Stop', description: 'Narración', position, latitude: 40, longitude: -3,
      metadata: { sourceCredits: { version: SOURCE_POLICY_VERSION, items: [{ sourceId: 'a', title: 'Artículo',
        url: 'https://es.wikipedia.org/wiki/Giralda', attribution: 'Wikipedia contributors', capturedAt: '2026-01-01T00:00:00Z',
        license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', status: 'permitted', usage: 'research' }] } },
    })),
    metadata: { pilotWalkingRoute: { provider: 'fossgis-osrm-foot', geometry: { type: 'LineString', coordinates: [[-3,40],[-3.01,40.01]] },
      distanceMeters: 100, durationSeconds: 120 } },
  };
  const audio: TourAudioState = { tourId: tour.id, status: 'completed', phase: 'completed', completedStops: 2, totalStops: 2,
    audioUrls: Object.fromEntries(tour.places.map(p => [p.id, '/audio/' + p.id])),
    audioVersions: Object.fromEntries(tour.places.map(p => [p.id, 'version-1'])),
    transcripts: Object.fromEntries(tour.places.map(p => [p.id, 'Voz generada por IA. Narración'])) };
  const release: PilotRelease = { version: 1, status: 'approved', reviewedBy: 'PRIVATE REVIEWER', reviewedAt: '2026-01-02T00:00:00Z',
    fingerprint: pilotFingerprint(tour, audio), sourcePolicy: SOURCE_POLICY_VERSION, scriptLicense: 'CC BY-SA 4.0',
    changes: 'Narración adaptada con IA', checks: { text: true, audio: true, route: true, rights: true } };
  tour.metadata!.pilotRelease = release;
  return { tour, audio };
}
test('requires actual review for the current material and excludes reviewer identity from public output', () => {
  const { tour, audio } = pilotFixture();
  expect(admittedToPilot(tour, audio)).toBe(true);
  expect(JSON.stringify(presentPilotTour(tour, audio))).not.toContain('PRIVATE REVIEWER');
  delete tour.metadata!.pilotRelease;
  expect(admittedToPilot(tour, audio)).toBe(false);
});
test('a new introduction audio requires review and its file version participates in the fingerprint', () => {
  const { tour, audio } = pilotFixture();
  audio.introduction = { status: 'completed', text: 'Aviso e introducción.', audioUrl: '/introduction', version: 'intro-v1' };
  expect(admittedToPilot(tour, audio)).toBe(false);
  tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, audio);
  expect(admittedToPilot(tour, audio)).toBe(true);
  audio.introduction.version = 'intro-v2';
  expect(admittedToPilot(tour, audio)).toBe(false);
});
test.each(['text', 'audio', 'source', 'geometry', 'withdrawal', 'checks', 'missingFile'])('rejects changed %s', change => {
  const { tour, audio } = pilotFixture();
  if (change === 'text') tour.places[0].description += ' Changed';
  if (change === 'audio') audio.audioVersions![tour.places[0].id] = 'version-2';
  if (change === 'source') tour.places[0].metadata!.sourceCredits!.items[0].url = 'https://www.catedraldesevilla.es/';
  if (change === 'geometry') tour.metadata!.pilotWalkingRoute!.geometry.coordinates[0][0] = -4;
  if (change === 'withdrawal') tour.metadata!.pilotRelease!.status = 'withdrawn';
  if (change === 'checks') tour.metadata!.pilotRelease!.checks.audio = false;
  if (change === 'missingFile') delete audio.audioUrls[tour.places[0].id];
  expect(admittedToPilot(tour, audio)).toBe(false);
});
test('image rights must be complete and private image assessment stays private', () => {
  const { tour, audio } = pilotFixture();
  const place = tour.places[0];
  place.metadata!.tourImages = { version: 1, status: 'ready', sourceText: place.description, images: [{
    id: 'photo', role: 'primary', paragraphId: 'p1', paragraphIndex: 0, paragraphText: place.description,
    caption: 'Vista', alt: 'Patio', url: 'https://upload.wikimedia.org/example.jpg',
    sourceUrl: 'https://commons.wikimedia.org/wiki/File:Example.jpg', sourceTitle: 'Example',
    author: 'Author', attribution: 'Author / CC BY-SA 4.0', license: 'CC BY-SA 4.0',
    licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/', changes: 'Sin cambios',
    width: 600, height: 400, entityId: 'Q1', identityEvidence: 'wikidata-p18', verifiedAt: '2026-01-01',
    visualReason: 'PRIVATE IMAGE ASSESSMENT',
  }] };
  tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, audio);
  expect(admittedToPilot(tour, audio)).toBe(true);
  expect(JSON.stringify(presentPilotTour(tour, audio))).not.toContain('PRIVATE IMAGE ASSESSMENT');
  place.metadata!.tourImages.images[0].author = '';
  tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, audio);
  expect(admittedToPilot(tour, audio)).toBe(false);
});
test('ignores object key ordering and volatile timestamps', () => {
  const { tour, audio } = pilotFixture();
  tour.updatedAt = new Date().toISOString();
  const cloned = JSON.parse(JSON.stringify(tour));
  cloned.metadata.pilotWalkingRoute = { durationSeconds: 120, distanceMeters: 100, geometry: { coordinates: [[-3,40],[-3.01,40.01]], type: 'LineString' }, provider: 'fossgis-osrm-foot' };
  expect(admittedToPilot(cloned, audio)).toBe(true);
});
