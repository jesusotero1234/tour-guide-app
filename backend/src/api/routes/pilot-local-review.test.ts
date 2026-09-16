import express from 'express';
import { createPilotRouter } from './pilot';
import type { TourRepository } from '../../domain/repositories/TourRepository';
import type { TourBlueprintRepository } from '../../services/TourBlueprint';
import type { TourAudioState } from '../../services/TourAudioService';
import type { Tour } from '../../domain/entities/Tour';

test('local review exposes only the selected draft material, preserves read-only auth, and cannot open production', async () => {
  const old = { ...process.env };
  const id = '11111111-1111-4111-8111-111111111111';
  const other = '22222222-2222-4222-8222-222222222222';
  const key = 'local-review-test-key-at-least-32-characters';
  const tour = { id, city: 'Madrid', country: 'España', language: 'es', status: 'published',
    introduction: 'Texto todavía en revisión', durationMinutes: 60,
    metadata: { internalPrompt: 'PRIVATE PROMPT' },
    places: [{ id: other, description: 'Parada en revisión', latitude: 40, longitude: -3,
      metadata: { capture: 'PRIVATE CAPTURE' } }] } as unknown as Tour;
  const before = JSON.stringify(tour);
  const state: TourAudioState = { tourId: id, status: 'idle', phase: 'idle',
    completedStops: 0, totalStops: 1, audioUrls: {}, canGenerate: true };
  const getAudio = jest.fn(async () => state);
  const bases = { isCurrent: jest.fn(), findById: jest.fn() };
  process.env.PILOT_API_KEY = key;
  process.env.API_KEYS = '';
  try {
    for (const [mode, bind, selection, allowed] of [
      ['development', '127.0.0.1', id, true],
      ['development', '127.0.0.1', id + ',' + other, true],
      ['production', '127.0.0.1', id, false],
      ['production', '127.0.0.1', id + ',' + other, false],
      ['development', '0.0.0.0', id, false],
      ['development', '127.0.0.1', '', false],
      ['development', '127.0.0.1', 'bad-id', false],
      ['development', '127.0.0.1', id + ',bad-id', false],
    ] as const) {
      process.env.NODE_ENV = mode;
      process.env.BIND_HOST = bind;
      process.env.LOCAL_REVIEW_TOUR_ID = selection;
      const app = express().use(createPilotRouter(
        { findById: async (requested: string) => ({ ...tour, id: requested }), list: async () => [tour, { ...tour, id: other }] } as unknown as TourRepository,
        bases as unknown as TourBlueprintRepository,
        { get: getAudio, audioFile: jest.fn() }, async () => false));
      const server = app.listen(0, '127.0.0.1');
      await new Promise<void>(resolve => server.once('listening', resolve));
      const base = 'http://127.0.0.1:' + (server.address() as { port: number }).port;
      const hit = (path: string, method = 'GET', auth = true) => fetch(base + path,
        { method, headers: auth ? { 'X-API-Key': key } : {} });
      try {
        expect((await hit('/tours', 'GET', false)).status).toBe(401);
        expect((await hit('/tours/' + id + '/audio', 'POST')).status).toBe(405);
        const response = await hit('/tours');
        if (!allowed) { expect(response.status).toBe(503); continue; }
        expect(response.status).toBe(200);
        expect(response.headers.get('cache-control')).toBe('private, no-store');
        const catalogue = await response.json() as { data: { tours: Array<{ id: string }> } };
        expect(catalogue.data.tours.map((t: { id: string }) => t.id)).toEqual(selection.split(','));
        const detail = await (await hit('/tours/' + id)).json() as { localReview?: boolean; pilot?: unknown };
        expect(detail.localReview).toBe(true);
        expect(detail.pilot).toBeUndefined();
        expect(JSON.stringify(detail)).not.toMatch(/PRIVATE PROMPT|PRIVATE CAPTURE/);
        expect((await hit('/tours/' + other)).status).toBe(selection.includes(other) ? 200 : 404);
        expect((await hit('/tours/33333333-3333-4333-8333-333333333333')).status).toBe(404);
        expect((await hit('/tours/' + id + '/walking-route')).status).toBe(503);
        expect((await hit('/tours/' + id + '/audio/' + other)).status).toBe(404);
        const audio = await (await hit('/tours/' + id + '/audio')).json();
        expect(audio).toMatchObject({ status: 'idle', completedStops: 0, canGenerate: false });
        expect(getAudio).toHaveBeenCalledWith(id, true);
        expect((await hit('/tours/' + id + '/audio/introduction', 'GET', false)).status).toBe(401);
        expect((await hit('/tours/' + id + '/audio/introduction')).status).toBe(404);
        state.introduction = { status: 'completed', text: 'Introducción', audioUrl: '/introduction', version: 'current-version' };
        expect((await hit('/tours/' + id + '/audio/introduction?v=previous-version')).status).toBe(409);
        expect((await (await hit('/tours/' + id + '/audio')).json() as TourAudioState).introduction?.version).toBe('current-version');
        delete state.introduction;
      } finally { await new Promise<void>(resolve => server.close(() => resolve())); }
    }
    expect(JSON.stringify(tour)).toBe(before);
    expect(bases.isCurrent).not.toHaveBeenCalled();
  } finally {
    for (const name of ['NODE_ENV', 'BIND_HOST', 'LOCAL_REVIEW_TOUR_ID', 'PILOT_API_KEY', 'API_KEYS']) {
      if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name];
    }
  }
});
