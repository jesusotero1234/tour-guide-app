import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeNarrationTargetV8 } from './NarrativeDurationTargetsV8';
import {
  NarrativeEvidenceCardV8,
  NarrativeRichnessFacetV8,
  buildNarrativeEvidenceCardsV8,
} from './NarrativeRichnessV8';

export const NARRATIVE_BEAT_ORDER_V8 = [
  'arrival_and_orientation',
  'visible_anchor',
  'time_shift',
  'human_scene_or_use',
  'contrast_or_consequence',
  'takeaway_and_transition',
] as const;

export type NarrativeBeatV8 = typeof NARRATIVE_BEAT_ORDER_V8[number];
export type NarrativeOpeningModeV8 = 'gaze' | 'movement' | 'contrast';

export interface NarrativeBeatPlanItemV8 {
  beat: NarrativeBeatV8;
  evidenceCardIds: string[];
}

export interface NarrativeWriterPlanV8 {
  version: 'segments_v8';
  routeStopId: string;
  openingMode: NarrativeOpeningModeV8;
  narrationTarget: NarrativeNarrationTargetV8;
  evidenceCards: NarrativeEvidenceCardV8[];
  beats: NarrativeBeatPlanItemV8[];
  highPriorityCardIds: string[];
  minimumHighPriorityCoverage: 0.7;
}

export interface BuildNarrativeWriterPlanInputV8 {
  routeStopId: string;
  dossier: NarrativeDossierV6;
  narrationTarget: NarrativeNarrationTargetV8;
  stopIndex: number;
}

const OPENING_MODES_V8: NarrativeOpeningModeV8[] = [
  'gaze',
  'movement',
  'contrast',
];

function normalizedClaimV8(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

function uniqueCardsV8(cards: NarrativeEvidenceCardV8[]): NarrativeEvidenceCardV8[] {
  const claims = new Set<string>();
  return cards.filter((card) => {
    const claim = normalizedClaimV8(card.claim);
    if (claim.length === 0 || claims.has(claim)) return false;
    claims.add(claim);
    return true;
  });
}

function cardsWithFacetV8(
  cards: NarrativeEvidenceCardV8[],
  facet: NarrativeRichnessFacetV8
): string[] {
  return cards
    .filter((card) => card.facets.includes(facet))
    .map((card) => card.cardId);
}

function beatCardsV8(
  beat: NarrativeBeatV8,
  cards: NarrativeEvidenceCardV8[]
): string[] {
  switch (beat) {
    case 'arrival_and_orientation':
    case 'visible_anchor':
      return cardsWithFacetV8(cards, 'visual');
    case 'time_shift':
      return cardsWithFacetV8(cards, 'chronology');
    case 'human_scene_or_use':
      return cardsWithFacetV8(cards, 'human');
    case 'contrast_or_consequence':
      return cardsWithFacetV8(cards, 'contrast');
    case 'takeaway_and_transition':
      return cardsWithFacetV8(cards, 'distinctive');
  }
}

export interface NarrativeWriterSegmentV8 {
  segmentId: string;
  beat: NarrativeBeatV8;
  text: string;
  supportCardIds: string[];
  estimatedWords: number;
}

export interface NarrativeStructuredWriterResultV8 {
  text: string;
  segments: NarrativeWriterSegmentV8[];
  coverage: number;
  wordCount: number;
}

export function narrativeWriterResponseSchemaV8(
  plan: NarrativeWriterPlanV8
): Record<string, unknown> {
  const beatEnum = plan.beats.map((item) => item.beat);
  const cardEnum = plan.evidenceCards.map((card) => card.cardId);

  return {
    type: 'object',
    additionalProperties: false,
    required: ['stop_id', 'segments'],
    properties: {
      stop_id: {
        type: 'string',
        const: plan.routeStopId,
      },
      segments: {
        type: 'array',
        minItems: plan.beats.length,
        maxItems: plan.beats.length,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['segmentId', 'beat', 'text', 'supportCardIds', 'estimatedWords'],
          properties: {
            segmentId: {
              type: 'string',
              minLength: 1,
            },
            beat: {
              type: 'string',
              enum: beatEnum,
            },
            text: {
              type: 'string',
              minLength: 1,
            },
            supportCardIds: {
              type: 'array',
              minItems: 1,
              uniqueItems: true,
              items: {
                type: 'string',
                enum: cardEnum,
              },
            },
            estimatedWords: {
              type: 'integer',
              minimum: 1,
            },
          },
        },
      },
    },
  };
}

