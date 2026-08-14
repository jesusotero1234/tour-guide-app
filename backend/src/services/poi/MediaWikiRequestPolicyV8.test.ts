import {
  MediaWikiHttpResponseV8,
  MediaWikiMaxlagExhaustedErrorV8,
  classifyMediaWikiFailureV8,
  isMediaWikiMaxlagErrorV8,
  mediaWikiMaxlagSecondsV8,
  narrativeHttpHeadersV8,
  narrativeHttpUserAgentV8,
  requestMediaWikiWithMaxlagPolicyV8,
  retryAfterMsFromHeaderV8,
} from './MediaWikiRequestPolicyV8';

function maxlagBody(lag: number): { error: { code: 'maxlag'; lag: number } } {
  return { error: { code: 'maxlag', lag } };
}

describe('MediaWikiRequestPolicyV8', () => {
  it('recognizes maxlag error bodies and reads the lag seconds', () => {
    expect(isMediaWikiMaxlagErrorV8({ error: { code: 'maxlag', lag: 23.4 } })).toBe(true);
    expect(mediaWikiMaxlagSecondsV8({ error: { code: 'maxlag', lag: 23.4 } })).toBe(23.4);
    expect(isMediaWikiMaxlagErrorV8({ query: { pages: [] } })).toBe(false);
    expect(isMediaWikiMaxlagErrorV8({ error: { code: 'param-illegal' } })).toBe(false);
  });

  it('retries only explicit timeouts, 429 and 5xx and never generic errors', () => {
    expect(classifyMediaWikiFailureV8({ code: 'ECONNABORTED' })).toEqual({
      retriable: true, status: null, code: 'ECONNABORTED',
    });
    expect(classifyMediaWikiFailureV8({ code: 'ETIMEDOUT' })).toEqual({
      retriable: true, status: null, code: 'ETIMEDOUT',
    });
    expect(classifyMediaWikiFailureV8({ code: 'ESOCKETTIMEDOUT' })).toEqual({
      retriable: true, status: null, code: 'ESOCKETTIMEDOUT',
    });
    expect(classifyMediaWikiFailureV8({ response: { status: 429 } })).toEqual({
      retriable: true, status: 429, code: null,
    });
    for (const status of [500, 502, 503, 504, 505]) {
      expect(classifyMediaWikiFailureV8({ response: { status } }).retriable).toBe(true);
    }
    for (const status of [400, 401, 403, 404, 408]) {
      expect(classifyMediaWikiFailureV8({ response: { status } }).retriable).toBe(false);
    }
    for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'ECONNREFUSED']) {
      expect(classifyMediaWikiFailureV8({ code }).retriable).toBe(false);
    }
    expect(classifyMediaWikiFailureV8({ code: 'ERR_TLS_CERT_ALTNAME_INVALID' }).retriable)
      .toBe(false);
    expect(classifyMediaWikiFailureV8(new Error('socket hang up'))).toEqual({
      retriable: false, status: null, code: null,
    });
  });

  it('parses Retry-After as seconds and as an HTTP date', () => {
    expect(retryAfterMsFromHeaderV8('7')).toBe(7000);
    expect(retryAfterMsFromHeaderV8(7)).toBe(7000);
    expect(retryAfterMsFromHeaderV8(['12', 'ignored'])).toBe(12000);
    const future = new Date(Date.now() + 10_000).toUTCString();
    const fromDate = retryAfterMsFromHeaderV8(future);
    expect(fromDate).not.toBeNull();
    expect(fromDate!).toBeGreaterThan(5_000);
    expect(fromDate!).toBeLessThanOrEqual(15_000);
    expect(retryAfterMsFromHeaderV8('not-a-date')).toBeNull();
  });

  it('returns immediately when the response is not a maxlag error', async () => {
    const waits: number[] = [];
    let calls = 0;
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      async () => {
        calls += 1;
        return { data: { query: { pages: [] } }, status: 200 };
      },
      async (ms) => { waits.push(ms); }
    );

    expect(calls).toBe(1);
    expect(waits).toEqual([]);
    expect(response.data).toEqual({ query: { pages: [] } });
  });

  it('retries an HTTP-200 maxlag body waiting at least five seconds with a fake wait', async () => {
    const waits: number[] = [];
    let calls = 0;
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      async (): Promise<MediaWikiHttpResponseV8<unknown>> => {
        calls += 1;
        if (calls <= 2) return { data: maxlagBody(4) };
        return { data: { query: { pages: [] } } };
      },
      async (ms) => { waits.push(ms); }
    );

    expect(calls).toBe(3);
    expect(waits).toEqual([5000, 5000]);
    expect(response.data).toEqual({ query: { pages: [] } });
  });

  it('lets Retry-After prevail over the reported lag', async () => {
    const waits: number[] = [];
    await requestMediaWikiWithMaxlagPolicyV8(
      async () => ({
        data: maxlagBody(2),
        headers: { 'retry-after': '9' },
      }),
      async (ms) => { waits.push(ms); }
    ).catch(() => undefined);

    expect(waits[0]).toBe(9000);
  });

  it('never busy-loops when lag is zero (minimum wait still applies)', async () => {
    const waits: number[] = [];
    await expect(requestMediaWikiWithMaxlagPolicyV8(
      async () => ({ data: maxlagBody(0) }),
      async (ms) => { waits.push(ms); }
    )).rejects.toBeInstanceOf(MediaWikiMaxlagExhaustedErrorV8);
    expect(waits.length).toBe(5);
    expect(waits.every((ms) => ms === 5000)).toBe(true);
  });

  it('exhausts after bounded attempts with all diagnostic fields', async () => {
    const waits: number[] = [];
    let attempts = 0;
    try {
      await requestMediaWikiWithMaxlagPolicyV8(
        async () => {
          attempts += 1;
          return { data: maxlagBody(20), headers: { 'retry-after': '15' } };
        },
        async (ms) => { waits.push(ms); }
      );
      throw new Error('expected maxlag_exhausted');
    } catch (error) {
      expect(error).toBeInstanceOf(MediaWikiMaxlagExhaustedErrorV8);
      const exhausted = error as MediaWikiMaxlagExhaustedErrorV8;
      expect(exhausted.code).toBe('maxlag_exhausted');
      expect(exhausted.attempts).toBe(6);
      expect(exhausted.totalWaitMs).toBe(100_000);
      expect(exhausted.lastLagSeconds).toBe(20);
      expect(exhausted.lastRetryAfterMs).toBe(15_000);
    }
    expect(waits.length).toBe(5);
    expect(waits.every((ms) => ms === 20_000)).toBe(true);
  });

  it('fails without a partial wait when the required wait exceeds the budget', async () => {
    const waits: number[] = [];
    await expect(requestMediaWikiWithMaxlagPolicyV8(
      async () => ({ data: maxlagBody(500), headers: { 'retry-after': '500' } }),
      async (ms) => { waits.push(ms); }
    )).rejects.toBeInstanceOf(MediaWikiMaxlagExhaustedErrorV8);
    expect(waits.reduce((sum, ms) => sum + ms, 0)).toBeLessThan(180_000);
  });

  it('retries thrown HTTP 429 failures with Retry-After and then succeeds', async () => {
    const waits: number[] = [];
    let calls = 0;
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      async (): Promise<MediaWikiHttpResponseV8<unknown>> => {
        calls += 1;
        if (calls === 1) {
          const error = new Error('429');
          Object.assign(error, {
            response: { status: 429, headers: { 'retry-after': '7' } },
          });
          throw error;
        }
        return { data: { query: { pages: [] } }, status: 200 };
      },
      async (ms) => { waits.push(ms); }
    );

    expect(calls).toBe(2);
    expect(waits).toEqual([7000]);
    expect(response.data).toEqual({ query: { pages: [] } });
  });

  it('does not retry thrown generic errors', async () => {
    let calls = 0;
    await expect(requestMediaWikiWithMaxlagPolicyV8(
      async () => {
        calls += 1;
        throw new Error('socket hang up');
      },
      async () => undefined
    )).rejects.toThrow('socket hang up');
    expect(calls).toBe(1);
  });

  it('centralizes a real User-Agent with gzip and rejects placeholder overrides', () => {
    const previous = process.env.NARRATIVE_HTTP_USER_AGENT;
    try {
      process.env.NARRATIVE_HTTP_USER_AGENT = 'https://github.com/example/placeholder';
      const headers = narrativeHttpHeadersV8();
      expect(headers['Accept-Encoding']).toBe('gzip');
      expect(headers['User-Agent']).toContain('TourGuideApp/1.0');
      expect(headers['User-Agent']).toContain('jesusoteo1234@gmail.com');
      expect(headers['User-Agent']).not.toContain('example.');

      process.env.NARRATIVE_HTTP_USER_AGENT = 'MyApp/2.0 (real contact)';
      expect(narrativeHttpUserAgentV8()).toBe('MyApp/2.0 (real contact)');
    } finally {
      if (previous === undefined) delete process.env.NARRATIVE_HTTP_USER_AGENT;
      else process.env.NARRATIVE_HTTP_USER_AGENT = previous;
    }
  });
});
