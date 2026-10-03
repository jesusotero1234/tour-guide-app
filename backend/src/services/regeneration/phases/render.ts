import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { join } from 'path';
import { cueKey, checkRendered, planRenderJobs, renderInput, tourPieces, type Piece, type Rendered, type RenderJob, type TourRendered } from '../plan';
import { renderJobId } from '../ids';
import { assertSameVoice } from '../plan';
import { voiceIdentity } from '../voice';
import { manifestOf, requireRenderApproval, selectTours, type Ctx } from './context';
import type { CueFile, NeutralFile, SpeechFile } from './prepare';

/** Seconds of speech per character (measured on the Europe batch) and the measured speed of the GPU, plan 04 section 7. */
export const CHARS_PER_SECOND = 15;
export const REALTIME_FACTOR = 6.5;
const RELOAD_SECONDS = 60;

export interface TourPieces { tourId: string; language: string; pieces: Piece[] }

/** The files to render for every selected, ready tour. Tours whose spoken text is not ready are reported and left out. */
export function piecesOf(ctx: Ctx): { tours: TourPieces[]; notReady: string[] } {
  const { stage } = ctx;
  const runId = manifestOf(stage).runId;
  const tours: TourPieces[] = [], notReady: string[] = [];
  for (const tour of selectTours(ctx)) {
    const speech = stage.readOr<SpeechFile | null>(null, 'speech', tour.tourId + '.json');
    if (!speech?.ready) { notReady.push(tour.tourId); continue; }
    const neutral = stage.read<NeutralFile>('neutral', tour.tourId + '.json');
    stage.read<CueFile>('cues', tour.tourId + '.json');
    requireRenderApproval(ctx, tour);
    tours.push({ tourId: tour.tourId, language: tour.language,
      pieces: tourPieces(runId, tour, neutral.bodies, { introductionSpokenText: speech.introductionSpokenText, places: speech.places, cues: speech.cues }) });
  }
  return { tours, notReady };
}

export function estimateRender(jobs: RenderJob[]) {
  const characters = jobs.reduce((n, j) => n + j.pieces.reduce((m, p) => m + p.spokenText.length, 0), 0);
  const audioSeconds = characters / CHARS_PER_SECOND;
  const gpuSeconds = audioSeconds / REALTIME_FACTOR + jobs.length * RELOAD_SECONDS;
  return { jobs: jobs.length, pieces: jobs.reduce((n, j) => n + j.pieces.length, 0), audioHours: Math.round(audioSeconds / 360) / 10, gpuHours: Math.round(gpuSeconds / 360) / 10 };
}

interface JobResult { jobId: string; language: string; pieces: Rendered[] }

/** Every piece already rendered and verified in any earlier job of this run: it is never rendered twice. */
function loadRendered(ctx: Ctx): Map<string, Rendered> {
  const found = new Map<string, Rendered>();
  for (const file of ctx.stage.list('render', 'results')) for (const piece of ctx.stage.read<JobResult>('render', 'results', file.split('/').pop()!).pieces) found.set(piece.audioId, piece);
  return found;
}

/** Verifies one rendered file as plan 04 section 7 requires: decodable, duration, hash and the sidecar's spoken text. */
function verifyPiece(ctx: Ctx, outputDir: string, piece: Piece, reported: { filename: string; durationSeconds: number; sha256?: string }): { ok: boolean; problems: string[]; durationSeconds: number; sha256: string } {
  const file = join(outputDir, reported.filename);
  const problems: string[] = [];
  let seconds = reported.durationSeconds, digest = '';
  try {
    digest = createHash('sha256').update(readFileSync(file)).digest('hex');
    seconds = ctx.deps.decode(file);
  } catch (error) { problems.push('cannot be read or decoded: ' + (error as Error).message); }
  let sidecar: string | undefined;
  try { sidecar = JSON.parse(readFileSync(join(outputDir, piece.audioId + '.provenance.json'), 'utf8')).spokenText; } catch { /* reported below */ }
  if (!problems.length) problems.push(...checkRendered(piece, { durationSeconds: seconds, sidecarSpokenText: sidecar, fileSha256: digest, expectedSha256: reported.sha256 }).problems);
  return { ok: !problems.length, problems, durationSeconds: seconds, sha256: digest };
}

export interface RenderOptions { execute: boolean; maxHours?: number; limitJobs?: number; attempts?: number }

/**
 * Renders the pieces of the selected tours, per language and 40 at a time, and verifies each one. Without --execute it only plans.
 * `maxHours` stops between jobs once the estimated GPU time of this block is used: the user authorises each block of more than
 * one hour (plan 04 section 7). A tour is written to render/<tourId>.json only when all its pieces are rendered and verified.
 */
