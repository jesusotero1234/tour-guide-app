import { NarrativeClaimPlanV4, validateNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { NarrativeEvidenceCaseV4, validateNarrativeEvidenceCaseV4 } from './NarrativeEvidenceV4';
import { NarrativeBlockKindV1, NarrativeQualityDimensionV1 } from './NarrativePilotV1';
import { NarrativeTourTextV4 } from './NarrativeProseV4';

export const NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V4 =
  'narrative-grounding-critic-request-v4' as const;
export const NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V4 =
  'narrative-grounding-critic-report-v4' as const;
export const NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V4 =
  'narrative-critic-request-v4' as const;
export const NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V4 =
  'narrative-critic-report-v4' as const;

export interface NarrativeGroundingCriticRequestV4 {
  schemaVersion: typeof NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V4;
  evidence: NarrativeEvidenceCaseV4;
  plan: NarrativeClaimPlanV4;
}

interface ClaimFindingV4 {
  sceneId: string;
  claimId: string;
  detail: string;
}

interface SeverityClaimFindingV4 extends ClaimFindingV4 {
  severity: 'minor' | 'critical';
}

export interface NarrativeGroundingCriticReportV4 {
  schemaVersion: typeof NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V4;
  unsupportedClaims: SeverityClaimFindingV4[];
  improperCausality: ClaimFindingV4[];
  unsupportedInterpretations: ClaimFindingV4[];
  meaningChangingOmissions: Array<{
    sceneId: string;
    evidenceFactId: string;
    detail: string;
  }>;
}

export interface NarrativeCriticRequestV4 {
  schemaVersion: typeof NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V4;
  evidence: NarrativeEvidenceCaseV4;
  plan: NarrativeClaimPlanV4;
  text: NarrativeTourTextV4;
}

export type NarrativeCriticLocationV4 = NarrativeBlockKindV1 | 'introduction' | 'transition';

export interface NarrativeCriticReportV4 {
  schemaVersion: typeof NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V4;
  newClaims: Array<{
    sceneId: string;
    location: NarrativeCriticLocationV4;
    severity: 'minor' | 'critical';
    claim: string;
    detail: string;
  }>;
  distortedClaims: SeverityClaimFindingV4[];
  omittedClaims: ClaimFindingV4[];
  misleadingOmissions: Array<{
    sceneId: string;
    evidenceFactId: string;
    detail: string;
  }>;
  scores: {
    dimensions: Record<NarrativeQualityDimensionV1, number>;
    scenes: Array<{ sceneId: string; score: number; rationale: string }>;
  };
}

export type NarrativeGroundingGateReasonV4 =
  | 'unsupported_claim'
  | 'critical_unsupported_claim'
  | 'improper_causality'
  | 'unsupported_interpretation'
  | 'meaning_changing_omission';

export type NarrativeCriticGateReasonV4 =
  | 'new_claim'
  | 'distorted_claim'
  | 'omitted_claim'
  | 'misleading_omission'
  | 'critical_finding'
  | 'dimension_below_4'
  | 'scene_below_4';

const BLOCK_KINDS: NarrativeBlockKindV1[] = [
  'opening', 'look', 'human_conflict', 'interpretation', 'closing',
];
const LOCATIONS: NarrativeCriticLocationV4[] = [
  'introduction', ...BLOCK_KINDS, 'transition',
];
const QUALITY_DIMENSIONS: NarrativeQualityDimensionV1[] = [
  'curiosity', 'humanTension', 'lookingUtility', 'naturalness', 'progression',
];

function strictObject(properties: Record<string, unknown>): Record<string, unknown> {
  return {
    type: 'object', additionalProperties: false,
    required: Object.keys(properties), properties,
  };
}

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

function severity(value: unknown, label: string): 'minor' | 'critical' {
  if (value !== 'minor' && value !== 'critical') throw new Error(`${label} has invalid severity`);
  return value;
}

function score(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new Error(`${label} must be an integer from 1 to 5`);
  }
  return value as number;
}

