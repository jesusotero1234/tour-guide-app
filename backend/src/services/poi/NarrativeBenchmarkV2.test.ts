import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AutonomousNarrativeArtifactV2,
  AutonomousNarrativeServicesV2,
  runAutonomousNarrativeV2,
} from './AutonomousNarrativeV2';
import {
  NarrativeBenchmarkCaseV2,
  buildNarrativeScriptRequestFromCaseV2,
  loadNarrativeBenchmarkCaseV2,
} from './NarrativeBenchmarkCaseV2';
import {
  NarrativeBenchmarkMutationProbeV2,
  NARRATIVE_MUTATION_KINDS_V2,
  freezeApprovedNarrativeBenchmarkV2,
  replayNarrativeBenchmarkV2,
  runNarrativeBenchmarkV2,
} from './NarrativeBenchmarkV2';
import {
  NarrativeClaimPlanV1,
  canonicalizeNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import {
  NarrativeCriticReportV2,
  NarrativeGroundingCriticReportV1,
} from './NarrativePilotCriticV2';
import {
  NarrativeBlockKindV1,
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
} from './NarrativePilotV1';
import { materializeNarrativeScriptsV2 } from './NarrativeProseV2';

const ROOT = join(__dirname, '..', '..', '..');
const CASES = ['paris-history-es.json', 'madrid-history-es.json', 'berlin-history-es.json']
  .map((name) => loadNarrativeBenchmarkCaseV2(join(
    ROOT, 'fixtures', 'narrative-benchmark-v2', 'cases', name
  )));
const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const VOCABULARY = [
  ['catedral', 'isla', 'piedra', 'torre', 'fachada', 'templo', 'orilla', 'campana'],
  ['palacio', 'foso', 'museo', 'patio', 'galería', 'fortaleza', 'colección', 'público'],
  ['jardín', 'cafés', 'arcadas', 'comercio', 'paseo', 'foro', 'columnas', 'plaza'],
];
const LINKS = ['la', 'de', 'y', 'en', 'con', 'que', 'su', 'para'];

function fakeArtifact(
  testCase: NarrativeBenchmarkCaseV2,
  status: 'machine_approved' | 'rejected',
  latencyMs = 10,
  fullyGpu = true
): AutonomousNarrativeArtifactV2 {
  const record = {
    status: 'valid' as const,
    attempts: [{
      attempt: 1, status: 'valid' as const, latencyMs, rawOutput: '{}', error: null,
    }],
    promptFingerprint: 'a'.repeat(64), responseFingerprint: 'b'.repeat(64),
    protocolCallCount: 1, report: null,
  };
  return {
    schemaVersion: 'autonomous-narrative-artifact-v2', caseId: testCase.caseId,
    request: {} as NarrativeScriptRequestV1, sourceEvidence: [], plan: null, scripts: [],
    planAttempts: [{
      contentAttempt: 1, repairInstructions: [], plan: null,
      generation: { status: 'valid', attempts: [], promptFingerprint: 'a', responseFingerprint: 'b' },
      grounding: record,
    }],
    proseAttempts: [{
      contentAttempt: 1, repairInstructions: [], scripts: [],
      generation: { status: 'valid', attempts: [], promptFingerprint: 'c', responseFingerprint: 'd' },
      critique: record,
    }],
    criticModel: {
      name: 'gemma4:12b', digest: '4'.repeat(64), parameterSize: '12B',
      quantizationLevel: 'Q4_K_M', sizeBytes: 8_000,
      sizeVramBytes: fullyGpu ? 8_000 : 4_000, fullyGpu: true,
    },
    status,
    failure: status === 'rejected'
      ? { stage: 'final_critique', code: 'critic_rejected', contentAttempt: 2, message: 'rejected' }
      : null,
    fingerprints: {
      route: '1'.repeat(64), evidence: '2'.repeat(64), evidenceProvenance: '3'.repeat(64),
      plan: '4'.repeat(64), text: '5'.repeat(64),
      prompts: {
        planGenerator: '6'.repeat(64), groundingCritic: '7'.repeat(64),
        proseGenerator: '8'.repeat(64), finalCritic: '9'.repeat(64),
      },
      models: {
        planGenerator: 'a'.repeat(64), groundingCritic: 'b'.repeat(64),
        proseGenerator: 'c'.repeat(64), finalCritic: 'd'.repeat(64),
      },
      parameters: {
        planGenerator: 'e'.repeat(64), groundingCritic: 'f'.repeat(64),
        proseGenerator: '0'.repeat(64), finalCritic: '1'.repeat(64),
      },
      policies: '2'.repeat(64),
      critiques: { grounding: '3'.repeat(64), final: '4'.repeat(64) },
    },
  };
}

function criticReport(testCase: NarrativeBenchmarkCaseV2, factual = true): NarrativeCriticReportV2 {
  const report: NarrativeCriticReportV2 = {
    schemaVersion: 'narrative-critic-report-v2',
    newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: factual ? 4 : 3,
        humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: testCase.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Informe válido.',
      })),
    },
    premiumReadiness: 4,
    repairInstructions: ['Rechazar la mutación.'],
  };
  if (factual) report.newClaims.push({
    sceneId: testCase.scenes[0].sceneId,
    location: 'opening', severity: 'critical', claim: 'Claim mutado.',
    detail: 'No aparece en el plan aprobado.',
  });
  return report;
}

