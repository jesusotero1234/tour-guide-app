import { CanonicalTourCoreV6 } from './EditorialCoreResolverV6';
import { RouteCandidate, RouteCoordinates } from './RouteSelection';

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

export interface EssentialRouteCandidateV8 extends RouteCandidate {
  wikidataId?: string;
  narrativeContribution?: number;
  evidenceScore?: number;
  role?: string;
}

export interface EssentialRouteSelectionResultV8<T extends EssentialRouteCandidateV8> {
  route: T[];
  requiredIds: string[];
  selectedRequiredIds: string[];
  missingRequiredIds: string[];
  optionalIds: string[];
  identityUnresolved: string[];
  coverage: {
    requiredCovered: boolean;
    requiredRatio: number;
    optionalCount: number;
  };
}

export interface EssentialRouteSelectionOptionsV8 {
  maxCategoryRatio?: number;
  requestedDuration?: number;
  categoryPenaltyMultiplier?: number;
  theme?: string;
}

export function requiredCanonicalIdsFromCoreV8(
  core: CanonicalTourCoreV6 | null
): string[] {
  if (!core || core.status !== 'approved') return [];
  return core.requirements.map((requirement) => requirement.canonicalId).sort();
}

function getCoordinates(place: EssentialRouteCandidateV8): RouteCoordinates | null {
  const lat = place.coordinates?.lat ?? place.latitude;
  const lng = place.coordinates?.lng ?? place.longitude;
  if (typeof lat !== 'number' || typeof lng !== 'number' || Number.isNaN(lat) || Number.isNaN(lng)) {
    return null;
  }
  return { lat, lng };
}

function wikidataIdOf(place: EssentialRouteCandidateV8): string | null {
  const wikidataId = typeof place.wikidataId === 'string' ? place.wikidataId.trim() : '';
  return /^Q\d+$/u.test(wikidataId) ? wikidataId : null;
}

function getCategory(place: EssentialRouteCandidateV8): string {
  return place.category || 'other';
}

function getLandmarkTier(place: EssentialRouteCandidateV8): string {
  return typeof place.landmarkTier === 'string' ? place.landmarkTier : 'filler';
}

function getImportanceScore(place: EssentialRouteCandidateV8): number {
  return place.importanceScore ?? place.importance_score ?? 0;
}

function getFameScore(place: EssentialRouteCandidateV8): number {
  return typeof place.fameScore === 'number' ? place.fameScore : 0;
}

function narrativeContribution(place: EssentialRouteCandidateV8): number {
  return typeof place.narrativeContribution === 'number'
    ? place.narrativeContribution
    : 0;
}

function evidenceScore(place: EssentialRouteCandidateV8): number {
  return typeof place.evidenceScore === 'number' ? place.evidenceScore : 0;
}

function nearestRequiredDistanceMeters(
  place: EssentialRouteCandidateV8,
  required: EssentialRouteCandidateV8[]
): number {
  const coordinate = getCoordinates(place);
  if (!coordinate || required.length === 0) return 0;
  let nearest = Number.POSITIVE_INFINITY;
  for (const anchor of required) {
    const anchorCoordinate = getCoordinates(anchor);
    if (!anchorCoordinate) continue;
    nearest = Math.min(nearest, haversineMeters(coordinate, anchorCoordinate));
  }
  return Number.isFinite(nearest) ? nearest : 0;
}

function optionalScore(
  place: EssentialRouteCandidateV8,
  required: EssentialRouteCandidateV8[],
  categoryCounts: Map<string, number>,
  selectedCount: number,
  maxCategoryRatio: number,
  penaltyMultiplier: number
): number {
  const category = getCategory(place);
  const projectedRatio = selectedCount > 0
    ? ((categoryCounts.get(category) ?? 0) + 1) / (selectedCount + 1)
    : 0;
  const overuse = Math.max(0, projectedRatio - maxCategoryRatio);
  const distanceToRequired = nearestRequiredDistanceMeters(place, required);
  const tier = getLandmarkTier(place);
  const tierBoost = tier === 'flagship' ? 2 : tier === 'major' ? 1 : 0;
  const proximityFactor = required.length > 0 ? Math.max(0, 1 - distanceToRequired / 4000) : 0.5;
  return (narrativeContribution(place) * 3)
    + (evidenceScore(place) * 1.5)
    + (getFameScore(place) / 10)
    + (getImportanceScore(place) / 10)
    + tierBoost
    + proximityFactor
    - (overuse * penaltyMultiplier);
}

export function selectEssentialRouteV8<T extends EssentialRouteCandidateV8>(
  candidates: T[],
  requiredCanonicalIds: string[],
  stopCount: number,
  options: EssentialRouteSelectionOptionsV8 = {}
): EssentialRouteSelectionResultV8<T> {
  const maxCategoryRatio = options.maxCategoryRatio ?? 0.7;
  const categoryPenaltyMultiplier = options.categoryPenaltyMultiplier ?? 2.0;
  const requiredSet = new Set(requiredCanonicalIds);
  const identityUnresolved = candidates
    .filter((place) => wikidataIdOf(place) === null)
    .map((place) => place.name || String(place.wikidataId ?? ''));
  const required = candidates.filter((place) => {
    const wikidataId = wikidataIdOf(place);
    return wikidataId !== null && requiredSet.has(wikidataId);
  });
  const requiredById = new Set(required.map((place) => wikidataIdOf(place) as string));
  const missingRequiredIds = [...requiredSet].filter((id) => !requiredById.has(id)).sort();
  const optional = candidates.filter((place) => {
    const wikidataId = wikidataIdOf(place);
    return wikidataId !== null && !requiredById.has(wikidataId);
  });

  const selected: T[] = [...required];
  const categoryCounts = new Map<string, number>();
  for (const place of selected) {
    const category = getCategory(place);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }

  while (selected.length < stopCount && optional.length > 0) {
    const scored = optional.map((place) => ({
      place,
      score: optionalScore(
        place,
        required,
        categoryCounts,
        selected.length,
        maxCategoryRatio,
        categoryPenaltyMultiplier
      ),
    })).sort((left, right) => (
      right.score - left.score
        || right.place.fameScore! - left.place.fameScore!
        || (wikidataIdOf(left.place) ?? '').localeCompare(wikidataIdOf(right.place) ?? '')
    ));
    const best = scored[0];
    selected.push(best.place);
    const category = getCategory(best.place);
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    const pickedIndex = optional.indexOf(best.place);
    optional.splice(pickedIndex, 1);
  }

  const selectedRequiredIds = selected
    .map((place) => wikidataIdOf(place))
    .filter((id): id is string => id !== null && requiredById.has(id))
    .sort();
  const optionalIds = selected
    .map((place) => wikidataIdOf(place))
    .filter((id): id is string => id !== null && !requiredById.has(id))
    .sort();

  return {
    route: selected.map((place, index) => ({ ...place, position: index } as T)),
    requiredIds: [...requiredSet].sort(),
    selectedRequiredIds,
    missingRequiredIds,
    optionalIds,
    identityUnresolved,
    coverage: {
      requiredCovered: missingRequiredIds.length === 0,
      requiredRatio: requiredSet.size > 0
        ? selectedRequiredIds.length / requiredSet.size
        : 1,
      optionalCount: optionalIds.length,
    },
  };
}
