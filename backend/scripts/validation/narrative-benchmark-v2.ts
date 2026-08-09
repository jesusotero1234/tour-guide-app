import 'dotenv/config';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import {
  AutonomousNarrativeArtifactV2,
  replayAutonomousNarrativeArtifactV2,
} from '../../src/services/poi/AutonomousNarrativeV2';
import {
  NarrativeBenchmarkResultV2,
  freezeApprovedNarrativeBenchmarkV2,
  replayNarrativeBenchmarkV2,
  runNarrativeBenchmarkV2,
} from '../../src/services/poi/NarrativeBenchmarkV2';
import {
  NarrativeBenchmarkCaseV2,
  loadNarrativeBenchmarkCaseV2,
} from '../../src/services/poi/NarrativeBenchmarkCaseV2';

const CASE_PATHS = [
  'fixtures/narrative-benchmark-v2/cases/paris-history-es.json',
  'fixtures/narrative-benchmark-v2/cases/madrid-history-es.json',
  'fixtures/narrative-benchmark-v2/cases/berlin-history-es.json',
];
const BENCHMARK_PATH = 'fixtures/narrative-benchmark-v2/approved-benchmark.json';
const CANDIDATE_PATH = 'fixtures/narrative-pilot-v2/paris-premium-es.artifact.json';
const SELECTED_CASE_ID = 'paris-history-es';

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function loadJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

function loadCases(): NarrativeBenchmarkCaseV2[] {
  return CASE_PATHS.map((path) => loadNarrativeBenchmarkCaseV2(resolve(process.cwd(), path)));
}

function summary(result: NarrativeBenchmarkResultV2, replayedOffline: boolean, frozen: boolean) {
  return {
    schemaVersion: result.schemaVersion,
    passed: result.passed,
    failureReasons: result.failureReasons,
    approvedCandidates: `${result.summary.approvedCandidates}/${result.summary.totalCandidates}`,
    approvedByCase: result.summary.approvedByCase,
    factualMutationDetections:
      `${result.summary.factualMutationDetections}/${result.summary.totalMutations}`,
    allCriticsFullyGpu: result.summary.allCriticsFullyGpu,
    allCritiquesBelow180Seconds: result.summary.allCritiquesBelow180Seconds,
    candidateStatuses: result.candidates.map((candidate) => ({
      caseId: candidate.caseId,
      candidateIndex: candidate.candidateIndex,
      status: candidate.artifact.status,
      failure: candidate.artifact.failure,
    })),
    mutations: result.mutations.map((probe) => ({
      caseId: probe.caseId,
      mutation: probe.mutation,
      status: probe.status,
      factualDetection: probe.factualDetection,
      rejectionReasons: probe.rejectionReasons,
    })),
    fingerprints: result.fingerprints,
    replayedOffline,
    frozen,
  };
}

async function main(): Promise<void> {
  const cases = loadCases();
  const generate = hasFlag('--generate');
  const freeze = hasFlag('--freeze-approved');
  if (freeze && (!generate || !hasFlag('--allow-external'))) {
    throw new Error('--freeze-approved requires --generate --allow-external');
  }

  let result: NarrativeBenchmarkResultV2;
  if (generate) {
    if (!hasFlag('--allow-external')) {
      throw new Error('external narrative benchmark requires --generate --allow-external');
    }
    const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
    if (!apiKey) throw new Error('DEEPSEEK_API_KEY is required for external generation');
    const ollamaHost = process.env.OLLAMA_HOST?.trim();
    if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the local Gemma critic');
    result = await runNarrativeBenchmarkV2(cases, {
      generator: { apiKey },
      critic: { ollamaHost },
    });
    if (freeze && result.passed) {
      freezeApprovedNarrativeBenchmarkV2(result, cases, {
        benchmarkPath: resolve(process.cwd(), BENCHMARK_PATH),
        candidatePath: resolve(process.cwd(), CANDIDATE_PATH),
        selectedCaseId: SELECTED_CASE_ID,
      });
    }
  } else {
    result = loadJson<NarrativeBenchmarkResultV2>(resolve(process.cwd(), BENCHMARK_PATH));
    replayNarrativeBenchmarkV2(result, cases);
    const selectedCase = cases.find((testCase) => testCase.caseId === SELECTED_CASE_ID);
    if (!selectedCase) throw new Error(`missing benchmark case ${SELECTED_CASE_ID}`);
    const candidate = loadJson<AutonomousNarrativeArtifactV2>(
      resolve(process.cwd(), CANDIDATE_PATH)
    );
    replayAutonomousNarrativeArtifactV2(candidate, selectedCase);
  }

  process.stdout.write(`${JSON.stringify(summary(result, !generate, freeze && result.passed), null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