function mutationProbe(
  testCase: NarrativeBenchmarkCaseV2,
  kind: typeof NARRATIVE_MUTATION_KINDS_V2[number],
  options: { factual?: boolean; status?: 'valid' | 'transport_error'; latencyMs?: number } = {}
): NarrativeBenchmarkMutationProbeV2 {
  const status = options.status ?? 'valid';
  const report = status === 'valid' ? criticReport(testCase, options.factual ?? true) : null;
  return {
    caseId: testCase.caseId,
    mutation: kind,
    status,
    report,
    attempts: [{
      attempt: 1, status, latencyMs: options.latencyMs ?? 10,
      rawOutput: report ? JSON.stringify(report) : null,
      error: report ? null : 'transport failed',
    }],
    rejectionReasons: report
      ? (options.factual ?? true ? ['new_claim', 'critical_unsupported_claim'] : ['dimension_below_4'])
      : [],
    factualDetection: status === 'valid' && (options.factual ?? true),
  };
}

function candidateRunner(statuses: Record<string, Array<'machine_approved' | 'rejected'>>) {
  return jest.fn(async (testCase: NarrativeBenchmarkCaseV2, candidateIndex: number) => (
    fakeArtifact(testCase, statuses[testCase.caseId][candidateIndex - 1])
  ));
}

function approvedPlan(request: NarrativeScriptRequestV1): NarrativeClaimPlanV1 {
  const openings = ['rescue_decision', 'architectural_reversal', 'dated_public_action'];
  return canonicalizeNarrativeClaimPlanV1({
    schemaVersion: 'narrative-claim-plan-draft-v1',
    scenes: request.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      openingType: openings[sceneIndex],
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind,
        claims: [{
          text: `Claim aprobado ${blockIndex + 1}`,
          relation: blockIndex === 3 ? 'interpretation' : 'direct',
          evidenceFactIds: [scene.evidenceFacts[blockIndex % 4].factId],
        }],
      })),
    })),
  }, request);
}

function blockText(scene: number, block: number): string {
  const words = Array.from({ length: 42 }, (_, index) => {
    if (block === 1 && index === 0) return 'Mira';
    return index % 2 === 0 ? VOCABULARY[scene][(index + block) % 8] : LINKS[(index + block) % 8];
  });
  words[41] += '.';
  return words.join(' ');
}

function transitionText(scene: number, target: string | null): string {
  const words = target
    ? ['Continúa', 'ahora', 'hacia', target]
    : ['Aquí', 'termina', 'nuestro', 'recorrido'];
  while (words.length < 22) {
    const index = words.length;
    words.push(index % 2 === 0 ? LINKS[index % 8] : VOCABULARY[scene][index % 8]);
  }
  words[21] += '.';
  return words.join(' ');
}

function call<T>(value: T): EditorialCallResultV6<T> {
  return {
    callId: 'benchmark-test-call', status: 'valid', value,
    attempts: [{
      attempt: 1, status: 'valid', latencyMs: 10,
      rawOutput: JSON.stringify(value), error: null,
    }],
    model: 'test-model', promptFingerprint: 'a'.repeat(64),
    responseFingerprint: 'b'.repeat(64), inputCharacters: 1, schemaCharacters: 1,
    input: {}, rawOutput: JSON.stringify(value),
  };
}

