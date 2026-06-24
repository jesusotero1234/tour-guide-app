import { isProtectedHistoryAnchor } from './HistoryTourCapacity';

export interface RouteCoordinates {
  lat: number;
  lng: number;
}

export interface RouteCandidate {
  name?: string;
  coordinates?: RouteCoordinates;
  latitude?: number;
  longitude?: number;
  importance_score?: number;
  importanceScore?: number;
  category?: string;
  landmarkTier?: string;
  fameScore?: number;
  historyPlaceScore?: number;
  historyPlaceKinds?: string[];
  historyIsEventSiteLike?: boolean;
  historyIsMuseumLike?: boolean;
  [key: string]: unknown;
}

export interface RouteMetrics {
  walkingMeters: number;
  walkingMinutes: number;
  estimatedTourMinutes: number;
  outOfIdealSegments: number;
  hasOverMaxSegment: boolean;
  overMaxSegments: number;
  maxSegmentMeters: number;
}

export interface RouteDiagnostics {
  degraded: boolean;
  degradationReason: 'duration_below_requested' | null;
  coverageRatio: number;
  estimatedTourMinutes: number;
  requestedDuration: number;
}

export interface RouteSelectionResult<T extends RouteCandidate> {
  route: T[];
  diagnostics: RouteDiagnostics;
}

export interface StopBounds {
  minStops: number;
  maxStops: number;
}

type OrderingStrategy = 'centroid_anchor' | 'importance_anchor';

interface DiversePrefixOptions {
  requestedDuration?: number;
  requiredFlagships?: number;
  categoryPenaltyMultiplier?: number;
  theme?: string;
}

interface EvaluatedRouteCandidate<T extends RouteCandidate> {
  prefix: T[];
  metrics: RouteMetrics;
  durationGap: number;
  durationRangePenalty: number;
  importanceSum: number;
  flagshipDeficit: number;
  historyAnchorDeficit: number;
  coverageScore: number;
  historyExperienceScore: number;
  categoryBalancePenalty: number;
  plausibilityPenalty: number;
}

interface RouteEvaluationContext {
  requestedDuration: number;
  strategy: OrderingStrategy;
  maxSegmentMeters: number;
  requiredFlagships: number;
  requiredHistoryAnchors: number;
  requiredHistoryAnchorKeys: Set<string>;
  lowerBound: number;
  upperBound: number;
  maxCategoryRatio: number;
  categoryBalanceWeight: number;
  theme: string;
}

interface RouteSearchOptions {
  categoryPenaltyMultiplier?: number;
  categoryBalanceWeight?: number;
}

function getCoordinates(place: RouteCandidate): RouteCoordinates | null {
  const lat = place.coordinates?.lat ?? place.latitude;
  const lng = place.coordinates?.lng ?? place.longitude;

  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }

  return { lat, lng };
}

function getImportanceScore(place: RouteCandidate): number {
  return place.importanceScore ?? place.importance_score ?? 0;
}

function isHistoryMuseumContainer(place: RouteCandidate): boolean {
  return (place.historyIsMuseumLike === true && place.historyIsEventSiteLike !== true)
    || (Array.isArray(place.historyPlaceKinds) && place.historyPlaceKinds.includes('museum-container'));
}

function getHistoryCompositionCandidates<T extends RouteCandidate>(candidates: T[], theme: string, minStops: number): T[] {
  if (theme !== 'history') {
    return candidates;
  }

  const withoutMuseumContainers = candidates.filter((candidate) => !isHistoryMuseumContainer(candidate));
  return withoutMuseumContainers.length >= Math.max(2, minStops)
    ? withoutMuseumContainers
    : candidates;
}

function getHistoryRouteExperienceScore(place: RouteCandidate, theme?: string): number {
  if (theme !== 'history') {
    return 0;
  }

  const explicitScore = typeof place.historyPlaceScore === 'number' ? place.historyPlaceScore : null;
  if (explicitScore !== null) {
    if (isHistoryMuseumContainer(place)) {
      return Math.min(-30, explicitScore - 40);
    }

    return explicitScore;
  }

  return 0;
}

function getHistoryAnchorScore(place: RouteCandidate, theme?: string): number {
  if (theme !== 'history') {
    return 0;
  }

  const category = getCategory(place);
  let score = getHistoryRouteExperienceScore(place, theme);
  if (category === 'civic_power') score += 2;
  if (category === 'memorial') score += 1;
  if (Array.isArray(place.historyPlaceKinds) && place.historyPlaceKinds.includes('event-place')) score += 2;
  if (Array.isArray(place.historyPlaceKinds) && place.historyPlaceKinds.includes('museum-container')) score -= 4;
  return score;
}

function getRequiredHistoryAnchorCount(stopCount: number, requestedDuration: number | undefined, candidates: RouteCandidate[]): number {
  const availableAnchors = candidates.filter(isProtectedHistoryAnchor).length;
  if (availableAnchors === 0) {
    return 0;
  }

  const duration = requestedDuration ?? 0;
  const desired = duration >= 240
    ? 4
    : duration >= 180
      ? 3
      : duration >= 90
        ? 2
        : 1;

  return Math.min(stopCount, availableAnchors, desired);
}

