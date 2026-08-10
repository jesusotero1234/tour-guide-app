import { mkdtempSync, readFileSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import {
  AutonomousNarrativeArtifactV3,
  AutonomousNarrativeServicesV3,
  runAutonomousNarrativeV3,
} from './AutonomousNarrativeV3';
import {
  NarrativeClaimPlanV3,
  buildNarrativeScriptRequestV3,
  canonicalizeNarrativeClaimPlanV3,
  materializeNarrativeScriptsV3,
} from './NarrativeContractsV3';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { NarrativeEvidenceCaseV3, buildNarrativeEvidenceCaseFromOfficialFactsV3 } from './NarrativeEvidenceV3';
import { loadNarrativeBenchmarkCaseV2 } from './NarrativeBenchmarkCaseV2';
import {
  NARRATIVE_MUTATION_KINDS_V3,
  NarrativeBenchmarkMutationProbeV3,
  freezeApprovedNarrativeBenchmarkV3,
  runNarrativeBenchmarkV3,
} from './NarrativeBenchmarkV3';
import { NarrativeBlockKindV1 } from './NarrativePilotV1';

const ROOT = join(__dirname, '..', '..', '..');
const CASES = ['paris', 'madrid', 'berlin'].map((city) => (
  buildNarrativeEvidenceCaseFromOfficialFactsV3(loadNarrativeBenchmarkCaseV2(join(
    ROOT, 'fixtures', 'narrative-benchmark-v2', 'cases', `${city}-history-es.json`
  )))
));
const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];

function artifact(
  testCase: NarrativeEvidenceCaseV3,
  outcome: 'machine_approved' | 'rejected',
  latencyMs = 10
): AutonomousNarrativeArtifactV3 {
  const record = {
    status: 'valid' as const,
    attempts: [{
      attempt: 1, status: 'valid' as const, latencyMs, rawOutput: '{}', error: null,
    }],
    model: 'test-model', promptFingerprint: 'a'.repeat(64),
    responseFingerprint: 'b'.repeat(64), protocolCallCount: 1, report: null,
  };
  return {
    schemaVersion: 'autonomous-narrative-artifact-v3',
    caseId: testCase.caseId,
    request: {} as never,
    evidenceCaseFingerprint: 'a'.repeat(64),
    plan: null,
    scripts: [],
    planAttempts: [{
      contentAttempt: 1, repairSceneIds: [], repairInstructions: [], plan: null,
      generation: record, grounding: record,
    }],
    proseAttempts: [{
      contentAttempt: 1, repairSceneIds: [], repairInstructions: [], scripts: [],
      generation: record, critique: record,
    }],
    writerModel: { provider: 'deepseek', model: 'test-model' },
    criticModel: {
      name: 'gemma4:12b', digest: '4'.repeat(64), parameterSize: '12B',
      quantizationLevel: 'Q4_K_M', sizeBytes: 8_000, sizeVramBytes: 8_000, fullyGpu: true,
    },
    outcome: outcome === 'machine_approved'
      ? { type: 'machine_approved' }
      : { type: 'rejected', failure: {
        stage: 'final_critique', code: 'critic_rejected', contentAttempt: 2, message: 'rejected',
      } },
    fingerprints: {} as never,
  };
}

function probe(
  testCase: NarrativeEvidenceCaseV3,
  mutation: typeof NARRATIVE_MUTATION_KINDS_V3[number],
  factualDetection = true
): NarrativeBenchmarkMutationProbeV3 {
  return {
    caseId: testCase.caseId,
    mutation,
    status: 'valid',
    report: null,
    attempts: [{
      attempt: 1, status: 'valid', latencyMs: 10, rawOutput: '{}', error: null,
    }],
    rejectionReasons: factualDetection
      ? ['new_claim', 'critical_unsupported_claim']
      : ['dimension_below_4'],
    factualDetection,
    diagnostic: null,
  };
}

