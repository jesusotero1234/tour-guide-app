import { editorialDistanceMetersV4, EditorialEntityCandidateV4 } from './EditorialEntityV4';
import {
  CandidateAssessmentV4,
  EditorialStoryMapV4,
  EraBucketV4,
} from './EditorialStoryMapV4';
import { WalkingMatrixSnapshotV4, walkingLegV4 } from './EditorialWalkingMatrixV4';

export interface CuratedCandidateV4 {
  slot: string;
  entity: EditorialEntityCandidateV4;
  assessment: CandidateAssessmentV4;
}

export interface EditorialRouteMetricsV4 {
  walkingMeters: number;
  walkingMinutes: number;
  dwellMinutes: number;
  estimatedTourMinutes: number;
  maxSegmentMeters: number;
  maxSegmentMinutes: number;
}

export interface EditorialRouteScoresV4 {
  beatCoverage: number;
  beatStrength: number;
  priorityCoverage: number;
  curatorPriorityCoverage: number;
  recognitionCoverage: number;
  salienceTotal: number;
  observableFloor: number;
  observableAverage: number;
  eraCount: number;
  boundaryFit: number;
}

export interface EditorialBeatAssignmentV4 {
  beatId: string;
  candidateSlot: string;
  strength: number;
}

export interface EditorialRouteFinalistV4 {
  slot: string;
  candidateSlots: string[];
  entities: EditorialEntityCandidateV4[];
  assignments: EditorialBeatAssignmentV4[];
  marginalContributions: Record<string, string[]>;
  metrics: EditorialRouteMetricsV4;
  scores: EditorialRouteScoresV4;
  paretoOptimal: true;
}

export interface EditorialRoutePortfolioV4 {
  status: 'selected' | 'duration_extension_required' | 'insufficient_editorial_core' | 'no_route';
  finalists: EditorialRouteFinalistV4[];
  requestedDuration: number;
  searchedDuration: number;
  recommendedDuration: number | null;
  exploredStateCount: number;
  reducedCandidates: CuratedCandidateV4[];
  reason: string | null;
}

interface SearchState {
  key: string;
  mask: number;
  end: number;
  walkingSeconds: number;
  walkingMeters: number;
  dwellSeconds: number;
  maxSegmentSeconds: number;
  maxSegmentMeters: number;
  parentKey: string | null;
}

interface EvaluatedRoute extends EditorialRouteFinalistV4 {
  signature: string;
}

function candidateSlot(index: number): string {
  return `c${String(index + 1).padStart(2, '0')}`;
}

function contributionStrength(candidate: CuratedCandidateV4, beatId: string): number {
  return candidate.assessment.contributions.find((item) => item.beatId === beatId)?.strength ?? 0;
}

function addCandidate(selected: CuratedCandidateV4[], candidate: CuratedCandidateV4): void {
  if (!selected.some((item) => item.slot === candidate.slot)) selected.push(candidate);
}

function topCandidates(
  candidates: CuratedCandidateV4[],
  count: number,
  compare: (left: CuratedCandidateV4, right: CuratedCandidateV4) => number
): CuratedCandidateV4[] {
  return [...candidates].sort(compare).slice(0, count);
}

function candidateMarginalVector(candidate: CuratedCandidateV4, selected: CuratedCandidateV4[], storyMap: EditorialStoryMapV4): number[] {
  const beatGain = storyMap.beats.reduce((sum, beat) => {
    const current = Math.max(0, ...selected.map((item) => contributionStrength(item, beat.beatId)));
    return sum + Math.max(0, contributionStrength(candidate, beat.beatId) - current);
  }, 0);
  const selectedEras = new Set(selected.flatMap((item) => item.assessment.eraBuckets));
  const eraGain = candidate.assessment.eraBuckets.filter((era) => !selectedEras.has(era)).length;
  return [beatGain, eraGain, candidate.assessment.salienceLevel, candidate.assessment.observableStrength,
    candidate.entity.recognitionScore ?? candidate.entity.fameScore,
    -candidate.assessment.relativePriorityRank];
}

