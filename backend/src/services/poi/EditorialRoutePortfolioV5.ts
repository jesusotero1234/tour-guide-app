import { PoiCategory } from '../../domain/poi/PoiClassification';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import { WalkingMatrixSnapshotV4, walkingLegV4 } from './EditorialWalkingMatrixV4';

export const EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5 = 'editorial-route-portfolio-v5' as const;
export const EDITORIAL_BEAM_WIDTH_V5 = 6000;
export const EDITORIAL_LABELS_PER_BOUNDARY_V5 = 8;
export const EDITORIAL_PORTFOLIO_LIMIT_V5 = 10;

export type EraBucketV5 =
  | 'ancient'
  | 'medieval'
  | 'early_modern'
  | 'nineteenth_century'
  | 'twentieth_century'
  | 'contemporary'
  | 'unknown';

export interface EditorialPortfolioCandidateV5 {
  slot: string;
  entity: EditorialEntityCandidateV5;
  eraBuckets: EraBucketV5[];
}

export interface EditorialRouteMetricsV5 {
  walkingMeters: number;
  walkingMinutes: number;
  interpretationMinutes: number;
  estimatedTourMinutes: number;
  maxSegmentMeters: number;
  maxSegmentMinutes: number;
}

export interface EditorialRouteVectorV5 {
  saturatedRecognition: number;
  eraCount: number;
  categoryCount: number;
  evidenceFloor: number;
  distinctiveness: number;
}

export interface EditorialRouteV5 {
  slot: string;
  candidateSlots: string[];
  entities: EditorialEntityCandidateV5[];
  metrics: EditorialRouteMetricsV5;
  vector: EditorialRouteVectorV5;
  protectedCandidateSlots: string[];
  paretoOptimal: boolean;
}

export interface EditorialRoutePortfolioV5 {
  schemaVersion: typeof EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5;
  status: 'selected' | 'duration_extension_required' | 'insufficient_editorial_core' | 'no_route';
  requestedDuration: number;
  searchedDuration: number;
  recommendedDuration: number | null;
  candidates: EditorialPortfolioCandidateV5[];
  protectedCandidateSlots: string[];
  uncoveredProtectedCandidateSlots: string[];
  routes: EditorialRouteV5[];
  diagnostics: {
    exploredStateCount: number;
    retainedStateCount: number;
    truncatedDepths: number[];
  };
  reason: string | null;
}

export interface EditorialRoutePortfolioOptionsV5 {
  minStops?: number;
  maxStops?: number;
  maxExtensionMinutes?: number;
  beamWidth?: number;
  labelsPerBoundary?: number;
  portfolioLimit?: number;
}

interface SearchState {
  visited: bigint;
  path: number[];
  start: number;
  end: number;
  walkingSeconds: number;
  walkingMeters: number;
  maxSegmentSeconds: number;
  maxSegmentMeters: number;
  vector: EditorialRouteVectorV5;
}

interface SearchResult {
  completed: SearchState[];
  exploredStateCount: number;
  retainedStateCount: number;
  truncatedDepths: number[];
}

function candidateSlot(index: number): string {
  return `c${String(index + 1).padStart(2, '0')}`;
}

export function inferEditorialEraBucketsV5(entity: EditorialEntityCandidateV5): EraBucketV5[] {
  const years = entity.evidenceFacts.flatMap((fact) => (
    [...fact.value.matchAll(/(?:^|\D)(\d{3,4})(?=\D|$)/g)].map((match) => Number(match[1]))
  )).filter((year) => year >= 1 && year <= 2100);
  const eras = new Set<EraBucketV5>();
  for (const year of years) {
    if (year <= 500) eras.add('ancient');
    else if (year <= 1499) eras.add('medieval');
    else if (year <= 1799) eras.add('early_modern');
    else if (year <= 1899) eras.add('nineteenth_century');
    else if (year <= 1999) eras.add('twentieth_century');
    else eras.add('contemporary');
  }
  return eras.size > 0 ? [...eras].sort() : ['unknown'];
}

function buildCandidates(entities: EditorialEntityCandidateV5[]): EditorialPortfolioCandidateV5[] {
  if (entities.length > 30) throw new Error('Editorial v5 portfolio accepts at most 30 candidates');
  const ready = [...entities].filter((entity) => entity.readiness.ready)
    .sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  if (new Set(ready.map((entity) => entity.canonicalId)).size !== ready.length) {
    throw new Error('Editorial v5 portfolio requires unique canonical identities');
  }
  if (new Set(ready.map((entity) => entity.siteId)).size !== ready.length) {
    throw new Error('Editorial v5 portfolio requires unique physical sites');
  }
  return ready.map((entity, index) => ({
    slot: candidateSlot(index), entity, eraBuckets: inferEditorialEraBucketsV5(entity),
  }));
}

