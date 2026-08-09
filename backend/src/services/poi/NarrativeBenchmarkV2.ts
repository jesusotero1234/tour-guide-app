import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname } from 'path';
import {
  AutonomousNarrativeArtifactV2,
  AutonomousNarrativeOptionsV2,
  replayAutonomousNarrativeArtifactV2,
  runAutonomousNarrativeV2,
  serializeMachineApprovedNarrativeArtifactV2,
} from './AutonomousNarrativeV2';
import { EditorialAttemptV6 } from './EditorialStructuredLlmV6';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeBenchmarkCaseV2,
  validateNarrativeBenchmarkCaseV2,
} from './NarrativeBenchmarkCaseV2';
import {
  NarrativeCriticGateReasonV2,
  NarrativeCriticReportV2,
  buildNarrativeCriticRequestV2,
  evaluateNarrativeCriticGateV2,
  validateNarrativeCriticReportV2,
} from './NarrativePilotCriticV2';
import {
  NarrativeCriticOptionsV2,
  requestNarrativeFinalCritiqueV2,
} from './NarrativePilotGemmaV2';
import {
  SceneNarrativeScriptV1,
  narrativeWordCountV1,
} from './NarrativePilotV1';

export const NARRATIVE_BENCHMARK_SCHEMA_VERSION_V2 =
  'autonomous-narrative-benchmark-v2' as const;
export const NARRATIVE_MUTATION_KINDS_V2 = [
  'invented_causality',
  'cross_scene_attribution',
  'false_character',
  'misleading_omission',
] as const;
export type NarrativeMutationKindV2 = typeof NARRATIVE_MUTATION_KINDS_V2[number];

export const NARRATIVE_BENCHMARK_POLICIES_V2 = {
  candidatesPerCase: 3,
  minimumApprovedCandidates: 8,
  minimumApprovedCandidatesPerCase: 2,
  mutationKinds: NARRATIVE_MUTATION_KINDS_V2,
  maximumCriticLatencyMsExclusive: 180_000,
  requireFullyGpuCritic: true,
  requireFactualMutationRejection: true,
} as const;

const FACTUAL_REASONS = new Set<NarrativeCriticGateReasonV2>([
  'new_claim',
  'distorted_claim',
  'omitted_claim',
  'misleading_omission',
  'critical_unsupported_claim',
]);

export interface NarrativeBenchmarkCandidateV2 {
  caseId: string;
  city: string;
  candidateIndex: number;
  artifact: AutonomousNarrativeArtifactV2;
}

export interface NarrativeBenchmarkMutationProbeV2 {
  caseId: string;
  mutation: NarrativeMutationKindV2;
  status: EditorialAttemptV6['status'];
  report: NarrativeCriticReportV2 | null;
  attempts: EditorialAttemptV6[];
  rejectionReasons: NarrativeCriticGateReasonV2[];
  factualDetection: boolean;
}

export interface NarrativeBenchmarkSummaryV2 {
  approvedCandidates: number;
  totalCandidates: number;
  approvedByCase: Record<string, number>;
  factualMutationDetections: number;
  totalMutations: number;
  allCriticsFullyGpu: boolean;
  allCritiquesBelow180Seconds: boolean;
}

export interface NarrativeBenchmarkFingerprintsV2 {
  cases: string;
  candidates: string;
  mutations: string;
  policies: string;
  benchmark: string;
}

export interface NarrativeBenchmarkResultV2 {
  schemaVersion: typeof NARRATIVE_BENCHMARK_SCHEMA_VERSION_V2;
  caseIds: string[];
  candidates: NarrativeBenchmarkCandidateV2[];
  mutations: NarrativeBenchmarkMutationProbeV2[];
  summary: NarrativeBenchmarkSummaryV2;
  passed: boolean;
  failureReasons: string[];
  fingerprints: NarrativeBenchmarkFingerprintsV2;
}

export interface NarrativeBenchmarkOptionsV2 {
  generator?: AutonomousNarrativeOptionsV2['generator'];
  critic?: NarrativeCriticOptionsV2;
  runCandidate?: (
    testCase: NarrativeBenchmarkCaseV2,
    candidateIndex: number
  ) => Promise<AutonomousNarrativeArtifactV2>;
  runMutation?: (
    testCase: NarrativeBenchmarkCaseV2,
    artifact: AutonomousNarrativeArtifactV2,
    kind: NarrativeMutationKindV2
  ) => Promise<NarrativeBenchmarkMutationProbeV2>;
}

