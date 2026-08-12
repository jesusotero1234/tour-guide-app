import { createHash } from 'crypto';
import {
  NARRATIVE_SPEND_HISTORICAL_USD_V6,
  NarrativeSpendLedgerV6,
  NarrativeSpendReservationV6,
} from './NarrativeSpendLedgerV6';

export const NARRATIVE_BENCHMARK_PROFILES_V6 = [
  'deepseek_control',
  'balanced_openrouter',
] as const;

export const NARRATIVE_BENCHMARK_PRIOR_SPEND_USD_V6 = NARRATIVE_SPEND_HISTORICAL_USD_V6;
export const NARRATIVE_BENCHMARK_PAID_SMOKE_DEADLINE_MS_V6 = 8 * 60 * 1_000;

export type NarrativeBenchmarkProfileV6 = typeof NARRATIVE_BENCHMARK_PROFILES_V6[number];
export type NarrativeBenchmarkStatusV6 =
  | 'ready'
  | 'model_calibration_failed'
  | 'protocol_failed';

export interface NarrativeBenchmarkOptionsV6 {
  profiles: NarrativeBenchmarkProfileV6[];
  repetitions: number;
  maxSpendUsd: number;
  fixture: string;
}

export interface NarrativeBenchmarkPreflightV6 {
  status: 'ready' | 'protocol_failed';
  fingerprint?: string;
  reasonCode?: 'catalog_unavailable' | 'fixture_missing' | 'gate_a_missing'
    | 'snapshot_missing' | 'model_endpoint_unsupported' | 'protocol_mismatch';
  fixtureFingerprint?: string;
  inputFingerprint?: string;
  snapshotFingerprint?: string;
  frozenGateFingerprints?: Record<NarrativeBenchmarkProfileV6, string>;
  requiredSmokeModelKeys?: string[];
  costPolicy?: Record<string, { inputUsdPerToken: number; outputUsdPerToken: number }>;
}

export type NarrativeBenchmarkRetryReasonV6 =
  | 'initial'
  | 'timeout'
  | 'http_408'
  | 'http_429'
  | 'http_5xx'
  | 'json_invalid'
  | 'schema_invalid';

export interface NarrativeBenchmarkAttemptV6 {
  durationMs: number;
  schemaValid: boolean;
  costUsd: number;
  reason: NarrativeBenchmarkRetryReasonV6;
}

export interface NarrativeBenchmarkInvocationResultV6 {
  actualCostUsd: number;
  attempts: NarrativeBenchmarkAttemptV6[];
  protocolValid: boolean;
  fallbackUsed: boolean;
  fullResponse?: unknown;
}

export interface NarrativeBenchmarkCallV6 {
  id: string;
  profile: NarrativeBenchmarkProfileV6;
  phase: string;
  comparisonKey: string;
  modelKey: string;
  requestFingerprint: string;
  schemaFingerprint: string;
  configurationFingerprint: string;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  temperature?: number;
  invoke: (signal?: AbortSignal) => Promise<NarrativeBenchmarkInvocationResultV6>;
}

export type NarrativeBenchmarkCallExecutorV6 = (
  call: NarrativeBenchmarkCallV6
) => Promise<NarrativeBenchmarkInvocationResultV6>;

export interface NarrativeBenchmarkQualityV6 {
  detectedMutations: number;
  totalMutations: number;
  hardFactualWarnings: number;
  dossierComparable: boolean;
  disputedInterpretationsWithSingleSource: number;
}

export interface NarrativeBenchmarkTourResultV6 {
  quality: NarrativeBenchmarkQualityV6;
  fingerprints: NarrativeBenchmarkInputFingerprintsV6;
  reusedFrozenGate: boolean;
  gateFingerprint: string;
}

export interface NarrativeBenchmarkInputFingerprintsV6 {
  fixture: string;
  input: string;
  snapshot: string;
}

export interface NarrativeBenchmarkCostPolicyInputV6 {
  profile: NarrativeBenchmarkProfileV6;
  phase: string;
  modelKey: string;
  maximumInputTokens: number;
  maximumOutputTokens: number;
  maximumAttempts: 2;
}

export interface NarrativeBenchmarkRunnerV6 {
  /** This callback must use only free catalogue/fixture checks. */
  preflight: (input: {
    profiles: NarrativeBenchmarkProfileV6[];
    fixture: string;
  }) => Promise<NarrativeBenchmarkPreflightV6>;
  runPaidSmokes: (
    input: { fixture: string; requiredModelKeys: string[]; signal?: AbortSignal },
    executeCall: NarrativeBenchmarkCallExecutorV6
  ) => Promise<void>;
  runTour: (
    input: {
      profile: NarrativeBenchmarkProfileV6;
      repetition: number;
      fixture: string;
    },
    executeCall: NarrativeBenchmarkCallExecutorV6
  ) => Promise<NarrativeBenchmarkTourResultV6>;
}

export interface NarrativeBenchmarkBudgetSnapshotV6 {
  limitUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
}

interface BudgetReservationV6 {
  id: number;
  maximumCostUsd: number;
}

interface NarrativeBenchmarkBudgetV6 {
  reserve(maximumCostUsd: number): BudgetReservationV6;
  settle(reservation: BudgetReservationV6, actualCostUsd?: number): void;
  release(reservation: BudgetReservationV6): void;
  snapshot(): NarrativeBenchmarkBudgetSnapshotV6;
}

export interface NarrativeBenchmarkRuntimeV6 {
  spendLedger?: NarrativeSpendLedgerV6;
  paidSmokeDeadlineMs?: number;
}

export class NarrativeBenchmarkSpendBudgetV6 {
  private spentUsd: number;
  private reservedUsd = 0;
  private nextReservationId = 1;
  private readonly openReservations = new Map<number, number>();

  constructor(private readonly limitUsd: number, initialSpentUsd = 0) {
    assertPositiveFinite(limitUsd, 'max spend');
    assertNonNegativeFinite(initialSpentUsd, 'initial spend');
    if (initialSpentUsd > limitUsd + Number.EPSILON) {
      throw new NarrativeBenchmarkProtocolErrorV6('initial spend already exceeds benchmark cap');
    }
    this.spentUsd = initialSpentUsd;
  }

  reserve(maximumCostUsd: number): BudgetReservationV6 {
    assertNonNegativeFinite(maximumCostUsd, 'maximum call cost');
    if (this.spentUsd + this.reservedUsd + maximumCostUsd > this.limitUsd + Number.EPSILON) {
      throw new NarrativeBenchmarkProtocolErrorV6('benchmark spend cap exhausted before call');
    }
    const reservation = { id: this.nextReservationId, maximumCostUsd };
    this.nextReservationId += 1;
    this.openReservations.set(reservation.id, maximumCostUsd);
    this.reservedUsd += maximumCostUsd;
    return reservation;
  }