function segmentLimits(duration: number): { meters: number; seconds: number } {
  if (duration <= 120) return { meters: 1500, seconds: 20 * 60 };
  if (duration <= 180) return { meters: 1700, seconds: 23 * 60 };
  return { meters: 1800, seconds: 25 * 60 };
}

function interpretationMinutes(stopCount: number): number {
  if (stopCount < 2) return 3 + (stopCount * 7);
  return 3 + 7 + 7 + ((stopCount - 2) * 6);
}

function routeVector(path: number[], candidates: EditorialPortfolioCandidateV5[]): EditorialRouteVectorV5 {
  const route = path.map((index) => candidates[index]);
  const recognitions = route.map((candidate) => candidate.entity.recognitionScore)
    .sort((left, right) => right - left).slice(0, 4);
  const eras = new Set(route.flatMap((candidate) => candidate.eraBuckets));
  const categories = new Set(route.map((candidate) => candidate.entity.category));
  let pairScore = 0;
  let pairCount = 0;
  for (let left = 0; left < route.length; left += 1) {
    for (let right = left + 1; right < route.length; right += 1) {
      pairCount += 1;
      if (route[left].entity.category !== route[right].entity.category) pairScore += 1;
      if (!route[left].eraBuckets.some((era) => route[right].eraBuckets.includes(era))) pairScore += 1;
    }
  }
  return {
    saturatedRecognition: Number(recognitions.reduce((sum, value) => sum + value, 0).toFixed(2)),
    eraCount: eras.size,
    categoryCount: categories.size,
    evidenceFloor: Math.min(...route.map((candidate) => candidate.entity.evidenceFacts.length)),
    distinctiveness: pairCount === 0 ? 0 : Number((pairScore / (pairCount * 2)).toFixed(4)),
  };
}

function editorialNoWorse(left: EditorialRouteVectorV5, right: EditorialRouteVectorV5): boolean {
  return left.saturatedRecognition >= right.saturatedRecognition
    && left.eraCount >= right.eraCount
    && left.categoryCount >= right.categoryCount
    && left.evidenceFloor >= right.evidenceFloor
    && left.distinctiveness >= right.distinctiveness;
}

function editorialStrictlyBetter(left: EditorialRouteVectorV5, right: EditorialRouteVectorV5): boolean {
  return left.saturatedRecognition > right.saturatedRecognition
    || left.eraCount > right.eraCount
    || left.categoryCount > right.categoryCount
    || left.evidenceFloor > right.evidenceFloor
    || left.distinctiveness > right.distinctiveness;
}

function dominatesState(left: SearchState, right: SearchState): boolean {
  return editorialNoWorse(left.vector, right.vector)
    && left.walkingSeconds <= right.walkingSeconds
    && left.walkingMeters <= right.walkingMeters
    && left.maxSegmentSeconds <= right.maxSegmentSeconds
    && left.maxSegmentMeters <= right.maxSegmentMeters
    && editorialStrictlyBetter(left.vector, right.vector);
}

function compareState(left: SearchState, right: SearchState): number {
  return right.vector.saturatedRecognition - left.vector.saturatedRecognition
    || right.vector.eraCount - left.vector.eraCount
    || right.vector.categoryCount - left.vector.categoryCount
    || right.vector.evidenceFloor - left.vector.evidenceFloor
    || right.vector.distinctiveness - left.vector.distinctiveness
    || left.walkingSeconds - right.walkingSeconds
    || left.maxSegmentSeconds - right.maxSegmentSeconds
    || left.path.join('>').localeCompare(right.path.join('>'));
}

function insertBoundaryLabel(
  labels: SearchState[],
  state: SearchState,
  labelsPerBoundary: number
): SearchState[] {
  if (labels.some((label) => label.path.join('>') === state.path.join('>') || dominatesState(label, state))) {
    return labels;
  }
  const retained = labels.filter((label) => !dominatesState(state, label));
  retained.push(state);
  return retained.sort(compareState).slice(0, labelsPerBoundary);
}

function conflictsWithPath(
  candidates: EditorialPortfolioCandidateV5[],
  path: number[],
  next: number
): boolean {
  const group = candidates[next].entity.visitConflictGroup;
  return Boolean(group && path.some((index) => candidates[index].entity.visitConflictGroup === group));
}

