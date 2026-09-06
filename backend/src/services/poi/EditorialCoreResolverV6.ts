import { createHash } from 'crypto';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import { WikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';

export const CORE_AUDIT_SCHEMA_VERSION_V6 = 'core-audit-v1' as const;
export const CANONICAL_TOUR_CORE_SCHEMA_VERSION_V6 = 'canonical-tour-core-v1' as const;
export const CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6 = 18_000;
export const CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6 = 8_000;

export const CORE_RESOLVER_SYSTEM_PROMPT_V6 = `You audit the canonical core of a paid, exterior, first-visit walking tour.
Classify every supplied candidate exactly once as required or optional. Required means that omitting this exact identity would make the stated city, theme, and duration product materially incomplete. Do not enforce a quota, fill time, treat proximity as identity, or invent candidates or evidence. A small city may have only two or three required places. Use only supplied canonicalId and supportId values. Required candidates need one controlled reasonCode, a concrete omissionReason, and candidate-owned support. Optional candidates still need a concise explanation and candidate-owned support. Return only the requested structured result.`;

export type CanonicalCoreReasonCodeV6 =
  | 'city_defining'
  | 'first_visit_expectation'
  | 'unique_historical_chapter';

export interface CoreAuditCandidateV6 {
  canonicalId: string;
  localName: string;
  category: string;
  signals: {
    cityPageLink: boolean;
    wikivoyageSee: boolean | null;
    sitelinks: number;
    pageviewPercentile: number | null;
    heritage: boolean;
  };
  support: Array<{ supportId: string; value: string }>;
}

export interface CoreAuditRequestV6 {
  schemaVersion: 'core-audit-request-v1';
  cityKey: string;
  theme: string;
  durationMinutes: number;
  candidatePermutationSeed: string;
  candidates: CoreAuditCandidateV6[];
}

export interface CoreAuditClassificationV6 {
  canonicalId: string;
  classification: 'required' | 'optional';
  reasonCode: CanonicalCoreReasonCodeV6 | null;
  omissionReason: string;
  supportIds: string[];
}

export interface CoreAuditV6 {
  schemaVersion: typeof CORE_AUDIT_SCHEMA_VERSION_V6;
  classifications: CoreAuditClassificationV6[];
}

export interface CanonicalTourCoreV6 {
  schemaVersion: typeof CANONICAL_TOUR_CORE_SCHEMA_VERSION_V6;
  cityKey: string;
  theme: string;
  durationMinutes: number;
  sourceFingerprint: string;
  status: 'approved';
  requirements: Array<{
    canonicalId: string;
    reasonCode: CanonicalCoreReasonCodeV6;
    omissionReason: string;
    supportIds: string[];
    provenance: 'stable_model_consensus' | 'reviewed_override';
  }>;
  audit: {
    provider: string;
    model: string;
    promptFingerprint: string;
    responseFingerprints: string[];
    candidatePermutationSeeds: string[];
    disputedCanonicalIds: string[];
  };
}

interface CoreAuditRunV6 {
  seed: string;
  request: CoreAuditRequestV6;
  response: CoreAuditV6;
  responseFingerprint: string;
}

interface CoreResolutionConfigV6 {
  context: { cityKey: string; theme: string; durationMinutes: number };
  sourceFingerprint: string;
  provider: string;
  model: string;
  promptFingerprint: string;
  runs: CoreAuditRunV6[];
}

export type CoreBuildResultV6 =
  | { status: 'approved'; core: CanonicalTourCoreV6 }
  | {
    schemaVersion: 'core-build-result-v1';
    status: 'core_review_required';
    reason: 'audit_disagreement' | 'invalid_core_cardinality';
    requiredSets: string[][];
    disputedCanonicalIds: string[];
    audit: CanonicalTourCoreV6['audit'];
  };

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

function inventoryError(expectedIds: string[], receivedIds: string[]): Error {
  const expectedSet = new Set(expectedIds);
  const receivedSet = new Set(receivedIds);
  const counts = new Map<string, number>();
  for (const id of receivedIds) counts.set(id, (counts.get(id) ?? 0) + 1);
  const duplicateIds = [...counts.entries()].filter(([, count]) => count > 1)
    .map(([id, count]) => `${id}(${count})`).sort();
  const missingIds = expectedIds.filter((id) => !receivedSet.has(id)).sort();
  const unexpectedIds = receivedIds.filter((id) => !expectedSet.has(id)).sort();
  return new Error(
    `Core audit must classify every candidate ID exactly once ` +
    `expectedCount=${expectedIds.length} receivedCount=${receivedIds.length} ` +
    `duplicateIds=${duplicateIds.length ? duplicateIds.join(',') : 'none'} ` +
    `missingIds=${missingIds.length ? missingIds.join(',') : 'none'} ` +
    `unexpectedIds=${unexpectedIds.length ? unexpectedIds.join(',') : 'none'}`
  );
}

function nonEmptyString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is invalid`);
  return value.trim();
}

function permuteCandidates(candidates: CoreAuditCandidateV6[], seed: string): CoreAuditCandidateV6[] {
  return [...candidates].sort((left, right) => {
    const leftHash = createHash('sha256').update(`${seed}:${left.canonicalId}`).digest('hex');
    const rightHash = createHash('sha256').update(`${seed}:${right.canonicalId}`).digest('hex');
    return leftHash.localeCompare(rightHash) || left.canonicalId.localeCompare(right.canonicalId);
  });
}

function compactCandidateSupport(
  source: WikimediaProminenceSnapshotV6['candidates'][number]
): CoreAuditCandidateV6['support'] {
  const priority = new Map([
    ['city_wikipedia_link', 0], ['wikivoyage_see_mention', 1],
    ['wikipedia_pageviews', 2], ['wikidata_sitelinks', 3],
    ['heritage_designation', 4], ['historical_evidence', 5],
  ]);
  const ranked = [...source.support].sort((left, right) => (
    (priority.get(left.type) ?? 99) - (priority.get(right.type) ?? 99)
      || left.supportId.localeCompare(right.supportId)
  ));
  const historical = ranked.find((support) => support.type === 'historical_evidence');
  const prominence = ranked.find((support) => support.type !== 'historical_evidence');
  const selected = [prominence, historical].filter((support): support is NonNullable<typeof support> => (
    Boolean(support)
  ));
  if (selected.length < 2) {
    selected.push(...ranked.filter((support) => (
      !selected.some((item) => item.supportId === support.supportId)
    )).slice(0, 2 - selected.length));
  }
  return selected.slice(0, 2).map((support) => ({
    supportId: support.supportId,
    value: support.value.replace(/\s+/g, ' ').trim().slice(0, 80),
  }));
}

export function buildCoreAuditRequestV6(
  context: { cityKey: string; theme: string; durationMinutes: number },
  entities: EditorialEntityCandidateV5[],
  prominence: WikimediaProminenceSnapshotV6,
  candidatePermutationSeed: string
): CoreAuditRequestV6 {
  if (!candidatePermutationSeed.trim()) throw new Error('Core audit permutation seed is required');
  if (prominence.cityKey !== context.cityKey) throw new Error('Prominence city does not match core context');
  const prominenceById = new Map(prominence.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  if (entities.length !== prominence.candidates.length
    || entities.some((entity) => !prominenceById.has(entity.canonicalId))) {
    throw new Error('Prominence candidates do not match the canonical candidate set');
  }
  const candidates = entities.map((entity): CoreAuditCandidateV6 => {
    const source = prominenceById.get(entity.canonicalId) as WikimediaProminenceSnapshotV6['candidates'][number];
    const support = compactCandidateSupport(source);
    if (support.length === 0) throw new Error(`Candidate ${entity.canonicalId} has no prominence support`);
    return {
      canonicalId: entity.canonicalId,
      localName: entity.localName.replace(/\s+/g, ' ').trim().slice(0, 100),
      category: entity.category,
      signals: {
        cityPageLink: source.cityWikipediaLinked,
        wikivoyageSee: source.wikivoyageSeeMentioned,
        sitelinks: source.sitelinks,
        pageviewPercentile: source.pageviewPercentile,
        heritage: source.heritageDesignation,
      },
      support,
    };
  });
  const request: CoreAuditRequestV6 = {
    schemaVersion: 'core-audit-request-v1',
    ...context,
    candidatePermutationSeed,
    candidates: permuteCandidates(candidates, candidatePermutationSeed),
  };
  const length = JSON.stringify(request).length;
  if (length > CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6) {
    throw new Error(`Core audit input exceeds ${CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6} characters (${length})`);
  }
  return request;
}

export function validateCoreAuditV6(value: unknown, request: CoreAuditRequestV6): CoreAuditV6 {
  const root = objectValue(value, 'core audit');
  exactKeys(root, ['schemaVersion', 'classifications'], 'core audit');
  if (root.schemaVersion !== CORE_AUDIT_SCHEMA_VERSION_V6) {
    throw new Error('Invalid core audit schemaVersion');
  }
  if (!Array.isArray(root.classifications)) throw new Error('core audit classifications must be an array');
  const requestIds = request.candidates.map((candidate) => candidate.canonicalId);
  const rawIds = root.classifications.map((item, index) => (
    objectValue(item, `classifications[${index}]`).canonicalId
  ));
  if (rawIds.some((id) => typeof id !== 'string')
    || new Set(rawIds as string[]).size !== requestIds.length
    || rawIds.length !== requestIds.length
    || [...rawIds as string[]].sort().join(',') !== [...requestIds].sort().join(',')) {
    throw inventoryError(requestIds, rawIds as string[]);
  }
  const candidateById = new Map(request.candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const classifications = root.classifications.map((item, index): CoreAuditClassificationV6 => {
    const raw = objectValue(item, `classifications[${index}]`);
    exactKeys(raw, [
      'canonicalId', 'classification', 'reasonCode', 'omissionReason', 'supportIds',
    ], `classifications[${index}]`);
    const canonicalId = raw.canonicalId as string;
    const candidate = candidateById.get(canonicalId) as CoreAuditCandidateV6;
    if (raw.classification !== 'required' && raw.classification !== 'optional') {
      throw new Error(`classifications[${index}].classification is invalid`);
    }
    const classification = raw.classification;
    const allowedReasons: CanonicalCoreReasonCodeV6[] = [
      'city_defining', 'first_visit_expectation', 'unique_historical_chapter',
    ];
    if (classification === 'required' && !allowedReasons.includes(raw.reasonCode as CanonicalCoreReasonCodeV6)) {
      throw new Error(`classifications[${index}].reasonCode is invalid`);
    }
    if (classification === 'optional' && raw.reasonCode !== null) {
      throw new Error(`classifications[${index}].reasonCode must be null for optional candidates`);
    }
    if (!Array.isArray(raw.supportIds) || raw.supportIds.length < 1 || raw.supportIds.length > 4
      || raw.supportIds.some((supportId) => typeof supportId !== 'string')
      || new Set(raw.supportIds as string[]).size !== raw.supportIds.length) {
      throw new Error(`classifications[${index}].supportIds is invalid`);
    }
    const ownedSupportIds = new Set(candidate.support.map((support) => support.supportId));
    if ((raw.supportIds as string[]).some((supportId) => !ownedSupportIds.has(supportId))) {
      throw new Error(`classifications[${index}] must cite only candidate-owned support IDs`);
    }
    const omissionReason = nonEmptyString(
      raw.omissionReason, `classifications[${index}].omissionReason`
    );
    if (omissionReason.length > 320) {
      throw new Error(`classifications[${index}].omissionReason exceeds 320 characters`);
    }
    return {
      canonicalId,
      classification,
      reasonCode: classification === 'required'
        ? raw.reasonCode as CanonicalCoreReasonCodeV6
        : null,
      omissionReason,
      supportIds: raw.supportIds as string[],
    };
  });
  return { schemaVersion: CORE_AUDIT_SCHEMA_VERSION_V6, classifications };
}

export function coreAuditResponseSchemaV6(request: CoreAuditRequestV6): Record<string, unknown> {
  const candidateIds = request.candidates.map((candidate) => candidate.canonicalId).sort();
  const supportIds = request.candidates.flatMap((candidate) => (
    candidate.support.map((support) => support.supportId)
  )).sort();
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'classifications'],
    properties: {
      schemaVersion: { type: 'string', enum: [CORE_AUDIT_SCHEMA_VERSION_V6] },
      classifications: {
        type: 'array', minItems: candidateIds.length, maxItems: candidateIds.length,
        items: {
          type: 'object', additionalProperties: false,
          required: ['canonicalId', 'classification', 'reasonCode', 'omissionReason', 'supportIds'],
          properties: {
            canonicalId: { type: 'string', enum: candidateIds },
            classification: { type: 'string', enum: ['required', 'optional'] },
            reasonCode: {
              enum: [null, 'city_defining', 'first_visit_expectation', 'unique_historical_chapter'],
            },
            omissionReason: { type: 'string', minLength: 1, maxLength: 320 },
            supportIds: {
              type: 'array', minItems: 1, maxItems: 4, uniqueItems: true,
              items: { type: 'string', enum: supportIds },
            },
          },
        },
      },
    },
  };
  const length = JSON.stringify(schema).length;
  if (length > CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6) {
    throw new Error(`Core audit schema exceeds ${CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6} characters (${length})`);
  }
  return schema;
}

export function coreAuditOpenRouterResponseSchemaV6(request: CoreAuditRequestV6): Record<string, unknown> {
  const candidateIds = request.candidates.map((candidate) => candidate.canonicalId).sort();
  const schema = {
    type: 'object',
    additionalProperties: false,
    required: ['schemaVersion', 'classifications'],
    properties: {
      schemaVersion: { type: 'string', enum: [CORE_AUDIT_SCHEMA_VERSION_V6] },
      classifications: {
        type: 'object',
        additionalProperties: false,
        required: candidateIds,
        properties: Object.fromEntries(candidateIds.map((id) => [id, { $ref: '#/$defs/classification' }])),
      },
    },
    $defs: {
      classification: {
        type: 'object',
        additionalProperties: false,
        required: ['classification', 'reasonCode', 'omissionReason', 'supportIds'],
        properties: {
          classification: { type: 'string', enum: ['required', 'optional'] },
          reasonCode: {
            enum: [null, 'city_defining', 'first_visit_expectation', 'unique_historical_chapter'],
          },
          omissionReason: { type: 'string' },
          supportIds: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
    },
  };
  const length = JSON.stringify(schema).length;
  if (length > CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6) {
    throw new Error(`Core audit schema exceeds ${CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6} characters (${length})`);
  }
  return schema;
}

export function validateCoreAuditOpenRouterV6(value: unknown, request: CoreAuditRequestV6): CoreAuditV6 {
  const root = objectValue(value, 'core audit');
  exactKeys(root, ['schemaVersion', 'classifications'], 'core audit');
  if (root.schemaVersion !== CORE_AUDIT_SCHEMA_VERSION_V6) {
    throw new Error('Invalid core audit schemaVersion');
  }
  const classifications = objectValue(root.classifications, 'classifications');
  const expectedIds = request.candidates.map((candidate) => candidate.canonicalId);
  const receivedIds = Object.keys(classifications);
  if (receivedIds.some((id) => !expectedIds.includes(id))
    || new Set(receivedIds).size !== expectedIds.length
    || receivedIds.length !== expectedIds.length) {
    throw inventoryError(expectedIds, receivedIds);
  }
  const normalized = {
    schemaVersion: CORE_AUDIT_SCHEMA_VERSION_V6,
    classifications: request.candidates.map((candidate) => {
      const raw = objectValue(classifications[candidate.canonicalId], `classifications[${candidate.canonicalId}]`);
      exactKeys(raw, ['classification', 'reasonCode', 'omissionReason', 'supportIds'], `classifications[${candidate.canonicalId}]`);
      return {
        canonicalId: candidate.canonicalId,
        classification: raw.classification,
        reasonCode: raw.reasonCode,
        omissionReason: raw.omissionReason,
        supportIds: raw.supportIds,
      };
    }),
  };
  return validateCoreAuditV6(normalized, request);
}

function requiredSet(audit: CoreAuditV6): string[] {
  return audit.classifications.filter((item) => item.classification === 'required')
    .map((item) => item.canonicalId).sort();
}

export function resolveCanonicalTourCoreV6(config: CoreResolutionConfigV6): CoreBuildResultV6 {
  if (config.runs.length !== 3 || new Set(config.runs.map((run) => run.seed)).size !== 3) {
    throw new Error('Canonical core resolution requires exactly three distinct audit permutations');
  }
  for (const run of config.runs) {
    if (run.seed !== run.request.candidatePermutationSeed
      || run.request.cityKey !== config.context.cityKey
      || run.request.theme !== config.context.theme
      || run.request.durationMinutes !== config.context.durationMinutes) {
      throw new Error('Core audit run does not match its frozen context');
    }
    validateCoreAuditV6(run.response, run.request);
  }
  const audit = {
    provider: config.provider,
    model: config.model,
    promptFingerprint: config.promptFingerprint,
    responseFingerprints: config.runs.map((run) => run.responseFingerprint),
    candidatePermutationSeeds: config.runs.map((run) => run.seed),
  };
  const requiredSets = config.runs.map((run) => requiredSet(run.response));
  const union = new Set(requiredSets.flat());
  const intersection = new Set(requiredSets[0].filter((id) => (
    requiredSets.every((set) => set.includes(id))
  )));
  const unanimousRequiredIds = [...intersection].sort();
  const disputedCanonicalIds = [...union].filter((id) => !intersection.has(id)).sort();
  const auditWithDisputes: CanonicalTourCoreV6['audit'] = {
    ...audit,
    disputedCanonicalIds,
  };
  if (unanimousRequiredIds.length < 1 || unanimousRequiredIds.length > 8) {
    return {
      schemaVersion: 'core-build-result-v1', status: 'core_review_required',
      reason: 'invalid_core_cardinality',
      requiredSets, disputedCanonicalIds, audit: auditWithDisputes,
    };
  }
  const firstById = new Map(config.runs[0].response.classifications.map((item) => [item.canonicalId, item]));
  return {
    status: 'approved',
    core: {
      schemaVersion: CANONICAL_TOUR_CORE_SCHEMA_VERSION_V6,
      ...config.context,
      sourceFingerprint: config.sourceFingerprint,
      status: 'approved',
      requirements: unanimousRequiredIds.map((canonicalId) => {
        const classification = firstById.get(canonicalId) as CoreAuditClassificationV6;
        return {
          canonicalId,
          reasonCode: classification.reasonCode as CanonicalCoreReasonCodeV6,
          omissionReason: classification.omissionReason,
          supportIds: [...classification.supportIds],
          provenance: 'stable_model_consensus' as const,
        };
      }),
      audit: auditWithDisputes,
    },
  };
}
