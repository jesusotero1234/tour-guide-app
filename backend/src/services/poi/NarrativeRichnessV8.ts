import {
  NarrativeDossierV6,
  NarrativeSufficiencyRoleV6,
} from './NarrativeDossierV6';
import { NarrativeNarrationTargetV8 } from './NarrativeDurationTargetsV8';

export type NarrativeRichnessFacetV8 =
  | 'visual'
  | 'spatial'
  | 'chronology'
  | 'human'
  | 'contrast'
  | 'distinctive';

export type NarrativeEvidenceCardPriorityV8 = 'high' | 'medium';

export interface NarrativeEvidenceCardV8 {
  cardId: string;
  propositionId: string;
  claim: string;
  role: NarrativeSufficiencyRoleV6;
  sourceIds: string[];
  passageIds: string[];
  publisherKeys: string[];
  facets: NarrativeRichnessFacetV8[];
  visual: boolean;
  spatial: boolean;
  priority: NarrativeEvidenceCardPriorityV8;
}

export interface NarrativeRichnessProfileV8 {
  cards: NarrativeEvidenceCardV8[];
  supportedCardCount: number;
  highPriorityCardCount: number;
  distinctPassageCount: number;
  distinctPublisherCount: number;
  facetCount: number;
  visualCardCount: number;
  spatialCardCount: number;
  duplicateCardCount: number;
  maximumSupportedSeconds: number;
  groundingReady: boolean;
  writerReady: boolean;
  richnessReady: boolean;
  reasons: string[];
}

interface RichnessThresholdV8 {
  seconds: number;
  cards: number;
  passages: number;
  facets: number;
  visual: number;
}

const RICHNESS_THRESHOLDS_V8: RichnessThresholdV8[] = [
  { seconds: 300, cards: 10, passages: 8, facets: 5, visual: 2 },
  { seconds: 240, cards: 8, passages: 6, facets: 4, visual: 1 },
  { seconds: 180, cards: 6, passages: 4, facets: 3, visual: 1 },
];

function facetsForRoleV8(role: NarrativeSufficiencyRoleV6): NarrativeRichnessFacetV8[] {
  switch (role) {
    case 'visible_observation':
      return ['visual', 'spatial'];
    case 'chronology_or_transformation':
      return ['chronology'];
    case 'human_agency_or_lived_function':
      return ['human'];
    case 'tension_or_contrast':
      return ['contrast'];
    case 'distinctive_trait':
      return ['distinctive'];
  }
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function normalizedClaimV8(value: string): string {
  return value
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, ' ')
    .replace(/\s+/gu, ' ')
    .trim();
}

export function buildNarrativeEvidenceCardsV8(
  dossier: NarrativeDossierV6
): NarrativeEvidenceCardV8[] {
  const publisherBySourceId = new Map(
    dossier.sources.map((source) => [source.sourceId, source.authority.publisherKey])
  );

  return dossier.propositions.map((proposition) => {
    const facets = facetsForRoleV8(proposition.role);
    return {
      cardId: `card-${proposition.propositionId}`,
      propositionId: proposition.propositionId,
      claim: proposition.text,
      role: proposition.role,
      sourceIds: [...proposition.sourceIds],
      passageIds: [...proposition.passageIds],
      publisherKeys: unique(
        proposition.sourceIds
          .map((sourceId) => publisherBySourceId.get(sourceId))
          .filter((publisherKey): publisherKey is string => publisherKey !== undefined)
      ),
      facets,
      visual: facets.includes('visual'),
      spatial: facets.includes('spatial'),
      priority: proposition.certainty === 'high' && proposition.interpretation === 'direct'
        ? 'high'
        : 'medium',
    };
  });
}

function applicableThresholdV8(targetSeconds: number): RichnessThresholdV8 | null {
  return RICHNESS_THRESHOLDS_V8
    .find((threshold) => targetSeconds >= threshold.seconds) ?? null;
}

export function evaluateNarrativeRichnessV8(
  dossier: NarrativeDossierV6,
  target: NarrativeNarrationTargetV8,
  options: { writerReady?: boolean } = {}
): NarrativeRichnessProfileV8 {
  const cards = buildNarrativeEvidenceCardsV8(dossier);
  const knownSourceIds = new Set(dossier.sources.map((source) => source.sourceId));
  const knownPassageIds = new Set(dossier.passages.map((passage) => passage.passageId));
  const seenClaims = new Set<string>();
  const supportedCards: NarrativeEvidenceCardV8[] = [];
  let duplicateCardCount = 0;
  let groundingReady = true;

  for (const card of cards) {
    const grounded = card.sourceIds.length > 0
      && card.passageIds.length > 0
      && card.sourceIds.every((sourceId) => knownSourceIds.has(sourceId))
      && card.passageIds.every((passageId) => knownPassageIds.has(passageId));
    if (!grounded) groundingReady = false;

    const normalizedClaim = normalizedClaimV8(card.claim);
    const duplicate = normalizedClaim.length === 0 || seenClaims.has(normalizedClaim);
    if (duplicate) {
      duplicateCardCount += 1;
    } else {
      seenClaims.add(normalizedClaim);
      if (grounded) supportedCards.push(card);
    }
  }

  const distinctPassageIds = new Set(
    supportedCards.flatMap((card) => card.passageIds)
  );
  const distinctPublisherKeys = new Set(
    supportedCards.flatMap((card) => card.publisherKeys)
  );
  const facets = new Set(
    supportedCards.flatMap((card) => card.facets)
  );
  const visualCardCount = supportedCards.filter((card) => card.visual).length;
  const spatialCardCount = supportedCards.filter((card) => card.spatial).length;
  const highPriorityCardCount = supportedCards.filter((card) => card.priority === 'high').length;

  let maximumSupportedSeconds = groundingReady ? 120 : 0;
  for (const threshold of RICHNESS_THRESHOLDS_V8) {
    if (
      supportedCards.length >= threshold.cards
      && distinctPassageIds.size >= threshold.passages
      && facets.size >= threshold.facets
      && visualCardCount >= threshold.visual
    ) {
      maximumSupportedSeconds = threshold.seconds;
      break;
    }
  }

  const writerReady = options.writerReady ?? dossier.sufficiency.isSufficient;
  const richnessReady = groundingReady
    && writerReady
    && maximumSupportedSeconds >= target.targetSeconds;
  const reasons: string[] = [];
  const targetThreshold = applicableThresholdV8(target.targetSeconds);

  if (!groundingReady) reasons.push('invalid_grounding');
  if (!writerReady) reasons.push('dossier_not_writer_ready');
  if (targetThreshold) {
    if (supportedCards.length < targetThreshold.cards) reasons.push('insufficient_supported_cards');
    if (distinctPassageIds.size < targetThreshold.passages) reasons.push('insufficient_passage_diversity');
    if (facets.size < targetThreshold.facets) reasons.push('insufficient_facet_diversity');
    if (visualCardCount < targetThreshold.visual) reasons.push('insufficient_visual_cards');
  }
  if (maximumSupportedSeconds < target.targetSeconds) reasons.push('below_target_seconds');

  return {
    cards,
    supportedCardCount: supportedCards.length,
    highPriorityCardCount,
    distinctPassageCount: distinctPassageIds.size,
    distinctPublisherCount: distinctPublisherKeys.size,
    facetCount: facets.size,
    visualCardCount,
    spatialCardCount,
    duplicateCardCount,
    maximumSupportedSeconds,
    groundingReady,
    writerReady,
    richnessReady,
    reasons,
  };
}
