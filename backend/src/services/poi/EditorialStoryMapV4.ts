import { EditorialEntityCandidateV4 } from './EditorialEntityV4';
import {
  EditorialCallResultV4,
  EditorialProviderV4,
  EditorialRequestOptionsV4,
  requestEditorialStructuredV4,
} from './EditorialStructuredLlmV4';

export const EDITORIAL_STORY_MAP_SCHEMA_VERSION = 'editorial-story-map-v4' as const;
export const EDITORIAL_V4_MODEL = 'deepseek-v4-flash' as const;

export const CONTRIBUTION_CODES_V4 = [
  'origins_urban_form', 'royal_state_power', 'civic_government', 'religious_identity',
  'trade_economic_life', 'public_life_ceremony', 'conflict_resistance', 'memory_rights',
  'infrastructure_engineering', 'art_intellectual_life', 'urban_expansion_reform',
  'modern_national_identity', 'multicultural_exchange',
] as const;

export const ERA_BUCKETS_V4 = [
  'ancient', 'medieval', 'early_modern', 'sixteenth_century', 'seventeenth_century',
  'eighteenth_century', 'nineteenth_century',
  'twentieth_century', 'contemporary', 'cross_era',
] as const;

export type ContributionCodeV4 = typeof CONTRIBUTION_CODES_V4[number];
export type EraBucketV4 = typeof ERA_BUCKETS_V4[number];

export interface StoryBeatV4 {
  beatId: string;
  contributionCode: ContributionCodeV4;
  era: EraBucketV4;
  focus: string;
  evidenceRefs: string[];
}

export interface CandidateBeatContributionV4 {
  beatId: string;
  strength: 1 | 2 | 3;
  evidenceRefs: string[];
}

export interface CandidateAssessmentV4 {
  relativePriorityRank: number;
  salienceLevel: number;
  observableStrength: number;
  openingFit: number;
  resolutionFit: number;
  eraBuckets: EraBucketV4[];
  contributions: CandidateBeatContributionV4[];
}

export interface EditorialStoryMapV4 {
  schemaVersion: typeof EDITORIAL_STORY_MAP_SCHEMA_VERSION;
  centralQuestion: string;
  beats: StoryBeatV4[];
  candidates: Record<string, CandidateAssessmentV4>;
}

export interface StoryMapCandidateInputV4 {
  slot: string;
  localName: string;
  category: string;
  fameScore: number;
  facts: Array<{ slot: string; kind: string; value: string }>;
}

export interface StoryMapRequestV4 {
  city: string;
  theme: string;
  language: string;
  requestedDuration: number;
  candidates: StoryMapCandidateInputV4[];
}

export interface StoryMapCandidateMappingV4 {
  slot: string;
  canonicalId: string;
  siteId: string;
  evidenceBySlot: Record<string, string>;
}

const STORY_MAP_SYSTEM_PROMPT = `You are mapping the evidence-backed story of a paid, exterior, first-visit history walking tour.
Create 4 to 7 story ingredients that genuinely exist in the supplied evidence. They are a thematic inventory for a later route optimizer, not a physical stop order. Map every candidate to those beats.
Use only supplied slots and controlled contribution/era values. A beat strength of 2 or 3 means the candidate can carry that beat; 1 is only supporting.
Return every candidate slot exactly once in priorityOrder, from highest to lowest omission cost. Do not use an absolute essential threshold or a quota.
openingFit and resolutionFit are soft route-building signals, not mandatory labels or quotas.
The central question should support a thematic, causal walking story; do not make a complete chronological survey the only coherent ordering.
Every contribution and beat must cite supplied evidence. Inside a candidate assessment, cite only that candidate's local evidence slots such as e01, never another candidate slot.
Do not infer places, routes, geometry, facts or identifiers.`;

function slot(index: number, prefix: 'c' | 'e' | 'b'): string {
  return `${prefix}${String(index + 1).padStart(2, '0')}`;
}

