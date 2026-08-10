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
  NARRATIVE_FINAL_CRITIC_PARAMETERS_V5,
  narrativeFinalCriticPromptFingerprintV5,
  narrativeFinalCriticReportSchemaV5,
  requestNarrativeFinalCritiqueV5,
  validateNarrativeFinalCriticReportV5,
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

function report(newClaim = false) {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-critic-report-v5',
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
        curiosity: 'fully_meets',
        humanTension: 'fully_meets',
        lookingUtility: 'fully_meets',
        naturalness: 'fully_meets',
        progression: 'fully_meets',
      },
      scenes: evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 'fully_meets', rationale: 'Cumple plenamente el criterio.',
      })),
    },
  };
}

describe('NarrativePilotGemmaV5', () => {
  it('defines defect-only findings and an unambiguous ascending score rubric', () => {
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('severe_failure');
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('fully_meets');
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('elogios ni sugerencias');
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('fragmento literal');
    expect(NARRATIVE_FINAL_CRITIC_SYSTEM_PROMPT_V5).toContain('35 claims');
    expect(NARRATIVE_FINAL_CRITIC_PARAMETERS_V5.numCtx).toBe(65_536);
    expect(JSON.stringify(narrativeFinalCriticReportSchemaV5())).not.toContain('"integer"');
    expect(narrativeFinalCriticPromptFingerprintV5()).toMatch(/^[a-f0-9]{64}$/);
  });

  it('discards praise disguised as a new claim while retaining the raw diagnostic', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const responses = [report(true)];
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => ({
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
    expect(result.value?.scores.dimensions).toEqual({
      curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
    });
    expect(result.rawOutput).toContain('praise rather than an unsupported excerpt');
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['valid']);
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][1]).toMatchObject({ options: { num_ctx: 65_536 } });
  });

  it('retains a defect whose claim is an exact excerpt from the referenced block', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const tourText = text();
    const raw = report(false);
    raw.newClaims = [{
      sceneId: 'palace',
      location: 'opening',
      severity: 'critical',
      claim: tourText.scripts[0].blocks[0].text.split(/\s+/u).slice(0, 8).join(' '),
      detail: 'Este fragmento no está respaldado por la evidencia.',
    }];

    const validated = validateNarrativeFinalCriticReportV5(
      raw,
      buildNarrativeCriticRequestV4(
        evidence,
        buildNarrativeClaimPlanV4(evidence),
        tourText
      )
    );

    expect(validated.newClaims).toHaveLength(1);
  });
});
