import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeEvidenceFactV1,
  NarrativeQualityDimensionV1,
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
  validateNarrativeScriptRequestV1,
  validateNarrativeScriptsV1,
} from './NarrativePilotV1';

export const NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V1 = 'narrative-critic-request-v1' as const;
export const NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V1 = 'narrative-critic-report-v1' as const;

export interface NarrativeCriticRequestV1 {
  schemaVersion: typeof NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V1;
  request: NarrativeScriptRequestV1;
  scripts: SceneNarrativeScriptV1[];
  allowedEvidence: Array<{
    sceneId: string;
    evidenceFacts: NarrativeEvidenceFactV1[];
  }>;
}

export interface NarrativeCriticReportV1 {
  schemaVersion: typeof NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V1;
  verdict: 'approve' | 'reject';
  unsupportedClaims: Array<{
    sceneId: string;
    severity: 'minor' | 'critical';
    claim: string;
    detail: string;
  }>;
  misleadingOmissions: Array<{
    sceneId: string;
    evidenceFactId: string;
    detail: string;
  }>;
  scores: {
    dimensions: Record<NarrativeQualityDimensionV1, number>;
    scenes: Array<{ sceneId: string; score: number; rationale: string }>;
  };
  premiumReadiness: number;
  repairInstructions: string[];
}

export type NarrativeCriticGateReasonV1 =
  | 'unsupported_claim'
  | 'critical_unsupported_claim'
  | 'misleading_omission'
  | 'dimension_below_4'
  | 'scene_below_3'
  | 'premium_readiness_below_4';

const QUALITY_DIMENSIONS: NarrativeQualityDimensionV1[] = [
  'curiosity', 'humanTension', 'lookingUtility', 'naturalness', 'progression',
];

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function score(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new Error(`${label} must be an integer from 1 to 5`);
  }
  return value as number;
}

export function buildNarrativeCriticRequestV1(
  request: NarrativeScriptRequestV1,
  scripts: SceneNarrativeScriptV1[]
): NarrativeCriticRequestV1 {
  return validateNarrativeCriticRequestV1({
    schemaVersion: NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V1,
    request,
    scripts,
    allowedEvidence: request.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      evidenceFacts: scene.evidenceFacts.map((fact) => ({ ...fact })),
    })),
  });
}

export function validateNarrativeCriticRequestV1(
  value: NarrativeCriticRequestV1
): NarrativeCriticRequestV1 {
  const root = objectValue(value, 'narrative critic request');
  exactKeys(root, ['schemaVersion', 'request', 'scripts', 'allowedEvidence'], 'narrative critic request');
  if (value.schemaVersion !== NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V1) {
    throw new Error('invalid narrative critic request schemaVersion');
  }
  validateNarrativeScriptRequestV1(value.request);
  validateNarrativeScriptsV1(value.scripts, value.request);
  const expected = value.request.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    evidenceFacts: scene.evidenceFacts,
  }));
  if (editorialFingerprintV7(value.allowedEvidence) !== editorialFingerprintV7(expected)) {
    throw new Error('narrative critic allowed evidence diverges from the original request');
  }
  return value;
}

export function narrativeCriticReportSchemaV1(): Record<string, unknown> {
  const scoreSchema = { type: 'integer', minimum: 1, maximum: 5 };
  return {
    type: 'object',
    additionalProperties: false,
    required: [
      'schemaVersion', 'verdict', 'unsupportedClaims', 'misleadingOmissions',
      'scores', 'premiumReadiness', 'repairInstructions',
    ],
    properties: {
      schemaVersion: { const: NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V1 },
      verdict: { enum: ['approve', 'reject'] },
      unsupportedClaims: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['sceneId', 'severity', 'claim', 'detail'],
          properties: {
            sceneId: { type: 'string' }, severity: { enum: ['minor', 'critical'] },
            claim: { type: 'string' }, detail: { type: 'string' },
          },
        },
      },
      misleadingOmissions: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['sceneId', 'evidenceFactId', 'detail'],
          properties: {
            sceneId: { type: 'string' }, evidenceFactId: { type: 'string' },
            detail: { type: 'string' },
          },
        },
      },
      scores: {
        type: 'object', additionalProperties: false,
        required: ['dimensions', 'scenes'],
        properties: {
          dimensions: {
            type: 'object', additionalProperties: false, required: QUALITY_DIMENSIONS,
            properties: Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
              dimension, scoreSchema,
            ])),
          },
          scenes: {
            type: 'array', minItems: 3, maxItems: 3,
            items: {
              type: 'object', additionalProperties: false,
              required: ['sceneId', 'score', 'rationale'],
              properties: {
                sceneId: { type: 'string' }, score: scoreSchema, rationale: { type: 'string' },
              },
            },
          },
        },
      },
      premiumReadiness: scoreSchema,
      repairInstructions: { type: 'array', uniqueItems: true, items: { type: 'string' } },
    },
  };
}

export function evaluateNarrativeCriticGateV1(
  report: NarrativeCriticReportV1
): { passed: boolean; reasons: NarrativeCriticGateReasonV1[] } {
  const reasons = new Set<NarrativeCriticGateReasonV1>();
  if (report.unsupportedClaims.length > 0) reasons.add('unsupported_claim');
  if (report.unsupportedClaims.some((claim) => claim.severity === 'critical')) {
    reasons.add('critical_unsupported_claim');
  }
  if (report.misleadingOmissions.length > 0) reasons.add('misleading_omission');
  if (Object.values(report.scores.dimensions).some((value) => value < 4)) {
    reasons.add('dimension_below_4');
  }
  if (report.scores.scenes.some((scene) => scene.score < 3)) reasons.add('scene_below_3');
  if (report.premiumReadiness < 4) reasons.add('premium_readiness_below_4');
  return { passed: reasons.size === 0, reasons: [...reasons] };
}

