import axios from 'axios';
import { EditorialCandidate, EvidenceFact, NarrativeRole } from './EditorialCandidate';

export const ROUTE_EDITORIAL_SCHEMA_VERSION = 'route-editorial-v2' as const;
export const ROUTE_EDITORIAL_MODEL = 'qwen2.5:14b' as const;
export const MAX_EDITORIAL_CANDIDATES = 18;

export type EditorialInclusion = 'essential' | 'supporting' | 'reject';

export interface EditorialBriefFact {
  id: string;
  kind: EvidenceFact['kind'];
  value: string;
}

export interface EditorialBriefCandidate {
  canonicalId: string;
  localName: string;
  category: string;
  fameScore: number;
  facts: EditorialBriefFact[];
}

export interface EditorialRouteBriefRequest {
  city: string;
  theme: string;
  language: string;
  requestedDuration: number;
  candidates: EditorialBriefCandidate[];
}

export interface CandidateEditorialAssessment {
  canonicalId: string;
  paidValueScore: number;
  inclusion: EditorialInclusion;
  recommendedRole: NarrativeRole | null;
  uniqueContribution: string;
  reason: string;
  evidenceIds: string[];
}

export interface TourEditorialBrief {
  schemaVersion: typeof ROUTE_EDITORIAL_SCHEMA_VERSION;
  promise: string;
  centralQuestion: string;
  arc: NarrativeRole[];
  candidateAssessments: CandidateEditorialAssessment[];
}

export interface EditorialBriefProvenance {
  model: string;
  promptFingerprint: string;
}

export interface EditorialRouteBriefServiceResponse {
  brief: unknown;
  provenance: EditorialBriefProvenance;
}

export interface EditorialRouteBriefArtifact {
  schemaVersion: typeof ROUTE_EDITORIAL_SCHEMA_VERSION;
  createdAt: string;
  model: string;
  promptFingerprint: string;
  input: EditorialRouteBriefRequest;
  response: TourEditorialBrief;
}

export interface RequestEditorialRouteBriefOptions {
  llmServiceUrl?: string;
  post?: (url: string, body: EditorialRouteBriefRequest) => Promise<{ data: unknown }>;
}

export class EditorialBriefValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'EditorialBriefValidationError';
  }
}

const NARRATIVE_ROLES = new Set<NarrativeRole>([
  'opening',
  'origins',
  'power',
  'public-life',
  'belief',
  'conflict',
  'transformation',
  'modern-city',
  'resolution',
]);

function compactFacts(facts: EvidenceFact[]): EditorialBriefFact[] {
  const observables = facts.filter((fact) => fact.kind === 'observable');
  const claims = facts.filter((fact) => fact.kind === 'claim').slice(0, 2);
  const contexts = facts.filter((fact) => fact.kind === 'context').slice(0, 2);
  const selected = [observables[0], ...claims, ...contexts].filter((fact): fact is EvidenceFact => Boolean(fact));

  for (const observable of observables.slice(1)) {
    if (selected.length >= 5) break;
    selected.push(observable);
  }

  return selected.slice(0, 5).map((fact) => ({
    id: fact.id,
    kind: fact.kind,
    value: fact.value.replace(/\s+/g, ' ').trim().slice(0, 280),
  }));
}

