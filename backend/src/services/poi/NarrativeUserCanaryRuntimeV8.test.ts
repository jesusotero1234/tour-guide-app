import {
  EditorialScriptSetInvalidErrorV8,
  assertCompleteEditorialScriptSetV8,
  assertNarrativeCanaryRunIdAvailableV8,
  assertResearchRuntimeReachableV8,
  createNarrativeCanaryCaptureWebV8,
  narrativeCanaryCoreOpenRouterOptionsV8,
  narrativeCanaryCoreProviderV8,
  narrativeCanaryEditorialConcurrencyV8,
  narrativeCanaryEditorialDispositionV8,
  narrativeCanaryFirecrawlCaptureOptionsV8,
  narrativeCanaryResearchCheckpointPhaseV8,
  researchRuntimeV8,
} from './NarrativeUserCanaryRuntimeV8';

describe('NarrativeUserCanaryRuntimeV8', () => {
  it('resolves effective defaults and explicit research endpoints once', () => {
    expect(researchRuntimeV8({})).toEqual({
      searxngBaseUrl: 'http://127.0.0.1:18081',
      firecrawlBaseUrl: 'http://127.0.0.1:3007/v2',
    });
    expect(researchRuntimeV8({
      SEARXNG_BASE_URL: ' http://searx.test ',
      FIRECRAWL_BASE_URL: ' http://firecrawl.test/v2 ',
    })).toEqual({
      searxngBaseUrl: 'http://searx.test',
      firecrawlBaseUrl: 'http://firecrawl.test/v2',
    });
  });

  it('accepts any HTTP response as proof that both services are listening', async () => {
    const urls: string[] = [];
    await assertResearchRuntimeReachableV8(
      researchRuntimeV8({}),
      async (url) => {
        urls.push(url);
        return { status: url.includes('18081') ? 401 : 404 };
      }
    );
    expect(urls.sort()).toEqual([
      'http://127.0.0.1:18081',
      'http://127.0.0.1:3007/v2',
    ].sort());
  });

  it('classifies a nested transport failure as retryable research infrastructure', async () => {
    await expect(assertResearchRuntimeReachableV8(
      researchRuntimeV8({}),
      async (url) => {
        if (url.includes('18081')) {
          throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNREFUSED' } });
        }
        return { status: 200 };
      }
    )).rejects.toMatchObject({
      code: 'research_infrastructure_unavailable',
      message: expect.stringContaining('http://127.0.0.1:18081: ECONNREFUSED'),
    });
  });

  it('accepts one coherent script for every route stop', () => {
    expect(assertCompleteEditorialScriptSetV8(
      ['route-a', 'route-b'],
      [
        { stopId: 'route-a', finalScript: { stopId: 'route-a' } },
        { stopId: 'route-b', finalScript: { stopId: 'route-b' } },
      ]
    )).toMatchObject({
      missingScriptIds: [],
      duplicateEditorialStopIds: [],
      duplicateScriptIds: [],
      unknownEditorialStopIds: [],
      unknownScriptIds: [],
      mismatchedStopIds: [],
    });
  });

  it('reports missing, duplicate, unknown, and mismatched editorial IDs together', () => {
    try {
      assertCompleteEditorialScriptSetV8(
        ['route-a', 'route-b', 'route-c'],
        [
          { stopId: 'route-a', finalScript: { stopId: 'route-a' } },
          { stopId: 'route-a', finalScript: { stopId: 'route-a' } },
          { stopId: 'route-x', finalScript: { stopId: 'route-y' } },
        ]
      );
      throw new Error('expected script validation to fail');
    } catch (error) {
      expect(error).toBeInstanceOf(EditorialScriptSetInvalidErrorV8);
      expect(error).toMatchObject({
        code: 'editorial_script_set_invalid',
        diagnostics: {
          missingScriptIds: ['route-b', 'route-c'],
          duplicateEditorialStopIds: ['route-a'],
          duplicateScriptIds: ['route-a'],
          unknownEditorialStopIds: ['route-x'],
          unknownScriptIds: ['route-y'],
          mismatchedStopIds: ['route-x->route-y'],
        },
      });
    }
  });

  it('applies the canary editorial concurrency override for a 7-stop route', () => {
    expect(narrativeCanaryEditorialConcurrencyV8(7)).toEqual({
      researchStops: 1,
      editorialStops: 7,
      writers: 1,
      auditStops: 2,
      adjudications: 2,
      globalAudits: 1,
    });
  });

  it('maps ready_for_human_gate to scorecard', () => {
    expect(narrativeCanaryEditorialDispositionV8('ready_for_human_gate')).toBe('scorecard');
  });

  it('maps draft_review_required to review_required', () => {
    expect(narrativeCanaryEditorialDispositionV8('draft_review_required')).toBe('review_required');
  });

  it('maps protocol_failed to failure', () => {
    expect(narrativeCanaryEditorialDispositionV8('protocol_failed')).toBe('failure');
  });

  it('selects the canonical core provider from the qwen38_hybrid profile or an explicit override', () => {
    expect(narrativeCanaryCoreProviderV8('qwen38_hybrid', {})).toEqual({
      kind: 'openrouter',
      model: 'openai/gpt-5.4-mini',
      acceptedModels: ['openai/gpt-5.4-mini-20260317'],
    });
    expect(narrativeCanaryCoreProviderV8('qwen38_hybrid', {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    })).toEqual({
      kind: 'deepseek',
      model: 'deepseek-v4-flash',
    });
  });

  it('resolves the canonical core provider for qwen38_gemini25pro_writer to the same GPT-5.4 mini OpenRouter provider as qwen38_hybrid', () => {
    expect(narrativeCanaryCoreProviderV8('qwen38_gemini25pro_writer', {})).toEqual(
      narrativeCanaryCoreProviderV8('qwen38_hybrid', {})
    );
  });

  it('passes the OpenRouter API key and the pricing entry for the selected model to the canonical core', () => {
    const pricing = {
      inputUsdPerToken: 0.00000025,
      outputUsdPerToken: 0.000001,
      internalReasoningUsdPerToken: 0.0000005,
      requestUsd: 0.0000001,
    };
    const options = narrativeCanaryCoreOpenRouterOptionsV8({
      provider: 'openai/gpt-5.4-mini',
      openRouterApiKey: 'openrouter-canary-test-key',
      pricing: {
        'openai/gpt-5.4-mini': pricing,
      },
    });
    expect(options.openRouterApiKey).toBe('openrouter-canary-test-key');
    expect(options.pricing).toBe(pricing);
  });

  it('selects the research checkpoint phase based on result count and route eligibility', () => {
    expect(narrativeCanaryResearchCheckpointPhaseV8(3, [
      { routeEligible: true },
      { routeEligible: true },
    ])).toBe('route');
    expect(narrativeCanaryResearchCheckpointPhaseV8(2, [
      { routeEligible: true },
      { routeEligible: false },
    ])).toBe('route');
    expect(narrativeCanaryResearchCheckpointPhaseV8(2, [
      { routeEligible: true },
      { routeEligible: true },
    ])).toBe('research');
  });

  it('maps capture request class to Firecrawl request options', () => {
    expect(narrativeCanaryFirecrawlCaptureOptionsV8('place_exact')).toBeUndefined();
    expect(narrativeCanaryFirecrawlCaptureOptionsV8('discovered_secondary')).toEqual({
      timeoutMs: 20_000,
      maxAttempts: 1,
    });
  });

  it('deduplicates concurrent canonical URL captures and strips fragments', async () => {
    const calls: { url: string; options: unknown }[] = [];
    const underlying = async (url: string, options: unknown) => {
      calls.push({ url, options });
      return url;
    };
    const capture = createNarrativeCanaryCaptureWebV8(underlying);
    const [exact, secondary] = await Promise.all([
      capture('https://example.com/place#one', 'place_exact'),
      capture('https://example.com/place#two', 'discovered_secondary'),
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0].options).toBeUndefined();
    expect(exact).toBe('https://example.com/place');
    expect(secondary).toBe('https://example.com/place');
  });

  it('retries the same canonical URL after a transient underlying failure', async () => {
    let attempts = 0;
    const underlying = async (url: string, options: unknown) => {
      attempts += 1;
      if (attempts === 1) {
        throw new Error('transient failure');
      }
      return url;
    };
    const capture = createNarrativeCanaryCaptureWebV8(underlying);
    await expect(capture('https://example.com/place#one', 'place_exact')).rejects.toThrow('transient failure');
    const result = await capture('https://example.com/place#one', 'place_exact');
    expect(result).toBe('https://example.com/place');
    expect(attempts).toBe(2);
  });

  it('rejects accidental reuse of a canary run-id while preserving explicit resume', () => {
    const runId = 'canary-run-123';
    expect(() => assertNarrativeCanaryRunIdAvailableV8(runId, true, false)).toThrow(new RegExp(`--run-id ${runId}.*--resume-from`));
    expect(() => assertNarrativeCanaryRunIdAvailableV8(runId, false, false)).not.toThrow();
    expect(() => assertNarrativeCanaryRunIdAvailableV8(runId, true, true)).not.toThrow();
  });
});
