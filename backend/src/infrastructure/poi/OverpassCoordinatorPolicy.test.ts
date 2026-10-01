import { admit, finish, initialState, reserve, CoordinatorState } from './OverpassCoordinatorPolicy';

const endpoints = ['primary', 'fallback'];
const START = 1_800_000_000_000;
describe('shared Overpass admission policy', () => {
  beforeEach(() => jest.spyOn(Math, 'random').mockReturnValue(0));
  afterEach(() => jest.restoreAllMocks());
  function request(state: CoordinatorState, key: string, now: number, outcome: Parameters<typeof finish>[4]) {
    const decision = admit(state, key, endpoints, now);
    expect(decision.kind).toBe('ready');
    reserve(state, key, decision.endpoint!, now, 70_000, Boolean(decision.probe));
    finish(state, key, decision.endpoint!, now + 1, outcome, Boolean(decision.probe));
  }
  function outage() {
    const state = initialState(endpoints);
    request(state, 'a', START, { ok: false, retriable: true, serviceBusy: true });
    request(state, 'b', START + 3001, { ok: false, retriable: true, serviceBusy: true });
    return state;
  }
  it('shares waits without charging attempts and keeps a healthy fallback available', () => {
    const state = initialState(endpoints);
    request(state, 'a', START, { ok: false, retriable: true, retryAfterMs: 3_600_000 });
    expect(state.incident).toBeNull();
    expect(admit(state, 'b', endpoints, START + 1).kind).toBe('wait');
    expect(state.queries.b).toBeUndefined();
    expect(admit(state, 'b', endpoints, START + 3001).endpoint).toBe('fallback');
    expect(state.providers.primary.retryAt).toBe(START + 1 + 3_600_000);
    expect(state.metrics.requests).toBe(1);
  });
  it('opens recovery after repeated unknown failures without declaring an outage after one timeout', () => {
    const state = initialState(endpoints);
    request(state, 'a', START, { ok: false, retriable: true });
    expect(state.providers.primary.recovery).toBe(false);
    request(state, 'b', START + 3001, { ok: false, retriable: true });
    expect(state.incident).toBeNull();
    request(state, 'a', START + 30_001, { ok: false, retriable: true });
    request(state, 'b', START + 33_002, { ok: false, retriable: true });
    expect(state.incident?.windowsUsed).toBe(0);
    expect(admit(state, 'new-city', endpoints, START + 34_000).kind).toBe('wait');
  });
  it('allows only three recovery probes across new cities and JSON roundtrip restarts', () => {
    let state = outage();
    expect(state.metrics.requests).toBe(2);
    for (let i = 0; i < 3; i++) {
      state = JSON.parse(JSON.stringify(state));
      const at = state.incident!.retryAt;
      const key = 'city-' + i;
      expect(admit(state, key, endpoints, at - 1).kind).toBe('wait');
      expect(state.queries[key]).toBeUndefined();
      request(state, key, at, { ok: false, retriable: true, serviceBusy: true });
      expect(state.incident!.windowsUsed).toBe(i + 1);
    }
    expect(state.metrics.requests).toBe(5);
    expect(state.incident!.exhausted).toBe(true);
    expect(admit(state, 'another-city', endpoints, START + 99_000_000).reason).toBe('source_recovery_exhausted');
  });
  it('recovers on a real successful probe and preserves its history', () => {
    const state = outage();
    request(state, 'a', state.incident!.retryAt, { ok: true });
    expect(state.incident).toBeNull();
    expect(state.lastIncident!.windowsUsed).toBe(1);
    expect(state.queries.a).toBeUndefined();
    expect(admit(state, 'c', endpoints, state.nextRequestAt).kind).toBe('ready');
  });
  it('permanent/restricted queries do not fail over or consume more attempts', () => {
    const state = initialState(endpoints);
    request(state, 'a', START, { ok: false, restricted: true });
    expect(admit(state, 'a', endpoints, START + 10_000).reason).toBe('service_restricted');
    request(state, 'b', START + 3001, { ok: false });
    expect(admit(state, 'b', endpoints, START + 10_000).reason).toBe('query_failed');
    expect(state.metrics.requests).toBe(2);
  });
  it('never admits a fifth initial attempt even after restart or provider changes', () => {
    const state = initialState(endpoints);
    state.queries.a = { attempts: 4 };
    expect(admit(state, 'a', endpoints, START).reason).toBe('source_recovery_exhausted');
    expect(() => reserve(state, 'a', 'primary', START, 70_000, false)).toThrow();
  });
  it('preserves abandoned requests and exhausts an interrupted final probe', () => {
    const state = outage();
    state.incident!.windowsUsed = 2;
    const at = state.incident!.retryAt;
    const decision = admit(state, 'a', endpoints, at);
    reserve(state, 'a', decision.endpoint!, at, 70_000, true);
    const deadline = state.active!.until;
    expect(admit(state, 'b', endpoints, deadline - 1).kind).toBe('wait');
    expect(state.incident!.windowsUsed).toBe(3);
    expect(admit(state, 'b', endpoints, deadline).reason).toBe('source_recovery_exhausted');
    expect(state.metrics.requests).toBe(3);
  });
  it('keeps enormous Retry-After dates representable and never retries early', () => {
    const state = initialState(endpoints);
    request(state, 'a', START, { ok: false, retriable: true, serviceBusy: true, retryAfterMs: Infinity });
    expect(state.providers.primary.retryAt).toBe(253402300799000);
    request(state, 'b', START + 3001, { ok: false, retriable: true, serviceBusy: true, retryAfterMs: Infinity });
    expect(admit(state, 'c', endpoints, START + 999_999_999).retryAt).toBe(253402300799000);
  });
});
