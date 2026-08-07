import 'dotenv/config';
import { createHash } from 'crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import {
  DEEPSEEK_SPEND_CAP_USD,
  EDITORIAL_BENCHMARK_PROVIDERS,
  EDITORIAL_BENCHMARK_VERSION,
  EditorialBenchmarkCallResult,
  EditorialBenchmarkCaseEvaluation,
  EditorialBenchmarkProvider,
  EditorialBenchmarkProviderId,
  editorialBenchmarkInputFingerprint,
  editorialBenchmarkPromptFingerprint,
  editorialBenchmarkSchemaFingerprint,
  essentialSetJaccard,
  estimateMaximumDeepSeekCallCost,
  evaluateEditorialBenchmarkCase,
  requestEditorialBenchmarkBrief,
} from '../../src/services/poi/EditorialCuratorBenchmark';
import { loadEditorialEvaluationInput } from '../../src/services/poi/EditorialEvaluationInput';
import {
  LoadedEditorialEvaluationCase,
  loadEditorialEvaluationCases,
} from '../../src/services/poi/EditorialEvaluationManifest';

type BenchmarkStage = 'pilot' | 'all';

interface BenchmarkCaseArtifact {
  benchmarkVersion: typeof EDITORIAL_BENCHMARK_VERSION;
  createdAt: string;
  stage: 'pilot' | 'calibration';
  repetition: number;
  provider: EditorialBenchmarkProvider;
  case: Pick<
    LoadedEditorialEvaluationCase,
    'id' | 'scope' | 'city' | 'theme' | 'language' | 'durationMinutes'
  >;
  fingerprints: {
    prompt: string;
    schema: string;
    input: string;
    selector: string;
  };
  input: Awaited<ReturnType<typeof loadEditorialEvaluationInput>>['request'];
  candidateSet: {
    prefiltered: number;
    accepted: number;
    sentToCurator: number;
    rejected: Record<string, number>;
  };
  curator: EditorialBenchmarkCallResult;
  evaluation: EditorialBenchmarkCaseEvaluation | null;
}

interface ProviderSummary {
  provider: EditorialBenchmarkProvider;
  pilot: {
    calls: number;
    valid: number;
    allRoutesPassed: boolean;
    minimumEssentialJaccard: number;
    stableAnchorCoverage: boolean;
    passed: boolean;
  };
  calibration: {
    calls: number;
    valid: number;
    gatesPassed: number;
    oracleCovered: number;
    oracleAvailable: number;
    passed: boolean;
  };
  totalLatencyMs: number;
  totalCostUsd: number;
  selected: boolean;
}

const fixtures = join(__dirname, '..', '..', 'fixtures');
const manifestPath = join(fixtures, 'oracle', 'editorial-v2-manifest.json');

function argumentValue(flag: string): string | undefined {
  const exact = process.argv.find((argument) => argument.startsWith(`${flag}=`));
  if (exact) return exact.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function sourceFingerprint(): string {
  const hash = createHash('sha256');
  for (const relativePath of [
    '../../src/services/poi/EditorialCandidate.ts',
    '../../src/services/poi/EditorialRouteBrief.ts',
    '../../src/services/poi/EditorialRouteOptimizer.ts',
    '../../src/services/poi/EditorialEvaluationInput.ts',
    '../../src/services/poi/EditorialCuratorBenchmark.ts',
    'benchmark-editorial-curators.ts',
  ]) {
    hash.update(readFileSync(join(__dirname, relativePath)));
  }
  return hash.digest('hex');
}

function selectedProviders(): EditorialBenchmarkProvider[] {
  const requested = argumentValue('--providers')?.split(',').filter(Boolean)
    ?? Object.keys(EDITORIAL_BENCHMARK_PROVIDERS);
  return requested.map((id) => {
    const provider = EDITORIAL_BENCHMARK_PROVIDERS[id as EditorialBenchmarkProviderId];
    if (!provider) throw new Error(`Unknown benchmark provider: ${id}`);
    return provider;
  });
}

function rejectedCounts(
  input: Awaited<ReturnType<typeof loadEditorialEvaluationInput>>
): Record<string, number> {
  return input.candidateSet.rejected.reduce<Record<string, number>>((counts, rejection) => {
    counts[rejection.reason] = (counts[rejection.reason] ?? 0) + 1;
    return counts;
  }, {});
}

function minimumJaccard(artifacts: BenchmarkCaseArtifact[]): number {
  const briefs = artifacts
    .map((artifact) => artifact.curator.brief)
    .filter((brief): brief is NonNullable<typeof brief> => brief !== null);
  if (briefs.length < 2) return briefs.length === artifacts.length ? 1 : 0;
  let minimum = 1;
  for (let left = 0; left < briefs.length; left += 1) {
    for (let right = left + 1; right < briefs.length; right += 1) {
      minimum = Math.min(minimum, essentialSetJaccard(briefs[left], briefs[right]));
    }
  }
  return minimum;
}

function stableAnchorCoverage(artifacts: BenchmarkCaseArtifact[]): boolean {
  if (artifacts.length === 0 || artifacts.some((artifact) => artifact.evaluation === null)) return false;
  const signatures = artifacts.map((artifact) => (
    artifact.evaluation?.routeOracleIds.slice().sort().join(',') ?? ''
  ));
  return new Set(signatures).size === 1;
}

function attemptLatency(result: EditorialBenchmarkCallResult): number {
  return result.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0);
}

