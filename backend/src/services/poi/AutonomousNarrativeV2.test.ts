import {
  AutonomousNarrativeServicesV2,
  autonomousNarrativeFingerprintsV2,
  replayAutonomousNarrativeArtifactV2,
  runAutonomousNarrativeV2,
  serializeMachineApprovedNarrativeArtifactV2,
} from './AutonomousNarrativeV2';
import {
  NarrativeBenchmarkCaseV2,
  NarrativeSourceFactV2,
  buildNarrativeScriptRequestFromCaseV2,
  narrativeBenchmarkRouteFingerprintV2,
  narrativeSourceFactFingerprintV2,
} from './NarrativeBenchmarkCaseV2';
import {
  NarrativeClaimPlanV1,
  canonicalizeNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import {
  NarrativeCriticReportV2,
  NarrativeGroundingCriticReportV1,
} from './NarrativePilotCriticV2';
import { NarrativeCriticModelInfoV2 } from './NarrativePilotGemmaV2';
import {
  NarrativeBlockKindV1,
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
} from './NarrativePilotV1';
import { materializeNarrativeScriptsV2 } from './NarrativeProseV2';

const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const VOCABULARY = [
  ['catedral', 'isla', 'piedra', 'torre', 'fachada', 'templo', 'orilla', 'campana'],
  ['palacio', 'foso', 'museo', 'patio', 'galería', 'fortaleza', 'colección', 'público'],
  ['jardín', 'cafés', 'arcadas', 'comercio', 'paseo', 'foro', 'columnas', 'plaza'],
];
const LINKS = ['la', 'de', 'y', 'en', 'con', 'que', 'su', 'para'];

function sourceFact(sceneId: string, index: number): NarrativeSourceFactV2 {
  const content = {
    factId: `${sceneId}-fact-${index}`,
    ownerCanonicalId: `${sceneId}-owner`,
    originalExcerpt: `Fragmento original ${index} de ${sceneId}`,
    originalLanguage: 'es',
    normalizedEs: `Hecho histórico ${index} normalizado de ${sceneId}.`,
    sourceUrl: `https://official.example/${sceneId}`,
    sourceTitle: `Fuente oficial ${sceneId}`,
    capturedAt: '2026-08-09T00:00:00.000Z',
  };
  return { ...content, fingerprint: narrativeSourceFactFingerprintV2(content) };
}

function testCase(): NarrativeBenchmarkCaseV2 {
  const routeSceneIds = ['alpha', 'beta', 'gamma'];
  const scenes = routeSceneIds.map((sceneId, index) => ({
    sceneId,
    name: `Lugar ${sceneId}`,
    routePosition: index + 1,
    previousSceneId: routeSceneIds[index - 1] ?? null,
    nextSceneId: routeSceneIds[index + 1] ?? null,
    contribution: `Contribución ${sceneId}`,
    allowedProperNouns: [`Lugar ${sceneId}`, 'Xanadú'],
    evidenceFacts: [1, 2, 3, 4].map((factIndex) => sourceFact(sceneId, factIndex)),
  }));
  const value: NarrativeBenchmarkCaseV2 = {
    schemaVersion: 'narrative-benchmark-case-v2',
    caseId: 'unknown-history-es', city: 'Xanadú', theme: 'history', language: 'es-ES',
    promise: 'Comprender tres lugares mediante evidencia cerrada.',
    centralQuestion: '¿Cómo cambió esta ciudad?',
    routeFingerprint: '', routeSceneIds, scenes,
  };
  value.routeFingerprint = narrativeBenchmarkRouteFingerprintV2(value);
  return value;
}

function plan(request: NarrativeScriptRequestV1): NarrativeClaimPlanV1 {
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
  const words = target ? ['Continúa', 'ahora', 'hacia', target] : ['Aquí', 'termina', 'nuestro', 'recorrido'];
  while (words.length < 22) {
    const index = words.length;
    words.push(index % 2 === 0 ? LINKS[index % 8] : VOCABULARY[scene][index % 8]);
  }
  words[21] += '.';
  return words.join(' ');
}

function scripts(request: NarrativeScriptRequestV1, approvedPlan: NarrativeClaimPlanV1): SceneNarrativeScriptV1[] {
  return materializeNarrativeScriptsV2({
    schemaVersion: 'narrative-prose-draft-v2',
    scripts: request.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      blocks: BLOCKS.map((kind, blockIndex) => ({
        kind, text: blockText(sceneIndex, blockIndex),
      })),
      transitionText: transitionText(sceneIndex, scene.nextSceneId),
    })),
  }, request, approvedPlan);
}