  settle(reservation: BudgetReservationV6, actualCostUsd?: number): void {
    const maximum = this.takeReservation(reservation);
    const chargedCostUsd = actualCostUsd ?? maximum;
    assertNonNegativeFinite(chargedCostUsd, 'actual call cost');
    if (chargedCostUsd > maximum + Number.EPSILON) {
      this.reservedUsd -= maximum;
      this.spentUsd += chargedCostUsd;
      throw new NarrativeBenchmarkProtocolErrorV6(
        'actual call cost exceeded its declared maximum reservation'
      );
    }
    this.reservedUsd -= maximum;
    this.spentUsd += chargedCostUsd;
    if (this.spentUsd > this.limitUsd + Number.EPSILON) {
      throw new NarrativeBenchmarkProtocolErrorV6('benchmark spend cap was exceeded');
    }
  }

  /** Use only when invoke was never entered, so no provider charge is possible. */
  release(reservation: BudgetReservationV6): void {
    this.reservedUsd -= this.takeReservation(reservation);
  }

  snapshot(): NarrativeBenchmarkBudgetSnapshotV6 {
    return {
      limitUsd: this.limitUsd,
      spentUsd: this.spentUsd,
      reservedUsd: this.reservedUsd,
      remainingUsd: Math.max(0, this.limitUsd - this.spentUsd - this.reservedUsd),
    };
  }

  private takeReservation(reservation: BudgetReservationV6): number {
    const maximum = this.openReservations.get(reservation.id);
    if (maximum === undefined || maximum !== reservation.maximumCostUsd) {
      throw new NarrativeBenchmarkProtocolErrorV6('unknown or already closed spend reservation');
    }
    this.openReservations.delete(reservation.id);
    return maximum;
  }
}

class NarrativeBenchmarkSharedSpendBudgetV6 implements NarrativeBenchmarkBudgetV6 {
  private nextReservationId = 1;
  private readonly reservations = new Map<number, NarrativeSpendReservationV6>();

  constructor(private readonly ledger: NarrativeSpendLedgerV6) {}

  reserve(maximumCostUsd: number): BudgetReservationV6 {
    const shared = this.ledger.reserve(maximumCostUsd, { phase: 'benchmark' });
    const reservation = { id: this.nextReservationId, maximumCostUsd };
    this.nextReservationId += 1;
    this.reservations.set(reservation.id, shared);
    return reservation;
  }

  settle(reservation: BudgetReservationV6, actualCostUsd?: number): void {
    this.ledger.settle(this.take(reservation), actualCostUsd);
  }

  release(reservation: BudgetReservationV6): void {
    this.ledger.release(this.take(reservation));
  }

  snapshot(): NarrativeBenchmarkBudgetSnapshotV6 {
    return this.ledger.snapshot();
  }

  private take(reservation: BudgetReservationV6): NarrativeSpendReservationV6 {
    const shared = this.reservations.get(reservation.id);
    if (!shared || shared.maximumCostUsd !== reservation.maximumCostUsd) {
      throw new NarrativeBenchmarkProtocolErrorV6('unknown shared benchmark reservation');
    }
    this.reservations.delete(reservation.id);
    return shared;
  }
}

export interface NarrativeBenchmarkPercentilesV6 {
  samples: number;
  p50Ms: number | null;
  p95Ms: number | null;
}

export interface NarrativeBenchmarkPhaseMetricsV6 extends NarrativeBenchmarkPercentilesV6 {
  logicalCalls: number;
  retries: number;
  firstAttemptSchemaValidRate: number | null;
  retryRate: number | null;
}

export interface NarrativeBenchmarkTourMetricsV6 extends NarrativeBenchmarkPercentilesV6 {
  limitedSample: boolean;
  note: string;
}

export interface NarrativeBenchmarkFingerprintV6 {
  profile: NarrativeBenchmarkProfileV6;
  repetition: number;
  phase: string;
  comparisonKey: string;
  fingerprint: string;
}

export interface NarrativeBenchmarkFingerprintVariationV6 {
  profile: NarrativeBenchmarkProfileV6;
  phase: string;
  comparisonKey: string;
  samples: number;
  distinctFingerprints: number;
}

export interface NarrativeBenchmarkRepetitionV6 {
  profile: NarrativeBenchmarkProfileV6;
  repetition: number;
  durationMs: number;
  costUsd: number;
  logicalCalls: number;
  reusedFrozenGate: boolean;
  quality: NarrativeBenchmarkQualityV6;
}

export interface NarrativeBenchmarkProfileAssessmentV6 {
  profile: NarrativeBenchmarkProfileV6;
  status: 'ready' | 'model_calibration_failed';
  reasons: string[];
}

export interface NarrativeBenchmarkReportV6 {
  schemaVersion: 'narrative-benchmark-v6';
  status: NarrativeBenchmarkStatusV6;
  configuration: NarrativeBenchmarkOptionsV6;
  preflight: NarrativeBenchmarkPreflightV6;
  budget: NarrativeBenchmarkBudgetSnapshotV6;
  thresholds: {
    mutations: '8/8';
    maximumHardFactualWarnings: 0;
    dossierComparable: true;
    maximumSingleSourceDisputedInterpretations: 0;
    minimumFirstAttemptSchemaValidRate: 0.995;
    maximumRetryRate: 0.01;
    maximumRetriesPerCall: 1;
    fallbacksAllowed: false;
  };
  profiles: NarrativeBenchmarkProfileAssessmentV6[];
  repetitions: NarrativeBenchmarkRepetitionV6[];
  metrics: {
    phases: Record<string, NarrativeBenchmarkPhaseMetricsV6>;
    tours: Partial<Record<NarrativeBenchmarkProfileV6, NarrativeBenchmarkTourMetricsV6>>;
  };
  temperatureZeroFingerprints: NarrativeBenchmarkFingerprintV6[];
  fingerprintVariation: NarrativeBenchmarkFingerprintVariationV6[];
  reasons: string[];
}

interface RecordedCallV6 {
  purpose: 'smoke' | 'benchmark';
  profile: NarrativeBenchmarkProfileV6;
  repetition: number;
  phase: string;
  modelKey: string;
  comparisonKey: string;
  requestFingerprint: string;
  schemaFingerprint: string;
  configurationFingerprint: string;
  temperature?: number;
  logicalCallId: string;
  attempts: NarrativeBenchmarkAttemptV6[];
}

export class NarrativeBenchmarkProtocolErrorV6 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrativeBenchmarkProtocolErrorV6';
  }
}

class NarrativeBenchmarkCalibrationErrorV6 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NarrativeBenchmarkCalibrationErrorV6';
  }
}

