import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import {
  NarrativeCriticReportV4,
  buildNarrativeCriticRequestV4,
} from './NarrativeCriticV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import {
  NARRATIVE_CRITIC_DIGEST_V4,
  NARRATIVE_CRITIC_MODEL_V4,
} from './NarrativePilotGemmaV4';
import {
  NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5,
  narrativeFinalCriticPromptFingerprintV5,
  requestNarrativeFinalCritiqueV5,
} from './NarrativePilotGemmaV5';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

function text(): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4',
    introduction: 'Madrid cambia de escala mientras sus instituciones ocupan espacios visibles.',
    scripts: evidence.scenes.map((scene, index) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      blocks: plan.scenes[index].blocks.map((block) => ({
        blockId: block.blockId,
        kind: block.kind,
        text: `${block.claims[0].text} Esta frase enlaza el claim sin añadir otro hecho histórico.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[index].transition,
      bodyWordCount: 175,
    })),
    totalWordCount: 1300,
    durationSeconds: 3600,
    durationMinutes: 60,
  };
}

function report(newClaim = false): NarrativeCriticReportV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-critic-report-v4',
    newClaims: newClaim ? [{
      sceneId: 'palace',
      location: 'opening',
      severity: 'minor',
      claim: 'The scene effectively establishes a strong contrast.',
      detail: 'This is praise rather than an unsupported excerpt.',
    }] : [],
    distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Cumple plenamente el criterio.',
      })),
    },
  };
}

describe('NarrativePilotGemmaV5', () => {
  it('defines defect-only findings and an unambiguous ascending score rubric', () => {
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('1 significa fallo grave');
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('4 significa que cumple plenamente');
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('elogios ni sugerencias');
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('fragmento literal');
    expect(narrativeFinalCriticPromptFingerprintV5()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('retries praise disguised as a new claim and accepts a clean defect report', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const responses = [report(true), report(false)];
    const post = jest.fn(async () => ({
      data: { message: { content: JSON.stringify(responses.shift()) } },
    }));
    const model = {
      name: NARRATIVE_CRITIC_MODEL_V4,
      digest: NARRATIVE_CRITIC_DIGEST_V4,
      parameterSize: '12B',
      quantizationLevel: 'Q4_K_M' as const,
      sizeBytes: 8_500,
      sizeVramBytes: 8_500,
      fullyGpu: true as const,
    };

    const result: EditorialCallResultV6<NarrativeCriticReportV4> =
      await requestNarrativeFinalCritiqueV5(
        buildNarrativeCriticRequestV4(evidence, buildNarrativeClaimPlanV4(evidence), text()),
        {
          model,
          options: { post },
          ensureResident: jest.fn(async () => model),
        }
      );

    expect(result.status).toBe('valid');
    expect(result.value?.newClaims).toEqual([]);
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['semantic_error', 'valid']);
    expect(post).toHaveBeenCalledTimes(2);
  });
});
