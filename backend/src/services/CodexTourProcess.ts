import { spawn } from 'node:child_process';
import { access, readFile, stat, mkdir, writeFile, unlink } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TourRequest } from '../types/api';
import { TourBlueprintSnapshot } from './TourBlueprint';
import { CodexProgress } from './CodexTourGenerator';

export class TourGenerationAttemptError extends Error {
  constructor(message: string, readonly accountedUsd: number) { super(message); }
}
export interface TourPhaseInput {
  mode: 'prepare' | 'narrate'; request: TourRequest; runId: string; limitUsd: number;
  snapshot?: TourBlueprintSnapshot;
}
export interface TourPhaseResult { costUsd: number; snapshot?: unknown; review?: unknown; author?: unknown }
export type TourPhaseRunner = (input: TourPhaseInput, progress?: (value: CodexProgress) => Promise<void>, signal?: AbortSignal) => Promise<TourPhaseResult>;
async function readJson(path: string) {
  if ((await stat(path)).size > 9 * 1024 * 1024) throw new Error('Artifact too large');
  return JSON.parse(await readFile(path, 'utf8'));
}
const executeTourPhase: TourPhaseRunner = async (input, progress, signal) => {
  signal?.throwIfAborted();
  if (!/^app-[a-z0-9-]+$/.test(input.runId) || !Number.isFinite(input.limitUsd) || input.limitUsd <= 0) throw new Error('Invalid worker request');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Node 22 is required');
  const root = resolve(__dirname, '../..');
  const name = input.mode === 'prepare' ? 'narrative-user-canary-v8' : 'narrative-blueprint-author-v8';
  const worker = resolve(root, 'dist-generation/scripts/validation/' + name + '.js');
  const assetRoot = process.env.NARRATIVE_AUTHOR_ASSET_ROOT || resolve(root, '../docs/operations');
  await access(worker);
  await access(resolve(assetRoot, 'narrative-author-context-pack-20260906/malagueta-oneshot.md'));
  await access(resolve(assetRoot, 'narrative-plaza-mayor-reference-20260905.md'));
  const inputRoot = resolve(root, 'tmp/blueprint-inputs'), directory = resolve(root, 'tmp/narrative-v8', input.runId);
  await mkdir(inputRoot, { recursive: true, mode: 0o700 });
  await mkdir(resolve(root, 'tmp/narrative-v8'), { recursive: true, mode: 0o700 });
  const inputFile = resolve(inputRoot, input.runId + '.json');
  const destination = input.request.destination;
  if (input.mode === 'prepare' && !destination) throw new Error('Resolved destination required');
  if (input.mode === 'narrate' && !input.snapshot) throw new Error('Blueprint required');
  await writeFile(inputFile, JSON.stringify(input.mode === 'prepare' ? destination : { snapshot: input.snapshot, request: input.request }), { mode: 0o600, flag: 'wx' });
  const args = input.mode === 'prepare'
    ? [worker, '--generate', '--allow-external', '--profile=qwen38_hybrid', '--writer-transport=codex',
      '--prepare-blueprint', '--destination-file=' + inputFile, '--city-qid=' + destination!.qid,
      '--city=' + input.request.city, '--country=' + input.request.country, '--country-code=' + input.request.countryCode,
      '--theme=' + input.request.theme, '--language=' + destination!.researchLanguages[0],
      '--research-languages=' + destination!.researchLanguages.join(','), '--duration=' + input.request.durationMinutes,
      '--rag=off', '--prior-spend-usd=0']
    : [worker, '--allow-external', '--input=' + inputFile];
  args.push('--run-id=' + input.runId, '--spend-limit-usd=' + input.limitUsd);
  let started = false;
  const accounted = async () => {
    try {
      const b = await readJson(resolve(directory, 'budget.private.json'));
      const value = b.spentUsd + b.reservedUsd;
      if (typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= input.limitUsd + 1e-9) return value;
    } catch { /* Unknown spend stays charged at its reserved maximum. */ }
    return started ? input.limitUsd : 0;
  };
  try {
    await new Promise<void>((done, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, shell: false,
        env: { ...process.env, NARRATIVE_AUTHOR_ASSET_ROOT: assetRoot }, stdio: ['ignore', 'ignore', 'ignore'] });
      started = true;
      let failure: Error | undefined, killTimer: NodeJS.Timeout | undefined, reading = false;
      const stop = (error: Error) => {
        if (failure) return;
        failure = error;
        killTimer = setTimeout(() => child.kill('SIGKILL'), 10000); killTimer.unref();
        child.kill('SIGTERM');
      };
      const abort = () => stop(new Error('Generation cancelled'));
      const deadline = setTimeout(() => stop(new Error('Generation deadline exceeded')), 31 * 60 * 1000);
      deadline.unref();
      const timer = setInterval(() => {
        if (reading || failure || !progress) return;
        reading = true;
        void (async () => {
          let state;
          try { state = await readJson(resolve(directory, 'codex-author-review.private.json')); } catch { return; }
          if (!Array.isArray(state.stops)) return;
          await progress({ step: state.stops.some((s: {status?:string}) => s.status === 'audit_pending') ? 'validating' : 'narrating',
            completedStops: state.stops.filter((s: {status?:string}) => s.status === 'audited').length,
            totalStops: input.snapshot?.checkpoint.route.stops.length ?? state.stops.length,
            message: 'Writing and auditing the requested language' });
        })().catch(() => stop(new Error('Could not persist generation progress'))).finally(() => { reading = false; });
      }, 2000);
      timer.unref();
      const cleanup = () => { clearInterval(timer); clearTimeout(deadline); if (killTimer) clearTimeout(killTimer); signal?.removeEventListener('abort', abort); };
      child.once('error', () => { started = false; cleanup(); reject(new Error('Could not start generation worker')); });
      child.once('close', code => { cleanup(); if (failure) reject(failure); else if (code !== 0) reject(new Error('Generation worker failed: ' + input.runId)); else done(); });
      signal?.addEventListener('abort', abort, { once: true });
      if (signal?.aborted) abort();
    });
    signal?.throwIfAborted();
    const costUsd = await accounted();
    return input.mode === 'prepare'
      ? { costUsd, snapshot: await readJson(resolve(directory, 'blueprint.private.json')) }
      : { costUsd, review: await readJson(resolve(directory, 'review.json')), author: await readJson(resolve(directory, 'codex-author-review.private.json')) };
  } catch (error) {
    let reason = error instanceof Error ? error.message : 'Generation failed';
    try {
      const review = await readJson(resolve(directory, 'review.json'));
      if (review.geometry?.status === 'route_review_required') reason = 'TOUR_ROUTE_UNAVAILABLE';
      else if (review.failure?.code === 'research_infrastructure_unavailable') reason = 'TOUR_RESEARCH_UNAVAILABLE';
    } catch { /* Keep the original error when the worker has no review artifact. */ }
    throw new TourGenerationAttemptError(reason, await accounted());
  } finally { await unlink(inputFile).catch(() => undefined); }
};
export const runTourPhase: TourPhaseRunner = async (input, progress, signal) => {
  try { return await executeTourPhase(input, progress, signal); }
  catch (error) {
    // Process failures already carry their measured/reserved charge. Earlier setup performs no inference.
    if (error instanceof TourGenerationAttemptError) throw error;
    throw new TourGenerationAttemptError(error instanceof Error ? error.message : 'Worker setup failed', 0);
  }
};
