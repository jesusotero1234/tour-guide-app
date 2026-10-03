import { PrismaClient } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { access, mkdir, readFile, rename, writeFile } from 'fs/promises';
import { dirname, join, resolve } from 'path';
import { setTimeout as delay } from 'timers/promises';
import { AudioRenderInput, runLocalVoxCpm, readRenderProgress, tourProjectRoot } from './LocalVoxCpmRenderer';
import { audioDisclosure, audioIdentity, rendererKeyOf } from './AudioProvenance';
import { activeIntroduction, audioFileSha256 } from './IntroductionAudio';
import type { CueKind, CueManifestEntry } from './TourCues';

export interface IntroductionAudioState {
  status: 'completed'; text: string; audioUrl: string; version: string; durationSeconds?: number;
}

export interface Cue { text: string; audioUrl: string; version: string; durationSeconds?: number }
export interface TourCues { first: Record<string, Cue>; next: Record<string, Cue>; finish?: Cue }

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
  audioVersions?: Record<string, string>;
  transcripts?: Record<string, string>;
  introduction?: IntroductionAudioState;
  canGenerate?: boolean;
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
type Snapshot = AudioRenderInput & { requestHash: string; rendererKey: string; hashes: Record<string, string>;
  introductionText: string; introductionHash: string;
  introduction?: IntroductionAudioState; introductionPath?: string };

export class TourAudioService {
  private reservedTourId: string | null = null;
  private textAdmissions = 0;
  private readonly submissions = new Map<string, Promise<TourAudioState>>();
  private readonly enqueuedTourIds = new Set<string>();
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

  async snapshot(tourId: string, separateIntroduction = false): Promise<Snapshot> {
    if (!uuid.test(tourId)) throw new TourAudioError('TOUR_NOT_FOUND', 'Tour not found.', 404);
    const tour = await this.client.tour.findUnique({
      where: { id: tourId }, include: { places: { orderBy: { position: 'asc' } } },
    });
    const metadata = tour?.metadata as Record<string, unknown> | undefined;
    if (!tour || !(tour.status === 'published' || (tour.status === 'review' && metadata?.codexAuthor))) {
      throw new TourAudioError('TOUR_NOT_READY', 'Finish creating the tour before adding audio.', 404);
    }
    if (!['es', 'fr', 'en', 'de', 'it'].includes(tour.language)) {
      throw new TourAudioError('AUDIO_LANGUAGE_UNSUPPORTED', 'Audio is available for Spanish, French, English, German and Italian tours.', 422);
    }
    const presetPath = resolve(process.env.VOXCPM_PRESET_PATH || join(tourProjectRoot(), `pods/voxcpm-pod/presets/guide-${tour.language}-a.json`));
    const presetBytes = await readFile(presetPath);
    const preset = JSON.parse(presetBytes.toString('utf8')) as { reference: string };
    const reference = await readFile(resolve(dirname(presetPath), preset.reference));
    const identity = audioIdentity(presetBytes, reference);
    const rendererKey = rendererKeyOf(identity);
    // On-screen text (what the public API shows) and spoken text (what is synthesised and hashed) are different when the
    // tour has been through the speech normalizer. Without spokenText every hash is exactly what it was before it existed.
    const introductionText = tour.introduction?.trim() ? [audioDisclosure(tour.language), tour.introduction.trim()].join('\n\n') : '';
    const introductionSpoken = introductionText && tour.introductionSpokenText?.trim()
      ? [audioDisclosure(tour.language), tour.introductionSpokenText.trim()].join('\n\n') : introductionText;
    const introductionHash = hash(tour.language + rendererKey + introductionSpoken);
    const spokenOf = (place: { spokenText?: string | null; description: string }) => place.spokenText?.trim() || place.description.trim();
    const active = tour.places[0] && introductionText ? await activeIntroduction(this.client, this.storageDir, tour, {
      rendererKey, sourceHash: introductionHash, firstId: tour.places[0].id,
      firstHash: hash(tour.language + rendererKey + spokenOf(tour.places[0])),
    }) : null;
    const split = separateIntroduction || !!active;
    const stops = tour.places.map((place, index) => {
      const own = place.spokenText?.trim() || undefined;
      if (index === 0 && !split) {
        // The introduction is read inside this chapter: its spoken variant needs every piece to have its own spoken text.
        const intro = tour.introductionSpokenText?.trim() || undefined;
        const spokenText = own && intro ? [audioDisclosure(tour.language), intro, own].join('\n\n') : undefined;
        return { id: place.id, text: [audioDisclosure(tour.language), tour.introduction?.trim(), place.description.trim()].filter(Boolean).join('\n\n'),
          ...(spokenText ? { spokenText } : {}) };
      }
      return { id: place.id, text: place.description.trim(), ...(own ? { spokenText: own } : {}) };
    });
    if (!stops.length || stops.length > 40 || tour.places.some(place => !place.description.trim()) ||
        stops.some(stop => !stop.text || stop.text.length > 50000 || (stop.spokenText?.length ?? 0) > 50000)) {
      throw new TourAudioError('NARRATION_NOT_READY', 'Every stop needs a complete narration before adding audio.', 422);
    }
    const hashes = Object.fromEntries(stops.map(stop => [stop.id, hash(tour.language + rendererKey + (stop.spokenText ?? stop.text))]));
    const version = active ? introductionHash + '.' + (active.metadata as Record<string, unknown>).fileSha256 : undefined;
    return { language: tour.language, identity, stops, hashes, rendererKey, introductionText, introductionHash,
      requestHash: hash(JSON.stringify(hashes)),
      ...(active ? { introductionPath: active.storagePath, introduction: { status: 'completed' as const,
        text: introductionText, audioUrl: '/api/backend/tours/' + tourId + '/audio/introduction?v=' + version,
        version: version!, durationSeconds: active.durationSeconds ?? undefined } } : {}),
    };
  }