function approvedServices(testCase: NarrativeBenchmarkCaseV2): AutonomousNarrativeServicesV2 {
  const request = buildNarrativeScriptRequestFromCaseV2(testCase);
  const plan = approvedPlan(request);
  const scripts = materializeNarrativeScriptsV2({
    schemaVersion: 'narrative-prose-draft-v2',
    scripts: request.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind, text: blockText(sceneIndex, blockIndex),
      })),
      transitionText: transitionText(sceneIndex, scene.nextSceneId),
    })),
  }, request, plan);
  const groundingReport: NarrativeGroundingCriticReportV1 = {
    schemaVersion: 'narrative-grounding-critic-report-v1',
    unsupportedClaims: [], improperCausality: [], misleadingOmissions: [], repairInstructions: [],
  };
  const finalReport: NarrativeCriticReportV2 = {
    schemaVersion: 'narrative-critic-report-v2',
    newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: request.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Cumple.',
      })),
    },
    premiumReadiness: 4,
    repairInstructions: [],
  };
  return {
    inspectCriticModel: async () => ({
      name: 'gemma4:12b', digest: '4'.repeat(64), parameterSize: '12B',
      quantizationLevel: 'Q4_K_M', sizeBytes: 8_000, sizeVramBytes: 8_000, fullyGpu: true,
    }),
    generatePlan: async () => call(plan),
    critiquePlan: async () => call(groundingReport),
    generateProse: async () => call(scripts),
    critiqueProse: async () => call(finalReport),
  };
}

const passingStatuses = Object.fromEntries(CASES.map((testCase, caseIndex) => [
  testCase.caseId,
  caseIndex === 2
    ? ['machine_approved', 'machine_approved', 'rejected']
    : ['machine_approved', 'machine_approved', 'machine_approved'],
])) as Record<string, Array<'machine_approved' | 'rejected'>>;

