export interface HistoryCapacityCandidate {
  category?: string;
  landmarkTier?: string;
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
