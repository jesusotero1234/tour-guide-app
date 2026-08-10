import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeClaimPlanV3,
  NarrativeScriptRequestV3,
  narrativeTransitionTextV3,
  validateNarrativeClaimPlanV3,
  validateNarrativeScriptRequestV3,
} from './NarrativeContractsV3';
import {
  NarrativeBlockKindV1,
  NarrativeQualityDimensionV1,
  SceneNarrativeScriptV1,
  narrativeWordCountV1,
} from './NarrativePilotV1';

export const NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V3 =
  'narrative-grounding-critic-request-v3' as const;
export const NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V3 =
  'narrative-grounding-critic-report-v3' as const;
export const NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V3 =
  'narrative-critic-request-v3' as const;
export const NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V3 =
  'narrative-critic-report-v3' as const;

export interface NarrativeGroundingCriticRequestV3 {
  schemaVersion: typeof NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V3;
  request: NarrativeScriptRequestV3;
  plan: NarrativeClaimPlanV3;
}

export interface NarrativeGroundingCriticReportV3 {
  schemaVersion: typeof NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V3;
  unsupportedClaims: Array<{
    sceneId: string;
    claimId: string;
    severity: 'minor' | 'critical';
    detail: string;
  }>;
  improperCausality: Array<{ sceneId: string; claimId: string; detail: string }>;
  misleadingOmissions: Array<{ sceneId: string; evidenceFactId: string; detail: string }>;
}

export interface NarrativeCriticRequestV3 {
  schemaVersion: typeof NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V3;
  request: NarrativeScriptRequestV3;
  plan: NarrativeClaimPlanV3;
  scripts: SceneNarrativeScriptV1[];
}

export type NarrativeCriticLocationV3 = NarrativeBlockKindV1 | 'transition';

export interface NarrativeCriticReportV3 {
  schemaVersion: typeof NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V3;
  newClaims: Array<{
    sceneId: string;
    location: NarrativeCriticLocationV3;
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
}

export type NarrativeGroundingGateReasonV3 =
  | 'unsupported_claim'
  | 'critical_unsupported_claim'
  | 'improper_causality'
  | 'misleading_omission';

export type NarrativeCriticGateReasonV3 =
  | 'new_claim'
  | 'distorted_claim'
  | 'omitted_claim'
  | 'misleading_omission'
  | 'critical_unsupported_claim'
  | 'dimension_below_4'
  | 'scene_below_3';

const BLOCK_KINDS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const LOCATIONS: NarrativeCriticLocationV3[] = [...BLOCK_KINDS, 'transition'];
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

function claimIdsByScene(plan: NarrativeClaimPlanV3): Map<string, Set<string>> {
  return new Map(plan.scenes.map((scene) => [
    scene.sceneId,
    new Set(scene.blocks.flatMap((block) => block.claims.map((claim) => claim.claimId))),
  ]));
}

function evidenceIdsByScene(request: NarrativeScriptRequestV3): Map<string, Set<string>> {
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

function validateScripts(
  raw: SceneNarrativeScriptV1[],
  request: NarrativeScriptRequestV3,
  plan: NarrativeClaimPlanV3
): SceneNarrativeScriptV1[] {
  if (!Array.isArray(raw) || raw.length !== request.scenes.length) {
    throw new Error('narrative critic v3 scripts must preserve exact scene count');
  }
  return raw.map((script, sceneIndex) => {
    const expectedScene = request.scenes[sceneIndex];
    const expectedPlan = plan.scenes[sceneIndex];
    if (script.sceneId !== expectedScene.sceneId || script.openingType !== expectedPlan.openingType
      || script.blocks.length !== BLOCK_KINDS.length || script.wordCount !== narrativeWordCountV1(script)
      || script.wordCount < 220 || script.wordCount > 260) {
      throw new Error(`narrative critic v3 script ${expectedScene.sceneId} metadata changed`);
    }
    for (const [blockIndex, block] of script.blocks.entries()) {
      const plannedBlock = expectedPlan.blocks[blockIndex];
      if (block.blockId !== plannedBlock.blockId || block.kind !== plannedBlock.kind
        || editorialFingerprintV7(block.evidenceFactIds)
          !== editorialFingerprintV7(plannedBlock.evidenceFactIds)
        || !block.text.trim()) {
        throw new Error(`narrative critic v3 script ${expectedScene.sceneId} block metadata changed`);
      }
    }
    const transitionKind = expectedScene.nextSceneId ? 'walk_to_next' : 'tour_end';
    if (script.transition.kind !== transitionKind
      || script.transition.targetSceneId !== expectedScene.nextSceneId
      || script.transition.text !== narrativeTransitionTextV3(request, sceneIndex)) {
      throw new Error(`narrative critic v3 script ${expectedScene.sceneId} transition changed`);
    }
    return script;
  });
}

export function buildNarrativeGroundingCriticRequestV3(
  request: NarrativeScriptRequestV3,
  plan: NarrativeClaimPlanV3
): NarrativeGroundingCriticRequestV3 {
  validateNarrativeScriptRequestV3(request);
  return {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V3,
    request,
    plan: validateNarrativeClaimPlanV3(plan, request),
  };
}

export function validateNarrativeGroundingCriticRequestV3(
  raw: unknown
): NarrativeGroundingCriticRequestV3 {
  const root = objectValue(raw, 'narrative grounding critic request v3');
  exactKeys(root, ['schemaVersion', 'request', 'plan'], 'narrative grounding critic request v3');
  if (root.schemaVersion !== NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V3) {
    throw new Error('invalid narrative grounding critic request v3 schemaVersion');
  }
  const request = validateNarrativeScriptRequestV3(root.request as NarrativeScriptRequestV3);
  return {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V3,
    request,
    plan: validateNarrativeClaimPlanV3(root.plan, request),
  };
}

export function narrativeGroundingCriticReportSchemaV3(): Record<string, unknown> {
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
      type: 'string', enum: [NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V3],
    },
    unsupportedClaims: { type: 'array', items: claimFinding },
    improperCausality: { type: 'array', items: causality },
    misleadingOmissions: { type: 'array', items: omission },
  });
}

