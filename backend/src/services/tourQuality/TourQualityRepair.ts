import {
  RouteCandidate,
  StopBounds,
  buildDiversePrefix,
  estimateRouteMetrics,
  orderRouteCandidates,
} from '../poi/RouteSelection';
import { ComputeTourConfidenceInput, computeTourConfidence } from './TourConfidenceGate';
import { TourConfidence, TourQualityRepairMetadata } from '../../types/tourQuality';

export type TourQualityRepairMode = 'off' | 'shadow' | 'enforce';
export type TourQualityRepairStrategy = 'category_diversity_recompose';

export interface RepairableTourPlace {
  coordinates?: { lat: number; lng: number };
  latitude?: number;
  longitude?: number;
  importance_score?: number;
  importanceScore?: number;
  category?: string;
  landmarkTier?: string;
  poi?: {
    tags?: {
      wikidata?: string;
    };
  };
}

export interface TourQualityRepairInput<T extends RepairableTourPlace> {
  candidates: T[];
  selectedRoute: T[];
  confidence: TourConfidence;
  confidenceInput: ComputeTourConfidenceInput;
  requestedDuration: number;
  theme: string;
  stopBounds: StopBounds;
}

export interface TourQualityRepairResult<T extends RepairableTourPlace> {
  attempted: boolean;
  applied: boolean;
  strategy?: TourQualityRepairStrategy;
  route: T[];
  finalConfidence: TourConfidence;
  metadata: TourQualityRepairMetadata;
}

function getCategory(place: RepairableTourPlace): string {
  return place.category || 'other';
}

function getWikidataId(place: RepairableTourPlace): string | null {
  return typeof place.poi?.tags?.wikidata === 'string' && place.poi.tags.wikidata.length > 0
    ? place.poi.tags.wikidata
    : null;
}

function getLandmarkTier(place: RepairableTourPlace): string {
  return typeof place.landmarkTier === 'string' ? place.landmarkTier : 'filler';
}

function getImportanceScore(place: RepairableTourPlace): number {
  return place.importanceScore ?? place.importance_score ?? 0;
}

function getMaxSegmentMeters(requestedDuration: number): number {
  if (requestedDuration >= 240) return 1800;
  if (requestedDuration >= 180) return 1600;
  if (requestedDuration >= 120) return 1400;
  return 1200;
}

function buildRouteConfidenceInput<T extends RepairableTourPlace>(
  inputSignals: ComputeTourConfidenceInput['input'],
  route: T[],
  requestedDuration: number,
): ComputeTourConfidenceInput {
  const diagnostics = estimateRouteMetrics(route as unknown as RouteCandidate[], getMaxSegmentMeters(requestedDuration));
  const categoryCounts = route.reduce<Map<string, number>>((counts, place) => {
    const category = getCategory(place);
    counts.set(category, (counts.get(category) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const wikidataIds = route
    .map((place) => getWikidataId(place))
    .filter((wikidataId): wikidataId is string => Boolean(wikidataId));
  const coverageRatio = requestedDuration > 0 ? diagnostics.estimatedTourMinutes / requestedDuration : 1;
  const lowerBound = requestedDuration * 0.75;

  return {
    input: inputSignals,
    output: {
      shortlistSize: Math.max(route.length, 5),
      routeDuplicateWikidataCount: wikidataIds.length - new Set(wikidataIds).size,
      routeMaxCategoryShare: route.length > 0 ? Math.max(...Array.from(categoryCounts.values())) / route.length : 1,
      routeFlagshipCount: route.filter((place) => getLandmarkTier(place) === 'flagship').length,
      degraded: diagnostics.estimatedTourMinutes < lowerBound,
      coverageRatio,
      stopCount: route.length,
    },
  };
}

function buildRepairMetadata(
  before: TourConfidence,
  after: TourConfidence,
  attempted: boolean,
  applied: boolean,
  strategy?: TourQualityRepairStrategy,
): TourQualityRepairMetadata {
  return {
    attempted,
    applied,
    strategy,
    beforeScore: before.score,
    afterScore: after.score,
    beforeReasons: before.reasons,
    afterReasons: after.reasons,
  };
}

export function getTourQualityRepairMode(
  configuredMode = process.env.TOUR_QUALITY_REPAIR_MODE,
): TourQualityRepairMode {
  if (configuredMode === 'off' || configuredMode === 'shadow' || configuredMode === 'enforce') {
    return configuredMode;
  }

  return 'off';
}

export function attemptTourQualityRepair<T extends RepairableTourPlace>(
  input: TourQualityRepairInput<T>,
): TourQualityRepairResult<T> {
  const {
    candidates,
    selectedRoute,
    confidence,
    confidenceInput,
    requestedDuration,
  } = input;

  if (confidence.stage !== 'output' || !confidence.reasons.includes('category_collapse')) {
    return {
      attempted: false,
      applied: false,
      route: selectedRoute,
      finalConfidence: confidence,
      metadata: buildRepairMetadata(confidence, confidence, false, false),
    };
  }

  const categoryCounts = selectedRoute.reduce<Map<string, number>>((counts, place) => {
    const category = getCategory(place);
    counts.set(category, (counts.get(category) ?? 0) + 1);
    return counts;
  }, new Map<string, number>());
  const dominantCategoryEntry = Array.from(categoryCounts.entries()).sort((a, b) => b[1] - a[1])[0];
  const dominantCategory = dominantCategoryEntry?.[0];
  const dominantShare = selectedRoute.length > 0 && dominantCategoryEntry
    ? dominantCategoryEntry[1] / selectedRoute.length
    : 1;
  const strictMaxCategoryRatio = Math.max(0.4, Math.min(0.55, dominantShare - 0.15));
  const requiredFlagships = selectedRoute.filter((place) => getLandmarkTier(place) === 'flagship').length;

  const reorderedCandidates = [...candidates].sort((a, b) => {
    const aDominant = getCategory(a) === dominantCategory ? 1 : 0;
    const bDominant = getCategory(b) === dominantCategory ? 1 : 0;
    if (aDominant !== bDominant) {
      return aDominant - bDominant;
    }

    return getImportanceScore(b) - getImportanceScore(a);
  });

  const recomposed = buildDiversePrefix(reorderedCandidates as unknown as RouteCandidate[], selectedRoute.length, strictMaxCategoryRatio, {
    requestedDuration,
    requiredFlagships,
  } as any) as unknown as T[];
  const repairedRoute = orderRouteCandidates(recomposed as unknown as RouteCandidate[]) as unknown as T[];
  const repairedConfidenceInput = buildRouteConfidenceInput(confidenceInput.input, repairedRoute, requestedDuration);
  const repairedConfidence = computeTourConfidence(repairedConfidenceInput);
  const applied = repairedConfidence.passed
    && repairedConfidence.score > confidence.score
    && !repairedConfidence.reasons.includes('category_collapse')
    && !repairedConfidence.reasons.includes('duplicate_landmarks')
    && !repairedConfidence.reasons.includes('route_degraded');

  return {
    attempted: true,
    applied,
    strategy: 'category_diversity_recompose',
    route: applied ? repairedRoute : selectedRoute,
    finalConfidence: repairedConfidence,
    metadata: buildRepairMetadata(
      confidence,
      repairedConfidence,
      true,
      applied,
      'category_diversity_recompose',
    ),
  };
}