export function parseNarrativeBenchmarkArgsV6(args: readonly string[]): NarrativeBenchmarkOptionsV6 {
  validateKnownArguments(args);
  const profilesValue = argumentValue(args, '--profiles');
  const requestedProfiles = profilesValue === undefined
    ? [...NARRATIVE_BENCHMARK_PROFILES_V6]
    : profilesValue.split(',').map((profile) => profile.trim()).filter(Boolean);
  if (requestedProfiles.length === 0) throw new Error('--profiles must not be empty');
  const profiles = requestedProfiles.map((profile) => {
    if (!NARRATIVE_BENCHMARK_PROFILES_V6.includes(profile as NarrativeBenchmarkProfileV6)) {
      throw new Error(`unknown narrative benchmark profile: ${profile}`);
    }
    return profile as NarrativeBenchmarkProfileV6;
  });
  if (new Set(profiles).size !== profiles.length) {
    throw new Error('--profiles must not contain duplicates');
  }

  const repetitions = Number(argumentValue(args, '--repetitions') ?? '3');
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error('--repetitions must be a positive integer');
  }
  const maxSpendUsd = Number(argumentValue(args, '--max-spend-usd') ?? '2');
  assertPositiveFinite(maxSpendUsd, '--max-spend-usd');
  if (maxSpendUsd > 2) throw new Error('--max-spend-usd must not exceed 2');
  if (maxSpendUsd < NARRATIVE_BENCHMARK_PRIOR_SPEND_USD_V6) {
    throw new Error(
      `--max-spend-usd must cover prior spend of $${NARRATIVE_BENCHMARK_PRIOR_SPEND_USD_V6}`
    );
  }
  const fixture = (argumentValue(args, '--fixture') ?? 'madrid').trim();
  if (!fixture) throw new Error('--fixture must not be empty');

  return { profiles, repetitions, maxSpendUsd, fixture };
}

/** Linear interpolation over sorted samples; empty inputs produce null. */
export function narrativeBenchmarkPercentileV6(
  samples: readonly number[],
  percentile: number
): number | null {
  if (samples.length === 0) return null;
  if (!Number.isFinite(percentile) || percentile < 0 || percentile > 1) {
    throw new Error('percentile must be between 0 and 1');
  }
  const sorted = samples.map((sample) => {
    assertNonNegativeFinite(sample, 'latency sample');
    return sample;
  }).sort((left, right) => left - right);
  const position = (sorted.length - 1) * percentile;
  const lower = Math.floor(position);
  const upper = Math.ceil(position);
  if (lower === upper) return sorted[lower];
  const weight = position - lower;
  return sorted[lower] + (sorted[upper] - sorted[lower]) * weight;
}

