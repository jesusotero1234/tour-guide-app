import { spawn } from 'child_process';
import { existsSync, promises as fs } from 'fs';
import { isAbsolute, join, resolve } from 'path';
import { RawPoi } from '../../domain/poi/RawPoi';
import type { WorkerInput } from './OverpassRequestWorker';

export const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
// The same path in src/, dist/ and dist-generation/src/. Never use the cache
// directory or the caller's cwd: cold-cache runs still share the network gate.
function backendRoot(): string {
  let directory = __dirname;
  for (let i = 0; i < 7; i++) {
    if (existsSync(join(directory, 'package.json')) && existsSync(join(directory, 'scripts/admin'))) return directory;
    directory = resolve(directory, '..');
  }
  throw new Error('Cannot locate backend for shared Overpass coordination');
}
export function overpassCoordinatorDirectory(): string {
  const configured = process.env.OVERPASS_COORDINATOR_DIR;
  if (configured && !isAbsolute(configured)) throw new Error('OVERPASS_COORDINATOR_DIR must be absolute');
  return configured || join(backendRoot(), 'tmp/source-control/overpass');
}
export interface CoordinatedRequest {
  cityKey: string;
  query: string;
  cacheDirectory: string;
  ttlMs: number;
  // Internal callers/tests only. Production always passes the public endpoints.
  endpoints?: string[];
  timeoutMs?: number;
}
export interface CoordinatedResult {
  status: 'ok' | 'waiting' | 'error';
  coordinated: true;
  type?: string;
  message?: string;
  retryNotBefore?: string;
  endpoint?: string;
  queryHash?: string;
  attempts?: number;
  recoveryWindowsRemaining?: number;
  httpStatus?: number | null;
  transportCode?: string | null;
  cacheHit?: boolean;
  pois?: RawPoi[];
  provenance?: Record<string, unknown>;
}
export class OverpassCoordinatorError extends Error {
  constructor(readonly result: CoordinatedResult) {
    super(result.message || result.type || 'Overpass coordinator failure');
  }
}

export async function requestOverpass(input: CoordinatedRequest): Promise<CoordinatedResult> {
  const directory = overpassCoordinatorDirectory();
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  const compiled = join(__dirname, 'OverpassRequestWorker.js');
  const workerArgs = existsSync(compiled) ? [compiled]
    : ['-r', require.resolve('ts-node/register/transpile-only'), join(__dirname, 'OverpassRequestWorker.ts')];
  const payload: WorkerInput = { ...input, directory, cacheDirectory: resolve(input.cacheDirectory),
    endpoints: input.endpoints ?? OVERPASS_ENDPOINTS, timeoutMs: input.timeoutMs ?? 70_000 };
  const result = await new Promise<CoordinatedResult>((accept, reject) => {
    // --no-fork makes the HTTP process own the flock descriptor. If the caller
    // dies, the worker keeps the lock until it finishes; SIGKILL leaves the saved
    // reservation for the next owner to quarantine.
    const child = spawn('flock', ['--exclusive', '--wait', '5', '--conflict-exit-code', '75',
      '--no-fork', join(directory, 'request.lock'), process.execPath, ...workerArgs],
    { stdio: ['pipe', 'pipe', 'pipe'], env: process.env });
    let output = '', diagnostic = '';
    const timer = setTimeout(() => child.kill('SIGKILL'), payload.timeoutMs + 45_000);
    child.stdout.on('data', data => { output += data; });
    child.stderr.on('data', data => { diagnostic = (diagnostic + data).slice(-2000); });
    child.stdin.on('error', () => undefined); // EPIPE is reported with worker exit.
    child.once('error', error => { clearTimeout(timer); reject(error); });
    child.once('close', code => {
      clearTimeout(timer);
      if (code === 75) return accept({ status: 'waiting', coordinated: true, type: 'source_wait',
        retryNotBefore: new Date(Date.now() + 5_000).toISOString(), message: 'Waiting for the shared Overpass request slot.' });
      if (code !== 0) return reject(new Error(`Overpass coordinator exited ${code}: ${diagnostic}`));
      try {
        const parsed = JSON.parse(output);
        if (!['ok', 'waiting', 'error'].includes(parsed.status) || parsed.coordinated !== true) throw new Error('Invalid coordinator response');
        accept(parsed);
      } catch (error) { reject(error); }
    });
    child.stdin.end(JSON.stringify(payload));
  });
  if (result.status !== 'ok') throw new OverpassCoordinatorError(result);
  return result;
}
