import {
  AutonomousNarrativeArtifactV4,
} from './AutonomousNarrativeV4';
import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { buildNarrativeClaimPlanV4, narrativeClaimPlanFingerprintV4 } from './NarrativeClaimPlanV4';
import {
  NarrativeCriticReportV4,
  NarrativeGroundingCriticReportV4,
} from './NarrativeCriticV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  NARRATIVE_CRITIC_DIGEST_V4,
  NARRATIVE_CRITIC_MODEL_V4,
  NarrativeCriticModelInfoV4,
} from './NarrativePilotGemmaV4';
import {
  NarrativeMadridQualificationServicesV4,
  NarrativeMutationKindV4,
  applyNarrativeMutationV4,
  replayNarrativeMadridPilotQualificationV4,
  runNarrativeMadridPilotQualificationV4,
  selectNarrativeCandidateV4,
} from './NarrativeMadridPilotQualificationV4';
import { NarrativeVariantV4 } from './NarrativePilotWriterV4';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

const MODEL: NarrativeCriticModelInfoV4 = {
  name: NARRATIVE_CRITIC_MODEL_V4,
  digest: NARRATIVE_CRITIC_DIGEST_V4,
  parameterSize: '12B',
  quantizationLevel: 'Q4_K_M',
  sizeBytes: 8_500,
  sizeVramBytes: 8_500,
  fullyGpu: true,
};

function call<T>(value: T): EditorialCallResultV6<T> {
  return {
    callId: 'test', status: 'valid', value,
    attempts: [{ attempt: 1, status: 'valid', latencyMs: 10, rawOutput: '{}', error: null }],
    model: 'test', promptFingerprint: 'a'.repeat(64), responseFingerprint: 'b'.repeat(64),
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: '{}',
  };
}

function transport<T>(): EditorialCallResultV6<T> {
  return {
    callId: 'test', status: 'transport_error', value: null,
    attempts: [{
      attempt: 1, status: 'transport_error', latencyMs: 10,
      rawOutput: null, error: 'temporary transport failure',
    }],
    model: 'test', promptFingerprint: 'a'.repeat(64), responseFingerprint: null,
    inputCharacters: 1, schemaCharacters: 1, input: {}, rawOutput: null,
  };
}

function grounding(): NarrativeGroundingCriticReportV4 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v4',
    unsupportedClaims: [], improperCausality: [], unsupportedInterpretations: [],
    meaningChangingOmissions: [],
  };
}

