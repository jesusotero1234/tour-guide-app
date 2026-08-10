import 'dotenv/config';
import { resolve } from 'path';
import {
  NarrativeBenchmarkResultV3,
  freezeApprovedNarrativeBenchmarkV3,
  runNarrativeBenchmarkV3,
} from '../../src/services/poi/NarrativeBenchmarkV3';
import { buildNarrativeDiagnosticBundleV3 } from '../../src/services/poi/NarrativeDiagnosticsV3';
import { buildNarrativeEvidenceCaseFromOfficialFactsV3 } from '../../src/services/poi/NarrativeEvidenceV3';
import { loadNarrativeBenchmarkCaseV2 } from '../../src/services/poi/NarrativeBenchmarkCaseV2';
import { NARRATIVE_WRITER_MODEL_V3 } from '../../src/services/poi/NarrativePilotWriterV3';
import { EditorialProviderV6 } from '../../src/services/poi/EditorialStructuredLlmV6';

const CASE_PATHS = [
  'fixtures/narrative-benchmark-v2/cases/paris-history-es.json',
  'fixtures/narrative-benchmark-v2/cases/madrid-history-es.json',
  'fixtures/narrative-benchmark-v2/cases/berlin-history-es.json',
];
const BENCHMARK_PATH = 'fixtures/narrative-benchmark-v3/approved-benchmark.json';
const CANDIDATE_PATH = 'fixtures/narrative-pilot-v3/madrid-history-es.artifact.json';

function hasFlag(name: string): boolean {
  return process.argv.includes(name);
}

function loadCases() {
  return CASE_PATHS.map((path) => buildNarrativeEvidenceCaseFromOfficialFactsV3(
    loadNarrativeBenchmarkCaseV2(resolve(process.cwd(), path))
  ));
}

function writerConfiguration() {
  const rawKind = process.env.NARRATIVE_WRITER_PROVIDER?.trim() || 'deepseek';
  if (rawKind !== 'deepseek' && rawKind !== 'oneprovider' && rawKind !== 'ollama') {
    throw new Error('NARRATIVE_WRITER_PROVIDER must be deepseek, oneprovider, or ollama');
  }
  const kind: EditorialProviderV6['kind'] = rawKind;
  const model = process.env.NARRATIVE_WRITER_MODEL?.trim() || NARRATIVE_WRITER_MODEL_V3;
  const apiKey = process.env.DEEPSEEK_API_KEY?.trim();
  const oneProviderApiKey = process.env.ONEPROVIDER_API_KEY?.trim();
  if (kind === 'deepseek' && !apiKey) throw new Error('DEEPSEEK_API_KEY is required');
  if (kind === 'oneprovider' && !oneProviderApiKey) {
    throw new Error('ONEPROVIDER_API_KEY is required');
  }
  return {
    provider: { kind, model },
    apiKey,
    oneProviderApiKey,
    ollamaHost: process.env.OLLAMA_HOST?.trim(),
  };
}

function summary(result: NarrativeBenchmarkResultV3, frozen: boolean) {
  return {
    schemaVersion: result.schemaVersion,
    passed: result.passed,
    frozen,
    failureReasons: result.failureReasons,
    approvedCandidates: `${result.summary.approvedCandidates}/${result.summary.totalCandidates}`,
    approvedByCase: result.summary.approvedByCase,
    approvedMutationControls: `${result.summary.approvedMutationControls}/3`,
    factualMutationDetections:
      `${result.summary.factualMutationDetections}/${result.summary.totalMutations}`,
    allCriticsFullyGpu: result.summary.allCriticsFullyGpu,
    allCritiquesBelow180Seconds: result.summary.allCritiquesBelow180Seconds,
    candidates: result.candidates.map((candidate) => ({
      caseId: candidate.caseId,
      candidateIndex: candidate.candidateIndex,
      outcome: candidate.artifact.outcome,
      diagnostics: candidate.artifact.outcome.type === 'rejected'
        ? buildNarrativeDiagnosticBundleV3(candidate.artifact)
        : null,
    })),
    mutationControls: result.mutationControls.map((control) => ({
      caseId: control.caseId,
      outcome: control.artifact.outcome,
    })),
    mutations: result.mutations.map((probe) => ({
      caseId: probe.caseId,
      mutation: probe.mutation,
      status: probe.status,
      factualDetection: probe.factualDetection,
      rejectionReasons: probe.rejectionReasons,
      diagnostic: probe.diagnostic,
    })),
    fingerprints: result.fingerprints,
  };
}

async function main(): Promise<void> {
  const cases = loadCases();
  const generate = hasFlag('--generate');
  const freeze = hasFlag('--freeze-approved');
  if (!generate) {
    process.stdout.write(`${JSON.stringify({
      schemaVersion: 'narrative-v3-input-check',
      qualification: 'not_run',
      reason: 'No V3 benchmark has been frozen. Use --generate --allow-external.',
      cases: cases.map((testCase) => ({
        caseId: testCase.caseId,
        city: testCase.city,
        scenes: testCase.scenes.map((scene) => scene.sceneId),
        routeFingerprint: testCase.routeFingerprint,
        sourceSnapshotFingerprint: testCase.sourceSnapshotFingerprint,
      })),
    }, null, 2)}\n`);
    return;
  }
  if (!hasFlag('--allow-external')) {
    throw new Error('external narrative benchmark requires --generate --allow-external');
  }
  if (freeze && !generate) {
    throw new Error('--freeze-approved requires --generate --allow-external');
  }
  const writer = writerConfiguration();
  const ollamaHost = process.env.OLLAMA_HOST?.trim();
  if (!ollamaHost) throw new Error('OLLAMA_HOST is required for the local Gemma critic');
  const result = await runNarrativeBenchmarkV3(cases, {
    writer,
    critic: { ollamaHost },
  });
  if (freeze && result.passed) {
    const madrid = cases.find((testCase) => testCase.city === 'Madrid');
    if (!madrid) throw new Error('Madrid calibration case is missing');
    freezeApprovedNarrativeBenchmarkV3(result, cases, {
      benchmarkPath: resolve(process.cwd(), BENCHMARK_PATH),
      candidatePath: resolve(process.cwd(), CANDIDATE_PATH),
      selectedCaseId: madrid.caseId,
    });
  }
  process.stdout.write(`${JSON.stringify(summary(result, freeze && result.passed), null, 2)}\n`);
  if (!result.passed) process.exitCode = 1;
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
});
