import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { access, mkdir, readFile, rename, stat, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { AudioRenderInput, runLocalVoxCpm, readRenderProgress, tourProjectRoot } from './LocalVoxCpmRenderer';

export interface TourAudioState {
  tourId: string;
  id?: string;
  status: 'idle' | 'queued' | 'running' | 'completed' | 'failed' | 'unavailable';
  phase: string;
  completedStops: number;
  totalStops: number;
  completedChunks?: number;
  totalChunks?: number;
  currentStopId?: string;
  audioUrls: Record<string, string>;
  error?: { code: string; message: string };
}
interface StoredJob {
  id: string; tourId: string; requestHash: string;
  status: 'queued' | 'running' | 'completed' | 'failed';
  error?: { code: string; message: string };
}
export class TourAudioError extends Error {
  constructor(public readonly code: string, message: string, public readonly status = 409) { super(message); }
}
const hash = (text: string | Buffer) => createHash('sha256').update(text).digest('hex');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
type Snapshot = AudioRenderInput & { requestHash: string; rendererKey: string; hashes: Record<string, string> };

export class TourAudioService {
  private reservedTourId: string | null = null;
  private textAdmissions = 0;
  private readonly submissions = new Map<string, Promise<TourAudioState>>();
  private readonly storageDir: string;
  private readonly jobsDir: string;

  constructor(
    private readonly client: PrismaClient,
    private readonly render: typeof runLocalVoxCpm = runLocalVoxCpm,
    paths?: { storageDir: string; jobsDir: string },
  ) {
    this.storageDir = resolve(paths?.storageDir || process.env.AUDIO_STORAGE_PATH || './data/audio');
    this.jobsDir = resolve(paths?.jobsDir || process.env.AUDIO_JOBS_PATH || join(this.storageDir, '../audio-jobs'));
  }

  // Admission and audio reservation are synchronous, before either request touches the DB.
  async withTextGeneration<T>(create: () => Promise<T>): Promise<T> {
    if (this.reservedTourId) throw new TourAudioError('AUDIO_BUSY', 'Please wait for audio generation to finish.');
    this.textAdmissions += 1;
    try { return await create(); } finally { this.textAdmissions -= 1; }
  }

  private async snapshot(tourId: string): Promise<Snapshot> {
    if (!uuid.test(tourId)) throw new TourAudioError('TOUR_NOT_FOUND', 'Tour not found.', 404);
    const tour = await this.client.tour.findUnique({
      where: { id: tourId }, include: { places: { orderBy: { position: 'asc' } } },
    });
    const metadata = tour?.metadata as Record<string, unknown> | undefined;
    if (!tour || !(tour.status === 'published' || (tour.status === 'review' && metadata?.codexAuthor))) {
      throw new TourAudioError('TOUR_NOT_READY', 'Finish creating the tour before adding audio.', 404);
    }
    if (!['es', 'fr'].includes(tour.language)) {
      throw new TourAudioError('AUDIO_LANGUAGE_UNSUPPORTED', 'Audio is available for Spanish and French tours.', 422);
    }
    const presetPath = resolve(process.env.VOXCPM_PRESET_PATH || join(tourProjectRoot(), 'pods/voxcpm-pod/presets/guide-es-a.json'));
    const presetBytes = await readFile(presetPath);
    const preset = JSON.parse(presetBytes.toString('utf8')) as { reference: string };
    const reference = await readFile(resolve(dirname(presetPath), preset.reference));
    const rendererKey = hash('voxcpm2-voice-a-chunked-v1:' + hash(presetBytes) + hash(reference));
    const stops = tour.places.map(place => ({ id: place.id, text: place.description.trim() }));
    if (!stops.length || stops.length > 40 || stops.some(stop => !stop.text || stop.text.length > 50000)) {
      throw new TourAudioError('NARRATION_NOT_READY', 'Every stop needs a complete narration before adding audio.', 422);
    }
    const hashes = Object.fromEntries(stops.map(stop => [stop.id, hash(tour.language + rendererKey + stop.text)]));
    return { language: tour.language, stops, hashes, rendererKey, requestHash: hash(JSON.stringify(hashes)) };
  }

  private async assets(snapshot: Snapshot) {
    const rows = await this.client.audioAsset.findMany({
      where: { placeId: { in: snapshot.stops.map(stop => stop.id) }, language: snapshot.language },
      orderBy: { createdAt: 'desc' },
    });
    const valid = new Map<string, typeof rows[number]>();
    for (const row of rows) {
      const metadata = row.metadata as Record<string, unknown>;
      if (valid.has(row.placeId) || metadata?.rendererKey !== snapshot.rendererKey ||
          metadata?.sourceHash !== snapshot.hashes[row.placeId] ||
          !/^voxcpm2\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/.test(row.storagePath)) continue;
      try {
        const info = await stat(join(this.storageDir, row.storagePath));
        if (info.isFile() && info.size > 0) valid.set(row.placeId, row);
      } catch { /* Missing audio must be generated again. */ }
    }
    return valid;
  }

  private jobPath(tourId: string) { return join(this.jobsDir, tourId + '.json'); }
  private async readJob(tourId: string): Promise<StoredJob | null> {
    try { return JSON.parse(await readFile(this.jobPath(tourId), 'utf8')) as StoredJob; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }
  private async saveJob(job: StoredJob): Promise<void> {
    await mkdir(this.jobsDir, { recursive: true });
    const target = this.jobPath(job.tourId);
    const temporary = target + '.' + randomUUID() + '.tmp';
    await writeFile(temporary, JSON.stringify(job), 'utf8');
    await rename(temporary, target);
  }

  async get(tourId: string): Promise<TourAudioState> {
    const snapshot = await this.snapshot(tourId);
    const assets = await this.assets(snapshot);
    const audioUrls = Object.fromEntries([...assets.keys()].map(id => [
      id, '/api/backend/tours/' + tourId + '/audio/' + id + '?v=' + snapshot.hashes[id],
    ]));
    const base: TourAudioState = { tourId, status: 'idle', phase: 'idle', completedStops: assets.size,
      totalStops: snapshot.stops.length, audioUrls };
    const job = await this.readJob(tourId);
    if (assets.size === snapshot.stops.length) return { ...base, id: job?.id, status: 'completed', phase: 'completed' };
    if (!job || job.requestHash !== snapshot.requestHash) return base;
    if (['queued', 'running'].includes(job.status) && this.reservedTourId !== tourId) {
      job.status = 'failed';
      job.error = { code: 'AUDIO_INTERRUPTED', message: 'Audio generation was interrupted. Please try again.' };
      await this.saveJob(job);
    }
    const result: TourAudioState = { ...base, id: job.id, status: job.status, phase: job.status, error: job.error };
    if (job.status === 'running') {
      const progress = await readRenderProgress(join(this.jobsDir, job.id));
      if (progress) {
        result.phase = progress.phase === 'rendered' ? 'restoring' : progress.phase;
        result.completedStops = Math.min(base.totalStops, assets.size + (progress.completedStops || 0));
        result.completedChunks = progress.completedChunks;
        result.totalChunks = progress.totalChunks;
        result.currentStopId = progress.currentStopId;
      }
    }
    // A completed manifest with missing files must be retryable.
    if (result.status === 'completed') result.status = 'idle';
    return result;
  }

  create(tourId: string): Promise<TourAudioState> {
    const existing = this.submissions.get(tourId);
    if (existing) return existing;
    if (this.reservedTourId === tourId) return this.get(tourId);
    if (this.reservedTourId || this.textAdmissions) {
      return Promise.reject(new TourAudioError('GENERATION_BUSY', 'Another tour or audio is being prepared. Please try again shortly.'));
    }
    this.reservedTourId = tourId;
    const submission = this.start(tourId).finally(() => this.submissions.delete(tourId));
    this.submissions.set(tourId, submission);
    return submission;
  }

  private async start(tourId: string): Promise<TourAudioState> {
    let dispatched = false;
    try {
      const pendingText = await this.client.generationJob.count({ where: { status: { in: ['queued', 'running'] } } });
      if (pendingText) throw new TourAudioError('TEXT_GENERATION_BUSY', 'Please wait for tour creation to finish before adding audio.');
      const snapshot = await this.snapshot(tourId);
      const available = await this.assets(snapshot);
      if (available.size === snapshot.stops.length) return await this.get(tourId);
      const missing = snapshot.stops.filter(stop => !available.has(stop.id));
      const job: StoredJob = { id: randomUUID(), tourId, requestHash: snapshot.requestHash, status: 'queued' };
      await this.saveJob(job);
      const result = await this.get(tourId);
      dispatched = true;
      setImmediate(() => {
        void this.execute(job, snapshot, missing).catch(error => console.error('[tour-audio] Job persistence failed', error))
          .finally(() => { this.reservedTourId = null; });
      });
      return result;
    } finally {
      if (!dispatched) this.reservedTourId = null;
    }
  }

  private async execute(job: StoredJob, snapshot: Snapshot, missing: AudioRenderInput['stops']): Promise<void> {
    try {
      job.status = 'running';
      await this.saveJob(job);
      const outputDir = join(this.storageDir, 'voxcpm2', job.id);
      const result = await this.render({ language: snapshot.language, stops: missing }, join(this.jobsDir, job.id), outputDir);
      const current = await this.snapshot(job.tourId);
      if (current.requestHash !== snapshot.requestHash) throw new Error('Tour narration changed during rendering');
      if (result.results.length !== missing.length || new Set(result.results.map(row => row.id)).size !== missing.length) {
        throw new Error('Incomplete audio results');
      }
      for (const row of result.results) {
        if (!missing.some(stop => stop.id === row.id) || row.filename !== row.id + '.mp3' ||
            !Number.isFinite(row.durationSeconds) || row.durationSeconds <= 0) throw new Error('Invalid audio result');
        await access(join(outputDir, row.filename));
      }
      await this.client.audioAsset.createMany({ data: result.results.map(row => ({
        placeId: row.id, language: snapshot.language, format: 'mp3',
        storagePath: 'voxcpm2/' + job.id + '/' + row.filename,
        durationSeconds: Math.round(row.durationSeconds),
        metadata: { provider: 'VoxCPM2', voice: 'A', rendererKey: snapshot.rendererKey,
          sourceHash: snapshot.hashes[row.id], audioJobId: job.id },
      })) });
      job.status = 'completed';
      delete job.error;
    } catch (error) {
      console.error('[tour-audio] Generation failed', { tourId: job.tourId, jobId: job.id, error });
      job.status = 'failed';
      job.error = { code: 'AUDIO_GENERATION_FAILED', message: 'Audio could not be completed. Your tour text is saved; please try again.' };
    }
    await this.saveJob(job);
  }

  async audioFile(tourId: string, placeId: string): Promise<string> {
    const snapshot = await this.snapshot(tourId);
    const asset = (await this.assets(snapshot)).get(placeId);
    if (!asset) throw new TourAudioError('AUDIO_NOT_FOUND', 'Audio is not ready for this stop.', 404);
    return join(this.storageDir, asset.storagePath);
  }
}
