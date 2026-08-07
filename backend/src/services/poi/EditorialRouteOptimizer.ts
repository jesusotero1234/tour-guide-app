import { EditorialCandidate, NarrativeRole } from './EditorialCandidate';
import { CandidateEditorialAssessment, TourEditorialBrief } from './EditorialRouteBrief';

export interface EditorialRouteMetrics {
  walkingMeters: number;
  walkingMinutes: number;
  estimatedTourMinutes: number;
  maxSegmentMeters: number;
  overMaxSegments: number;
}

export interface EditorialRouteScores {
  curatorEssentialCoverage: number;
  arcCoverage: number;
  paidValue: number;
  arcOrder: number;
  evidence: number;
  coherence: number;
  walkability: number;
  diversity: number;
  quality: number;
}

export interface EditorialRouteFinalist {
  candidateIds: string[];
  stopNames: string[];
  metrics: EditorialRouteMetrics;
  scores: EditorialRouteScores;
  paretoOptimal: boolean;
}

export interface EditorialRouteOptimizationResult {
  status: 'selected' | 'duration_extension_required' | 'no_route';
  route: EditorialCandidate[];
  finalists: EditorialRouteFinalist[];
  discardSummary: Record<string, number>;
  requestedDuration: number;
  durationCeiling: number | null;
  recommendedDuration: number | null;
}

export interface EditorialRouteOptimizerOptions {
  minStops?: number;
  maxStops?: number;
  shortlistSize?: number;
  beamWidth?: number;
  maxSegmentMeters?: number;
  maxDurationExtensionMinutes?: number;
}

interface CuratedCandidate {
  candidate: EditorialCandidate;
  assessment: CandidateEditorialAssessment;
  roleBit: number;
  essentialBit: number;
  clusterBit: number;
}

interface BeamState {
  selectedIndexes: number[];
  selectedMask: number;
  selectedClusterMask: number;
  essentialMask: number;
  roleMask: number;
  walkingMeters: number;
  paidValueSum: number;
  evidenceSum: number;
}

interface EvaluatedRoute {
  route: CuratedCandidate[];
  metrics: EditorialRouteMetrics;
  scores: EditorialRouteScores;
  signature: string;
}

interface SearchResult {
  evaluatedRoutes: EvaluatedRoute[];
  discardSummary: Record<string, number>;
}

function clampScore(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

function segmentMeters(left: EditorialCandidate, right: EditorialCandidate): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusMeters = 6371000;
  const deltaLat = toRad(right.coordinates.lat - left.coordinates.lat);
  const deltaLng = toRad(right.coordinates.lng - left.coordinates.lng);
  const lat1 = toRad(left.coordinates.lat);
  const lat2 = toRad(right.coordinates.lat);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h)) * 1.3;
}

function getMaxSegmentMeters(requestedDuration: number): number {
  if (requestedDuration <= 120) return 1400;
  if (requestedDuration <= 180) return 1600;
  return 1800;
}

export function estimateEditorialRouteMetrics(
  route: EditorialCandidate[],
  maxSegmentMeters: number
): EditorialRouteMetrics {
  let walkingMeters = 0;
  let longestSegment = 0;
  let overMaxSegments = 0;

  for (let index = 1; index < route.length; index += 1) {
    const distance = segmentMeters(route[index - 1], route[index]);
    walkingMeters += distance;
    longestSegment = Math.max(longestSegment, distance);
    if (distance > maxSegmentMeters) overMaxSegments += 1;
  }

  const walkingMinutes = (walkingMeters / 1000 / 4.2) * 60;
  return {
    walkingMeters,
    walkingMinutes,
    estimatedTourMinutes: walkingMinutes + (route.length * 7) + Math.max(5, route.length * 2),
    maxSegmentMeters: longestSegment,
    overMaxSegments,
  };
}

