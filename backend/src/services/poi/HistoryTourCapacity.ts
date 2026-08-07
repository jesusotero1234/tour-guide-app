export interface HistoryCapacityCandidate {
  name?: string;
  wikidataId?: string | null;
  category?: string;
  landmarkTier?: string;
  fameScore?: number;
  historyPlaceScore?: number;
  historyPlaceKinds?: string[];
  historyIsEventSiteLike?: boolean;
  historyIsMuseumLike?: boolean;
}

export interface HistoryTourCapacity {
  requestedDuration: number;
  recommendedDuration: number;
  protectedAnchorCount: number;
  strongHistoryPlaceCount: number;
  reason: 'history_capacity_below_requested' | null;
}

export type HistoryPreflightDecision = 'generate' | 'recommend_shorter_duration' | 'needs_review' | 'block';
export type HistoryPreflightTier = 'strong_history_city' | 'solid_history_city' | 'compact_history_city' | 'weak_history_city' | 'insufficient_data';
export type HistoryPreflightReason =
  | 'history_capacity_below_requested'
  | 'insufficient_history_anchors'
  | 'insufficient_history_places'
  | 'route_degraded'
  | 'low_duration_coverage'
  | 'high_secondary_place_share';

export interface HistoryPreflightRouteSignals {
  degraded?: boolean;
  coverageRatio?: number;
}

export interface HistoryTourPreflight {
  requestedDurationMinutes: number;
  recommendedDurationMinutes: number;
  decision: HistoryPreflightDecision;
  tier: HistoryPreflightTier;
  reasons: HistoryPreflightReason[];
  protectedAnchorCount: number;
  strongHistoryPlaceCount: number;
  secondaryPlaceCount: number;
  secondaryPlaceShare: number;
  topAnchors: Array<{
    name: string;
    wikidataId: string | null;
    score: number;
    fameScore: number | null;
    category: string | null;
  }>;
}

const HISTORY_DURATION_THRESHOLDS = [
  { duration: 240, protectedAnchors: 4, strongPlaces: 8 },
  { duration: 180, protectedAnchors: 3, strongPlaces: 6 },
  { duration: 120, protectedAnchors: 2, strongPlaces: 5 },
  { duration: 90, protectedAnchors: 1, strongPlaces: 4 },
  { duration: 75, protectedAnchors: 1, strongPlaces: 4 },
] as const;

const STRONG_HISTORY_CATEGORIES = new Set([
  'civic_power',
  'memorial',
  'square_civic',
  'religious',
]);

const STRONG_HISTORY_KINDS = new Set([
  'civic-power-site',
  'event-place',
  'event-type',
  'memory-site',
  'power-site',
  'public-square',
]);

function hasStrongHistoryKind(candidate: HistoryCapacityCandidate): boolean {
  return Array.isArray(candidate.historyPlaceKinds)
    && candidate.historyPlaceKinds.some((kind) => STRONG_HISTORY_KINDS.has(kind));
}

function isMuseumContainer(candidate: HistoryCapacityCandidate): boolean {
  return candidate.historyIsMuseumLike === true && candidate.historyIsEventSiteLike !== true;
}

export function isProtectedHistoryAnchor(candidate: HistoryCapacityCandidate): boolean {
  if (isMuseumContainer(candidate)) {
    return false;
  }

  const score = candidate.historyPlaceScore ?? 0;
  const tier = candidate.landmarkTier ?? 'filler';
  return score >= 16
    || ((tier === 'flagship' || tier === 'major') && score >= 10)
    || (candidate.historyIsEventSiteLike === true && hasStrongHistoryKind(candidate));
}

export function isStrongHistoryPlace(candidate: HistoryCapacityCandidate): boolean {
  if (isMuseumContainer(candidate)) {
    return false;
  }

  return (candidate.historyPlaceScore ?? 0) >= 10
    || isProtectedHistoryAnchor(candidate)
    || Boolean(candidate.category && STRONG_HISTORY_CATEGORIES.has(candidate.category));
}

