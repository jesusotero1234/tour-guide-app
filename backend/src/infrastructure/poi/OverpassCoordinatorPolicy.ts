/** Durable, transport-independent admission policy. Call only under the shared lock. */
const CEILING = 253402300799000;
const WINDOWS = [300_000, 900_000, 1_800_000];
type Provider = { retryAt: number; failures: number; lastFailureAt: number; recovery: boolean; restricted: boolean };
type Incident = { id: string; windowsUsed: number; retryAt: number; exhausted: boolean };
export interface CoordinatorState {
  version: 1;
  nextRequestAt: number;
  preferredEndpoint: string;
  providers: Record<string, Provider>;
  queries: Record<string, { attempts: number; terminal?: string }>;
  active: null | { key: string; endpoint: string; startedAt: number; until: number; probe: boolean; pid?: number };
  incident: Incident | null;
  lastIncident?: Incident;
  metrics: { requests: number; cacheHits: number };
}
export interface Decision { kind: 'ready' | 'wait' | 'error'; endpoint?: string; probe?: boolean; retryAt?: number; reason?: string }
export interface Outcome { ok: boolean; retriable?: boolean; restricted?: boolean; serviceBusy?: boolean; retryAfterMs?: number; message?: string }
const date = (value: number) => Math.min(CEILING, value);
const wait = (retryAt: number): Decision => ({ kind: 'wait', retryAt: date(retryAt), reason: 'source_wait' });
const error = (reason: string): Decision => ({ kind: 'error', reason });
const available = (state: CoordinatorState) => Object.keys(state.providers).filter(e => !state.providers[e].restricted);
const earliest = (state: CoordinatorState, endpoints = available(state)) =>
  Math.min(...endpoints.map(e => state.providers[e].retryAt));

export function initialState(endpoints: string[]): CoordinatorState {
  if (!endpoints.length) throw new Error('Missing Overpass endpoints');
  return { version: 1, nextRequestAt: 0, preferredEndpoint: endpoints[0],
    providers: Object.fromEntries(endpoints.map(e => [e, { retryAt: 0, failures: 0, lastFailureAt: 0, recovery: false, restricted: false }])),
    queries: {}, active: null, incident: null, metrics: { requests: 0, cacheHits: 0 } };
}

function openIncident(state: CoordinatorState, now: number): void {
  const endpoints = available(state);
  if (!state.incident && endpoints.length && endpoints.every(e => state.providers[e].recovery)) {
    state.incident = { id: String(now), windowsUsed: 0, exhausted: false,
      retryAt: date(Math.max(now + WINDOWS[0], earliest(state), state.nextRequestAt)) };
  }
}

export function admit(state: CoordinatorState, key: string, endpoints: string[], now: number): Decision {
  if (state.active) {
    if (now < state.active.until) return wait(state.active.until);
    const abandoned = state.active;
    finish(state, abandoned.key, abandoned.endpoint, now,
      { ok: false, retriable: true, message: 'Interrupted request; outcome unknown.' }, abandoned.probe);
  }
  const query = state.queries[key];
  if (query?.terminal) return error(query.terminal);
  const usable = endpoints.filter(e => !state.providers[e].restricted);
  if (!usable.length) return error('service_restricted');
  openIncident(state, now);
  if (state.incident) {
    if (state.incident.exhausted || state.incident.windowsUsed >= 3 || (query?.attempts ?? 0) >= 7) {
      return error('source_recovery_exhausted');
    }
    const endpoint = [...usable].sort((a, b) => state.providers[a].retryAt - state.providers[b].retryAt
      || Number(b === state.preferredEndpoint) - Number(a === state.preferredEndpoint))[0];
    const retryAt = Math.max(state.incident.retryAt, state.nextRequestAt, state.providers[endpoint].retryAt);
    return now < retryAt ? wait(retryAt) : { kind: 'ready', endpoint, probe: true };
  }
  if ((query?.attempts ?? 0) >= 4) return error('source_recovery_exhausted');
  const healthy = usable.filter(e => !state.providers[e].recovery);
  const eligible = healthy.filter(e => state.providers[e].retryAt <= now);
  if (now < state.nextRequestAt || !eligible.length) return wait(Math.max(state.nextRequestAt, earliest(state, healthy)));
  return { kind: 'ready', endpoint: eligible.includes(state.preferredEndpoint) ? state.preferredEndpoint : eligible[0], probe: false };
}

export function reserve(state: CoordinatorState, key: string, endpoint: string, now: number, timeoutMs: number, probe: boolean): number {
  const decision = admit(state, key, Object.keys(state.providers), now);
  if (decision.kind !== 'ready' || decision.endpoint !== endpoint || Boolean(decision.probe) !== probe) {
    throw new Error('Overpass request has no valid admission');
  }
  const query = state.queries[key] ?? (state.queries[key] = { attempts: 0 });
  if (query.attempts >= (probe ? 7 : 4)) throw new Error('Overpass attempt budget exhausted');
  if (probe) state.incident!.windowsUsed++;
  query.attempts++;
  state.metrics.requests++;
  state.active = { key, endpoint, startedAt: now, until: date(now + timeoutMs + 30_000), probe };
  state.nextRequestAt = state.active.until;
  return query.attempts;
}

export function finish(state: CoordinatorState, key: string, endpoint: string, now: number, outcome: Outcome, probe: boolean): void {
  const provider = state.providers[endpoint];
  const query = state.queries[key];
  if (!query || !provider) throw new Error('Missing reserved Overpass request');
  state.active = null;
  state.nextRequestAt = date(now + 3_000);
  if (outcome.ok) {
    provider.retryAt = 0; provider.failures = 0; provider.lastFailureAt = 0; provider.recovery = false;
    state.preferredEndpoint = endpoint;
    delete state.queries[key];
    if (state.incident && probe) { state.lastIncident = { ...state.incident }; state.incident = null; }
    return;
  }
  if (outcome.restricted || !outcome.retriable) {
    query.terminal = outcome.restricted ? 'service_restricted' : 'query_failed';
    if (outcome.restricted) provider.restricted = true;
  } else {
    const backoff = Math.round(30_000 * 2 ** Math.min(3, query.attempts - 1) * (1 + Math.random() * 0.2));
    const serverWait = outcome.retryAfterMs && outcome.retryAfterMs > 0 ? outcome.retryAfterMs : 0;
    provider.failures = now - provider.lastFailureAt <= 300_000 ? provider.failures + 1 : 1;
    provider.lastFailureAt = now;
    provider.recovery = provider.recovery || Boolean(outcome.serviceBusy) || provider.failures >= 2;
    provider.retryAt = date(Math.max(provider.retryAt, now + backoff, now + serverWait,
      provider.recovery ? now + WINDOWS[0] : 0));
  }
  if (probe && state.incident) {
    const used = state.incident.windowsUsed;
    state.incident.exhausted = used >= 3;
    if (used < 3) state.incident.retryAt = date(Math.max(now + WINDOWS[used], earliest(state), state.nextRequestAt));
  } else {
    openIncident(state, now);
  }
  if (!state.incident && query.attempts >= 4 && !query.terminal) query.terminal = 'source_recovery_exhausted';
}