async function main(): Promise<void> {
  const stage = (argumentValue('--stage') ?? 'all') as BenchmarkStage;
  if (stage !== 'pilot' && stage !== 'all') throw new Error('--stage must be pilot or all');
  const repetitions = Number(argumentValue('--repetitions') ?? '3');
  if (!Number.isInteger(repetitions) || repetitions < 1) {
    throw new Error('--repetitions must be a positive integer');
  }

  const providers = selectedProviders();
  const usesExternal = providers.some((provider) => provider.kind === 'deepseek');
  if (usesExternal && !hasFlag('--allow-external')) {
    throw new Error('DeepSeek benchmark requires explicit --allow-external authorization');
  }
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  if (usesExternal && !apiKey) throw new Error('DEEPSEEK_API_KEY is missing');

  const cases = loadEditorialEvaluationCases(manifestPath);
  if (cases.some((evaluationCase) => evaluationCase.scope !== 'calibration')) {
    throw new Error('Normal editorial benchmark must never load holdout cases');
  }
  const madrid = cases.find((evaluationCase) => evaluationCase.city === 'Madrid');
  if (!madrid) throw new Error('Madrid calibration case is missing');

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const runId = argumentValue('--run-id') ?? timestamp;
  const outputDirectory = join(fixtures, 'editorial-benchmarks', runId);
  if (existsSync(outputDirectory)) throw new Error(`Benchmark run already exists: ${runId}`);
  mkdirSync(outputDirectory, { recursive: true });
  const selectorHash = sourceFingerprint();
  const promptHash = editorialBenchmarkPromptFingerprint();
  const ollamaHost = argumentValue('--ollama-host') ?? process.env.OLLAMA_HOST ?? 'http://localhost:11434';
  let externalSpendUsd = 0;

  writeJson(join(outputDirectory, 'manifest.json'), {
    benchmarkVersion: EDITORIAL_BENCHMARK_VERSION,
    createdAt: new Date().toISOString(),
    stage,
    repetitions,
    providers,
    promptFingerprint: promptHash,
    selectorFingerprint: selectorHash,
    externalSpendCapUsd: DEEPSEEK_SPEND_CAP_USD,
    calibrationCaseIds: cases.map((evaluationCase) => evaluationCase.id),
    holdoutLoaded: false,
  });

  const allArtifacts: BenchmarkCaseArtifact[] = [];
  const executeCase = async (
    provider: EditorialBenchmarkProvider,
    evaluationCase: LoadedEditorialEvaluationCase,
    repetition: number,
    artifactStage: BenchmarkCaseArtifact['stage']
  ): Promise<BenchmarkCaseArtifact> => {
    const loaded = await loadEditorialEvaluationInput(evaluationCase, fixtures);
    if (provider.kind === 'deepseek') {
      const reservedCost = estimateMaximumDeepSeekCallCost(loaded.request) * 2;
      if (externalSpendUsd + reservedCost > DEEPSEEK_SPEND_CAP_USD) {
        throw new Error(`DeepSeek spend cap would be exceeded before ${evaluationCase.id}`);
      }
    }

    console.log(`[editorial-benchmark] ${artifactStage} ${provider.id} ${evaluationCase.id} run ${repetition}`);
    const curator = await requestEditorialBenchmarkBrief(loaded.request, provider, {
      apiKey,
      ollamaHost,
    });
    externalSpendUsd = Number((externalSpendUsd + curator.totalCostUsd).toFixed(8));
    const evaluation = curator.brief
      ? evaluateEditorialBenchmarkCase(evaluationCase, loaded.candidateSet, curator.brief)
      : null;
    const artifact: BenchmarkCaseArtifact = {
      benchmarkVersion: EDITORIAL_BENCHMARK_VERSION,
      createdAt: new Date().toISOString(),
      stage: artifactStage,
      repetition,
      provider,
      case: {
        id: evaluationCase.id,
        scope: evaluationCase.scope,
        city: evaluationCase.city,
        theme: evaluationCase.theme,
        language: evaluationCase.language,
        durationMinutes: evaluationCase.durationMinutes,
      },
      fingerprints: {
        prompt: promptHash,
        schema: editorialBenchmarkSchemaFingerprint(loaded.request),
        input: editorialBenchmarkInputFingerprint(loaded.request),
        selector: selectorHash,
      },
      input: loaded.request,
      candidateSet: {
        prefiltered: loaded.prefilteredCount,
        accepted: loaded.candidateSet.candidates.length,
        sentToCurator: loaded.request.candidates.length,
        rejected: rejectedCounts(loaded),
      },
      curator,
      evaluation,
    };
    const filename = `${artifactStage}-${provider.id}-${evaluationCase.id}-${repetition}.json`;
    writeJson(join(outputDirectory, filename), artifact);
    allArtifacts.push(artifact);
    console.log(`[editorial-benchmark] ${provider.id} ${evaluationCase.id}: ${curator.status}, gates=${evaluation?.gates.passed ?? false}, cost=$${curator.totalCostUsd.toFixed(6)}`);
    return artifact;
  };

  const pilotByProvider = new Map<EditorialBenchmarkProviderId, BenchmarkCaseArtifact[]>();
  for (const provider of providers) {
    const artifacts: BenchmarkCaseArtifact[] = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      artifacts.push(await executeCase(provider, madrid, repetition, 'pilot'));
    }
    pilotByProvider.set(provider.id, artifacts);
  }

  const pilotPassed = (provider: EditorialBenchmarkProvider): boolean => {
    const artifacts = pilotByProvider.get(provider.id) ?? [];
    return artifacts.length === repetitions
      && artifacts.every((artifact) => (
        artifact.curator.status === 'valid' && artifact.evaluation?.gates.passed === true
      ))
      && minimumJaccard(artifacts) >= 0.8
      && stableAnchorCoverage(artifacts);
  };
  const survivors = providers.filter(pilotPassed);

  if (stage === 'all') {
    for (const provider of survivors) {
      for (const evaluationCase of cases.filter((item) => item.id !== madrid.id)) {
        await executeCase(provider, evaluationCase, 1, 'calibration');
      }
    }
  }

  const summaries: ProviderSummary[] = providers.map((provider) => {
    const pilotArtifacts = pilotByProvider.get(provider.id) ?? [];
    const calibrationArtifacts = allArtifacts.filter((artifact) => (
      artifact.provider.id === provider.id && artifact.stage === 'calibration'
    ));
    const providerArtifacts = [...pilotArtifacts, ...calibrationArtifacts];
    const calibrationPassed = stage === 'all'
      && pilotPassed(provider)
      && calibrationArtifacts.length === cases.length - 1
      && calibrationArtifacts.every((artifact) => (
        artifact.curator.status === 'valid' && artifact.evaluation?.gates.passed === true
      ));
    return {
      provider,
      pilot: {
        calls: pilotArtifacts.length,
        valid: pilotArtifacts.filter((artifact) => artifact.curator.status === 'valid').length,
        allRoutesPassed: pilotArtifacts.every((artifact) => artifact.evaluation?.gates.passed === true),
        minimumEssentialJaccard: minimumJaccard(pilotArtifacts),
        stableAnchorCoverage: stableAnchorCoverage(pilotArtifacts),
        passed: pilotPassed(provider),
      },
      calibration: {
        calls: calibrationArtifacts.length,
        valid: calibrationArtifacts.filter((artifact) => artifact.curator.status === 'valid').length,
        gatesPassed: calibrationArtifacts.filter((artifact) => artifact.evaluation?.gates.passed === true).length,
        oracleCovered: calibrationArtifacts.reduce((sum, artifact) => (
          sum + (artifact.evaluation?.routeOracleIds.length ?? 0)
        ), 0),
        oracleAvailable: calibrationArtifacts.reduce((sum, artifact) => {
          const evaluationCase = cases.find((item) => item.id === artifact.case.id);
          return sum + (evaluationCase?.oracle.stops.length ?? 0);
        }, 0),
        passed: calibrationPassed,
      },
      totalLatencyMs: providerArtifacts.reduce((sum, artifact) => (
        sum + attemptLatency(artifact.curator)
      ), 0),
      totalCostUsd: Number(providerArtifacts.reduce((sum, artifact) => (
        sum + artifact.curator.totalCostUsd
      ), 0).toFixed(8)),
      selected: false,
    };
  });

  const eligible = summaries.filter((summary) => summary.calibration.passed);
  eligible.sort((left, right) => (
    right.calibration.oracleCovered - left.calibration.oracleCovered
    || left.totalLatencyMs - right.totalLatencyMs
    || left.totalCostUsd - right.totalCostUsd
    || (left.provider.kind === 'ollama' ? -1 : 1)
  ));
  if (eligible[0]) eligible[0].selected = true;

  const conclusion = eligible[0]
    ? `Selected ${eligible[0].provider.id} for a separate integration decision`
    : survivors.length === 0
      ? 'No provider passed Madrid; changing models alone is insufficient'
      : stage === 'pilot'
        ? `Pilot survivors: ${survivors.map((provider) => provider.id).join(', ')}`
        : 'No Madrid survivor passed the complete calibration';
  const summary = {
    benchmarkVersion: EDITORIAL_BENCHMARK_VERSION,
    runId,
    stage,
    externalSpendUsd,
    spendCapUsd: DEEPSEEK_SPEND_CAP_USD,
    holdoutLoaded: false,
    survivors: survivors.map((provider) => provider.id),
    providers: summaries,
    conclusion,
  };
  writeJson(join(outputDirectory, 'summary.json'), summary);
  console.log(JSON.stringify(summary, null, 2));

  const completedSuccessfully = stage === 'pilot' ? survivors.length > 0 : eligible.length > 0;
  if (!completedSuccessfully) process.exitCode = 1;
}

main().catch((error) => {
  console.error('[editorial-benchmark] failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
