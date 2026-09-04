import {
  buildNarrativeWriterBenchmarkPlanV8,
  buildPublicNarrativeWriterBenchmarkSummaryV8,
  parseNarrativeWriterBenchmarkArgsV8,
} from '../../../scripts/validation/narrative-writer-benchmark-v8';

describe('narrative-writer-benchmark-v8 script contract', () => {
  it('defaults to a dry run over Plaza Mayor and Cibeles with no prior spend', () => {
    expect(parseNarrativeWriterBenchmarkArgsV8([])).toMatchObject({
      execute: false,
      priorSpendUsd: 0,
      stopIds: ['Q1123493', 'Q1537446'],
      seed: 'madrid-writer-benchmark-v8',
    });
  });

  it('rejects invalid spend and stop arguments before any paid call', () => {
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--prior-spend-usd=-1']))
      .toThrow('prior spend');
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--stop-ids=']))
      .toThrow('stop ids');
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--run-id=../escape']))
      .toThrow('run id');
    expect(() => parseNarrativeWriterBenchmarkArgsV8(['--stop-ids=Q1123493,../../escape']))
      .toThrow('stop id');
  });

  it('plans exactly four blind arms per selected stop within the two-dollar cap', () => {
    const plan = buildNarrativeWriterBenchmarkPlanV8(
      ['Q1123493', 'Q1537446'],
      'madrid-writer-benchmark-v8',
      0
    );

    expect(plan.plannedCalls).toBe(8);
    expect(plan.maximumReservedSpendUsd).toBeCloseTo(1.6);
    expect(plan.assignments.map((assignment) => assignment.armId).sort()).toEqual(['A', 'B', 'C', 'D']);
    expect(() => buildNarrativeWriterBenchmarkPlanV8(
      ['Q1123493', 'Q1537446'],
      'madrid-writer-benchmark-v8',
      0.41
    )).toThrow('benchmark budget exceeded');
  });

  it('keeps model identity and narrative text out of the public summary', () => {
    const summary = buildPublicNarrativeWriterBenchmarkSummaryV8({
      runId: 'run-1',
      sourceCheckpoint: '/private/checkpoint.json',
      priorSpendUsd: 0,
      spentUsd: 0.05,
      accountedSpendUsd: 0.25,
      results: [{
        armId: 'A',
        stopId: 'Q1123493',
        model: 'secret/model',
        actualModel: 'secret/model-version',
        actualProvider: 'secret-provider',
        text: 'Texto narrativo ciego.',
        textFile: 'texts/A-Q1123493.md',
        status: 'valid',
        schemaPassed: true,
        lengthPassed: true,
        oneShotPassed: true,
        wordCount: 600,
        coverage: 1,
        retryCount: 0,
        costUsd: 0.05,
        budgetChargeUsd: 0.05,
        providerCostVerified: true,
        latencyMs: 1000,
      }],
    });

    const serialized = JSON.stringify(summary);
    expect(serialized).not.toContain('secret/model');
    expect(serialized).not.toContain('secret-provider');
    expect(serialized).not.toContain('Texto narrativo ciego');
    expect(summary.spentUsd).toBe(0.05);
    expect(summary.accountedSpendUsd).toBe(0.25);
    expect(summary.results[0]).toMatchObject({
      armId: 'A',
      stopId: 'Q1123493',
      textFile: 'texts/A-Q1123493.md',
      oneShotPassed: true,
      budgetChargeUsd: 0.05,
    });
  });
});