describe('NarrativeBenchmarkV2', () => {
  it('runs exactly three candidates per case sequentially and passes at 8 of 9', async () => {
    const order: string[] = [];
    const runCandidate = jest.fn(async (testCase: NarrativeBenchmarkCaseV2, index: number) => {
      order.push(`${testCase.caseId}:${index}`);
      return fakeArtifact(testCase, passingStatuses[testCase.caseId][index - 1]);
    });
    const result = await runNarrativeBenchmarkV2(CASES, {
      runCandidate,
      runMutation: async (testCase, _artifact, kind) => mutationProbe(testCase, kind),
    });

    expect(order).toEqual(CASES.flatMap((testCase) => [1, 2, 3]
      .map((index) => `${testCase.caseId}:${index}`)));
    expect(result.passed).toBe(true);
    expect(result.summary.approvedCandidates).toBe(8);
    expect(result.summary.approvedByCase).toEqual(Object.fromEntries(CASES.map((testCase, index) => [
      testCase.caseId, index === 2 ? 2 : 3,
    ])));
    expect(result.mutations).toHaveLength(12);
  });

  it('rejects 7 of 9 and reports the per-case 2 of 3 gate separately', async () => {
    const statuses = structuredClone(passingStatuses);
    statuses[CASES[0].caseId] = ['machine_approved', 'rejected', 'rejected'];
    statuses[CASES[2].caseId] = ['machine_approved', 'machine_approved', 'machine_approved'];
    const result = await runNarrativeBenchmarkV2(CASES, {
      runCandidate: candidateRunner(statuses),
      runMutation: async (testCase, _artifact, kind) => mutationProbe(testCase, kind),
    });

    expect(result.passed).toBe(false);
    expect(result.summary.approvedCandidates).toBe(7);
    expect(result.failureReasons).toEqual(expect.arrayContaining([
      'approved_candidates_below_8', `approved_candidates_below_2:${CASES[0].caseId}`,
    ]));
  });

  it('does not count transport or malformed mutation output as detection', async () => {
    const result = await runNarrativeBenchmarkV2(CASES, {
      runCandidate: candidateRunner(passingStatuses),
      runMutation: async (testCase, _artifact, kind) => (
        testCase.caseId === CASES[1].caseId && kind === 'false_character'
          ? mutationProbe(testCase, kind, { status: 'transport_error' })
          : mutationProbe(testCase, kind)
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.summary.factualMutationDetections).toBe(11);
    expect(result.failureReasons).toContain(`mutation_not_factually_rejected:${CASES[1].caseId}:false_character`);
  });

  it('does not accept a style-only rejection as a factual mutation detection', async () => {
    const result = await runNarrativeBenchmarkV2(CASES, {
      runCandidate: candidateRunner(passingStatuses),
      runMutation: async (testCase, _artifact, kind) => (
        testCase.caseId === CASES[0].caseId && kind === 'invented_causality'
          ? mutationProbe(testCase, kind, { factual: false })
          : mutationProbe(testCase, kind)
      ),
    });

    expect(result.passed).toBe(false);
    expect(result.failureReasons).toContain(
      `mutation_not_factually_rejected:${CASES[0].caseId}:invented_causality`
    );
  });

  it('rejects partial GPU residency and any critique at or above 180 seconds', async () => {
    const partialGpu = await runNarrativeBenchmarkV2(CASES, {
      runCandidate: async (testCase, index) => fakeArtifact(
        testCase, passingStatuses[testCase.caseId][index - 1], 10,
        testCase.caseId !== CASES[0].caseId
      ),
      runMutation: async (testCase, _artifact, kind) => mutationProbe(testCase, kind),
    });
    expect(partialGpu.failureReasons).toContain('critic_not_fully_gpu');

    const slow = await runNarrativeBenchmarkV2(CASES, {
      runCandidate: candidateRunner(passingStatuses),
      runMutation: async (testCase, _artifact, kind) => mutationProbe(
        testCase, kind, { latencyMs: kind === 'cross_scene_attribution' ? 180_000 : 10 }
      ),
    });
    expect(slow.failureReasons).toContain('critic_latency_at_or_above_180_seconds');
  });

  it('does not create or overwrite either freeze output after a failed benchmark', async () => {
    const statuses = structuredClone(passingStatuses);
    statuses[CASES[0].caseId] = ['rejected', 'rejected', 'rejected'];
    const result = await runNarrativeBenchmarkV2(CASES, {
      runCandidate: candidateRunner(statuses),
      runMutation: async (testCase, _artifact, kind) => mutationProbe(testCase, kind),
    });
    const directory = mkdtempSync(join(tmpdir(), 'narrative-benchmark-fail-'));
    const benchmarkPath = join(directory, 'benchmark.json');
    const candidatePath = join(directory, 'candidate.json');
    writeFileSync(benchmarkPath, 'old benchmark', 'utf8');
    writeFileSync(candidatePath, 'old candidate', 'utf8');

    expect(() => freezeApprovedNarrativeBenchmarkV2(result, CASES, {
      benchmarkPath, candidatePath, selectedCaseId: CASES[0].caseId,
    })).toThrow('passing benchmark');
    expect(readFileSync(benchmarkPath, 'utf8')).toBe('old benchmark');
    expect(readFileSync(candidatePath, 'utf8')).toBe('old candidate');
  });

  it('atomically replaces both outputs after a passing benchmark', async () => {
    const artifacts = new Map<string, AutonomousNarrativeArtifactV2>();
    for (const testCase of CASES) {
      artifacts.set(testCase.caseId, await runAutonomousNarrativeV2(testCase, {
        services: approvedServices(testCase),
      }));
    }
    const result = await runNarrativeBenchmarkV2(CASES, {
      runCandidate: async (testCase) => artifacts.get(testCase.caseId)!,
      runMutation: async (testCase, _artifact, kind) => mutationProbe(testCase, kind),
    });
    expect(replayNarrativeBenchmarkV2(result, CASES)).toEqual(result);
    const directory = mkdtempSync(join(tmpdir(), 'narrative-benchmark-pass-'));
    const benchmarkPath = join(directory, 'benchmark.json');
    const candidatePath = join(directory, 'candidate.json');
    writeFileSync(benchmarkPath, 'old benchmark', 'utf8');
    writeFileSync(candidatePath, 'old candidate', 'utf8');

    freezeApprovedNarrativeBenchmarkV2(result, CASES, {
      benchmarkPath, candidatePath, selectedCaseId: CASES[0].caseId,
    });

    expect(JSON.parse(readFileSync(benchmarkPath, 'utf8'))).toMatchObject({ passed: true });
    expect(JSON.parse(readFileSync(candidatePath, 'utf8'))).toMatchObject({
      caseId: CASES[0].caseId, status: 'machine_approved',
    });
  });
});
