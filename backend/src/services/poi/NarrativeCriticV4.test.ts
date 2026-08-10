import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import {
  NarrativeCriticReportV4,
  NarrativeGroundingCriticReportV4,
  buildNarrativeCriticRequestV4,
  buildNarrativeGroundingCriticRequestV4,
  evaluateNarrativeCriticGateV4,
  evaluateNarrativeGroundingGateV4,
  narrativeCriticReportSchemaV4,
  narrativeGroundingCriticReportSchemaV4,
  validateNarrativeCriticReportV4,
  validateNarrativeGroundingCriticReportV4,
} from './NarrativeCriticV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

function text(): NarrativeTourTextV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  const plan = buildNarrativeClaimPlanV4(evidence);
  return {
    schemaVersion: 'narrative-tour-text-v4',
    introduction: 'Texto de prueba ya validado por el contrato de prosa antes de construir este request.',
    scripts: evidence.scenes.map((scene, sceneIndex) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      blocks: plan.scenes[sceneIndex].blocks.map((block) => ({
        blockId: block.blockId,
        kind: block.kind,
        text: `Texto validado para ${block.kind}.`,
        evidenceFactIds: block.evidenceFactIds,
      })),
      transition: plan.scenes[sceneIndex].transition,
      bodyWordCount: 170,
    })),
    totalWordCount: 1250,
    durationSeconds: 3600,
    durationMinutes: 60,
  };
}

function grounding(): NarrativeGroundingCriticReportV4 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v4',
    unsupportedClaims: [],
    improperCausality: [],
    unsupportedInterpretations: [],
    meaningChangingOmissions: [],
  };
}

function finalReport(score = 4): NarrativeCriticReportV4 {
  const evidence = loadMadridNarrativeEvidenceCaseV4();
  return {
    schemaVersion: 'narrative-critic-report-v4',
    newClaims: [],
    distortedClaims: [],
    omittedClaims: [],
    misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: score,
        humanTension: 4,
        lookingUtility: 4,
        naturalness: 4,
        progression: 4,
      },
      scenes: evidence.scenes.map((scene) => ({
        sceneId: scene.sceneId,
        score: 4,
        rationale: 'La escena conserva hechos y ofrece una progresión clara.',
      })),
    },
  };
}

describe('NarrativeCriticV4', () => {
  it('derives the grounding verdict locally from findings only', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const request = buildNarrativeGroundingCriticRequestV4(
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    );
    const clean = validateNarrativeGroundingCriticReportV4(grounding(), request);
    expect(evaluateNarrativeGroundingGateV4(clean)).toEqual({ passed: true, reasons: [] });

    const rejected = grounding();
    rejected.unsupportedInterpretations.push({
      sceneId: 'palace',
      claimId: 'palace:closing:editorial',
      detail: 'La interpretación rebasa sus hechos base.',
    });
    expect(evaluateNarrativeGroundingGateV4(
      validateNarrativeGroundingCriticReportV4(rejected, request)
    )).toEqual({ passed: false, reasons: ['unsupported_interpretation'] });
  });

  it('rejects unknown and cross-scene references', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const request = buildNarrativeGroundingCriticRequestV4(
      evidence,
      buildNarrativeClaimPlanV4(evidence)
    );
    const report = grounding();
    report.improperCausality.push({
      sceneId: 'palace',
      claimId: 'almudena:opening:almudena-contrast',
      detail: 'Referencia cruzada.',
    });
    expect(() => validateNarrativeGroundingCriticReportV4(report, request))
      .toThrow('invalid claim reference');
  });

  it('requires all five dimensions and all seven scenes to score at least four', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const plan = buildNarrativeClaimPlanV4(evidence);
    const request = buildNarrativeCriticRequestV4(evidence, plan, text());
    expect(evaluateNarrativeCriticGateV4(
      validateNarrativeCriticReportV4(finalReport(), request)
    )).toEqual({ passed: true, reasons: [] });

    const weakDimension = finalReport(3);
    expect(evaluateNarrativeCriticGateV4(
      validateNarrativeCriticReportV4(weakDimension, request)
    ).reasons).toContain('dimension_below_4');
    const weakScene = finalReport();
    weakScene.scores.scenes[6].score = 3;
    expect(evaluateNarrativeCriticGateV4(
      validateNarrativeCriticReportV4(weakScene, request)
    ).reasons).toContain('scene_below_4');
  });

  it('rejects factual findings and empty scene metrics', () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const plan = buildNarrativeClaimPlanV4(evidence);
    const request = buildNarrativeCriticRequestV4(evidence, plan, text());
    const factual = finalReport();
    factual.newClaims.push({
      sceneId: 'palace',
      location: 'opening',
      severity: 'critical',
      claim: 'Aparece un personaje falso.',
      detail: 'No existe en la evidencia.',
    });
    expect(evaluateNarrativeCriticGateV4(
      validateNarrativeCriticReportV4(factual, request)
    ).passed).toBe(false);

    const empty = finalReport();
    empty.scores.scenes = [];
    expect(() => validateNarrativeCriticReportV4(empty, request)).toThrow('seven scene scores');
  });

  it('keeps both critic schemas verdict-free', () => {
    const schemas = JSON.stringify({
      grounding: narrativeGroundingCriticReportSchemaV4(),
      final: narrativeCriticReportSchemaV4(),
    });
    expect(schemas).toContain('unsupportedInterpretations');
    expect(schemas).toContain('scores');
    expect(schemas).not.toMatch(/verdict|approved|passed/);
  });
});