export async function runNarrativeBenchmarkV6(
  options: NarrativeBenchmarkOptionsV6,
  runner: NarrativeBenchmarkRunnerV6,
  now: () => number = Date.now,
  runtime: NarrativeBenchmarkRuntimeV6 = {}
): Promise<NarrativeBenchmarkReportV6> {
  validateOptions(options);
  const budget: NarrativeBenchmarkBudgetV6 = runtime.spendLedger
    ? new NarrativeBenchmarkSharedSpendBudgetV6(runtime.spendLedger)
    : new NarrativeBenchmarkSpendBudgetV6(
      options.maxSpendUsd,
      NARRATIVE_BENCHMARK_PRIOR_SPEND_USD_V6
    );
  if (Math.abs(budget.snapshot().limitUsd - options.maxSpendUsd) > Number.EPSILON) {
    throw new Error('shared spend ledger limit does not match benchmark max spend');
  }
  const paidSmokeDeadlineMs = runtime.paidSmokeDeadlineMs
    ?? NARRATIVE_BENCHMARK_PAID_SMOKE_DEADLINE_MS_V6;
  assertPositiveFinite(paidSmokeDeadlineMs, 'paid smoke deadline');
  const configurationReason = canonicalConfigurationReason(options);
  if (configurationReason) {
    const preflight = { status: 'protocol_failed' as const, reasonCode: 'protocol_mismatch' as const };
    return buildReport(options, preflight, budget, [], [], [], 'protocol_failed', [
      configurationReason,
    ]);
  }
  let preflight: NarrativeBenchmarkPreflightV6;
  try {
    preflight = normalizePublicPreflight(await runner.preflight({
      profiles: options.profiles,
      fixture: options.fixture,
    }));
  } catch {
    preflight = { status: 'protocol_failed', reasonCode: 'protocol_mismatch' };
  }
  const preflightReason = validateReadyPreflight(preflight);
  if (preflight.status !== 'ready' || preflightReason) {
    return buildReport(options, preflight, budget, [], [], [], 'protocol_failed', [
      preflightReason ?? preflight.reasonCode ?? 'free benchmark preflight failed',
    ]);
  }

  const calls: RecordedCallV6[] = [];
  const repetitions: NarrativeBenchmarkRepetitionV6[] = [];
  const fingerprints: NarrativeBenchmarkFingerprintV6[] = [];
  const logicalCallIds = new Set<string>();
  const logicalComparisonIds = new Set<string>();
  let forcedStatus: NarrativeBenchmarkStatusV6 | undefined;
  let forcedReason: string | undefined;

  const executeContext = (context: {
    purpose: 'smoke' | 'benchmark';
    repetition: number;
    expectedProfile?: NarrativeBenchmarkProfileV6;
    signal?: AbortSignal;
  }): {
    execute: NarrativeBenchmarkCallExecutorV6;
    closeAndDrain: () => Promise<void>;
  } => {
    let accepting = true;
    const inFlight = new Set<Promise<NarrativeBenchmarkInvocationResultV6>>();
    const execute: NarrativeBenchmarkCallExecutorV6 = (call) => {
      if (!accepting) {
        return Promise.reject(new NarrativeBenchmarkProtocolErrorV6(
          'runner invoked an executor after its stage closed'
        ));
      }
      const task = (async (): Promise<NarrativeBenchmarkInvocationResultV6> => {
        validateCall(call);
        if (context.expectedProfile && call.profile !== context.expectedProfile) {
          throw new NarrativeBenchmarkProtocolErrorV6('tour called a different profile');
        }
        const logicalCallId = `${context.purpose}:${call.profile}:${context.repetition}:${call.id}`;
        const comparisonId = `${call.phase}\u0000${call.modelKey}\u0000${call.comparisonKey}`;
        if (logicalCallIds.has(logicalCallId)) {
          throw new NarrativeBenchmarkProtocolErrorV6('runner reused a call id within a stage');
        }
        const logicalComparisonId = [
          context.purpose, call.profile, String(context.repetition), comparisonId,
        ].join('\u0000');
        if (logicalComparisonIds.has(logicalComparisonId)) {
          throw new NarrativeBenchmarkProtocolErrorV6(
            'runner reused a phase/model/comparison key within a stage'
          );
        }
        logicalCallIds.add(logicalCallId);
        logicalComparisonIds.add(logicalComparisonId);
        const maximumCostUsd = maximumNarrativeBenchmarkCallCostUsdV6(
          preflight,
          {
          profile: call.profile,
          phase: call.phase,
          modelKey: call.modelKey,
          maximumInputTokens: call.maximumInputTokens,
          maximumOutputTokens: call.maximumOutputTokens,
          maximumAttempts: 2,
          }
        );
        assertPositiveFinite(maximumCostUsd, 'policy maximum call cost');
        const reservation = budget.reserve(maximumCostUsd);
        let result: NarrativeBenchmarkInvocationResultV6;
        try {
          result = await abortable(call.invoke(context.signal), context.signal);
        } catch {
          // Usage is unknowable after invoke begins; retain the full policy maximum.
          budget.settle(reservation);
          throw new NarrativeBenchmarkProtocolErrorV6('benchmark call threw without usage data');
        }
        try {
          validateInvocationResult(result);
        } catch {
          budget.settle(reservation);
          throw new NarrativeBenchmarkProtocolErrorV6(
            'benchmark call returned malformed usage or attempt metrics'
          );
        }
        budget.settle(reservation, result.actualCostUsd);
        calls.push({
          purpose: context.purpose,
          profile: call.profile,
          repetition: context.repetition,
          phase: call.phase,
          modelKey: call.modelKey,
          comparisonKey: call.comparisonKey,
          requestFingerprint: call.requestFingerprint,
          schemaFingerprint: call.schemaFingerprint,
          configurationFingerprint: call.configurationFingerprint,
          ...(call.temperature === undefined ? {} : { temperature: call.temperature }),
          logicalCallId,
          attempts: result.attempts.map((attempt) => ({ ...attempt })),
        });
        if (call.temperature === 0 && result.fullResponse === undefined) {
          throw new NarrativeBenchmarkProtocolErrorV6(
            'temperature-zero call omitted its full response fingerprint input'
          );
        }
        if (call.temperature === 0) {
          fingerprints.push({
            profile: call.profile,
            repetition: context.repetition,
            phase: call.phase,
            comparisonKey: call.comparisonKey,
            fingerprint: fingerprintJson(result.fullResponse),
          });
        }
        validateModelOutcome(call.profile, result);
        return result;
      })();
      inFlight.add(task);
      void task.then(
        () => inFlight.delete(task),
        () => inFlight.delete(task)
      );
      return task;
    };
    return {
      execute,
      closeAndDrain: async () => {
        accepting = false;
        await Promise.allSettled([...inFlight]);
        if (inFlight.size !== 0) {
          throw new NarrativeBenchmarkProtocolErrorV6('benchmark stage left calls in flight');
        }
      },
    };
  };

  try {
    const smokeAbort = new AbortController();
    const smokeDeadline = setTimeout(() => smokeAbort.abort(
      new NarrativeBenchmarkProtocolErrorV6(
        `paid model smoke exceeded its absolute ${paidSmokeDeadlineMs}ms deadline`
      )
    ), paidSmokeDeadlineMs);
    smokeDeadline.unref?.();
    const smokeContext = executeContext({
      purpose: 'smoke', repetition: 0, signal: smokeAbort.signal,
    });
    try {
      await abortable(runner.runPaidSmokes({
        fixture: options.fixture,
        requiredModelKeys: [...(preflight.requiredSmokeModelKeys ?? [])],
        signal: smokeAbort.signal,
      }, smokeContext.execute), smokeAbort.signal);
    } finally {
      try {
        await smokeContext.closeAndDrain();
      } finally {
        clearTimeout(smokeDeadline);
      }
    }
    validatePaidSmokes(calls, preflight.requiredSmokeModelKeys ?? []);
  } catch (error) {
    forcedStatus = error instanceof NarrativeBenchmarkCalibrationErrorV6
      ? 'model_calibration_failed'
      : 'protocol_failed';
    forcedReason = safeBenchmarkError(error, 'paid model smoke failed');
  }

  benchmark: for (const profile of forcedStatus ? [] : options.profiles) {
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      const start = now();
      const startingCost = budget.snapshot().spentUsd;
      const startingCalls = calls.length;
      try {
        const tourContext = executeContext({
          purpose: 'benchmark', repetition, expectedProfile: profile,
        });
        let tour: NarrativeBenchmarkTourResultV6;
        try {
          tour = await runner.runTour(
            { profile, repetition, fixture: options.fixture },
            tourContext.execute
          );
        } finally {
          await tourContext.closeAndDrain();
        }
        validateQuality(tour.quality);
        validateTourInvariants(tour, preflight, calls.slice(startingCalls), profile);
        const durationMs = now() - start;
        assertNonNegativeFinite(durationMs, 'tour duration');
        const completed: NarrativeBenchmarkRepetitionV6 = {
          profile,
          repetition,
          durationMs,
          costUsd: budget.snapshot().spentUsd - startingCost,
          logicalCalls: calls.length - startingCalls,
          reusedFrozenGate: tour.reusedFrozenGate === true,
          quality: { ...tour.quality },
        };
        repetitions.push(completed);
        const qualityReasons = assessQuality(completed.quality);
        if (qualityReasons.length > 0) {
          forcedStatus = 'model_calibration_failed';
          forcedReason = `${profile} repetition ${repetition}: ${qualityReasons.join('; ')}`;
          break benchmark;
        }
      } catch (error) {
        forcedStatus = error instanceof NarrativeBenchmarkCalibrationErrorV6
          ? 'model_calibration_failed'
          : 'protocol_failed';
        forcedReason = safeBenchmarkError(
          error,
          `benchmark orchestration failed for ${profile} repetition ${repetition}`
        );
        break benchmark;
      }
    }
  }

  const preliminary = buildReport(
    options,
    preflight,
    budget,
    calls,
    repetitions,
    fingerprints,
    forcedStatus,
    forcedReason ? [forcedReason] : []
  );
  if (forcedStatus !== undefined) return preliminary;

  const invariantReason = compareRepetitionCallContracts(calls, options);
  if (invariantReason) {
    return { ...preliminary, status: 'protocol_failed', reasons: [invariantReason] };
  }

  const rateReasons = assessProfileRates(calls);
  if (rateReasons.size === 0) return preliminary;
  return {
    ...preliminary,
    status: 'model_calibration_failed',
    profiles: preliminary.profiles.map((profile) => {
      const profileReasons = rateReasons.get(profile.profile) ?? [];
      return profileReasons.length === 0 ? profile : {
        ...profile,
        status: 'model_calibration_failed',
        reasons: [...profile.reasons, ...profileReasons],
      };
    }),
    reasons: [...rateReasons.values()].flat(),
  };
}