function selectBestHistoryAnchor<T extends RouteCandidate>(
  remaining: T[],
  selected: T[],
  categoryCounts: Map<string, number>,
  maxCategoryRatio: number,
  categoryPenaltyMultiplier: number,
  requestedDuration: number
): T | null {
  const scored = remaining
    .filter(isProtectedHistoryAnchor)
    .map((place) => {
      const category = getCategory(place);
      return {
        place,
        adjustedScore: getHistoryAnchorPriorityScore(place)
          - getCategorySelectionPenalty(
            category,
            categoryCounts,
            selected.length,
            maxCategoryRatio,
            categoryPenaltyMultiplier
          )
          - (getSpatialOutlierPenalty(place, selected, requestedDuration) * 2)
          - getLocalOverlapPenalty(place, selected),
      };
    })
    .sort((a, b) => b.adjustedScore - a.adjustedScore);

  return scored[0]?.place ?? null;
}

function getHistoryAnchorPriorityScore(place: RouteCandidate): number {
  return getHistoryAnchorScore(place, 'history')
    + ((typeof place.fameScore === 'number' ? place.fameScore : 0) * 0.35)
    + (getImportanceScore(place) * 0.15)
    + (getLandmarkTier(place) === 'flagship' ? 1 : 0)
    + (getLandmarkTier(place) === 'major' ? 0.5 : 0);
}

function getRequiredHistoryAnchorKeys(candidates: RouteCandidate[], requestedDuration: number, limit: number): Set<string> {
  if (limit <= 0) {
    return new Set();
  }

  const centroidSum = getSelectionCentroid(candidates);
  const centroid = centroidSum ? finalizeCentroid(centroidSum, candidates.length) : null;
  const preferredRadius = getPreferredClusterRadiusMeters(requestedDuration);

  return new Set(candidates
    .filter(isProtectedHistoryAnchor)
    .sort((a, b) => {
      const getWalkableAnchorScore = (place: RouteCandidate): number => {
        const coordinate = getCoordinates(place);
        const distancePenalty = coordinate && centroid
          ? Math.max(0, haversineMeters(coordinate, centroid) - preferredRadius) / 120
          : 0;
        return getHistoryAnchorPriorityScore(place) - distancePenalty;
      };

      return getWalkableAnchorScore(b) - getWalkableAnchorScore(a);
    })
    .slice(0, limit)
    .map(getCandidateKey));
}

function getRoutePriorityScore(place: RouteCandidate, theme?: string): number {
  const importance = getImportanceScore(place);
  const fameScore = typeof place.fameScore === 'number' ? place.fameScore : null;
  const tier = getLandmarkTier(place);
  const historyExperienceScore = getHistoryRouteExperienceScore(place, theme);
  if (fameScore === null) {
    return importance + historyExperienceScore;
  }

  if (tier === 'flagship' || tier === 'major') {
    return fameScore + historyExperienceScore;
  }

  return importance + historyExperienceScore;
}

function getCategory(place: RouteCandidate): string {
  return place.category || 'other';
}

function getLandmarkTier(place: RouteCandidate): string {
  return typeof place.landmarkTier === 'string' ? place.landmarkTier : 'filler';
}

function getCandidateKey(place: RouteCandidate): string {
  const wikidataId = typeof place.wikidataId === 'string' ? place.wikidataId : null;
  if (wikidataId) {
    return `wikidata:${wikidataId}`;
  }

  const coordinate = getCoordinates(place);
  const lat = coordinate ? coordinate.lat : 'na';
  const lng = coordinate ? coordinate.lng : 'na';
  return [place.name ?? '', lat, lng, getCategory(place), getImportanceScore(place)].join('|');
}

function getCoverageWeight(place: RouteCandidate): number {
  const tier = getLandmarkTier(place);
  if (tier === 'flagship') return 3;
  if (tier === 'major') return 1;
  return 0;
}

function getPlausibilityTierWeight(place: RouteCandidate): number {
  const tier = getLandmarkTier(place);
  if (tier === 'flagship') return 0.7;
  if (tier === 'major') return 0.75;
  if (tier === 'supporting') return 0.9;
  return 1.2;
}

function haversineMeters(a: RouteCoordinates, b: RouteCoordinates): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusMeters = 6371000;
  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const sinLat = Math.sin(deltaLat / 2);
  const sinLng = Math.sin(deltaLng / 2);
  const h = sinLat * sinLat + Math.cos(lat1) * Math.cos(lat2) * sinLng * sinLng;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function estimateRouteMetrics(orderedPlaces: RouteCandidate[], maxSegmentMeters = 1200): RouteMetrics {
  const walkingDistanceMultiplier = 1.3;
  const walkingSpeedKmh = 4.2;
  const stopExperienceMinutes = orderedPlaces.length * 7;
  const bufferMinutes = Math.max(5, orderedPlaces.length * 2);
  const idealMaxSegmentMeters = maxSegmentMeters >= 1800
    ? 1400
    : maxSegmentMeters >= 1600
      ? 1200
      : 900;
  const idealMinSegmentMeters = orderedPlaces.length >= 6 ? 200 : 300;

  let walkingMeters = 0;
  let outOfIdealSegments = 0;
  let hasOverMaxSegment = false;
  let overMaxSegments = 0;
  let longestSegmentMeters = 0;

  for (let i = 1; i < orderedPlaces.length; i++) {
    const prev = getCoordinates(orderedPlaces[i - 1]);
    const next = getCoordinates(orderedPlaces[i]);
    if (!prev || !next) {
      continue;
    }

    const estimatedSegmentMeters = haversineMeters(prev, next) * walkingDistanceMultiplier;
    walkingMeters += estimatedSegmentMeters;
    longestSegmentMeters = Math.max(longestSegmentMeters, estimatedSegmentMeters);

    if (estimatedSegmentMeters > maxSegmentMeters) {
      hasOverMaxSegment = true;
      overMaxSegments += 1;
    }

    if (estimatedSegmentMeters < idealMinSegmentMeters || estimatedSegmentMeters > idealMaxSegmentMeters) {
      outOfIdealSegments += 1;
    }
  }

  const walkingMinutes = (walkingMeters / 1000 / walkingSpeedKmh) * 60;
  return {
    walkingMeters,
    walkingMinutes,
    estimatedTourMinutes: walkingMinutes + stopExperienceMinutes + bufferMinutes,
    outOfIdealSegments,
    hasOverMaxSegment,
    overMaxSegments,
    maxSegmentMeters: longestSegmentMeters,
  };
}