function searchAtCeiling(
  candidates: EditorialPortfolioCandidateV5[],
  matrix: WalkingMatrixSnapshotV4,
  durationCeiling: number,
  requestedDuration: number,
  minStops: number,
  maxStops: number,
  beamWidth: number,
  labelsPerBoundary: number
): SearchResult {
  const limits = segmentLimits(requestedDuration);
  let current = candidates.map((_, index): SearchState => ({
    visited: 1n << BigInt(index), path: [index], start: index, end: index,
    walkingSeconds: 0, walkingMeters: 0, maxSegmentSeconds: 0, maxSegmentMeters: 0,
    vector: routeVector([index], candidates),
  }));
  const completed: SearchState[] = [];
  const truncatedDepths: number[] = [];
  let exploredStateCount = current.length;
  let retainedStateCount = current.length;

  for (let size = 1; size <= maxStops; size += 1) {
    if (size >= minStops) {
      completed.push(...current.filter((state) => (
        state.walkingSeconds + (interpretationMinutes(state.path.length) * 60) <= durationCeiling * 60
      )));
    }
    if (size === maxStops) break;
    const boundaries = new Map<string, SearchState[]>();
    for (const state of current) {
      for (let next = 0; next < candidates.length; next += 1) {
        const bit = 1n << BigInt(next);
        if ((state.visited & bit) !== 0n || conflictsWithPath(candidates, state.path, next)) continue;
        exploredStateCount += 1;
        const leg = walkingLegV4(
          matrix, candidates[state.end].entity.siteId, candidates[next].entity.siteId
        );
        if (!leg.reachable || leg.meters === null || leg.seconds === null
          || leg.meters > limits.meters || leg.seconds > limits.seconds) continue;
        const walkingSeconds = state.walkingSeconds + leg.seconds;
        const nextPath = [...state.path, next];
        if (walkingSeconds + (interpretationMinutes(nextPath.length) * 60) > durationCeiling * 60) {
          continue;
        }
        const nextState: SearchState = {
          visited: state.visited | bit, path: nextPath, start: state.start, end: next,
          walkingSeconds, walkingMeters: state.walkingMeters + leg.meters,
          maxSegmentSeconds: Math.max(state.maxSegmentSeconds, leg.seconds),
          maxSegmentMeters: Math.max(state.maxSegmentMeters, leg.meters),
          vector: routeVector(nextPath, candidates),
        };
        const key = `${nextState.start}:${nextState.end}:${nextPath.length}`;
        boundaries.set(key, insertBoundaryLabel(
          boundaries.get(key) ?? [], nextState, labelsPerBoundary
        ));
      }
    }
    let nextLevel = [...boundaries.values()].flat().sort(compareState);
    if (nextLevel.length > beamWidth) {
      truncatedDepths.push(size + 1);
      nextLevel = nextLevel.slice(0, beamWidth);
    }
    current = nextLevel;
    retainedStateCount += current.length;
    if (current.length === 0) break;
  }
  return {
    completed, exploredStateCount, retainedStateCount,
    truncatedDepths: [...new Set(truncatedDepths)],
  };
}

function protectedCandidateSlots(candidates: EditorialPortfolioCandidateV5[]): string[] {
  const protectedSlots = new Set([...candidates].sort((left, right) => (
    right.entity.recognitionScore - left.entity.recognitionScore || left.slot.localeCompare(right.slot)
  )).slice(0, 10).map((candidate) => candidate.slot));
  const categories = new Map<PoiCategory, EditorialPortfolioCandidateV5[]>();
  const eras = new Map<EraBucketV5, EditorialPortfolioCandidateV5[]>();
  for (const candidate of candidates) {
    categories.set(candidate.entity.category, [...(categories.get(candidate.entity.category) ?? []), candidate]);
    for (const era of candidate.eraBuckets) eras.set(era, [...(eras.get(era) ?? []), candidate]);
  }
  for (const [category, carriers] of categories) {
    if (category !== 'other' && carriers.length === 1) protectedSlots.add(carriers[0].slot);
  }
  for (const [era, carriers] of eras) {
    if (era !== 'unknown' && carriers.length === 1) protectedSlots.add(carriers[0].slot);
  }
  return [...protectedSlots].sort();
}

function stateSignature(state: SearchState, candidates: EditorialPortfolioCandidateV5[]): string {
  return state.path.map((index) => candidates[index].slot).join('>');
}

