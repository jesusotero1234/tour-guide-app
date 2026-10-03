import type { PrismaClient } from '@prisma/client';
import express from 'express';
import type { Server } from 'http';
import { randomBytes } from 'crypto';
import { PostgresTourRepository } from '../../../infrastructure/postgres/PostgresTourRepository';
import { PostgresWalkingLegsStore } from '../../../infrastructure/postgres/PostgresWalkingLegsStore';
import { createPilotRouter } from '../../../api/routes/pilot';
import { TourAudioService } from '../../TourAudioService';
import { validWalkingLegs, walkingLegsSha256 } from '../../WalkingLegs';
import { rollbackTourUpdate, applyTourUpdate, type UpdateClient } from '../applyUpdate';
import { assertDisposableDatabase } from '../guard';
import { createVerifier } from '../fingerprint';
import type { CatalogUpdatePackage } from '../types';
import { manifestOf, type Ctx } from './context';
import type { NeutralPieceIn } from '../py';

export interface HttpReport {
  phase: 'baseline' | 'after'; at: string; expected: number; served: number;
  latencyMs: { cold: number; hot: number } | null; problems: string[];
}

interface Served { id: string; language: string; introduction?: string; orderFlexible?: boolean; pilot?: { version?: string }; introductionAudio?: { audioUrl: string };
  places: Array<{ id: string; audioUrl?: string; audioVersion?: string }> }