export interface NarrativeBenchmarkFreezeOptionsV2 {
  benchmarkPath: string;
  candidatePath: string;
  selectedCaseId: string;
}

function copyScripts(scripts: SceneNarrativeScriptV1[]): SceneNarrativeScriptV1[] {
  return scripts.map((script) => ({
    ...script,
    blocks: script.blocks.map((block) => ({
      ...block,
      evidenceFactIds: [...block.evidenceFactIds],
    })),
    transition: { ...script.transition },
  }));
}

function replaceBlockText(
  scripts: SceneNarrativeScriptV1[],
  sceneIndex: number,
  blockIndex: number,
  text: string
): void {
  scripts[sceneIndex].blocks[blockIndex].text = text;
  scripts[sceneIndex].wordCount = narrativeWordCountV1(scripts[sceneIndex]);
}

export function applyNarrativeMutationV2(
  scripts: SceneNarrativeScriptV1[],
  testCase: NarrativeBenchmarkCaseV2,
  kind: NarrativeMutationKindV2
): SceneNarrativeScriptV1[] {
  const value = validateNarrativeBenchmarkCaseV2(testCase);
  if (scripts.length !== value.scenes.length) {
    throw new Error('mutation requires one narrative script per benchmark scene');
  }
  const mutated = copyScripts(scripts);
  const original = mutated[0].blocks[0].text;
  if (kind === 'invented_causality') {
    replaceBlockText(
      mutated,
      0,
      0,
      `${original} Este episodio causó por sí solo la transformación política posterior de toda la ciudad.`
    );
  } else if (kind === 'cross_scene_attribution') {
    replaceBlockText(
      mutated,
      0,
      0,
      `${original} Aquí ocurrió también lo documentado para ${value.scenes[1].name}: ${value.scenes[1].evidenceFacts[0].normalizedEs}`
    );
  } else if (kind === 'false_character') {
    replaceBlockText(
      mutated,
      0,
      0,
      `${original} El cronista Aurelio Valdés dirigió personalmente aquellos acontecimientos decisivos.`
    );
  } else if (kind === 'misleading_omission') {
    replaceBlockText(
      mutated,
      0,
      0,
      'Observa el volumen, recorre despacio sus líneas y compara luces, sombras, materiales y proporciones desde varios ángulos antes de continuar.'
    );
  } else {
    const exhaustive: never = kind;
    throw new Error(`unsupported narrative mutation: ${exhaustive}`);
  }
  return mutated;
}

function failedMutationProbe(
  testCase: NarrativeBenchmarkCaseV2,
  kind: NarrativeMutationKindV2,
  error: unknown
): NarrativeBenchmarkMutationProbeV2 {
  return {
    caseId: testCase.caseId,
    mutation: kind,
    status: 'transport_error',
    report: null,
    attempts: [{
      attempt: 1,
      status: 'transport_error',
      latencyMs: 0,
      rawOutput: null,
      error: error instanceof Error ? error.message : String(error),
    }],
    rejectionReasons: [],
    factualDetection: false,
  };
}

export async function runNarrativeMutationProbeV2(
  testCase: NarrativeBenchmarkCaseV2,
  artifact: AutonomousNarrativeArtifactV2,
  kind: NarrativeMutationKindV2,
  criticOptions: NarrativeCriticOptionsV2 = {}
): Promise<NarrativeBenchmarkMutationProbeV2> {
  try {
    if (artifact.status !== 'machine_approved' || !artifact.plan || !artifact.criticModel) {
      throw new Error('mutation probe requires a machine-approved candidate');
    }
    const scripts = applyNarrativeMutationV2(artifact.scripts, testCase, kind);
    const request = buildNarrativeCriticRequestV2(artifact.request, artifact.plan, scripts);
    const result = await requestNarrativeFinalCritiqueV2(
      request,
      artifact.criticModel,
      criticOptions
    );
    const gate = result.value ? evaluateNarrativeCriticGateV2(result.value) : null;
    const rejectionReasons = gate?.reasons ?? [];
    return {
      caseId: testCase.caseId,
      mutation: kind,
      status: result.status,
      report: result.value,
      attempts: result.attempts,
      rejectionReasons,
      factualDetection: result.status === 'valid'
        && gate !== null
        && !gate.passed
        && rejectionReasons.some((reason) => FACTUAL_REASONS.has(reason)),
    };
  } catch (error) {
    return failedMutationProbe(testCase, kind, error);
  }
}

