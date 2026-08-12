import {
  appendFileSync,
  chmodSync,
  mkdirSync,
  readFileSync,
  rmdirSync,
  statSync,
} from 'fs';
import { dirname, resolve } from 'path';
import { randomUUID } from 'crypto';

export const NARRATIVE_SPEND_HISTORICAL_USD_V6 = 0.2408782304;
export const NARRATIVE_SPEND_LEDGER_PATH_V6 = resolve(
  __dirname,
  '../../../logs/narrative-v6-spend.private.jsonl'
);

export interface NarrativeSpendLedgerSnapshotV6 {
  limitUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
}

export interface NarrativeSpendReservationV6 {
  id: string;
  maximumCostUsd: number;
}

export interface NarrativeSpendReservationMetadataV6 {
  runId?: string;
  phase?: string;
  model?: string;
  attempt?: number;
}

export type NarrativeSpendSettlementBasisV6 =
  | 'reported_actual'
  | 'reserved_maximum_no_usage';

type LedgerEventV6 = {
  schemaVersion: 'narrative-spend-ledger-v6';
  at: string;
  pid: number;
} & (
  | { event: 'initialized'; historicalSpendUsd: number }
  | {
    event: 'reserved';
    reservationId: string;
    maximumCostUsd: number;
    metadata?: NarrativeSpendReservationMetadataV6;
  }
  | {
    event: 'settled';
    reservationId: string;
    costUsd: number;
    basis: NarrativeSpendSettlementBasisV6;
  }
  | { event: 'released'; reservationId: string }
);

interface ReplayedLedgerV6 {
  spentUsd: number;
  reservations: Map<string, number>;
}

export class NarrativeSpendLedgerV6 {
  readonly path: string;
  private readonly lockPath: string;
  private readonly historicalSpendUsd: number;

  constructor(input: {
    limitUsd: number;
    path?: string;
    historicalSpendUsd?: number;
  }) {
    assertPositive(input.limitUsd, 'spend limit');
    this.limitUsd = input.limitUsd;
    this.path = resolve(input.path ?? NARRATIVE_SPEND_LEDGER_PATH_V6);
    this.lockPath = `${this.path}.lock`;
    this.historicalSpendUsd = input.historicalSpendUsd
      ?? NARRATIVE_SPEND_HISTORICAL_USD_V6;
    assertNonNegative(this.historicalSpendUsd, 'historical spend');
    if (this.historicalSpendUsd > this.limitUsd + Number.EPSILON) {
      throw new Error('historical spend already exceeds the shared cap');
    }
  }

  private readonly limitUsd: number;

  reserve(
    maximumCostUsd: number,
    metadata?: NarrativeSpendReservationMetadataV6
  ): NarrativeSpendReservationV6 {
    assertNonNegative(maximumCostUsd, 'maximum attempt cost');
    return this.locked(() => {
      const replayed = this.replay();
      const reservedUsd = sum(replayed.reservations.values());
      if (replayed.spentUsd + reservedUsd + maximumCostUsd
        > this.limitUsd + Number.EPSILON) {
        throw new Error('shared narrative spend cap exhausted before attempt');
      }
      const reservation = { id: randomUUID(), maximumCostUsd };
      this.append({
        schemaVersion: 'narrative-spend-ledger-v6',
        event: 'reserved',
        at: new Date().toISOString(),
        pid: process.pid,
        reservationId: reservation.id,
        maximumCostUsd,
        ...(metadata ? { metadata: { ...metadata } } : {}),
      });
      return reservation;
    });
  }

  settle(
    reservation: NarrativeSpendReservationV6,
    actualCostUsd?: number
  ): NarrativeSpendLedgerSnapshotV6 {
    const basis: NarrativeSpendSettlementBasisV6 = actualCostUsd === undefined
      ? 'reserved_maximum_no_usage'
      : 'reported_actual';
    const costUsd = actualCostUsd ?? reservation.maximumCostUsd;
    assertNonNegative(costUsd, 'settled attempt cost');
    if (costUsd > reservation.maximumCostUsd + Number.EPSILON) {
      throw new Error('billed cost exceeded its shared reservation');
    }
    return this.locked(() => {
      const replayed = this.replay();
      this.assertOpenReservation(replayed, reservation);
      this.append({
        schemaVersion: 'narrative-spend-ledger-v6',
        event: 'settled',
        at: new Date().toISOString(),
        pid: process.pid,
        reservationId: reservation.id,
        costUsd,
        basis,
      });
      const snapshot = this.snapshotFrom(this.replay());
      if (snapshot.spentUsd + snapshot.reservedUsd > this.limitUsd + Number.EPSILON) {
        throw new Error('shared narrative spend cap was exceeded');
      }
      return snapshot;
    });
  }

  /** Only release when no provider request was entered. */
  release(reservation: NarrativeSpendReservationV6): NarrativeSpendLedgerSnapshotV6 {
    return this.locked(() => {
      const replayed = this.replay();
      this.assertOpenReservation(replayed, reservation);
      this.append({
        schemaVersion: 'narrative-spend-ledger-v6',
        event: 'released',
        at: new Date().toISOString(),
        pid: process.pid,
        reservationId: reservation.id,
      });
      return this.snapshotFrom(this.replay());
    });
  }

