import type { EditorialProgressEventV6 } from './EditorialStructuredLlmV6';
import type { NarrativeTourCallSummaryV6 } from './NarrativeMarkdownV6';

/** Count finished attempts, not logical calls: retries and failures still consume resources. */
export function summarizeNarrativeCallsV8(events: readonly EditorialProgressEventV6[]): NarrativeTourCallSummaryV6[] {
  const groups = new Map<string, NarrativeTourCallSummaryV6>();
  for (const event of events) {
    if (event.event !== 'attempt_finished' || !event.diagnostic) continue;
    const attempt = event.diagnostic;
    const model = attempt.actualModel ?? event.requestedModel;
    const provider = attempt.actualProvider ?? 'unknown';
    const key = JSON.stringify([model, provider]);
    const group = groups.get(key) ?? { model, provider, calls: 0, latencyMs: 0, costUsd: 0 };
    const cost = attempt.usage?.costUsd;
    group.calls += 1;
    group.latencyMs += attempt.latencyMs;
    group.costUsd = group.costUsd !== null && typeof cost === 'number' && Number.isFinite(cost) && cost >= 0
      ? group.costUsd + cost : null;
    groups.set(key, group);
  }
  return [...groups.values()];
}