function critiqueDurations(artifact: AutonomousNarrativeArtifactV2): number[] {
  const records = [
    ...artifact.planAttempts.map((attempt) => attempt.grounding),
    ...artifact.proseAttempts.map((attempt) => attempt.critique),
  ].filter((record) => record !== null);
  return records.map((record) => record.attempts
    .reduce((total, attempt) => total + attempt.latencyMs, 0));
}

function fullyGpu(artifact: AutonomousNarrativeArtifactV2): boolean {
  const model = artifact.criticModel;
  return model !== null
    && model.fullyGpu === true
    && model.sizeBytes > 0
    && model.sizeVramBytes === model.sizeBytes;
}

function benchmarkFingerprints(input: {
  cases: NarrativeBenchmarkCaseV2[];
  candidates: NarrativeBenchmarkCandidateV2[];
  mutations: NarrativeBenchmarkMutationProbeV2[];
  summary: NarrativeBenchmarkSummaryV2;
  passed: boolean;
  failureReasons: string[];
}): NarrativeBenchmarkFingerprintsV2 {
  const cases = editorialFingerprintV7(input.cases);
  const candidates = editorialFingerprintV7(input.candidates);
  const mutations = editorialFingerprintV7(input.mutations);
  const policies = editorialFingerprintV7(NARRATIVE_BENCHMARK_POLICIES_V2);
  return {
    cases,
    candidates,
    mutations,
    policies,
    benchmark: editorialFingerprintV7({
      schemaVersion: NARRATIVE_BENCHMARK_SCHEMA_VERSION_V2,
      caseIds: input.cases.map((testCase) => testCase.caseId),
      cases,
      candidates,
      mutations,
      policies,
      summary: input.summary,
      passed: input.passed,
      failureReasons: input.failureReasons,
    }),
  };
}

function evaluateBenchmark(
  cases: NarrativeBenchmarkCaseV2[],
  candidates: NarrativeBenchmarkCandidateV2[],
  mutations: NarrativeBenchmarkMutationProbeV2[]
): {
  summary: NarrativeBenchmarkSummaryV2;
  passed: boolean;
  failureReasons: string[];
} {
  const approvedByCase = Object.fromEntries(cases.map((testCase) => [
    testCase.caseId,
    candidates.filter((candidate) => (
      candidate.caseId === testCase.caseId && candidate.artifact.status === 'machine_approved'
    )).length,
  ]));
  const approvedCandidates = Object.values(approvedByCase)
    .reduce((total, approved) => total + approved, 0);
  const candidateDurations = candidates.flatMap((candidate) => critiqueDurations(candidate.artifact));
  const mutationDurations = mutations.map((probe) => probe.attempts
    .reduce((total, attempt) => total + attempt.latencyMs, 0));
  const summary: NarrativeBenchmarkSummaryV2 = {
    approvedCandidates,
    totalCandidates: candidates.length,
    approvedByCase,
    factualMutationDetections: mutations.filter((probe) => probe.factualDetection).length,
    totalMutations: mutations.length,
    allCriticsFullyGpu: candidates.every((candidate) => fullyGpu(candidate.artifact)),
    allCritiquesBelow180Seconds: [...candidateDurations, ...mutationDurations]
      .every((latencyMs) => latencyMs < 180_000),
  };
  const failureReasons: string[] = [];
  if (summary.approvedCandidates < 8) failureReasons.push('approved_candidates_below_8');
  for (const testCase of cases) {
    if (summary.approvedByCase[testCase.caseId] < 2) {
      failureReasons.push(`approved_candidates_below_2:${testCase.caseId}`);
    }
  }
  for (const probe of mutations) {
    if (!probe.factualDetection) {
      failureReasons.push(`mutation_not_factually_rejected:${probe.caseId}:${probe.mutation}`);
    }
  }
  if (!summary.allCriticsFullyGpu) failureReasons.push('critic_not_fully_gpu');
  if (!summary.allCritiquesBelow180Seconds) {
    failureReasons.push('critic_latency_at_or_above_180_seconds');
  }
  return { summary, passed: failureReasons.length === 0, failureReasons };
}

