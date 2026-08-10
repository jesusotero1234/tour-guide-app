import {
  existsSync,
  mkdirSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname } from 'path';
import {
  AutonomousNarrativeArtifactV3,
  AutonomousNarrativeOptionsV3,
  replayAutonomousNarrativeArtifactV3,
  runAutonomousNarrativeV3,
  serializeMachineApprovedNarrativeArtifactV3,
} from './AutonomousNarrativeV3';
import { EditorialAttemptV6 } from './EditorialStructuredLlmV6';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeCriticGateReasonV3,
  NarrativeCriticReportV3,
  buildNarrativeCriticRequestV3,
  evaluateNarrativeCriticGateV3,
  validateNarrativeCriticReportV3,
} from './NarrativeCriticV3';
import { NarrativeEvidenceCaseV3 } from './NarrativeEvidenceV3';
import {
  NarrativeCriticOptionsV3,
  requestNarrativeFinalCritiqueV3,
} from './NarrativePilotGemmaV3';
import { SceneNarrativeScriptV1, narrativeWordCountV1 } from './NarrativePilotV1';

export const NARRATIVE_BENCHMARK_SCHEMA_VERSION_V3 =
  'autonomous-narrative-benchmark-v3' as const;
export const NARRATIVE_MUTATION_KINDS_V3 = [
  'invented_causality',
  'cross_scene_attribution',
  'false_character',
  'misleading_omission',
] as const;
export type NarrativeMutationKindV3 = typeof NARRATIVE_MUTATION_KINDS_V3[number];

export const NARRATIVE_BENCHMARK_POLICIES_V3 = {
  candidatesPerCase: 3,
  minimumApprovedCandidates: 8,
  minimumApprovedCandidatesPerCase: 2,
  mutationKinds: NARRATIVE_MUTATION_KINDS_V3,
  independentMutationControlPerCase: true,
  maximumCriticLatencyMsExclusive: 180_000,
  requireFullyGpuCritic: true,
  requireFactualMutationRejection: true,
} as const;

const FACTUAL_REASONS = new Set<NarrativeCriticGateReasonV3>([
  'new_claim',
  'distorted_claim',
  'omitted_claim',
  'misleading_omission',
  'critical_unsupported_claim',
]);

export interface NarrativeBenchmarkCandidateV3 {
  caseId: string;
  city: string;
  candidateIndex: number;
  artifact: AutonomousNarrativeArtifactV3;
}

export interface NarrativeBenchmarkMutationControlV3 {
  caseId: string;
  artifact: AutonomousNarrativeArtifactV3;
}

export type NarrativeMutationProbeStatusV3 = EditorialAttemptV6['status'] | 'not_run';

export interface NarrativeBenchmarkMutationProbeV3 {
  caseId: string;
  mutation: NarrativeMutationKindV3;
  status: NarrativeMutationProbeStatusV3;
  report: NarrativeCriticReportV3 | null;
  attempts: EditorialAttemptV6[];
  rejectionReasons: NarrativeCriticGateReasonV3[];
  factualDetection: boolean;
  diagnostic: string | null;
}

export interface NarrativeBenchmarkSummaryV3 {
  approvedCandidates: number;
  totalCandidates: number;
  approvedByCase: Record<string, number>;
  approvedMutationControls: number;
  factualMutationDetections: number;
  totalMutations: number;
  allCriticsFullyGpu: boolean;
  allCritiquesBelow180Seconds: boolean;
}

export interface NarrativeBenchmarkResultV3 {
  schemaVersion: typeof NARRATIVE_BENCHMARK_SCHEMA_VERSION_V3;
  caseIds: string[];
  candidates: NarrativeBenchmarkCandidateV3[];
  mutationControls: NarrativeBenchmarkMutationControlV3[];
  mutations: NarrativeBenchmarkMutationProbeV3[];
  summary: NarrativeBenchmarkSummaryV3;
  passed: boolean;
  failureReasons: string[];
  fingerprints: {
    cases: string;
    candidates: string;
    mutationControls: string;
    mutations: string;
    policies: string;
    benchmark: string;
  };
}

export interface NarrativeBenchmarkOptionsV3 {
  writer?: AutonomousNarrativeOptionsV3['writer'];
  critic?: NarrativeCriticOptionsV3;
  runCandidate?: (
    testCase: NarrativeEvidenceCaseV3,
    candidateIndex: number
  ) => Promise<AutonomousNarrativeArtifactV3>;
  runMutationControl?: (
    testCase: NarrativeEvidenceCaseV3
  ) => Promise<AutonomousNarrativeArtifactV3>;
  runMutation?: (
    testCase: NarrativeEvidenceCaseV3,
    control: AutonomousNarrativeArtifactV3,
    kind: NarrativeMutationKindV3
  ) => Promise<NarrativeBenchmarkMutationProbeV3>;
}

