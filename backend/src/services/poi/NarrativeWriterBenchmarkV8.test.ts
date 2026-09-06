import {
  NARRATIVE_WRITER_BENCHMARK_ARMS_V8,
  NARRATIVE_WRITER_BENCHMARK_CALL_RESERVATION_USD_V8,
  NARRATIVE_WRITER_BENCHMARK_TOTAL_CAP_USD_V8,
  assertNarrativeWriterBenchmarkBudgetV8,
  blindNarrativeWriterBenchmarkArmsV8,
  buildNarrativeWriterBenchmarkRequestV8,
  evaluateNarrativeWriterBenchmarkResultV8,
  resolveNarrativeWriterBenchmarkCostV8,
} from './NarrativeWriterBenchmarkV8';

describe('NarrativeWriterBenchmarkV8', () => {
  it('creates deterministic blind arm IDs without exposing model names publicly', () => {
    const first = blindNarrativeWriterBenchmarkArmsV8('madrid-seed');
    const second = blindNarrativeWriterBenchmarkArmsV8('madrid-seed');

    expect(first).toEqual(second);
    expect(first.map((assignment) => assignment.arm.model).sort()).toEqual(
      NARRATIVE_WRITER_BENCHMARK_ARMS_V8.map((arm) => arm.model).sort()
    );
    expect(first.every((assignment) => /^[A-Z]+$/.test(assignment.armId))).toBe(true);
    expect(new Set(first.map((assignment) => assignment.armId))).toHaveProperty('size', NARRATIVE_WRITER_BENCHMARK_ARMS_V8.length);
    expect(new Set(first.map((assignment) => assignment.arm.model))).toHaveProperty('size', NARRATIVE_WRITER_BENCHMARK_ARMS_V8.length);
    expect(first.map((assignment) => ({ armId: assignment.armId }))).toEqual(
      expect.not.arrayContaining([
        expect.objectContaining({ model: expect.anything() }),
      ])
    );
  });

  it('builds a single-attempt OpenRouter request with ZDR and response cache disabled', () => {
    const request = buildNarrativeWriterBenchmarkRequestV8(
      NARRATIVE_WRITER_BENCHMARK_ARMS_V8[0],
      'benchmark-run',
      'Q1123493'
    );

    expect(request.provider).toMatchObject({
      kind: 'openrouter',
      model: 'openai/gpt-5.4-mini',
      zeroDataRetention: true,
    });
    expect(request.options).toMatchObject({
      reasoning: 'low',
      maxTokens: 4_000,
      requestAttempts: 1,
      rateLimitAttempts: 1,
      includePreviousResponseOnSemanticRetry: false,
      disableOpenRouterCache: true,
      phase: 'writer_benchmark',
      runId: 'benchmark-run',
      stopId: 'Q1123493',
    });
  });

  it('reserves enough budget before every paid call', () => {
    expect(NARRATIVE_WRITER_BENCHMARK_TOTAL_CAP_USD_V8).toBe(2);
    expect(NARRATIVE_WRITER_BENCHMARK_CALL_RESERVATION_USD_V8).toBe(0.2);
    expect(() => assertNarrativeWriterBenchmarkBudgetV8(1.79, 0.2)).not.toThrow();
    expect(() => assertNarrativeWriterBenchmarkBudgetV8(1.81, 0.2)).toThrow('benchmark budget exceeded');
    expect(() => assertNarrativeWriterBenchmarkBudgetV8(-1, 0.2)).toThrow('benchmark budget values');
  });

  it('uses provider-reported cost when available and conservatively derives it otherwise', () => {
    const arm = NARRATIVE_WRITER_BENCHMARK_ARMS_V8[1];
    expect(resolveNarrativeWriterBenchmarkCostV8(arm, {
      inputTokens: 10_000,
      outputTokens: 1_000,
      costUsd: 0.08,
    })).toEqual({ costUsd: 0.08, providerVerified: true });

    expect(resolveNarrativeWriterBenchmarkCostV8(arm, {
      inputTokens: 10_000,
      outputTokens: 1_000,
    })).toEqual({ costUsd: 0.04, providerVerified: false });
  });

  it('counts only a valid, in-band first response as first-pass success', () => {
    expect(evaluateNarrativeWriterBenchmarkResultV8({
      status: 'valid',
      schemaValid: true,
      wordCount: 600,
      minimumWords: 575,
      maximumWords: 660,
      retryCount: 0,
    })).toEqual({ schemaPassed: true, lengthPassed: true, oneShotPassed: true });

    expect(evaluateNarrativeWriterBenchmarkResultV8({
      status: 'valid',
      schemaValid: true,
      wordCount: 661,
      minimumWords: 575,
      maximumWords: 660,
      retryCount: 0,
    }).oneShotPassed).toBe(false);

    expect(evaluateNarrativeWriterBenchmarkResultV8({
      status: 'valid',
      schemaValid: true,
      wordCount: 600,
      minimumWords: 575,
      maximumWords: 660,
      retryCount: 1,
    }).oneShotPassed).toBe(false);
  });
});