/** Starts the pilot API of the backend on a free port against this database, exactly as production serves it (admission included). */
async function withPilotServer<T>(db: PrismaClient, paths: { storageDir: string; jobsDir: string }, fn: (get: (path: string, method?: string) => Promise<{ status: number; body: any }>) => Promise<T>): Promise<T> {
  if (process.env.LOCAL_REVIEW_TOUR_ID) throw new Error('LOCAL_REVIEW_TOUR_ID skips admission and must not be set while verifying');
  const saved = process.env.PILOT_API_KEY;
  const key = (saved && saved.length >= 32 ? saved : randomBytes(24).toString('hex'));
  process.env.PILOT_API_KEY = key;
  const app = express();
  const bases = { isCurrent: async () => false, findById: async () => null } as never;
  app.use('/api/v1/pilot', createPilotRouter(new PostgresTourRepository(db), bases, new TourAudioService(db, undefined, paths), async () => true, new PostgresWalkingLegsStore(db)));
  const server: Server = await new Promise(done => { const s = app.listen(0, '127.0.0.1', () => done(s)); });
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/v1/pilot`;
  try {
    return await fn(async (path, method = 'GET') => {
      const response = await fetch(base + path.replace(/^\/api\/backend\//, '/'), { method, headers: { 'X-API-Key': key } });
      const type = response.headers.get('content-type') ?? '';
      return { status: response.status, body: method === 'GET' && type.includes('json') ? await response.json() : null };
    });
  } finally {
    await new Promise(done => server.close(done));
    if (saved === undefined) delete process.env.PILOT_API_KEY; else process.env.PILOT_API_KEY = saved;
  }
}

/**
 * Plan 04 sections 8.2 (baseline) and 9.2 (after): what the API serves for these tours, with its latency. `detail` also fetches every
 * audio, link clip and walking-legs response and checks that the emergency switch turns the new behaviour off.
 */
export async function httpChecks(ctx: Ctx, db: PrismaClient, paths: { storageDir: string; jobsDir: string },
  options: { phase: 'baseline' | 'after'; tourIds: string[]; checkDetail: boolean; expectedFingerprints?: Record<string, string> }): Promise<HttpReport> {
  const manifest = manifestOf(ctx.stage);
  const expected = options.expectedFingerprints ?? Object.fromEntries(manifest.tours.map(t => [t.tourId, t.fingerprint]));
  const problems: string[] = [];
  return withPilotServer(db, paths, async get => {
    const languages = [...new Set(manifest.tours.filter(t => options.tourIds.includes(t.tourId)).map(t => t.language))].sort();
    const served = new Map<string, Served>();
    let latency: HttpReport['latencyMs'] = null;
    for (const language of languages) {
      const started = Date.now();
      const first = await get(`/tours?language=${language}&limit=50`);
      const cold = Date.now() - started;
      if (first.status !== 200) { problems.push(`/tours?language=${language} answered ${first.status}`); continue; }
      const hotStarted = Date.now();
      await get(`/tours?language=${language}&limit=50`);
      if (language === 'es' || !latency) latency = { cold, hot: Date.now() - hotStarted };
      for (const tour of first.body.data.tours as Served[]) served.set(tour.id, tour);
    }
    for (const id of options.tourIds) {
      const tour = served.get(id);
      if (!tour) { problems.push(`${id}: not served by /tours`); continue; }
      if (tour.pilot?.version !== expected[id]) problems.push(`${id}: serves version ${tour.pilot?.version} instead of ${expected[id]}`);
    }
    if (options.checkDetail) {
      for (const id of options.tourIds) {
        const tour = served.get(id);
        if (!tour) continue;
        if (tour.orderFlexible !== true) problems.push(`${id}: orderFlexible is not exposed`);
        const audio = await get(`/tours/${id}/audio`);
        const cues = audio.body?.cues;
        const placeIds = tour.places.map(p => p.id);
        if (audio.status !== 200 || !cues?.finish || placeIds.some(p => !cues.first?.[p] || !cues.next?.[p])) problems.push(`${id}: link clips are incomplete`);
        const urls = [tour.introductionAudio?.audioUrl, ...tour.places.map(p => p.audioUrl), cues?.finish?.audioUrl,
          ...placeIds.flatMap(p => [cues?.first?.[p]?.audioUrl, cues?.next?.[p]?.audioUrl])];
        for (const url of urls) {
          if (!url) { problems.push(`${id}: a file has no URL`); continue; }
          const head = await get(url, 'HEAD');
          if (head.status !== 200) problems.push(`${id}: ${url} answered ${head.status}`);
        }
        const legs = await get(`/tours/${id}/walking-legs`);
        if (legs.status !== 200 || !validWalkingLegs(legs.body?.data, placeIds) || walkingLegsSha256(legs.body.data) !== (await db.tourWalkingLegs.findUnique({ where: { tourId: id } }))?.sha256) problems.push(`${id}: walking legs are not valid`);
      }
      // The emergency switch: the new frontend must see exactly what the old data looked like.
      const sample = options.tourIds[0];
      if (sample) {
        const savedSwitch = process.env.PILOT_FLEXIBLE_ORDER;
        process.env.PILOT_FLEXIBLE_ORDER = 'off';
        try {
          const tour = await get(`/tours/${sample}`), audio = await get(`/tours/${sample}/audio`), legs = await get(`/tours/${sample}/walking-legs`);
          if (tour.body?.orderFlexible !== undefined) problems.push('PILOT_FLEXIBLE_ORDER=off still exposes orderFlexible');
          if (audio.body?.cues !== undefined) problems.push('PILOT_FLEXIBLE_ORDER=off still exposes cues');
          if (legs.status !== 404) problems.push('PILOT_FLEXIBLE_ORDER=off still serves walking-legs');
        } finally { if (savedSwitch === undefined) delete process.env.PILOT_FLEXIBLE_ORDER; else process.env.PILOT_FLEXIBLE_ORDER = savedSwitch; }
      }
    }
    return { phase: options.phase, at: ctx.deps.now().toISOString(), expected: options.tourIds.length, served: options.tourIds.filter(id => served.has(id)).length, latencyMs: latency, problems };
  });
}

export interface VerifyReport {
  at: string; tours: number; rollback: { restored: number; problems: string[] }; apply: { updated: number; problems: string[] };
  http: HttpReport; latency: { baseline: HttpReport['latencyMs']; after: HttpReport['latencyMs']; withinBudget: boolean }; orderReferences: string[]; ok: boolean;
}

/** The limit of plan 04 section 9.2: no more than 30 % slower than the local baseline (with a floor, so milliseconds do not decide). */
export const latencyWithinBudget = (baseline: number, after: number) => after <= Math.max(baseline * 1.3, baseline + 50);

/**
 * Plan 04 section 9: on the disposable copy, (1) put every tour back with the package's own `previous` block and check that the
 * snapshot's fingerprints return, (2) apply the final package with the same importer production will run, (3) check what the API
 * serves for every tour, and (4) check that no link phrase is left in the new descriptions.
 */
export async function verifyPhase(ctx: Ctx, options: { storageDir: string }): Promise<VerifyReport> {
  const { stage, deps } = ctx;
  stage.require('verify');
  assertDisposableDatabase(process.env.DATABASE_URL);
  const db = deps.prisma!();
  const paths = { storageDir: options.storageDir, jobsDir: stage.path('audio-jobs') };
  const pkg = stage.read<CatalogUpdatePackage>('package', 'catalog-update.json');
  const client = db as unknown as UpdateClient;
  const verifyTour = createVerifier(db, paths);
  const manifest = manifestOf(stage);
  const ids = pkg.tours.map(t => t.tourId);
  const rollbackProblems: string[] = [];
  let restored = 0;
  for (const entry of pkg.tours) {
    const outcome = await rollbackTourUpdate(client, entry);
    const check = await verifyTour(entry.tourId);
    if (!['updated', 'skipped'].includes(outcome.status) || !check.admitted || check.fingerprint !== entry.expectedCurrentFingerprint) rollbackProblems.push(`${entry.tourId}: rollback ${outcome.status}${outcome.reason ? ' ' + outcome.reason : ''}; admitted=${check.admitted}; fingerprint=${check.fingerprint}`);
    else restored++;
  }
  const baseline = stage.readOr<HttpReport | null>(null, 'stage-local', 'baseline.json');
  const applyProblems: string[] = [];
  let updated = 0;
  for (const entry of pkg.tours) {
    const outcome = await applyTourUpdate(client, entry, verifyTour);
    if (outcome.status === 'updated') updated++; else applyProblems.push(`${entry.tourId}: ${outcome.status} ${outcome.reason ?? ''}`);
  }
  const http = await httpChecks(ctx, db, paths, { phase: 'after', tourIds: ids, checkDetail: true, expectedFingerprints: Object.fromEntries(pkg.tours.map(t => [t.tourId, t.update.metadata.pilotRelease.fingerprint])) });
  // No sentence of the new descriptions may refer to the order (plan 03 section 5.2).
  const orderReferences: string[] = [];
  for (const entry of pkg.tours) {
    const tour = manifest.tours.find(t => t.tourId === entry.tourId)!;
    const pieces: NeutralPieceIn[] = [{ kind: 'introduction', pieceId: 'introduction', text: entry.update.introduction },
      ...entry.update.places.map((p, i) => ({ kind: 'stop' as const, pieceId: p.placeId, name: tour.places[i]?.name ?? '', text: p.description }))];
    if (deps.python.neutralizeEstimate(tour.language, { tourId: tour.tourId, pieces }).requests) orderReferences.push(entry.tourId);
  }
  const within = !baseline?.latencyMs || !http.latencyMs || (latencyWithinBudget(baseline.latencyMs.cold, http.latencyMs.cold) && latencyWithinBudget(baseline.latencyMs.hot, http.latencyMs.hot));
  const report: VerifyReport = { at: deps.now().toISOString(), tours: ids.length, rollback: { restored, problems: rollbackProblems }, apply: { updated, problems: applyProblems }, http,
    latency: { baseline: baseline?.latencyMs ?? null, after: http.latencyMs, withinBudget: within }, orderReferences,
    ok: !rollbackProblems.length && !applyProblems.length && !http.problems.length && !orderReferences.length && within };
  stage.write(report, 'verify', 'report.json');
  stage.writeReceipt('verify', [stage.path('verify', 'report.json')], { ok: report.ok, tours: ids.length });
  deps.log(`verify: ${report.ok ? 'OK' : 'FAILED'} ${JSON.stringify({ tours: ids.length, restored, updated, httpProblems: http.problems.length, orderReferences: orderReferences.length, latency: report.latency })}`);
  return report;
}