export function validateNarrativeGroundingCriticReportV3(
  raw: unknown,
  rawRequest: NarrativeGroundingCriticRequestV3
): NarrativeGroundingCriticReportV3 {
  const request = validateNarrativeGroundingCriticRequestV3(rawRequest);
  const root = objectValue(raw, 'narrative grounding critic report v3');
  exactKeys(root, [
    'schemaVersion', 'unsupportedClaims', 'improperCausality', 'misleadingOmissions',
  ], 'narrative grounding critic report v3');
  if (root.schemaVersion !== NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V3
    || !Array.isArray(root.unsupportedClaims) || !Array.isArray(root.improperCausality)
    || !Array.isArray(root.misleadingOmissions)) {
    throw new Error('invalid narrative grounding critic report v3 metadata');
  }
  const claims = claimIdsByScene(request.plan);
  const evidence = evidenceIdsByScene(request.request);
  return {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V3,
    unsupportedClaims: root.unsupportedClaims.map((rawFinding, index) => {
      const finding = objectValue(rawFinding, `unsupportedClaims[${index}]`);
      exactKeys(finding, ['sceneId', 'claimId', 'severity', 'detail'], `unsupportedClaims[${index}]`);
      return {
        ...validateClaimReference(finding.sceneId, finding.claimId, claims, `unsupportedClaims[${index}]`),
        severity: severity(finding.severity, `unsupportedClaims[${index}]`),
        detail: requiredString(finding.detail, `unsupportedClaims[${index}].detail`),
      };
    }),
    improperCausality: root.improperCausality.map((rawFinding, index) => {
      const finding = objectValue(rawFinding, `improperCausality[${index}]`);
      exactKeys(finding, ['sceneId', 'claimId', 'detail'], `improperCausality[${index}]`);
      return {
        ...validateClaimReference(finding.sceneId, finding.claimId, claims, `improperCausality[${index}]`),
        detail: requiredString(finding.detail, `improperCausality[${index}].detail`),
      };
    }),
    misleadingOmissions: root.misleadingOmissions.map((rawFinding, index) => {
      const finding = objectValue(rawFinding, `misleadingOmissions[${index}]`);
      exactKeys(finding, ['sceneId', 'evidenceFactId', 'detail'], `misleadingOmissions[${index}]`);
      return {
        ...validateEvidenceReference(
          finding.sceneId, finding.evidenceFactId, evidence, `misleadingOmissions[${index}]`
        ),
        detail: requiredString(finding.detail, `misleadingOmissions[${index}].detail`),
      };
    }),
  };
}

