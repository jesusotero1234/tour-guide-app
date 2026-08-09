import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildNarrativeCriticRequestV1,
  evaluateNarrativeCriticGateV1,
  NarrativeCriticReportV1,
  narrativeCriticReportSchemaV1,
  validateNarrativeCriticReportV1,
  validateNarrativeCriticRequestV1,
} from './NarrativePilotCriticV1';
import { NarrativeScriptResponseV1 } from './NarrativePilotV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

function load<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...parts), 'utf8')) as T;
}

function criticFixture(): {
  request: ReturnType<typeof buildNarrativeCriticRequestV1>;
  report: NarrativeCriticReportV1;
} {
  const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
  const response = load<NarrativeScriptResponseV1>(
    'narrative-pilot-v1', 'paris-premium-es.response.json'
  );
  const originalRequest = buildParisNarrativeScriptRequestV1(route);
  const request = buildNarrativeCriticRequestV1(originalRequest, response.scripts);
  const report: NarrativeCriticReportV1 = {
    schemaVersion: 'narrative-critic-report-v1',
    verdict: 'approve',
    unsupportedClaims: [],
    misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4,
        humanTension: 4,
        lookingUtility: 4,
        naturalness: 4,
        progression: 4,
      },
      scenes: [
        { sceneId: 'notre-dame', score: 4, rationale: 'Abre y orienta con claridad.' },
        { sceneId: 'louvre', score: 4, rationale: 'Sostiene el giro central.' },
        { sceneId: 'palais-royal', score: 4, rationale: 'Cierra la progresión.' },
      ],
    },
    premiumReadiness: 4,
    repairInstructions: [],
  };
  return { request, report };
}

describe('autonomous narrative critic v1 contract', () => {
  it('publishes a closed JSON Schema and accepts a consistent approval', () => {
    const { request, report } = criticFixture();

    expect(narrativeCriticReportSchemaV1()).toMatchObject({
      type: 'object',
      additionalProperties: false,
      required: [
        'schemaVersion', 'verdict', 'unsupportedClaims', 'misleadingOmissions',
        'scores', 'premiumReadiness', 'repairInstructions',
      ],
    });
    expect(validateNarrativeCriticRequestV1(request)).toEqual(request);
    expect(validateNarrativeCriticReportV1(report, request)).toEqual(report);
    expect(evaluateNarrativeCriticGateV1(report)).toEqual({ passed: true, reasons: [] });
  });

  it('rejects critic requests whose allowed evidence diverges from the original request', () => {
    const { request } = criticFixture();
    const changed = structuredClone(request);
    changed.allowedEvidence[0].evidenceFacts[0].excerpt += ' Texto no autorizado.';

    expect(() => validateNarrativeCriticRequestV1(changed)).toThrow('allowed evidence');
  });

  it('rejects reports whose verdict contradicts factual findings or score thresholds', () => {
    const { request, report } = criticFixture();
    const unsupported = structuredClone(report);
    unsupported.unsupportedClaims.push({
      sceneId: 'louvre',
      severity: 'critical',
      claim: 'Napoleón ordenó abrir el museo.',
      detail: 'La evidencia permitida no contiene esa atribución.',
    });
    expect(() => validateNarrativeCriticReportV1(unsupported, request))
      .toThrow('contradicts the autonomous gate');

    const lowPremium = structuredClone(report);
    lowPremium.premiumReadiness = 3;
    expect(() => validateNarrativeCriticReportV1(lowPremium, request))
      .toThrow('contradicts the autonomous gate');

    const falseRejection = structuredClone(report);
    falseRejection.verdict = 'reject';
    falseRejection.repairInstructions = ['Reescribir sin cambios concretos.'];
    expect(() => validateNarrativeCriticReportV1(falseRejection, request))
      .toThrow('contradicts the autonomous gate');
  });

  it('fails the gate for every unsupported claim, omission, premium score, or scene score', () => {
    const { report } = criticFixture();
    const rejected = structuredClone(report);
    rejected.verdict = 'reject';
    rejected.misleadingOmissions.push({
      sceneId: 'notre-dame',
      evidenceFactId: 'notre-dame-demolition-risk',
      detail: 'El texto oculta el riesgo de demolición necesario para entender el rescate.',
    });
    rejected.scores.dimensions.curiosity = 3;
    rejected.scores.scenes[1].score = 2;
    rejected.premiumReadiness = 3;
    rejected.repairInstructions = ['Restituir el hecho omitido y reforzar el giro del Louvre.'];

    const gate = evaluateNarrativeCriticGateV1(rejected);
    expect(gate.passed).toBe(false);
    expect(gate.reasons).toEqual(expect.arrayContaining([
      'misleading_omission',
      'dimension_below_4',
      'scene_below_3',
      'premium_readiness_below_4',
    ]));
  });
});