function getSelectionCentroid(selected: RouteCandidate[]): RouteCoordinates | null {
  const coordinates = selected
    .map((place) => getCoordinates(place))
    .filter((coordinate): coordinate is RouteCoordinates => Boolean(coordinate));

  if (coordinates.length === 0) {
    return null;
  }

  return coordinates.reduce(
    (acc, coordinate) => ({ lat: acc.lat + coordinate.lat, lng: acc.lng + coordinate.lng }),
    { lat: 0, lng: 0 }
  );
}

function finalizeCentroid(centroid: RouteCoordinates, count: number): RouteCoordinates {
  return {
    lat: centroid.lat / count,
    lng: centroid.lng / count,
  };
}

function getPreferredClusterRadiusMeters(requestedDuration: number): number {
  if (requestedDuration >= 240) return 2200;
  if (requestedDuration >= 180) return 1800;
  if (requestedDuration >= 120) return 1500;
  return 1200;
}

function getRequiredFlagshipCount(candidates: RouteCandidate[], requestedDuration: number): number {
  const availableFlagships = candidates.filter((candidate) => getLandmarkTier(candidate) === 'flagship').length;
  if (availableFlagships === 0) {
    return 0;
  }

  const desired = requestedDuration >= 240
    ? 3
    : requestedDuration >= 180
      ? 2
      : requestedDuration >= 90
        ? 1
        : 0;

  return Math.min(availableFlagships, desired);
}

function getSpatialOutlierPenalty(place: RouteCandidate, selected: RouteCandidate[], requestedDuration: number): number {
  if (selected.length === 0) {
    return 0;
  }

  const coordinate = getCoordinates(place);
  const selectedCentroid = getSelectionCentroid(selected);
  if (!coordinate || !selectedCentroid) {
    return 0;
  }

  const centroid = finalizeCentroid(selectedCentroid, selected.length);
  const preferredRadius = getPreferredClusterRadiusMeters(requestedDuration);
  const distanceFromCentroid = haversineMeters(coordinate, centroid);
  const excessDistance = Math.max(0, distanceFromCentroid - preferredRadius);

  return (excessDistance / 500) * getPlausibilityTierWeight(place);
}

function getLocalOverlapPenalty(place: RouteCandidate, selected: RouteCandidate[]): number {
  if (selected.length === 0) {
    return 0;
  }

  const coordinate = getCoordinates(place);
  if (!coordinate) {
    return 0;
  }

  let nearestMeters = Number.POSITIVE_INFINITY;
  for (const selectedPlace of selected) {
    const selectedCoordinate = getCoordinates(selectedPlace);
    if (!selectedCoordinate) {
      continue;
    }

    nearestMeters = Math.min(nearestMeters, haversineMeters(coordinate, selectedCoordinate));
  }

  if (!Number.isFinite(nearestMeters) || nearestMeters >= 450) {
    return 0;
  }

  const overlapRatio = (450 - nearestMeters) / 150;
  const tier = getLandmarkTier(place);
  const weight = tier === 'flagship'
    ? 0.6
    : tier === 'major'
      ? 0.8
      : 1.1;

  return overlapRatio * weight;
}

function getCategorySelectionPenalty(
  category: string,
  categoryCounts: Map<string, number>,
  selectedCount: number,
  maxCategoryRatio: number,
  multiplier: number
): number {
  if (selectedCount === 0) {
    return 0;
  }

  const currentCount = categoryCounts.get(category) ?? 0;
  const projectedRatio = (currentCount + 1) / (selectedCount + 1);
  const overuse = Math.max(0, projectedRatio - maxCategoryRatio);
  const repetitionPenalty = multiplier > 2 ? Math.max(0, currentCount - 1) * 0.4 : 0;

  return (overuse * multiplier) + repetitionPenalty;
}