export function evaluateNarrativeGroundingGateV3(
  report: NarrativeGroundingCriticReportV3
): { passed: boolean; reasons: NarrativeGroundingGateReasonV3[] } {
  const reasons = new Set<NarrativeGroundingGateReasonV3>();
  if (report.unsupportedClaims.length) reasons.add('unsupported_claim');
  if (report.unsupportedClaims.some((finding) => finding.severity === 'critical')) {
    reasons.add('critical_unsupported_claim');
  }
  if (report.improperCausality.length) reasons.add('improper_causality');
  if (report.misleadingOmissions.length) reasons.add('misleading_omission');
  return { passed: reasons.size === 0, reasons: [...reasons] };
}

export function buildNarrativeCriticRequestV3(
  request: NarrativeScriptRequestV3,
  plan: NarrativeClaimPlanV3,
  scripts: SceneNarrativeScriptV1[]
): NarrativeCriticRequestV3 {
  validateNarrativeScriptRequestV3(request);
  const canonicalPlan = validateNarrativeClaimPlanV3(plan, request);
  return {
    schemaVersion: NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V3,
    request,
    plan: canonicalPlan,
    scripts: validateScripts(scripts, request, canonicalPlan),
  };
}

export function validateNarrativeCriticRequestV3(raw: unknown): NarrativeCriticRequestV3 {
  const root = objectValue(raw, 'narrative critic request v3');
  exactKeys(root, ['schemaVersion', 'request', 'plan', 'scripts'], 'narrative critic request v3');
  if (root.schemaVersion !== NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V3) {
    throw new Error('invalid narrative critic request v3 schemaVersion');
  }
  const request = validateNarrativeScriptRequestV3(root.request as NarrativeScriptRequestV3);
  const plan = validateNarrativeClaimPlanV3(root.plan, request);
  return {
    schemaVersion: NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V3,
    request,
    plan,
    scripts: validateScripts(root.scripts as SceneNarrativeScriptV1[], request, plan),
  };
}

export function narrativeCriticReportSchemaV3(): Record<string, unknown> {
  const scoreSchema = { type: 'integer', minimum: 1, maximum: 5 };
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V3] },
    newClaims: { type: 'array', items: strictObject({
      sceneId: { type: 'string' }, location: { type: 'string', enum: LOCATIONS },
      severity: { type: 'string', enum: ['minor', 'critical'] },
      claim: { type: 'string' }, detail: { type: 'string' },
    }) },
    distortedClaims: { type: 'array', items: strictObject({
      sceneId: { type: 'string' }, claimId: { type: 'string' },
      severity: { type: 'string', enum: ['minor', 'critical'] }, detail: { type: 'string' },
    }) },
    omittedClaims: { type: 'array', items: strictObject({
      sceneId: { type: 'string' }, claimId: { type: 'string' }, detail: { type: 'string' },
    }) },
    misleadingOmissions: { type: 'array', items: strictObject({
      sceneId: { type: 'string' }, evidenceFactId: { type: 'string' }, detail: { type: 'string' },
    }) },
    scores: strictObject({
      dimensions: strictObject(Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
        dimension, scoreSchema,
      ]))),
      scenes: { type: 'array', items: strictObject({
        sceneId: { type: 'string' }, score: scoreSchema, rationale: { type: 'string' },
      }) },
    }),
  });
}

