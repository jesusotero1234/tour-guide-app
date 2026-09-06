import { PrismaClient } from '@prisma/client';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { TourAudioService } from '../TourAudioService';
import { AudioRenderInput, AudioRenderProgress } from '../LocalVoxCpmRenderer';

const tourId = '11111111-1111-4111-8111-111111111111';
const placeId = '22222222-2222-4222-8222-222222222222';
const otherTour = '33333333-3333-4333-8333-333333333333';
const tick = () => new Promise(resolve => setTimeout(resolve, 5));

describe('post-tour audio lifecycle', () => {
  let directory: string;
  let oldPreset: string | undefined;
  let tour: { id: string; status: string; language: string; metadata: object; places: Array<{ id: string; description: string }> };
  let rows: Array<Record<string, unknown>>;
  let client: PrismaClient;
  let render: jest.Mock<Promise<AudioRenderProgress>, [AudioRenderInput, string, string]>;
  let service: TourAudioService;
  let release: () => void;
  let rejectRender: (error: Error) => void;

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'tour-audio-test-'));
    oldPreset = process.env.VOXCPM_PRESET_PATH;
    await writeFile(join(directory, 'reference.wav'), 'voice fixture');
    await writeFile(join(directory, 'preset.json'), JSON.stringify({ reference: 'reference.wav' }));
    process.env.VOXCPM_PRESET_PATH = join(directory, 'preset.json');
    tour = { id: tourId, status: 'published', language: 'es', metadata: {},
      places: [{ id: placeId, description: 'Primero, miramos el patio.\n\nDespués, nos detenemos junto a la puerta.' }] };
    rows = [];
    client = {
      tour: { findUnique: jest.fn(async () => tour) },
      generationJob: { count: jest.fn(async () => 0) },
      audioAsset: {
        findMany: jest.fn(async () => rows),
        createMany: jest.fn(async ({ data }) => { rows.unshift(...data); return { count: data.length }; }),
      },
    } as unknown as PrismaClient;
    const gate = new Promise<void>((accept, reject) => { release = accept; rejectRender = reject; });
    render = jest.fn(async (input, _jobDir, outputDir) => {
      await mkdir(outputDir, { recursive: true });
      for (const stop of input.stops) await writeFile(join(outputDir, stop.id + '.mp3'), 'encoded audio fixture');
      await gate; // The real runner resolves only after Qwen restoration.
      return { phase: 'rendered', completedStops: input.stops.length, totalStops: input.stops.length,
        results: input.stops.map(stop => ({ id: stop.id, filename: stop.id + '.mp3', durationSeconds: 12.5 })) };
    });
    service = new TourAudioService(client, render, { storageDir: join(directory, 'audio'), jobsDir: join(directory, 'jobs') });
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(async () => {
    release();
    process.env.VOXCPM_PRESET_PATH = oldPreset;
    if (oldPreset === undefined) delete process.env.VOXCPM_PRESET_PATH;
    jest.restoreAllMocks();
    await rm(directory, { recursive: true, force: true });
  });

  async function until(status: string) {
    for (let count = 0; count < 200; count++) {
      const state = await service.get(tourId);
      if (state.status === status) return state;
      await tick();
    }
    throw new Error('Audio did not reach ' + status);
  }
  async function started() {
    for (let count = 0; count < 200 && !render.mock.calls.length; count++) await tick();
    expect(render).toHaveBeenCalledTimes(1);
  }

  it('generates only after explicit POST, deduplicates requests, and publishes after restoration', async () => {
    expect((await service.get(tourId)).status).toBe('idle');
    expect(render).not.toHaveBeenCalled();
    const [first, duplicate] = await Promise.all([service.create(tourId), service.create(tourId)]);
    expect(first.id).toBe(duplicate.id);
    await started();
    expect(render.mock.calls[0][0].stops[0].text).toBe(tour.places[0].description);
    expect(client.audioAsset.createMany).not.toHaveBeenCalled();
    await expect(service.withTextGeneration(async () => 'new tour')).rejects.toMatchObject({ code: 'AUDIO_BUSY' });
    await expect(service.create(otherTour)).rejects.toMatchObject({ code: 'GENERATION_BUSY' });
    release();
    const finished = await until('completed');
    expect(finished.audioUrls[placeId]).toContain('/api/backend/tours/' + tourId + '/audio/' + placeId);
    expect(client.audioAsset.createMany).toHaveBeenCalledTimes(1);
    expect((await service.create(tourId)).status).toBe('completed');
    expect(render).toHaveBeenCalledTimes(1);
    expect(await readFile(await service.audioFile(tourId, placeId), 'utf8')).toBe('encoded audio fixture');
  });

  it('keeps text and exposes a retryable error without storing substitute audio', async () => {
    await service.create(tourId);
    await started();
    rejectRender(new Error('GPU render failed'));
    const failed = await until('failed');
    expect(failed.error?.code).toBe('AUDIO_GENERATION_FAILED');
    expect(failed.audioUrls).toEqual({});
    expect(client.audioAsset.createMany).not.toHaveBeenCalled();
    expect(tour.places[0].description).toContain('\n\n');
    expect(await service.withTextGeneration(async () => 'ready')).toBe('ready');
  });

  it('does not attach audio if the saved narration changes during rendering', async () => {
    await service.create(tourId);
    await started();
    tour.places[0].description = 'Una narración nueva.';
    release();
    for (let count = 0; count < 100; count++) {
      const job = JSON.parse(await readFile(join(directory, 'jobs', tourId + '.json'), 'utf8'));
      if (job.status === 'failed') break;
      await tick();
    }
    expect(client.audioAsset.createMany).not.toHaveBeenCalled();
    expect((await service.get(tourId)).status).toBe('idle');
  });

  it('does not reuse legacy audio and regenerates missing files', async () => {
    rows.push({ placeId, language: 'es', metadata: { provider: 'Kokoro' }, storagePath: 'old.wav' });
    expect((await service.get(tourId)).audioUrls).toEqual({});
    await service.create(tourId);
    await started();
    release();
    await until('completed');
    const path = await service.audioFile(tourId, placeId);
    await rm(path);
    expect((await service.get(tourId)).status).toBe('idle');
    await expect(service.audioFile(tourId, placeId)).rejects.toMatchObject({ code: 'AUDIO_NOT_FOUND' });
  });

  it('rejects incomplete tours, unsupported languages and active text generation before rendering', async () => {
    tour.status = 'draft';
    await expect(service.create(tourId)).rejects.toMatchObject({ code: 'TOUR_NOT_READY' });
    tour.status = 'published';
    tour.language = 'de';
    await expect(service.create(tourId)).rejects.toMatchObject({ code: 'AUDIO_LANGUAGE_UNSUPPORTED' });
    tour.language = 'es';
    (client.generationJob.count as jest.Mock).mockResolvedValue(1);
    await expect(service.create(tourId)).rejects.toMatchObject({ code: 'TEXT_GENERATION_BUSY' });
    expect(render).not.toHaveBeenCalled();
  });

  it('blocks audio during text admission, before the text job has reached the DB', async () => {
    let finishText!: () => void;
    const text = service.withTextGeneration(() => new Promise<void>(accept => { finishText = accept; }));
    await expect(service.create(tourId)).rejects.toMatchObject({ code: 'GENERATION_BUSY' });
    finishText();
    await text;
    expect(render).not.toHaveBeenCalled();
  });

  it('reports interrupted persisted jobs after a backend restart', async () => {
    await service.create(tourId);
    await started();
    const restarted = new TourAudioService(client, render, { storageDir: join(directory, 'audio'), jobsDir: join(directory, 'jobs') });
    expect((await restarted.get(tourId)).error?.code).toBe('AUDIO_INTERRUPTED');
    release();
    await until('completed');
  });

  it('completes multi-stop batch and selectively retries a missing audio file', async () => {
    const secondPlaceId = '44444444-4444-4444-8444-444444444444';
    tour.places.push({ id: secondPlaceId, description: 'Segundo, observamos la fuente.' });
    await service.create(tourId);
    await started();
    expect(render).toHaveBeenCalledTimes(1);
    expect(render.mock.calls[0][0].stops).toHaveLength(2);
    expect(render.mock.calls[0][0].stops.map(s => s.id)).toEqual([placeId, secondPlaceId]);
    release();
    const completed = await until('completed');
    expect(completed.audioUrls[placeId]).toContain('/api/backend/tours/' + tourId + '/audio/' + placeId);
    expect(completed.audioUrls[secondPlaceId]).toContain('/api/backend/tours/' + tourId + '/audio/' + secondPlaceId);
    const missingPath = await service.audioFile(tourId, secondPlaceId);
    await rm(missingPath);
    const afterDelete = await service.get(tourId);
    expect(afterDelete.status).toBe('idle');
    expect(afterDelete.completedStops).toBe(1);
    expect(Object.keys(afterDelete.audioUrls)).toHaveLength(1);
    expect(afterDelete.audioUrls[placeId]).toContain('/api/backend/tours/' + tourId + '/audio/' + placeId);
    expect(afterDelete.audioUrls[secondPlaceId]).toBeUndefined();
    await service.create(tourId);
    const secondCompleted = await until('completed');
    expect(render).toHaveBeenCalledTimes(2);
    expect(render.mock.calls[1][0].stops).toHaveLength(1);
    expect(render.mock.calls[1][0].stops[0].id).toBe(secondPlaceId);
    expect(secondCompleted.audioUrls[placeId]).toContain('/api/backend/tours/' + tourId + '/audio/' + placeId);
    expect(secondCompleted.audioUrls[secondPlaceId]).toContain('/api/backend/tours/' + tourId + '/audio/' + secondPlaceId);
  });
});