export async function runNarrativeBenchmarkV2(
  rawCases: NarrativeBenchmarkCaseV2[],
  options: NarrativeBenchmarkOptionsV2 = {}
): Promise<NarrativeBenchmarkResultV2> {
  const cases = rawCases.map(validateNarrativeBenchmarkCaseV2);
  if (cases.length !== 3 || new Set(cases.map((testCase) => testCase.caseId)).size !== 3) {
    throw new Error('narrative benchmark v2 requires exactly three unique cases');
  }
  const runCandidate = options.runCandidate ?? ((testCase) => runAutonomousNarrativeV2(
    testCase,
    { generator: options.generator, critic: options.critic }
  ));
  const runMutation = options.runMutation ?? ((testCase, artifact, kind) => (
    runNarrativeMutationProbeV2(testCase, artifact, kind, options.critic)
  ));

  const candidates: NarrativeBenchmarkCandidateV2[] = [];
  for (const testCase of cases) {
    for (let candidateIndex = 1; candidateIndex <= 3; candidateIndex += 1) {
      const artifact = await runCandidate(testCase, candidateIndex);
      if (artifact.caseId !== testCase.caseId) {
        throw new Error(`candidate case mismatch for ${testCase.caseId}`);
      }
      candidates.push({ caseId: testCase.caseId, city: testCase.city, candidateIndex, artifact });
    }
  }

  const mutations: NarrativeBenchmarkMutationProbeV2[] = [];
  for (const testCase of cases) {
    const baseline = candidates.find((candidate) => (
      candidate.caseId === testCase.caseId && candidate.artifact.status === 'machine_approved'
    ));
    for (const kind of NARRATIVE_MUTATION_KINDS_V2) {
      if (!baseline) {
        mutations.push(failedMutationProbe(
          testCase,
          kind,
          new Error('no machine-approved candidate is available for mutation')
        ));
      } else {
        mutations.push(await runMutation(testCase, baseline.artifact, kind));
      }
    }
  }

  const { summary, passed, failureReasons } = evaluateBenchmark(cases, candidates, mutations);
  const fingerprints = benchmarkFingerprints({
    cases, candidates, mutations, summary, passed, failureReasons,
  });
  return {
    schemaVersion: NARRATIVE_BENCHMARK_SCHEMA_VERSION_V2,
    caseIds: cases.map((testCase) => testCase.caseId),
    candidates,
    mutations,
    summary,
    passed,
    failureReasons,
    fingerprints,
  };
}

export function replayNarrativeBenchmarkV2(
  result: NarrativeBenchmarkResultV2,
  rawCases: NarrativeBenchmarkCaseV2[]
): NarrativeBenchmarkResultV2 {
  const cases = rawCases.map(validateNarrativeBenchmarkCaseV2);
  if (cases.length !== 3 || new Set(cases.map((testCase) => testCase.caseId)).size !== 3
    || !result || result.schemaVersion !== NARRATIVE_BENCHMARK_SCHEMA_VERSION_V2
    || !Array.isArray(result.caseIds)
    || result.caseIds.join(',') !== cases.map((testCase) => testCase.caseId).join(',')
    || !Array.isArray(result.candidates) || result.candidates.length !== 9
    || !Array.isArray(result.mutations) || result.mutations.length !== 12) {
    throw new Error('invalid autonomous narrative benchmark v2');
  }
  for (const testCase of cases) {
    const candidates = result.candidates.filter((candidate) => candidate.caseId === testCase.caseId);
    if (candidates.length !== 3
      || candidates.map((candidate) => candidate.candidateIndex).join(',') !== '1,2,3') {
      throw new Error(`benchmark candidate set changed for ${testCase.caseId}`);
    }
    for (const candidate of candidates) {
      if (candidate.city !== testCase.city || candidate.artifact.caseId !== testCase.caseId) {
        throw new Error(`benchmark candidate metadata changed for ${testCase.caseId}`);
      }
      replayAutonomousNarrativeArtifactV2(candidate.artifact, testCase);
    }
    const probes = result.mutations.filter((probe) => probe.caseId === testCase.caseId);
    if (probes.length !== NARRATIVE_MUTATION_KINDS_V2.length
      || probes.map((probe) => probe.mutation).join(',') !== NARRATIVE_MUTATION_KINDS_V2.join(',')) {
      throw new Error(`benchmark mutation set changed for ${testCase.caseId}`);
    }
    const baseline = candidates.find((candidate) => candidate.artifact.status === 'machine_approved');
    for (const probe of probes) {
      if (!Array.isArray(probe.attempts)
        || (probe.status !== 'valid' && probe.report !== null)) {
        throw new Error(`benchmark mutation protocol changed for ${testCase.caseId}:${probe.mutation}`);
      }
      let reasons: NarrativeCriticGateReasonV2[] = [];
      if (probe.report) {
        if (!baseline?.artifact.plan) {
          throw new Error(`benchmark mutation report has no approved baseline for ${testCase.caseId}`);
        }
        const scripts = applyNarrativeMutationV2(
          baseline.artifact.scripts,
          testCase,
          probe.mutation
        );
        const request = buildNarrativeCriticRequestV2(
          baseline.artifact.request,
          baseline.artifact.plan,
          scripts
        );
        const report = validateNarrativeCriticReportV2(probe.report, request);
        reasons = evaluateNarrativeCriticGateV2(report).reasons;
      }
      const factualDetection = probe.status === 'valid'
        && reasons.some((reason) => FACTUAL_REASONS.has(reason));
      if (editorialFingerprintV7(probe.rejectionReasons) !== editorialFingerprintV7(reasons)
        || probe.factualDetection !== factualDetection) {
        throw new Error(`benchmark mutation verdict changed for ${testCase.caseId}:${probe.mutation}`);
      }
    }
  }
  const evaluated = evaluateBenchmark(cases, result.candidates, result.mutations);
  if (editorialFingerprintV7(result.summary) !== editorialFingerprintV7(evaluated.summary)
    || result.passed !== evaluated.passed
    || editorialFingerprintV7(result.failureReasons)
      !== editorialFingerprintV7(evaluated.failureReasons)) {
    throw new Error('benchmark gate result changed');
  }
  const fingerprints = benchmarkFingerprints({
    cases,
    candidates: result.candidates,
    mutations: result.mutations,
    summary: result.summary,
    passed: result.passed,
    failureReasons: result.failureReasons,
  });
  if (editorialFingerprintV7(result.fingerprints) !== editorialFingerprintV7(fingerprints)) {
    throw new Error('benchmark fingerprints changed');
  }
  return result;
}

