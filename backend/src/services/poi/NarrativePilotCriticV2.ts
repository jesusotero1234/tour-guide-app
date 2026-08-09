import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeClaimPlanV1,
  validateNarrativeClaimPlanV1,
} from './NarrativeClaimPlanV1';
import {
  NarrativeBlockKindV1,
  NarrativeEvidenceFactV1,
  NarrativeQualityDimensionV1,
  NarrativeScriptRequestV1,
  SceneNarrativeScriptV1,
  validateNarrativeScriptRequestV1,
} from './NarrativePilotV1';

export const NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V1 =
  'narrative-grounding-critic-request-v1' as const;
export const NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V1 =
  'narrative-grounding-critic-report-v1' as const;
export const NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V2 = 'narrative-critic-request-v2' as const;
export const NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V2 = 'narrative-critic-report-v2' as const;

interface AllowedNarrativeEvidenceV2 {
  sceneId: string;
  evidenceFacts: NarrativeEvidenceFactV1[];
}

export interface NarrativeGroundingCriticRequestV1 {
  schemaVersion: typeof NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V1;
  request: NarrativeScriptRequestV1;
  plan: NarrativeClaimPlanV1;
  allowedEvidence: AllowedNarrativeEvidenceV2[];
}

export interface NarrativeGroundingCriticReportV1 {
  schemaVersion: typeof NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V1;
  unsupportedClaims: Array<{
    sceneId: string;
    claimId: string;
    severity: 'minor' | 'critical';
    detail: string;
  }>;
  improperCausality: Array<{ sceneId: string; claimId: string; detail: string }>;
  misleadingOmissions: Array<{ sceneId: string; evidenceFactId: string; detail: string }>;
  repairInstructions: string[];
}

export type NarrativeGroundingGateReasonV1 =
  | 'unsupported_claim'
  | 'critical_unsupported_claim'
  | 'improper_causality'
  | 'misleading_omission';

export interface NarrativeCriticRequestV2 {
  schemaVersion: typeof NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V2;
  request: NarrativeScriptRequestV1;
  plan: NarrativeClaimPlanV1;
  scripts: SceneNarrativeScriptV1[];
  allowedEvidence: AllowedNarrativeEvidenceV2[];
}

export type NarrativeCriticLocationV2 = NarrativeBlockKindV1 | 'transition';

export interface NarrativeCriticReportV2 {
  schemaVersion: typeof NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V2;
  newClaims: Array<{
    sceneId: string;
    location: NarrativeCriticLocationV2;
    severity: 'minor' | 'critical';
    claim: string;
    detail: string;
  }>;
  distortedClaims: Array<{
    sceneId: string;
    claimId: string;
    severity: 'minor' | 'critical';
    detail: string;
  }>;
  omittedClaims: Array<{ sceneId: string; claimId: string; detail: string }>;
  misleadingOmissions: Array<{ sceneId: string; evidenceFactId: string; detail: string }>;
  scores: {
    dimensions: Record<NarrativeQualityDimensionV1, number>;
    scenes: Array<{ sceneId: string; score: number; rationale: string }>;
  };
  premiumReadiness: number;
  repairInstructions: string[];
}

export type NarrativeCriticGateReasonV2 =
  | 'new_claim'
  | 'distorted_claim'
  | 'omitted_claim'
  | 'misleading_omission'
  | 'critical_unsupported_claim'
  | 'dimension_below_4'
  | 'scene_below_3'
  | 'premium_readiness_below_4';

const BLOCK_KINDS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const LOCATIONS: NarrativeCriticLocationV2[] = [...BLOCK_KINDS, 'transition'];
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

function instructions(value: unknown, label: string): string[] {
  if (!Array.isArray(value)
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must contain strings`);
  }
  const result = value.map((item) => (item as string).trim());
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique`);
  return result;
}

function allowedEvidence(request: NarrativeScriptRequestV1): AllowedNarrativeEvidenceV2[] {
  return request.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    evidenceFacts: scene.evidenceFacts.map((fact) => ({ ...fact })),
  }));
}