function call<T>(
  value: T | null,
  status: 'valid' | 'transport_error' | 'malformed_response' | 'semantic_error' = 'valid',
  error: string | null = null
): EditorialCallResultV6<T> {
  return {
    callId: 'test-call', status, value,
    attempts: [{ attempt: 1, status, latencyMs: 10, rawOutput: value ? JSON.stringify(value) : '{}', error }],
    model: 'test-model', promptFingerprint: status === 'valid' ? 'a'.repeat(64) : 'b'.repeat(64),
    responseFingerprint: value ? 'c'.repeat(64) : null,
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: value ? JSON.stringify(value) : '{}',
  };
}

function grounding(approved = true): NarrativeGroundingCriticReportV1 {
  const report: NarrativeGroundingCriticReportV1 = {
    schemaVersion: 'narrative-grounding-critic-report-v1',
    unsupportedClaims: [], improperCausality: [], misleadingOmissions: [], repairInstructions: [],
  };
  if (!approved) {
    report.unsupportedClaims.push({
      sceneId: 'alpha', claimId: 'alpha:claim:01', severity: 'critical', detail: 'Sin apoyo.',
    });
    report.repairInstructions = ['Eliminar el claim sin apoyo.'];
  }
  return report;
}

function finalReport(request: NarrativeScriptRequestV1, approved = true): NarrativeCriticReportV2 {
  const report: NarrativeCriticReportV2 = {
    schemaVersion: 'narrative-critic-report-v2',
    newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: request.scenes.map((scene) => ({ sceneId: scene.sceneId, score: 4, rationale: 'Cumple.' })),
    },
    premiumReadiness: 4,
    repairInstructions: [],
  };
  if (!approved) {
    report.newClaims.push({
      sceneId: 'alpha', location: 'opening', severity: 'critical',
      claim: 'Claim nuevo.', detail: 'No figura en el plan.',
    });
    report.repairInstructions = ['Eliminar el claim nuevo.'];
  }
  return report;
}

const MODEL: NarrativeCriticModelInfoV2 = {
  name: 'gemma4:12b', digest: '4'.repeat(64), parameterSize: '12B',
  quantizationLevel: 'Q4_K_M', sizeBytes: 8_000, sizeVramBytes: 8_000, fullyGpu: true,
};

function services(input: {
  plans?: Array<EditorialCallResultV6<NarrativeClaimPlanV1>>;
  grounding?: Array<EditorialCallResultV6<NarrativeGroundingCriticReportV1>>;
  prose?: Array<EditorialCallResultV6<SceneNarrativeScriptV1[]>>;
  final?: Array<EditorialCallResultV6<NarrativeCriticReportV2>>;
  preflightError?: Error;
} = {}): AutonomousNarrativeServicesV2 {
  const benchmark = testCase();
  const request = buildNarrativeScriptRequestFromCaseV2(benchmark);
  const approvedPlan = plan(request);
  const approvedScripts = scripts(request, approvedPlan);
  const take = <T>(values: EditorialCallResultV6<T>[] | undefined, fallback: EditorialCallResultV6<T>) => (
    async () => values?.shift() ?? fallback
  );
  return {
    inspectCriticModel: jest.fn(async () => {
      if (input.preflightError) throw input.preflightError;
      return MODEL;
    }),
    generatePlan: jest.fn(take(input.plans, call(approvedPlan))),
    critiquePlan: jest.fn(take(input.grounding, call(grounding(true)))),
    generateProse: jest.fn(take(input.prose, call(approvedScripts))),
    critiqueProse: jest.fn(take(input.final, call(finalReport(request, true)))),
  };
}