function validCall<T>(value: T): EditorialCallResultV6<T> {
  return {
    callId: 'benchmark-v3-test', status: 'valid', value,
    attempts: [{
      attempt: 1, status: 'valid', latencyMs: 10,
      rawOutput: JSON.stringify(value), error: null,
    }],
    model: 'test-model', promptFingerprint: 'a'.repeat(64),
    responseFingerprint: 'b'.repeat(64), inputCharacters: 1, schemaCharacters: 1,
    input: {}, rawOutput: JSON.stringify(value),
  };
}

async function replayableArtifact(
  testCase: NarrativeEvidenceCaseV3
): Promise<AutonomousNarrativeArtifactV3> {
  const request = buildNarrativeScriptRequestV3(testCase);
  const plan: NarrativeClaimPlanV3 = canonicalizeNarrativeClaimPlanV3({
    schemaVersion: 'narrative-claim-plan-draft-v3',
    scenes: request.scenes.map((scene) => {
      const byRole = new Map(scene.evidenceFacts.map((fact) => [fact.role, fact]));
      return {
        sceneId: scene.sceneId,
        openingType: 'architectural_reversal',
        blocks: BLOCKS.map((kind) => ({
          kind,
          purpose: `Propósito ${kind}`,
          claims: kind === 'opening' ? [{
            text: 'Hecho histórico.', relation: 'direct',
            evidenceFactIds: [byRole.get('historical')!.factId],
          }] : kind === 'look' ? [{
            text: 'Detalle observable.', relation: 'direct',
            evidenceFactIds: [byRole.get('observable')!.factId],
          }] : kind === 'human_conflict' ? [{
            text: 'Acción humana.', relation: 'direct',
            evidenceFactIds: [byRole.get('human')!.factId],
          }] : [],
        })),
      };
    }),
  }, request);
  const vocabulary = ['la', 'historia', 'de', 'este', 'lugar', 'se', 'entiende', 'con', 'una', 'mirada'];
  const scripts = materializeNarrativeScriptsV3({
    schemaVersion: 'narrative-prose-draft-v3',
    scripts: request.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      blocks: BLOCKS.map((kind, blockIndex) => {
        const count = blockIndex === 0 ? 25 : 45;
        const words = Array.from({ length: count }, (_, index) => (
          kind === 'look' && index === 0 ? 'Mira' : vocabulary[index % vocabulary.length]
        ));
        words[0] = `${words[0][0].toUpperCase()}${words[0].slice(1)}`;
        words[words.length - 1] += '.';
        return { kind, text: words.join(' ') };
      }),
    })),
  }, request, plan);
  const services: AutonomousNarrativeServicesV3 = {
    inspectCriticModel: async () => ({
      name: 'gemma4:12b', digest: '4'.repeat(64), parameterSize: '12B',
      quantizationLevel: 'Q4_K_M', sizeBytes: 8_000, sizeVramBytes: 8_000, fullyGpu: true,
    }),
    generatePlan: async () => validCall(plan),
    critiquePlan: async () => validCall({
      schemaVersion: 'narrative-grounding-critic-report-v3',
      unsupportedClaims: [], improperCausality: [], misleadingOmissions: [],
    }),
    generateProse: async () => validCall(scripts),
    critiqueProse: async () => validCall({
      schemaVersion: 'narrative-critic-report-v3',
      newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
      scores: {
        dimensions: {
          curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4,
          progression: 4,
        },
        scenes: request.scenes.map((scene) => ({
          sceneId: scene.sceneId, score: 4, rationale: 'Cumple.',
        })),
      },
    }),
  };
  return runAutonomousNarrativeV3(testCase, { services });
}

