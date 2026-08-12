import { createHash } from 'crypto';
import { mkdtempSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  NarrativeBenchmarkRunnerV6,
  parseNarrativeBenchmarkArgsV6,
  runNarrativeBenchmarkV6,
} from './NarrativeBenchmarkV6';
import {
  NARRATIVE_SPEND_HISTORICAL_USD_V6,
  NarrativeSpendLedgerV6,
} from './NarrativeSpendLedgerV6';

describe('runNarrativeBenchmarkV6 paid smoke deadline', () => {
  it('aborts the smoke signal and conservatively settles an invocation without usage', async () => {
    const fp = (value: string): string => createHash('sha256').update(value).digest('hex');
    const ledger = new NarrativeSpendLedgerV6({
      limitUsd: 2,
      path: join(mkdtempSync(join(tmpdir(), 'narrative-benchmark-v6-')), 'spend.jsonl'),
    });
    let receivedSignal: AbortSignal | undefined;
    const runner: NarrativeBenchmarkRunnerV6 = {
      preflight: async () => ({
        status: 'ready',
        fingerprint: fp('preflight'),
        fixtureFingerprint: fp('fixture'),
        inputFingerprint: fp('input'),
        snapshotFingerprint: fp('snapshot'),
        frozenGateFingerprints: {
          deepseek_control: fp('deepseek-gate'),
          balanced_openrouter: fp('balanced-gate'),
        },
        requiredSmokeModelKeys: ['smoke-model'],
        costPolicy: {
          'smoke-model': { inputUsdPerToken: 0.001, outputUsdPerToken: 0.001 },
        },
      }),
      runPaidSmokes: async (input, execute) => {
        receivedSignal = input.signal;
        await execute({
          id: 'smoke',
          profile: 'deepseek_control',
          phase: 'smoke',
          comparisonKey: 'smoke',
          modelKey: 'smoke-model',
          requestFingerprint: fp('request'),
          schemaFingerprint: fp('schema'),
          configurationFingerprint: fp('configuration'),
          maximumInputTokens: 10,
          maximumOutputTokens: 10,
          invoke: async () => new Promise(() => undefined),
        });
      },
      runTour: async () => {
        throw new Error('tour must not run after a smoke deadline');
      },
    };

    const report = await runNarrativeBenchmarkV6(
      parseNarrativeBenchmarkArgsV6([]),
      runner,
      Date.now,
      { spendLedger: ledger, paidSmokeDeadlineMs: 10 }
    );

    expect(receivedSignal?.aborted).toBe(true);
    expect(report.status).toBe('protocol_failed');
    expect(report.budget.reservedUsd).toBe(0);
    expect(report.budget.spentUsd).toBeCloseTo(
      NARRATIVE_SPEND_HISTORICAL_USD_V6 + 0.04,
      10
    );
  });
});
