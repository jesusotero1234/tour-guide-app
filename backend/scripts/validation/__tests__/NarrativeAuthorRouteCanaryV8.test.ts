import { runAuthorCanarySequenceV8, renderAuthorCanaryTourV8, main, ChildOutcomeV8 } from '../narrative-author-route-canary-v8';

const stops = [{ stopId: 'A', name: 'Puente', targetWords: 600 }, { stopId: 'B', name: 'Torre', targetWords: 562 }];
const outcome = (prior: number, reported = 0.2, unknown = 0, extra: Partial<ChildOutcomeV8> = {}): ChildOutcomeV8 => ({
  budget: { limitUsd: 13, historicalSpentUsd: prior, spentUsd: prior + reported + unknown,
    reservedUsd: 0, runReportedCostUsd: reported, runUnverifiedExposureUsd: unknown },
  narration: 'Texto original.', results: { objections: 2 }, audit: { status: 'valid', value: { findings: [] } }, ...extra
});
describe('author route canary sequence, no paid calls', () => {
  test('propagates cumulative spending and style history without retries for objections', async () => {
    const step = jest.fn(async (_i, prior) => outcome(prior));
    const state = await runAuthorCanarySequenceV8(stops, 10, 13, step);
    expect(step).toHaveBeenCalledTimes(2);
    expect(step.mock.calls[0][1]).toBe(10);
    expect(step.mock.calls[1][1]).toBeCloseTo(10.2);
    expect((step.mock.calls[1] as any)[2]).toEqual([{ name: 'Puente', text: 'Texto original.' }]);
    expect(state.status).toBe('complete_needs_review');
    expect(state.budget.runReportedCostUsd).toBeCloseTo(0.4);
    expect(state.budget.remainingUsd).toBeCloseTo(2.6);
  });
  test('unfunded pair is stopped before calling step', async () => {
    const step = jest.fn();
    const state = await runAuthorCanarySequenceV8(stops, 11.6, 13, step);
    expect(step).not.toHaveBeenCalled();
    expect(state.status).toBe('budget_exhausted');
  });
  test('unknown exposure is not refunded and blocks the next pair', async () => {
    const step = jest.fn(async (_i, prior) => outcome(prior, 0.1, 1.4));
    const state = await runAuthorCanarySequenceV8(stops, 10, 13, step);
    expect(step).toHaveBeenCalledTimes(1);
    expect(state.budget.runUnverifiedExposureUsd).toBe(1.4);
    expect(state.budget.remainingUsd).toBeCloseTo(1.5);
    expect(state.status).toBe('budget_exhausted');
  });
  test('audit failure retains the original and continues without repair', async () => {
    const step = jest.fn(async (i, prior) => outcome(prior, 0.2, 0, i === 0 ? { audit: { status: 'invalid' }, results: undefined, exitCode: 1 } : {}));
    const state = await runAuthorCanarySequenceV8(stops, 10, 13, step);
    expect(state.stops[0].status).toBe('audit_failed');
    expect(state.stops[0].narration).toBe('Texto original.');
    expect(state.stops).toHaveLength(2);
  });
  test('writer failure stops and keeps earlier text plus raw failing entry', async () => {
    const step = jest.fn(async (i, prior) => outcome(prior, 0.2, 0, i === 1 ? { narration: undefined, results: undefined, exitCode: 1 } : {}));
    const state = await runAuthorCanarySequenceV8([...stops, { ...stops[0], stopId: 'C' }], 10, 13, step);
    expect(step).toHaveBeenCalledTimes(2);
    expect(state.status).toBe('writer_failed');
    expect(state.stops[0].narration).toBe('Texto original.');
    expect(state.stops[1].status).toBe('writer_failed');
  });
  test('missing, inconsistent or outstanding budget stops further calls', async () => {
    for (const make of [
      (p: number) => outcome(p, 0.2, 0, { budget: undefined }),
      (p: number) => ({ ...outcome(p), budget: { ...outcome(p).budget!, historicalSpentUsd: 0 } }),
      (p: number) => ({ ...outcome(p), budget: { ...outcome(p).budget!, reservedUsd: 0.8 } })
    ]) {
      const step = jest.fn(async (_i, prior) => make(prior));
      const state = await runAuthorCanarySequenceV8(stops, 10, 13, step);
      expect(step).toHaveBeenCalledTimes(1);
      expect(state.status).toBe('accounting_unverified');
    }
  });
  test('step exception still publishes last state for partial export', async () => {
    const updates: string[] = [];
    const state = await runAuthorCanarySequenceV8(stops, 10, 13, async () => { throw new Error('child failed'); }, s => updates.push(s.status));
    expect(state.status).toBe('failed');
    expect(updates[updates.length - 1]).toBe('failed');
  });
  test('Markdown marks missing stops and does not claim measured duration', async () => {
    const state = await runAuthorCanarySequenceV8(stops, 11.6, 13, jest.fn());
    const md = renderAuthorCanaryTourV8(stops.map(s => ({ ...s, sourceUrls: [] })) as any, state, 'Villa del Río', 60);
    expect(md).toContain('PARTIAL');
    expect(md).toContain('## 2. Torre');
    expect(md).toContain('Narración no completada');
    expect(md).toContain('No es una medición de audio');
  });
  test('CLI dry run does not write or launch children', async () => {
    const fs = require('fs'), cp = require('child_process');
    const loader = require('../narrative-writer-benchmark-v8');
    const material = require('../narrative-author-canary-material-v8');
    const read = jest.spyOn(fs, 'readFileSync').mockReturnValue('doc');
    const load = jest.spyOn(loader, 'loadNarrativeWriterBenchmarkCheckpointV8').mockReturnValue({ route: { durationMinutes: 60 } } as any);
    const prep = jest.spyOn(material, 'prepareAuthorCanaryMaterialV8').mockReturnValue(stops.map(s => ({ ...s, authorPrompt: 'prompt' })) as any);
    const write = jest.spyOn(fs, 'writeFileSync'), mkdir = jest.spyOn(fs, 'mkdirSync'), spawn = jest.spyOn(cp, 'spawn');
    const log = jest.spyOn(console, 'log').mockImplementation(() => {});
    try {
      await main(['--source=c.json', '--template=t.md', '--reference=r.md', '--reference-stop-id=A', '--run-id=test', '--prior-spend-usd=10', '--spend-limit-usd=13']);
      expect(write).not.toHaveBeenCalled(); expect(mkdir).not.toHaveBeenCalled(); expect(spawn).not.toHaveBeenCalled();
      expect(JSON.parse(log.mock.calls[0][0] as string).intendedCalls).toBe(4);
    } finally { read.mockRestore(); load.mockRestore(); prep.mockRestore(); write.mockRestore(); mkdir.mockRestore(); spawn.mockRestore(); log.mockRestore(); }
  });
});