export interface NarrativeBenchmarkFreezeOptionsV3 {
  benchmarkPath: string;
  candidatePath: string;
  selectedCaseId: string;
}

function validateCases(cases: NarrativeEvidenceCaseV3[]): NarrativeEvidenceCaseV3[] {
  if (cases.length !== 3 || new Set(cases.map((testCase) => testCase.caseId)).size !== 3
    || new Set(cases.map((testCase) => testCase.city)).size !== 3) {
    throw new Error('narrative benchmark v3 requires exactly three unique cases and cities');
  }
  for (const testCase of cases) {
    if (testCase.schemaVersion !== 'narrative-evidence-v3'
      || testCase.language !== 'es-ES' || testCase.theme !== 'history'
      || testCase.scenes.length !== 3
      || testCase.scenes.some((scene) => !scene.readiness.ready)) {
      throw new Error(`narrative benchmark v3 case ${testCase.caseId} is not evidence-ready`);
    }
  }
  return cases;
}

function words(text: string): string[] {
  return text.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
}

function replacementWithSameWordCount(original: string, injected: string): string {
  const count = words(original).length;
  const injectedWords = words(injected);
  const originalWords = words(original);
  const replacement = [...injectedWords, ...originalWords].slice(0, count);
  while (replacement.length < count) replacement.push('lugar');
  return `${replacement.join(' ')}.`;
}

function copyScripts(scripts: SceneNarrativeScriptV1[]): SceneNarrativeScriptV1[] {
  return scripts.map((script) => ({
    ...script,
    blocks: script.blocks.map((block) => ({
      ...block, evidenceFactIds: [...block.evidenceFactIds],
    })),
    transition: { ...script.transition },
  }));
}

export function applyNarrativeMutationV3(
  scripts: SceneNarrativeScriptV1[],
  testCase: NarrativeEvidenceCaseV3,
  kind: NarrativeMutationKindV3
): SceneNarrativeScriptV1[] {
  if (scripts.length !== testCase.scenes.length) {
    throw new Error('mutation requires one script per evidence scene');
  }
  const mutated = copyScripts(scripts);
  const original = mutated[0].blocks[0].text;
  let injection: string;
  if (kind === 'invented_causality') {
    injection = 'Este episodio causó por sí solo toda la transformación política posterior de la ciudad';
  } else if (kind === 'cross_scene_attribution') {
    injection = `Aquí ocurrió también lo documentado para ${testCase.scenes[1].name}: ${testCase.scenes[1].evidenceFacts[0].normalizedEs}`;
  } else if (kind === 'false_character') {
    injection = 'El cronista ficticio Aurelio Valdés dirigió personalmente aquellos acontecimientos decisivos';
  } else if (kind === 'misleading_omission') {
    injection = 'Observa el volumen y compara despacio luces sombras materiales líneas y proporciones desde varios ángulos';
  } else {
    const exhaustive: never = kind;
    throw new Error(`unsupported narrative mutation: ${exhaustive}`);
  }
  mutated[0].blocks[0].text = replacementWithSameWordCount(original, injection);
  mutated[0].wordCount = narrativeWordCountV1(mutated[0]);
  return mutated;
}

function protocolFailure(
  testCase: NarrativeEvidenceCaseV3,
  kind: NarrativeMutationKindV3,
  error: unknown
): NarrativeBenchmarkMutationProbeV3 {
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
    diagnostic: error instanceof Error ? error.message : String(error),
  };
}

function notRunProbe(
  testCase: NarrativeEvidenceCaseV3,
  kind: NarrativeMutationKindV3
): NarrativeBenchmarkMutationProbeV3 {
  return {
    caseId: testCase.caseId,
    mutation: kind,
    status: 'not_run',
    report: null,
    attempts: [],
    rejectionReasons: [],
    factualDetection: false,
    diagnostic: 'mutation_control_not_approved',
  };
}