export function parseNarrativeWriterResponseV8(
  plan: NarrativeWriterPlanV8,
  value: unknown
): NarrativeStructuredWriterResultV8 {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('Narrative writer response must be an object.');
  }

  const record = value as Record<string, unknown>;
  if (record.stop_id !== plan.routeStopId) {
    throw new Error('Narrative writer response stop_id does not match plan.');
  }

  const segments = record.segments;
  if (!Array.isArray(segments)) {
    throw new Error('Narrative writer response segments must be an array.');
  }
  if (segments.length !== plan.beats.length) {
    throw new Error('Narrative writer response must contain one segment per planned beat.');
  }

  const seenSegmentIds = new Set<string>();
  const usedHighPriorityCardIds = new Set<string>();
  const parsedSegments: NarrativeWriterSegmentV8[] = [];
  const normalizedTexts: string[] = [];

  for (let index = 0; index < segments.length; index += 1) {
    const rawSegment = segments[index];
    if (typeof rawSegment !== 'object' || rawSegment === null || Array.isArray(rawSegment)) {
      throw new Error('Each narrative segment must be an object.');
    }

    const segment = rawSegment as Record<string, unknown>;
    const segmentId = segment.segmentId;
    const beat = segment.beat;
    const text = segment.text;
    const supportCardIds = segment.supportCardIds;
    const estimatedWords = segment.estimatedWords;

    if (typeof segmentId !== 'string' || segmentId.length === 0) {
      throw new Error('Segment segmentId must be a non-empty string.');
    }
    if (seenSegmentIds.has(segmentId)) {
      throw new Error('Segment segmentId must be unique.');
    }
    seenSegmentIds.add(segmentId);

    if (typeof beat !== 'string' || beat !== plan.beats[index].beat) {
      throw new Error('Segment beat must match the planned beat order.');
    }

    if (typeof text !== 'string' || text.trim().length === 0) {
      throw new Error('Segment text must be a non-empty string.');
    }

    if (typeof estimatedWords !== 'number' || !Number.isInteger(estimatedWords) || estimatedWords < 1) {
      throw new Error('Segment estimatedWords must be a positive integer.');
    }

    if (!Array.isArray(supportCardIds) || supportCardIds.length === 0) {
      throw new Error('Segment supportCardIds must be a non-empty array.');
    }

    const seenCardIds = new Set<string>();
    const authorizedCardIds = new Set(plan.beats[index].evidenceCardIds);
    for (const cardId of supportCardIds) {
      if (typeof cardId !== 'string' || cardId.length === 0) {
        throw new Error('Support card ids must be non-empty strings.');
      }
      if (seenCardIds.has(cardId)) {
        throw new Error('Support card ids must be unique within a segment.');
      }
      seenCardIds.add(cardId);
      if (!authorizedCardIds.has(cardId)) {
        throw new Error(`Support card id ${cardId} is not authorized for beat ${beat}.`);
      }
      if (plan.highPriorityCardIds.includes(cardId)) {
        usedHighPriorityCardIds.add(cardId);
      }
    }

    const normalizedText = text.replace(/\s+/gu, ' ').trim();
    normalizedTexts.push(normalizedText);
    parsedSegments.push({
      segmentId,
      beat,
      text,
      supportCardIds: [...supportCardIds],
      estimatedWords,
    });
  }

  const totalHighPriority = plan.highPriorityCardIds.length;
  const coverage = totalHighPriority === 0 ? 1 : usedHighPriorityCardIds.size / totalHighPriority;
  if (coverage < plan.minimumHighPriorityCoverage) {
    throw new Error('Narrative writer response coverage is below the required minimum.');
  }

  const text = normalizedTexts.join(' ');
  const wordCount = text.length === 0 ? 0 : text.split(/\s+/u).length;

  return {
    text,
    segments: parsedSegments,
    coverage,
    wordCount,
  };
}

export function buildNarrativeWriterPlanV8(
  input: BuildNarrativeWriterPlanInputV8
): NarrativeWriterPlanV8 {
  const evidenceCards = uniqueCardsV8(
    buildNarrativeEvidenceCardsV8(input.dossier)
  );
  const beats = NARRATIVE_BEAT_ORDER_V8
    .map((beat): NarrativeBeatPlanItemV8 => ({
      beat,
      evidenceCardIds: beatCardsV8(beat, evidenceCards),
    }))
    .filter((beat) => beat.evidenceCardIds.length > 0);
  const normalizedStopIndex = Number.isFinite(input.stopIndex)
    ? Math.max(0, Math.floor(input.stopIndex))
    : 0;

  return {
    version: 'segments_v8',
    routeStopId: input.routeStopId,
    openingMode: OPENING_MODES_V8[normalizedStopIndex % OPENING_MODES_V8.length],
    narrationTarget: input.narrationTarget,
    evidenceCards,
    beats,
    highPriorityCardIds: evidenceCards
      .filter((card) => card.priority === 'high')
      .map((card) => card.cardId),
    minimumHighPriorityCoverage: 0.7,
  };
}