function validateAllowedEvidence(
  value: unknown,
  request: NarrativeScriptRequestV1
): AllowedNarrativeEvidenceV2[] {
  const expected = allowedEvidence(request);
  if (editorialFingerprintV7(value) !== editorialFingerprintV7(expected)) {
    throw new Error('narrative critic allowed evidence diverges from the original request');
  }
  return value as AllowedNarrativeEvidenceV2[];
}

function claimIdsByScene(plan: NarrativeClaimPlanV1): Map<string, Set<string>> {
  return new Map(plan.scenes.map((scene) => [
    scene.sceneId,
    new Set(scene.blocks.flatMap((block) => block.claims.map((claim) => claim.claimId))),
  ]));
}

function evidenceIdsByScene(request: NarrativeScriptRequestV1): Map<string, Set<string>> {
  return new Map(request.scenes.map((scene) => [
    scene.sceneId,
    new Set(scene.evidenceFacts.map((fact) => fact.factId)),
  ]));
}

function validateClaimReference(
  sceneId: unknown,
  claimId: unknown,
  claims: Map<string, Set<string>>,
  label: string
): { sceneId: string; claimId: string } {
  if (typeof sceneId !== 'string' || typeof claimId !== 'string'
    || !claims.get(sceneId)?.has(claimId)) {
    throw new Error(`${label} has invalid claim reference`);
  }
  return { sceneId, claimId };
}

function validateEvidenceReference(
  sceneId: unknown,
  evidenceFactId: unknown,
  evidence: Map<string, Set<string>>,
  label: string
): { sceneId: string; evidenceFactId: string } {
  if (typeof sceneId !== 'string' || typeof evidenceFactId !== 'string'
    || !evidence.get(sceneId)?.has(evidenceFactId)) {
    throw new Error(`${label} has invalid evidence reference`);
  }
  return { sceneId, evidenceFactId };
}

function severity(value: unknown, label: string): 'minor' | 'critical' {
  if (value !== 'minor' && value !== 'critical') throw new Error(`${label} has invalid severity`);
  return value;
}

function strictObject(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object', additionalProperties: false,
    required: Object.keys(properties), properties,
  };
}

export function buildNarrativeGroundingCriticRequestV1(
  request: NarrativeScriptRequestV1,
  plan: NarrativeClaimPlanV1
): NarrativeGroundingCriticRequestV1 {
  validateNarrativeScriptRequestV1(request);
  const canonicalPlan = validateNarrativeClaimPlanV1(plan, request);
  return {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V1,
    request,
    plan: canonicalPlan,
    allowedEvidence: allowedEvidence(request),
  };
}

export function validateNarrativeGroundingCriticRequestV1(
  raw: unknown
): NarrativeGroundingCriticRequestV1 {
  const root = objectValue(raw, 'narrative grounding critic request');
  exactKeys(root, ['schemaVersion', 'request', 'plan', 'allowedEvidence'], 'narrative grounding critic request');
  if (root.schemaVersion !== NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V1) {
    throw new Error('invalid narrative grounding critic request schemaVersion');
  }
  const request = root.request as NarrativeScriptRequestV1;
  validateNarrativeScriptRequestV1(request);
  const plan = validateNarrativeClaimPlanV1(root.plan, request);
  return {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V1,
    request,
    plan,
    allowedEvidence: validateAllowedEvidence(root.allowedEvidence, request),
  };
}

export function narrativeGroundingCriticReportSchemaV1(): Record<string, unknown> {
  const claimFinding = strictObject({
    sceneId: { type: 'string' }, claimId: { type: 'string' },
    severity: { type: 'string', enum: ['minor', 'critical'] }, detail: { type: 'string' },
  });
  const causality = strictObject({
    sceneId: { type: 'string' }, claimId: { type: 'string' }, detail: { type: 'string' },
  });
  const omission = strictObject({
    sceneId: { type: 'string' }, evidenceFactId: { type: 'string' }, detail: { type: 'string' },
  });
  return strictObject({
    schemaVersion: {
      type: 'string', enum: [NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V1],
    },
    unsupportedClaims: { type: 'array', items: claimFinding },
    improperCausality: { type: 'array', items: causality },
    misleadingOmissions: { type: 'array', items: omission },
    repairInstructions: { type: 'array', items: { type: 'string' } },
  });
}

