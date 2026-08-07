import { Tour } from '../../domain/entities/Tour';
import { evaluateTourContentReadiness } from '../tourReadiness/contentReadiness';

export type QualityGateStatus = 'pass' | 'fail' | 'missing';

export interface QualityGateResult {
  status: QualityGateStatus;
  detail: string;
}

export interface TourQualityManualReview {
  routeContinuity: number;
  wholeTourStory: number;
  stopExperience: number;
  spokenNaturalness: number;
  factualQualification: number;
}

export interface TourQualityEvaluationInput {
  tour: Tour;
  expectedAnchorQids?: string[];
  offThemeQids?: string[];
  estimatedDurationMinutes?: number;
  manualReview?: TourQualityManualReview;
}

export interface TourQualityEvaluation {
  publishable: boolean;
  score: number | null;
  scoreReason: string | null;
  gates: Record<string, QualityGateResult>;
  metrics: {
    stopCount: number;
    duplicateWikidataCount: number;
    expectedAnchorCoverage: number | null;
    largestCategoryShare: number | null;
    durationRatio: number | null;
    averageNarrationWords: number;
    fallbackStopCount: number;
    claimCheckCoverage: number;
    verifiedClaimRate: number | null;
    criticalFailCount: number | null;
  };
  scoreBreakdown: Record<string, number> | null;
}