export function buildStoryMapRequestV4(
  entities: EditorialEntityCandidateV4[],
  context: Omit<StoryMapRequestV4, 'candidates'>
): { request: StoryMapRequestV4; mapping: StoryMapCandidateMappingV4[] } {
  if (entities.length === 0 || entities.length > 30) throw new Error('Story map requires 1 to 30 candidates');
  if (entities.some((entity) => !entity.readiness.ready)) throw new Error('Story map refuses evidence-incomplete candidates');
  const candidates = entities.map((entity, candidateIndex) => ({
    slot: slot(candidateIndex, 'c'),
    localName: entity.localName,
    category: entity.category,
    fameScore: entity.fameScore,
    facts: entity.evidenceFacts.map((fact, factIndex) => ({
      slot: slot(factIndex, 'e'), kind: fact.kind,
      value: fact.value.replace(/\s+/g, ' ').trim().slice(0, 280),
    })),
  }));
  return {
    request: { ...context, candidates },
    mapping: entities.map((entity, candidateIndex) => ({
      slot: slot(candidateIndex, 'c'), canonicalId: entity.canonicalId, siteId: entity.siteId,
      evidenceBySlot: Object.fromEntries(entity.evidenceFacts.map((fact, factIndex) => [slot(factIndex, 'e'), fact.id])),
    })),
  };
}

function stringArraySchema(values: readonly string[], minItems = 1, maxItems?: number): Record<string, unknown> {
  return {
    type: 'array', minItems, ...(maxItems === undefined ? {} : { maxItems }), uniqueItems: true,
    items: { type: 'string', enum: values },
  };
}

