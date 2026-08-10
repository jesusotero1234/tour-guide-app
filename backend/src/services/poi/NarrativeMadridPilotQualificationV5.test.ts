import { AutonomousNarrativeArtifactV5 } from './AutonomousNarrativeV5';
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
  replayNarrativeMadridPilotQualificationV5,
  runNarrativeMadridPilotQualificationV5,
} from './NarrativeMadridPilotQualificationV5';
import { NarrativeVariantV5 } from './NarrativePilotWriterV5';
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

function grounding(): NarrativeGroundingCriticReportV4 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v4',
    unsupportedClaims: [], improperCausality: [], unsupportedInterpretations: [],
    meaningChangingOmissions: [],
  };
}

function report(factual = false): NarrativeCriticReportV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-critic-report-v4',
    newClaims: factual ? [{
      sceneId: 'palace', location: 'opening', severity: 'critical',
      claim: 'El incendio causó toda la transformación política posterior de Madrid',
      detail: 'El fragmento no tiene respaldo factual.',
    }] : [],
    distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Cumple plenamente.',
      })),
    },
  };
}

function text(marker: string): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4', introduction: `Introducción ${marker}.`,
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId, kind: block.kind,
        text: `Texto ${marker} para ${block.kind} de esta escena histórica.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition,
      bodyWordCount: 175,
    })),
    totalWordCount: 1300, durationSeconds: 3600, durationMinutes: 60,
  };
}

function artifact(variant: NarrativeVariantV5, approved: boolean): AutonomousNarrativeArtifactV5 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  const candidateText = text(variant);
  return {
    schemaVersion: 'autonomous-narrative-v5',
    status: approved ? 'machine_approved' : 'rejected',
    variant,
    evidenceFingerprint: evidence.fingerprint,
    plan,
    planFingerprint: narrativeClaimPlanFingerprintV4(plan),
    text: approved ? candidateText : null,
    grounding: call(grounding()),
    proseAttempts: approved ? [call(candidateText)] : [],
    finalCritiques: approved ? [call(report())] : [],
    failure: approved ? null : { code: 'content_rejected', message: 'Rejected in test.' },
  };
}

describe('NarrativeMadridPilotQualificationV5', () => {
  it('requires a clean recritique and all four factual mutation detections', async () => {
    const candidates = new Map([
      ['on_site', artifact('on_site', true)],
      ['curiosity', artifact('curiosity', false)],
      ['documentary', artifact('documentary', false)],
    ] as const);
    const critiques = [call(report()), ...Array.from({ length: 4 }, () => call(report(true)))];
    const result = await runNarrativeMadridPilotQualificationV5(
      loadMadridNarrativeEvidenceCaseV4(),
      {
        criticModel: MODEL,
        runCandidate: async (variant) => candidates.get(variant)!,
        critique: async () => critiques.shift()!,
      }
    );

    expect(result.status).toBe('passed');
    expect(result.selectedVariant).toBe('on_site');
    expect(result.preview?.tour.status).toBe('review');
    expect(result.summary).toMatchObject({
      approvedCandidates: 1,
      cleanCritiquePassed: true,
      factualMutationsDetected: 4,
      totalMutations: 4,
      criticFullyGpu: true,
    });
    expect(replayNarrativeMadridPilotQualificationV5(
      result,
      loadMadridNarrativeEvidenceCaseV4()
    )).toBe(result);
  });

  it('keeps qualification failed when mutation findings are not factual', async () => {
    const candidates = new Map([
      ['on_site', artifact('on_site', true)],
      ['curiosity', artifact('curiosity', false)],
      ['documentary', artifact('documentary', false)],
    ] as const);
    const critiques = Array.from({ length: 5 }, () => call(report()));
    const result = await runNarrativeMadridPilotQualificationV5(
      loadMadridNarrativeEvidenceCaseV4(),
      {
        criticModel: MODEL,
        runCandidate: async (variant) => candidates.get(variant)!,
        critique: async () => critiques.shift()!,
      }
    );

    expect(result.status).toBe('failed');
    expect(result.failureReasons.filter((reason) => (
      reason.startsWith('mutation_not_factually_rejected:')
    ))).toHaveLength(4);
  });
});