export async function renderPhase(ctx: Ctx, options: RenderOptions) {
  const { stage, deps } = ctx;
  stage.require('render');
  const runId = manifestOf(stage).runId;
  const { tours, notReady } = piecesOf(ctx);
  const languages = [...new Set(tours.map(t => t.language))].sort();
  const have = loadRendered(ctx);
  const missing = tours.flatMap(t => t.pieces).filter(p => !have.has(p.audioId));
  const jobs = languages.flatMap(language => planRenderJobs(runId, language, missing));
  const estimate = estimateRender(jobs);
  const done = (job: RenderJob) => stage.exists('render', 'results', job.jobId + '.json');
  const pending = jobs.filter(j => !done(j));
  const plan = { ...estimate, pendingJobs: pending.length, pendingEstimate: estimateRender(pending), notReady: notReady.length };
  deps.log(`render plan: ${JSON.stringify(plan)}`);
  if (!options.execute) return { ...plan, rendered: 0, failedPieces: [] as string[] };
  const pieceById = new Map(tours.flatMap(t => t.pieces.map(p => [p.audioId, p] as const)));
  const identities = new Map(languages.map(l => [l, voiceIdentity(l)]));
  for (const tour of selectTours(ctx)) if (identities.has(tour.language)) assertSameVoice(tour, identities.get(tour.language)!);
  let spentSeconds = 0, rendered = 0;
  const failed: string[] = [];
  for (const job of pending) {
    if (options.limitJobs !== undefined && rendered >= options.limitJobs) break;
    const cost = estimateRender([job]).gpuHours * 3600;
    if (options.maxHours !== undefined && spentSeconds + cost > options.maxHours * 3600 && spentSeconds > 0) { deps.log('render: stopped, the authorised block is used up'); break; }
    const result = await renderJobWithRetries(ctx, job, identities.get(job.language)!, pieceById, options.attempts ?? 3);
    spentSeconds += cost;
    if (result.failed.length) failed.push(...result.failed);
    else { stage.write({ jobId: job.jobId, language: job.language, pieces: result.pieces } satisfies JobResult, 'render', 'results', job.jobId + '.json'); rendered++; }
  }
  // A tour is complete when every one of its pieces has a verified file.
  const results = loadRendered(ctx);
  let completeTours = 0;
  for (const tour of tours) {
    if (!tour.pieces.every(p => results.has(p.audioId))) continue;
    const pick = (p: Piece) => results.get(p.audioId)!;
    const rows: TourRendered = { introduction: pick(tour.pieces.find(p => p.kind === 'introduction')!), places: {}, cues: {} };
    for (const p of tour.pieces) {
      if (p.kind === 'stop') rows.places[p.pieceId] = pick(p);
      else if (p.cue) rows.cues[cueKey(p.cue)] = pick(p);
    }
    stage.write(rows, 'render', tour.tourId + '.json');
    completeTours++;
  }
  deps.log(`render: ${rendered} jobs done, ${completeTours}/${tours.length} tours complete, ${failed.length} pieces failed`);
  if (stage.list('render').length) stage.writeReceipt('render', stage.list('render'), { completeTours, tours: tours.length });
  return { ...plan, rendered, completeTours, failedPieces: failed };
}

async function renderJobWithRetries(ctx: Ctx, job: RenderJob, identity: ReturnType<typeof voiceIdentity>, pieceById: Map<string, Piece>, attempts: number) {
  const { stage, deps } = ctx;
  const speechVersion = stage.read<SpeechFile>('speech', job.pieces[0].tourId + '.json').speechVersion;
  const good = new Map<string, Rendered>();
  let remaining = job.pieces;
  for (let attempt = 1; attempt <= attempts && remaining.length; attempt++) {
    const current: RenderJob = attempt === 1 ? job : { ...job, jobId: renderJobId(manifestOf(stage).runId, job.language, 1000 * attempt + job.batch), pieces: remaining };
    const jobDir = stage.path('render', 'jobs', current.jobId), outputDir = stage.path('render', 'audio', 'voxcpm2', current.jobId);
    let reported: Array<{ id: string; filename: string; durationSeconds: number; sha256?: string }> = [];
    try {
      reported = (await deps.render(renderInput(current, identity, speechVersion), jobDir, outputDir, { resume: true })).results;
    } catch (error) {
      deps.log(`render: job ${current.jobId} attempt ${attempt} failed: ${(error as Error).message}`);
      await new Promise(done => setTimeout(done, Number(process.env.REGEN_RETRY_WAIT_MS ?? 30_000) * attempt));
      continue;
    }
    const byId = new Map(reported.map(r => [r.id, r]));
    const next: Piece[] = [];
    for (const piece of current.pieces) {
      const r = byId.get(piece.audioId);
      const check = r ? verifyPiece(ctx, outputDir, piece, r) : { ok: false, problems: ['not reported by the renderer'], durationSeconds: 0, sha256: '' };
      if (check.ok) good.set(piece.audioId, { audioId: piece.audioId, jobId: current.jobId, storagePath: `voxcpm2/${current.jobId}/${piece.audioId}.mp3`, durationSeconds: check.durationSeconds, fileSha256: check.sha256 });
      else { deps.log(`render: ${piece.kind} ${piece.pieceId} of ${piece.tourId}: ${check.problems.join('; ')}`); next.push(piece); }
    }
    remaining = next;
    if (remaining.length) await new Promise(done => setTimeout(done, Number(process.env.REGEN_RETRY_WAIT_MS ?? 30_000) * attempt));
  }
  return { pieces: job.pieces.filter(p => good.has(p.audioId)).map(p => good.get(p.audioId)!), failed: remaining.map(p => p.tourId + ':' + p.kind + ':' + p.pieceId) };
}

