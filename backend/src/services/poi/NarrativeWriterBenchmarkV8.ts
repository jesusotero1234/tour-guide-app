import { createHash } from 'crypto';

export interface NarrativeWriterBenchmarkArmV8 {
  model: string;
  acceptedModels: string[];
  inputUsdPerMillion: number;
  outputUsdPerMillion: number;
}

export const NARRATIVE_WRITER_BENCHMARK_ARMS_V8: readonly NarrativeWriterBenchmarkArmV8[] = [
  {
    model: 'openai/gpt-5.4-mini',
    acceptedModels: ['openai/gpt-5.4-mini-20260317'],
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 4.5,
  },
  {
    model: 'openai/gpt-5.4',
    acceptedModels: ['openai/gpt-5.4-20260305'],
    inputUsdPerMillion: 2.5,
    outputUsdPerMillion: 15,
  },
  {
    model: 'anthropic/claude-sonnet-5',
    acceptedModels: ['anthropic/claude-sonnet-5-20260630'],
    inputUsdPerMillion: 2,
    outputUsdPerMillion: 10,
  },
  {
    model: 'google/gemini-3.8-flash',
    acceptedModels: ['google/gemini-3.8-flash-20260902'],
    inputUsdPerMillion: 0.75,
    outputUsdPerMillion: 3.75,
  },
  {
    model: 'deepseek/deepseek-r1',
    acceptedModels: ['deepseek/deepseek-r1'],
    inputUsdPerMillion: 0.70,
    outputUsdPerMillion: 2.50,
  },
  {
    model: 'qwen/qwen3-235b-a22b-thinking-2507',
    acceptedModels: ['qwen/qwen3-235b-a22b-thinking-2507'],
    inputUsdPerMillion: 0.45,
    outputUsdPerMillion: 3.50,
  },
  {
    model: 'minimax/minimax-m2',
    acceptedModels: ['minimax/minimax-m2'],
    inputUsdPerMillion: 0.30,
    outputUsdPerMillion: 1.20,
  },
  {
    model: 'anthropic/claude-sonnet-4',
    acceptedModels: ['anthropic/claude-4-sonnet-20250522', 'anthropic/claude-sonnet-4'],
    inputUsdPerMillion: 3,
    outputUsdPerMillion: 15,
  },
  {
    model: 'google/gemini-2.5-pro',
    acceptedModels: ['google/gemini-2.5-pro'],
    inputUsdPerMillion: 1.25,
    outputUsdPerMillion: 10,
  },
] as const;

export const NARRATIVE_WRITER_BENCHMARK_TOTAL_CAP_USD_V8 = 2;
export const NARRATIVE_WRITER_BENCHMARK_CALL_RESERVATION_USD_V8 = 0.2;

export type NarrativeWriterBenchmarkArmIdV8 = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G' | 'H' | 'I';

export interface NarrativeWriterBenchmarkAssignmentV8 {
  armId: NarrativeWriterBenchmarkArmIdV8;
  arm: NarrativeWriterBenchmarkArmV8;
}

export function blindNarrativeWriterBenchmarkArmsV8(seed: string): NarrativeWriterBenchmarkAssignmentV8[] {
  if (!seed) throw new Error('benchmark seed must not be empty');
  const originalArms = NARRATIVE_WRITER_BENCHMARK_ARMS_V8.slice(0, 4);
  const candidateArms = NARRATIVE_WRITER_BENCHMARK_ARMS_V8.slice(4, 9);

  const blindCohort = (cohort: readonly NarrativeWriterBenchmarkArmV8[], ids: NarrativeWriterBenchmarkArmIdV8[]): NarrativeWriterBenchmarkAssignmentV8[] => {
    const arms = cohort.map((arm) => ({
      arm,
      key: createHash('sha256').update(`${seed}:${arm.model}`).digest('hex'),
    }));
    arms.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
    return arms.map((entry, index) => ({ armId: ids[index], arm: entry.arm }));
  };

  const originalAssignments = blindCohort(originalArms, ['A', 'B', 'C', 'D']);
  const candidateAssignments = blindCohort(candidateArms, ['E', 'F', 'G', 'H', 'I']);

  return [...originalAssignments, ...candidateAssignments];
}