  async assets(snapshot: Snapshot) {
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
        if (metadata.fileSha256 === await audioFileSha256(join(this.storageDir, row.storagePath))) valid.set(row.placeId, row);
      } catch { /* Missing audio must be generated again. */ }
    }
    return valid;
  }

  /**
   * The link clips of an order-flexible tour, or null when the tour has none or any of them cannot be served. The tour
   * lists its clips in metadata.cueManifest (so admission never queries for them); here each entry must be backed by a row
   * of the current voice whose file verifies. Only GET /tours/:id/audio and the clip route call this, never the listing.
   */
  async cues(tourId: string): Promise<TourCues | null> {
    const found = await this.resolveCues(tourId);
    if (!found) return null;
    const result: TourCues = { first: {}, next: {} };
    for (const { entry, row } of found) {
      const cue: Cue = { text: entry.text, version: entry.version, durationSeconds: row.durationSeconds ?? undefined,
        audioUrl: '/api/backend/tours/' + tourId + '/cue/' + (entry.kind === 'finish' ? 'finish' : entry.kind + '/' + entry.placeId) + '?v=' + entry.version };
      if (entry.kind === 'finish') result.finish = cue; else result[entry.kind][entry.placeId as string] = cue;
    }
    return result;
  }

  async cueFile(tourId: string, kind: CueKind, placeId: string | undefined, expectedVersion?: string): Promise<string> {
    const found = await this.resolveCues(tourId);
    const hit = found?.find(({ entry }) => entry.kind === kind && entry.placeId === placeId);
    if (!hit) throw new TourAudioError('AUDIO_NOT_FOUND', 'This link clip is not ready.', 404);
    if (expectedVersion && expectedVersion !== hit.entry.version) throw new TourAudioError('AUDIO_VERSION_CHANGED', 'Audio version changed.', 409);
    return join(this.storageDir, hit.row.storagePath);
  }

  private async resolveCues(tourId: string) {
    if (!uuid.test(tourId)) return null;
    const tour = await this.client.tour.findUnique({ where: { id: tourId }, select: { metadata: true, language: true, places: { select: { id: true } } } });
    const manifest = (tour?.metadata as { cueManifest?: CueManifestEntry[] } | undefined)?.cueManifest;
    if (!tour || !Array.isArray(manifest) || !manifest.length) return null;
    const { rendererKey } = await this.snapshot(tourId);
    const rows = await this.client.tourCueAudio.findMany({ where: { tourId }, orderBy: { createdAt: 'desc' } });
    const resolved: Array<{ entry: CueManifestEntry; row: typeof rows[number] }> = [];
    for (const entry of manifest) {
      let match: typeof rows[number] | undefined;
      for (const row of rows) {
        const metadata = row.metadata as Record<string, unknown>;
        if (row.kind !== entry.kind || (row.placeId ?? undefined) !== entry.placeId || row.language !== tour.language
          || metadata?.rendererKey !== rendererKey || entry.version !== metadata.sourceHash + '.' + metadata.fileSha256
          || metadata.sourceHash !== hash(tour.language + rendererKey + row.spokenText)
          || !/^voxcpm2\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/.test(row.storagePath)) continue;
        try { if (metadata.fileSha256 === await audioFileSha256(join(this.storageDir, row.storagePath))) { match = row; break; } }
        catch { /* A missing file is not served. */ }
      }
      if (!match) return null;
      resolved.push({ entry, row: match });
    }
    return resolved;
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

  async get(tourId: string, readOnly = false): Promise<TourAudioState> {
    const snapshot = await this.snapshot(tourId);
    const assets = await this.assets(snapshot);
    const audioUrls = Object.fromEntries([...assets.keys()].map(id => [
      id, '/api/backend/tours/' + tourId + '/audio/' + id + '?v=' + snapshot.hashes[id] + '.' + (assets.get(id)!.metadata as Record<string, unknown>).fileSha256,
    ]));
    const base: TourAudioState = { tourId, status: 'idle', phase: 'idle', completedStops: assets.size,
      totalStops: snapshot.stops.length, audioUrls,
      audioVersions: Object.fromEntries([...assets].map(([id, row]) => [id, snapshot.hashes[id] + '.' + (row.metadata as Record<string, unknown>).fileSha256])),
      transcripts: Object.fromEntries(snapshot.stops.map(stop => [stop.id, stop.text])),
      ...(snapshot.introduction ? { introduction: snapshot.introduction } : {}), canGenerate: true };
    const job = await this.readJob(tourId);
    if (assets.size === snapshot.stops.length) return { ...base, id: job?.id, status: 'completed', phase: 'completed' };
    if (!job || job.requestHash !== snapshot.requestHash) return base;
    if (!readOnly && ['queued', 'running'].includes(job.status) && this.reservedTourId !== tourId) {
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
      const result = await this.render({ language: snapshot.language, identity: snapshot.identity, stops: missing }, join(this.jobsDir, job.id), outputDir);
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
      const fileHashes = Object.fromEntries(await Promise.all(result.results.map(async row => [row.id, hash(await readFile(join(outputDir, row.filename)))])));
      if (result.results.some(row => (row.sha256 && row.sha256 !== fileHashes[row.id]) ||
        (row.modelRevision && row.modelRevision !== snapshot.identity?.modelRevision))) throw new Error('Audio provenance mismatch');
      await writeFile(join(outputDir, 'provenance.json'), JSON.stringify({ version: 1, tourId: job.tourId,
        identity: snapshot.identity, files: result.results.map(row => ({ placeId: row.id, fileSha256: fileHashes[row.id], sourceHash: snapshot.hashes[row.id] })) }), { mode: 0o600 });
      await this.client.audioAsset.createMany({ data: result.results.map(row => ({
        placeId: row.id, language: snapshot.language, format: 'mp3',
        storagePath: 'voxcpm2/' + job.id + '/' + row.filename,
        durationSeconds: Math.round(row.durationSeconds),
        metadata: { provider: 'VoxCPM2', voice: 'A', rendererKey: snapshot.rendererKey,
          sourceHash: snapshot.hashes[row.id], audioJobId: job.id, fileSha256: fileHashes[row.id],
          identity: { ...snapshot.identity } },
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

  async audioFile(tourId: string, placeId: string, expectedVersion?: string): Promise<string> {
    const snapshot = await this.snapshot(tourId);
    if (placeId === 'introduction') {
      if (!snapshot.introduction || !snapshot.introductionPath) throw new TourAudioError('AUDIO_NOT_FOUND', 'Introduction audio is not ready.', 404);
      if (expectedVersion && expectedVersion !== snapshot.introduction.version) throw new TourAudioError('AUDIO_VERSION_CHANGED', 'Audio version changed.', 409);
      return join(this.storageDir, snapshot.introductionPath);
    }
    const asset = (await this.assets(snapshot)).get(placeId);
    if (!asset) throw new TourAudioError('AUDIO_NOT_FOUND', 'Audio is not ready for this stop.', 404);
    const version = snapshot.hashes[placeId] + '.' + (asset.metadata as Record<string, unknown>).fileSha256;
    if (expectedVersion && expectedVersion !== version) throw new TourAudioError('AUDIO_VERSION_CHANGED', 'Audio version changed.', 409);
    return join(this.storageDir, asset.storagePath);
  }

  enqueue(tourId: string): void {
    if (this.enqueuedTourIds.has(tourId)) return;
    this.enqueuedTourIds.add(tourId);
    setImmediate(() => {
      void this.scheduleAudio(tourId).finally(() => {
        this.enqueuedTourIds.delete(tourId);
      });
    });
  }

  private async scheduleAudio(tourId: string): Promise<void> {
    const startedAt = Date.now();
    const maxWaitMs = 2 * 60 * 60 * 1000;
    while (true) {
      if (Date.now() - startedAt > maxWaitMs) {
        console.error('[tour-audio] Automatic scheduling timed out', { tourId });
        return;
      }
      let state: TourAudioState;
      try {
        state = await this.get(tourId);
      } catch (error) {
        console.error('[tour-audio] Failed to get tour audio state', { tourId, error });
        return;
      }
      if (state.status === 'completed' || state.status === 'queued' || state.status === 'running') {
        return;
      }
      if (state.status === 'failed') {
        if (state.error?.code !== 'AUDIO_INTERRUPTED') {
          return;
        }
      }
      try {
        await this.create(tourId);
        return;
      } catch (error) {
        const code = (error as TourAudioError).code;
        if (code === 'GENERATION_BUSY' || code === 'TEXT_GENERATION_BUSY' || code === 'AUDIO_BUSY') {
          await delay(15000);
          continue;
        }
        console.error('[tour-audio] Automatic scheduling failed', { tourId, error });
        return;
      }
    }
  }
}
