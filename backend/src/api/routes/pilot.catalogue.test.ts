/* eslint-disable @typescript-eslint/no-explicit-any */
import express from 'express';
import type { Server } from 'node:http';
import { createPilotRouter } from './pilot';
import { pilotFingerprint } from '../../services/PilotRelease';
import { buildSourceCredits } from '../../services/SourceCredits';
import { SOURCE_POLICY_VERSION } from '../../services/poi/SourceUsePolicy';
import type { Tour } from '../../domain/entities/Tour';
import type { TourAudioState } from '../../services/TourAudioService';
import type { TourBlueprintSnapshot, TourBlueprintRepository } from '../../services/TourBlueprint';
import type { TourRepository } from '../../domain/repositories/TourRepository';

const key = 'pilot-test-key-is-at-least-32-characters';
const stopIds = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const tourId = (n: number) => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
let server: Server | undefined;
const saved = { key: process.env.PILOT_API_KEY, ttl: process.env.PILOT_CATALOG_CACHE_MS };
beforeAll(() => { process.env.PILOT_API_KEY = key; });
afterEach(async () => { await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve()); server = undefined; });
afterAll(() => {
  for (const [name, value] of [['PILOT_API_KEY', saved.key], ['PILOT_CATALOG_CACHE_MS', saved.ttl]] as const) {
    if (value === undefined) delete process.env[name]; else process.env[name] = value;
  }
});

function admittedTour(n: number): { tour: Tour; state: TourAudioState } {
  const id = tourId(n);
  const snapshot = { fingerprint: 'base-v1', checkpoint: { research: stopIds.map((_, i) => ({
    routeStopId: 'Q' + (i + 1), result: { status: 'sufficient', dossier: { sources: [{ sourceId: 'a' }] },
      captures: [{ sourceId: 'a', requestedUrl: 'https://es.wikipedia.org/wiki/Giralda', finalUrl: 'https://es.wikipedia.org/wiki/Giralda',
        title: 'Giralda', capturedAt: '2026-01-01T00:00:00Z', content: 'capture' }] },
  })) } } as unknown as TourBlueprintSnapshot;
  const tour = { id, blueprintId: id, city: 'Sevilla', country: 'España', countryCode: 'ES', theme: 'history', language: 'es',
    durationMinutes: 60, status: 'published', introduction: 'Introducción', createdAt: '2026-01-01', updatedAt: '2026-01-01',
    places: stopIds.map((stop, i) => ({ id: stop, tourId: id, name: 'Parada', description: 'Texto', position: i, latitude: 37, longitude: -5,
      metadata: { sourcePoi: { wikidata: 'Q' + (i + 1) }, sourceCredits: buildSourceCredits(snapshot, 'Q' + (i + 1)) } })),
    metadata: { codexAuthor: { blueprintFingerprint: 'base-v1', legs: [] }, pilotWalkingRoute: { provider: 'fossgis-osrm-foot',
      geometry: { type: 'LineString', coordinates: [[-5, 37], [-5.01, 37.01]] }, distanceMeters: 100, durationSeconds: 120 } },
  } as unknown as Tour;
  const state: TourAudioState = { tourId: id, status: 'completed', phase: 'completed', completedStops: 2, totalStops: 2,
    audioUrls: Object.fromEntries(stopIds.map(s => [s, '/api/backend/tours/' + id + '/audio/' + s])),
    audioVersions: Object.fromEntries(stopIds.map(s => [s, 'v1'])), transcripts: Object.fromEntries(stopIds.map(s => [s, 'Texto'])) };
  tour.metadata!.pilotRelease = { version: 1, status: 'approved', reviewedBy: 'Reviewer', reviewedAt: '2026-01-01',
    fingerprint: pilotFingerprint(tour, state), sourcePolicy: SOURCE_POLICY_VERSION, scriptLicense: 'CC BY-SA 4.0', changes: 'Adaptación',
    checks: { text: true, audio: true, route: true, rights: true } };
  return { tour, state };
}

