import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { access, readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TourRepository } from '../domain/repositories/TourRepository';
import { TourRequest } from '../types/api';
import { CODEX_TOUR_PIPELINE, mapCodexTourArtifact } from './CodexTourArtifact';

export type CodexProgress = { step: 'routing' | 'planning_narrative' | 'narrating' | 'validating' | 'repairing'; completedStops: number; totalStops: number; message: string };
export type CodexRun = (request: TourRequest, runId: string, progress: ((value: CodexProgress) => Promise<void>) | undefined, signal?: AbortSignal) => Promise<{ review: unknown; author: unknown }>;

async function readArtifact(path: string): Promise<unknown> {
  if ((await stat(path)).size > 16 * 1024 * 1024) throw new Error('Generation artifact exceeds size limit');
  return JSON.parse(await readFile(path, 'utf8'));
}

export const runCodexTour: CodexRun = async (request, runId, progress, signal) => {
  signal?.throwIfAborted();
  const root = resolve(__dirname, '../..');
  const worker = resolve(root, 'dist-generation/scripts/validation/narrative-user-canary-v8.js');
  await access(worker);
  const assetRoot = process.env.NARRATIVE_AUTHOR_ASSET_ROOT || resolve(root, '../docs/operations');
  await access(resolve(assetRoot, 'narrative-author-context-pack-20260906/malagueta-oneshot.md'));
  await access(resolve(assetRoot, 'narrative-plaza-mayor-reference-20260905.md'));
  const limit = Number(process.env.TOUR_GENERATION_SPEND_LIMIT_USD || '2');
  if (!Number.isFinite(limit) || limit <= 0) throw new Error('Invalid tour generation budget');
  if (Number(process.versions.node.split('.')[0]) < 22) throw new Error('Codex generation requires Node 22 or later');
  const args = [worker, '--generate', '--allow-external', '--profile=qwen38_hybrid', '--writer-transport=codex',
    '--city=' + request.city, '--country=' + request.country, '--country-code=' + request.countryCode,
    '--theme=' + request.theme, '--language=' + request.language, '--duration=' + request.durationMinutes,
    '--rag=off', '--prior-spend-usd=0', '--spend-limit-usd=' + limit, '--run-id=' + runId];
  const directory = resolve(root, 'tmp/narrative-v8', runId);
  await progress?.({ step: 'routing', completedStops: 0, totalStops: 0, message: 'Preparing the route and supporting sources' });
  signal?.throwIfAborted();
  await new Promise<void>((resolveRun, rejectRun) => {
    const child = spawn(process.execPath, args, {
      cwd: root, shell: false, env: { ...process.env, NARRATIVE_AUTHOR_ASSET_ROOT: assetRoot },
      stdio: ['ignore', 'ignore', 'ignore'],
    });
    let failure: Error | undefined, reading = false, killTimer: NodeJS.Timeout | undefined;
    const stop = (reason: Error) => {
      if (failure) return;
      failure = reason;
      killTimer = setTimeout(() => child.kill('SIGKILL'), 10000);
      killTimer.unref();
      child.kill('SIGTERM'); // The worker aborts its Codex subprocess and in-flight API calls.
    };
    const onAbort = () => stop(new Error('Generation cancelled'));
    signal?.addEventListener('abort', onAbort, { once: true });
    if (signal?.aborted) onAbort();
    const deadline = setTimeout(() => stop(new Error('Generation deadline exceeded')), 31 * 60 * 1000);
    deadline.unref();
    const timer = setInterval(() => {
      if (reading || failure || !progress) return;
      reading = true;
      void (async () => {
        let value: unknown;
        try { value = await readArtifact(resolve(directory, 'codex-author-review.private.json')); }
        catch { return; } // File may not exist yet or be between two writes.
        if (!value || typeof value !== 'object' || !('stops' in value) || !Array.isArray(value.stops)) return;
        const stops = value.stops as Array<{ status?: string; script?: unknown }>;
        const done = stops.filter(stop => stop.status === 'audited').length;
        const pending = 'missingStopIds' in value && Array.isArray(value.missingStopIds) ? value.missingStopIds.length : 0;
        await progress({ step: stops.some(stop => stop.status === 'audit_pending') ? 'validating' : 'narrating',
          completedStops: done, totalStops: Math.max(stops.length, stops.filter(stop => stop.script).length + pending),
          message: 'Writing and auditing the tour with Codex' });
      })().catch(() => stop(new Error('Generation progress could not be persisted'))).finally(() => { reading = false; });
    }, 2000);
    timer.unref();
    const cleanup = () => {
      clearInterval(timer); clearTimeout(deadline);
      if (killTimer) clearTimeout(killTimer);
      signal?.removeEventListener('abort', onAbort);
    };
    child.once('error', () => { cleanup(); rejectRun(new Error('Could not start Codex generation worker')); });
    child.once('close', code => {
      cleanup();
      if (failure) rejectRun(failure);
      else if (code !== 0) rejectRun(new Error('Codex generation did not finish. Run: ' + runId));
      else resolveRun();
    });
  });
  signal?.throwIfAborted();
  return { review: await readArtifact(resolve(directory, 'review.json')), author: await readArtifact(resolve(directory, 'codex-author-review.private.json')) };
};

export class CodexTourGenerator {
  readonly pipelineVersion = CODEX_TOUR_PIPELINE;
  constructor(private readonly tours: TourRepository, private readonly run: CodexRun = runCodexTour) {}
  async generateTextTour(request: TourRequest, progress?: (value: CodexProgress) => Promise<void>, signal?: AbortSignal): Promise<{ id: string; reviewRequired: true }> {
    if (request.theme !== 'history' || request.language !== 'es') throw new Error('Codex tours currently support history in Spanish');
    signal?.throwIfAborted();
    const runId = 'app-' + randomUUID();
    const artifacts = await this.run(request, runId, progress, signal);
    signal?.throwIfAborted();
    const draft = mapCodexTourArtifact(request, runId, artifacts.review, artifacts.author);
    const saved = await this.tours.save(draft);
    return { id: saved.id, reviewRequired: true };
  }
}