export interface NarrativeWriterBenchmarkRequestV8 {
  provider: {
    kind: 'openrouter';
    model: string;
    acceptedModels: string[];
    zeroDataRetention: true;
  };
  options: {
    reasoning: 'low';
    maxTokens: 4_000;
    requestAttempts: 1;
    rateLimitAttempts: 1;
    includePreviousResponseOnSemanticRetry: false;
    disableOpenRouterCache: true;
    phase: 'writer_benchmark';
    runId: string;
    stopId: string;
  };
}

export function buildNarrativeWriterBenchmarkRequestV8(
  arm: NarrativeWriterBenchmarkArmV8,
  runId: string,
  stopId: string
): NarrativeWriterBenchmarkRequestV8 {
  return {
    provider: {
      kind: 'openrouter',
      model: arm.model,
      acceptedModels: arm.acceptedModels,
      zeroDataRetention: true,
    },
    options: {
      reasoning: 'low',
      maxTokens: 4_000,
      requestAttempts: 1,
      rateLimitAttempts: 1,
      includePreviousResponseOnSemanticRetry: false,
      disableOpenRouterCache: true,
      phase: 'writer_benchmark',
      runId,
      stopId,
    },
  };
}

export function assertNarrativeWriterBenchmarkBudgetV8(
  spentUsd: number,
  reservationUsd: number
): void {
  if (!Number.isFinite(spentUsd) || spentUsd < 0
    || !Number.isFinite(reservationUsd) || reservationUsd < 0) {
    throw new Error('benchmark budget values must be finite and non-negative');
  }
  if (spentUsd + reservationUsd > NARRATIVE_WRITER_BENCHMARK_TOTAL_CAP_USD_V8) {
    throw new Error('benchmark budget exceeded');
  }
}

export interface NarrativeWriterBenchmarkUsageV8 {
  inputTokens: number;
  outputTokens: number;
  costUsd?: number;
}

export interface NarrativeWriterBenchmarkCostV8 {
  costUsd: number;
  providerVerified: boolean;
}

export function resolveNarrativeWriterBenchmarkCostV8(
  arm: NarrativeWriterBenchmarkArmV8,
  usage: NarrativeWriterBenchmarkUsageV8
): NarrativeWriterBenchmarkCostV8 {
  if (typeof usage.costUsd === 'number' && Number.isFinite(usage.costUsd) && usage.costUsd >= 0) {
    return { costUsd: usage.costUsd, providerVerified: true };
  }
  const costUsd = (
    usage.inputTokens * arm.inputUsdPerMillion
    + usage.outputTokens * arm.outputUsdPerMillion
  ) / 1_000_000;
  return { costUsd, providerVerified: false };
}

export interface NarrativeWriterBenchmarkResultV8 {
  status: 'valid' | 'transport_error' | 'malformed_response' | 'semantic_error' | 'protocol_failed';
  schemaValid: boolean;
  wordCount: number;
  minimumWords: number;
  maximumWords: number;
  retryCount: number;
}

export interface NarrativeWriterBenchmarkEvaluationV8 {
  schemaPassed: boolean;
  lengthPassed: boolean;
  oneShotPassed: boolean;
}

export function evaluateNarrativeWriterBenchmarkResultV8(
  result: NarrativeWriterBenchmarkResultV8
): NarrativeWriterBenchmarkEvaluationV8 {
  const schemaPassed = result.status === 'valid' && result.schemaValid;
  const lengthPassed = Number.isFinite(result.wordCount)
    && result.wordCount >= result.minimumWords
    && result.wordCount <= result.maximumWords;
  const oneShotPassed = schemaPassed && lengthPassed && result.retryCount === 0;
  return { schemaPassed, lengthPassed, oneShotPassed };
}