function buildReport(
  options: NarrativeBenchmarkOptionsV6,
  preflight: NarrativeBenchmarkPreflightV6,
  budget: NarrativeBenchmarkBudgetV6,
  calls: RecordedCallV6[],
  repetitions: NarrativeBenchmarkRepetitionV6[],
  fingerprints: NarrativeBenchmarkFingerprintV6[],
  forcedStatus?: NarrativeBenchmarkStatusV6,
  reasons: string[] = []
): NarrativeBenchmarkReportV6 {
  const phases = summarizePhases(calls);
  const tours = summarizeTours(repetitions);
  const profileAssessments = options.profiles.map((profile) => {
    const profileRepetitions = repetitions.filter((item) => item.profile === profile);
    const profileReasons = profileRepetitions.flatMap((item) => assessQuality(item.quality));
    if (forcedStatus === 'model_calibration_failed' && reasons.some((reason) => reason.startsWith(profile))) {
      profileReasons.push(...reasons.filter((reason) => reason.startsWith(profile)));
    }
    return {
      profile,
      status: profileReasons.length === 0 ? 'ready' as const : 'model_calibration_failed' as const,
      reasons: [...new Set(profileReasons)],
    };
  });
  const inferredStatus: NarrativeBenchmarkStatusV6 = profileAssessments.some(
    (profile) => profile.status === 'model_calibration_failed'
  ) ? 'model_calibration_failed' : 'ready';
  return {
    schemaVersion: 'narrative-benchmark-v6',
    status: forcedStatus ?? inferredStatus,
    configuration: {
      ...options,
      profiles: [...options.profiles],
    },
    preflight: { ...preflight },
    budget: budget.snapshot(),
    thresholds: {
      mutations: '8/8',
      maximumHardFactualWarnings: 0,
      dossierComparable: true,
      maximumSingleSourceDisputedInterpretations: 0,
      minimumFirstAttemptSchemaValidRate: 0.995,
      maximumRetryRate: 0.01,
      maximumRetriesPerCall: 1,
      fallbacksAllowed: false,
    },
    profiles: profileAssessments,
    repetitions: repetitions.map((item) => ({ ...item, quality: { ...item.quality } })),
    metrics: { phases, tours },
    temperatureZeroFingerprints: fingerprints.map((item) => ({ ...item })),
    fingerprintVariation: summarizeFingerprintVariation(fingerprints),
    reasons,
  };
}

function summarizePhases(calls: readonly RecordedCallV6[]): Record<string, NarrativeBenchmarkPhaseMetricsV6> {
  const grouped = new Map<string, RecordedCallV6[]>();
  for (const call of calls) {
    const key = `${call.profile}/${call.phase}`;
    grouped.set(key, [...(grouped.get(key) ?? []), call]);
  }
  return Object.fromEntries([...grouped.entries()].sort(([left], [right]) => left.localeCompare(right)).map(
    ([profileAndPhase, phaseCalls]) => {
      const durations = phaseCalls.map((call) => call.attempts.reduce(
        (total, attempt) => total + attempt.durationMs,
        0
      ));
      const retries = phaseCalls.reduce((total, call) => total + Math.max(0, call.attempts.length - 1), 0);
      const firstAttemptValid = phaseCalls.filter((call) => call.attempts[0]?.schemaValid).length;
      return [profileAndPhase, {
        ...percentileSummary(durations),
        logicalCalls: phaseCalls.length,
        retries,
        firstAttemptSchemaValidRate: phaseCalls.length === 0 ? null : firstAttemptValid / phaseCalls.length,
        retryRate: phaseCalls.length === 0 ? null : retries / phaseCalls.length,
      }];
    }
  ));
}

function assessProfileRates(
  calls: readonly RecordedCallV6[]
): Map<NarrativeBenchmarkProfileV6, string[]> {
  const failures = new Map<NarrativeBenchmarkProfileV6, string[]>();
  for (const profile of NARRATIVE_BENCHMARK_PROFILES_V6) {
    const profileCalls = calls.filter((call) => call.profile === profile);
    if (profileCalls.length === 0) continue;
    const retries = profileCalls.reduce(
      (total, call) => total + Math.max(0, call.attempts.length - 1),
      0
    );
    const firstAttemptValid = profileCalls.filter((call) => call.attempts[0]?.schemaValid).length;
    const reasons: string[] = [];
    if (firstAttemptValid / profileCalls.length < 0.995) {
      reasons.push(`${profile} first-attempt schema-valid rate was below 99.5%`);
    }
    if (retries / profileCalls.length > 0.01) {
      reasons.push(`${profile} retry rate exceeded 1%`);
    }
    if (reasons.length > 0) failures.set(profile, reasons);
  }
  return failures;
}

function summarizeTours(
  repetitions: readonly NarrativeBenchmarkRepetitionV6[]
): Partial<Record<NarrativeBenchmarkProfileV6, NarrativeBenchmarkTourMetricsV6>> {
  return Object.fromEntries(NARRATIVE_BENCHMARK_PROFILES_V6.flatMap((profile) => {
    const durations = repetitions.filter((item) => item.profile === profile).map((item) => item.durationMs);
    if (durations.length === 0) return [];
    return [[profile, {
      ...percentileSummary(durations),
      limitedSample: durations.length <= 3,
      note: durations.length === 3
        ? 'p50/p95 de tour calculados con solo tres muestras'
        : `p50/p95 de tour calculados con ${durations.length} muestras`,
    }]];
  }));
}

function summarizeFingerprintVariation(
  fingerprints: readonly NarrativeBenchmarkFingerprintV6[]
): NarrativeBenchmarkFingerprintVariationV6[] {
  const groups = new Map<string, NarrativeBenchmarkFingerprintV6[]>();
  for (const fingerprint of fingerprints) {
    const key = `${fingerprint.profile}\u0000${fingerprint.phase}\u0000${fingerprint.comparisonKey}`;
    groups.set(key, [...(groups.get(key) ?? []), fingerprint]);
  }
  return [...groups.values()].map((items) => ({
    profile: items[0].profile,
    phase: items[0].phase,
    comparisonKey: items[0].comparisonKey,
    samples: items.length,
    distinctFingerprints: new Set(items.map((item) => item.fingerprint)).size,
  })).sort((left, right) => (
    left.profile.localeCompare(right.profile)
    || left.phase.localeCompare(right.phase)
    || left.comparisonKey.localeCompare(right.comparisonKey)
  ));
}

