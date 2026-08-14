import {
  classifyNarrativeHttpFailureV7,
  classifyWikipediaCaptureV8,
  createHostnameThrottleV7,
  FirecrawlNarrativeCaptureProviderV7,
  SearxngNarrativeDiscoveryProviderV7,
  WikimediaNarrativeCaptureProviderV7,
} from './NarrativeSourcesV7';

const PUBLIC_LOOKUP = async (hostname: string) => (
  hostname === 'private.example'
    ? [{ address: '10.0.0.5', family: 4 }]
    : [{ address: '93.184.216.34', family: 4 }]
);

describe('classifyNarrativeHttpFailureV7', () => {
  it('retries timeouts, 429 and 5xx', () => {
    expect(classifyNarrativeHttpFailureV7(
      Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' })
    ).classification).toBe('retryable');
    expect(classifyNarrativeHttpFailureV7(
      Object.assign(new Error('timeout'), { code: 'ECONNABORTED' })
    ).classification).toBe('retryable');
    expect(classifyNarrativeHttpFailureV7({
      response: { status: 429 },
    }).classification).toBe('retryable');
    expect(classifyNarrativeHttpFailureV7({
      response: { status: 500 },
    }).classification).toBe('retryable');
    expect(classifyNarrativeHttpFailureV7({
      response: { status: 503 },
    }).classification).toBe('retryable');
  });

  it('does not retry generic errors, DNS or connection refused', () => {
    expect(classifyNarrativeHttpFailureV7(new Error('socket hang up')).classification)
      .toBe('classified_no_retry');
    expect(classifyNarrativeHttpFailureV7({
      code: 'ENOTFOUND',
    }).classification).toBe('classified_no_retry');
    expect(classifyNarrativeHttpFailureV7({
      code: 'ECONNREFUSED',
    }).classification).toBe('classified_no_retry');
  });

  it('classifies 403 and 404 without retrying', () => {
    expect(classifyNarrativeHttpFailureV7({
      response: { status: 403 },
    }).classification).toBe('classified_no_retry');
    expect(classifyNarrativeHttpFailureV7({
      response: { status: 404 },
    }).classification).toBe('classified_no_retry');
  });

  it('reports quota separately', () => {
    expect(classifyNarrativeHttpFailureV7({
      response: { status: 402 },
    }).classification).toBe('quota');
  });
});