export function assessHistoryTourCapacity(
  candidates: HistoryCapacityCandidate[],
  requestedDuration: number
): HistoryTourCapacity {
  const protectedAnchorCount = candidates.filter(isProtectedHistoryAnchor).length;
  const strongHistoryPlaceCount = candidates.filter(isStrongHistoryPlace).length;
  const requestedThreshold = HISTORY_DURATION_THRESHOLDS.find((threshold) => requestedDuration >= threshold.duration)
    ?? HISTORY_DURATION_THRESHOLDS[HISTORY_DURATION_THRESHOLDS.length - 1];

  const recommended = HISTORY_DURATION_THRESHOLDS.find((threshold) => (
    protectedAnchorCount >= threshold.protectedAnchors
    && strongHistoryPlaceCount >= threshold.strongPlaces
  ));

  const recommendedDuration = recommended?.duration ?? 75;
  const belowRequested = requestedDuration > recommendedDuration
    && (
      protectedAnchorCount < requestedThreshold.protectedAnchors
      || strongHistoryPlaceCount < requestedThreshold.strongPlaces
    );

  return {
    requestedDuration,
    recommendedDuration,
    protectedAnchorCount,
    strongHistoryPlaceCount,
    reason: belowRequested ? 'history_capacity_below_requested' : null,
  };
}

function getAnchorPriority(candidate: HistoryCapacityCandidate): number {
  return (candidate.historyPlaceScore ?? 0)
    + ((candidate.fameScore ?? 0) * 0.35)
    + (candidate.landmarkTier === 'flagship' ? 2 : candidate.landmarkTier === 'major' ? 1 : 0);
}

function getPreflightTier(protectedAnchorCount: number, strongHistoryPlaceCount: number): HistoryPreflightTier {
  if (protectedAnchorCount < 1 || strongHistoryPlaceCount < 3) {
    return 'insufficient_data';
  }
  if (protectedAnchorCount >= 8 && strongHistoryPlaceCount >= 14) {
    return 'strong_history_city';
  }
  if (protectedAnchorCount >= 4 && strongHistoryPlaceCount >= 8) {
    return 'solid_history_city';
  }
  if (protectedAnchorCount >= 2 && strongHistoryPlaceCount >= 5) {
    return 'compact_history_city';
  }
  return 'weak_history_city';
}

export function assessHistoryTourPreflight(
  candidates: HistoryCapacityCandidate[],
  requestedDuration: number,
  routeSignals: HistoryPreflightRouteSignals = {}
): HistoryTourPreflight {
  const capacity = assessHistoryTourCapacity(candidates, requestedDuration);
  const secondaryPlaceCount = candidates.filter((candidate) => !isStrongHistoryPlace(candidate)).length;
  const secondaryPlaceShare = candidates.length > 0 ? secondaryPlaceCount / candidates.length : 1;
  const reasons = new Set<HistoryPreflightReason>();

  if (capacity.reason) {
    reasons.add(capacity.reason);
  }
  if (capacity.protectedAnchorCount < 1) {
    reasons.add('insufficient_history_anchors');
  }
  if (capacity.strongHistoryPlaceCount < 3) {
    reasons.add('insufficient_history_places');
  }
  if (routeSignals.degraded) {
    reasons.add('route_degraded');
  }
  if (typeof routeSignals.coverageRatio === 'number' && routeSignals.coverageRatio < 0.75) {
    reasons.add('low_duration_coverage');
  }
  if (secondaryPlaceShare > 0.7) {
    reasons.add('high_secondary_place_share');
  }

  const tier = getPreflightTier(capacity.protectedAnchorCount, capacity.strongHistoryPlaceCount);
  const decision: HistoryPreflightDecision = tier === 'insufficient_data'
    ? 'block'
    : capacity.reason
      ? 'recommend_shorter_duration'
      : (routeSignals.degraded || secondaryPlaceShare > 0.7)
        ? 'needs_review'
        : 'generate';

  return {
    requestedDurationMinutes: requestedDuration,
    recommendedDurationMinutes: capacity.recommendedDuration,
    decision,
    tier,
    reasons: Array.from(reasons),
    protectedAnchorCount: capacity.protectedAnchorCount,
    strongHistoryPlaceCount: capacity.strongHistoryPlaceCount,
    secondaryPlaceCount,
    secondaryPlaceShare: Number(secondaryPlaceShare.toFixed(3)),
    topAnchors: candidates
      .filter(isProtectedHistoryAnchor)
      .sort((left, right) => getAnchorPriority(right) - getAnchorPriority(left))
      .slice(0, 8)
      .map((candidate) => ({
        name: candidate.name || 'unknown',
        wikidataId: candidate.wikidataId ?? null,
        score: Number((candidate.historyPlaceScore ?? 0).toFixed(2)),
        fameScore: typeof candidate.fameScore === 'number' ? Number(candidate.fameScore.toFixed(2)) : null,
        category: candidate.category ?? null,
      })),
  };
}