function getCategoryBalancePenalty(places: RouteCandidate[], maxCategoryRatio: number): number {
  if (places.length === 0) {
    return 0;
  }

  const counts = new Map<string, number>();
  for (const place of places) {
    const category = getCategory(place);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  let penalty = 0;
  for (const count of counts.values()) {
    const share = count / places.length;
    penalty += Math.max(0, share - maxCategoryRatio) * 35;
    penalty += Math.max(0, count - 2) * 0.35;
  }

  return penalty;
}

function getRouteMaxCategoryShare(places: RouteCandidate[]): number {
  if (places.length === 0) {
    return 1;
  }

  const counts = new Map<string, number>();
  for (const place of places) {
    const category = getCategory(place);
    counts.set(category, (counts.get(category) ?? 0) + 1);
  }

  return Math.max(...counts.values()) / places.length;
}

function calculateSpatialSpreadMeters(orderedPlaces: RouteCandidate[]): number {
  const centroidSum = getSelectionCentroid(orderedPlaces);
  if (!centroidSum) {
    return 0;
  }

  const centroid = finalizeCentroid(centroidSum, orderedPlaces.length);

  return orderedPlaces.reduce((maxDistance, place) => {
    const coordinates = getCoordinates(place);
    if (!coordinates) {
      return maxDistance;
    }

    return Math.max(maxDistance, haversineMeters(coordinates, centroid));
  }, 0);
}

function getDurationRangePenalty(estimatedTourMinutes: number, lowerBound: number, upperBound: number): number {
  if (estimatedTourMinutes < lowerBound) {
    return lowerBound - estimatedTourMinutes;
  }
  if (estimatedTourMinutes > upperBound) {
    return estimatedTourMinutes - upperBound;
  }
  return 0;
}

function getRoutePlausibilityPenalty(metrics: RouteMetrics, requestedDuration: number, maxSegmentMeters: number, spatialSpreadMeters: number): number {
  const spreadLimit = getPreferredClusterRadiusMeters(requestedDuration) + 700;
  const spreadPenalty = Math.max(0, spatialSpreadMeters - spreadLimit) / 180;
  const segmentPenalty = (metrics.overMaxSegments * 16) + (Math.max(0, metrics.maxSegmentMeters - maxSegmentMeters) / 120);
  const walkingPenalty = Math.max(0, metrics.walkingMinutes - (requestedDuration * 0.42)) * 2;

  return spreadPenalty + segmentPenalty + walkingPenalty;
}

export function buildDiversePrefix<T extends RouteCandidate>(
  candidates: T[],
  stopCount: number,
  maxCategoryRatio: number,
  options: DiversePrefixOptions = {}
): T[] {
  const selected: T[] = [];
  const categoryCounts = new Map<string, number>();
  const remaining = [...candidates];
  const requiredFlagships = Math.min(stopCount, options.requiredFlagships ?? 0);
  const categoryPenaltyMultiplier = options.categoryPenaltyMultiplier ?? 2.0;
  const strongCategoryControl = categoryPenaltyMultiplier > 2 || options.theme === 'history';
  const spatialPenaltyWeight = options.theme === 'history' ? 2.5 : 1;
  const requiredHistoryAnchors = options.theme === 'history'
    ? getRequiredHistoryAnchorCount(stopCount, options.requestedDuration, candidates)
    : 0;

  while (selected.length < requiredHistoryAnchors && remaining.length > 0) {
    const nextAnchor = selectBestHistoryAnchor(
      remaining,
      selected,
      categoryCounts,
      maxCategoryRatio,
      categoryPenaltyMultiplier,
      options.requestedDuration ?? 120
    );
    if (!nextAnchor) {
      break;
    }

    selected.push(nextAnchor);
    const category = getCategory(nextAnchor);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    const pickedIndex = remaining.indexOf(nextAnchor);
    if (pickedIndex >= 0) {
      remaining.splice(pickedIndex, 1);
    }
  }

  if (requiredFlagships > 0) {
    while (selected.length < requiredFlagships) {
      const flagshipCandidates = remaining
        .filter((place) => getLandmarkTier(place) === 'flagship')
        .map((place) => ({
          place,
          adjustedScore: getRoutePriorityScore(place, options.theme)
            - (strongCategoryControl
              ? getCategorySelectionPenalty(
                getCategory(place),
                categoryCounts,
                selected.length,
                maxCategoryRatio,
                categoryPenaltyMultiplier
              )
              : 0)
            - (getSpatialOutlierPenalty(place, selected, options.requestedDuration ?? 120) * 2.5 * spatialPenaltyWeight)
            - getLocalOverlapPenalty(place, selected),
        }))
        .sort((a, b) => b.adjustedScore - a.adjustedScore);

      const nextFlagship = flagshipCandidates[0]?.place;
      if (!nextFlagship) {
        break;
      }

      selected.push(nextFlagship);
      const category = getCategory(nextFlagship);
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);

      const pickedIndex = remaining.indexOf(nextFlagship);
      if (pickedIndex >= 0) {
        remaining.splice(pickedIndex, 1);
      }
    }
  }

  while (selected.length < stopCount && remaining.length > 0) {
    const scored = remaining.map((place) => {
      const category = getCategory(place);
      const categoryOverusePenalty = getCategorySelectionPenalty(
        category,
        categoryCounts,
        selected.length,
        maxCategoryRatio,
        categoryPenaltyMultiplier
      );
      const spatialOutlierPenalty = getSpatialOutlierPenalty(place, selected, options.requestedDuration ?? 120) * spatialPenaltyWeight;
      const localOverlapPenalty = getLocalOverlapPenalty(place, selected);
      return {
        place,
        adjustedScore: getRoutePriorityScore(place, options.theme)
          - categoryOverusePenalty
          - spatialOutlierPenalty
          - localOverlapPenalty,
      };
    });

    scored.sort((a, b) => b.adjustedScore - a.adjustedScore);
    const best = scored[0];
    selected.push(best.place);
    const category = getCategory(best.place);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);

    const pickedIndex = remaining.indexOf(best.place);
    if (pickedIndex >= 0) {
      remaining.splice(pickedIndex, 1);
    }
  }

  if (selected.length < stopCount) {
    for (const place of candidates) {
      if (selected.length >= stopCount) break;
      if (selected.includes(place)) continue;
      selected.push(place);
    }
  }

  return selected.map((place, index) => ({ ...place, position: index } as T));
}