export async function runNarrativeMutationProbeV3(
  testCase: NarrativeEvidenceCaseV3,
  control: AutonomousNarrativeArtifactV3,
  kind: NarrativeMutationKindV3,
  criticOptions: NarrativeCriticOptionsV3 = {}
): Promise<NarrativeBenchmarkMutationProbeV3> {
  try {
    if (control.outcome.type !== 'machine_approved' || !control.plan || !control.criticModel) {
      return notRunProbe(testCase, kind);
    }
    const scripts = applyNarrativeMutationV3(control.scripts, testCase, kind);
    const request = buildNarrativeCriticRequestV3(control.request, control.plan, scripts);
    const result = await requestNarrativeFinalCritiqueV3(
      request, control.criticModel, criticOptions
    );
    const gate = result.value ? evaluateNarrativeCriticGateV3(result.value) : null;
    const rejectionReasons = gate?.reasons ?? [];
    return {
      caseId: testCase.caseId,
      mutation: kind,
      status: result.status,
      report: result.value,
      attempts: result.attempts,
      rejectionReasons,
      factualDetection: result.status === 'valid' && gate !== null && !gate.passed
        && rejectionReasons.some((reason) => FACTUAL_REASONS.has(reason)),
      diagnostic: result.value ? null : result.attempts.at(-1)?.error ?? 'critic protocol failed',
    };
  } catch (error) {
    return protocolFailure(testCase, kind, error);
  }
}

function critiqueDurations(artifact: AutonomousNarrativeArtifactV3): number[] {
  return [
    ...artifact.planAttempts.map((attempt) => attempt.grounding),
    ...artifact.proseAttempts.map((attempt) => attempt.critique),
  ].flatMap((record) => record
    ? [record.attempts.reduce((total, attempt) => total + attempt.latencyMs, 0)]
    : []);
}

function fullyGpu(artifact: AutonomousNarrativeArtifactV3): boolean {
  const model = artifact.criticModel;
  return model !== null && model.fullyGpu === true && model.sizeBytes > 0
    && model.sizeVramBytes === model.sizeBytes;
}