function percentileSummary(samples: readonly number[]): NarrativeBenchmarkPercentilesV6 {
  return {
    samples: samples.length,
    p50Ms: narrativeBenchmarkPercentileV6(samples, 0.5),
    p95Ms: narrativeBenchmarkPercentileV6(samples, 0.95),
  };
}

function assessQuality(quality: NarrativeBenchmarkQualityV6): string[] {
  const reasons: string[] = [];
  if (quality.totalMutations !== 8 || quality.detectedMutations !== 8) {
    reasons.push(`mutation detection was ${quality.detectedMutations}/${quality.totalMutations}, expected 8/8`);
  }
  if (quality.hardFactualWarnings !== 0) reasons.push('hard factual warnings were present');
  if (!quality.dossierComparable) reasons.push('research dossier was not comparable');
  if (quality.disputedInterpretationsWithSingleSource !== 0) {
    reasons.push('a disputed interpretation depended on one source');
  }
  return reasons;
}

function validateOptions(options: NarrativeBenchmarkOptionsV6): void {
  if (options.profiles.length === 0 || new Set(options.profiles).size !== options.profiles.length) {
    throw new Error('benchmark profiles must be non-empty and unique');
  }
  for (const profile of options.profiles) {
    if (!NARRATIVE_BENCHMARK_PROFILES_V6.includes(profile)) {
      throw new Error(`unknown narrative benchmark profile: ${profile}`);
    }
  }
  if (!Number.isInteger(options.repetitions) || options.repetitions < 1) {
    throw new Error('benchmark repetitions must be a positive integer');
  }
  assertPositiveFinite(options.maxSpendUsd, 'benchmark max spend');
  if (options.maxSpendUsd > 2) throw new Error('benchmark max spend must not exceed 2');
  if (options.maxSpendUsd < NARRATIVE_BENCHMARK_PRIOR_SPEND_USD_V6) {
    throw new Error('benchmark max spend does not cover the prior billed spend');
  }
  if (!options.fixture.trim()) throw new Error('benchmark fixture must not be empty');
}

function validateCall(call: NarrativeBenchmarkCallV6): void {
  if (!call.id.trim() || !call.phase.trim() || !call.comparisonKey.trim() || !call.modelKey.trim()) {
    throw new NarrativeBenchmarkProtocolErrorV6('benchmark call identifiers must not be empty');
  }
  if (!Number.isInteger(call.maximumInputTokens) || call.maximumInputTokens < 0) {
    throw new NarrativeBenchmarkProtocolErrorV6('maximum input tokens must be non-negative');
  }
  if (!Number.isInteger(call.maximumOutputTokens) || call.maximumOutputTokens < 1) {
    throw new NarrativeBenchmarkProtocolErrorV6('maximum output tokens must be positive');
  }
  if (call.temperature !== undefined && !Number.isFinite(call.temperature)) {
    throw new NarrativeBenchmarkProtocolErrorV6('benchmark call temperature must be finite');
  }
  sha256Fingerprint(call.requestFingerprint, 'benchmark request fingerprint');
  sha256Fingerprint(call.schemaFingerprint, 'benchmark schema fingerprint');
  sha256Fingerprint(call.configurationFingerprint, 'benchmark configuration fingerprint');
}

function validateInvocationResult(result: NarrativeBenchmarkInvocationResultV6): void {
  assertNonNegativeFinite(result.actualCostUsd, 'actual call cost');
  if (!Array.isArray(result.attempts) || result.attempts.length === 0) {
    throw new NarrativeBenchmarkProtocolErrorV6('benchmark call returned no attempt metrics');
  }
  const allowedRetryReasons: NarrativeBenchmarkRetryReasonV6[] = [
    'timeout', 'http_408', 'http_429', 'http_5xx', 'json_invalid', 'schema_invalid',
  ];
  for (const [index, attempt] of result.attempts.entries()) {
    assertNonNegativeFinite(attempt.durationMs, 'call duration');
    assertNonNegativeFinite(attempt.costUsd, 'attempt cost');
    if (typeof attempt.schemaValid !== 'boolean') {
      throw new NarrativeBenchmarkProtocolErrorV6('call schema status must be boolean');
    }
    if (index === 0 && attempt.reason !== 'initial') {
      throw new NarrativeBenchmarkProtocolErrorV6('first attempt reason must be initial');
    }
    if (index > 0 && !allowedRetryReasons.includes(attempt.reason)) {
      throw new NarrativeBenchmarkProtocolErrorV6('retry reason was not allowed');
    }
  }
  const attemptCost = result.attempts.reduce((sum, attempt) => sum + attempt.costUsd, 0);
  if (Math.abs(attemptCost - result.actualCostUsd) > 1e-8) {
    throw new NarrativeBenchmarkProtocolErrorV6('actual cost did not equal summed attempt costs');
  }
  if (typeof result.protocolValid !== 'boolean' || typeof result.fallbackUsed !== 'boolean') {
    throw new NarrativeBenchmarkProtocolErrorV6('call protocol flags must be boolean');
  }
}

const REQUIRED_BENCHMARK_PHASES_V6 = [
  'planner', 'curator', 'architect', 'writer',
  'auditor_a', 'auditor_b', 'global_auditor',
] as const;

function canonicalConfigurationReason(options: NarrativeBenchmarkOptionsV6): string | undefined {
  const profiles = new Set(options.profiles);
  if (profiles.size !== 2 || NARRATIVE_BENCHMARK_PROFILES_V6.some((profile) => !profiles.has(profile))) {
    return 'ready requires both canonical profiles';
  }
  if (options.repetitions !== 3) return 'ready requires exactly three repetitions';
  if (options.fixture !== 'madrid') return 'ready requires the frozen madrid fixture';
  return undefined;
}

const NARRATIVE_BENCHMARK_PREFLIGHT_REASON_CODES_V6 = [
  'catalog_unavailable', 'fixture_missing', 'gate_a_missing', 'snapshot_missing',
  'model_endpoint_unsupported', 'protocol_mismatch',
] as const;

function runtimeObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new NarrativeBenchmarkProtocolErrorV6(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function runtimeExactKeys(
  value: Record<string, unknown>,
  expected: readonly string[],
  label: string
): void {
  if (Object.keys(value).sort().join('\n') !== [...expected].sort().join('\n')) {
    throw new NarrativeBenchmarkProtocolErrorV6(`${label} has unexpected or missing fields`);
  }
}

function sha256Fingerprint(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new NarrativeBenchmarkProtocolErrorV6(`${label} must be a SHA-256 fingerprint`);
  }
  return value;
}

