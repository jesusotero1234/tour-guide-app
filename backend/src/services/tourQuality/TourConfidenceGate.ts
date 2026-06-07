import { TourConfidence, TourConfidenceSignalValue, TourConfidenceStage } from '../../types/tourQuality';

export type TourConfidenceGateMode = 'off' | 'shadow' | 'enforce';

export interface TourConfidenceInputSignals {
  rawPoolSize: number;
  wikidataTaggedCount: number;
  sitelinksResolvedRatio: number;
  maxSitelinks: number;
}

export interface TourConfidenceOutputSignals {
  shortlistSize: number;
  routeDuplicateWikidataCount: number;
  routeMaxCategoryShare: number;
  routeFlagshipCount: number;
  degraded: boolean;
  coverageRatio: number;
  stopCount: number;
}

export interface ComputeTourConfidenceInput {
  input: TourConfidenceInputSignals;
  output: TourConfidenceOutputSignals;
}

const INPUT_THRESHOLDS = {
  rawPoolSizeMin: 30,
  wikidataTaggedCountMin: 10,
  sitelinksResolvedRatioMin: 0.65,
  maxSitelinksMin: 5,
} as const;

const OUTPUT_THRESHOLDS = {
  shortlistSizeMin: 5,
  routeDuplicateWikidataCountMax: 0,
  routeMaxCategoryShareMax: 0.7,
  routeFlagshipCountMin: 1,
  coverageRatioMin: 0.7,
  coverageRatioMax: 1.2,
} as const;

function clampScore(score: number): number {
  return Number(Math.max(0, Math.min(1, score)).toFixed(2));
}

function buildSignals(
  input: TourConfidenceInputSignals,
  output: TourConfidenceOutputSignals,
): Record<string, TourConfidenceSignalValue> {
  return {
    rawPoolSize: input.rawPoolSize,
    wikidataTaggedCount: input.wikidataTaggedCount,
    sitelinksResolvedRatio: Number(input.sitelinksResolvedRatio.toFixed(3)),
    maxSitelinks: input.maxSitelinks,
    shortlistSize: output.shortlistSize,
    routeDuplicateWikidataCount: output.routeDuplicateWikidataCount,
    routeMaxCategoryShare: Number(output.routeMaxCategoryShare.toFixed(3)),
    routeFlagshipCount: output.routeFlagshipCount,
    degraded: output.degraded,
    coverageRatio: Number(output.coverageRatio.toFixed(3)),
    stopCount: output.stopCount,
  };
}

function evaluateInputStage(signals: TourConfidenceInputSignals): { reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 1;

  if (signals.rawPoolSize < INPUT_THRESHOLDS.rawPoolSizeMin) {
    reasons.push('insufficient_raw_pool');
    score -= 0.35;
  }

  if (signals.wikidataTaggedCount < INPUT_THRESHOLDS.wikidataTaggedCountMin) {
    reasons.push('low_wikidata_coverage');
    score -= 0.2;
  }

  if (signals.sitelinksResolvedRatio < INPUT_THRESHOLDS.sitelinksResolvedRatioMin) {
    reasons.push('low_wikidata_coverage');
    score -= 0.2;
  }

  if (signals.maxSitelinks < INPUT_THRESHOLDS.maxSitelinksMin) {
    reasons.push('weak_absolute_landmark_signal');
    score -= 0.25;
  }

  return {
    reasons: [...new Set(reasons)],
    score: clampScore(score),
  };
}

function evaluateOutputStage(signals: TourConfidenceOutputSignals): { reasons: string[]; score: number } {
  const reasons: string[] = [];
  let score = 1;

  if (signals.shortlistSize < OUTPUT_THRESHOLDS.shortlistSizeMin) {
    reasons.push('insufficient_raw_pool');
    score -= 0.25;
  }

  if (signals.routeDuplicateWikidataCount > OUTPUT_THRESHOLDS.routeDuplicateWikidataCountMax) {
    reasons.push('duplicate_landmarks');
    score -= 0.3;
  }

  if (signals.routeMaxCategoryShare > OUTPUT_THRESHOLDS.routeMaxCategoryShareMax) {
    reasons.push('category_collapse');
    score -= 0.25;
  }

  if (signals.routeFlagshipCount < OUTPUT_THRESHOLDS.routeFlagshipCountMin) {
    reasons.push('no_strong_flagships');
    score -= 0.2;
  }

  if (signals.degraded) {
    reasons.push('route_degraded');
    score -= 0.3;
  }

  if (signals.coverageRatio < OUTPUT_THRESHOLDS.coverageRatioMin) {
    reasons.push('coverage_ratio_too_low');
    score -= 0.25;
  }

  if (signals.coverageRatio > OUTPUT_THRESHOLDS.coverageRatioMax) {
    reasons.push('coverage_ratio_too_high');
    score -= 0.15;
  }

  return {
    reasons: [...new Set(reasons)],
    score: clampScore(score),
  };
}

export function computeTourConfidence(input: ComputeTourConfidenceInput): TourConfidence {
  const mergedSignals = buildSignals(input.input, input.output);
  const inputStage = evaluateInputStage(input.input);

  if (inputStage.reasons.length > 0) {
    return {
      passed: false,
      stage: 'input',
      score: inputStage.score,
      reasons: inputStage.reasons,
      signals: mergedSignals,
    };
  }

  const outputStage = evaluateOutputStage(input.output);
  const stage: TourConfidenceStage = 'output';

  return {
    passed: outputStage.reasons.length === 0,
    stage,
    score: outputStage.score,
    reasons: outputStage.reasons,
    signals: mergedSignals,
  };
}

export function getTourConfidenceGateMode(
  configuredMode = process.env.TOUR_CONFIDENCE_GATE_MODE,
  nodeEnv = process.env.NODE_ENV,
): TourConfidenceGateMode {
  if (configuredMode === 'off' || configuredMode === 'shadow' || configuredMode === 'enforce') {
    return configuredMode;
  }

  return nodeEnv === 'test' ? 'off' : 'shadow';
}