function evaluateBenchmark(
  cases: NarrativeEvidenceCaseV3[],
  candidates: NarrativeBenchmarkCandidateV3[],
  controls: NarrativeBenchmarkMutationControlV3[],
  mutations: NarrativeBenchmarkMutationProbeV3[]
): Pick<NarrativeBenchmarkResultV3, 'summary' | 'passed' | 'failureReasons'> {
  const approvedByCase = Object.fromEntries(cases.map((testCase) => [
    testCase.caseId,
    candidates.filter((candidate) => candidate.caseId === testCase.caseId
      && candidate.artifact.outcome.type === 'machine_approved').length,
  ]));
  const approvedCandidates = Object.values(approvedByCase)
    .reduce((total, value) => total + value, 0);
  const allArtifacts = [
    ...candidates.map((candidate) => candidate.artifact),
    ...controls.map((control) => control.artifact),
  ];
  const latencies = [
    ...allArtifacts.flatMap(critiqueDurations),
    ...mutations.map((probe) => probe.attempts
      .reduce((total, attempt) => total + attempt.latencyMs, 0)),
  ];
  const summary: NarrativeBenchmarkSummaryV3 = {
    approvedCandidates,
    totalCandidates: candidates.length,
    approvedByCase,
    approvedMutationControls: controls.filter((control) => (
      control.artifact.outcome.type === 'machine_approved'
    )).length,
    factualMutationDetections: mutations.filter((probe) => probe.factualDetection).length,
    totalMutations: mutations.length,
    allCriticsFullyGpu: allArtifacts.every(fullyGpu),
    allCritiquesBelow180Seconds: latencies.every((value) => value < 180_000),
  };
  const failureReasons: string[] = [];
  if (summary.approvedCandidates < 8) failureReasons.push('approved_candidates_below_8');
  for (const testCase of cases) {
    if (summary.approvedByCase[testCase.caseId] < 2) {
      failureReasons.push(`approved_candidates_below_2:${testCase.caseId}`);
    }
    const control = controls.find((item) => item.caseId === testCase.caseId);
    if (control?.artifact.outcome.type !== 'machine_approved') {
      failureReasons.push(`mutation_control_not_approved:${testCase.caseId}`);
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

function fingerprints(input: {
  cases: NarrativeEvidenceCaseV3[];
  candidates: NarrativeBenchmarkCandidateV3[];
  mutationControls: NarrativeBenchmarkMutationControlV3[];
  mutations: NarrativeBenchmarkMutationProbeV3[];
  summary: NarrativeBenchmarkSummaryV3;
  passed: boolean;
  failureReasons: string[];
}): NarrativeBenchmarkResultV3['fingerprints'] {
  const cases = editorialFingerprintV7(input.cases);
  const candidates = editorialFingerprintV7(input.candidates);
  const mutationControls = editorialFingerprintV7(input.mutationControls);
  const mutations = editorialFingerprintV7(input.mutations);
  const policies = editorialFingerprintV7(NARRATIVE_BENCHMARK_POLICIES_V3);
  return {
    cases, candidates, mutationControls, mutations, policies,
    benchmark: editorialFingerprintV7({
      schemaVersion: NARRATIVE_BENCHMARK_SCHEMA_VERSION_V3,
      caseIds: input.cases.map((testCase) => testCase.caseId),
      cases, candidates, mutationControls, mutations, policies,
      summary: input.summary,
      passed: input.passed,
      failureReasons: input.failureReasons,
    }),
  };
}

export async function runNarrativeBenchmarkV3(
  rawCases: NarrativeEvidenceCaseV3[],
  options: NarrativeBenchmarkOptionsV3 = {}
): Promise<NarrativeBenchmarkResultV3> {
  const cases = validateCases(rawCases);
  const runCandidate = options.runCandidate ?? ((testCase) => runAutonomousNarrativeV3(
    testCase, { writer: options.writer, critic: options.critic }
  ));
  const runControl = options.runMutationControl ?? ((testCase) => runAutonomousNarrativeV3(
    testCase, { writer: options.writer, critic: options.critic }
  ));
  const runMutation = options.runMutation ?? ((testCase, control, kind) => (
    runNarrativeMutationProbeV3(testCase, control, kind, options.critic)
  ));

  const candidates: NarrativeBenchmarkCandidateV3[] = [];
  for (const testCase of cases) {
    for (let candidateIndex = 1; candidateIndex <= 3; candidateIndex += 1) {
      const candidate = await runCandidate(testCase, candidateIndex);
      if (candidate.caseId !== testCase.caseId) {
        throw new Error(`candidate case mismatch for ${testCase.caseId}`);
      }
      candidates.push({
        caseId: testCase.caseId,
        city: testCase.city,
        candidateIndex,
        artifact: candidate,
      });
    }
  }

  const mutationControls: NarrativeBenchmarkMutationControlV3[] = [];
  const mutations: NarrativeBenchmarkMutationProbeV3[] = [];
  for (const testCase of cases) {
    const control = await runControl(testCase);
    if (control.caseId !== testCase.caseId) {
      throw new Error(`mutation control case mismatch for ${testCase.caseId}`);
    }
    mutationControls.push({ caseId: testCase.caseId, artifact: control });
    for (const kind of NARRATIVE_MUTATION_KINDS_V3) {
      mutations.push(control.outcome.type === 'machine_approved'
        ? await runMutation(testCase, control, kind)
        : notRunProbe(testCase, kind));
    }
  }

  const evaluated = evaluateBenchmark(cases, candidates, mutationControls, mutations);
  const input = {
    cases, candidates, mutationControls, mutations,
    summary: evaluated.summary,
    passed: evaluated.passed,
    failureReasons: evaluated.failureReasons,
  };
  return {
    schemaVersion: NARRATIVE_BENCHMARK_SCHEMA_VERSION_V3,
    caseIds: cases.map((testCase) => testCase.caseId),
    candidates,
    mutationControls,
    mutations,
    ...evaluated,
    fingerprints: fingerprints(input),
  };
}

export function replayNarrativeBenchmarkV3(
  result: NarrativeBenchmarkResultV3,
  rawCases: NarrativeEvidenceCaseV3[]
): NarrativeBenchmarkResultV3 {
  const cases = validateCases(rawCases);
  if (result.schemaVersion !== NARRATIVE_BENCHMARK_SCHEMA_VERSION_V3
    || result.caseIds.join(',') !== cases.map((testCase) => testCase.caseId).join(',')
    || result.candidates.length !== 9 || result.mutationControls.length !== 3
    || result.mutations.length !== 12) {
    throw new Error('invalid autonomous narrative benchmark v3');
  }
  for (const testCase of cases) {
    const candidates = result.candidates.filter((item) => item.caseId === testCase.caseId);
    if (candidates.length !== 3
      || candidates.map((item) => item.candidateIndex).join(',') !== '1,2,3') {
      throw new Error(`benchmark candidate set changed for ${testCase.caseId}`);
    }
    candidates.forEach((candidate) => replayAutonomousNarrativeArtifactV3(
      candidate.artifact, testCase
    ));
    const control = result.mutationControls.find((item) => item.caseId === testCase.caseId);
    if (!control) throw new Error(`benchmark mutation control missing for ${testCase.caseId}`);
    replayAutonomousNarrativeArtifactV3(control.artifact, testCase);
    const probes = result.mutations.filter((item) => item.caseId === testCase.caseId);
    if (probes.length !== NARRATIVE_MUTATION_KINDS_V3.length
      || probes.map((probe) => probe.mutation).join(',')
        !== NARRATIVE_MUTATION_KINDS_V3.join(',')) {
      throw new Error(`benchmark mutation set changed for ${testCase.caseId}`);
    }
    for (const probe of probes) {
      if (control.artifact.outcome.type !== 'machine_approved') {
        if (probe.status !== 'not_run' || probe.report !== null
          || probe.factualDetection || probe.diagnostic !== 'mutation_control_not_approved') {
          throw new Error(`benchmark unavailable mutation changed for ${testCase.caseId}`);
        }
        continue;
      }
      let reasons: NarrativeCriticGateReasonV3[] = [];
      if (probe.status === 'valid') {
        if (!probe.report || !control.artifact.plan) {
          throw new Error(`valid mutation report missing for ${testCase.caseId}:${probe.mutation}`);
        }
        const scripts = applyNarrativeMutationV3(
          control.artifact.scripts, testCase, probe.mutation
        );
        const criticRequest = buildNarrativeCriticRequestV3(
          control.artifact.request, control.artifact.plan, scripts
        );
        const report = validateNarrativeCriticReportV3(probe.report, criticRequest);
        reasons = evaluateNarrativeCriticGateV3(report).reasons;
      } else if (probe.report !== null || probe.factualDetection) {
        throw new Error(`failed mutation protocol changed for ${testCase.caseId}:${probe.mutation}`);
      }
      const factualDetection = probe.status === 'valid'
        && reasons.some((reason) => FACTUAL_REASONS.has(reason));
      if (editorialFingerprintV7(probe.rejectionReasons) !== editorialFingerprintV7(reasons)
        || probe.factualDetection !== factualDetection) {
        throw new Error(`benchmark mutation verdict changed for ${testCase.caseId}:${probe.mutation}`);
      }
    }
  }
  const evaluated = evaluateBenchmark(
    cases, result.candidates, result.mutationControls, result.mutations
  );
  const expectedFingerprints = fingerprints({
    cases,
    candidates: result.candidates,
    mutationControls: result.mutationControls,
    mutations: result.mutations,
    ...evaluated,
  });
  if (editorialFingerprintV7(result.summary) !== editorialFingerprintV7(evaluated.summary)
    || result.passed !== evaluated.passed
    || editorialFingerprintV7(result.failureReasons)
      !== editorialFingerprintV7(evaluated.failureReasons)
    || editorialFingerprintV7(result.fingerprints)
      !== editorialFingerprintV7(expectedFingerprints)) {
    throw new Error('narrative benchmark v3 gate or fingerprints changed');
  }
  return result;
}

function safeUnlink(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // Leaving a stale backup is safer than weakening an installed output pair.
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
  const moved: typeof backups = [];
  const installed: string[] = [];
  try {
    for (const output of outputs) mkdirSync(dirname(output.path), { recursive: true });
    for (const output of staged) {
      writeFileSync(output.temp, output.content, { encoding: 'utf8', flag: 'wx' });
    }
    for (const backup of backups) {
      if (backup.existed) {
        renameSync(backup.path, backup.backup);
        moved.push(backup);
      }
    }
    for (const output of staged) {
      renameSync(output.temp, output.path);
      installed.push(output.path);
    }
    backups.forEach((backup) => safeUnlink(backup.backup));
  } catch (error) {
    staged.forEach((output) => safeUnlink(output.temp));
    installed.forEach(safeUnlink);
    for (const backup of moved) {
      if (existsSync(backup.backup)) renameSync(backup.backup, backup.path);
    }
    throw error;
  }
}

export function freezeApprovedNarrativeBenchmarkV3(
  result: NarrativeBenchmarkResultV3,
  rawCases: NarrativeEvidenceCaseV3[],
  options: NarrativeBenchmarkFreezeOptionsV3
): void {
  if (!result.passed) throw new Error('only a passing benchmark can be frozen');
  const cases = validateCases(rawCases);
  replayNarrativeBenchmarkV3(result, cases);
  const selectedCase = cases.find((testCase) => testCase.caseId === options.selectedCaseId);
  const selected = result.candidates
    .filter((candidate) => candidate.caseId === options.selectedCaseId
      && candidate.artifact.outcome.type === 'machine_approved')
    .sort((left, right) => left.candidateIndex - right.candidateIndex)[0];
  if (!selectedCase || !selected) {
    throw new Error('passing benchmark has no approved candidate for selected case');
  }
  atomicWritePair([
    { path: options.benchmarkPath, content: `${JSON.stringify(result, null, 2)}\n` },
    {
      path: options.candidatePath,
      content: serializeMachineApprovedNarrativeArtifactV3(selected.artifact, selectedCase),
    },
  ]);
}