function countBits(value: number): number {
  let remaining = value;
  let count = 0;
  while (remaining !== 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function routeSignature(route: CuratedCandidate[]): string {
  return route.map(({ candidate }) => candidate.canonicalId).join('>');
}

function arcOrderScore(route: CuratedCandidate[], arc: NarrativeRole[]): number {
  if (arc.length <= 1) return 100;
  const firstPositions = arc.map((role) => route.findIndex(({ assessment }) => (
    assessment.recommendedRole === role
  )));
  let orderedPairs = 0;
  for (let index = 1; index < firstPositions.length; index += 1) {
    if (firstPositions[index - 1] < firstPositions[index]) orderedPairs += 1;
  }
  return clampScore((orderedPairs / (arc.length - 1)) * 100);
}

function scoreRoute(
  route: CuratedCandidate[],
  metrics: EditorialRouteMetrics,
  essentialIds: Set<string>,
  arc: NarrativeRole[],
  maxSegmentMeters: number
): EditorialRouteScores {
  const routeCandidates = route.map(({ candidate }) => candidate);
  const selectedIds = new Set(routeCandidates.map((candidate) => candidate.canonicalId));
  const essentialCount = Array.from(essentialIds).filter((id) => selectedIds.has(id)).length;
  const coveredRoles = new Set(route
    .map(({ assessment }) => assessment.recommendedRole)
    .filter((role): role is NarrativeRole => role !== null));
  const paidValue = route.reduce((sum, { assessment }) => sum + assessment.paidValueScore, 0) / route.length;
  const evidence = route.reduce((sum, { candidate }) => sum + candidate.evidenceScore, 0) / route.length;
  const coherence = route.length <= 1
    ? 100
    : route.slice(1).reduce((sum, { candidate }, index) => {
      const distance = segmentMeters(route[index].candidate, candidate);
      const legScore = distance < 150
        ? 65 + ((distance / 150) * 20)
        : 100 - (Math.abs(distance - 500) / 18);
      return sum + clampScore(legScore);
    }, 0) / (route.length - 1);
  const walkingCapacity = Math.max(1, maxSegmentMeters * Math.max(1, route.length - 1));
  const walkability = clampScore(100 - ((metrics.walkingMeters / walkingCapacity) * 70));
  const diversity = clampScore((new Set(routeCandidates.map((candidate) => candidate.category)).size / route.length) * 100);
  const arcOrder = arcOrderScore(route, arc);
  const quality = clampScore(
    (paidValue * 0.35)
      + (arcOrder * 0.2)
      + (evidence * 0.15)
      + (coherence * 0.15)
      + (walkability * 0.1)
      + (diversity * 0.05)
  );

  return {
    curatorEssentialCoverage: essentialIds.size > 0
      ? Number((essentialCount / essentialIds.size).toFixed(3))
      : 1,
    arcCoverage: Number((arc.filter((role) => coveredRoles.has(role)).length / arc.length).toFixed(3)),
    paidValue: Number(paidValue.toFixed(2)),
    arcOrder,
    evidence: Number(evidence.toFixed(2)),
    coherence: Number(coherence.toFixed(2)),
    walkability,
    diversity,
    quality,
  };
}

function compareStates(left: BeamState, right: BeamState): number {
  const essentialDifference = countBits(right.essentialMask) - countBits(left.essentialMask);
  if (essentialDifference !== 0) return essentialDifference;
  if (right.paidValueSum !== left.paidValueSum) return right.paidValueSum - left.paidValueSum;
  const roleDifference = countBits(right.roleMask) - countBits(left.roleMask);
  if (roleDifference !== 0) return roleDifference;
  if (right.evidenceSum !== left.evidenceSum) return right.evidenceSum - left.evidenceSum;
  return left.walkingMeters - right.walkingMeters;
}

function compareRoutes(left: EvaluatedRoute, right: EvaluatedRoute): number {
  if (right.scores.curatorEssentialCoverage !== left.scores.curatorEssentialCoverage) {
    return right.scores.curatorEssentialCoverage - left.scores.curatorEssentialCoverage;
  }
  if (right.scores.paidValue !== left.scores.paidValue) return right.scores.paidValue - left.scores.paidValue;
  if (right.scores.arcOrder !== left.scores.arcOrder) return right.scores.arcOrder - left.scores.arcOrder;
  if (right.scores.evidence !== left.scores.evidence) return right.scores.evidence - left.scores.evidence;
  if (right.scores.coherence !== left.scores.coherence) return right.scores.coherence - left.scores.coherence;
  if (left.metrics.walkingMeters !== right.metrics.walkingMeters) return left.metrics.walkingMeters - right.metrics.walkingMeters;
  return left.route.length - right.route.length;
}

function dominates(left: EvaluatedRoute, right: EvaluatedRoute): boolean {
  const noWorse = left.scores.curatorEssentialCoverage >= right.scores.curatorEssentialCoverage
    && left.scores.paidValue >= right.scores.paidValue
    && left.scores.arcOrder >= right.scores.arcOrder
    && left.scores.evidence >= right.scores.evidence
    && left.scores.coherence >= right.scores.coherence
    && left.metrics.walkingMeters <= right.metrics.walkingMeters
    && left.route.length <= right.route.length;
  const strictlyBetter = left.scores.curatorEssentialCoverage > right.scores.curatorEssentialCoverage
    || left.scores.paidValue > right.scores.paidValue
    || left.scores.arcOrder > right.scores.arcOrder
    || left.scores.evidence > right.scores.evidence
    || left.scores.coherence > right.scores.coherence
    || left.metrics.walkingMeters < right.metrics.walkingMeters
    || left.route.length < right.route.length;
  return noWorse && strictlyBetter;
}

function twoOpt(
  route: CuratedCandidate[],
  maxSegmentMeters: number,
  arc: NarrativeRole[]
): CuratedCandidate[] {
  let best = [...route];
  let bestMetrics = estimateEditorialRouteMetrics(best.map(({ candidate }) => candidate), maxSegmentMeters);
  let bestArcOrder = arcOrderScore(best, arc);
  let improved = true;

  while (improved) {
    improved = false;
    for (let start = 0; start < best.length - 1; start += 1) {
      for (let end = start + 1; end < best.length; end += 1) {
        const candidateRoute = [
          ...best.slice(0, start),
          ...best.slice(start, end + 1).reverse(),
          ...best.slice(end + 1),
        ];
        const metrics = estimateEditorialRouteMetrics(
          candidateRoute.map(({ candidate }) => candidate),
          maxSegmentMeters
        );
        const candidateArcOrder = arcOrderScore(candidateRoute, arc);
        if (metrics.overMaxSegments === 0
          && candidateArcOrder >= bestArcOrder
          && metrics.walkingMeters + 0.01 < bestMetrics.walkingMeters) {
          best = candidateRoute;
          bestMetrics = metrics;
          bestArcOrder = candidateArcOrder;
          improved = true;
        }
      }
    }
  }

  return best;
}

function prepareShortlist(
  candidates: EditorialCandidate[],
  brief: TourEditorialBrief,
  shortlistSize: number,
  discardSummary: Record<string, number>
): { shortlist: CuratedCandidate[]; fullEssentialMask: number; fullRoleMask: number; essentialIds: Set<string> } {
  const candidateById = new Map(candidates.map((candidate) => [candidate.canonicalId, candidate]));
  const roleIndexes = new Map(brief.arc.map((role, index) => [role, index]));
  const clusterIndexes = new Map<string, number>();
  const nonRejected = brief.candidateAssessments.filter((assessment) => assessment.inclusion !== 'reject');
  discardSummary.curator_reject = brief.candidateAssessments.length - nonRejected.length;
  const valid = nonRejected.filter((assessment) => {
    const candidate = candidateById.get(assessment.canonicalId);
    const evidenceValid = candidate
      && candidate.evidenceFacts.length >= 4
      && candidate.evidenceFacts.some((fact) => fact.observable);
    if (!evidenceValid) discardSummary.insufficient_evidence += 1;
    return evidenceValid;
  }).slice(0, shortlistSize);
  const essentialIds = new Set(nonRejected
    .filter((assessment) => assessment.inclusion === 'essential')
    .map((assessment) => assessment.canonicalId));

  const shortlist = valid.map((assessment, index): CuratedCandidate => {
    const candidate = candidateById.get(assessment.canonicalId) as EditorialCandidate;
    let clusterIndex = clusterIndexes.get(candidate.clusterId);
    if (clusterIndex === undefined) {
      clusterIndex = clusterIndexes.size;
      clusterIndexes.set(candidate.clusterId, clusterIndex);
    }
    const roleIndex = assessment.recommendedRole === null
      ? undefined
      : roleIndexes.get(assessment.recommendedRole);
    return {
      candidate,
      assessment,
      roleBit: roleIndex === undefined ? 0 : 1 << roleIndex,
      essentialBit: assessment.inclusion === 'essential' ? 1 << index : 0,
      clusterBit: 1 << clusterIndex,
    };
  });
  const fullEssentialMask = shortlist.reduce((mask, item) => mask | item.essentialBit, 0);

  return {
    shortlist,
    fullEssentialMask,
    fullRoleMask: (1 << brief.arc.length) - 1,
    essentialIds,
  };
}

function searchAtDuration(
  candidates: EditorialCandidate[],
  brief: TourEditorialBrief,
  durationCeiling: number,
  options: Required<Pick<EditorialRouteOptimizerOptions, 'minStops' | 'maxStops' | 'shortlistSize' | 'beamWidth'>>,
  maxSegmentMeters: number
): SearchResult {
  const discardSummary: Record<string, number> = {
    curator_reject: 0,
    insufficient_evidence: 0,
    duplicate_cluster: 0,
    segment_too_long: 0,
    cannot_complete_essentials: 0,
    cannot_complete_arc: 0,
    dominated: 0,
    outside_duration: 0,
  };
  const { shortlist, fullEssentialMask, fullRoleMask, essentialIds } = prepareShortlist(
    candidates,
    brief,
    options.shortlistSize,
    discardSummary
  );
  const essentialCandidatesPresent = Array.from(essentialIds).every((id) => (
    shortlist.some(({ candidate }) => candidate.canonicalId === id)
  ));
  if (shortlist.length < options.minStops
    || essentialIds.size > options.maxStops
    || shortlist.length > 30
    || !essentialCandidatesPresent) {
    return { evaluatedRoutes: [], discardSummary };
  }

  let beam: BeamState[] = shortlist.map((item, index) => ({
    selectedIndexes: [index],
    selectedMask: 1 << index,
    selectedClusterMask: item.clusterBit,
    essentialMask: item.essentialBit,
    roleMask: item.roleBit,
    walkingMeters: 0,
    paidValueSum: item.assessment.paidValueScore,
    evidenceSum: item.candidate.evidenceScore,
  }));
  const completeStates: BeamState[] = [];

  for (let depth = 1; depth <= options.maxStops; depth += 1) {
    for (const state of beam) {
      if (state.selectedIndexes.length < options.minStops
        || state.essentialMask !== fullEssentialMask
        || state.roleMask !== fullRoleMask) continue;
      const route = twoOpt(state.selectedIndexes.map((index) => shortlist[index]), maxSegmentMeters, brief.arc);
      const metrics = estimateEditorialRouteMetrics(route.map(({ candidate }) => candidate), maxSegmentMeters);
      if (metrics.estimatedTourMinutes <= durationCeiling) completeStates.push(state);
      else discardSummary.outside_duration += 1;
    }

    if (depth === options.maxStops) break;
    const expanded: BeamState[] = [];
    for (const state of beam) {
      const remainingSlots = options.maxStops - state.selectedIndexes.length;
      if (countBits(fullEssentialMask & ~state.essentialMask) > remainingSlots) {
        discardSummary.cannot_complete_essentials += 1;
        continue;
      }
      if (countBits(fullRoleMask & ~state.roleMask) > remainingSlots) {
        discardSummary.cannot_complete_arc += 1;
        continue;
      }

      const lastIndex = state.selectedIndexes[state.selectedIndexes.length - 1];
      for (let nextIndex = 0; nextIndex < shortlist.length; nextIndex += 1) {
        if ((state.selectedMask & (1 << nextIndex)) !== 0) continue;
        const next = shortlist[nextIndex];
        if ((state.selectedClusterMask & next.clusterBit) !== 0) {
          discardSummary.duplicate_cluster += 1;
          continue;
        }
        const legMeters = segmentMeters(shortlist[lastIndex].candidate, next.candidate);
        if (legMeters > maxSegmentMeters) {
          discardSummary.segment_too_long += 1;
          continue;
        }
        expanded.push({
          selectedIndexes: [...state.selectedIndexes, nextIndex],
          selectedMask: state.selectedMask | (1 << nextIndex),
          selectedClusterMask: state.selectedClusterMask | next.clusterBit,
          essentialMask: state.essentialMask | next.essentialBit,
          roleMask: state.roleMask | next.roleBit,
          walkingMeters: state.walkingMeters + legMeters,
          paidValueSum: state.paidValueSum + next.assessment.paidValueScore,
          evidenceSum: state.evidenceSum + next.candidate.evidenceScore,
        });
      }
    }

    const grouped = new Map<string, BeamState>();
    for (const state of expanded) {
      const lastIndex = state.selectedIndexes[state.selectedIndexes.length - 1];
      const durationBucket = Math.floor(state.walkingMeters / 350);
      const key = `${lastIndex}|${state.essentialMask}|${state.roleMask}|${durationBucket}`;
      const current = grouped.get(key);
      if (!current || compareStates(state, current) < 0) {
        if (current) discardSummary.dominated += 1;
        grouped.set(key, state);
      } else {
        discardSummary.dominated += 1;
      }
    }
    beam = Array.from(grouped.values()).sort(compareStates).slice(0, options.beamWidth);
  }

  const uniqueRoutes = new Map<string, EvaluatedRoute>();
  for (const state of completeStates) {
    const route = twoOpt(state.selectedIndexes.map((index) => shortlist[index]), maxSegmentMeters, brief.arc);
    const metrics = estimateEditorialRouteMetrics(route.map(({ candidate }) => candidate), maxSegmentMeters);
    if (metrics.estimatedTourMinutes > durationCeiling) {
      discardSummary.outside_duration += 1;
      continue;
    }
    const evaluated: EvaluatedRoute = {
      route,
      metrics,
      scores: scoreRoute(route, metrics, essentialIds, brief.arc, maxSegmentMeters),
      signature: routeSignature(route),
    };
    const current = uniqueRoutes.get(evaluated.signature);
    if (!current || compareRoutes(evaluated, current) < 0) uniqueRoutes.set(evaluated.signature, evaluated);
  }

  return {
    evaluatedRoutes: Array.from(uniqueRoutes.values()).sort(compareRoutes),
    discardSummary,
  };
}

export function optimizeEditorialRoute(
  candidates: EditorialCandidate[],
  brief: TourEditorialBrief,
  requestedDuration: number,
  options: EditorialRouteOptimizerOptions = {}
): EditorialRouteOptimizationResult {
  const searchOptions = {
    minStops: options.minStops ?? 5,
    maxStops: options.maxStops ?? 8,
    shortlistSize: Math.min(options.shortlistSize ?? 18, 18),
    beamWidth: options.beamWidth ?? 250,
  };
  const maxSegmentMeters = options.maxSegmentMeters ?? getMaxSegmentMeters(requestedDuration);
  const maxExtension = options.maxDurationExtensionMinutes ?? 60;
  const lastCeiling = Math.min(requestedDuration * 1.5, requestedDuration + maxExtension);
  let finalSearch: SearchResult | null = null;
  let selectedCeiling: number | null = null;

  for (let durationCeiling = requestedDuration;
    durationCeiling <= lastCeiling;
    durationCeiling += 15) {
    const search = searchAtDuration(
      candidates,
      brief,
      durationCeiling,
      searchOptions,
      maxSegmentMeters
    );
    finalSearch = search;
    if (search.evaluatedRoutes.length > 0) {
      selectedCeiling = durationCeiling;
      break;
    }
  }

  if (!finalSearch || selectedCeiling === null || finalSearch.evaluatedRoutes.length === 0) {
    return {
      status: 'no_route',
      route: [],
      finalists: [],
      discardSummary: finalSearch?.discardSummary ?? {},
      requestedDuration,
      durationCeiling: null,
      recommendedDuration: null,
    };
  }

  const evaluatedRoutes = finalSearch.evaluatedRoutes;
  const paretoSignatures = new Set(evaluatedRoutes
    .filter((route, index) => !evaluatedRoutes.some((other, otherIndex) => (
      otherIndex !== index && dominates(other, route)
    )))
    .map((route) => route.signature));
  const finalists = evaluatedRoutes.slice(0, 5).map((route) => ({
    candidateIds: route.route.map(({ candidate }) => candidate.canonicalId),
    stopNames: route.route.map(({ candidate }) => candidate.localName),
    metrics: route.metrics,
    scores: route.scores,
    paretoOptimal: paretoSignatures.has(route.signature),
  }));

  return {
    status: selectedCeiling === requestedDuration ? 'selected' : 'duration_extension_required',
    route: evaluatedRoutes[0].route.map(({ candidate }) => candidate),
    finalists,
    discardSummary: finalSearch.discardSummary,
    requestedDuration,
    durationCeiling: selectedCeiling,
    recommendedDuration: selectedCeiling === requestedDuration ? null : selectedCeiling,
  };
}