function claimIdsByScene(plan: NarrativeClaimPlanV4): Map<string, Set<string>> {
  return new Map(plan.scenes.map((scene) => [
    scene.sceneId,
    new Set(scene.blocks.flatMap((block) => block.claims.map((claim) => claim.claimId))),
  ]));
}

function evidenceIdsByScene(evidence: NarrativeEvidenceCaseV4): Map<string, Set<string>> {
  return new Map(evidence.scenes.map((scene) => [
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
  factId: unknown,
  evidence: Map<string, Set<string>>,
  label: string
): { sceneId: string; evidenceFactId: string } {
  if (typeof sceneId !== 'string' || typeof factId !== 'string'
    || !evidence.get(sceneId)?.has(factId)) {
    throw new Error(`${label} has invalid evidence reference`);
  }
  return { sceneId, evidenceFactId: factId };
}

function validateTextBinding(
  text: NarrativeTourTextV4,
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4
): NarrativeTourTextV4 {
  if (text.schemaVersion !== 'narrative-tour-text-v4'
    || text.scripts.length !== evidence.scenes.length || !text.introduction.trim()) {
    throw new Error('narrative critic v4 text metadata changed');
  }
  text.scripts.forEach((script, sceneIndex) => {
    const scene = evidence.scenes[sceneIndex];
    const planned = plan.scenes[sceneIndex];
    if (script.sceneId !== scene.sceneId || script.name !== scene.name
      || script.blocks.length !== BLOCK_KINDS.length || script.bodyWordCount < 160
      || script.bodyWordCount > 200
      || JSON.stringify(script.transition) !== JSON.stringify(planned.transition)) {
      throw new Error(`narrative critic v4 ${scene.sceneId} text metadata changed`);
    }
    script.blocks.forEach((block, blockIndex) => {
      const expected = planned.blocks[blockIndex];
      if (block.blockId !== expected.blockId || block.kind !== expected.kind || !block.text.trim()
        || JSON.stringify(block.evidenceFactIds) !== JSON.stringify(expected.evidenceFactIds)) {
        throw new Error(`narrative critic v4 ${scene.sceneId} block metadata changed`);
      }
    });
  });
  return text;
}

export function buildNarrativeGroundingCriticRequestV4(
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4
): NarrativeGroundingCriticRequestV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  return {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V4,
    evidence,
    plan: validateNarrativeClaimPlanV4(plan, evidence),
  };
}

export function validateNarrativeGroundingCriticRequestV4(
  raw: NarrativeGroundingCriticRequestV4
): NarrativeGroundingCriticRequestV4 {
  if (raw.schemaVersion !== NARRATIVE_GROUNDING_CRITIC_REQUEST_SCHEMA_VERSION_V4) {
    throw new Error('invalid narrative grounding critic request v4 schemaVersion');
  }
  return buildNarrativeGroundingCriticRequestV4(raw.evidence, raw.plan);
}

export function buildNarrativeCriticRequestV4(
  evidence: NarrativeEvidenceCaseV4,
  plan: NarrativeClaimPlanV4,
  text: NarrativeTourTextV4
): NarrativeCriticRequestV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  const canonicalPlan = validateNarrativeClaimPlanV4(plan, evidence);
  return {
    schemaVersion: NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V4,
    evidence,
    plan: canonicalPlan,
    text: validateTextBinding(text, evidence, canonicalPlan),
  };
}

export function validateNarrativeCriticRequestV4(
  raw: NarrativeCriticRequestV4
): NarrativeCriticRequestV4 {
  if (raw.schemaVersion !== NARRATIVE_CRITIC_REQUEST_SCHEMA_VERSION_V4) {
    throw new Error('invalid narrative critic request v4 schemaVersion');
  }
  return buildNarrativeCriticRequestV4(raw.evidence, raw.plan, raw.text);
}

function claimFindingSchema(includeSeverity: boolean): Record<string, unknown> {
  return strictObject({
    sceneId: { type: 'string' },
    claimId: { type: 'string' },
    ...(includeSeverity ? { severity: { type: 'string', enum: ['minor', 'critical'] } } : {}),
    detail: { type: 'string' },
  });
}

function omissionSchema(): Record<string, unknown> {
  return strictObject({
    sceneId: { type: 'string' }, evidenceFactId: { type: 'string' }, detail: { type: 'string' },
  });
}

export function narrativeGroundingCriticReportSchemaV4(): Record<string, unknown> {
  return strictObject({
    schemaVersion: {
      type: 'string', enum: [NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V4],
    },
    unsupportedClaims: { type: 'array', items: claimFindingSchema(true) },
    improperCausality: { type: 'array', items: claimFindingSchema(false) },
    unsupportedInterpretations: { type: 'array', items: claimFindingSchema(false) },
    meaningChangingOmissions: { type: 'array', items: omissionSchema() },
  });
}

function validateClaimFindings(
  raw: unknown,
  claims: Map<string, Set<string>>,
  label: string,
  withSeverity: true
): SeverityClaimFindingV4[];
function validateClaimFindings(
  raw: unknown,
  claims: Map<string, Set<string>>,
  label: string,
  withSeverity: false
): ClaimFindingV4[];
function validateClaimFindings(
  raw: unknown,
  claims: Map<string, Set<string>>,
  label: string,
  withSeverity: boolean
): Array<ClaimFindingV4 | SeverityClaimFindingV4> {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  return raw.map((entry, index) => {
    const finding = objectValue(entry, `${label}[${index}]`);
    exactKeys(
      finding,
      withSeverity ? ['sceneId', 'claimId', 'severity', 'detail'] : ['sceneId', 'claimId', 'detail'],
      `${label}[${index}]`
    );
    return {
      ...validateClaimReference(finding.sceneId, finding.claimId, claims, `${label}[${index}]`),
      ...(withSeverity ? { severity: severity(finding.severity, `${label}[${index}]`) } : {}),
      detail: requiredString(finding.detail, `${label}[${index}].detail`),
    };
  });
}

function validateOmissions(
  raw: unknown,
  evidence: Map<string, Set<string>>,
  label: string
): Array<{ sceneId: string; evidenceFactId: string; detail: string }> {
  if (!Array.isArray(raw)) throw new Error(`${label} must be an array`);
  return raw.map((entry, index) => {
    const finding = objectValue(entry, `${label}[${index}]`);
    exactKeys(finding, ['sceneId', 'evidenceFactId', 'detail'], `${label}[${index}]`);
    return {
      ...validateEvidenceReference(
        finding.sceneId, finding.evidenceFactId, evidence, `${label}[${index}]`
      ),
      detail: requiredString(finding.detail, `${label}[${index}].detail`),
    };
  });
}

export function validateNarrativeGroundingCriticReportV4(
  raw: unknown,
  rawRequest: NarrativeGroundingCriticRequestV4
): NarrativeGroundingCriticReportV4 {
  const request = validateNarrativeGroundingCriticRequestV4(rawRequest);
  const root = objectValue(raw, 'narrative grounding critic report v4');
  exactKeys(root, [
    'schemaVersion', 'unsupportedClaims', 'improperCausality',
    'unsupportedInterpretations', 'meaningChangingOmissions',
  ], 'narrative grounding critic report v4');
  if (root.schemaVersion !== NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V4) {
    throw new Error('invalid narrative grounding critic report v4 schemaVersion');
  }
  const claims = claimIdsByScene(request.plan);
  const evidence = evidenceIdsByScene(request.evidence);
  return {
    schemaVersion: NARRATIVE_GROUNDING_CRITIC_REPORT_SCHEMA_VERSION_V4,
    unsupportedClaims: validateClaimFindings(root.unsupportedClaims, claims, 'unsupportedClaims', true),
    improperCausality: validateClaimFindings(root.improperCausality, claims, 'improperCausality', false),
    unsupportedInterpretations: validateClaimFindings(
      root.unsupportedInterpretations, claims, 'unsupportedInterpretations', false
    ),
    meaningChangingOmissions: validateOmissions(
      root.meaningChangingOmissions, evidence, 'meaningChangingOmissions'
    ),
  };
}

export function evaluateNarrativeGroundingGateV4(
  report: NarrativeGroundingCriticReportV4
): { passed: boolean; reasons: NarrativeGroundingGateReasonV4[] } {
  const reasons = new Set<NarrativeGroundingGateReasonV4>();
  if (report.unsupportedClaims.length) reasons.add('unsupported_claim');
  if (report.unsupportedClaims.some((finding) => finding.severity === 'critical')) {
    reasons.add('critical_unsupported_claim');
  }
  if (report.improperCausality.length) reasons.add('improper_causality');
  if (report.unsupportedInterpretations.length) reasons.add('unsupported_interpretation');
  if (report.meaningChangingOmissions.length) reasons.add('meaning_changing_omission');
  return { passed: reasons.size === 0, reasons: [...reasons] };
}

export function narrativeCriticReportSchemaV4(): Record<string, unknown> {
  const boundedScore = { type: 'integer', minimum: 1, maximum: 5 };
  return strictObject({
    schemaVersion: { type: 'string', enum: [NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V4] },
    newClaims: { type: 'array', items: strictObject({
      sceneId: { type: 'string' }, location: { type: 'string', enum: LOCATIONS },
      severity: { type: 'string', enum: ['minor', 'critical'] },
      claim: { type: 'string' }, detail: { type: 'string' },
    }) },
    distortedClaims: { type: 'array', items: claimFindingSchema(true) },
    omittedClaims: { type: 'array', items: claimFindingSchema(false) },
    misleadingOmissions: { type: 'array', items: omissionSchema() },
    scores: strictObject({
      dimensions: strictObject(Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
        dimension, boundedScore,
      ]))),
      scenes: { type: 'array', items: strictObject({
        sceneId: { type: 'string' }, score: boundedScore, rationale: { type: 'string' },
      }) },
    }),
  });
}