function text(marker: string): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4', introduction: `Introducción ${marker}.`,
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId, name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId, kind: block.kind,
        text: `Texto ${marker} para el bloque ${block.kind} de esta escena histórica.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition, bodyWordCount: 170,
    })),
    totalWordCount: 1250, durationSeconds: 3600, durationMinutes: 60,
  };
}

function report(options: { score?: number; factual?: boolean; emptyScenes?: boolean } = {}):
NarrativeCriticReportV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-critic-report-v4',
    newClaims: options.factual ? [{
      sceneId: 'palace', location: 'opening', severity: 'critical',
      claim: 'Mutación factual.', detail: 'No existe en la evidencia oficial.',
    }] : [],
    distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: options.score ?? 4,
        humanTension: options.score ?? 4,
        lookingUtility: options.score ?? 4,
        naturalness: options.score ?? 4,
        progression: options.score ?? 4,
      },
      scenes: options.emptyScenes ? [] : evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: options.score ?? 4, rationale: 'Escena evaluada.',
      })),
    },
  };
}

function artifact(
  variant: NarrativeVariantV4,
  approved: boolean,
  score = 4
): AutonomousNarrativeArtifactV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  const candidateText = text(variant);
  return {
    schemaVersion: 'autonomous-narrative-v4',
    status: approved ? 'machine_approved' : 'rejected',
    variant,
    evidenceFingerprint: evidence.fingerprint,
    plan,
    planFingerprint: narrativeClaimPlanFingerprintV4(plan),
    text: approved ? candidateText : null,
    grounding: call(grounding()),
    proseAttempts: approved ? [call(candidateText)] : [],
    finalCritiques: approved ? [call(report({ score }))] : [],
    failure: approved ? null : { code: 'content_rejected', message: 'Rejected in test.' },
  };
}

function services(
  candidates: AutonomousNarrativeArtifactV4[],
  critiques: EditorialCallResultV6<NarrativeCriticReportV4>[] = [
    call(report()),
    ...Array.from({ length: 4 }, () => call(report({ factual: true }))),
  ]
): NarrativeMadridQualificationServicesV4 & { critique: jest.Mock } {
  const byVariant = new Map(candidates.map((candidate) => [candidate.variant, candidate]));
  const queue = [...critiques];
  return {
    criticModel: MODEL,
    runCandidate: async (variant) => byVariant.get(variant)!,
    critique: jest.fn(async () => queue.shift() ?? transport<NarrativeCriticReportV4>()),
  };
}

describe('NarrativeMadridPilotQualificationV4', () => {
  it('passes with one approved candidate and selects it without human intervention', async () => {
    const candidates = [
      artifact('on_site', false), artifact('curiosity', true), artifact('documentary', false),
    ];
    const mocks = services(candidates);
    const result = await runNarrativeMadridPilotQualificationV4(
      loadMadridNarrativeEvidenceCaseV4(), mocks
    );

    expect(result.status).toBe('passed');
    expect(result.selectedVariant).toBe('curiosity');
    expect(result.summary).toMatchObject({
      approvedCandidates: 1,
      factualMutationsDetected: 4,
      totalMutations: 4,
      criticFullyGpu: true,
    });
    expect(mocks.critique).toHaveBeenCalledTimes(5);
  });

  it('fails when zero of three candidates is approved', async () => {
    const result = await runNarrativeMadridPilotQualificationV4(
      loadMadridNarrativeEvidenceCaseV4(),
      services([
        artifact('on_site', false), artifact('curiosity', false), artifact('documentary', false),
      ], [])
    );
    expect(result.status).toBe('failed');
    expect(result.selectedArtifact).toBeNull();
    expect(result.failureReasons).toContain('no_machine_approved_candidate');
  });

  it('uses minimum scene, total score, then registered variant order for ties', () => {
    expect(selectNarrativeCandidateV4([
      artifact('documentary', true, 4),
      artifact('curiosity', true, 5),
      artifact('on_site', true, 4),
    ])?.variant).toBe('curiosity');
    expect(selectNarrativeCandidateV4([
      artifact('documentary', true, 4),
      artifact('curiosity', true, 4),
      artifact('on_site', true, 4),
    ])?.variant).toBe('on_site');

    const emptyMetrics = artifact('curiosity', true, 5);
    emptyMetrics.finalCritiques[0] = call(report({ score: 5, emptyScenes: true }));
    expect(selectNarrativeCandidateV4([
      artifact('on_site', true, 4), emptyMetrics, artifact('documentary', false),
    ])?.variant).toBe('on_site');
  });

  it('applies all four distinct mutations while preserving route metadata', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const original = text('selected');
    const fingerprints = ([
      'invented_causality', 'cross_scene_attribution', 'false_character', 'misleading_omission',
    ] as NarrativeMutationKindV4[]).map((kind) => (
      applyNarrativeMutationV4(original, evidence, kind)
    ));
    expect(new Set(fingerprints.map((candidate) => candidate.scripts[0].blocks[0].text)).size)
      .toBe(4);
    expect(fingerprints.every((candidate) => (
      candidate.scripts.length === 7 && candidate.scripts[0].bodyWordCount === 170
    ))).toBe(true);
  });

  it('does not count transport or an invalid empty report as a detected mutation', async () => {
    const candidate = artifact('on_site', true);
    const result = await runNarrativeMadridPilotQualificationV4(
      loadMadridNarrativeEvidenceCaseV4(),
      services([
        candidate, artifact('curiosity', false), artifact('documentary', false),
      ], [
        call(report()),
        call(report({ factual: true })),
        transport<NarrativeCriticReportV4>(),
        call(report({ factual: true, emptyScenes: true })),
        call(report({ factual: true })),
      ])
    );
    expect(result.status).toBe('failed');
    expect(result.summary.factualMutationsDetected).toBe(2);
    expect(result.failureReasons.some((reason) => reason.includes('mutation_not_factually_rejected')))
      .toBe(true);
  });

  it('replays offline and detects any altered fingerprint', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const result = await runNarrativeMadridPilotQualificationV4(evidence, services([
      artifact('on_site', true), artifact('curiosity', false), artifact('documentary', false),
    ]));
    expect(replayNarrativeMadridPilotQualificationV4(result, evidence)).toBe(result);

    result.fingerprints.preview = 'f'.repeat(64);
    expect(() => replayNarrativeMadridPilotQualificationV4(result, evidence))
      .toThrow('fingerprint changed');
  });
});
