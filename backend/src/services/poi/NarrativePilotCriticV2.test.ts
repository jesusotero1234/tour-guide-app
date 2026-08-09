import { readFileSync } from 'fs';
import { join } from 'path';
import {
  NarrativeClaimPlanV1,
  canonicalizeNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import {
  NarrativeCriticReportV2,
  NarrativeGroundingCriticReportV1,
  buildNarrativeCriticRequestV2,
  buildNarrativeGroundingCriticRequestV1,
  evaluateNarrativeCriticGateV2,
  evaluateNarrativeGroundingGateV1,
  narrativeCriticReportSchemaV2,
  narrativeGroundingCriticReportSchemaV1,
  validateNarrativeCriticReportV2,
  validateNarrativeCriticRequestV2,
  validateNarrativeGroundingCriticReportV1,
} from './NarrativePilotCriticV2';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import {
  NarrativeScriptRequestV1,
  NarrativeScriptResponseV1,
  SceneNarrativeScriptV1,
} from './NarrativePilotV1';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

function fixture(): {
  request: NarrativeScriptRequestV1;
  plan: NarrativeClaimPlanV1;
  scripts: SceneNarrativeScriptV1[];
} {
  const route = JSON.parse(readFileSync(
    join(FIXTURES, 'editorial-v7', 'paris-history-en-120.json'), 'utf8'
  )) as EditorialWorkbenchV7;
  const response = JSON.parse(readFileSync(
    join(FIXTURES, 'narrative-pilot-v1', 'paris-premium-es.response.json'), 'utf8'
  )) as NarrativeScriptResponseV1;
  const request = buildParisNarrativeScriptRequestV1(route);
  const plan = canonicalizeNarrativeClaimPlanV1({
    schemaVersion: 'narrative-claim-plan-draft-v1',
    scenes: response.scripts.map((script) => ({
      sceneId: script.sceneId,
      openingType: script.openingType,
      blocks: script.blocks.map((block) => ({
        kind: block.kind,
        claims: [{
          text: `Claim aprobado para ${block.kind}`,
          relation: block.kind === 'interpretation' ? 'interpretation' : 'direct',
          evidenceFactIds: block.evidenceFactIds,
        }],
      })),
    })),
  }, request);
  const scripts = response.scripts.map((script, sceneIndex) => ({
    ...script,
    blocks: script.blocks.map((block, blockIndex) => ({
      ...block,
      blockId: plan.scenes[sceneIndex].blocks[blockIndex].blockId,
      evidenceFactIds: [...plan.scenes[sceneIndex].blocks[blockIndex].evidenceFactIds],
    })),
  }));
  return { request, plan, scripts };
}

function groundingReport(): NarrativeGroundingCriticReportV1 {
  return {
    schemaVersion: 'narrative-grounding-critic-report-v1',
    unsupportedClaims: [],
    improperCausality: [],
    misleadingOmissions: [],
    repairInstructions: [],
  };
}

function finalReport(): NarrativeCriticReportV2 {
  const { request } = fixture();
  return {
    schemaVersion: 'narrative-critic-report-v2',
    newClaims: [],
    distortedClaims: [],
    omittedClaims: [],
    misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4,
        humanTension: 4,
        lookingUtility: 4,
        naturalness: 4,
        progression: 4,
      },
      scenes: request.scenes.map((scene) => ({
        sceneId: scene.sceneId, score: 4, rationale: 'Cumple el plan aprobado.',
      })),
    },
    premiumReadiness: 4,
    repairInstructions: [],
  };
}