interface ClaimCheck {
  verifiedRate?: number;
  criticalFailCount?: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function numberSignal(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function claimChecksForTour(tour: Tour): ClaimCheck[] {
  return tour.places.flatMap((place) => {
    const meta = place.metadata?.narrationMeta;
    if (!meta || typeof meta !== 'object') return [];
    const claimCheck = meta.claimCheck;
    return claimCheck && typeof claimCheck === 'object' ? [claimCheck as ClaimCheck] : [];
  });
}

function openingKey(text: string): string {
  return text.toLocaleLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').split(/\s+/).slice(0, 6).join(' ');
}

export function evaluateTourQuality(input: TourQualityEvaluationInput): TourQualityEvaluation {
  const { tour } = input;
  const readiness = evaluateTourContentReadiness(tour.places);
  const fallbackStopCount = tour.places.filter((place, index) => {
    const sectionsFallbacked = place.metadata?.narrationMeta?.sectionsFallbacked;
    return readiness.stops[index]?.fallbackLike
      || (typeof sectionsFallbacked === 'number' && sectionsFallbacked > 0);
  }).length;
  const qids = tour.places
    .map((place) => place.metadata?.sourcePoi?.wikidata)
    .filter((qid): qid is string => Boolean(qid));
  const duplicateWikidataCount = qids.length - new Set(qids).size;
  const identityEvidenceCount = tour.places.filter((place) => {
    const source = place.metadata?.sourcePoi;
    return Boolean(source?.wikidata || (source?.osmType && source?.osmId !== undefined));
  }).length;

  const categories = tour.places
    .map((place) => place.metadata?.sourcePoi?.category)
    .filter((category): category is string => Boolean(category));
  const categoryCounts = new Map<string, number>();
  for (const category of categories) {
    categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
  }
  const largestCategoryShare = categories.length > 0
    ? Math.max(...categoryCounts.values()) / tour.places.length
    : null;

  const expectedAnchorCoverage = identityEvidenceCount === tour.places.length
    && input.expectedAnchorQids && input.expectedAnchorQids.length > 0
    ? input.expectedAnchorQids.filter((qid) => qids.includes(qid)).length / input.expectedAnchorQids.length
    : null;
  const offThemePresent = input.offThemeQids?.filter((qid) => qids.includes(qid)) ?? null;

  const confidenceRatio = numberSignal(tour.metadata?.confidence?.signals?.coverageRatio);
  const durationRatio = input.estimatedDurationMinutes !== undefined
    ? input.estimatedDurationMinutes / tour.durationMinutes
    : confidenceRatio;

  const claimChecks = claimChecksForTour(tour);
  const claimCheckCoverage = tour.places.length > 0 ? claimChecks.length / tour.places.length : 0;
  const criticalFailCount = claimChecks.length > 0
    ? claimChecks.reduce((sum, check) => sum + (check.criticalFailCount ?? 0), 0)
    : null;
  const verifiedRates = claimChecks
    .map((check) => check.verifiedRate)
    .filter((rate): rate is number => typeof rate === 'number');
  const verifiedClaimRate = verifiedRates.length > 0
    ? verifiedRates.reduce((sum, rate) => sum + rate, 0) / verifiedRates.length
    : null;

  const incompleteStops = tour.places.filter((place) => {
    const source = place.metadata?.sourcePoi;
    const hasSource = Boolean(source?.wikipedia || source?.wikidata || Object.keys(source?.osmTags ?? {}).length > 0);
    return !place.name.trim()
      || !place.description.trim()
      || !Number.isFinite(place.latitude)
      || !Number.isFinite(place.longitude)
      || (place.latitude === 0 && place.longitude === 0)
      || !hasSource;
  });

  const gates: Record<string, QualityGateResult> = {
    factualSafety: claimCheckCoverage < 1
      ? { status: 'missing', detail: `claimCheck present for ${claimChecks.length}/${tour.places.length} stops` }
      : criticalFailCount === 0
        ? { status: 'pass', detail: 'zero critical factual contradictions' }
        : { status: 'fail', detail: `${criticalFailCount} critical factual contradiction(s)` },
    routeIdentity: identityEvidenceCount < tour.places.length
      ? { status: 'missing', detail: `source identity present for ${identityEvidenceCount}/${tour.places.length} stops` }
      : duplicateWikidataCount === 0
      ? { status: 'pass', detail: 'no duplicate Wikidata identities' }
      : { status: 'fail', detail: `${duplicateWikidataCount} duplicate Wikidata identity/identities` },
    theme: offThemePresent === null || identityEvidenceCount < tour.places.length
      ? {
          status: 'missing',
          detail: offThemePresent === null
            ? 'no off-theme oracle supplied'
            : `source identity present for ${identityEvidenceCount}/${tour.places.length} stops`,
        }
      : offThemePresent.length === 0
        ? { status: 'pass', detail: 'no known off-theme POIs' }
        : { status: 'fail', detail: `off-theme POIs: ${offThemePresent.join(', ')}` },
    duration: durationRatio === null
      ? { status: 'missing', detail: 'no route duration evidence' }
      : durationRatio >= 0.85 && durationRatio <= 1.15
        ? { status: 'pass', detail: `${Math.round(durationRatio * 100)}% of requested duration` }
        : { status: 'fail', detail: `${Math.round(durationRatio * 100)}% of requested duration` },
    narration: tour.places.length === 0
      ? { status: 'fail', detail: 'tour has no stops' }
      : fallbackStopCount === 0 && readiness.shortStopCount === 0
        ? { status: 'pass', detail: 'all stop narrations are substantial and non-fallback' }
        : { status: 'fail', detail: `${fallbackStopCount} fallback, ${readiness.shortStopCount} short stop(s)` },
    completeness: tour.places.length === 0
      ? { status: 'fail', detail: 'tour has no stops' }
      : incompleteStops.length === 0
        ? { status: 'pass', detail: 'every stop has identity, coordinates, sources, and narration' }
        : { status: 'fail', detail: `${incompleteStops.length} incomplete stop(s)` },
  };

  const manual = input.manualReview;
  const hasScoreEvidence = Boolean(
    manual
    && expectedAnchorCoverage !== null
    && largestCategoryShare !== null
    && durationRatio !== null
    && verifiedClaimRate !== null
    && claimCheckCoverage === 1
  );

  let scoreBreakdown: Record<string, number> | null = null;
  let score: number | null = null;
  if (manual && hasScoreEvidence) {
    const repeatedOpenings = tour.places.length - new Set(tour.places.map((place) => openingKey(place.description))).size;
    const sourceCoverage = tour.places.filter((place) => {
      const source = place.metadata?.sourcePoi;
      return Boolean(source?.wikipedia || source?.wikidata);
    }).length / Math.max(1, tour.places.length);

    scoreBreakdown = {
      flagshipCoverage: 10 * expectedAnchorCoverage!,
      routeContinuity: clamp(manual.routeContinuity, 0, 5),
      categoryDiversity: largestCategoryShare! <= 0.6 ? 5 : 0,
      durationFit: durationRatio! >= 0.9 && durationRatio! <= 1.1 ? 5 : 0,
      wholeTourStory: clamp(manual.wholeTourStory, 0, 25),
      stopExperience: clamp(manual.stopExperience, 0, 25),
      spokenNaturalness: clamp(manual.spokenNaturalness, 0, 5),
      narrationSpecificity: readiness.ready ? 4 : 0,
      openingVariety: repeatedOpenings === 0 ? 3 : 0,
      narrationLength: readiness.shortStopCount === 0 ? 3 : 0,
      verifiedClaims: 5 * clamp(verifiedClaimRate!, 0, 1),
      factualQualification: clamp(manual.factualQualification, 0, 3),
      sourceAttribution: 2 * sourceCoverage,
    };
    score = Math.round(Object.values(scoreBreakdown).reduce((sum, value) => sum + value) * 10) / 10;
  }

  const allGatesPass = Object.values(gates).every((gate) => gate.status === 'pass');
  return {
    publishable: allGatesPass && score !== null && score >= 80,
    score,
    scoreReason: score === null ? 'manual review or required evidence is missing' : null,
    gates,
    metrics: {
      stopCount: tour.places.length,
      duplicateWikidataCount,
      expectedAnchorCoverage,
      largestCategoryShare,
      durationRatio,
      averageNarrationWords: readiness.averageWords,
      fallbackStopCount,
      claimCheckCoverage,
      verifiedClaimRate,
      criticalFailCount,
    },
    scoreBreakdown,
  };
}