function validFactualProbe(
  testCase: NarrativeEvidenceCaseV3,
  kind: typeof NARRATIVE_MUTATION_KINDS_V3[number]
): NarrativeBenchmarkMutationProbeV3 {
  const report = {
    schemaVersion: 'narrative-critic-report-v3' as const,
    newClaims: [{
      sceneId: testCase.scenes[0].sceneId,
      location: 'opening' as const,
      severity: 'critical' as const,
      claim: 'Claim mutado.',
      detail: 'No figura en el plan.',
    }],
    distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: testCase.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Informe válido.',
      })),
    },
  };
  return {
    caseId: testCase.caseId, mutation: kind, status: 'valid', report,
    attempts: [{
      attempt: 1, status: 'valid', latencyMs: 10,
      rawOutput: JSON.stringify(report), error: null,
    }],
    rejectionReasons: ['new_claim', 'critical_unsupported_claim'],
    factualDetection: true,
    diagnostic: null,
  };
}

const passing = Object.fromEntries(CASES.map((testCase, index) => [
  testCase.caseId,
  index === 2
    ? ['machine_approved', 'machine_approved', 'rejected']
    : ['machine_approved', 'machine_approved', 'machine_approved'],
])) as Record<string, Array<'machine_approved' | 'rejected'>>;

