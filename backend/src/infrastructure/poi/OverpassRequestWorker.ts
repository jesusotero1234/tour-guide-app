/** One request, run exclusively by OverpassCoordinator under an OS flock. */
import axios from 'axios';
import { promises as fs } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { initialState, admit, reserve, finish, CoordinatorState, Outcome } from './OverpassCoordinatorPolicy';
import { OverpassQueryCache } from './OverpassQueryCache';
import { sourceHash, sourceRecord, sourceEvent, SourceTimingAgent } from './SourceAcquisition';
import type { CoordinatedRequest, CoordinatedResult } from './OverpassCoordinator';
import { RawPoi } from '../../domain/poi/RawPoi';

const DATE_CEILING = 253402300799000;
const NETWORK_ERRORS = new Set(['ECONNABORTED', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'EAI_AGAIN', 'ENOTFOUND', 'ERR_NETWORK', 'EPIPE', 'ERR_SOCKET_CONNECTION_TIMEOUT']);
export interface WorkerInput extends CoordinatedRequest { directory: string; endpoints: string[]; timeoutMs: number }
class ResponseError extends Error {
  constructor(message: string, readonly retriable = false, readonly busy = false) { super(message); }
}
class Deferred extends Error { constructor(readonly result: CoordinatedResult) { super(result.message); } }
const finiteTime = (value: unknown) => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= DATE_CEILING;
function validateState(state: CoordinatorState, endpoints: string[]): void {
  if (state?.version !== 1 || !finiteTime(state.nextRequestAt) || !state.queries || !state.providers
      || !state.metrics || !Number.isSafeInteger(state.metrics.requests) || !Number.isSafeInteger(state.metrics.cacheHits)
      || !endpoints.includes(state.preferredEndpoint)
      || !endpoints.every(endpoint => {
        const p = state.providers[endpoint];
        return p && finiteTime(p.retryAt) && finiteTime(p.lastFailureAt) && Number.isSafeInteger(p.failures)
          && p.failures >= 0 && typeof p.recovery === 'boolean' && typeof p.restricted === 'boolean';
      }) || !Object.values(state.queries).every(q => q && Number.isSafeInteger(q.attempts) && q.attempts >= 0)
      || (state.incident && (!finiteTime(state.incident.retryAt) || !Number.isInteger(state.incident.windowsUsed)
          || state.incident.windowsUsed < 0 || state.incident.windowsUsed > 3 || typeof state.incident.exhausted !== 'boolean'))
      || (state.active && (!finiteTime(state.active.until) || !finiteTime(state.active.startedAt)
          || !endpoints.includes(state.active.endpoint) || !state.queries[state.active.key]))) {
    throw new Error('Invalid persisted Overpass coordinator state; no request was sent.');
  }
}
async function save(file: string, value: unknown): Promise<void> {
  const temporary = file + '.' + randomUUID() + '.tmp';
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(JSON.stringify(value, null, 2) + '\n'); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temporary, file);
}
function retryAfter(value: unknown): number {
  const text = String(value ?? '').trim();
  if (/^\d+$/.test(text)) return Math.min(DATE_CEILING, Number(text) * 1000);
  const date = Date.parse(text);
  return Number.isFinite(date) ? Math.max(0, date - Date.now()) : 0;
}
function decodeElements(data: any): RawPoi[] {
  if (!Array.isArray(data?.elements)) throw new ResponseError('Overpass response missing elements array');
  if (data.remark && String(data.remark).trim()) {
    const remark = String(data.remark);
    throw new ResponseError('Overpass partial runtime failure: ' + remark,
      /timed out|timeout|temporarily unavailable|server is probably too busy/i.test(remark), /server is probably too busy/i.test(remark));
  }
  return data.elements.flatMap((element: any) => {
    const lat = element.type === 'node' ? element.lat : element.center?.lat;
    const lng = element.type === 'node' ? element.lon : element.center?.lon;
    if (!['node', 'way', 'relation'].includes(element.type) || !Number.isFinite(element.id)
        || !Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const tags = element.tags ?? {};
    return [{ osmType: element.type, osmId: element.id, name: tags.name ?? '', lat, lng, tags }];
  });
}

export async function runRequest(input: WorkerInput): Promise<CoordinatedResult> {
  if (!input.cityKey?.trim() || !input.query?.trim() || !input.endpoints.length
      || !Number.isFinite(input.timeoutMs) || input.timeoutMs <= 0 || input.timeoutMs > 70_000) throw new Error('Invalid request');
  const queryHash = sourceHash(input.query), key = input.cityKey + '/' + queryHash;
  const stateFile = join(input.directory, 'state.json');
  let state: CoordinatorState;
  try { state = JSON.parse(await fs.readFile(stateFile, 'utf8')); }
  catch (error: any) { if (error.code !== 'ENOENT') throw error; state = initialState(input.endpoints); }
  validateState(state, input.endpoints);
  const cache = new OverpassQueryCache(input.cacheDirectory, input.ttlMs);
  let provenance: Record<string, unknown> = {}, cacheHit = false;
  let endpoint = '', probe = false, dispatched = false, httpStatus: number | null = null;
  let attempts = state.queries[key]?.attempts ?? 0;
  let outcome: Outcome = { ok: false };
  try {
    const pois = await cache.getOrFetch(input.cityKey, input.query, async () => {
      let decision = admit(state, key, input.endpoints, Date.now());
      await save(stateFile, state); // Includes recovery of an abandoned reservation.
      if (decision.kind === 'wait' && decision.retryAt! - Date.now() <= 3_100) {
        await new Promise(resolve => setTimeout(resolve, Math.max(0, decision.retryAt! - Date.now())));
        decision = admit(state, key, input.endpoints, Date.now());
      }
      if (decision.kind !== 'ready') {
        await save(stateFile, state);
        throw new Deferred({ status: decision.kind === 'wait' ? 'waiting' : 'error', coordinated: true,
          type: decision.reason ?? 'source_wait', queryHash, attempts,
          ...(decision.retryAt ? { retryNotBefore: new Date(decision.retryAt).toISOString() } : {}),
          recoveryWindowsRemaining: state.incident ? Math.max(0, 3 - state.incident.windowsUsed) : undefined,
          message: decision.kind === 'wait' ? 'Waiting for shared Overpass availability.' : 'Overpass acquisition stopped: ' + decision.reason });
      }
      endpoint = decision.endpoint!; probe = Boolean(decision.probe);
      attempts = reserve(state, key, endpoint, Date.now(), input.timeoutMs, probe);
      state.active!.pid = process.pid;
      await save(stateFile, state); // Reserve before any bytes can reach the provider.
      dispatched = true;
      const started = Date.now(), startedAt = new Date(started).toISOString();
      const agent = endpoint.startsWith('https:') ? new SourceTimingAgent({ keepAlive: false }) : undefined;
      sourceEvent({ type: 'request_started', coordinated: true, queryHash, cityKey: input.cityKey, endpoint, startedAt, attempt: attempts, probe });
      try {
        const response = await axios.post(endpoint, input.query, { timeout: input.timeoutMs, httpsAgent: agent,
          maxRedirects: 0, headers: { 'User-Agent': 'tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)', 'Content-Type': 'text/plain' } });
        httpStatus = response.status;
        const result = decodeElements(response.data);
        provenance = { endpoint, queryHash, cityKey: input.cityKey, startedAt, elapsedMs: Date.now() - started,
          ...agent?.timings, httpStatus, osmTimestamp: response.data.osm3s?.timestamp_osm_base ?? null,
          remark: null, elementCount: response.data.elements.length, poiCount: result.length,
          rawResponseFile: process.env.SOURCE_ACQUISITION_DIR ? join(process.env.SOURCE_ACQUISITION_DIR, `response-${queryHash}.json`) : null,
          rawResponseFileSha256: sourceHash(JSON.stringify(response.data, null, 2) + '\n'),
          responseSha256: sourceHash(JSON.stringify(response.data)), coordinated: true, cacheHit: false,
          status: result.length ? 'complete_under_policy' : 'valid_empty' };
        sourceRecord('response-' + queryHash, response.data);
        sourceRecord('result-' + queryHash, provenance);
        sourceEvent({ type: 'request_completed', ...provenance });
        outcome = { ok: true };
        return result;
      } catch (error) {
        const ax = axios.isAxiosError(error) ? error : undefined;
        httpStatus = ax?.response?.status ?? httpStatus;
        const providerMessage = typeof ax?.response?.data === 'string' ? ax.response.data.slice(0, 2000) : '';
        const busy = /server is probably too busy|temporarily unavailable/i.test(providerMessage) || (error instanceof ResponseError && error.busy);
        outcome = { ok: false, restricted: httpStatus === 403,
          serviceBusy: httpStatus === 429 || httpStatus === 503 || busy,
          retriable: error instanceof ResponseError ? error.retriable : Boolean(ax &&
            (httpStatus !== null ? [429, 502, 503, 504].includes(httpStatus) : NETWORK_ERRORS.has(ax.code ?? ''))),
          retryAfterMs: retryAfter(ax?.response?.headers?.['retry-after']), message: error instanceof Error ? error.message : String(error) };
        sourceEvent({ type: 'request_failed', coordinated: true, queryHash, cityKey: input.cityKey, endpoint, startedAt,
          elapsedMs: Date.now() - started, ...agent?.timings, httpStatus, transportCode: ax?.code ?? null,
          message: outcome.message, providerMessage, status: error instanceof ResponseError ? 'rejected_partial' : 'unavailable' });
        throw error;
      } finally { agent?.destroy(); }
    }, { requirePersistence: true, provenance: () => provenance,
      onHit: entry => { cacheHit = true; provenance = { ...entry.provenance, fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt }; } });
    if (dispatched) finish(state, key, endpoint, Date.now(), { ok: true }, probe);
    else state.metrics.cacheHits++;
    await save(stateFile, state);
    return { status: 'ok', coordinated: true, queryHash, endpoint: String(provenance.endpoint ?? endpoint), attempts, cacheHit, pois, provenance };
  } catch (error) {
    if (error instanceof Deferred) return error.result;
    if (!dispatched) throw error;
    // A successful HTTP response whose cache/evidence cannot be persisted must
    // fail explicitly; publishing a success would permit duplicate acquisition.
    if (outcome.ok) outcome = { ok: false, message: 'Could not persist validated Overpass response.' };
    finish(state, key, endpoint, Date.now(), outcome, probe);
    await save(stateFile, state);
    const decision = admit(state, key, input.endpoints, Date.now());
    await save(stateFile, state);
    const waiting = decision.kind !== 'error';
    const retryAt = decision.retryAt ?? Math.max(state.nextRequestAt, Date.now() + 3_000);
    return { status: waiting ? 'waiting' : 'error', coordinated: true, queryHash, endpoint, attempts, httpStatus,
      transportCode: axios.isAxiosError(error) ? error.code ?? null : null,
      type: waiting ? 'source_wait' : decision.reason,
      ...(waiting ? { retryNotBefore: new Date(retryAt).toISOString() } : {}),
      recoveryWindowsRemaining: state.incident ? Math.max(0, 3 - state.incident.windowsUsed) : undefined,
      message: outcome.message ?? String(error) };
  }
}

if (require.main === module) {
  // The cache has human-readable logs; reserve stdout exclusively for the IPC envelope.
  console.log = (...args: unknown[]) => console.error(...args);
  let input = '';
  process.stdin.setEncoding('utf8');
  process.stdin.on('data', chunk => { input += chunk; });
  process.stdin.on('end', () => {
    runRequest(JSON.parse(input)).then(result => process.stdout.write(JSON.stringify(result)))
      .catch(error => process.stdout.write(JSON.stringify({ status: 'error', coordinated: true,
        type: 'coordinator_invalid_state', message: error.message })));
  });
}
