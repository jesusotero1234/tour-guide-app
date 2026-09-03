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