function compareRouteState(left: SearchState, right: SearchState, candidates: EditorialPortfolioCandidateV5[]): number {
  return compareState(left, right)
    || left.path.length - right.path.length
    || stateSignature(left, candidates).localeCompare(stateSignature(right, candidates));
}

function jaccard(left: SearchState, right: SearchState): number {
  let intersection = 0;
  let union = 0;
  const combined = left.visited | right.visited;
  const common = left.visited & right.visited;
  for (let index = 0; index < 30; index += 1) {
    const bit = 1n << BigInt(index);
    if ((combined & bit) !== 0n) union += 1;
    if ((common & bit) !== 0n) intersection += 1;
  }
  return union === 0 ? 0 : intersection / union;
}

function choosePortfolioStates(
  completed: SearchState[],
  candidates: EditorialPortfolioCandidateV5[],
  protectedSlots: string[],
  limit: number
): SearchState[] {
  const unique = [...new Map(completed.map((state) => [stateSignature(state, candidates), state])).values()]
    .sort((left, right) => compareRouteState(left, right, candidates));
  if (unique.length === 0) return [];
  const selected: SearchState[] = [unique[0]];
  const selectedSignatures = new Set([stateSignature(unique[0], candidates)]);
  const add = (state: SearchState | undefined) => {
    if (!state || selected.length >= limit) return;
    const signature = stateSignature(state, candidates);
    if (!selectedSignatures.has(signature)) {
      selected.push(state);
      selectedSignatures.add(signature);
    }
  };

  const availableSizes = [...new Set(unique.map((state) => state.path.length))].sort((a, b) => a - b);
  const chosenSizes = new Set(selected.map((state) => state.path.length));
  for (const size of availableSizes) {
    if (chosenSizes.size >= 3 || selected.length >= limit) break;
    if (chosenSizes.has(size)) continue;
    add(unique.find((state) => state.path.length === size));
    chosenSizes.add(size);
  }

  const protectedSet = new Set(protectedSlots);
  while (selected.length < limit) {
    const covered = new Set(selected.flatMap((state) => state.path.map((index) => candidates[index].slot)));
    const uncovered = new Set([...protectedSet].filter((slot) => !covered.has(slot)));
    if (uncovered.size === 0) break;
    const options = unique.filter((state) => !selectedSignatures.has(stateSignature(state, candidates)))
      .map((state) => ({
        state,
        newProtected: state.path.filter((index) => uncovered.has(candidates[index].slot)).length,
        maxSimilarity: Math.max(...selected.map((chosen) => jaccard(state, chosen))),
      })).filter((option) => option.newProtected > 0)
      .sort((left, right) => right.newProtected - left.newProtected
        || Number(left.maxSimilarity > 0.75) - Number(right.maxSimilarity > 0.75)
        || left.maxSimilarity - right.maxSimilarity
        || compareRouteState(left.state, right.state, candidates));
    if (options.length === 0) break;
    add(options[0].state);
  }

  while (selected.length < Math.min(limit, unique.length)) {
    const options = unique.filter((state) => !selectedSignatures.has(stateSignature(state, candidates)))
      .map((state) => ({
        state,
        maxSimilarity: Math.max(...selected.map((chosen) => jaccard(state, chosen))),
      })).sort((left, right) => Number(left.maxSimilarity > 0.75) - Number(right.maxSimilarity > 0.75)
        || left.maxSimilarity - right.maxSimilarity
        || compareRouteState(left.state, right.state, candidates));
    if (options.length === 0) break;
    add(options[0].state);
  }
  return selected;
}

function dominatesRoute(left: SearchState, right: SearchState): boolean {
  const fewerOrEqualStops = left.path.length <= right.path.length;
  const noWorse = editorialNoWorse(left.vector, right.vector)
    && left.walkingSeconds <= right.walkingSeconds
    && left.walkingMeters <= right.walkingMeters
    && fewerOrEqualStops;
  const strict = editorialStrictlyBetter(left.vector, right.vector)
    || left.path.length < right.path.length;
  return noWorse && strict;
}