describe('SearxngNarrativeDiscoveryProviderV7', () => {
  it('rejects public instances and defaults to self-hosted JSON', () => {
    expect(() => new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'https://searx.be',
      get: async () => ({ data: {} }),
    })).toThrow(/self-hosted/);
    expect(() => new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'https://public-searxng.example.com',
      get: async () => ({ data: {} }),
    })).toThrow(/self-hosted/);
    expect(() => new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'http://192.168.1.20:8080',
      get: async () => ({ data: {} }),
    })).not.toThrow();
    expect(() => new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'http://searxng:8080',
      get: async () => ({ data: {} }),
    })).not.toThrow();
  });

  it('sends real language and country to the JSON API and maps results', async () => {
    const urls: string[] = [];
    const provider = new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'http://127.0.0.1:8080',
      lookup: PUBLIC_LOOKUP,
      get: async (url, params) => {
        urls.push(`${url}?${new URLSearchParams(params).toString()}`);
        return { data: {
          results: [
            { url: 'https://www.barcelona.cat/historia', title: 'Barcelona historia', description: 'Página oficial' },
            { url: 'http://insecure.example/page', title: 'Insecure', description: '' },
            { url: 'https://www.gencat.cat/cultura', title: 'Gencat cultura', description: 'Cultura' },
          ],
        } };
      },
    });

    const results = await provider.search({
      query: 'Sagrada Família historia',
      language: 'ca',
      countryCode: 'ES',
      limit: 5,
    });

    expect(urls[0]).toContain('format=json');
    expect(urls[0]).toContain('language=ca-ES');
    expect(results).toHaveLength(2);
    expect(results[0].url).toBe('https://www.barcelona.cat/historia');
    expect(results[0].engine).toBe('searxng-json');
  });

  it('passes country and language to mapOfficialSite site searches', async () => {
    const urls: string[] = [];
    const provider = new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'http://127.0.0.1:8080',
      lookup: PUBLIC_LOOKUP,
      get: async (url, params) => {
        urls.push(`${url}?${new URLSearchParams(params).toString()}`);
        return { data: { results: [
          { url: 'https://www.barcelona.cat/ca/sagrada-familia', title: 'Sagrada Família', description: '' },
        ] } };
      },
    });

    const results = await provider.mapOfficialSite({
      origin: 'www.barcelona.cat',
      search: 'sagrada familia',
      limit: 10,
      language: 'ca',
      countryCode: 'ES',
    });

    expect(urls[0]).toContain('language=ca-ES');
    expect(urls[0]).toContain('q=site%3Awww.barcelona.cat');
    expect(results).toHaveLength(1);
  });

  it('retries only retryable failures and stops on 403', async () => {
    let calls = 0;
    const provider = new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'http://127.0.0.1:8080',
      lookup: PUBLIC_LOOKUP,
      get: async () => {
        calls += 1;
        if (calls === 1) {
          const e = new Error('503');
          (e as { response?: unknown }).response = { status: 503 };
          throw e;
        }
        return { data: { results: [
          { url: 'https://www.example.com/page', title: 'Page' },
        ] } };
      },
    });

    const results = await provider.search({
      query: 'test', language: 'es', countryCode: 'ES', limit: 5,
    });
    expect(calls).toBe(2);
    expect(results).toHaveLength(1);

    const forbidden = new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'http://127.0.0.1:8080',
      lookup: PUBLIC_LOOKUP,
      get: async () => {
        const e = new Error('403');
        (e as { response?: unknown }).response = { status: 403 };
        throw e;
      },
    });
    await expect(forbidden.search({
      query: 'test', language: 'es', countryCode: 'ES', limit: 5,
    })).rejects.toThrow();
  });

  it('paces consecutive requests to the same SearXNG host with a fake wait', async () => {
    const waits: number[] = [];
    let nowMs = 5_000_000;
    let calls = 0;
    const provider = new SearxngNarrativeDiscoveryProviderV7({
      baseUrl: 'http://127.0.0.1:8080',
      lookup: PUBLIC_LOOKUP,
      now: () => new Date(nowMs),
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        nowMs += milliseconds;
      },
      get: async () => {
        calls += 1;
        nowMs += 50;
        return { data: { results: [
          { url: 'https://www.example.com/page', title: 'Page' },
        ] } };
      },
    });

    await provider.search({
      query: 'uno', language: 'es', countryCode: 'ES', limit: 5,
    });
    await provider.search({
      query: 'dos', language: 'es', countryCode: 'ES', limit: 5,
    });
    await provider.search({
      query: 'tres', language: 'es', countryCode: 'ES', limit: 5,
    });

    expect(calls).toBe(3);
    expect(waits).toHaveLength(2);
    expect(waits[0]).toBeGreaterThanOrEqual(1_400);
    expect(waits[1]).toBeGreaterThanOrEqual(1_400);
  });
});

describe('createHostnameThrottleV7', () => {
  it('spaces requests per hostname using the injected wait', async () => {
    const waits: number[] = [];
    let nowMs = 1_000_000;
    const throttle = createHostnameThrottleV7({
      minIntervalMs: 1_500,
      now: () => new Date(nowMs),
      wait: async (milliseconds) => {
        waits.push(milliseconds);
        nowMs += milliseconds;
      },
    });

    await throttle.waitIfNeeded('searxng');
    await throttle.waitIfNeeded('searxng');
    await throttle.waitIfNeeded('firecrawl');
    await throttle.waitIfNeeded('searxng');

    expect(waits).toEqual([1_500, 1_500]);
  });
});