export function orderRouteCandidates<T extends RouteCandidate>(candidates: T[], strategy: OrderingStrategy = 'centroid_anchor', theme?: string): T[] {
  if (candidates.length <= 1) {
    return candidates.map((place, index) => ({ ...place, position: index } as T));
  }

  const coordinates = candidates.map((place) => {
    const coordinate = getCoordinates(place);
    if (!coordinate) {
      throw new Error('Route composition requires valid coordinates');
    }
    return coordinate;
  });

  const centroid = coordinates.reduce(
    (acc, coordinate) => ({ lat: acc.lat + coordinate.lat, lng: acc.lng + coordinate.lng }),
    { lat: 0, lng: 0 }
  );
  centroid.lat /= candidates.length;
  centroid.lng /= candidates.length;

  const startAnchor = strategy === 'importance_anchor'
    ? [...candidates].sort((a, b) => getRoutePriorityScore(b, theme) - getRoutePriorityScore(a, theme))[0]
    : [...candidates]
      .sort((a, b) => {
        const aCoord = getCoordinates(a)!;
        const bCoord = getCoordinates(b)!;
        return haversineMeters(aCoord, centroid) - haversineMeters(bCoord, centroid);
      })
      .slice(0, Math.min(3, candidates.length))
      .sort((a, b) => getRoutePriorityScore(b, theme) - getRoutePriorityScore(a, theme))[0];

  const remaining = candidates.filter((place) => place !== startAnchor);
  const ordered = [startAnchor];

  while (remaining.length > 0) {
    const current = ordered[ordered.length - 1];
    const currentCoord = getCoordinates(current)!;

    let nearestIndex = 0;
    let nearestDistance = Number.POSITIVE_INFINITY;
    for (let i = 0; i < remaining.length; i++) {
      const candidateCoord = getCoordinates(remaining[i])!;
      const distance = haversineMeters(currentCoord, candidateCoord);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearestIndex = i;
      }
    }

    ordered.push(remaining.splice(nearestIndex, 1)[0]);
  }

  const reverseOrdered = [...ordered].reverse();
  const forwardDistance = estimateRouteMetrics(ordered).walkingMeters;
  const reverseDistance = estimateRouteMetrics(reverseOrdered).walkingMeters;
  const finalOrder = reverseDistance < forwardDistance ? reverseOrdered : ordered;

  return finalOrder.map((place, index) => ({ ...place, position: index } as T));
}

function getMaxCategoryRatio(theme: string, orderedCandidates: RouteCandidate[]): number {
  const strongCandidates = orderedCandidates.filter((candidate) => getImportanceScore(candidate) >= 7.5).length;
  if (theme === 'history') {
    return orderedCandidates.length >= 25 && strongCandidates >= 15 ? 0.4 : 0.6;
  }

  return orderedCandidates.length >= 25 && strongCandidates >= 15 ? 0.5 : 0.7;
}

function getMaxSegmentMeters(requestedDuration: number, extended = false): number {
  let maxSegmentMeters = 1200;

  if (requestedDuration >= 240) {
    maxSegmentMeters = 1800;
  } else if (requestedDuration >= 180) {
    maxSegmentMeters = 1600;
  } else if (requestedDuration >= 120) {
    maxSegmentMeters = 1400;
  }

  if (extended) {
    maxSegmentMeters += 400;
  }

  return maxSegmentMeters;
}

function getQualityExtensionMaxStops(requestedDuration: number, stopBounds: StopBounds, candidateCount: number): number {
  const extraStops = requestedDuration >= 240
    ? 3
    : requestedDuration >= 180
      ? 2
      : requestedDuration >= 120
        ? 1
        : 0;

  return Math.min(candidateCount, stopBounds.maxStops + extraStops);
}

function rankSelectionCandidates<T extends RouteCandidate>(a: EvaluatedRouteCandidate<T>, b: EvaluatedRouteCandidate<T>): number {
  if (a.historyAnchorDeficit !== b.historyAnchorDeficit) {
    return a.historyAnchorDeficit - b.historyAnchorDeficit;
  }
  if (a.flagshipDeficit !== b.flagshipDeficit) {
    return a.flagshipDeficit - b.flagshipDeficit;
  }
  if (a.durationRangePenalty !== b.durationRangePenalty) {
    return a.durationRangePenalty - b.durationRangePenalty;
  }
  if (a.plausibilityPenalty !== b.plausibilityPenalty) {
    return a.plausibilityPenalty - b.plausibilityPenalty;
  }
  if (a.coverageScore !== b.coverageScore) {
    return b.coverageScore - a.coverageScore;
  }
  if (a.historyExperienceScore !== b.historyExperienceScore) {
    return b.historyExperienceScore - a.historyExperienceScore;
  }
  if (a.importanceSum !== b.importanceSum) {
    return b.importanceSum - a.importanceSum;
  }
  if (a.categoryBalancePenalty !== b.categoryBalancePenalty) {
    return a.categoryBalancePenalty - b.categoryBalancePenalty;
  }
  if (a.durationGap !== b.durationGap) {
    return a.durationGap - b.durationGap;
  }
  if (a.metrics.outOfIdealSegments !== b.metrics.outOfIdealSegments) {
    return a.metrics.outOfIdealSegments - b.metrics.outOfIdealSegments;
  }
  return 0;
}

function rankOverlongRepairCandidates<T extends RouteCandidate>(a: EvaluatedRouteCandidate<T>, b: EvaluatedRouteCandidate<T>): number {
  if (a.metrics.hasOverMaxSegment !== b.metrics.hasOverMaxSegment) {
    return a.metrics.hasOverMaxSegment ? 1 : -1;
  }
  if (a.historyAnchorDeficit !== b.historyAnchorDeficit) {
    return a.historyAnchorDeficit - b.historyAnchorDeficit;
  }
  if (a.durationRangePenalty !== b.durationRangePenalty) {
    return a.durationRangePenalty - b.durationRangePenalty;
  }
  if (a.plausibilityPenalty !== b.plausibilityPenalty) {
    return a.plausibilityPenalty - b.plausibilityPenalty;
  }
  if (a.metrics.outOfIdealSegments !== b.metrics.outOfIdealSegments) {
    return a.metrics.outOfIdealSegments - b.metrics.outOfIdealSegments;
  }
  if (a.historyExperienceScore !== b.historyExperienceScore) {
    return b.historyExperienceScore - a.historyExperienceScore;
  }
  return b.importanceSum - a.importanceSum;
}

