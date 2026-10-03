import { presentPilotTourSummary } from './PilotCatalogSummary';
import type { Tour } from '../domain/entities/Tour';
import type { TourAudioState } from './TourAudioService';

const text = 'Primer párrafo de la parada.\n\nSegundo párrafo.';
const image = (over: Record<string, unknown> = {}) => ({
  id: 'img-1', role: 'primary', paragraphId: 'p0', paragraphIndex: 0, paragraphText: 'Primer párrafo de la parada.', caption: 'Pie', alt: 'Alt',
  url: 'https://upload.wikimedia.org/wikipedia/commons/a/a5/Foto.jpg', sourceUrl: 'https://commons.wikimedia.org/wiki/File:Foto.jpg',
  sourceTitle: 'File:Foto.jpg', author: 'Autor', license: 'CC BY-SA 4.0', licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
  attribution: 'Autor, CC BY-SA 4.0', changes: 'Recortada', width: 800, height: 600, entityId: 'Q1', identityEvidence: 'wikidata-p18',
  verifiedAt: '2026-01-01T00:00:00Z', visualReason: 'private reasoning', ...over,
});
const place = (n: number, over: Record<string, unknown> = {}, set: Record<string, unknown> | null = null) => ({
  id: 'stop-' + n, tourId: 't', name: 'Parada ' + n, description: text, position: n, latitude: 36 + n, longitude: -4 + n,
  metadata: set ? { tourImages: { version: 1, sourceText: text, status: 'ready', images: [], ...set } } : {}, ...over,
});
const tour = (places: unknown[], over: Record<string, unknown> = {}) => ({
  id: 't', city: 'Málaga', country: 'España', countryCode: 'ES', theme: 'history', language: 'es', durationMinutes: 75, status: 'published',
  introduction: 'Introducción', createdAt: '2026-01-01', places, metadata: { catalogTitle: 'Málaga: Historia Viva' }, ...over,
}) as unknown as Tour;
const audio = (over: Partial<TourAudioState> = {}) => ({
  tourId: 't', status: 'completed', phase: 'completed', completedStops: 2, totalStops: 2,
  audioUrls: { 'stop-1': '/a/1', 'stop-2': '/a/2' }, ...over,
}) as unknown as TourAudioState;

test('carries the card fields and no stops, credits or review data', () => {
  const summary = presentPilotTourSummary(tour([place(2), place(1)]), audio());
  expect(summary).toMatchObject({ id: 't', title: 'Málaga: Historia Viva', stopCount: 2, durationMinutes: 75, sampleAudioUrl: '/a/1', localReview: false });
  expect(summary.start).toEqual({ latitude: 37, longitude: -3 });
  expect(summary).not.toHaveProperty('places');
  expect(summary).not.toHaveProperty('pilot');
  expect(JSON.stringify(summary)).not.toMatch(/Segundo párrafo/);
});

test('prefers the introduction audio for the sample', () => {
  const summary = presentPilotTourSummary(tour([place(1)]), audio({ introduction: { status: 'completed', text: 'x', audioUrl: '/intro', version: 'v' } as never }));
  expect(summary.sampleAudioUrl).toBe('/intro');
});

test('shortens a long introduction on a word boundary', () => {
  const long = 'palabra '.repeat(100);
  const summary = presentPilotTourSummary(tour([place(1)], { introduction: long }), audio());
  expect(summary.introduction!.length).toBeLessThanOrEqual(321);
  expect(summary.introduction!.endsWith('…')).toBe(true);
  expect(summary.introduction!).not.toMatch(/palabr…$/);
});

test('the cover is the first verified primary photo, without the private reason', () => {
  const summary = presentPilotTourSummary(tour([place(1), place(2, {}, { images: [image()] })]), audio());
  expect(summary.cover).toMatchObject({ id: 'img-1', url: expect.stringContaining('upload.wikimedia.org') });
  expect(summary.cover).not.toHaveProperty('visualReason');
});

test.each([
  ['a host that is not Wikimedia', { url: 'https://evil.example/Foto.jpg' }],
  ['http', { url: 'http://upload.wikimedia.org/Foto.jpg' }],
  ['credentials in the url', { url: 'https://user:pw@upload.wikimedia.org/Foto.jpg' }],
  ['a source that is not a Commons file', { sourceUrl: 'https://commons.wikimedia.org/wiki/Category:X' }],
  ['a licence off Creative Commons', { licenseUrl: 'https://example.com/licence' }],
  ['a missing author', { author: '' }],
  ['text that changed since the photo was chosen', { paragraphText: 'Otro texto' }],
  ['a detail photo', { role: 'detail' }],
])('no cover for %s', (_name, over) => {
  expect(presentPilotTourSummary(tour([place(1, {}, { images: [image(over)] })]), audio())).not.toHaveProperty('cover');
});

test('no cover when the stop text changed after the photos were chosen', () => {
  expect(presentPilotTourSummary(tour([place(1, {}, { sourceText: 'texto anterior', images: [image()] })]), audio())).not.toHaveProperty('cover');
  expect(presentPilotTourSummary(tour([place(1, {}, { status: 'unavailable', images: [image()] })]), audio())).not.toHaveProperty('cover');
});