export function validateNarrativeCriticReportV4(
  raw: unknown,
  rawRequest: NarrativeCriticRequestV4
): NarrativeCriticReportV4 {
  const request = validateNarrativeCriticRequestV4(rawRequest);
  const root = objectValue(raw, 'narrative critic report v4');
  exactKeys(root, [
    'schemaVersion', 'newClaims', 'distortedClaims', 'omittedClaims',
    'misleadingOmissions', 'scores',
  ], 'narrative critic report v4');
  if (root.schemaVersion !== NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V4
    || !Array.isArray(root.newClaims)) {
    throw new Error('invalid narrative critic report v4 metadata');
  }
  const claims = claimIdsByScene(request.plan);
  const evidence = evidenceIdsByScene(request.evidence);
  const sceneIds = request.evidence.scenes.map((scene) => scene.sceneId);
  const newClaims = root.newClaims.map((entry, index) => {
    const finding = objectValue(entry, `newClaims[${index}]`);
    exactKeys(
      finding,
      ['sceneId', 'location', 'severity', 'claim', 'detail'],
      `newClaims[${index}]`
    );
    if (!sceneIds.includes(finding.sceneId as string)
      || !LOCATIONS.includes(finding.location as NarrativeCriticLocationV4)) {
      throw new Error(`newClaims[${index}] has invalid scene or location`);
    }
    return {
      sceneId: finding.sceneId as string,
      location: finding.location as NarrativeCriticLocationV4,
      severity: severity(finding.severity, `newClaims[${index}]`),
      claim: requiredString(finding.claim, `newClaims[${index}].claim`),
      detail: requiredString(finding.detail, `newClaims[${index}].detail`),
    };
  });
  const rawScores = objectValue(root.scores, 'narrative critic v4 scores');
  exactKeys(rawScores, ['dimensions', 'scenes'], 'narrative critic v4 scores');
  const rawDimensions = objectValue(rawScores.dimensions, 'narrative critic v4 dimensions');
  exactKeys(rawDimensions, QUALITY_DIMENSIONS, 'narrative critic v4 dimensions');
  if (!Array.isArray(rawScores.scenes) || rawScores.scenes.length !== 7) {
    throw new Error('narrative critic v4 requires seven scene scores');
  }
  const scenes = rawScores.scenes.map((entry, index) => {
    const scene = objectValue(entry, `scores.scenes[${index}]`);
    exactKeys(scene, ['sceneId', 'score', 'rationale'], `scores.scenes[${index}]`);
    if (scene.sceneId !== sceneIds[index]) {
      throw new Error('narrative critic v4 scene score order changed');
    }
    return {
      sceneId: sceneIds[index],
      score: score(scene.score, `scores.scenes[${index}].score`),
      rationale: requiredString(scene.rationale, `scores.scenes[${index}].rationale`),
    };
  });
  return {
    schemaVersion: NARRATIVE_CRITIC_REPORT_SCHEMA_VERSION_V4,
    newClaims,
    distortedClaims: validateClaimFindings(root.distortedClaims, claims, 'distortedClaims', true),
    omittedClaims: validateClaimFindings(root.omittedClaims, claims, 'omittedClaims', false),
    misleadingOmissions: validateOmissions(
      root.misleadingOmissions, evidence, 'misleadingOmissions'
    ),
    scores: {
      dimensions: Object.fromEntries(QUALITY_DIMENSIONS.map((dimension) => [
        dimension, score(rawDimensions[dimension], `scores.dimensions.${dimension}`),
      ])) as Record<NarrativeQualityDimensionV1, number>,
      scenes,
    },
  };
}