function evaluatePrefix<T extends RouteCandidate>(
  prefix: T[],
  context: RouteEvaluationContext
): EvaluatedRouteCandidate<T> {
  const orderedPrefix = orderRouteCandidates(prefix, context.strategy, context.theme);
  const metrics = estimateRouteMetrics(orderedPrefix, context.maxSegmentMeters);
  const spatialSpreadMeters = calculateSpatialSpreadMeters(orderedPrefix);
  const flagshipCount = orderedPrefix.filter((place) => getLandmarkTier(place) === 'flagship').length;
  const selectedKeys = new Set(orderedPrefix.map(getCandidateKey));
  const missingHistoryAnchors = Array.from(context.requiredHistoryAnchorKeys)
    .filter((key) => !selectedKeys.has(key)).length;
  const majorCount = orderedPrefix.filter((place) => getLandmarkTier(place) === 'major').length;

  return {
    prefix: orderedPrefix,
    metrics,
    durationGap: Math.abs(metrics.estimatedTourMinutes - context.requestedDuration),
    durationRangePenalty: getDurationRangePenalty(metrics.estimatedTourMinutes, context.lowerBound, context.upperBound),
    importanceSum: orderedPrefix.reduce((sum, place) => sum + getRoutePriorityScore(place, context.theme), 0),
    flagshipDeficit: Math.max(0, context.requiredFlagships - flagshipCount),
    historyAnchorDeficit: Math.max(0, missingHistoryAnchors),
    coverageScore: (flagshipCount * 3) + majorCount,
    historyExperienceScore: orderedPrefix.reduce((sum, place) => sum + getHistoryRouteExperienceScore(place, context.theme), 0),
    categoryBalancePenalty: getCategoryBalancePenalty(orderedPrefix, context.maxCategoryRatio) * context.categoryBalanceWeight,
    plausibilityPenalty: getRoutePlausibilityPenalty(metrics, context.requestedDuration, context.maxSegmentMeters, spatialSpreadMeters),
  };
}

function improvePrefixBySwapping<T extends RouteCandidate>(
  candidates: T[],
  selectedSet: T[],
  context: RouteEvaluationContext
): EvaluatedRouteCandidate<T> {
  let bestSelection = [...selectedSet];
  let bestEvaluation = evaluatePrefix(bestSelection, context);

  for (let iteration = 0; iteration < 3; iteration++) {
    let bestSwapSelection: T[] | null = null;
    let bestSwapEvaluation: EvaluatedRouteCandidate<T> | null = null;
    const selectedLookup = new Set(bestSelection.map((candidate) => getCandidateKey(candidate)));
    const remaining = candidates.filter((candidate) => !selectedLookup.has(getCandidateKey(candidate)));

    for (let selectedIndex = 0; selectedIndex < bestSelection.length; selectedIndex++) {
      for (const replacement of remaining) {
        const nextSelection = [...bestSelection];
        nextSelection[selectedIndex] = replacement;
        const evaluation = evaluatePrefix(nextSelection, context);

        if (rankSelectionCandidates(evaluation, bestEvaluation) < 0) {
          if (!bestSwapEvaluation || rankSelectionCandidates(evaluation, bestSwapEvaluation) < 0) {
            bestSwapSelection = nextSelection;
            bestSwapEvaluation = evaluation;
          }
        }
      }
    }

    if (!bestSwapSelection || !bestSwapEvaluation) {
      break;
    }

    bestSelection = bestSwapSelection;
    bestEvaluation = bestSwapEvaluation;
  }

  return bestEvaluation;
}

function repairOverlongPrefix<T extends RouteCandidate>(
  candidates: T[],
  selectedSet: T[],
  context: RouteEvaluationContext,
  minStops: number
): EvaluatedRouteCandidate<T> {
  let bestSelection = [...selectedSet];
  let bestEvaluation = evaluatePrefix(bestSelection, context);

  for (let iteration = 0; iteration < 5; iteration++) {
    const selectedLookup = new Set(bestSelection.map((candidate) => getCandidateKey(candidate)));
    const remaining = candidates.filter((candidate) => !selectedLookup.has(getCandidateKey(candidate)));
    const repairCandidates: EvaluatedRouteCandidate<T>[] = [];

    if (bestSelection.length > minStops) {
      for (let removeIndex = 0; removeIndex < bestSelection.length; removeIndex++) {
        repairCandidates.push(evaluatePrefix(
          bestSelection.filter((_, index) => index !== removeIndex),
          context
        ));
      }
    }

    for (let selectedIndex = 0; selectedIndex < bestSelection.length; selectedIndex++) {
      for (const replacement of remaining) {
        const nextSelection = [...bestSelection];
        nextSelection[selectedIndex] = replacement;
        repairCandidates.push(evaluatePrefix(nextSelection, context));
      }
    }

    const nextBest = repairCandidates.sort(rankOverlongRepairCandidates)[0];
    if (!nextBest || rankOverlongRepairCandidates(nextBest, bestEvaluation) >= 0) {
      break;
    }

    bestSelection = nextBest.prefix;
    bestEvaluation = nextBest;

    if (!bestEvaluation.metrics.hasOverMaxSegment && bestEvaluation.durationRangePenalty === 0) {
      break;
    }
  }

  return bestEvaluation;
}

