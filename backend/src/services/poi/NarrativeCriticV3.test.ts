import { readFileSync } from 'fs';
import { join } from 'path';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';
import { WikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';
import { PoiEnrichmentSnapshot } from './PoiEnrichmentSnapshot';
import { buildNarrativeEvidenceCaseFromWorkbenchV3 } from './NarrativeEvidenceV3';
import {
  NarrativeScriptRequestV3,
  buildNarrativeScriptRequestV3,
  canonicalizeNarrativeClaimPlanV3,
  materializeNarrativeScriptsV3,
} from './NarrativeContractsV3';
import {
  buildNarrativeCriticRequestV3,
  buildNarrativeGroundingCriticRequestV3,
  evaluateNarrativeCriticGateV3,
  evaluateNarrativeGroundingGateV3,
  narrativeCriticReportSchemaV3,
  narrativeGroundingCriticReportSchemaV3,
  narrativeRepairInstructionsV3,
  validateNarrativeCriticReportV3,
  validateNarrativeGroundingCriticReportV3,
} from './NarrativeCriticV3';
import { NarrativeBlockKindV1 } from './NarrativePilotV1';

const BLOCKS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];

function request(): NarrativeScriptRequestV3 {
  const root = join(__dirname, '..', '..', '..');
  const workbench = JSON.parse(readFileSync(join(
    root, 'fixtures', 'editorial-v7', 'madrid-history-es-120.json'
  ), 'utf8')) as EditorialWorkbenchV7;
  const sources = JSON.parse(readFileSync(join(
    root, 'fixtures', 'sources', 'madrid-history-es.json'
  ), 'utf8')) as PoiEnrichmentSnapshot;
  const core = JSON.parse(readFileSync(join(
    root, 'fixtures', 'editorial-v6', 'core', 'editorial-core-v6-madrid-20260807-e',
    'madrid-history-es-120.json'
  ), 'utf8')) as { prominence: WikimediaProminenceSnapshotV6 };
  return buildNarrativeScriptRequestV3(buildNarrativeEvidenceCaseFromWorkbenchV3(
    workbench, sources, core.prominence
  ));
}

function fixture() {
  const input = request();
  const plan = canonicalizeNarrativeClaimPlanV3({
    schemaVersion: 'narrative-claim-plan-draft-v3',
    scenes: input.scenes.map((scene) => {
      const byRole = new Map(scene.evidenceFacts.map((fact) => [fact.role, fact]));
      const historical = byRole.get('historical')!;
      return {
        sceneId: scene.sceneId,
        openingType: 'architectural_reversal',
        blocks: BLOCKS.map((kind) => ({
          kind,
          purpose: `Propósito ${kind}`,
          claims: kind === 'opening' ? [{
            text: 'Cambio histórico sustentado.',
            relation: historical.relationSupport.includes('chronology') ? 'chronology' : 'direct',
            evidenceFactIds: [historical.factId],
          }] : kind === 'look' ? [{
            text: 'Detalle visible sustentado.', relation: 'direct',
            evidenceFactIds: [byRole.get('observable')!.factId],
          }] : kind === 'human_conflict' ? [{
            text: 'Decisión humana sustentada.', relation: 'direct',
            evidenceFactIds: [byRole.get('human')!.factId],
          }] : [],
        })),
      };
    }),
  }, input);
  const vocabulary = ['la', 'historia', 'de', 'este', 'lugar', 'se', 'entiende', 'con', 'una', 'mirada'];
  const scripts = materializeNarrativeScriptsV3({
    schemaVersion: 'narrative-prose-draft-v3',
    scripts: input.scenes.map((scene) => ({
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
  }, input, plan);
  return { input, plan, scripts };
}

function scores(input: NarrativeScriptRequestV3, dimension = 4) {
  return {
    dimensions: {
      curiosity: dimension,
      humanTension: 4,
      lookingUtility: 4,
      naturalness: 4,
      progression: 4,
    },
    scenes: input.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      score: 4,
      rationale: 'Cumple el contrato.',
    })),
  };
}

describe('NarrativeCriticV3', () => {
  it('accepts findings-only grounding reports and derives the gate locally', () => {
    const { input, plan } = fixture();
    const criticRequest = buildNarrativeGroundingCriticRequestV3(input, plan);
    const report = validateNarrativeGroundingCriticReportV3({
      schemaVersion: 'narrative-grounding-critic-report-v3',
      unsupportedClaims: [],
      improperCausality: [],
      misleadingOmissions: [],
    }, criticRequest);

    expect(evaluateNarrativeGroundingGateV3(report)).toEqual({ passed: true, reasons: [] });
    expect(narrativeRepairInstructionsV3(report)).toEqual([]);
  });

  it('keeps a valid factual rejection valid without model-authored repair instructions', () => {
    const { input, plan } = fixture();
    const criticRequest = buildNarrativeGroundingCriticRequestV3(input, plan);
    const claim = plan.scenes[0].blocks[0].claims[0];
    const report = validateNarrativeGroundingCriticReportV3({
      schemaVersion: 'narrative-grounding-critic-report-v3',
      unsupportedClaims: [{
        sceneId: input.scenes[0].sceneId,
        claimId: claim.claimId,
        severity: 'critical',
        detail: 'La evidencia no contiene esa afirmación.',
      }],
      improperCausality: [],
      misleadingOmissions: [],
    }, criticRequest);

    expect(evaluateNarrativeGroundingGateV3(report)).toEqual({
      passed: false,
      reasons: ['unsupported_claim', 'critical_unsupported_claim'],
    });
    expect(narrativeRepairInstructionsV3(report)[0]).toContain(claim.claimId);
  });

  it('rejects invalid dynamic claim references as protocol errors', () => {
    const { input, plan } = fixture();
    const criticRequest = buildNarrativeGroundingCriticRequestV3(input, plan);

    expect(() => validateNarrativeGroundingCriticReportV3({
      schemaVersion: 'narrative-grounding-critic-report-v3',
      unsupportedClaims: [{
        sceneId: input.scenes[0].sceneId,
        claimId: 'invented-claim',
        severity: 'minor',
        detail: 'Referencia falsa.',
      }],
      improperCausality: [],
      misleadingOmissions: [],
    }, criticRequest)).toThrow('invalid claim reference');
  });

  it('computes final factual and quality gates without premiumReadiness', () => {
    const { input, plan, scripts } = fixture();
    const criticRequest = buildNarrativeCriticRequestV3(input, plan, scripts);
    const clean = validateNarrativeCriticReportV3({
      schemaVersion: 'narrative-critic-report-v3',
      newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
      scores: scores(input),
    }, criticRequest);
    expect(evaluateNarrativeCriticGateV3(clean)).toEqual({ passed: true, reasons: [] });

    const weak = validateNarrativeCriticReportV3({
      schemaVersion: 'narrative-critic-report-v3',
      newClaims: [], distortedClaims: [], omittedClaims: [], misleadingOmissions: [],
      scores: scores(input, 3),
    }, criticRequest);
    expect(evaluateNarrativeCriticGateV3(weak)).toEqual({
      passed: false,
      reasons: ['dimension_below_4'],
    });
    expect(narrativeRepairInstructionsV3(weak)[0]).toContain('curiosity');
  });

  it('does not expose verdict, premium readiness, or repair instructions in model schemas', () => {
    const schemas = JSON.stringify({
      grounding: narrativeGroundingCriticReportSchemaV3(),
      final: narrativeCriticReportSchemaV3(),
    });

    expect(schemas).not.toMatch(/verdict|premiumReadiness|repairInstructions/);
    expect(schemas).toContain('"additionalProperties":false');
  });
});