export function evaluateNarrativeGroundingGateV1(
  report: NarrativeGroundingCriticReportV1
): { passed: boolean; reasons: NarrativeGroundingGateReasonV1[] } {
  const reasons = new Set<NarrativeGroundingGateReasonV1>();
  if (report.unsupportedClaims.length > 0) reasons.add('unsupported_claim');
  if (report.unsupportedClaims.some((finding) => finding.severity === 'critical')) {
    reasons.add('critical_unsupported_claim');
  }
  if (report.improperCausality.length > 0) reasons.add('improper_causality');
  if (report.misleadingOmissions.length > 0) reasons.add('misleading_omission');
  return { passed: reasons.size === 0, reasons: [...reasons] };
}

export function validateNarrativeGroundingCriticReportV1(
  raw: unknown,
  rawRequest: NarrativeGroundingCriticRequestV1
): NarrativeGroundingCriticReportV1 {
  const request = validateNarrativeGroundingCriticRequestV1(rawRequest);
  const root = objectValue(raw, 'narrative grounding critic report');
  exactKeys(root, [
    'schemaVersion', 'unsupportedClaims', 'improperCausality', 'misleadingOmissions',
    'repairInstructions',
  ], 'narrative grounding critic report');
  if (root.schemaVersion !== NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V1
    || !Array.isArray(root.unsupportedClaims) || !Array.isArray(root.improperCausality)
    || !Array.isArray(root.misleadingOmissions)) {
    throw new Error('invalid narrative grounding critic report metadata');
  }
  const claims = claimIdsByScene(request.plan);
  const evidence = evidenceIdsByScene(request.request);
  const unsupportedClaims = root.unsupportedClaims.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `unsupportedClaims[${index}]`);
    exactKeys(finding, ['sceneId', 'claimId', 'severity', 'detail'], `unsupportedClaims[${index}]`);
    return {
      ...validateClaimReference(finding.sceneId, finding.claimId, claims, `unsupportedClaims[${index}]`),
      severity: severity(finding.severity, `unsupportedClaims[${index}]`),
      detail: requiredString(finding.detail, `unsupportedClaims[${index}].detail`),
    };
  });
  const improperCausality = root.improperCausality.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `improperCausality[${index}]`);
    exactKeys(finding, ['sceneId', 'claimId', 'detail'], `improperCausality[${index}]`);
    return {
      ...validateClaimReference(finding.sceneId, finding.claimId, claims, `improperCausality[${index}]`),
      detail: requiredString(finding.detail, `improperCausality[${index}].detail`),
    };
  });
  const misleadingOmissions = root.misleadingOmissions.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `misleadingOmissions[${index}]`);
    exactKeys(finding, ['sceneId', 'evidenceFactId', 'detail'], `misleadingOmissions[${index}]`);
    return {
      ...validateEvidenceReference(
        finding.sceneId, finding.evidenceFactId, evidence, `misleadingOmissions[${index}]`
      ),
      detail: requiredString(finding.detail, `misleadingOmissions[${index}].detail`),
    };
  });
  const report: NarrativeGroundingCriticReportV1 = {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V1,
    unsupportedClaims,
    improperCausality,
    misleadingOmissions,
    repairInstructions: instructions(root.repairInstructions, 'grounding repair instructions'),
  };
  const gate = evaluateNarrativeGroundingGateV1(report);
  if ((gate.passed && report.repairInstructions.length > 0)
    || (!gate.passed && report.repairInstructions.length === 0)) {
    throw new Error('grounding repair instructions contradict the local gate');
  }
  return report;
}