function evaluateRouteCandidates<T extends RouteCandidate>(
  candidates: T[],
  requestedDuration: number,
  stopBounds: StopBounds,
  maxCategoryRatio: number,
  strategy: OrderingStrategy,
  maxSegmentMeters: number,
  theme: string,
  options: RouteSearchOptions = {}
): EvaluatedRouteCandidate<T>[] {
  const cappedMaxStops = Math.min(stopBounds.maxStops, candidates.length);
  const effectiveMinStops = candidates.length < stopBounds.minStops ? candidates.length : stopBounds.minStops;
  const requiredFlagships = getRequiredFlagshipCount(candidates, requestedDuration);
  const requiredHistoryAnchors = theme === 'history'
    ? getRequiredHistoryAnchorCount(cappedMaxStops, requestedDuration, candidates)
    : 0;
  const lowerBound = requestedDuration * 0.75;
  const upperBound = requestedDuration * 1.15;
  const context: RouteEvaluationContext = {
    requestedDuration,
    strategy,
    maxSegmentMeters,
    requiredFlagships,
    requiredHistoryAnchors,
    requiredHistoryAnchorKeys: getRequiredHistoryAnchorKeys(candidates, requestedDuration, requiredHistoryAnchors),
    lowerBound,
    upperBound,
    maxCategoryRatio,
    categoryBalanceWeight: options.categoryBalanceWeight ?? 0,
    theme,
  };
  const evaluated: EvaluatedRouteCandidate<T>[] = [];

  for (let stopCount = effectiveMinStops; stopCount <= cappedMaxStops; stopCount++) {
    const selectedSet = buildDiversePrefix(candidates, stopCount, maxCategoryRatio, {
      requestedDuration,
      requiredFlagships,
      categoryPenaltyMultiplier: options.categoryPenaltyMultiplier ?? (theme === 'history' ? 3.0 : 2.0),
      theme,
    });
    evaluated.push(evaluatePrefix(selectedSet, context));
    evaluated.push(improvePrefixBySwapping(candidates, selectedSet, context));
  }

  return evaluated;
}