export function validateNarrativeCriticReportV3(
  raw: unknown,
  rawRequest: NarrativeCriticRequestV3
): NarrativeCriticReportV3 {
  const request = validateNarrativeCriticRequestV3(rawRequest);
  const root = objectValue(raw, 'narrative critic report v3');
  exactKeys(root, [
    'schemaVersion', 'newClaims', 'distortedClaims', 'omittedClaims',
    'misleadingOmissions', 'scores',
  ], 'narrative critic report v3');
  if (root.schemaVersion !== NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V3
    || !Array.isArray(root.newClaims) || !Array.isArray(root.distortedClaims)
    || !Array.isArray(root.omittedClaims) || !Array.isArray(root.misleadingOmissions)) {
    throw new Error('invalid narrative critic report v3 metadata');
  }
  const claims = claimIdsByScene(request.plan);
  const evidence = evidenceIdsByScene(request.request);
  const sceneIds = request.request.scenes.map((scene) => scene.sceneId);
  const newClaims = root.newClaims.map((rawFinding, index) => {
    const finding = objectValue(rawFinding, `newClaims[${index}]`);
    exactKeys(finding, ['sceneId', 'location', 'severity', 'claim', 'detail'], `newClaims[${index}]`);
    if (!sceneIds.includes(finding.sceneId as string)
      || !LOCATIONS.includes(finding.location as NarrativeCriticLocationV3)) {
      throw new Error(`newClaims[${index}] has invalid scene or location`);
    }
    return {
      sceneId: finding.sceneId as string,
      location: finding.location as NarrativeCriticLocationV3,
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
  const rawScores = objectValue(root.scores, 'narrative critic v3 scores');
  exactKeys(rawScores, ['dimensions', 'scenes'], 'narrative critic v3 scores');
  const rawDimensions = objectValue(rawScores.dimensions, 'narrative critic v3 dimensions');
  exactKeys(rawDimensions, QUALITY_DIMENSIONS, 'narrative critic v3 dimensions');
  const dimensions = Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
    dimension, score(rawDimensions[dimension], `narrative critic v3 ${dimension}`),
  ])) as Record<NarrativeQualityDimensionV1, number>;
  if (!Array.isArray(rawScores.scenes) || rawScores.scenes.length !== sceneIds.length) {
    throw new Error('narrative critic v3 scene scores must preserve scene count');
  }
  const scenes = rawScores.scenes.map((rawScene, index) => {
    const scene = objectValue(rawScene, `narrative critic v3 scenes[${index}]`);
    exactKeys(scene, ['sceneId', 'score', 'rationale'], `narrative critic v3 scenes[${index}]`);
    if (scene.sceneId !== sceneIds[index]) throw new Error('narrative critic v3 scene score order changed');
    return {
      sceneId: sceneIds[index],
      score: score(scene.score, `narrative critic v3 ${sceneIds[index]} score`),
      rationale: requiredString(scene.rationale, `narrative critic v3 ${sceneIds[index]} rationale`),
    };
  });
  return {
    schemaVersion: NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V3,
    newClaims, distortedClaims, omittedClaims, misleadingOmissions,
    scores: { dimensions, scenes },
  };
}

export function evaluateNarrativeCriticGateV3(
  report: NarrativeCriticReportV3
): { passed: boolean; reasons: NarrativeCriticGateReasonV3[] } {
  const reasons = new Set<NarrativeCriticGateReasonV3>();
  if (report.newClaims.length) reasons.add('new_claim');
  if ([...report.newClaims, ...report.distortedClaims]
    .some((finding) => finding.severity === 'critical')) {
    reasons.add('critical_unsupported_claim');
  }
  if (report.distortedClaims.length) reasons.add('distorted_claim');
  if (report.omittedClaims.length) reasons.add('omitted_claim');
  if (report.misleadingOmissions.length) reasons.add('misleading_omission');
  if (Object.values(report.scores.dimensions).some((value) => value < 4)) {
    reasons.add('dimension_below_4');
  }
  if (report.scores.scenes.some((scene) => scene.score < 3)) reasons.add('scene_below_3');
  return { passed: reasons.size === 0, reasons: [...reasons] };
}

export function narrativeRepairInstructionsV3(
  report: NarrativeGroundingCriticReportV3 | NarrativeCriticReportV3
): string[] {
  if (report.schemaVersion === NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V3) {
    return [
      ...report.unsupportedClaims.map((finding) => (
        `Corrige o elimina ${finding.claimId}: ${finding.detail}`
      )),
      ...report.improperCausality.map((finding) => (
        `Elimina la causalidad de ${finding.claimId}: ${finding.detail}`
      )),
      ...report.misleadingOmissions.map((finding) => (
        `Incluye sin distorsionar ${finding.evidenceFactId}: ${finding.detail}`
      )),
    ];
  }
  return [
    ...report.newClaims.map((finding) => (
      `Elimina el claim nuevo en ${finding.sceneId}/${finding.location}: ${finding.detail}`
    )),
    ...report.distortedClaims.map((finding) => (
      `Corrige ${finding.claimId}: ${finding.detail}`
    )),
    ...report.omittedClaims.map((finding) => (
      `Desarrolla ${finding.claimId}: ${finding.detail}`
    )),
    ...report.misleadingOmissions.map((finding) => (
      `Incluye sin distorsionar ${finding.evidenceFactId}: ${finding.detail}`
    )),
    ...QUALITY_DIMENSIONS.flatMap((dimension) => (
      report.scores.dimensions[dimension] < 4
        ? [`Eleva ${dimension} a 4/5 sin añadir hechos nuevos.`]
        : []
    )),
    ...report.scores.scenes.flatMap((scene) => (
      scene.score < 3 ? [`Reescribe ${scene.sceneId} para superar 3/5: ${scene.rationale}`] : []
    )),
  ];
}
