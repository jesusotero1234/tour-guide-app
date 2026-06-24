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

export interface TourMetadata {
  qualityStatus?: TourQualityStatus;
  confidence?: TourConfidence;
  repair?: TourQualityRepairMetadata;
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