function validateScriptsShape(
  raw: unknown,
  request: NarrativeScriptRequestV1,
  plan: NarrativeClaimPlanV1
): SceneNarrativeScriptV1[] {
  if (!Array.isArray(raw) || raw.length !== request.scenes.length) {
    throw new Error('narrative critic scripts must preserve exact scene count');
  }
  return raw.map((rawScript, sceneIndex) => {
    const script = objectValue(rawScript, `narrative critic scripts[${sceneIndex}]`);
    exactKeys(script, ['sceneId', 'openingType', 'blocks', 'transition', 'wordCount'], `narrative critic scripts[${sceneIndex}]`);
    const expected = request.scenes[sceneIndex];
    const planned = plan.scenes[sceneIndex];
    if (script.sceneId !== expected.sceneId || script.openingType !== planned.openingType
      || !Array.isArray(script.blocks) || script.blocks.length !== BLOCK_KINDS.length
      || !Number.isInteger(script.wordCount)) {
      throw new Error(`narrative critic script ${expected.sceneId} metadata changed`);
    }
    const blocks = script.blocks.map((rawBlock, blockIndex) => {
      const block = objectValue(rawBlock, `${expected.sceneId} critic blocks[${blockIndex}]`);
      exactKeys(block, ['blockId', 'kind', 'text', 'evidenceFactIds'], `${expected.sceneId} critic blocks[${blockIndex}]`);
      const expectedBlock = planned.blocks[blockIndex];
      if (block.blockId !== expectedBlock.blockId || block.kind !== expectedBlock.kind
        || editorialFingerprintV7(block.evidenceFactIds)
          !== editorialFingerprintV7(expectedBlock.evidenceFactIds)) {
        throw new Error(`narrative critic script ${expected.sceneId} derived block metadata changed`);
      }
      return {
        blockId: expectedBlock.blockId,
        kind: expectedBlock.kind,
        text: requiredString(block.text, `${expected.sceneId} critic block text`),
        evidenceFactIds: [...expectedBlock.evidenceFactIds],
      };
    });
    const transition = objectValue(script.transition, `${expected.sceneId} critic transition`);
    exactKeys(transition, ['kind', 'targetSceneId', 'text'], `${expected.sceneId} critic transition`);
    const expectedKind = expected.nextSceneId ? 'walk_to_next' : 'tour_end';
    if (transition.kind !== expectedKind || transition.targetSceneId !== expected.nextSceneId) {
      throw new Error(`narrative critic script ${expected.sceneId} transition metadata changed`);
    }
    return {
      sceneId: expected.sceneId,
      openingType: planned.openingType,
      blocks,
      transition: {
        kind: expectedKind,
        targetSceneId: expected.nextSceneId,
        text: requiredString(transition.text, `${expected.sceneId} critic transition text`),
      },
      wordCount: script.wordCount as number,
    };
  });
}

export function buildNarrativeCriticRequestV2(
  request: NarrativeScriptRequestV1,
  plan: NarrativeClaimPlanV1,
  scripts: SceneNarrativeScriptV1[]
): NarrativeCriticRequestV2 {
  validateNarrativeScriptRequestV1(request);
  const canonicalPlan = validateNarrativeClaimPlanV1(plan, request);
  return {
    schemaVersion: NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V2,
    request,
    plan: canonicalPlan,
    scripts: validateScriptsShape(scripts, request, canonicalPlan),
    allowedEvidence: allowedEvidence(request),
  };
}

export function validateNarrativeCriticRequestV2(raw: unknown): NarrativeCriticRequestV2 {
  const root = objectValue(raw, 'narrative critic request v2');
  exactKeys(root, ['schemaVersion', 'request', 'plan', 'scripts', 'allowedEvidence'], 'narrative critic request v2');
  if (root.schemaVersion !== NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V2) {
    throw new Error('invalid narrative critic request v2 schemaVersion');
  }
  const request = root.request as NarrativeScriptRequestV1;
  validateNarrativeScriptRequestV1(request);
  const plan = validateNarrativeClaimPlanV1(root.plan, request);
  return {
    schemaVersion: NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V2,
    request,
    plan,
    scripts: validateScriptsShape(root.scripts, request, plan),
    allowedEvidence: validateAllowedEvidence(root.allowedEvidence, request),
  };
}