function normalizePublicPreflight(value: unknown): NarrativeBenchmarkPreflightV6 {
  const root = runtimeObject(value, 'benchmark preflight');
  if (root.status === 'protocol_failed') {
    runtimeExactKeys(root, ['status', 'reasonCode'], 'failed benchmark preflight');
    if (!NARRATIVE_BENCHMARK_PREFLIGHT_REASON_CODES_V6.includes(
      root.reasonCode as typeof NARRATIVE_BENCHMARK_PREFLIGHT_REASON_CODES_V6[number]
    )) {
      throw new NarrativeBenchmarkProtocolErrorV6('benchmark preflight reason code is invalid');
    }
    return {
      status: 'protocol_failed',
      reasonCode: root.reasonCode as NarrativeBenchmarkPreflightV6['reasonCode'],
    };
  }
  if (root.status !== 'ready') {
    throw new NarrativeBenchmarkProtocolErrorV6('benchmark preflight status is invalid');
  }
  runtimeExactKeys(root, [
    'status', 'fingerprint', 'fixtureFingerprint', 'inputFingerprint',
    'snapshotFingerprint', 'frozenGateFingerprints', 'requiredSmokeModelKeys', 'costPolicy',
  ], 'ready benchmark preflight');
  const frozenGateFingerprintsValue = runtimeObject(
    root.frozenGateFingerprints,
    'benchmark preflight frozen gates'
  );
  runtimeExactKeys(
    frozenGateFingerprintsValue,
    NARRATIVE_BENCHMARK_PROFILES_V6,
    'benchmark preflight frozen gates'
  );
  const frozenGateFingerprints = Object.fromEntries(
    NARRATIVE_BENCHMARK_PROFILES_V6.map((profile) => [
      profile,
      sha256Fingerprint(frozenGateFingerprintsValue[profile], `${profile} Gate A fingerprint`),
    ])
  ) as Record<NarrativeBenchmarkProfileV6, string>;
  if (!Array.isArray(root.requiredSmokeModelKeys)
    || root.requiredSmokeModelKeys.length === 0
    || root.requiredSmokeModelKeys.some((key) => typeof key !== 'string' || !key.trim())
    || new Set(root.requiredSmokeModelKeys).size !== root.requiredSmokeModelKeys.length) {
    throw new NarrativeBenchmarkProtocolErrorV6(
      'benchmark preflight requires unique exact model smoke keys'
    );
  }
  const costPolicyValue = runtimeObject(root.costPolicy, 'benchmark preflight cost policy');
  const costPolicy = Object.fromEntries(Object.entries(costPolicyValue).map(([modelKey, rowValue]) => {
    if (!modelKey.trim()) throw new NarrativeBenchmarkProtocolErrorV6('cost model key is empty');
    const row = runtimeObject(rowValue, `benchmark cost policy ${modelKey}`);
    runtimeExactKeys(row, ['inputUsdPerToken', 'outputUsdPerToken'], `benchmark cost policy ${modelKey}`);
    assertNonNegativeFinite(row.inputUsdPerToken as number, `${modelKey} input price`);
    assertNonNegativeFinite(row.outputUsdPerToken as number, `${modelKey} output price`);
    return [modelKey, {
      inputUsdPerToken: row.inputUsdPerToken as number,
      outputUsdPerToken: row.outputUsdPerToken as number,
    }];
  }));
  for (const modelKey of root.requiredSmokeModelKeys as string[]) {
    if (!costPolicy[modelKey]) {
      throw new NarrativeBenchmarkProtocolErrorV6(`cost policy omitted smoke model ${modelKey}`);
    }
  }
  return {
    status: 'ready',
    fingerprint: sha256Fingerprint(root.fingerprint, 'preflight fingerprint'),
    fixtureFingerprint: sha256Fingerprint(root.fixtureFingerprint, 'fixture fingerprint'),
    inputFingerprint: sha256Fingerprint(root.inputFingerprint, 'input fingerprint'),
    snapshotFingerprint: sha256Fingerprint(root.snapshotFingerprint, 'snapshot fingerprint'),
    frozenGateFingerprints,
    requiredSmokeModelKeys: [...root.requiredSmokeModelKeys as string[]],
    costPolicy,
  };
}

export function maximumNarrativeBenchmarkCallCostUsdV6(
  preflight: NarrativeBenchmarkPreflightV6,
  input: NarrativeBenchmarkCostPolicyInputV6
): number {
  const price = preflight.costPolicy?.[input.modelKey];
  if (!price) {
    throw new NarrativeBenchmarkProtocolErrorV6(
      `benchmark cost policy omitted exact model ${input.modelKey}`
    );
  }
  if (!Number.isInteger(input.maximumInputTokens) || input.maximumInputTokens < 0
    || !Number.isInteger(input.maximumOutputTokens) || input.maximumOutputTokens < 1
    || input.maximumAttempts !== 2) {
    throw new NarrativeBenchmarkProtocolErrorV6('benchmark maximum token or attempt policy is invalid');
  }
  const maximum = input.maximumAttempts * (
    input.maximumInputTokens * price.inputUsdPerToken
    + input.maximumOutputTokens * price.outputUsdPerToken
  );
  assertPositiveFinite(maximum, 'policy maximum call cost');
  return maximum;
}

function validateReadyPreflight(preflight: NarrativeBenchmarkPreflightV6): string | undefined {
  if (preflight.status !== 'ready') return undefined;
  for (const [name, value] of Object.entries({
    preflight: preflight.fingerprint,
    fixture: preflight.fixtureFingerprint,
    input: preflight.inputFingerprint,
    snapshot: preflight.snapshotFingerprint,
  })) {
    if (typeof value !== 'string' || value.trim().length === 0) {
      return `ready preflight omitted ${name} fingerprint`;
    }
  }
  for (const profile of NARRATIVE_BENCHMARK_PROFILES_V6) {
    if (!preflight.frozenGateFingerprints?.[profile]) {
      return `ready preflight omitted approved Gate A for ${profile}`;
    }
  }
  return undefined;
}

function validateModelOutcome(
  profile: NarrativeBenchmarkProfileV6,
  result: NarrativeBenchmarkInvocationResultV6
): void {
  if (!result.protocolValid) {
    throw new NarrativeBenchmarkCalibrationErrorV6(
      `${profile} returned an invalid model protocol response`
    );
  }
  if (result.fallbackUsed) {
    throw new NarrativeBenchmarkCalibrationErrorV6(`${profile} depended on a provider fallback`);
  }
  if (result.attempts.length > 2) {
    throw new NarrativeBenchmarkCalibrationErrorV6(`${profile} exceeded one application retry`);
  }
  if (!result.attempts[result.attempts.length - 1].schemaValid) {
    throw new NarrativeBenchmarkCalibrationErrorV6(`${profile} returned no schema-valid response`);
  }
}