export function buildEditorialRouteBriefRequest(
  candidates: EditorialCandidate[],
  context: Omit<EditorialRouteBriefRequest, 'candidates'>
): EditorialRouteBriefRequest {
  const shortlistScore = (candidate: EditorialCandidate): number => {
    const diagnosticTierBonus = candidate.tier === 'essential' ? 40 : candidate.tier === 'strong' ? 20 : 0;
    return diagnosticTierBonus + candidate.firstVisitScore + candidate.fameScore;
  };
  const shortlisted = [...candidates]
    .sort((left, right) => (
      shortlistScore(right) - shortlistScore(left)
      || right.evidenceScore - left.evidenceScore
      || left.canonicalId.localeCompare(right.canonicalId)
    ))
    .slice(0, MAX_EDITORIAL_CANDIDATES);
  const projected = shortlisted.map((candidate) => ({
    canonicalId: candidate.canonicalId,
    localName: candidate.localName,
    category: candidate.category,
    fameScore: candidate.fameScore,
    facts: compactFacts(candidate.evidenceFacts),
  }));

  const withoutObservable = projected.find((candidate) => (
    !candidate.facts.some((fact) => fact.kind === 'observable')
  ));
  if (withoutObservable) {
    throw new EditorialBriefValidationError(
      `Candidate ${withoutObservable.canonicalId} has no compact observable evidence`
    );
  }

  return { ...context, candidates: projected };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new EditorialBriefValidationError(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new EditorialBriefValidationError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function narrativeRole(value: unknown, label: string): NarrativeRole {
  if (typeof value !== 'string' || !NARRATIVE_ROLES.has(value as NarrativeRole)) {
    throw new EditorialBriefValidationError(`${label} is not a valid narrative role`);
  }
  return value as NarrativeRole;
}

export function validateTourEditorialBrief(
  value: unknown,
  request: EditorialRouteBriefRequest,
  maxStops = 8
): TourEditorialBrief {
  const brief = objectValue(value, 'brief');
  if (brief.schemaVersion !== ROUTE_EDITORIAL_SCHEMA_VERSION) {
    throw new EditorialBriefValidationError(`schemaVersion must be ${ROUTE_EDITORIAL_SCHEMA_VERSION}`);
  }

  const promise = nonEmptyString(brief.promise, 'promise');
  const centralQuestion = nonEmptyString(brief.centralQuestion, 'centralQuestion');
  if (!Array.isArray(brief.arc) || brief.arc.length < 3 || brief.arc.length > 6) {
    throw new EditorialBriefValidationError('arc must contain between three and six roles');
  }
  const arc = brief.arc.map((role, index) => narrativeRole(role, `arc[${index}]`));
  if (new Set(arc).size !== arc.length) {
    throw new EditorialBriefValidationError('arc roles must be unique');
  }
  if (arc[0] !== 'opening' || arc[arc.length - 1] !== 'resolution') {
    throw new EditorialBriefValidationError('arc must start with opening and end with resolution');
  }

  if (!Array.isArray(brief.candidateAssessments)) {
    throw new EditorialBriefValidationError('candidateAssessments must be an array');
  }
  if (brief.candidateAssessments.length !== request.candidates.length) {
    throw new EditorialBriefValidationError('Every candidate must be assessed exactly once');
  }

  const inputById = new Map(request.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const seenIds = new Set<string>();
  const assessments = brief.candidateAssessments.map((rawAssessment, index): CandidateEditorialAssessment => {
    const assessment = objectValue(rawAssessment, `candidateAssessments[${index}]`);
    const canonicalId = nonEmptyString(assessment.canonicalId, `candidateAssessments[${index}].canonicalId`);
    const inputCandidate = inputById.get(canonicalId);
    if (!inputCandidate) {
      throw new EditorialBriefValidationError(`Unknown candidate id: ${canonicalId}`);
    }
    if (seenIds.has(canonicalId)) {
      throw new EditorialBriefValidationError(`Duplicate candidate assessment: ${canonicalId}`);
    }
    seenIds.add(canonicalId);

    if (typeof assessment.paidValueScore !== 'number'
      || !Number.isFinite(assessment.paidValueScore)
      || assessment.paidValueScore < 0
      || assessment.paidValueScore > 100) {
      throw new EditorialBriefValidationError(`Invalid paidValueScore for ${canonicalId}`);
    }
    if (assessment.inclusion !== 'essential'
      && assessment.inclusion !== 'supporting'
      && assessment.inclusion !== 'reject') {
      throw new EditorialBriefValidationError(`Invalid inclusion for ${canonicalId}`);
    }

    const recommendedRole = assessment.recommendedRole === null
      ? null
      : narrativeRole(assessment.recommendedRole, `recommendedRole for ${canonicalId}`);
    if (assessment.inclusion === 'reject' && recommendedRole !== null) {
      throw new EditorialBriefValidationError(`Rejected candidate ${canonicalId} cannot have a role`);
    }
    if (recommendedRole !== null && !arc.includes(recommendedRole)) {
      throw new EditorialBriefValidationError(`Role for ${canonicalId} is not part of the arc`);
    }

    if (!Array.isArray(assessment.evidenceIds) || assessment.evidenceIds.length === 0) {
      throw new EditorialBriefValidationError(`evidenceIds for ${canonicalId} must be a non-empty array`);
    }
    const allowedEvidenceIds = new Set(inputCandidate.facts.map((fact) => fact.id));
    const evidenceIds = assessment.evidenceIds.map((evidenceId) => {
      if (typeof evidenceId !== 'string' || !allowedEvidenceIds.has(evidenceId)) {
        throw new EditorialBriefValidationError(`Invalid evidence id for ${canonicalId}: ${String(evidenceId)}`);
      }
      return evidenceId;
    });
    if (new Set(evidenceIds).size !== evidenceIds.length) {
      throw new EditorialBriefValidationError(`Duplicate evidence id for ${canonicalId}`);
    }

    return {
      canonicalId,
      paidValueScore: assessment.paidValueScore,
      inclusion: assessment.inclusion,
      recommendedRole,
      uniqueContribution: nonEmptyString(assessment.uniqueContribution, `uniqueContribution for ${canonicalId}`),
      reason: nonEmptyString(assessment.reason, `reason for ${canonicalId}`),
      evidenceIds,
    };
  });

  if (seenIds.size !== inputById.size) {
    throw new EditorialBriefValidationError('Every candidate must be assessed exactly once');
  }
  const essentialCount = assessments.filter((assessment) => assessment.inclusion === 'essential').length;
  if (essentialCount > maxStops) {
    throw new EditorialBriefValidationError(`Curator selected ${essentialCount} essentials, but at most ${maxStops} stops fit`);
  }
  if (request.requestedDuration >= 90 && essentialCount < 4) {
    throw new EditorialBriefValidationError('Tours of 90 minutes or more require at least four real essentials');
  }

  for (const role of arc) {
    const hasCandidate = assessments.some((assessment) => (
      assessment.inclusion !== 'reject' && assessment.recommendedRole === role
    ));
    if (!hasCandidate) {
      throw new EditorialBriefValidationError(`Arc role ${role} has no non-rejected candidate`);
    }
  }

  return {
    schemaVersion: ROUTE_EDITORIAL_SCHEMA_VERSION,
    promise,
    centralQuestion,
    arc,
    candidateAssessments: assessments,
  };
}

export async function requestEditorialRouteBrief(
  request: EditorialRouteBriefRequest,
  options: RequestEditorialRouteBriefOptions = {}
): Promise<EditorialRouteBriefArtifact> {
  const post = options.post ?? ((url: string, body: EditorialRouteBriefRequest) => axios.post(url, body, {
    timeout: 180000,
  }));
  const serviceUrl = options.llmServiceUrl ?? process.env.LLM_SERVICE_URL ?? 'http://localhost:3002';
  let response: { data: unknown };
  try {
    response = await post(`${serviceUrl}/editorial/route-brief`, request);
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const serviceError = (error.response?.data as { error?: unknown } | undefined)?.error;
      throw new Error(`Editorial curator failed: ${
        typeof serviceError === 'string' ? serviceError : error.message
      }`);
    }
    throw error;
  }
  const envelope = objectValue(response.data, 'route brief service response');
  const provenance = objectValue(envelope.provenance, 'provenance');
  const model = nonEmptyString(provenance.model, 'provenance.model');
  const promptFingerprint = nonEmptyString(provenance.promptFingerprint, 'provenance.promptFingerprint');
  if (model !== ROUTE_EDITORIAL_MODEL) {
    throw new EditorialBriefValidationError(`Unexpected editorial model: ${model}`);
  }

  return {
    schemaVersion: ROUTE_EDITORIAL_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    model,
    promptFingerprint,
    input: request,
    response: validateTourEditorialBrief(envelope.brief, request),
  };
}
