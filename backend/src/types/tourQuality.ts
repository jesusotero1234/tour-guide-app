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

export interface TourCueManifestEntry {
  kind: 'first' | 'next' | 'finish';
  placeId?: string;
  text: string;
  version: string;
}

export interface TourMetadata {
  catalogTitle?: string;
  /** The player may start anywhere and reorder the stops (plan 03). Requires cueManifest and walkingLegsSha256. */
  orderFlexible?: boolean;
  /** The link clips of the tour, written by the importer so admission never has to query tour_cue_audio. */
  cueManifest?: TourCueManifestEntry[];
  /** sha256 of the row in tour_walking_legs, copied here for the same reason. */
  walkingLegsSha256?: string;
  pilotRelease?: import('../services/PilotRelease').PilotRelease;
  pilotWalkingRoute?: import('../services/WalkingRouteService').WalkingRouteData;
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
  narrativePlan?: import('../services/narrative/TourTextQuality').TourNarrativePlan;
  textAudit?: import('../services/narrative/TourTextQuality').TourTextAudit;
  routeDiagnostics?: import('../services/poi/RouteSelection').RouteDiagnostics;
  generationPipeline?: string;
  deepseekAuthor?: {
    runId: string;
    model: string;
    sourceLanguage: 'es';
    masterSha256: string;
    reviewStatus: 'SUFFICIENT_IN_REVIEW_SCOPE';
    reviewArtifactSha256: string;
    blueprintFingerprint: string;
    durationFit: string;
    guidedDurationMinutes: number;
  };
  codexAuthor?: {
    runId: string;
    publicationPassed: boolean;
    findingCount: number;
    durationFit: string;
    guidedDurationMinutes: number;
    transferCount: number;
    legs: import('../services/poi/TourGeometryV8').TourLegV8[];
    languageFindingCount?: number;
    narrationPolicyVersion?: string;
    narrationMinutes?: number;
    durationMeasured?: false;
    narrationWithinTarget?: boolean;
    blueprintFingerprint?: string;
    stopReviews?: Array<{
      stopId: string;
      findings: Array<{ sentenceId: string; classification: string; reason?: string }>;
      languageReview?: { matchesRequestedLanguage: boolean; naturalForListening: boolean; issues: string[] };
    }>;
  };
}
