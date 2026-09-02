import {
  EditorialScriptSetInvalidErrorV8,
  assertCompleteEditorialScriptSetV8,
  assertResearchRuntimeReachableV8,
  narrativeCanaryCoreProviderV8,
  narrativeCanaryEditorialConcurrencyV8,
  narrativeCanaryEditorialDispositionV8,
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
      kind: 'qwen_local',
      model: 'qwen-local',
      endpoint: 'http://127.0.0.1:8080/v1',
    });
    expect(narrativeCanaryCoreProviderV8('qwen38_hybrid', {
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
    })).toEqual({
      kind: 'deepseek',
      model: 'deepseek-v4-flash',
    });
  });
});