describe('NarrativeBenchmarkV3', () => {
  it('runs a closed sequential 8-of-9 qualification with independent mutation controls', async () => {
    const order: string[] = [];
    const mutationOrder: string[] = [];
    const result = await runNarrativeBenchmarkV3(CASES, {
      runCandidate: async (testCase, index) => {
        order.push(`${testCase.caseId}:${index}`);
        return artifact(testCase, passing[testCase.caseId][index - 1]);
      },
      runMutationControl: async (testCase) => artifact(testCase, 'machine_approved'),
      runMutation: async (testCase, _control, kind) => {
        mutationOrder.push(`${testCase.caseId}:${kind}`);
        return probe(testCase, kind);
      },
    });

    expect(order).toEqual(CASES.flatMap((testCase) => [1, 2, 3]
      .map((index) => `${testCase.caseId}:${index}`)));
    expect(mutationOrder).toHaveLength(12);
    expect(result.passed).toBe(true);
    expect(result.summary.approvedCandidates).toBe(8);
    expect(result.summary.factualMutationDetections).toBe(12);
  });

  it('still executes mutation controls when every candidate in a city is rejected', async () => {
    const statuses = structuredClone(passing);
    statuses[CASES[0].caseId] = ['rejected', 'rejected', 'rejected'];
    const runMutation = jest.fn(async (testCase, _control, kind) => probe(testCase, kind));
    const result = await runNarrativeBenchmarkV3(CASES, {
      runCandidate: async (testCase, index) => artifact(
        testCase, statuses[testCase.caseId][index - 1]
      ),
      runMutationControl: async (testCase) => artifact(testCase, 'machine_approved'),
      runMutation,
    });

    expect(runMutation).toHaveBeenCalledTimes(12);
    expect(result.mutations.filter((item) => item.caseId === CASES[0].caseId)
      .every((item) => item.status === 'valid')).toBe(true);
    expect(result.passed).toBe(false);
  });

  it('rejects 7 of 9 and never counts protocol failure as factual detection', async () => {
    const statuses = structuredClone(passing);
    statuses[CASES[0].caseId] = ['machine_approved', 'rejected', 'rejected'];
    statuses[CASES[2].caseId] = ['machine_approved', 'machine_approved', 'machine_approved'];
    const result = await runNarrativeBenchmarkV3(CASES, {
      runCandidate: async (testCase, index) => artifact(
        testCase, statuses[testCase.caseId][index - 1]
      ),
      runMutationControl: async (testCase) => artifact(testCase, 'machine_approved'),
      runMutation: async (testCase, _control, kind) => (
        testCase.caseId === CASES[1].caseId && kind === 'false_character'
          ? {
            ...probe(testCase, kind, false), status: 'transport_error' as const,
            attempts: [{
              attempt: 1, status: 'transport_error' as const, latencyMs: 10,
              rawOutput: null, error: 'offline',
            }],
          }
          : probe(testCase, kind)
      ),
    });

    expect(result.summary.approvedCandidates).toBe(7);
    expect(result.summary.factualMutationDetections).toBe(11);
    expect(result.failureReasons).toEqual(expect.arrayContaining([
      'approved_candidates_below_8',
      `approved_candidates_below_2:${CASES[0].caseId}`,
      `mutation_not_factually_rejected:${CASES[1].caseId}:false_character`,
    ]));
  });

  it('marks unavailable independent controls as not_run, not transport success', async () => {
    const result = await runNarrativeBenchmarkV3(CASES, {
      runCandidate: async (testCase, index) => artifact(
        testCase, passing[testCase.caseId][index - 1]
      ),
      runMutationControl: async (testCase) => artifact(
        testCase, testCase.caseId === CASES[0].caseId ? 'rejected' : 'machine_approved'
      ),
      runMutation: async (testCase, _control, kind) => probe(testCase, kind),
    });

    const unavailable = result.mutations.filter((item) => item.caseId === CASES[0].caseId);
    expect(unavailable.every((item) => item.status === 'not_run')).toBe(true);
    expect(unavailable.every((item) => item.diagnostic === 'mutation_control_not_approved'))
      .toBe(true);
  });

  it('does not create or overwrite outputs when qualification fails', async () => {
    const result = await runNarrativeBenchmarkV3(CASES, {
      runCandidate: async (testCase) => artifact(testCase, 'rejected'),
      runMutationControl: async (testCase) => artifact(testCase, 'rejected'),
    });
    const directory = mkdtempSync(join(tmpdir(), 'narrative-v3-failed-'));
    const benchmarkPath = join(directory, 'benchmark.json');
    const candidatePath = join(directory, 'candidate.json');
    writeFileSync(benchmarkPath, 'old benchmark', 'utf8');
    writeFileSync(candidatePath, 'old candidate', 'utf8');

    expect(() => freezeApprovedNarrativeBenchmarkV3(result, CASES, {
      benchmarkPath, candidatePath, selectedCaseId: CASES[1].caseId,
    })).toThrow('passing benchmark');
    expect(readFileSync(benchmarkPath, 'utf8')).toBe('old benchmark');
    expect(readFileSync(candidatePath, 'utf8')).toBe('old candidate');
  });

  it('atomically installs a replayable benchmark and the lowest Madrid candidate', async () => {
    const artifacts = new Map<string, AutonomousNarrativeArtifactV3>();
    for (const testCase of CASES) {
      artifacts.set(testCase.caseId, await replayableArtifact(testCase));
    }
    const result = await runNarrativeBenchmarkV3(CASES, {
      runCandidate: async (testCase) => artifacts.get(testCase.caseId)!,
      runMutationControl: async (testCase) => artifacts.get(testCase.caseId)!,
      runMutation: async (testCase, _control, kind) => validFactualProbe(testCase, kind),
    });
    const directory = mkdtempSync(join(tmpdir(), 'narrative-v3-passing-'));
    const benchmarkPath = join(directory, 'benchmark.json');
    const candidatePath = join(directory, 'candidate.json');
    writeFileSync(benchmarkPath, 'old benchmark', 'utf8');
    writeFileSync(candidatePath, 'old candidate', 'utf8');

    freezeApprovedNarrativeBenchmarkV3(result, CASES, {
      benchmarkPath,
      candidatePath,
      selectedCaseId: CASES[1].caseId,
    });

    expect(JSON.parse(readFileSync(benchmarkPath, 'utf8'))).toMatchObject({ passed: true });
    expect(JSON.parse(readFileSync(candidatePath, 'utf8'))).toMatchObject({
      caseId: CASES[1].caseId,
      outcome: { type: 'machine_approved' },
    });
  });
});