export function storyMapResponseSchemaV4(request: StoryMapRequestV4): Record<string, unknown> {
  const beatSlots = Array.from({ length: 7 }, (_, index) => slot(index, 'b'));
  const allEvidenceRefs = request.candidates.flatMap((candidate) => (
    candidate.facts.map((fact) => `${candidate.slot}:${fact.slot}`)
  ));
  const candidates = Object.fromEntries(request.candidates.map((candidate) => {
    const candidateEvidence = candidate.facts.map((fact) => fact.slot);
    return [candidate.slot, {
      type: 'object', additionalProperties: false,
      required: ['salienceLevel', 'observableStrength', 'openingFit', 'resolutionFit', 'contributions'],
      properties: {
        salienceLevel: { type: 'integer', minimum: 0, maximum: 4 },
        observableStrength: { type: 'integer', minimum: 0, maximum: 3 },
        openingFit: { type: 'integer', minimum: 0, maximum: 3 },
        resolutionFit: { type: 'integer', minimum: 0, maximum: 3 },
        contributions: {
          type: 'array', maxItems: 7,
          items: {
            type: 'object', additionalProperties: false,
            required: ['beatId', 'strength', 'evidenceRefs'],
            properties: {
              beatId: { type: 'string', enum: beatSlots },
              strength: { type: 'integer', minimum: 1, maximum: 3 },
              evidenceRefs: stringArraySchema(candidateEvidence, 1, 3),
            },
          },
        },
      },
    }];
  }));
  return {
    type: 'object', additionalProperties: false,
    required: ['schemaVersion', 'centralQuestion', 'beats', 'priorityOrder', 'candidates'],
    properties: {
      schemaVersion: { type: 'string', enum: [EDITORIAL_STORY_MAP_SCHEMA_VERSION] },
      centralQuestion: { type: 'string', minLength: 10, maxLength: 600 },
      beats: {
        type: 'array', minItems: 4, maxItems: 7,
        items: {
          type: 'object', additionalProperties: false,
          required: ['beatId', 'contributionCode', 'era', 'focus', 'evidenceRefs'],
          properties: {
            beatId: { type: 'string', enum: beatSlots },
            contributionCode: { type: 'string', enum: CONTRIBUTION_CODES_V4 },
            era: { type: 'string', enum: ERA_BUCKETS_V4 },
            focus: { type: 'string', minLength: 5, maxLength: 400 },
            evidenceRefs: stringArraySchema(allEvidenceRefs, 1, 5),
          },
        },
      },
      priorityOrder: stringArraySchema(request.candidates.map((candidate) => candidate.slot), request.candidates.length, request.candidates.length),
      candidates: {
        type: 'object', additionalProperties: false,
        required: request.candidates.map((candidate) => candidate.slot), properties: candidates,
      },
    },
  };
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function integer(value: unknown, minimum: number, maximum: number, label: string): number {
  if (!Number.isInteger(value) || (value as number) < minimum || (value as number) > maximum) {
    throw new Error(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
  return value as number;
}

function strings(value: unknown, allowed: Set<string>, label: string, minimum = 1): string[] {
  if (!Array.isArray(value) || value.length < minimum || value.some((item) => typeof item !== 'string' || !allowed.has(item))) {
    throw new Error(`${label} contains invalid values`);
  }
  if (new Set(value).size !== value.length) throw new Error(`${label} contains duplicates`);
  return value as string[];
}

function inferCandidateEras(candidate: StoryMapCandidateInputV4): EraBucketV4[] {
  const text = candidate.facts.map((fact) => fact.value).join(' ').toLowerCase();
  const eras = new Set<EraBucketV4>();
  if (/\b(ancient|antigu|roman|romano|romain)\b/.test(text)) eras.add('ancient');
  if (/\b(medieval|middle ages|edad media|moyen âge|mittelalter)\b/.test(text)) eras.add('medieval');
  const years = [...text.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)].map((match) => Number(match[1]));
  for (const year of years) {
    if (year < 1500) eras.add('medieval');
    else if (year < 1800) eras.add('early_modern');
    else if (year < 1900) eras.add('nineteenth_century');
    else if (year < 2000) eras.add('twentieth_century');
    else eras.add('contemporary');
  }
  if (eras.size === 0) eras.add('cross_era');
  return [...eras].slice(0, 3);
}

export function validateStoryMapV4(value: unknown, request: StoryMapRequestV4): EditorialStoryMapV4 {
  const root = objectValue(value, 'story map');
  exactKeys(root, ['schemaVersion', 'centralQuestion', 'beats', 'priorityOrder', 'candidates'], 'story map');
  if (root.schemaVersion !== EDITORIAL_STORY_MAP_SCHEMA_VERSION) throw new Error('Invalid story map schemaVersion');
  if (typeof root.centralQuestion !== 'string' || root.centralQuestion.trim().length < 10 || root.centralQuestion.length > 600) {
    throw new Error('Invalid centralQuestion');
  }
  if (!Array.isArray(root.beats) || root.beats.length < 4 || root.beats.length > 7) throw new Error('Story map requires 4 to 7 beats');
  const candidateEvidence = new Map(request.candidates.map((candidate) => [
    candidate.slot, new Set(candidate.facts.map((fact) => fact.slot)),
  ]));
  const allEvidence = new Set(request.candidates.flatMap((candidate) => (
    candidate.facts.map((fact) => `${candidate.slot}:${fact.slot}`)
  )));
  const beats = root.beats.map((item, index) => {
    const beat = objectValue(item, `beats[${index}]`);
    exactKeys(beat, ['beatId', 'contributionCode', 'era', 'focus', 'evidenceRefs'], `beats[${index}]`);
    const expectedId = slot(index, 'b');
    if (beat.beatId !== expectedId) throw new Error(`beats[${index}].beatId must be ${expectedId}`);
    if (!CONTRIBUTION_CODES_V4.includes(beat.contributionCode as ContributionCodeV4)) throw new Error(`beats[${index}].contributionCode is invalid`);
    if (!ERA_BUCKETS_V4.includes(beat.era as EraBucketV4)) throw new Error(`beats[${index}].era is invalid`);
    if (typeof beat.focus !== 'string' || beat.focus.trim().length < 5 || beat.focus.length > 400) throw new Error(`beats[${index}].focus is invalid`);
    return {
      beatId: expectedId,
      contributionCode: beat.contributionCode as ContributionCodeV4,
      era: beat.era as EraBucketV4,
      focus: beat.focus.trim(),
      evidenceRefs: strings(beat.evidenceRefs, allEvidence, `beats[${index}].evidenceRefs`),
    };
  });
  const rawCandidates = objectValue(root.candidates, 'candidates');
  const candidateSlots = request.candidates.map((candidate) => candidate.slot);
  const priorityOrder = strings(root.priorityOrder, new Set(candidateSlots), 'priorityOrder');
  if (priorityOrder.length !== candidateSlots.length) {
    throw new Error('priorityOrder must contain every candidate exactly once');
  }
  exactKeys(rawCandidates, candidateSlots, 'candidates');
  const beatIds = new Set(beats.map((beat) => beat.beatId));
  const candidates: Record<string, CandidateAssessmentV4> = {};
  for (const candidateSlot of candidateSlots) {
    const raw = objectValue(rawCandidates[candidateSlot], `candidates.${candidateSlot}`);
    exactKeys(raw, ['salienceLevel', 'observableStrength', 'openingFit', 'resolutionFit', 'contributions'], `candidates.${candidateSlot}`);
    if (!Array.isArray(raw.contributions)) throw new Error(`candidates.${candidateSlot}.contributions must be an array`);
    const contributionIds = new Set<string>();
    const contributions = raw.contributions.map((item, index) => {
      const contribution = objectValue(item, `candidates.${candidateSlot}.contributions[${index}]`);
      exactKeys(contribution, ['beatId', 'strength', 'evidenceRefs'], `candidates.${candidateSlot}.contributions[${index}]`);
      if (typeof contribution.beatId !== 'string' || !beatIds.has(contribution.beatId)) throw new Error(`candidates.${candidateSlot} invented beat`);
      if (contributionIds.has(contribution.beatId)) throw new Error(`candidates.${candidateSlot} duplicates a beat`);
      contributionIds.add(contribution.beatId);
      return {
        beatId: contribution.beatId,
        strength: integer(contribution.strength, 1, 3, `candidates.${candidateSlot}.strength`) as 1 | 2 | 3,
        evidenceRefs: strings(
          contribution.evidenceRefs,
          candidateEvidence.get(candidateSlot) as Set<string>,
          `candidates.${candidateSlot}.evidenceRefs`
        ).map((ref) => `${candidateSlot}:${ref}`),
      };
    });
    candidates[candidateSlot] = {
      relativePriorityRank: priorityOrder.indexOf(candidateSlot) + 1,
      salienceLevel: integer(raw.salienceLevel, 0, 4, `candidates.${candidateSlot}.salienceLevel`),
      observableStrength: integer(raw.observableStrength, 0, 3, `candidates.${candidateSlot}.observableStrength`),
      openingFit: integer(raw.openingFit, 0, 3, `candidates.${candidateSlot}.openingFit`),
      resolutionFit: integer(raw.resolutionFit, 0, 3, `candidates.${candidateSlot}.resolutionFit`),
      eraBuckets: inferCandidateEras(request.candidates.find((candidate) => (
        candidate.slot === candidateSlot
      )) as StoryMapCandidateInputV4),
      contributions,
    };
  }
  for (const beat of beats) {
    if (!Object.values(candidates).some((candidate) => candidate.contributions.some((item) => item.beatId === beat.beatId && item.strength >= 2))) {
      throw new Error(`Story beat ${beat.beatId} has no strong carrier`);
    }
  }
  return { schemaVersion: EDITORIAL_STORY_MAP_SCHEMA_VERSION, centralQuestion: root.centralQuestion.trim(), beats, candidates };
}

export function requestStoryMapV4(
  request: StoryMapRequestV4,
  provider: EditorialProviderV4,
  options: EditorialRequestOptionsV4 = {}
): Promise<EditorialCallResultV4<EditorialStoryMapV4>> {
  return requestEditorialStructuredV4({
    input: request, provider, options, systemPrompt: STORY_MAP_SYSTEM_PROMPT,
    schema: storyMapResponseSchemaV4(request), toolName: 'submit_editorial_story_map_v4',
    toolDescription: 'Submit the complete evidence-backed story map and all candidate assessments.',
    validate: (value) => validateStoryMapV4(value, request),
  });
}