describe('FirecrawlNarrativeCaptureProviderV7', () => {
  it('rejects cloud even with a key', () => {
    expect(() => new FirecrawlNarrativeCaptureProviderV7({
      baseUrl: 'https://api.firecrawl.dev/v2',
      apiKey: 'fc-cloud-key',
      post: async () => ({ data: {} }),
    })).toThrow(/cloud is disabled/);
  });

  it('maps official domains via /map without opening them', async () => {
    const seenBodies: unknown[] = [];
    const provider = new FirecrawlNarrativeCaptureProviderV7({
      baseUrl: 'http://127.0.0.1:3007/v2',
      lookup: PUBLIC_LOOKUP,
      post: async (_url, body) => {
        seenBodies.push(body);
        return { data: {
          success: true,
          links: [
            'https://www.barcelona.cat/ca/sagrada-familia',
            'http://private.example/leak',
            'not-a-url',
          ],
        } };
      },
    });

    const results = await provider.mapOfficialSite({
      origin: 'www.barcelona.cat',
      search: 'sagrada familia',
      limit: 20,
    });

    expect(seenBodies[0]).toMatchObject({ url: 'https://www.barcelona.cat/', search: 'sagrada familia' });
    expect(Object.keys(seenBodies[0] as Record<string, unknown>).sort())
      .toEqual(['limit', 'search', 'url']);
    expect(results).toHaveLength(1);
    expect(results[0].url).toBe('https://www.barcelona.cat/ca/sagrada-familia');
  });

  it('rejects a private origin before sending it to /map', async () => {
    const provider = new FirecrawlNarrativeCaptureProviderV7({
      baseUrl: 'http://127.0.0.1:3007/v2',
      lookup: PUBLIC_LOOKUP,
      post: async () => ({ data: { success: true, links: [] } }),
    });

    await expect(provider.mapOfficialSite({
      origin: 'private.example',
      search: 'anything',
      limit: 5,
    })).rejects.toThrow(/private or reserved/);
  });

  it('captures markdown with final HTTP status and authority', async () => {
    const provider = new FirecrawlNarrativeCaptureProviderV7({
      baseUrl: 'http://127.0.0.1:3007/v2',
      lookup: PUBLIC_LOOKUP,
      post: async () => ({ data: {
        success: true,
        data: {
          markdown: '# Sagrada Família\n\nHistoria del templo.',
          metadata: {
            url: 'https://www.barcelona.cat/ca/sagrada-familia',
            statusCode: 200,
            title: 'Sagrada Família — Ayuntamiento',
          },
        },
      } }),
    });

    const capture = await provider.capture('https://www.barcelona.cat/ca/sagrada-familia');
    expect(capture.finalHttpStatus).toBe(200);
    expect(capture.content).toContain('Historia del templo');
    expect(capture.authority.tier).toBe('discovery_only');
    expect(capture.authority.rule).toBe('unregistered_awaiting_registry');
    expect(capture.sourceId).toMatch(/^source-/);
  });

  it('retries 429 and never retries 403', async () => {
    let calls = 0;
    const rateLimited = new FirecrawlNarrativeCaptureProviderV7({
      baseUrl: 'http://127.0.0.1:3007/v2',
      lookup: PUBLIC_LOOKUP,
      wait: async () => undefined,
      post: async () => {
        calls += 1;
        if (calls === 1) {
          const e = new Error('429');
          (e as { response?: unknown }).response = {
            status: 429,
            headers: { 'retry-after': '0' },
          };
          throw e;
        }
        return { data: { success: true, data: {
          markdown: 'ok', metadata: { url: 'https://www.barcelona.cat/', statusCode: 200 },
        } } };
      },
    });
    await rateLimited.capture('https://www.barcelona.cat/');
    expect(calls).toBe(2);

    calls = 0;
    const forbidden = new FirecrawlNarrativeCaptureProviderV7({
      baseUrl: 'http://127.0.0.1:3007/v2',
      lookup: PUBLIC_LOOKUP,
      post: async () => {
        calls += 1;
        const e = new Error('403');
        (e as { response?: unknown }).response = { status: 403 };
        throw e;
      },
    });
    await expect(forbidden.capture('https://www.barcelona.cat/')).rejects.toThrow();
    expect(calls).toBe(1);
  });
});

