import express from 'express';
import type { Server } from 'node:http';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createPilotRouter } from './pilot';
import { pilotFingerprint } from '../../services/PilotRelease';
import { buildSourceCredits } from '../../services/SourceCredits';
import { SOURCE_POLICY_VERSION } from '../../services/poi/SourceUsePolicy';
import { computeWalkingLegs, walkingLegsSha256, type WalkingLegs } from '../../services/WalkingLegs';
import type { Tour } from '../../domain/entities/Tour';
import type { TourAudioState, TourCues } from '../../services/TourAudioService';
import type { TourBlueprintRepository, TourBlueprintSnapshot } from '../../services/TourBlueprint';
import type { TourRepository } from '../../domain/repositories/TourRepository';

const key = 'pilot-test-key-is-at-least-32-characters';
const id = '11111111-1111-4111-8111-111111111111';
const stopIds = ['22222222-2222-4222-8222-222222222222', '33333333-3333-4333-8333-333333333333'];
const hex = (c: string) => c.repeat(64);
const version = (c: string) => hex(c) + '.' + hex('f');

describe('order-flexible tours over HTTP', () => {
  let server: Server | undefined;
  let dir: string;
  let legs: WalkingLegs;
  let tour: Tour;
  let state: TourAudioState;
  let cues: TourCues;
  let hit: (path: string, auth?: boolean) => Promise<{ status: number; body: any; headers: Record<string, string>; text: string }>;
  const cueFile = jest.fn();
  let audioRef: { cues: jest.Mock; audioFile: jest.Mock };
  const savedKey = process.env.PILOT_API_KEY;
  const savedSwitch = process.env.PILOT_FLEXIBLE_ORDER;

  beforeAll(async () => {
    process.env.PILOT_API_KEY = key;
    dir = await mkdtemp(join(tmpdir(), 'pilot-flex-'));
    await writeFile(join(dir, 'cue.mp3'), '0123456789');
    const snapshot = { fingerprint: 'base-v1', checkpoint: { research: stopIds.map((_, i) => ({ routeStopId: 'Q' + (i + 1), result: { status: 'sufficient',
      dossier: { sources: [{ sourceId: 'a' }] }, captures: [{ sourceId: 'a', requestedUrl: 'https://es.wikipedia.org/wiki/Giralda', finalUrl: 'https://es.wikipedia.org/wiki/Giralda',
        title: 'Giralda', capturedAt: '2026-01-01T00:00:00Z', content: 'x' }] } })) } } as unknown as TourBlueprintSnapshot;
    legs = await computeWalkingLegs(stopIds.map((stop, i) => ({ id: stop, latitude: 37 + i / 100, longitude: -5 })),
      async (a, b) => ({ distanceMeters: 100, durationSeconds: 80, coordinates: [[a.longitude, a.latitude], [b.longitude, b.latitude]] }));
    tour = { id, blueprintId: id, city: 'Sevilla', country: 'España', countryCode: 'ES', theme: 'history', language: 'es', durationMinutes: 60, status: 'published',
      introduction: 'Introducción', createdAt: '2026-01-01', updatedAt: '2026-01-01',
      places: stopIds.map((stop, i) => ({ id: stop, tourId: id, name: 'Parada ' + i, description: 'Texto', position: i, latitude: 37 + i / 100, longitude: -5,
        metadata: { sourcePoi: { wikidata: 'Q' + (i + 1) }, sourceCredits: buildSourceCredits(snapshot, 'Q' + (i + 1)) } })),
      metadata: { codexAuthor: { blueprintFingerprint: 'base-v1', legs: [] }, orderFlexible: true, walkingLegsSha256: walkingLegsSha256(legs),
        cueManifest: [{ kind: 'first', placeId: stopIds[0], text: 'Primera parada: A.', version: version('1') }, { kind: 'first', placeId: stopIds[1], text: 'Primera parada: B.', version: version('2') },
          { kind: 'next', placeId: stopIds[0], text: 'Siguiente parada: A.', version: version('3') }, { kind: 'next', placeId: stopIds[1], text: 'Siguiente parada: B.', version: version('4') },
          { kind: 'finish', text: 'Aquí termina el paseo.', version: version('5') }],
        pilotWalkingRoute: { provider: 'fossgis-osrm-foot', geometry: { type: 'LineString', coordinates: [[-5, 37], [-5.01, 37.01]] }, distanceMeters: 100, durationSeconds: 120 } },
    } as unknown as Tour;
    state = { tourId: id, status: 'completed', phase: 'completed', completedStops: 2, totalStops: 2,
      audioUrls: Object.fromEntries(stopIds.map(s => [s, '/api/backend/tours/' + id + '/audio/' + s])),
      audioVersions: Object.fromEntries(stopIds.map(s => [s, 'v1'])), transcripts: Object.fromEntries(stopIds.map(s => [s, 'Texto'])) };
    tour.metadata!.pilotRelease = { version: 1, status: 'approved', reviewedBy: 'x', reviewedAt: '2026-01-01', approvalMode: 'owner-authorized', authorizationReference: 'ok',
      fingerprint: pilotFingerprint(tour, state), sourcePolicy: SOURCE_POLICY_VERSION, scriptLicense: 'CC BY-SA 4.0', changes: 'c', checks: { text: true, audio: true, route: true, rights: true } };
    cues = { first: {}, next: {}, finish: { text: 'Aquí termina el paseo.', version: version('5'), audioUrl: '/api/backend/tours/' + id + '/cue/finish?v=' + version('5') } };
    stopIds.forEach((stop, i) => {
      cues.first[stop] = { text: 'Primera parada.', version: version(String(i + 1)), audioUrl: '/api/backend/tours/' + id + '/cue/first/' + stop + '?v=' + version(String(i + 1)) };
      cues.next[stop] = { text: 'Siguiente parada.', version: version(String(i + 3)), audioUrl: '/api/backend/tours/' + id + '/cue/next/' + stop + '?v=' + version(String(i + 3)) };
    });
    const audio = { get: async () => state, audioFile: jest.fn(), cues: jest.fn(async () => cues), cueFile };
    audioRef = audio;
    const store = { find: jest.fn(async () => ({ data: legs as unknown, sha256: walkingLegsSha256(legs) })) };
    const app = express().use(createPilotRouter({ findById: async () => tour, list: async () => [tour] } as unknown as TourRepository,
      { isCurrent: async () => true, findById: async () => ({ snapshot }) } as unknown as TourBlueprintRepository, audio, async () => true, store));
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>(resolve => server!.once('listening', resolve));
    const port = (server.address() as { port: number }).port;
    hit = async (path, auth = true) => {
      const res = await fetch('http://127.0.0.1:' + port + path, { headers: auth ? { 'X-API-Key': key } : {} });
      const text = await res.text(); let body: unknown; try { body = JSON.parse(text); } catch { /* binary */ }
      return { status: res.status, body, headers: Object.fromEntries(res.headers), text };
    };
    (hit as unknown as { store: typeof store }).store = store;
  });
  afterAll(async () => {
    await new Promise<void>(resolve => server ? server.close(() => resolve()) : resolve());
    await rm(dir, { recursive: true, force: true });
    for (const [name, value] of [['PILOT_API_KEY', savedKey], ['PILOT_FLEXIBLE_ORDER', savedSwitch]] as const) { if (value === undefined) delete process.env[name]; else process.env[name] = value; }
  });
  beforeEach(() => { delete process.env.PILOT_FLEXIBLE_ORDER; cueFile.mockReset(); cueFile.mockResolvedValue(join(dir, 'cue.mp3')); });

  it('listing the catalogue and reading a tour never look up clips or legs', async () => {
    const store = (hit as unknown as { store: { find: jest.Mock } }).store;
    audioRef.cues.mockClear(); store.find.mockClear();
    expect((await hit('/tours')).body.data.total).toBe(1);
    expect((await hit('/tours/' + id)).status).toBe(200);
    expect((await hit('/tours/' + id + '/provenance')).status).toBe(200);
    expect(audioRef.cues).not.toHaveBeenCalled();
    expect(store.find).not.toHaveBeenCalled();
    await hit('/tours/' + id + '/audio');
    expect(audioRef.cues).toHaveBeenCalledTimes(1);
  });

  it('is admitted, flagged, and serves its link clips with the audio', async () => {
    const detail = await hit('/tours/' + id);
    expect(detail.status).toBe(200);
    expect(detail.body.orderFlexible).toBe(true);
    expect(JSON.stringify(detail.body)).not.toContain('cueManifest');
    const audio = await hit('/tours/' + id + '/audio');
    expect(audio.body.cues.finish.version).toBe(version('5'));
    expect(Object.keys(audio.body.cues.next)).toEqual(stopIds);
  });

  it('serves the right clip file for each kind, with the version check', async () => {
    const next = await hit('/tours/' + id + '/cue/next/' + stopIds[1] + '?v=' + version('4'));
    expect(next.status).toBe(200);
    expect(next.text).toBe('0123456789');
    expect(cueFile).toHaveBeenLastCalledWith(id, 'next', stopIds[1], version('4'));
    expect((await hit('/tours/' + id + '/cue/finish?v=' + version('5'))).status).toBe(200);
    expect(cueFile).toHaveBeenLastCalledWith(id, 'finish', undefined, version('5'));
    expect((await hit('/tours/' + id + '/cue/first/' + stopIds[0])).status).toBe(200);
    cueFile.mockRejectedValueOnce(Object.assign(new Error('changed'), { code: 'AUDIO_VERSION_CHANGED' }));
    expect((await hit('/tours/' + id + '/cue/next/' + stopIds[0] + '?v=' + version('9'))).status).toBe(409);
    cueFile.mockRejectedValueOnce(Object.assign(new Error('gone'), { code: 'AUDIO_NOT_FOUND' }));
    expect((await hit('/tours/' + id + '/cue/next/' + stopIds[0])).status).toBe(404);
    expect((await hit('/tours/' + id + '/cue/next/not-a-uuid')).status).toBe(404);
    expect((await hit('/tours/' + id + '/cue/sideways/' + stopIds[0])).status).toBe(404);
    expect((await hit('/tours/' + id + '/cue/finish', false)).status).toBe(401);
  });

  it('audio asked for with its version can be cached for good; without it, or with an old one, nothing is cached', async () => {
    audioRef.audioFile.mockResolvedValue(join(dir, 'cue.mp3'));
    const immutable = 'private, max-age=31536000, immutable', none = 'private, no-store';
    expect((await hit('/tours/' + id + '/audio/' + stopIds[0] + '?v=v1')).headers['cache-control']).toBe(immutable);
    expect((await hit('/tours/' + id + '/audio/' + stopIds[0])).headers['cache-control']).toBe(none);
    const stale = await hit('/tours/' + id + '/audio/' + stopIds[0] + '?v=old');
    expect(stale.status).toBe(409);
    expect(stale.headers['cache-control']).toBe(none);
    expect((await hit('/tours/' + id + '/cue/next/' + stopIds[1] + '?v=' + version('4'))).headers['cache-control']).toBe(immutable);
    expect((await hit('/tours/' + id + '/cue/finish')).headers['cache-control']).toBe(none);
    cueFile.mockRejectedValueOnce(Object.assign(new Error('changed'), { code: 'AUDIO_VERSION_CHANGED' }));
    expect((await hit('/tours/' + id + '/cue/finish?v=' + version('9'))).headers['cache-control']).toBe(none);
    expect((await hit('/tours/' + id + '/audio')).headers['cache-control']).toBe(none);
    expect((await hit('/tours')).headers['cache-control']).toBe(none);
  });

  it('serves the walking legs only when their hash and content match what the tour was approved with', async () => {
    const ok = await hit('/tours/' + id + '/walking-legs');
    expect(ok.status).toBe(200);
    expect(ok.body.data.stopIds).toEqual(stopIds);
    const store = (hit as unknown as { store: { find: jest.Mock } }).store;
    store.find.mockResolvedValueOnce({ data: legs, sha256: 'e'.repeat(64) });
    expect((await hit('/tours/' + id + '/walking-legs')).status).toBe(503);
    store.find.mockResolvedValueOnce(null);
    expect((await hit('/tours/' + id + '/walking-legs')).status).toBe(503);
    const tampered = JSON.parse(JSON.stringify(legs)); tampered.durationsSeconds[0][1] += 5; tampered.durationsSeconds[1][0] += 5;
    store.find.mockResolvedValueOnce({ data: tampered, sha256: walkingLegsSha256(legs) });
    expect((await hit('/tours/' + id + '/walking-legs')).status).toBe(503);
  });

  it('the emergency switch hides every flexible feature and keeps the tour in the catalogue', async () => {
    process.env.PILOT_FLEXIBLE_ORDER = 'off';
    const detail = await hit('/tours/' + id);
    expect(detail.status).toBe(200);
    expect('orderFlexible' in detail.body).toBe(false);
    expect('cues' in (await hit('/tours/' + id + '/audio')).body).toBe(false);
    for (const path of ['/walking-legs', '/cue/finish', '/cue/next/' + stopIds[0]]) expect((await hit('/tours/' + id + path)).status).toBe(404);
    expect((await hit('/tours')).body.data.total).toBe(1);
  });

  it('a flexible tour without its clips or legs is not admitted, but only while the switch is on', async () => {
    const manifest = tour.metadata!.cueManifest!;
    tour.metadata!.cueManifest = manifest.slice(1);
    expect((await hit('/tours/' + id)).status).toBe(404);
    process.env.PILOT_FLEXIBLE_ORDER = 'off';
    tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, state);
    expect((await hit('/tours/' + id)).status).toBe(200);
    delete process.env.PILOT_FLEXIBLE_ORDER;
    tour.metadata!.cueManifest = manifest;
    tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, state);
    const walking = tour.metadata!.walkingLegsSha256;
    tour.metadata!.walkingLegsSha256 = undefined;
    expect((await hit('/tours/' + id)).status).toBe(404);
    tour.metadata!.walkingLegsSha256 = walking;
    tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, state);
    expect((await hit('/tours/' + id)).status).toBe(200);
  });

  it('a non-flexible tour exposes nothing new and its cue routes do not exist', async () => {
    const saved = { ...tour.metadata };
    delete tour.metadata!.orderFlexible; delete tour.metadata!.cueManifest; delete tour.metadata!.walkingLegsSha256;
    tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, state);
    expect('orderFlexible' in (await hit('/tours/' + id)).body).toBe(false);
    expect('cues' in (await hit('/tours/' + id + '/audio')).body).toBe(false);
    expect((await hit('/tours/' + id + '/cue/finish')).status).toBe(404);
    expect((await hit('/tours/' + id + '/walking-legs')).status).toBe(404);
    Object.assign(tour.metadata!, saved);
    tour.metadata!.pilotRelease!.fingerprint = pilotFingerprint(tour, state);
  });
});