async function start(count: number, ttl: string | undefined) {
  if (ttl === undefined) delete process.env.PILOT_CATALOG_CACHE_MS; else process.env.PILOT_CATALOG_CACHE_MS = ttl;
  const items = Array.from({ length: count }, (_, i) => admittedTour(i + 1));
  const snapshot = { fingerprint: 'base-v1', checkpoint: { research: stopIds.map((_, i) => ({
    routeStopId: 'Q' + (i + 1), result: { status: 'sufficient', dossier: { sources: [{ sourceId: 'a' }] },
      captures: [{ sourceId: 'a', requestedUrl: 'https://es.wikipedia.org/wiki/Giralda', finalUrl: 'https://es.wikipedia.org/wiki/Giralda',
        title: 'Giralda', capturedAt: '2026-01-01T00:00:00Z', content: 'capture' }] },
  })) } } as unknown as TourBlueprintSnapshot;
  const list = jest.fn(async () => items.map(item => item.tour));
  const findById = jest.fn(async (id: string) => items.find(item => item.tour.id === id)?.tour ?? null);
  const get = jest.fn(async (id: string) => items.find(item => item.tour.id === id)!.state);
  const repo = { findById, list } as unknown as TourRepository;
  const bases = { isCurrent: async () => true, findById: async () => ({ snapshot }) } as unknown as TourBlueprintRepository;
  server = express().use(createPilotRouter(repo, bases, { get, audioFile: jest.fn() }, async () => true)).listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server!.once('listening', resolve));
  const port = (server.address() as { port: number }).port;
  const hit = async (path: string) => {
    const res = await fetch('http://127.0.0.1:' + port + path, { headers: { 'X-API-Key': key } });
    return { status: res.status, body: await res.json() as any };
  };
  return { hit, list, findById, get, items };
}

test('the catalogue reads each tour once, keeps its order, and a second page costs no query', async () => {
  const { hit, list, findById, get, items } = await start(25, '60000');
  const first = await hit('/tours?limit=10&offset=0');
  expect(first.status).toBe(200);
  expect(first.body.data.total).toBe(25);
  expect(first.body.data.tours.map((t: { id: string }) => t.id)).toEqual(items.slice(0, 10).map(item => item.tour.id));
  expect(findById).not.toHaveBeenCalled();
  expect(get).toHaveBeenCalledTimes(25);
  const second = await hit('/tours?limit=10&offset=10');
  expect(second.body.data.tours.map((t: { id: string }) => t.id)).toEqual(items.slice(10, 20).map(item => item.tour.id));
  expect(list).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledTimes(25);
});

test('different filters do not share a cached catalogue', async () => {
  const { hit, list } = await start(2, '60000');
  await hit('/tours?language=es');
  await hit('/tours?language=en');
  await hit('/tours?language=es');
  expect(list).toHaveBeenCalledTimes(2);
});

test('PILOT_CATALOG_CACHE_MS=0 recalculates on every request', async () => {
  const { hit, list } = await start(2, '0');
  await hit('/tours');
  await hit('/tours');
  expect(list).toHaveBeenCalledTimes(2);
});

test('a single tour page is never cached', async () => {
  const { hit, findById } = await start(1, '60000');
  await hit('/tours/' + tourId(1));
  await hit('/tours/' + tourId(1));
  expect(findById).toHaveBeenCalledTimes(2);
});

test('a page may hold up to 200 tours and no more', async () => {
  const { hit } = await start(3, '0');
  expect((await hit('/tours?limit=200')).body.data.total).toBe(3);
  expect((await hit('/tours?limit=201')).status).toBe(400);
});

test('without PILOT_CATALOG_CACHE_MS nothing is cached, so a withdrawn tour leaves the list at once', async () => {
  const { hit, list, items } = await start(2, undefined);
  expect((await hit('/tours')).body.data.total).toBe(2);
  items[0].tour.metadata!.pilotRelease!.status = 'withdrawn';
  expect((await hit('/tours')).body.data.total).toBe(1);
  expect(list).toHaveBeenCalledTimes(2);
});
