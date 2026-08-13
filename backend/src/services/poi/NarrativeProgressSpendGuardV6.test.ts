import { mkdtempSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { EditorialProgressEventV6 } from './EditorialStructuredLlmV6';
import { NarrativeProgressSpendGuardV6 } from './NarrativeProgressSpendGuardV6';

function event(
  kind: EditorialProgressEventV6['event'],
  overrides: Partial<EditorialProgressEventV6> = {}
): EditorialProgressEventV6 {
  return {
    event: kind, at: '2026-08-13T00:00:00.000Z', callId: 'call-1', phase: 'writer',
    stopId: 'stop-1', runId: 'run-1', profile: 'balanced_openrouter',
    requestedModel: 'model-1', requestedEndpoint: 'provider-1', reasoning: 'none',
    attempt: 1,
    ...overrides,
  };
}

describe('NarrativeProgressSpendGuardV6', () => {
  it('carries historical spend and settles parallel-safe progress reservations', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'narrative-progress-spend-'));
    try {
      const guard = new NarrativeProgressSpendGuardV6({
        limitUsd: 2, historicalSpendUsd: 0.4, path: resolve(directory, 'ledger.jsonl'),
      });
      guard.record(event('attempt_started', { maximumCostUsd: 0.2 }));
      const snapshot = guard.record(event('attempt_finished', {
        diagnostic: {
          attempt: 1, status: 'valid', latencyMs: 10, rawOutput: '{}', error: null,
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15, costUsd: 0.05 },
        },
      }));

      expect(snapshot).toMatchObject({ spentUsd: 0.45, reservedUsd: 0, remainingUsd: 1.55 });
      expect(() => guard.assertSettled()).not.toThrow();
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