describe('AutonomousNarrativeV2', () => {
  it('approves directly after exactly two DeepSeek and two Gemma stages', async () => {
    const mock = services();
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: mock });

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.planAttempts).toHaveLength(1);
    expect(artifact.proseAttempts).toHaveLength(1);
    expect(mock.generatePlan).toHaveBeenCalledTimes(1);
    expect(mock.critiquePlan).toHaveBeenCalledTimes(1);
    expect(mock.generateProse).toHaveBeenCalledTimes(1);
    expect(mock.critiqueProse).toHaveBeenCalledTimes(1);
  });

  it('repairs the full claim plan once without consuming the prose repair', async () => {
    const request = buildNarrativeScriptRequestFromCaseV2(testCase());
    const mock = services({ grounding: [
      call(grounding(false)), call(grounding(true)),
    ] });
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: mock });

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.planAttempts).toHaveLength(2);
    expect(artifact.planAttempts[1].repairInstructions).toEqual(['Eliminar el claim sin apoyo.']);
    expect(artifact.proseAttempts).toHaveLength(1);
    expect(artifact.scripts.map((script) => script.sceneId))
      .toEqual(request.scenes.map((scene) => scene.sceneId));
  });

  it('uses the single plan content repair for deterministic semantic failure', async () => {
    const mock = services({ plans: [
      call<NarrativeClaimPlanV1>(null, 'semantic_error', 'invalid evidence reference'),
    ] });
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: mock });

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.planAttempts).toHaveLength(2);
    expect(artifact.planAttempts[1].repairInstructions.join(' ')).toContain('invalid evidence reference');
  });

  it('repairs all prose once after final factual rejection', async () => {
    const request = buildNarrativeScriptRequestFromCaseV2(testCase());
    const mock = services({ final: [
      call(finalReport(request, false)), call(finalReport(request, true)),
    ] });
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: mock });

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.planAttempts).toHaveLength(1);
    expect(artifact.proseAttempts).toHaveLength(2);
    expect(artifact.proseAttempts[1].repairInstructions).toEqual(['Eliminar el claim nuevo.']);
  });

  it('uses the single prose content repair for deterministic semantic failure', async () => {
    const mock = services({ prose: [
      call<SceneNarrativeScriptV1[]>(null, 'semantic_error', 'block requires 42 to 45 space tokens'),
    ] });
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: mock });

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.proseAttempts).toHaveLength(2);
    expect(artifact.proseAttempts[1].repairInstructions.join(' ')).toContain('42 to 45');
  });

  it('rejects after a second content failure and never preserves approval', async () => {
    const mock = services({ grounding: [
      call(grounding(false)), call(grounding(false)),
    ] });
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: mock });

    expect(artifact.status).toBe('rejected');
    expect(artifact.failure).toMatchObject({
      stage: 'grounding_critique', code: 'critic_rejected', contentAttempt: 2,
    });
  });

  it('retries an invalid critic report as protocol without consuming content repair', async () => {
    const mock = services({ grounding: [
      call<NarrativeGroundingCriticReportV1>(null, 'semantic_error', 'invalid claim reference'),
      call(grounding(true)),
    ] });
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: mock });

    expect(artifact.status).toBe('machine_approved');
    expect(artifact.planAttempts).toHaveLength(1);
    expect(artifact.planAttempts[0].grounding?.protocolCallCount).toBe(2);
    expect(mock.critiquePlan).toHaveBeenCalledTimes(2);
  });

  it('fails closed on critic preflight and transport exhaustion', async () => {
    const unavailable = await runAutonomousNarrativeV2(testCase(), {
      services: services({ preflightError: new Error('Gemma unavailable') }),
    });
    expect(unavailable).toMatchObject({
      status: 'rejected', failure: { stage: 'critic_preflight', code: 'model_unavailable' },
    });

    const transport = await runAutonomousNarrativeV2(testCase(), {
      services: services({ plans: [
        call<NarrativeClaimPlanV1>(null, 'transport_error', 'network failed twice'),
      ] }),
    });
    expect(transport).toMatchObject({
      status: 'rejected', failure: { stage: 'plan_generation', code: 'transport_error' },
    });
    expect(transport.planAttempts).toHaveLength(1);
  });

  it('fingerprints route, provenance, plan, text, four prompts, policies, and both reports', async () => {
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: services() });
    const fingerprints = artifact.fingerprints;

    expect(Object.keys(fingerprints.prompts)).toEqual([
      'planGenerator', 'groundingCritic', 'proseGenerator', 'finalCritic',
    ]);
    expect(new Set(Object.values(fingerprints.prompts)).size).toBe(4);
    expect(fingerprints).toEqual(expect.objectContaining({
      route: expect.stringMatching(/^[a-f0-9]{64}$/),
      evidence: expect.stringMatching(/^[a-f0-9]{64}$/),
      evidenceProvenance: expect.stringMatching(/^[a-f0-9]{64}$/),
      plan: expect.stringMatching(/^[a-f0-9]{64}$/),
      text: expect.stringMatching(/^[a-f0-9]{64}$/),
      policies: expect.stringMatching(/^[a-f0-9]{64}$/),
      critiques: {
        grounding: expect.stringMatching(/^[a-f0-9]{64}$/),
        final: expect.stringMatching(/^[a-f0-9]{64}$/),
      },
    }));
  });

  it('contains no human-review state anywhere in v2 artifacts', async () => {
    const artifact = await runAutonomousNarrativeV2(testCase(), { services: services() });
    expect(JSON.stringify(artifact)).not.toMatch(/human_review|review_required|pending_review/);
    expect(['machine_approved', 'rejected']).toContain(artifact.status);
  });

  it('replays exact approved artifacts and rejects changed cases or fingerprints', async () => {
    const benchmark = testCase();
    const artifact = await runAutonomousNarrativeV2(benchmark, { services: services() });
    expect(replayAutonomousNarrativeArtifactV2(artifact, benchmark)).toEqual(artifact);

    const changedCase = structuredClone(benchmark);
    changedCase.scenes[0].evidenceFacts[0].normalizedEs += ' Cambio.';
    const { fingerprint: _old, ...content } = changedCase.scenes[0].evidenceFacts[0];
    changedCase.scenes[0].evidenceFacts[0].fingerprint = narrativeSourceFactFingerprintV2(content);
    expect(() => replayAutonomousNarrativeArtifactV2(artifact, changedCase)).toThrow('case changed');

    const changedFingerprint = structuredClone(artifact);
    changedFingerprint.fingerprints.text = '0'.repeat(64);
    expect(() => replayAutonomousNarrativeArtifactV2(changedFingerprint, benchmark))
      .toThrow('changed components');
  });

  it('serializes only machine-approved replayable artifacts', async () => {
    const benchmark = testCase();
    const approved = await runAutonomousNarrativeV2(benchmark, { services: services() });
    expect(serializeMachineApprovedNarrativeArtifactV2(approved, benchmark)).toMatch(/"machine_approved"/);

    const rejected = await runAutonomousNarrativeV2(benchmark, {
      services: services({ preflightError: new Error('offline') }),
    });
    expect(() => serializeMachineApprovedNarrativeArtifactV2(rejected, benchmark))
      .toThrow('only machine-approved');
  });

  it('lets callers recompute fingerprints without depending on a city identity', async () => {
    const benchmark = testCase();
    const artifact = await runAutonomousNarrativeV2(benchmark, { services: services() });
    const recomputed = autonomousNarrativeFingerprintsV2({
      testCase: benchmark,
      request: artifact.request,
      plan: artifact.plan,
      scripts: artifact.scripts,
      groundingReport: artifact.planAttempts.at(-1)?.grounding?.report ?? null,
      finalReport: artifact.proseAttempts.at(-1)?.critique?.report ?? null,
      criticModelDigest: MODEL.digest,
      prompts: artifact.fingerprints.prompts,
    });
    expect(recomputed).toEqual(artifact.fingerprints);
  });
});