export function narrativeCriticReportSchemaV2(): Record<string, unknown> {
  const scoreSchema = { type: 'integer', minimum: 1, maximum: 5 };
  const newClaim = strictObject({
    sceneId: { type: 'string' }, location: { type: 'string', enum: LOCATIONS },
    severity: { type: 'string', enum: ['minor', 'critical'] },
    claim: { type: 'string' }, detail: { type: 'string' },
  });
  const plannedClaim = strictObject({
    sceneId: { type: 'string' }, claimId: { type: 'string' },
    severity: { type: 'string', enum: ['minor', 'critical'] }, detail: { type: 'string' },
  });
  const omittedClaim = strictObject({
    sceneId: { type: 'string' }, claimId: { type: 'string' }, detail: { type: 'string' },
  });
  const evidenceOmission = strictObject({
    sceneId: { type: 'string' }, evidenceFactId: { type: 'string' }, detail: { type: 'string' },
  });
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V2] },
    newClaims: { type: 'array', items: newClaim },
    distortedClaims: { type: 'array', items: plannedClaim },
    omittedClaims: { type: 'array', items: omittedClaim },
    misleadingOmissions: { type: 'array', items: evidenceOmission },
    scores: strictObject({
      dimensions: strictObject(Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
        dimension, scoreSchema,
      ]))),
      scenes: { type: 'array', items: strictObject({
        sceneId: { type: 'string' }, score: scoreSchema, rationale: { type: 'string' },
      }) },
    }),
    premiumReadiness: scoreSchema,
    repairInstructions: { type: 'array', items: { type: 'string' } },
  });
}

export function evaluateNarrativeCriticGateV2(
  report: NarrativeCriticReportV2
): { passed: boolean; reasons: NarrativeCriticGateReasonV2[] } {
  const reasons = new Set<NarrativeCriticGateReasonV2>();
  if (report.newClaims.length > 0) reasons.add('new_claim');
  if ([...report.newClaims, ...report.distortedClaims]
    .some((finding) => finding.severity === 'critical')) {
    reasons.add('critical_unsupported_claim');
  }
  if (report.distortedClaims.length > 0) reasons.add('distorted_claim');
  if (report.omittedClaims.length > 0) reasons.add('omitted_claim');
  if (report.misleadingOmissions.length > 0) reasons.add('misleading_omission');
  if (Object.values(report.scores.dimensions).some((value) => value < 4)) {
    reasons.add('dimension_below_4');
  }
  if (report.scores.scenes.some((scene) => scene.score < 3)) reasons.add('scene_below_3');
  if (report.premiumReadiness < 4) reasons.add('premium_readiness_below_4');
  return { passed: reasons.size === 0, reasons: [...reasons] };
}