export function composeWalkingRoute<T extends RouteCandidate>(
  verifiedPlaces: T[],
  requestedDuration: number,
  theme: string,
  stopBounds: StopBounds
): RouteSelectionResult<T> {
  const verifiedRouteCandidates = verifiedPlaces.filter((place) => getCoordinates(place)) as T[];
  const routeCandidates = getHistoryCompositionCandidates(verifiedRouteCandidates, theme, stopBounds.minStops);

  if (routeCandidates.length < 2) {
    throw new Error('No places could be verified');
  }

  const maxCategoryRatio = getMaxCategoryRatio(theme, routeCandidates);
  const primaryCandidates = evaluateRouteCandidates(
    routeCandidates,
    requestedDuration,
    stopBounds,
    maxCategoryRatio,
    'centroid_anchor',
    getMaxSegmentMeters(requestedDuration),
    theme
  );

  const emergencyPrefix = orderRouteCandidates(
    routeCandidates.slice(0, Math.max(2, stopBounds.minStops)),
    'importance_anchor',
    theme
  ).map((place, index) => ({ ...place, position: index } as T));
  const emergencyMetrics = estimateRouteMetrics(emergencyPrefix, getMaxSegmentMeters(requestedDuration, true));

  const selected = primaryCandidates.sort(rankSelectionCandidates)[0]
    || {
      prefix: emergencyPrefix,
      metrics: emergencyMetrics,
      durationGap: Math.abs(emergencyMetrics.estimatedTourMinutes - requestedDuration),
      durationRangePenalty: Math.abs(emergencyMetrics.estimatedTourMinutes - requestedDuration),
      importanceSum: emergencyPrefix.reduce((sum, place) => sum + getRoutePriorityScore(place, theme), 0),
      flagshipDeficit: 0,
      historyAnchorDeficit: 0,
      coverageScore: emergencyPrefix.reduce((sum, place) => sum + getCoverageWeight(place), 0),
      historyExperienceScore: emergencyPrefix.reduce((sum, place) => sum + getHistoryRouteExperienceScore(place, theme), 0),
      categoryBalancePenalty: getCategoryBalancePenalty(emergencyPrefix, maxCategoryRatio),
      plausibilityPenalty: 0,
    };

  if (getRouteMaxCategoryShare(selected.prefix) > maxCategoryRatio && routeCandidates.length > selected.prefix.length) {
    const diversityStopBounds = {
      minStops: Math.min(routeCandidates.length, Math.max(stopBounds.minStops, selected.prefix.length + 1)),
      maxStops: Math.min(routeCandidates.length, stopBounds.maxStops),
    };
    const diversityCandidates = evaluateRouteCandidates(
      routeCandidates,
      requestedDuration,
      diversityStopBounds,
      maxCategoryRatio,
      'centroid_anchor',
      getMaxSegmentMeters(requestedDuration),
      theme,
      {
        categoryPenaltyMultiplier: maxCategoryRatio <= 0.6 ? 6.0 : 3.0,
        categoryBalanceWeight: 1,
      }
    );
    const diversified = diversityCandidates.sort(rankSelectionCandidates)[0];

    if (diversified && getRouteMaxCategoryShare(diversified.prefix) < getRouteMaxCategoryShare(selected.prefix)) {
      selected.prefix = diversified.prefix;
      selected.metrics = diversified.metrics;
      selected.durationGap = diversified.durationGap;
      selected.durationRangePenalty = diversified.durationRangePenalty;
      selected.importanceSum = diversified.importanceSum;
      selected.flagshipDeficit = diversified.flagshipDeficit;
      selected.historyAnchorDeficit = diversified.historyAnchorDeficit;
      selected.coverageScore = diversified.coverageScore;
      selected.historyExperienceScore = diversified.historyExperienceScore;
      selected.categoryBalancePenalty = diversified.categoryBalancePenalty;
      selected.plausibilityPenalty = diversified.plausibilityPenalty;
    }
  }

  const upperQualityBound = requestedDuration * 1.15;
  if (selected.metrics.estimatedTourMinutes > upperQualityBound || selected.metrics.hasOverMaxSegment) {
    const repairContext: RouteEvaluationContext = {
      requestedDuration,
      strategy: 'centroid_anchor',
      maxSegmentMeters: getMaxSegmentMeters(requestedDuration),
      requiredFlagships: getRequiredFlagshipCount(routeCandidates, requestedDuration),
      requiredHistoryAnchors: getRequiredHistoryAnchorCount(selected.prefix.length, requestedDuration, routeCandidates),
      requiredHistoryAnchorKeys: getRequiredHistoryAnchorKeys(
        routeCandidates,
        requestedDuration,
        getRequiredHistoryAnchorCount(selected.prefix.length, requestedDuration, routeCandidates)
      ),
      lowerBound: requestedDuration * 0.75,
      upperBound: upperQualityBound,
      maxCategoryRatio,
      categoryBalanceWeight: 1,
      theme,
    };
    const repaired = repairOverlongPrefix(routeCandidates, selected.prefix, repairContext, stopBounds.minStops);
    if (rankOverlongRepairCandidates(repaired, selected) < 0) {
      selected.prefix = repaired.prefix;
      selected.metrics = repaired.metrics;
      selected.durationGap = repaired.durationGap;
      selected.durationRangePenalty = repaired.durationRangePenalty;
      selected.importanceSum = repaired.importanceSum;
      selected.flagshipDeficit = repaired.flagshipDeficit;
      selected.historyAnchorDeficit = repaired.historyAnchorDeficit;
      selected.coverageScore = repaired.coverageScore;
      selected.historyExperienceScore = repaired.historyExperienceScore;
      selected.categoryBalancePenalty = repaired.categoryBalancePenalty;
      selected.plausibilityPenalty = repaired.plausibilityPenalty;
    }
  }

  const qualityLowerBound = requestedDuration * 0.9;

  if (selected.metrics.estimatedTourMinutes < qualityLowerBound && routeCandidates.length > selected.prefix.length) {
    const extensionContext: RouteEvaluationContext = {
      requestedDuration,
      strategy: 'centroid_anchor',
      maxSegmentMeters: getMaxSegmentMeters(requestedDuration, true),
      requiredFlagships: getRequiredFlagshipCount(routeCandidates, requestedDuration),
      requiredHistoryAnchors: getRequiredHistoryAnchorCount(selected.prefix.length, requestedDuration, routeCandidates),
      requiredHistoryAnchorKeys: getRequiredHistoryAnchorKeys(
        routeCandidates,
        requestedDuration,
        getRequiredHistoryAnchorCount(selected.prefix.length, requestedDuration, routeCandidates)
      ),
      lowerBound: qualityLowerBound,
      upperBound: requestedDuration * 1.15,
      maxCategoryRatio: Math.min(0.8, maxCategoryRatio + 0.1),
      categoryBalanceWeight: 1,
      theme,
    };
    const maxExtendedStops = getQualityExtensionMaxStops(requestedDuration, stopBounds, routeCandidates.length);

    while (selected.metrics.estimatedTourMinutes < qualityLowerBound && selected.prefix.length < maxExtendedStops) {
      const selectedKeys = new Set(selected.prefix.map((candidate) => getCandidateKey(candidate)));
      const additions = routeCandidates
        .filter((candidate) => !selectedKeys.has(getCandidateKey(candidate)))
        .map((candidate) => evaluatePrefix([...selected.prefix, candidate], extensionContext))
        .filter((evaluation) => !evaluation.metrics.hasOverMaxSegment)
        .sort((a, b) => {
          if (a.metrics.outOfIdealSegments !== b.metrics.outOfIdealSegments) {
            return a.metrics.outOfIdealSegments - b.metrics.outOfIdealSegments;
          }
          if (a.plausibilityPenalty !== b.plausibilityPenalty) {
            return a.plausibilityPenalty - b.plausibilityPenalty;
          }
          return rankSelectionCandidates(a, b);
        });
      const extended = additions[0];
      if (!extended) break;

      selected.prefix = extended.prefix;
      selected.metrics = extended.metrics;
      selected.durationGap = extended.durationGap;
      selected.durationRangePenalty = extended.durationRangePenalty;
      selected.importanceSum = extended.importanceSum;
      selected.flagshipDeficit = extended.flagshipDeficit;
      selected.historyAnchorDeficit = extended.historyAnchorDeficit;
      selected.coverageScore = extended.coverageScore;
      selected.historyExperienceScore = extended.historyExperienceScore;
      selected.categoryBalancePenalty = extended.categoryBalancePenalty;
      selected.plausibilityPenalty = extended.plausibilityPenalty;
    }
  }

  const calibratedEstimatedTourMinutes = selected.metrics.estimatedTourMinutes + (selected.prefix.length * 0.5);
  const coverageRatio = requestedDuration > 0
    ? calibratedEstimatedTourMinutes / requestedDuration
    : 1;
  const degraded = calibratedEstimatedTourMinutes < requestedDuration * 0.75;

  return {
    route: selected.prefix,
    diagnostics: {
      degraded,
      degradationReason: degraded ? 'duration_below_requested' : null,
      coverageRatio,
      estimatedTourMinutes: calibratedEstimatedTourMinutes,
      requestedDuration,
    },
  };
}
