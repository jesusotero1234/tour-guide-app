import 'dotenv/config';
import { resolve } from 'path';
import {
  NARRATIVE_WRITER_BENCHMARK_CALL_RESERVATION_USD_V8,
  NARRATIVE_WRITER_BENCHMARK_TOTAL_CAP_USD_V8,
  NarrativeWriterBenchmarkAssignmentV8,
  assertNarrativeWriterBenchmarkBudgetV8,
  blindNarrativeWriterBenchmarkArmsV8,
} from '../../src/services/poi/NarrativeWriterBenchmarkV8';

const DEFAULT_CHECKPOINT = resolve(
  __dirname,
  '../../tmp/narrative-v8/madrid-v8-richness-complete-20260903-31/checkpoint.private.json'
);
const DEFAULT_STOP_IDS = ['Q1123493', 'Q1537446'] as const;

export interface NarrativeWriterBenchmarkArgsV8 {
  execute: boolean;
  checkpoint: string;
  stopIds: string[];
  seed: string;
  priorSpendUsd: number;
  runId: string;
}

export interface NarrativeWriterBenchmarkPlanV8 {
  assignments: NarrativeWriterBenchmarkAssignmentV8[];
  plannedCalls: number;
  maximumReservedSpendUsd: number;
}

export interface NarrativeWriterBenchmarkPrivateResultV8 {
  armId: 'A' | 'B' | 'C' | 'D';
  stopId: string;
  model: string;
  actualModel: string | null;
  actualProvider: string | null;
  text: string | null;
  textFile: string;
  status: string;
  schemaPassed: boolean;
  lengthPassed: boolean;
  oneShotPassed: boolean;
  wordCount: number | null;
  coverage: number | null;
  retryCount: number;
  costUsd: number;
  providerCostVerified: boolean;
  latencyMs: number;
}

export interface NarrativeWriterBenchmarkPrivateSummaryV8 {
  runId: string;
  sourceCheckpoint: string;
  priorSpendUsd: number;
  spentUsd: number;
  results: NarrativeWriterBenchmarkPrivateResultV8[];
}

export interface NarrativeWriterBenchmarkPublicResultV8 {
  armId: 'A' | 'B' | 'C' | 'D';
  stopId: string;
  textFile: string;
  status: string;
  schemaPassed: boolean;
  lengthPassed: boolean;
  oneShotPassed: boolean;
  wordCount: number | null;
  coverage: number | null;
  retryCount: number;
  costUsd: number;
  providerCostVerified: boolean;
  latencyMs: number;
}

function optionValue(argv: string[], name: string): string | undefined {
  const matches = argv.filter((argument) => argument.startsWith(`${name}=`));
  if (matches.length > 1) throw new Error(`duplicate option ${name}`);
  return matches[0]?.slice(name.length + 1);
}

export function parseNarrativeWriterBenchmarkArgsV8(
  argv: string[]
): NarrativeWriterBenchmarkArgsV8 {
  const known = new Set([
    '--execute', '--checkpoint', '--stop-ids', '--seed', '--prior-spend-usd', '--run-id',
  ]);
  for (const argument of argv) {
    const name = argument.split('=', 1)[0];
    if (!known.has(name)) throw new Error(`unknown benchmark argument ${argument}`);
    if (name !== '--execute' && !argument.includes('=')) {
      throw new Error(`benchmark option requires a value: ${name}`);
    }
  }

  const priorSpendUsd = Number(optionValue(argv, '--prior-spend-usd') ?? 0);
  if (!Number.isFinite(priorSpendUsd) || priorSpendUsd < 0) {
    throw new Error('prior spend must be a finite non-negative number');
  }
  const stopIdsValue = optionValue(argv, '--stop-ids');
  const stopIds = stopIdsValue === undefined
    ? [...DEFAULT_STOP_IDS]
    : stopIdsValue.split(',').map((value) => value.trim()).filter(Boolean);
  if (stopIds.length === 0) throw new Error('stop ids must not be empty');
  if (new Set(stopIds).size !== stopIds.length) throw new Error('stop ids must be unique');

  const seed = optionValue(argv, '--seed') ?? 'madrid-writer-benchmark-v8';
  const runId = optionValue(argv, '--run-id') ?? 'madrid-writer-benchmark-v8-20260904';
  if (!seed.trim()) throw new Error('benchmark seed must not be empty');
  if (!runId.trim()) throw new Error('benchmark run id must not be empty');

  return {
    execute: argv.includes('--execute'),
    checkpoint: resolve(optionValue(argv, '--checkpoint') ?? DEFAULT_CHECKPOINT),
    stopIds,
    seed,
    priorSpendUsd,
    runId,
  };
}

export function buildNarrativeWriterBenchmarkPlanV8(
  stopIds: string[],
  seed: string,
  priorSpendUsd: number
): NarrativeWriterBenchmarkPlanV8 {
  const assignments = blindNarrativeWriterBenchmarkArmsV8(seed);
  const plannedCalls = stopIds.length * assignments.length;
  const maximumReservedSpendUsd = plannedCalls
    * NARRATIVE_WRITER_BENCHMARK_CALL_RESERVATION_USD_V8;
  assertNarrativeWriterBenchmarkBudgetV8(priorSpendUsd, maximumReservedSpendUsd);
  return { assignments, plannedCalls, maximumReservedSpendUsd };
}

export function buildPublicNarrativeWriterBenchmarkSummaryV8(
  input: NarrativeWriterBenchmarkPrivateSummaryV8
): {
  runId: string;
  priorSpendUsd: number;
  spentUsd: number;
  totalCapUsd: number;
  results: NarrativeWriterBenchmarkPublicResultV8[];
} {
  return {
    runId: input.runId,
    priorSpendUsd: input.priorSpendUsd,
    spentUsd: input.spentUsd,
    totalCapUsd: NARRATIVE_WRITER_BENCHMARK_TOTAL_CAP_USD_V8,
    results: input.results.map((result) => ({
      armId: result.armId,
      stopId: result.stopId,
      textFile: result.textFile,
      status: result.status,
      schemaPassed: result.schemaPassed,
      lengthPassed: result.lengthPassed,
      oneShotPassed: result.oneShotPassed,
      wordCount: result.wordCount,
      coverage: result.coverage,
      retryCount: result.retryCount,
      costUsd: result.costUsd,
      providerCostVerified: result.providerCostVerified,
      latencyMs: result.latencyMs,
    })),
  };
}

async function main(): Promise<void> {
  const args = parseNarrativeWriterBenchmarkArgsV8(process.argv.slice(2));
  const plan = buildNarrativeWriterBenchmarkPlanV8(args.stopIds, args.seed, args.priorSpendUsd);
  if (args.execute) {
    throw new Error('paid benchmark execution is not implemented in this slice');
  }
  // Model identities intentionally remain in the private plan only.
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    mode: 'dry-run',
    runId: args.runId,
    stopIds: args.stopIds,
    armIds: plan.assignments.map((assignment) => assignment.armId),
    plannedCalls: plan.plannedCalls,
    maximumReservedSpendUsd: plan.maximumReservedSpendUsd,
    totalCapUsd: NARRATIVE_WRITER_BENCHMARK_TOTAL_CAP_USD_V8,
    paidCalls: 0,
  }, null, 2));
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    // eslint-disable-next-line no-console
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