function materializeRoutes(
  selected: SearchState[],
  completed: SearchState[],
  candidates: EditorialPortfolioCandidateV5[],
  protectedSlots: string[]
): EditorialRouteV5[] {
  const protectedSet = new Set(protectedSlots);
  return selected.map((state, index) => {
    const candidateSlots = state.path.map((candidateIndex) => candidates[candidateIndex].slot);
    const minutes = interpretationMinutes(state.path.length);
    return {
      slot: `r${String(index + 1).padStart(2, '0')}`,
      candidateSlots,
      entities: state.path.map((candidateIndex) => candidates[candidateIndex].entity),
      metrics: {
        walkingMeters: Number(state.walkingMeters.toFixed(2)),
        walkingMinutes: Number((state.walkingSeconds / 60).toFixed(2)),
        interpretationMinutes: minutes,
        estimatedTourMinutes: Number((state.walkingSeconds / 60 + minutes).toFixed(2)),
        maxSegmentMeters: Number(state.maxSegmentMeters.toFixed(2)),
        maxSegmentMinutes: Number((state.maxSegmentSeconds / 60).toFixed(2)),
      },
      vector: state.vector,
      protectedCandidateSlots: candidateSlots.filter((slot) => protectedSet.has(slot)),
      paretoOptimal: !completed.some((other) => other !== state && dominatesRoute(other, state)),
    };
  });
}

export function optimizeEditorialRoutePortfolioV5(
  entities: EditorialEntityCandidateV5[],
  matrix: WalkingMatrixSnapshotV4,
  requestedDuration: number,
  options: EditorialRoutePortfolioOptionsV5 = {}
): EditorialRoutePortfolioV5 {
  const candidates = buildCandidates(entities);
  const minStops = Math.max(4, options.minStops ?? 4);
  const maxStops = Math.min(8, options.maxStops ?? 8, candidates.length);
  const protectedSlots = protectedCandidateSlots(candidates);
  const emptyDiagnostics = { exploredStateCount: 0, retainedStateCount: 0, truncatedDepths: [] as number[] };
  if (candidates.length < minStops || maxStops < minStops) {
    return {
      schemaVersion: EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5,
      status: 'insufficient_editorial_core', requestedDuration, searchedDuration: requestedDuration,
      recommendedDuration: null, candidates, protectedCandidateSlots: protectedSlots,
      uncoveredProtectedCandidateSlots: protectedSlots, routes: [], diagnostics: emptyDiagnostics,
      reason: 'Fewer than four evidence-ready identities are available.',
    };
  }
  const maxExtensionMinutes = options.maxExtensionMinutes ?? 60;
  const accumulatedDiagnostics = { ...emptyDiagnostics };
  for (let ceiling = requestedDuration; ceiling <= requestedDuration + maxExtensionMinutes; ceiling += 15) {
    const searched = searchAtCeiling(
      candidates, matrix, ceiling, requestedDuration, minStops, maxStops,
      options.beamWidth ?? EDITORIAL_BEAM_WIDTH_V5,
      options.labelsPerBoundary ?? EDITORIAL_LABELS_PER_BOUNDARY_V5
    );
    accumulatedDiagnostics.exploredStateCount += searched.exploredStateCount;
    accumulatedDiagnostics.retainedStateCount += searched.retainedStateCount;
    accumulatedDiagnostics.truncatedDepths = [...new Set([
      ...accumulatedDiagnostics.truncatedDepths, ...searched.truncatedDepths,
    ])];
    if (searched.completed.length === 0) continue;
    const selected = choosePortfolioStates(
      searched.completed, candidates, protectedSlots,
      Math.min(EDITORIAL_PORTFOLIO_LIMIT_V5, options.portfolioLimit ?? EDITORIAL_PORTFOLIO_LIMIT_V5)
    );
    const routes = materializeRoutes(selected, searched.completed, candidates, protectedSlots);
    const covered = new Set(routes.flatMap((route) => route.candidateSlots));
    return {
      schemaVersion: EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5,
      status: ceiling === requestedDuration ? 'selected' : 'duration_extension_required',
      requestedDuration, searchedDuration: ceiling,
      recommendedDuration: ceiling === requestedDuration ? null : ceiling,
      candidates, protectedCandidateSlots: protectedSlots,
      uncoveredProtectedCandidateSlots: protectedSlots.filter((slot) => !covered.has(slot)),
      routes, diagnostics: accumulatedDiagnostics, reason: null,
    };
  }
  return {
    schemaVersion: EDITORIAL_ROUTE_PORTFOLIO_SCHEMA_VERSION_V5,
    status: 'no_route', requestedDuration,
    searchedDuration: requestedDuration + maxExtensionMinutes,
    recommendedDuration: null, candidates, protectedCandidateSlots: protectedSlots,
    uncoveredProtectedCandidateSlots: protectedSlots, routes: [],
    diagnostics: accumulatedDiagnostics,
    reason: 'No evidence-backed route satisfies the duration, conflict, and segment constraints.',
  };
}