export function validateNarrativeCriticReportV1(
  raw: unknown,
  request: NarrativeCriticRequestV1
): NarrativeCriticReportV1 {
  validateNarrativeCriticRequestV1(request);
  const root = objectValue(raw, 'narrative critic report');
  exactKeys(root, [
    'schemaVersion', 'verdict', 'unsupportedClaims', 'misleadingOmissions',
    'scores', 'premiumReadiness', 'repairInstructions',
  ], 'narrative critic report');
  if (root.schemaVersion !== NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V1
    || (root.verdict !== 'approve' && root.verdict !== 'reject')) {
    throw new Error('invalid narrative critic report metadata');
  }
  const sceneIds = request.request.scenes.map((scene) => scene.sceneId);
  if (!Array.isArray(root.unsupportedClaims) || !Array.isArray(root.misleadingOmissions)) {
    throw new Error('narrative critic factual findings must be arrays');
  }
  const unsupportedClaims = root.unsupportedClaims.map((rawClaim, index) => {
    const claim = objectValue(rawClaim, `unsupportedClaims[${index}]`);
    exactKeys(claim, ['sceneId', 'severity', 'claim', 'detail'], `unsupportedClaims[${index}]`);
    if (!sceneIds.includes(claim.sceneId as string)
      || (claim.severity !== 'minor' && claim.severity !== 'critical')) {
      throw new Error(`unsupportedClaims[${index}] is invalid`);
    }
    return {
      sceneId: claim.sceneId as string,
      severity: claim.severity as 'minor' | 'critical',
      claim: requiredString(claim.claim, `unsupportedClaims[${index}].claim`),
      detail: requiredString(claim.detail, `unsupportedClaims[${index}].detail`),
    };
  });
  const misleadingOmissions = root.misleadingOmissions.map((rawOmission, index) => {
    const omission = objectValue(rawOmission, `misleadingOmissions[${index}]`);
    exactKeys(omission, ['sceneId', 'evidenceFactId', 'detail'], `misleadingOmissions[${index}]`);
    const sceneIndex = sceneIds.indexOf(omission.sceneId as string);
    const allowedFactIds = new Set(
      sceneIndex < 0 ? [] : request.allowedEvidence[sceneIndex].evidenceFacts.map((fact) => fact.factId)
    );
    if (sceneIndex < 0 || !allowedFactIds.has(omission.evidenceFactId as string)) {
      throw new Error(`misleadingOmissions[${index}] references invalid allowed evidence`);
    }
    return {
      sceneId: omission.sceneId as string,
      evidenceFactId: omission.evidenceFactId as string,
      detail: requiredString(omission.detail, `misleadingOmissions[${index}].detail`),
    };
  });
  const rawScores = objectValue(root.scores, 'narrative critic scores');
  exactKeys(rawScores, ['dimensions', 'scenes'], 'narrative critic scores');
  const rawDimensions = objectValue(rawScores.dimensions, 'narrative critic dimensions');
  exactKeys(rawDimensions, QUALITY_DIMENSIONS, 'narrative critic dimensions');
  const dimensions = Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
    dimension, score(rawDimensions[dimension], `narrative critic ${dimension}`),
  ])) as Record<NarrativeQualityDimensionV1, number>;
  if (!Array.isArray(rawScores.scenes) || rawScores.scenes.length !== sceneIds.length) {
    throw new Error('narrative critic scene scores must preserve scene count');
  }
  const scenes = rawScores.scenes.map((rawScene, index) => {
    const scene = objectValue(rawScene, `narrative critic scenes[${index}]`);
    exactKeys(scene, ['sceneId', 'score', 'rationale'], `narrative critic scenes[${index}]`);
    if (scene.sceneId !== sceneIds[index]) throw new Error('narrative critic scene score order changed');
    return {
      sceneId: scene.sceneId as string,
      score: score(scene.score, `narrative critic ${scene.sceneId} score`),
      rationale: requiredString(scene.rationale, `narrative critic ${scene.sceneId} rationale`),
    };
  });
  if (!Array.isArray(root.repairInstructions)
    || root.repairInstructions.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error('narrative critic repair instructions must contain strings');
  }
  const repairInstructions = root.repairInstructions.map((item) => (item as string).trim());
  if (new Set(repairInstructions).size !== repairInstructions.length) {
    throw new Error('narrative critic repair instructions must be unique');
  }
  const report: NarrativeCriticReportV1 = {
    schemaVersion: NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V1,
    verdict: root.verdict,
    unsupportedClaims,
    misleadingOmissions,
    scores: { dimensions, scenes },
    premiumReadiness: score(root.premiumReadiness, 'narrative critic premiumReadiness'),
    repairInstructions,
  };
  const gate = evaluateNarrativeCriticGateV1(report);
  if ((report.verdict === 'approve') !== gate.passed) {
    throw new Error('narrative critic verdict contradicts the autonomous gate');
  }
  if ((report.verdict === 'approve' && repairInstructions.length > 0)
    || (report.verdict === 'reject' && repairInstructions.length === 0)) {
    throw new Error('narrative critic repair instructions contradict the verdict');
  }
  return report;
}