describe('WikimediaNarrativeCaptureProviderV7', () => {
  it('captures Wikipedia content via the official API instead of HTML scraping', async () => {
    const provider = new WikimediaNarrativeCaptureProviderV7({
      lookup: PUBLIC_LOOKUP,
      get: async () => ({ data: {
        query: {
          pages: [{
            title: 'Sagrada Família',
            revisions: [{
              revid: 123456,
              timestamp: '2026-08-01T10:00:00Z',
              slots: { main: { content: 'La Sagrada Família es un templo de Gaudí.' } },
            }],
          }],
        },
      } }),
    });

    const capture = await provider.capture('https://es.wikipedia.org/wiki/Sagrada_Fam%C3%ADlia');
    expect(capture.content).toContain('templo de Gaudí');
    expect(capture.wikimediaRevision).toEqual({
      revisionId: 123456,
      timestamp: '2026-08-01T10:00:00Z',
    });
    expect(capture.finalHttpStatus).toBe(200);
  });

  it('rejects pages that do not exist', async () => {
    const provider = new WikimediaNarrativeCaptureProviderV7({
      lookup: PUBLIC_LOOKUP,
      get: async () => ({ data: { query: { pages: [{ title: 'X', missing: true }] } } }),
    });
    await expect(provider.capture('https://es.wikipedia.org/wiki/NoExiste'))
      .rejects.toThrow(/does not exist/);
  });

  it('works even when Wikipedia HTML would return 403 (API path only)', async () => {
    const urls: string[] = [];
    const provider = new WikimediaNarrativeCaptureProviderV7({
      lookup: PUBLIC_LOOKUP,
      get: async (url) => {
        urls.push(url);
        return { data: { query: { pages: [{
          title: 'Sagrada Família',
          revisions: [{ revid: 1, timestamp: '2026-01-01T00:00:00Z',
            slots: { main: { content: 'Contenido' } } }],
        }] } } };
      },
    });
    await provider.capture('https://es.wikipedia.org/wiki/Sagrada_Fam%C3%ADlia');
    expect(urls.every((url) => url.includes('/w/api.php'))).toBe(true);
  });
});

describe('classifyWikipediaCaptureV8', () => {
  const baseCapture = {
    sourceId: 'source-wiki',
    requestedUrl: 'https://es.wikipedia.org/wiki/Catedral_de_M%C3%A1laga',
    finalUrl: 'https://es.wikipedia.org/wiki/Catedral_de_M%C3%A1laga',
    title: 'Catedral de Málaga',
    capturedAt: '2026-08-01T10:00:00Z',
    content: 'Contenido del extracto de la catedral.',
    fingerprint: 'f',
    authority: { tier: 'discovery_only' as const, publisherKey: 'es.wikipedia.org', rule: 'unregistered' },
    containsInstructionLikeText: false,
    finalHttpStatus: 200,
  };

  it('classifies an exact-QID Wikipedia capture as established_source with the wikimedia publisher', () => {
    const classified = classifyWikipediaCaptureV8({
      capture: baseCapture,
      expectedQid: 'Q1582758',
      wikibaseItem: 'Q1582758',
    });

    expect(classified.authority.tier).toBe('established_source');
    expect(classified.authority.rule).toBe('wikimedia_qid_match');
    expect(classified.publisherKey).toBe('wikimedia');
    expect(classified.sourceKind).toBe('wikipedia_api');
    expect(classified.entityQid).toBe('Q1582758');
  });

  it('degrades a Wikipedia capture whose QID does not match the expected identity', () => {
    const classified = classifyWikipediaCaptureV8({
      capture: baseCapture,
      expectedQid: 'Q1582758',
      wikibaseItem: 'Q999999',
    });

    expect(classified.authority.tier).toBe('discovery_only');
    expect(classified.authority.rule).toBe('wikimedia_qid_mismatch');
    expect(classified.publisherKey).toBe('wikimedia');
  });
});
