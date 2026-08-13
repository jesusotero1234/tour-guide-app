import {
  EditorialProgressEventV6,
} from './EditorialStructuredLlmV6';
import {
  NarrativeSpendLedgerSnapshotV6,
  NarrativeSpendLedgerV6,
  NarrativeSpendReservationV6,
} from './NarrativeSpendLedgerV6';

export class NarrativeProgressSpendGuardV6 {
  private readonly ledger: NarrativeSpendLedgerV6;
  private readonly reservations = new Map<string, NarrativeSpendReservationV6>();

  constructor(input: { limitUsd: number; historicalSpendUsd: number; path: string }) {
    this.ledger = new NarrativeSpendLedgerV6(input);
  }

  record(event: EditorialProgressEventV6): NarrativeSpendLedgerSnapshotV6 {
    if (event.event === 'attempt_started') this.reserve(event);
    if (event.event === 'attempt_finished') this.settle(event);
    return this.snapshot();
  }

  snapshot(): NarrativeSpendLedgerSnapshotV6 {
    return this.ledger.snapshot();
  }

  assertSettled(): void {
    if (this.reservations.size > 0) {
      throw new Error('narrative run ended with unsettled cost reservations');
    }
    this.ledger.assertSettled();
  }

  private reserve(event: EditorialProgressEventV6): void {
    if (event.attempt === undefined) throw new Error('attempt start omitted its attempt number');
    if (event.maximumCostUsd === undefined || !Number.isFinite(event.maximumCostUsd)
      || event.maximumCostUsd < 0) {
      throw new Error(`no verified maximum cost is available for ${event.requestedModel}`);
    }
    const key = this.key(event);
    if (this.reservations.has(key)) throw new Error(`duplicate cost reservation for ${key}`);
    this.reservations.set(key, this.ledger.reserve(event.maximumCostUsd, {
      ...(event.runId ? { runId: event.runId } : {}),
      ...(event.phase ? { phase: event.phase } : {}),
      model: event.requestedModel,
      attempt: event.attempt,
    }));
  }

  private settle(event: EditorialProgressEventV6): void {
    if (event.attempt === undefined) throw new Error('attempt finish omitted its attempt number');
    const key = this.key(event);
    const reservation = this.reservations.get(key);
    if (!reservation) throw new Error(`unknown cost reservation for ${key}`);
    this.reservations.delete(key);
    const actualCostUsd = event.diagnostic?.usage?.costUsd;
    if (actualCostUsd !== undefined && (!Number.isFinite(actualCostUsd) || actualCostUsd < 0)) {
      throw new Error(`invalid billed cost for ${key}`);
    }
    this.ledger.settle(reservation, actualCostUsd);
  }

  private key(event: EditorialProgressEventV6): string {
    return `${event.callId}#${event.attempt}`;
  }
}