  snapshot(): NarrativeSpendLedgerSnapshotV6 {
    return this.locked(() => this.snapshotFrom(this.replay()));
  }

  assertSettled(): void {
    if (this.snapshot().reservedUsd > Number.EPSILON) {
      throw new Error('shared narrative ledger contains open cost reservations');
    }
  }

  private snapshotFrom(replayed: ReplayedLedgerV6): NarrativeSpendLedgerSnapshotV6 {
    const reservedUsd = sum(replayed.reservations.values());
    return {
      limitUsd: this.limitUsd,
      spentUsd: replayed.spentUsd,
      reservedUsd,
      remainingUsd: Math.max(0, this.limitUsd - replayed.spentUsd - reservedUsd),
    };
  }

  private replay(): ReplayedLedgerV6 {
    let content = '';
    try {
      content = readFileSync(this.path, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
    const reservations = new Map<string, number>();
    let spentUsd: number | undefined;
    for (const [index, line] of content.split('\n').entries()) {
      if (!line.trim()) continue;
      let event: LedgerEventV6;
      try {
        event = JSON.parse(line) as LedgerEventV6;
      } catch {
        throw new Error(`shared narrative spend ledger has invalid JSON at line ${index + 1}`);
      }
      if (event.schemaVersion !== 'narrative-spend-ledger-v6') {
        throw new Error(`shared narrative spend ledger has invalid event at line ${index + 1}`);
      }
      if (event.event === 'initialized') {
        assertNonNegative(event.historicalSpendUsd, 'ledger historical spend');
        if (index !== 0 || spentUsd !== undefined) {
          throw new Error('shared narrative spend ledger initialization must be its first event');
        }
        if (event.historicalSpendUsd !== this.historicalSpendUsd) {
          throw new Error('shared narrative spend ledger historical spend does not match');
        }
        spentUsd = event.historicalSpendUsd;
      } else if (event.event === 'reserved') {
        if (spentUsd === undefined || typeof event.reservationId !== 'string') {
          throw new Error('shared narrative spend ledger is not initialized');
        }
        assertNonNegative(event.maximumCostUsd, 'ledger reservation');
        if (reservations.has(event.reservationId)) throw new Error('duplicate ledger reservation');
        reservations.set(event.reservationId, event.maximumCostUsd);
      } else {
        if (spentUsd === undefined || typeof event.reservationId !== 'string') {
          throw new Error('shared narrative spend ledger is not initialized');
        }
        if (!reservations.has(event.reservationId)) throw new Error('orphan ledger settlement');
        if (event.event === 'settled') {
          assertNonNegative(event.costUsd, 'ledger settlement');
          spentUsd += event.costUsd;
        } else if (event.event !== 'released') {
          throw new Error(`shared narrative spend ledger has unknown event at line ${index + 1}`);
        }
        reservations.delete(event.reservationId);
      }
    }
    if (spentUsd === undefined) {
      if (content.trim()) throw new Error('shared narrative spend ledger is not initialized');
      this.append({
        schemaVersion: 'narrative-spend-ledger-v6',
        event: 'initialized',
        at: new Date().toISOString(),
        pid: process.pid,
        historicalSpendUsd: this.historicalSpendUsd,
      });
      spentUsd = this.historicalSpendUsd;
    }
    return { spentUsd, reservations };
  }

  private assertOpenReservation(
    replayed: ReplayedLedgerV6,
    reservation: NarrativeSpendReservationV6
  ): void {
    if (replayed.reservations.get(reservation.id) !== reservation.maximumCostUsd) {
      throw new Error('unknown or already closed shared spend reservation');
    }
  }

  private append(event: LedgerEventV6): void {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    appendFileSync(this.path, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    chmodSync(this.path, 0o600);
  }

  private locked<T>(operation: () => T): T {
    mkdirSync(dirname(this.path), { recursive: true, mode: 0o700 });
    const startedAt = Date.now();
    while (true) {
      try {
        mkdirSync(this.lockPath, { mode: 0o700 });
        break;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error;
        if (Date.now() - startedAt > 5_000) {
          throw new Error('timed out acquiring shared narrative spend ledger lock');
        }
        try {
          if (Date.now() - statSync(this.lockPath).mtimeMs > 30_000) rmdirSync(this.lockPath);
        } catch (statError) {
          if ((statError as NodeJS.ErrnoException).code !== 'ENOENT') throw statError;
        }
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 10);
      }
    }
    try {
      return operation();
    } finally {
      try {
        rmdirSync(this.lockPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
    }
  }
}

function sum(values: Iterable<number>): number {
  let total = 0;
  for (const value of values) total += value;
  return total;
}

function assertPositive(value: number, label: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${label} must be positive and finite`);
}

function assertNonNegative(value: number, label: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be non-negative and finite`);
  }
}