function safeUnlink(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // A stale backup is safer than weakening an already committed pair of outputs.
  }
}

function atomicWritePair(outputs: Array<{ path: string; content: string }>): void {
  const suffix = `${process.pid}-${Date.now()}`;
  const staged = outputs.map((output) => ({ ...output, temp: `${output.path}.${suffix}.tmp` }));
  const backups = outputs.map((output) => ({
    path: output.path,
    backup: `${output.path}.${suffix}.bak`,
    existed: existsSync(output.path),
  }));
  const movedBackups: typeof backups = [];
  const installed: string[] = [];
  try {
    for (const output of outputs) mkdirSync(dirname(output.path), { recursive: true });
    for (const output of staged) writeFileSync(output.temp, output.content, { encoding: 'utf8', flag: 'wx' });
    for (const backup of backups) {
      if (backup.existed) {
        renameSync(backup.path, backup.backup);
        movedBackups.push(backup);
      }
    }
    for (const output of staged) {
      renameSync(output.temp, output.path);
      installed.push(output.path);
    }
    for (const backup of backups) safeUnlink(backup.backup);
  } catch (error) {
    for (const output of staged) safeUnlink(output.temp);
    for (const path of installed) safeUnlink(path);
    for (const backup of movedBackups) {
      if (existsSync(backup.backup)) renameSync(backup.backup, backup.path);
    }
    throw error;
  }
}

export function freezeApprovedNarrativeBenchmarkV2(
  result: NarrativeBenchmarkResultV2,
  rawCases: NarrativeBenchmarkCaseV2[],
  options: NarrativeBenchmarkFreezeOptionsV2
): void {
  if (!result.passed) {
    throw new Error('only a passing benchmark can be frozen');
  }
  const cases = rawCases.map(validateNarrativeBenchmarkCaseV2);
  replayNarrativeBenchmarkV2(result, cases);
  const selectedCase = cases.find((testCase) => testCase.caseId === options.selectedCaseId);
  const selected = result.candidates.find((candidate) => (
    candidate.caseId === options.selectedCaseId
    && candidate.artifact.status === 'machine_approved'
  ));
  if (!selectedCase || !selected) {
    throw new Error('passing benchmark has no machine-approved candidate for selected case');
  }
  const expectedFingerprints = benchmarkFingerprints({
    cases,
    candidates: result.candidates,
    mutations: result.mutations,
    summary: result.summary,
    passed: result.passed,
    failureReasons: result.failureReasons,
  });
  if (editorialFingerprintV7(result.fingerprints)
    !== editorialFingerprintV7(expectedFingerprints)) {
    throw new Error('benchmark fingerprints changed before freeze');
  }
  const benchmarkContent = `${JSON.stringify(result, null, 2)}\n`;
  const candidateContent = serializeMachineApprovedNarrativeArtifactV2(
    selected.artifact,
    selectedCase
  );
  atomicWritePair([
    { path: options.benchmarkPath, content: benchmarkContent },
    { path: options.candidatePath, content: candidateContent },
  ]);
}
