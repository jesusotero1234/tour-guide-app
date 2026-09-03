import {
  NarrativeNarrationTargetV8,
  narrationTargetForSecondsV8,
} from './NarrativeDurationTargetsV8';
import { NarrativeRichnessProfileV8 } from './NarrativeRichnessV8';

export type NarrativeDurationDispositionV8 =
  | 'kept'
  | 'shortened'
  | 'recommend_replace_optional'
  | 'blocked';

export interface NarrativeDurationReconciliationStopV8 {
  stopId: string;
  required: boolean;
  target: NarrativeNarrationTargetV8;
  richness: NarrativeRichnessProfileV8;
}

export interface NarrativeRichnessSummaryV8 {
  supportedCardCount: number;
  highPriorityCardCount: number;
  distinctPassageCount: number;
  distinctPublisherCount: number;
  facetCount: number;
  visualCardCount: number;
  spatialCardCount: number;
  duplicateCardCount: number;
  groundingReady: boolean;
  writerReady: boolean;
  richnessReady: boolean;
}

export interface NarrativeDurationReconciliationEntryV8 {
  stopId: string;
  required: boolean;
  disposition: NarrativeDurationDispositionV8;
  initialTargetSeconds: number;
  finalTarget: NarrativeNarrationTargetV8;
  maximumSupportedSeconds: number;
  richness: NarrativeRichnessSummaryV8;
  reasons: string[];
}

export interface NarrativeDurationReconciliationV8 {
  entries: NarrativeDurationReconciliationEntryV8[];
  targets: NarrativeNarrationTargetV8[];
  unassignedSeconds: number;
}

export function reconcileNarrationTargetsV8(
  stops: NarrativeDurationReconciliationStopV8[]
): NarrativeDurationReconciliationV8 {
  const entries = stops.map((stop): NarrativeDurationReconciliationEntryV8 => {
    const evidenceUsable = stop.richness.groundingReady && (stop.richness.writerReady || stop.richness.richnessReady);
    const maximumSupportedSeconds = evidenceUsable
      ? Math.max(0, stop.richness.maximumSupportedSeconds)
      : 0;
    const finalSeconds = Math.min(stop.target.targetSeconds, maximumSupportedSeconds);
    const finalTarget = narrationTargetForSecondsV8(stop.stopId, finalSeconds);
    const shortened = finalTarget.targetSeconds < stop.target.targetSeconds;
    const reasons = [...new Set(stop.richness.reasons)];

    if (shortened && !reasons.includes('below_target_seconds')) {
      reasons.push('below_target_seconds');
    }

    let disposition: NarrativeDurationDispositionV8;
    if (finalTarget.targetSeconds === 0) {
      disposition = 'blocked';
    } else if (!shortened) {
      disposition = 'kept';
    } else if (!stop.required && finalTarget.targetSeconds <= 120) {
      disposition = 'recommend_replace_optional';
    } else {
      disposition = 'shortened';
    }

    const richness: NarrativeRichnessSummaryV8 = {
      supportedCardCount: stop.richness.supportedCardCount,
      highPriorityCardCount: stop.richness.highPriorityCardCount,
      distinctPassageCount: stop.richness.distinctPassageCount,
      distinctPublisherCount: stop.richness.distinctPublisherCount,
      facetCount: stop.richness.facetCount,
      visualCardCount: stop.richness.visualCardCount,
      spatialCardCount: stop.richness.spatialCardCount,
      duplicateCardCount: stop.richness.duplicateCardCount,
      groundingReady: stop.richness.groundingReady,
      writerReady: stop.richness.writerReady,
      richnessReady: stop.richness.richnessReady,
    };

    return {
      stopId: stop.stopId,
      required: stop.required,
      disposition,
      initialTargetSeconds: stop.target.targetSeconds,
      finalTarget,
      maximumSupportedSeconds,
      richness,
      reasons,
    };
  });

  const initialSeconds = entries.reduce(
    (sum, entry) => sum + entry.initialTargetSeconds,
    0
  );
  const targets = entries.map((entry) => entry.finalTarget);
  const finalSeconds = targets.reduce(
    (sum, target) => sum + target.targetSeconds,
    0
  );

  return {
    entries,
    targets,
    unassignedSeconds: Math.max(0, initialSeconds - finalSeconds),
  };
}
