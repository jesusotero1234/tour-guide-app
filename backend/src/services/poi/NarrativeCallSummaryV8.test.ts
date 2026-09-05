import type { EditorialAttemptV6, EditorialProgressEventV6 } from './EditorialStructuredLlmV6';
import { summarizeNarrativeCallsV8 } from './NarrativeCallSummaryV8';

function event(diagnostic: Partial<EditorialAttemptV6> = {}): EditorialProgressEventV6 {
  return {
    event: 'attempt_finished', at: '2026-09-05T00:00:00Z', callId: 'same-call',
    phase: 'writer', stopId: 'stop', runId: 'run', profile: 'test',
    requestedModel: 'requested', requestedEndpoint: null, reasoning: 'none', attempt: 1,
    diagnostic: { attempt: 1, status: 'valid', latencyMs: 100, rawOutput: 'private output',
      error: null, actualModel: 'actual', actualProvider: 'provider', usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0.1 },
      ...diagnostic },
  };
}

describe('V8 complete attempt summary', () => {
  it('counts repeated identities and failed attempts, excluding starts and heartbeats', () => {
    const finished = event();
    expect(summarizeNarrativeCallsV8([
      { ...finished, event: 'attempt_started' }, { ...finished, event: 'heartbeat' },
      finished, event({ status: 'semantic_error', latencyMs: 200 }),
      { ...finished, diagnostic: undefined },
    ])).toEqual([{ model: 'actual', provider: 'provider', calls: 2, latencyMs: 300, costUsd: 0.2 }]);
  });

  it('groups actual model/provider with safe fallbacks and preserves explicit zero', () => {
    expect(summarizeNarrativeCallsV8([
      event(), event({ actualProvider: 'other' }),
      event({ actualModel: undefined, actualProvider: null, usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd: 0 } }),
    ])).toEqual([
      { model: 'actual', provider: 'provider', calls: 1, latencyMs: 100, costUsd: 0.1 },
      { model: 'actual', provider: 'other', calls: 1, latencyMs: 100, costUsd: 0.1 },
      { model: 'requested', provider: 'unknown', calls: 1, latencyMs: 100, costUsd: 0 },
    ]);
  });

  it.each([undefined, -1, NaN, Infinity])('keeps unknown or invalid cost %s unknown even among known costs', costUsd => {
    const events = [event(), event({ usage: { inputTokens: 0, outputTokens: 0, totalTokens: 0, costUsd } }), event()];
    const [summary] = summarizeNarrativeCallsV8(events);
    expect(summary).toEqual({ model: 'actual', provider: 'provider', calls: 3, latencyMs: 300, costUsd: null });
    expect(JSON.stringify(summary)).not.toContain('private output');
  });

  it('has no calls for an empty run', () => {
    expect(summarizeNarrativeCallsV8([])).toEqual([]);
  });
});
