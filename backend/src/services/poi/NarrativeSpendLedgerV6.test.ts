import { mkdtempSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  NARRATIVE_SPEND_HISTORICAL_USD_V6,
  NarrativeSpendLedgerV6,
} from './NarrativeSpendLedgerV6';

describe('NarrativeSpendLedgerV6', () => {
  function ledgerPath(): string {
    return join(mkdtempSync(join(tmpdir(), 'narrative-spend-v6-')), 'spend.private.jsonl');
  }

  it('persists one immutable historical baseline and reconciles reservations across instances', () => {
    const path = ledgerPath();
    const first = new NarrativeSpendLedgerV6({ limitUsd: 2, path });
    const reservation = first.reserve(0.2, { runId: 'run-a', attempt: 1 });

    const second = new NarrativeSpendLedgerV6({ limitUsd: 2, path });
    expect(second.snapshot()).toMatchObject({
      historicalSpentUsd: NARRATIVE_SPEND_HISTORICAL_USD_V6,
      runReportedCostUsd: 0,
      runUnverifiedExposureUsd: 0,
      spentUsd: NARRATIVE_SPEND_HISTORICAL_USD_V6,
      reservedUsd: 0.2,
    });
    second.settle(reservation, 0.05);
    expect(first.snapshot()).toMatchObject({
      historicalSpentUsd: NARRATIVE_SPEND_HISTORICAL_USD_V6,
      runReportedCostUsd: 0.05,
      runUnverifiedExposureUsd: 0,
      spentUsd: NARRATIVE_SPEND_HISTORICAL_USD_V6 + 0.05,
      reservedUsd: 0,
    });

    const events = readFileSync(path, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
    expect(events.filter((event) => event.event === 'initialized')).toHaveLength(1);
    expect(events[0]).toMatchObject({
      event: 'initialized', historicalSpendUsd: NARRATIVE_SPEND_HISTORICAL_USD_V6,
    });
  });

  it('charges the reserved maximum without usage and rejects overages before append', () => {
    const path = ledgerPath();
    const ledger = new NarrativeSpendLedgerV6({ limitUsd: 2, path });
    const unknownUsage = ledger.reserve(0.1);
    ledger.settle(unknownUsage);
    expect(ledger.snapshot().spentUsd).toBeCloseTo(
      NARRATIVE_SPEND_HISTORICAL_USD_V6 + 0.1,
      10
    );
    expect(ledger.snapshot()).toMatchObject({
      runReportedCostUsd: 0,
      runUnverifiedExposureUsd: 0.1,
    });
    expect(readFileSync(path, 'utf8')).toContain('reserved_maximum_no_usage');

    const overage = ledger.reserve(0.1);
    const before = readFileSync(path, 'utf8');
    expect(() => ledger.settle(overage, 0.11)).toThrow('exceeded its shared reservation');
    expect(readFileSync(path, 'utf8')).toBe(before);
    expect(ledger.snapshot().reservedUsd).toBeCloseTo(0.1, 10);
  });

  it('refuses to reinterpret an existing ledger with a different historical baseline', () => {
    const path = ledgerPath();
    new NarrativeSpendLedgerV6({ limitUsd: 2, path }).snapshot();
    expect(() => new NarrativeSpendLedgerV6({
      limitUsd: 2,
      path,
      historicalSpendUsd: NARRATIVE_SPEND_HISTORICAL_USD_V6 + 0.01,
    }).snapshot()).toThrow('historical spend does not match');
  });
});