export function validateNarrativeCriticReportV2(
  raw: unknown,
  rawRequest: NarrativeCriticRequestV2
): NarrativeCriticReportV2 {
  const request = validateNarrativeCriticRequestV2(rawRequest);
  const root = objectValue(raw, 'narrative critic report v2');
  exactKeys(root, [
    'schemaVersion', 'newClaims', 'distortedClaims', 'omittedClaims',
    'misleadingOmissions', 'scores', 'premiumReadiness', 'repairInstructions',
  ], 'narrative critic report v2');
  if (root.schemaVersion !== NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V2
    || !Array.isArray(root.newClaims) || !Array.isArray(root.distortedClaims)
    || !Array.isArray(root.omittedClaims) || !Array.isArray(root.misleadingOmissions)) {
    throw new Error('invalid narrative critic report v2 metadata');
  }
  const claims = claimIdsByScene(request.plan);
  const evidence = evidenceIdsByScene(request.request);
  const sceneIds = request.request.scenes.map((scene) => scene.sceneId);
  const newClaims = root.newClaims.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `newClaims[${index}]`);
    exactKeys(finding, ['sceneId', 'location', 'severity', 'claim', 'detail'], `newClaims[${index}]`);
    if (!sceneIds.includes(finding.sceneId as string)
      || !LOCATIONS.includes(finding.location as NarrativeCriticLocationV2)) {
      throw new Error(`newClaims[${index}] has invalid scene or location`);
    }
    return {
      sceneId: finding.sceneId as string,
      location: finding.location as NarrativeCriticLocationV2,
      severity: severity(finding.severity, `newClaims[${index}]`),
      claim: requiredString(finding.claim, `newClaims[${index}].claim`),
      detail: requiredString(finding.detail, `newClaims[${index}].detail`),
    };
  });
  const distortedClaims = root.distortedClaims.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `distortedClaims[${index}]`);
    exactKeys(finding, ['sceneId', 'claimId', 'severity', 'detail'], `distortedClaims[${index}]`);
    return {
      ...validateClaimReference(finding.sceneId, finding.claimId, claims, `distortedClaims[${index}]`),
      severity: severity(finding.severity, `distortedClaims[${index}]`),
      detail: requiredString(finding.detail, `distortedClaims[${index}].detail`),
    };
  });
  const omittedClaims = root.omittedClaims.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `omittedClaims[${index}]`);
    exactKeys(finding, ['sceneId', 'claimId', 'detail'], `omittedClaims[${index}]`);
    return {
      ...validateClaimReference(finding.sceneId, finding.claimId, claims, `omittedClaims[${index}]`),
      detail: requiredString(finding.detail, `omittedClaims[${index}].detail`),
    };
  });
  const misleadingOmissions = root.misleadingOmissions.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `misleadingOmissions[${index}]`);
    exactKeys(finding, ['sceneId', 'evidenceFactId', 'detail'], `misleadingOmissions[${index}]`);
    return {
      ...validateEvidenceReference(
        finding.sceneId, finding.evidenceFactId, evidence, `misleadingOmissions[${index}]`
      ),
      detail: requiredString(finding.detail, `misleadingOmissions[${index}].detail`),
    };
  });
  const rawScores = objectValue(root.scores, 'narrative critic v2 scores');
  exactKeys(rawScores, ['dimensions', 'scenes'], 'narrative critic v2 scores');
  const rawDimensions = objectValue(rawScores.dimensions, 'narrative critic v2 dimensions');
  exactKeys(rawDimensions, QUALITY_DIMENSIONS, 'narrative critic v2 dimensions');
  const dimensions = Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
    dimension, score(rawDimensions[dimension], `narrative critic v2 ${dimension}`),
  ])) as Record<NarrativeQualityDimensionV1, number>;
  if (!Array.isArray(rawScores.scenes) || rawScores.scenes.length !== sceneIds.length) {
    throw new Error('narrative critic v2 scene scores must preserve scene count');
  }
  const scenes = rawScores.scenes.map((rawScene, index) => {
    const scene = objectValue(rawScene, `narrative critic v2 scenes[${index}]`);
    exactKeys(scene, ['sceneId', 'score', 'rationale'], `narrative critic v2 scenes[${index}]`);
    if (scene.sceneId !== sceneIds[index]) throw new Error('narrative critic v2 scene score order changed');
    return {
      sceneId: sceneIds[index],
      score: score(scene.score, `narrative critic v2 ${sceneIds[index]} score`),
      rationale: requiredString(scene.rationale, `narrative critic v2 ${sceneIds[index]} rationale`),
    };
  });
  const report: NarrativeCriticReportV2 = {
    schemaVersion: NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V2,
    newClaims,
    distortedClaims,
    omittedClaims,
    misleadingOmissions,
    scores: { dimensions, scenes },
    premiumReadiness: score(root.premiumReadiness, 'narrative critic v2 premiumReadiness'),
    repairInstructions: instructions(root.repairInstructions, 'narrative critic v2 repair instructions'),
  };
  const gate = evaluateNarrativeCriticGateV2(report);
  if ((gate.passed && report.repairInstructions.length > 0)
    || (!gate.passed && report.repairInstructions.length === 0)) {
    throw new Error('narrative critic v2 repair instructions contradict the local gate');
  }
  return report;
}