function compareVectors(left: number[], right: number[]): number {
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

function walkingDensityCost(candidate: CuratedCandidateV4, candidates: CuratedCandidateV4[]): number {
  return candidates.filter((item) => item.slot !== candidate.slot)
    .map((item) => editorialDistanceMetersV4(candidate.entity.coordinates, item.entity.coordinates))
    .sort((left, right) => left - right)
    .slice(0, 6)
    .reduce((sum, distance) => sum + distance, 0);
}

export function reduceStoryCandidatesV4(
  entities: EditorialEntityCandidateV4[],
  storyMap: EditorialStoryMapV4,
  limit = 18
): CuratedCandidateV4[] {
  if (entities.length !== Object.keys(storyMap.candidates).length) throw new Error('Story map candidate count does not match entities');
  if (limit < 4 || limit > 18) throw new Error('Optimizer candidate limit must be 4 to 18');
  const candidates = entities.map((entity, index) => {
    const slot = candidateSlot(index);
    const assessment = storyMap.candidates[slot];
    if (!assessment) throw new Error(`Story map is missing ${slot}`);
    return { slot, entity, assessment };
  });
  if (candidates.length <= limit) return candidates;
  const selected: CuratedCandidateV4[] = [];
  for (const beat of storyMap.beats) {
    const carrier = topCandidates(candidates.filter((candidate) => contributionStrength(candidate, beat.beatId) >= 2), 1,
      (left, right) => contributionStrength(right, beat.beatId) - contributionStrength(left, beat.beatId)
        || left.assessment.relativePriorityRank - right.assessment.relativePriorityRank
        || left.slot.localeCompare(right.slot))[0];
    if (!carrier) throw new Error(`Reduced set cannot carry ${beat.beatId}`);
    addCandidate(selected, carrier);
  }
  const curatorOrder = topCandidates(candidates, 12, (left, right) => (
    left.assessment.relativePriorityRank - right.assessment.relativePriorityRank
  ));
  const recognitionOrder = topCandidates(candidates, 12, (left, right) => (
    (right.entity.recognitionScore ?? right.entity.fameScore)
      - (left.entity.recognitionScore ?? left.entity.fameScore)
      || left.slot.localeCompare(right.slot)
  ));
  const densityOrder = topCandidates(candidates, 12, (left, right) => (
    walkingDensityCost(left, candidates) - walkingDensityCost(right, candidates)
      || left.slot.localeCompare(right.slot)
  ));
  for (let index = 0; index < 12 && selected.length < limit; index += 1) {
    for (const order of [curatorOrder, recognitionOrder, densityOrder]) {
      if (selected.length < limit && order[index]) addCandidate(selected, order[index]);
    }
  }
  if (selected.length > limit) throw new Error('Mandatory story candidates exceed optimizer limit');
  while (selected.length < limit) {
    const remaining = candidates.filter((candidate) => !selected.some((item) => item.slot === candidate.slot));
    if (remaining.length === 0) break;
    remaining.sort((left, right) => compareVectors(
      candidateMarginalVector(left, selected, storyMap),
      candidateMarginalVector(right, selected, storyMap)
    ) || left.slot.localeCompare(right.slot));
    selected.push(remaining[0]);
  }
  const order = new Map(candidates.map((candidate, index) => [candidate.slot, index]));
  return selected.sort((left, right) => (order.get(left.slot) as number) - (order.get(right.slot) as number));
}

function segmentLimits(duration: number): { meters: number; seconds: number } {
  if (duration <= 120) return { meters: 1500, seconds: 20 * 60 };
  if (duration <= 180) return { meters: 1700, seconds: 23 * 60 };
  return { meters: 1800, seconds: 25 * 60 };
}

function dwellSeconds(candidate: CuratedCandidateV4): number {
  const minutes = 7 + (candidate.assessment.salienceLevel === 4 ? 1 : 0);
  return minutes * 60;
}

function stateKey(mask: number, end: number): string {
  return `${mask}:${end}`;
}

function countBits(value: number): number {
  let count = 0;
  let remaining = value;
  while (remaining > 0) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function conflictsWithMask(candidates: CuratedCandidateV4[], mask: number, next: number): boolean {
  const group = candidates[next].entity.visitConflictGroup;
  if (!group) return false;
  return candidates.some((candidate, index) => index !== next
    && (mask & (1 << index)) !== 0 && candidate.entity.visitConflictGroup === group);
}

function reconstructStatePath(state: SearchState, states: Map<string, SearchState>): number[] {
  const path: number[] = [];
  let current: SearchState | undefined = state;
  while (current) {
    path.push(current.end);
    current = current.parentKey ? states.get(current.parentKey) : undefined;
  }
  return path.reverse();
}

function assignRouteBeats(route: CuratedCandidateV4[], storyMap: EditorialStoryMapV4): EditorialBeatAssignmentV4[] {
  return storyMap.beats.flatMap((beat) => {
    const carrier = [...route].filter((candidate) => contributionStrength(candidate, beat.beatId) >= 2)
      .sort((left, right) => contributionStrength(right, beat.beatId) - contributionStrength(left, beat.beatId)
        || left.assessment.relativePriorityRank - right.assessment.relativePriorityRank
        || route.indexOf(left) - route.indexOf(right))[0];
    return carrier ? [{
      beatId: beat.beatId,
      candidateSlot: carrier.slot,
      strength: contributionStrength(carrier, beat.beatId),
    }] : [];
  });
}

function routeMarginals(
  route: CuratedCandidateV4[],
  assignments: EditorialBeatAssignmentV4[],
  storyMap: EditorialStoryMapV4
): Record<string, string[]> {
  const result: Record<string, string[]> = {};
  const routeEras = new Map<EraBucketV4, number>();
  route.forEach((candidate) => candidate.assessment.eraBuckets.forEach((era) => routeEras.set(era, (routeEras.get(era) ?? 0) + 1)));
  for (let index = 0; index < route.length; index += 1) {
    const candidate = route[index];
    const reasons: string[] = [];
    const assigned = assignments.filter((assignment) => assignment.candidateSlot === candidate.slot);
    if (assigned.length > 0) reasons.push(...assigned.map((assignment) => `carries:${assignment.beatId}`));
    const carriedBeatIds = new Set(assigned.map((assignment) => assignment.beatId));
    reasons.push(...candidate.assessment.contributions
      .filter((contribution) => contribution.strength >= 2
        && storyMap.beats.some((beat) => beat.beatId === contribution.beatId)
        && !carriedBeatIds.has(contribution.beatId))
      .map((contribution) => `deepens:${contribution.beatId}`));
    const uniqueEras = candidate.assessment.eraBuckets.filter((era) => routeEras.get(era) === 1);
    if (uniqueEras.length > 0) reasons.push(...uniqueEras.map((era) => `adds-era:${era}`));
    if (candidate.assessment.salienceLevel >= 3) reasons.push(`salience:${candidate.assessment.salienceLevel}`);
    if (index === 0 && candidate.assessment.openingFit >= 2) reasons.push('opening');
    if (index === route.length - 1 && candidate.assessment.resolutionFit >= 2) reasons.push('resolution');
    result[candidate.slot] = [...new Set(reasons)];
  }
  return result;
}

function evaluateState(
  state: SearchState,
  path: number[],
  candidates: CuratedCandidateV4[],
  storyMap: EditorialStoryMapV4
): EvaluatedRoute | null {
  const route = path.map((index) => candidates[index]);
  const assignments = assignRouteBeats(route, storyMap);
  const minimumBeatCoverage = Math.min(storyMap.beats.length, 4);
  if (assignments.length < minimumBeatCoverage) return null;
  const marginals = routeMarginals(route, assignments, storyMap);
  if (Object.values(marginals).some((reasons) => reasons.length === 0)) return null;
  const observable = route.map((candidate) => candidate.assessment.observableStrength);
  const eras = new Set(route.flatMap((candidate) => candidate.assessment.eraBuckets));
  const assessedCandidateCount = Object.keys(storyMap.candidates).length;
  const curatorPriorityCoverage = route.reduce((sum, candidate) => (
    sum + (assessedCandidateCount + 1 - candidate.assessment.relativePriorityRank)
  ), 0);
  const recognitionRank = new Map([...candidates].sort((left, right) => (
    (right.entity.recognitionScore ?? right.entity.fameScore)
      - (left.entity.recognitionScore ?? left.entity.fameScore)
      || left.slot.localeCompare(right.slot)
  )).map((candidate, index) => [candidate.slot, index + 1]));
  const recognitionCoverage = route.reduce((sum, candidate) => (
    sum + (candidates.length + 1 - (recognitionRank.get(candidate.slot) as number))
  ), 0);
  const priorityCoverage = curatorPriorityCoverage + recognitionCoverage;
  const metrics: EditorialRouteMetricsV4 = {
    walkingMeters: Number(state.walkingMeters.toFixed(2)),
    walkingMinutes: Number((state.walkingSeconds / 60).toFixed(2)),
    dwellMinutes: Number((state.dwellSeconds / 60 + 3).toFixed(2)),
    estimatedTourMinutes: Number(((state.walkingSeconds + state.dwellSeconds + 180) / 60).toFixed(2)),
    maxSegmentMeters: Number(state.maxSegmentMeters.toFixed(2)),
    maxSegmentMinutes: Number((state.maxSegmentSeconds / 60).toFixed(2)),
  };
  const candidateSlots = route.map((candidate) => candidate.slot);
  return {
    slot: '', candidateSlots, entities: route.map((candidate) => candidate.entity), assignments,
    marginalContributions: marginals, metrics,
    scores: {
      beatCoverage: assignments.length,
      beatStrength: assignments.reduce((sum, assignment) => sum + assignment.strength, 0),
      priorityCoverage,
      curatorPriorityCoverage,
      recognitionCoverage,
      salienceTotal: route.reduce((sum, candidate) => sum + candidate.assessment.salienceLevel, 0),
      observableFloor: Math.min(...observable),
      observableAverage: Number((observable.reduce((sum, value) => sum + value, 0) / observable.length).toFixed(2)),
      eraCount: eras.size,
      boundaryFit: route[0].assessment.openingFit + route.at(-1)!.assessment.resolutionFit,
    },
    paretoOptimal: true,
    signature: candidateSlots.join('>'),
  };
}

function dominates(left: EvaluatedRoute, right: EvaluatedRoute): boolean {
  const noWorse = left.scores.beatCoverage >= right.scores.beatCoverage
    && left.scores.beatStrength >= right.scores.beatStrength
    && left.scores.priorityCoverage >= right.scores.priorityCoverage
    && left.scores.salienceTotal >= right.scores.salienceTotal
    && left.scores.observableFloor >= right.scores.observableFloor
    && left.scores.observableAverage >= right.scores.observableAverage
    && left.scores.eraCount >= right.scores.eraCount
    && left.scores.boundaryFit >= right.scores.boundaryFit
    && left.metrics.walkingMinutes <= right.metrics.walkingMinutes
    && left.entities.length <= right.entities.length;
  const better = left.scores.beatCoverage > right.scores.beatCoverage
    || left.scores.beatStrength > right.scores.beatStrength
    || left.scores.priorityCoverage > right.scores.priorityCoverage
    || left.scores.salienceTotal > right.scores.salienceTotal
    || left.scores.observableFloor > right.scores.observableFloor
    || left.scores.observableAverage > right.scores.observableAverage
    || left.scores.eraCount > right.scores.eraCount
    || left.scores.boundaryFit > right.scores.boundaryFit
    || left.metrics.walkingMinutes < right.metrics.walkingMinutes
    || left.entities.length < right.entities.length;
  return noWorse && better;
}

function insertFrontier(frontier: EvaluatedRoute[], route: EvaluatedRoute): void {
  if (frontier.some((item) => item.signature === route.signature || dominates(item, route))) return;
  for (let index = frontier.length - 1; index >= 0; index -= 1) {
    if (dominates(route, frontier[index])) frontier.splice(index, 1);
  }
  frontier.push(route);
}

function chooseFinalists(frontier: EvaluatedRoute[]): EditorialRouteFinalistV4[] {
  if (frontier.length === 0) return [];
  const strategies: Array<(left: EvaluatedRoute, right: EvaluatedRoute) => number> = [
    (left, right) => right.scores.priorityCoverage - left.scores.priorityCoverage
      || right.scores.beatCoverage - left.scores.beatCoverage
      || right.scores.beatStrength - left.scores.beatStrength
      || left.metrics.walkingMinutes - right.metrics.walkingMinutes,
    (left, right) => right.scores.beatCoverage - left.scores.beatCoverage
      || right.scores.beatStrength - left.scores.beatStrength
      || right.scores.priorityCoverage - left.scores.priorityCoverage
      || left.metrics.walkingMinutes - right.metrics.walkingMinutes,
    (left, right) => left.metrics.walkingMinutes - right.metrics.walkingMinutes
      || right.scores.beatStrength - left.scores.beatStrength,
    (left, right) => Number(right.entities.length >= 7) - Number(left.entities.length >= 7)
      || left.metrics.walkingMinutes - right.metrics.walkingMinutes
      || right.scores.priorityCoverage - left.scores.priorityCoverage,
    (left, right) => right.scores.boundaryFit - left.scores.boundaryFit
      || right.scores.beatStrength - left.scores.beatStrength,
    (left, right) => right.scores.priorityCoverage - left.scores.priorityCoverage
      || right.scores.beatStrength - left.scores.beatStrength,
  ];
  const selected: EvaluatedRoute[] = [];
  for (const compare of strategies) {
    const route = [...frontier].sort((left, right) => (
      compare(left, right) || left.signature.localeCompare(right.signature)
    ))[0];
    if (route && !selected.some((item) => item.signature === route.signature)) selected.push(route);
  }
  return selected.slice(0, 5).map((route, index) => ({
    slot: `r${String(index + 1).padStart(2, '0')}`,
    candidateSlots: route.candidateSlots,
    entities: route.entities,
    assignments: route.assignments,
    marginalContributions: route.marginalContributions,
    metrics: route.metrics,
    scores: route.scores,
    paretoOptimal: true,
  }));
}

function hasEditorialCore(candidates: CuratedCandidateV4[], storyMap: EditorialStoryMapV4, minStops: number): boolean {
  return candidates.length >= minStops
    && storyMap.beats.filter((beat) => candidates.some((candidate) => (
      contributionStrength(candidate, beat.beatId) >= 2
    ))).length >= Math.min(storyMap.beats.length, 4);
}

function searchAtCeiling(
  candidates: CuratedCandidateV4[],
  storyMap: EditorialStoryMapV4,
  matrix: WalkingMatrixSnapshotV4,
  durationCeiling: number,
  segmentLimitDuration: number,
  minStops: number,
  maxStops: number
): { finalists: EditorialRouteFinalistV4[]; exploredStateCount: number } {
  const limits = segmentLimits(segmentLimitDuration);
  const states = new Map<string, SearchState>();
  for (let index = 0; index < candidates.length; index += 1) {
    const key = stateKey(1 << index, index);
    states.set(key, {
      key, mask: 1 << index, end: index,
      walkingSeconds: 0, walkingMeters: 0,
      dwellSeconds: dwellSeconds(candidates[index]),
      maxSegmentSeconds: 0, maxSegmentMeters: 0, parentKey: null,
    });
  }
  for (let size = 1; size < maxStops; size += 1) {
    const level = [...states.values()].filter((state) => countBits(state.mask) === size);
    for (const state of level) {
      for (let next = 0; next < candidates.length; next += 1) {
        if ((state.mask & (1 << next)) !== 0 || conflictsWithMask(candidates, state.mask, next)) continue;
        const leg = walkingLegV4(matrix, candidates[state.end].entity.siteId, candidates[next].entity.siteId);
        if (!leg.reachable || leg.meters === null || leg.seconds === null
          || leg.meters > limits.meters || leg.seconds > limits.seconds) continue;
        const mask = state.mask | (1 << next);
        const key = stateKey(mask, next);
        const nextState: SearchState = {
          key, mask, end: next,
          walkingSeconds: state.walkingSeconds + leg.seconds,
          walkingMeters: state.walkingMeters + leg.meters,
          dwellSeconds: state.dwellSeconds + dwellSeconds(candidates[next]),
          maxSegmentSeconds: Math.max(state.maxSegmentSeconds, leg.seconds),
          maxSegmentMeters: Math.max(state.maxSegmentMeters, leg.meters),
          parentKey: state.key,
        };
        const previous = states.get(key);
        const nextElapsed = nextState.walkingSeconds + nextState.dwellSeconds;
        const previousElapsed = previous ? previous.walkingSeconds + previous.dwellSeconds : Number.POSITIVE_INFINITY;
        if (!previous || nextElapsed < previousElapsed
          || (nextElapsed === previousElapsed && nextState.walkingMeters < previous.walkingMeters)) {
          states.set(key, nextState);
        }
      }
    }
  }
  const frontier: EvaluatedRoute[] = [];
  for (const state of states.values()) {
    const size = countBits(state.mask);
    if (size < minStops || size > maxStops
      || (state.walkingSeconds + state.dwellSeconds + 180) > durationCeiling * 60) continue;
    const route = evaluateState(state, reconstructStatePath(state, states), candidates, storyMap);
    if (route) insertFrontier(frontier, route);
  }
  return { finalists: chooseFinalists(frontier), exploredStateCount: states.size };
}

export function optimizeEditorialRouteV4(
  entities: EditorialEntityCandidateV4[],
  storyMap: EditorialStoryMapV4,
  matrix: WalkingMatrixSnapshotV4,
  requestedDuration: number,
  options: { minStops?: number; maxStops?: number; maxExtensionMinutes?: number } = {}
): EditorialRoutePortfolioV4 {
  const candidates = reduceStoryCandidatesV4(entities, storyMap, Math.min(18, entities.length));
  const minStops = options.minStops ?? (requestedDuration >= 90 ? 4 : 3);
  const maxStops = Math.min(options.maxStops ?? 8, candidates.length);
  if (!hasEditorialCore(candidates, storyMap, minStops)) {
    return {
      status: 'insufficient_editorial_core', finalists: [], requestedDuration, searchedDuration: requestedDuration,
      recommendedDuration: null, exploredStateCount: 0, reducedCandidates: candidates,
      reason: 'The reduced evidence-backed set cannot carry a four-part narrative core.',
    };
  }
  let exploredStateCount = 0;
  const maxExtension = options.maxExtensionMinutes ?? 60;
  for (let ceiling = requestedDuration; ceiling <= requestedDuration + maxExtension; ceiling += 15) {
    const result = searchAtCeiling(candidates, storyMap, matrix, ceiling, requestedDuration, minStops, maxStops);
    exploredStateCount += result.exploredStateCount;
    if (result.finalists.length === 0) continue;
    return {
      status: ceiling === requestedDuration ? 'selected' : 'duration_extension_required',
      finalists: result.finalists, requestedDuration, searchedDuration: ceiling,
      recommendedDuration: ceiling === requestedDuration ? null : ceiling,
      exploredStateCount, reducedCandidates: candidates, reason: null,
    };
  }
  return {
    status: 'no_route', finalists: [], requestedDuration,
    searchedDuration: requestedDuration + maxExtension, recommendedDuration: null,
    exploredStateCount, reducedCandidates: candidates,
    reason: 'No evidence-backed route satisfies the pedestrian and duration constraints.',
  };
}