function validatePaidSmokes(calls: readonly RecordedCallV6[], requiredModelKeys: string[]): void {
  const smokeCalls = calls.filter((call) => call.purpose === 'smoke');
  const counts = new Map<string, number>();
  for (const call of smokeCalls) counts.set(call.modelKey, (counts.get(call.modelKey) ?? 0) + 1);
  if (smokeCalls.length !== requiredModelKeys.length
    || requiredModelKeys.some((key) => counts.get(key) !== 1)
    || smokeCalls.some((call) => !requiredModelKeys.includes(call.modelKey))) {
    throw new NarrativeBenchmarkProtocolErrorV6(
      'paid smokes must make exactly one budgeted call per exact model'
    );
  }
}

function validateTourInvariants(
  tour: NarrativeBenchmarkTourResultV6,
  preflight: NarrativeBenchmarkPreflightV6,
  calls: readonly RecordedCallV6[],
  profile: NarrativeBenchmarkProfileV6
): void {
  if (calls.length === 0) throw new NarrativeBenchmarkProtocolErrorV6('tour recorded no calls');
  for (const phase of REQUIRED_BENCHMARK_PHASES_V6) {
    if (!calls.some((call) => call.phase === phase)) {
      throw new NarrativeBenchmarkProtocolErrorV6(`${profile} tour omitted required phase ${phase}`);
    }
  }
  const expected: NarrativeBenchmarkInputFingerprintsV6 = {
    fixture: preflight.fixtureFingerprint as string,
    input: preflight.inputFingerprint as string,
    snapshot: preflight.snapshotFingerprint as string,
  };
  if (tour.fingerprints.fixture !== expected.fixture
    || tour.fingerprints.input !== expected.input
    || tour.fingerprints.snapshot !== expected.snapshot) {
    throw new NarrativeBenchmarkProtocolErrorV6('tour input or snapshot fingerprints changed');
  }
  if (typeof tour.reusedFrozenGate !== 'boolean'
    || tour.gateFingerprint !== preflight.frozenGateFingerprints?.[profile]) {
    throw new NarrativeBenchmarkProtocolErrorV6('approved Gate A fingerprint did not match');
  }
}

function compareRepetitionCallContracts(
  calls: readonly RecordedCallV6[],
  options: NarrativeBenchmarkOptionsV6
): string | undefined {
  for (const profile of options.profiles) {
    const contracts = new Map<string, string>();
    for (let repetition = 1; repetition <= options.repetitions; repetition += 1) {
      const repetitionCalls = calls.filter((call) => call.purpose === 'benchmark'
        && call.profile === profile && call.repetition === repetition);
      for (const call of repetitionCalls) {
        const key = `${call.phase}\u0000${call.comparisonKey}`;
        const contract = [
          call.modelKey,
          call.temperature ?? 'omitted',
          call.schemaFingerprint,
          call.configurationFingerprint,
        ].join('\u0000');
        const prior = contracts.get(key);
        if (prior !== undefined && prior !== contract) {
          return `${profile} call contract changed between repetitions for ${call.phase}`;
        }
        contracts.set(key, contract);
      }
    }
  }
  return undefined;
}

function safeBenchmarkError(error: unknown, fallback: string): string {
  return error instanceof NarrativeBenchmarkCalibrationErrorV6 ? error.message : fallback;
}

function abortable<T>(promise: Promise<T>, signal?: AbortSignal): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) return Promise.reject(signal.reason ?? new Error('benchmark aborted'));
  return new Promise<T>((resolve, reject) => {
    const onAbort = (): void => reject(signal.reason ?? new Error('benchmark aborted'));
    signal.addEventListener('abort', onAbort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', onAbort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', onAbort);
        reject(error);
      }
    );
  });
}

function validateQuality(quality: NarrativeBenchmarkQualityV6): void {
  for (const [name, value] of Object.entries({
    detectedMutations: quality.detectedMutations,
    totalMutations: quality.totalMutations,
    hardFactualWarnings: quality.hardFactualWarnings,
    disputedInterpretationsWithSingleSource: quality.disputedInterpretationsWithSingleSource,
  })) {
    if (!Number.isInteger(value) || value < 0) {
      throw new NarrativeBenchmarkProtocolErrorV6(`${name} must be a non-negative integer`);
    }
  }
  if (typeof quality.dossierComparable !== 'boolean') {
    throw new NarrativeBenchmarkProtocolErrorV6('dossierComparable must be boolean');
  }
}

function argumentValue(args: readonly string[], flag: string): string | undefined {
  const exact = args.find((argument) => argument.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = args.indexOf(flag);
  if (index < 0) return undefined;
  const value = args[index + 1];
  if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
  return value;
}

function validateKnownArguments(args: readonly string[]): void {
  const valueFlags = new Set([
    '--profiles', '--repetitions', '--max-spend-usd', '--fixture', '--runner-module',
    '--spend-ledger',
  ]);
  const booleanFlags = new Set(['--allow-external']);
  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    const equals = argument.indexOf('=');
    const flag = equals < 0 ? argument : argument.slice(0, equals);
    if (!valueFlags.has(flag) && !booleanFlags.has(flag)) {
      throw new Error(`unknown narrative benchmark argument: ${argument}`);
    }
    if (booleanFlags.has(flag) && equals >= 0) throw new Error(`${flag} does not accept a value`);
    if (valueFlags.has(flag) && equals < 0) {
      const value = args[index + 1];
      if (value === undefined || value.startsWith('--')) throw new Error(`${flag} requires a value`);
      index += 1;
    }
  }
}

function fingerprintJson(value: unknown): string {
  return createHash('sha256').update(canonicalJson(value)).digest('hex');
}

function canonicalJson(value: unknown, ancestors: Set<object> = new Set()): string {
  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new NarrativeBenchmarkProtocolErrorV6('fingerprint value was not JSON-safe');
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    if (ancestors.has(value)) throw new NarrativeBenchmarkProtocolErrorV6('fingerprint value was cyclic');
    const next = new Set(ancestors).add(value);
    return `[${value.map((item) => canonicalJson(item, next)).join(',')}]`;
  }
  if (typeof value === 'object') {
    if (ancestors.has(value)) throw new NarrativeBenchmarkProtocolErrorV6('fingerprint value was cyclic');
    const next = new Set(ancestors).add(value);
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${canonicalJson(item, next)}`).join(',')}}`;
  }
  throw new NarrativeBenchmarkProtocolErrorV6('fingerprint value was not JSON-safe');
}

function assertPositiveFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be positive and finite`);
}

function assertNonNegativeFinite(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new NarrativeBenchmarkProtocolErrorV6(`${name} must be non-negative and finite`);
  }
}
