export type TourQualityStatus = 'verified' | 'unverified' | 'shadow_evaluated' | 'auto_approved' | 'auto_repaired';

export type TourConfidenceStage = 'input' | 'output';

export type TourConfidenceSignalValue = number | string | boolean | null;

export interface TourConfidence {
  passed: boolean;
  stage: TourConfidenceStage;
  score: number;
  reasons: string[];
  signals?: Record<string, TourConfidenceSignalValue>;
}

export type TourQualityRepairStrategy = 'category_diversity_recompose';

export interface TourQualityRepairMetadata {
  attempted: boolean;
  applied: boolean;
  strategy?: TourQualityRepairStrategy;
  beforeScore: number;
  afterScore: number;
  beforeReasons: string[];
  afterReasons: string[];
}

export interface TourHistoryPreflightMetadata {
  decision: 'generate' | 'recommend_shorter_duration' | 'needs_review' | 'block';
  tier: 'strong_history_city' | 'solid_history_city' | 'compact_history_city' | 'weak_history_city' | 'insufficient_data';
  reasons: string[];
  requestedDurationMinutes: number;
  recommendedDurationMinutes: number;
  protectedAnchorCount: number;
  strongHistoryPlaceCount: number;
  secondaryPlaceShare: number;
  topAnchors: Array<{
    name: string;
    wikidataId: string | null;
    score: number;
    fameScore: number | null;
    category: string | null;
  }>;
}

export interface TourMetadata {
  qualityStatus?: TourQualityStatus;
  confidence?: TourConfidence;
  repair?: TourQualityRepairMetadata;
  historyPreflight?: TourHistoryPreflightMetadata;
  itineraryKey?: string;
  conceptSlug?: string;
  routeType?: string;
  localizedFromTourId?: string;
  localizedFromLanguage?: string;
  generationMode?: 'full' | 'exact-reuse' | 'cross-language-localization' | 'audio-repair' | 'from-concept' | 'duration-recommendation-draft';
  requestedDurationMinutes?: number;
  recommendedDurationMinutes?: number;
  durationAdapted?: boolean;
}