describe('NarrativePilotCriticV2', () => {
  it('binds the grounding request to the canonical plan and same-scene evidence', () => {
    const { request, plan } = fixture();
    const criticRequest = buildNarrativeGroundingCriticRequestV1(request, plan);

    expect(criticRequest.plan).toEqual(plan);
    expect(criticRequest.allowedEvidence.map((scene) => scene.sceneId))
      .toEqual(request.scenes.map((scene) => scene.sceneId));
    expect(criticRequest.allowedEvidence[0].evidenceFacts).toEqual(request.scenes[0].evidenceFacts);
  });

  it('accepts a finding-only grounding approval with no verdict field', () => {
    const { request, plan } = fixture();
    const criticRequest = buildNarrativeGroundingCriticRequestV1(request, plan);
    const report = groundingReport();

    expect(validateNarrativeGroundingCriticReportV1(report, criticRequest)).toEqual(report);
    expect(evaluateNarrativeGroundingGateV1(report)).toEqual({ passed: true, reasons: [] });
    expect(report).not.toHaveProperty('verdict');
  });

  it('rejects grounding findings that reference an unknown or cross-scene claim', () => {
    const { request, plan } = fixture();
    const criticRequest = buildNarrativeGroundingCriticRequestV1(request, plan);
    const report = groundingReport() as any;
    report.unsupportedClaims = [{
      sceneId: request.scenes[0].sceneId,
      claimId: plan.scenes[1].blocks[0].claims[0].claimId,
      severity: 'critical',
      detail: 'Referencia cruzada.',
    }];
    report.repairInstructions = ['Eliminar la atribución cruzada.'];

    expect(() => validateNarrativeGroundingCriticReportV1(report, criticRequest))
      .toThrow('claim reference');
  });

  it('calculates grounding rejection from unsupported claims, causality, and omissions', () => {
    const { request, plan } = fixture();
    const report = groundingReport();
    report.unsupportedClaims.push({
      sceneId: request.scenes[0].sceneId,
      claimId: plan.scenes[0].blocks[0].claims[0].claimId,
      severity: 'critical',
      detail: 'El claim excede la evidencia.',
    });
    report.improperCausality.push({
      sceneId: request.scenes[1].sceneId,
      claimId: plan.scenes[1].blocks[0].claims[0].claimId,
      detail: 'La cronología se presenta como causa.',
    });
    report.misleadingOmissions.push({
      sceneId: request.scenes[2].sceneId,
      evidenceFactId: request.scenes[2].evidenceFacts[0].factId,
      detail: 'La omisión cambia el sentido.',
    });
    report.repairInstructions = ['Reparar los tres hallazgos.'];

    expect(evaluateNarrativeGroundingGateV1(report)).toEqual({
      passed: false,
      reasons: ['unsupported_claim', 'critical_unsupported_claim', 'improper_causality', 'misleading_omission'],
    });
  });

  it('binds the final request to approved claims while accepting a mutation probe text', () => {
    const { request, plan, scripts } = fixture();
    const mutated = structuredClone(scripts);
    mutated[0].blocks[0].text += ' El personaje falso Aurelio decidió toda la historia.';
    const criticRequest = buildNarrativeCriticRequestV2(request, plan, mutated);

    expect(validateNarrativeCriticRequestV2(criticRequest)).toEqual(criticRequest);
    expect(criticRequest.scripts[0].blocks[0].text).toContain('Aurelio');
  });

  it('accepts a finding-only final approval and calculates the local premium gate', () => {
    const { request, plan, scripts } = fixture();
    const criticRequest = buildNarrativeCriticRequestV2(request, plan, scripts);
    const report = finalReport();

    expect(validateNarrativeCriticReportV2(report, criticRequest)).toEqual(report);
    expect(evaluateNarrativeCriticGateV2(report)).toEqual({ passed: true, reasons: [] });
    expect(report).not.toHaveProperty('verdict');
  });

  it('rejects every new critical claim independently of perfect style scores', () => {
    const { request } = fixture();
    const report = finalReport();
    report.newClaims.push({
      sceneId: request.scenes[0].sceneId,
      location: 'opening',
      severity: 'critical',
      claim: 'Un personaje inexistente ordenó la obra.',
      detail: 'No aparece en el plan ni en la evidencia.',
    });
    report.repairInstructions = ['Eliminar el personaje inexistente.'];

    expect(evaluateNarrativeCriticGateV2(report)).toEqual({
      passed: false,
      reasons: ['new_claim', 'critical_unsupported_claim'],
    });
  });

  it('rejects distorted and omitted approved claims plus misleading evidence omissions', () => {
    const { request, plan } = fixture();
    const report = finalReport();
    report.distortedClaims.push({
      sceneId: request.scenes[0].sceneId,
      claimId: plan.scenes[0].blocks[0].claims[0].claimId,
      severity: 'minor',
      detail: 'La prosa deforma la relación.',
    });
    report.omittedClaims.push({
      sceneId: request.scenes[1].sceneId,
      claimId: plan.scenes[1].blocks[0].claims[0].claimId,
      detail: 'El claim desaparece.',
    });
    report.misleadingOmissions.push({
      sceneId: request.scenes[2].sceneId,
      evidenceFactId: request.scenes[2].evidenceFacts[0].factId,
      detail: 'Se pierde un matiz decisivo.',
    });

    expect(evaluateNarrativeCriticGateV2(report).reasons).toEqual([
      'distorted_claim', 'omitted_claim', 'misleading_omission',
    ]);
  });

  it('enforces all score thresholds locally without a model verdict', () => {
    const report = finalReport();
    report.scores.dimensions.naturalness = 3;
    report.scores.scenes[0].score = 2;
    report.premiumReadiness = 3;

    expect(evaluateNarrativeCriticGateV2(report).reasons).toEqual([
      'dimension_below_4', 'scene_below_3', 'premium_readiness_below_4',
    ]);
  });

  it('rejects invalid dynamic claim and evidence references in final reports', () => {
    const { request, plan, scripts } = fixture();
    const criticRequest = buildNarrativeCriticRequestV2(request, plan, scripts);
    const claim = finalReport() as any;
    claim.distortedClaims = [{
      sceneId: request.scenes[0].sceneId,
      claimId: 'unknown-claim',
      severity: 'minor', detail: 'Inválido.',
    }];
    claim.repairInstructions = ['Corregir.'];
    expect(() => validateNarrativeCriticReportV2(claim, criticRequest)).toThrow('claim reference');

    const evidence = finalReport() as any;
    evidence.misleadingOmissions = [{
      sceneId: request.scenes[0].sceneId,
      evidenceFactId: request.scenes[1].evidenceFacts[0].factId,
      detail: 'Cruzado.',
    }];
    evidence.repairInstructions = ['Corregir.'];
    expect(() => validateNarrativeCriticReportV2(evidence, criticRequest)).toThrow('evidence reference');
  });

  it('requires repair instructions exactly when either local gate fails', () => {
    const { request, plan, scripts } = fixture();
    const groundingRequest = buildNarrativeGroundingCriticRequestV1(request, plan);
    const grounding = groundingReport();
    grounding.repairInstructions = ['No debe reparar una aprobación.'];
    expect(() => validateNarrativeGroundingCriticReportV1(grounding, groundingRequest))
      .toThrow('repair instructions');

    const finalRequest = buildNarrativeCriticRequestV2(request, plan, scripts);
    const report = finalReport();
    report.premiumReadiness = 3;
    expect(() => validateNarrativeCriticReportV2(report, finalRequest))
      .toThrow('repair instructions');
  });

  it('publishes report schemas with findings and scores but no verdict', () => {
    const grounding = JSON.stringify(narrativeGroundingCriticReportSchemaV1());
    const final = JSON.stringify(narrativeCriticReportSchemaV2());

    expect(grounding).toContain('unsupportedClaims');
    expect(grounding).toContain('improperCausality');
    expect(final).toContain('newClaims');
    expect(final).toContain('premiumReadiness');
    expect(grounding).not.toContain('verdict');
    expect(final).not.toContain('verdict');
  });
});