export function evaluateNarrativeCriticGateV4(
  report: NarrativeCriticReportV4
): { passed: boolean; reasons: NarrativeCriticGateReasonV4[] } {
  const reasons = new Set<NarrativeCriticGateReasonV4>();
  if (report.newClaims.length) reasons.add('new_claim');
  if (report.distortedClaims.length) reasons.add('distorted_claim');
  if (report.omittedClaims.length) reasons.add('omitted_claim');
  if (report.misleadingOmissions.length) reasons.add('misleading_omission');
  if ([...report.newClaims, ...report.distortedClaims]
    .some((finding) => finding.severity === 'critical')) reasons.add('critical_finding');
  if (Object.values(report.scores.dimensions).some((value) => value < 4)) {
    reasons.add('dimension_below_4');
  }
  if (report.scores.scenes.some((scene) => scene.score < 4)) reasons.add('scene_below_4');
  return { passed: reasons.size === 0, reasons: [...reasons] };
}

export function narrativeRepairInstructionsV4(report: NarrativeCriticReportV4): string[] {
  return [
    ...report.newClaims.map((finding) => (
      `Elimina el claim nuevo en ${finding.sceneId}/${finding.location}: ${finding.detail}`
    )),
    ...report.distortedClaims.map((finding) => `Corrige ${finding.claimId}: ${finding.detail}`),
    ...report.omittedClaims.map((finding) => `Desarrolla ${finding.claimId}: ${finding.detail}`),
    ...report.misleadingOmissions.map((finding) => (
      `Incluye sin distorsionar ${finding.evidenceFactId}: ${finding.detail}`
    )),
    ...QUALITY_DIMENSIONS.flatMap((dimension) => (
      report.scores.dimensions[dimension] < 4
        ? [`Eleva ${dimension} a 4/5 sin añadir hechos nuevos.`]
        : []
    )),
    ...report.scores.scenes.flatMap((scene) => (
      scene.score < 4
        ? [`Eleva la escena ${scene.sceneId} a 4/5 sin añadir hechos nuevos: ${scene.rationale}`]
        : []
    )),
  ];
}
