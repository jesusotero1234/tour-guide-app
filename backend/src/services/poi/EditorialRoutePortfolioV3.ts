import { NarrativeRole } from './EditorialCandidate';
import {
  CandidateSignalsV3,
  RouteJuryRequestV3,
  RouteJuryV3,
  routeSlot,
} from './EditorialSelectionV3';
import { editorialDistanceMeters, EditorialSiteCandidateV3 } from './EditorialSiteV3';

export interface EditorialRouteMetricsV3 {
  walkingMeters: number;
  walkingMinutes: number;
  estimatedTourMinutes: number;
  maxSegmentMeters: number;
  overMaxSegments: number;
}

export interface EditorialRouteScoresV3 {
  priorityCovered: number;
  averageVisitValue: number;
  omissionCoverage: number;
  evidence: number;
  diversity: number;
  walkability: number;
  portfolioUtility: number;
}

export interface EditorialRouteFinalistV3 {
  slot: string;
  candidateSlots: string[];
  sites: EditorialSiteCandidateV3[];
  metrics: EditorialRouteMetricsV3;
  scores: EditorialRouteScoresV3;
  paretoOptimal: boolean;
}

export interface EditorialRoutePortfolioResultV3 {
  status: 'selected' | 'duration_extension_required' | 'no_route';
  finalists: EditorialRouteFinalistV3[];
  requestedDuration: number;
  searchedDuration: number;
  recommendedDuration: number | null;
  priorityThreshold: number;
  priorityTotal: number;
  maximumFeasiblePriorities: number;
  exploredStateCount: number;
}

export interface EditorialArcV3 {
  arc: NarrativeRole[];
  assignments: Array<{ candidateSlot: string; role: NarrativeRole }>;
}

interface CuratedSiteV3 {
  slot: string;
  site: EditorialSiteCandidateV3;
  visitValueScore: number;
  omissionCost: number;
}

interface PathState {
  distance: number;
  parentEnd: number;
}

interface EvaluatedRouteV3 extends EditorialRouteFinalistV3 {
  mask: number;
}

const DEFAULT_MIN_STOPS = 5;
const DEFAULT_MAX_STOPS = 8;
const DEFAULT_PRIORITY_THRESHOLD = 75;

function clamp(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

function countBits(value: number): number {
  let count = 0;
  let remaining = value;
  while (remaining) {
    count += remaining & 1;
    remaining >>>= 1;
  }
  return count;
}

function maxSegmentForDuration(duration: number): number {
  if (duration <= 120) return 1400;
  if (duration <= 180) return 1600;
  return 1800;
}

function segmentMeters(left: EditorialSiteCandidateV3, right: EditorialSiteCandidateV3): number {
  return editorialDistanceMeters(left.coordinates, right.coordinates) * 1.3;
}

export function estimateEditorialRouteMetricsV3(
  sites: EditorialSiteCandidateV3[],
  maxSegmentMeters: number
): EditorialRouteMetricsV3 {
  let walkingMeters = 0;
  let longest = 0;
  let overMaxSegments = 0;
  for (let index = 1; index < sites.length; index += 1) {
    const distance = segmentMeters(sites[index - 1], sites[index]);
    walkingMeters += distance;
    longest = Math.max(longest, distance);
    if (distance > maxSegmentMeters) overMaxSegments += 1;
  }
  const walkingMinutes = (walkingMeters / 1000 / 4.2) * 60;
  return {
    walkingMeters: Number(walkingMeters.toFixed(2)),
    walkingMinutes: Number(walkingMinutes.toFixed(2)),
    estimatedTourMinutes: Number((walkingMinutes + (sites.length * 7) + Math.max(5, sites.length * 2)).toFixed(2)),
    maxSegmentMeters: Number(longest.toFixed(2)),
    overMaxSegments,
  };
}

function reconstructPath(mask: number, end: number, states: Map<number, Map<number, PathState>>): number[] {
  const path: number[] = [];
  let currentMask = mask;
  let currentEnd = end;
  while (currentEnd >= 0) {
    path.push(currentEnd);
    const state = states.get(currentMask)?.get(currentEnd);
    if (!state) throw new Error('Broken exact-route parent chain');
    currentMask ^= (1 << currentEnd);
    currentEnd = state.parentEnd;
  }
  return path.reverse();
}

function omissionCoverage(route: CuratedSiteV3[], all: CuratedSiteV3[]): number {
  const denominator = all.reduce((sum, item) => sum + item.omissionCost, 0);
  if (denominator === 0) return 100;
  return clamp((route.reduce((sum, item) => sum + item.omissionCost, 0) / denominator) * 100);
}

function scoreRoute(
  route: CuratedSiteV3[],
  all: CuratedSiteV3[],
  metrics: EditorialRouteMetricsV3,
  maxSegmentMeters: number,
  priorityThreshold: number
): EditorialRouteScoresV3 {
  const averageVisitValue = route.reduce((sum, item) => sum + item.visitValueScore, 0) / route.length;
  const evidence = route.reduce((sum, item) => sum + item.site.evidenceScore, 0) / route.length;
  const diversity = (new Set(route.map((item) => item.site.category)).size / route.length) * 100;
  const walkCapacity = Math.max(1, maxSegmentMeters * Math.max(1, route.length - 1));
  const walkability = clamp(100 - ((metrics.walkingMeters / walkCapacity) * 70));
  const omission = omissionCoverage(route, all);
  return {
    priorityCovered: route.filter((item) => item.omissionCost >= priorityThreshold).length,
    averageVisitValue: Number(averageVisitValue.toFixed(2)),
    omissionCoverage: omission,
    evidence: Number(evidence.toFixed(2)),
    diversity: Number(diversity.toFixed(2)),
    walkability,
    portfolioUtility: clamp(
      (averageVisitValue * 0.4) + (omission * 0.25) + (evidence * 0.15)
        + (diversity * 0.1) + (walkability * 0.1)
    ),
  };
}

function dominates(left: EvaluatedRouteV3, right: EvaluatedRouteV3): boolean {
  const noWorse = left.scores.averageVisitValue >= right.scores.averageVisitValue
    && left.scores.omissionCoverage >= right.scores.omissionCoverage
    && left.scores.evidence >= right.scores.evidence
    && left.scores.diversity >= right.scores.diversity
    && left.metrics.walkingMeters <= right.metrics.walkingMeters;
  const better = left.scores.averageVisitValue > right.scores.averageVisitValue
    || left.scores.omissionCoverage > right.scores.omissionCoverage
    || left.scores.evidence > right.scores.evidence
    || left.scores.diversity > right.scores.diversity
    || left.metrics.walkingMeters < right.metrics.walkingMeters;
  return noWorse && better;
}

function compareRoutes(left: EvaluatedRouteV3, right: EvaluatedRouteV3): number {
  return right.scores.priorityCovered - left.scores.priorityCovered
    || right.scores.portfolioUtility - left.scores.portfolioUtility
    || right.scores.averageVisitValue - left.scores.averageVisitValue
    || left.metrics.walkingMeters - right.metrics.walkingMeters
    || left.sites.length - right.sites.length
    || left.candidateSlots.join(',').localeCompare(right.candidateSlots.join(','));
}

function routeSimilarity(left: EvaluatedRouteV3, right: EvaluatedRouteV3): number {
  const leftSet = new Set(left.candidateSlots);
  const intersection = right.candidateSlots.filter((item) => leftSet.has(item)).length;
  const union = new Set([...left.candidateSlots, ...right.candidateSlots]).size;
  return union === 0 ? 1 : intersection / union;
}

function chooseDiverseFinalists(routes: EvaluatedRouteV3[], count: number): EvaluatedRouteV3[] {
  if (routes.length === 0) return [];
  const ranked = [...routes].sort(compareRoutes);
  const selected = [ranked[0]];
  const remaining = ranked.slice(1);
  while (selected.length < count && remaining.length > 0) {
    remaining.sort((left, right) => {
      const leftSimilarity = Math.max(...selected.map((item) => routeSimilarity(left, item)));
      const rightSimilarity = Math.max(...selected.map((item) => routeSimilarity(right, item)));
      const leftMmr = left.scores.portfolioUtility - (leftSimilarity * 18);
      const rightMmr = right.scores.portfolioUtility - (rightSimilarity * 18);
      return rightMmr - leftMmr || compareRoutes(left, right);
    });
    selected.push(remaining.shift() as EvaluatedRouteV3);
  }
  return selected;
}

function exactOrderAlternatives(
  base: EvaluatedRouteV3,
  curated: CuratedSiteV3[],
  durationCeiling: number,
  maxSegmentMeters: number,
  priorityThreshold: number,
  limit: number
): EvaluatedRouteV3[] {
  const bySlot = new Map(curated.map((item) => [item.slot, item]));
  const items = base.candidateSlots.map((candidateSlot) => bySlot.get(candidateSlot) as CuratedSiteV3);
  const alternatives: EvaluatedRouteV3[] = [];
  const used = new Set<number>();
  const path: CuratedSiteV3[] = [];
  const visit = (walkingMeters: number): void => {
    if (path.length === items.length) {
      const signature = path.map((item) => item.slot).join('>');
      if (signature === base.candidateSlots.join('>')) return;
      const metrics = estimateEditorialRouteMetricsV3(path.map((item) => item.site), maxSegmentMeters);
      if (metrics.estimatedTourMinutes > durationCeiling || metrics.overMaxSegments > 0) return;
      alternatives.push({
        ...base,
        candidateSlots: path.map((item) => item.slot),
        sites: path.map((item) => item.site),
        metrics,
        scores: scoreRoute(path, curated, metrics, maxSegmentMeters, priorityThreshold),
      });
      return;
    }
    for (let index = 0; index < items.length; index += 1) {
      if (used.has(index)) continue;
      const leg = path.length === 0 ? 0 : segmentMeters(path[path.length - 1].site, items[index].site);
      if (leg > maxSegmentMeters) continue;
      const fixedMinutes = (items.length * 7) + Math.max(5, items.length * 2);
      if ((((walkingMeters + leg) / 1000 / 4.2) * 60) + fixedMinutes > durationCeiling) continue;
      used.add(index);
      path.push(items[index]);
      visit(walkingMeters + leg);
      path.pop();
      used.delete(index);
    }
  };
  visit(0);
  return alternatives.sort(compareRoutes).slice(0, limit);
}

function searchAtCeiling(
  curated: CuratedSiteV3[],
  durationCeiling: number,
  minStops: number,
  maxStops: number,
  priorityThreshold: number
): { routes: EvaluatedRouteV3[]; maximumFeasiblePriorities: number; exploredStateCount: number } {
  const maxSegmentMeters = maxSegmentForDuration(durationCeiling);
  const n = curated.length;
  const states = new Map<number, Map<number, PathState>>();
  for (let index = 0; index < n; index += 1) {
    states.set(1 << index, new Map([[index, { distance: 0, parentEnd: -1 }]]));
  }
  for (let size = 1; size < maxStops; size += 1) {
    const masks = [...states.keys()].filter((mask) => countBits(mask) === size);
    for (const mask of masks) {
      const endings = states.get(mask) as Map<number, PathState>;
      for (const [end, state] of endings) {
        for (let next = 0; next < n; next += 1) {
          if ((mask & (1 << next)) !== 0) continue;
          const leg = segmentMeters(curated[end].site, curated[next].site);
          if (leg > maxSegmentMeters) continue;
          const nextMask = mask | (1 << next);
          let nextStates = states.get(nextMask);
          if (!nextStates) {
            nextStates = new Map();
            states.set(nextMask, nextStates);
          }
          const distance = state.distance + leg;
          const previous = nextStates.get(next);
          if (!previous || distance < previous.distance) {
            nextStates.set(next, { distance, parentEnd: end });
          }
        }
      }
    }
  }

  const feasible: EvaluatedRouteV3[] = [];
  let maximumFeasiblePriorities = -1;
  for (const [mask, endings] of states) {
    const size = countBits(mask);
    if (size < minStops || size > maxStops) continue;
    let bestEnd = -1;
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const [end, state] of endings) {
      if (state.distance < bestDistance) {
        bestDistance = state.distance;
        bestEnd = end;
      }
    }
    const path = reconstructPath(mask, bestEnd, states);
    const route = path.map((index) => curated[index]);
    const metrics = estimateEditorialRouteMetricsV3(route.map((item) => item.site), maxSegmentMeters);
    if (metrics.estimatedTourMinutes > durationCeiling || metrics.overMaxSegments > 0) continue;
    const scores = scoreRoute(route, curated, metrics, maxSegmentMeters, priorityThreshold);
    if (scores.priorityCovered > maximumFeasiblePriorities) {
      maximumFeasiblePriorities = scores.priorityCovered;
      feasible.length = 0;
    }
    if (scores.priorityCovered === maximumFeasiblePriorities) {
      feasible.push({
        mask,
        slot: '',
        candidateSlots: route.map((item) => item.slot),
        sites: route.map((item) => item.site),
        metrics,
        scores,
        paretoOptimal: false,
      });
    }
  }

  const frontier: EvaluatedRouteV3[] = [];
  for (const route of feasible.sort(compareRoutes)) {
    if (frontier.some((item) => dominates(item, route))) continue;
    for (let index = frontier.length - 1; index >= 0; index -= 1) {
      if (dominates(route, frontier[index])) frontier.splice(index, 1);
    }
    route.paretoOptimal = true;
    frontier.push(route);
  }
  const finalistPool = frontier.length >= 5 ? frontier : [...frontier, ...feasible.filter((route) => !frontier.includes(route))];
  const distinctOrders = new Set(finalistPool.map((route) => route.candidateSlots.join('>')));
  if (finalistPool.length > 0 && distinctOrders.size < 5) {
    for (const alternative of exactOrderAlternatives(
      [...finalistPool].sort(compareRoutes)[0], curated, durationCeiling, maxSegmentMeters, priorityThreshold, 12
    )) {
      const signature = alternative.candidateSlots.join('>');
      if (distinctOrders.has(signature)) continue;
      finalistPool.push(alternative);
      distinctOrders.add(signature);
      if (distinctOrders.size >= 5) break;
    }
  }
  return {
    routes: chooseDiverseFinalists(finalistPool, Math.min(5, finalistPool.length)),
    maximumFeasiblePriorities: Math.max(0, maximumFeasiblePriorities),
    exploredStateCount: [...states.values()].reduce((sum, endings) => sum + endings.size, 0),
  };
}

export function optimizeEditorialRoutePortfolioV3(
  sites: EditorialSiteCandidateV3[],
  signals: CandidateSignalsV3,
  requestedDuration: number,
  options: { minStops?: number; maxStops?: number; priorityThreshold?: number; maxExtensionMinutes?: number } = {}
): EditorialRoutePortfolioResultV3 {
  if (sites.length > 18) throw new Error('Exact v3 optimizer accepts at most 18 sites');
  const curated = sites.map((site, index) => {
    const candidateSlot = `c${String(index).padStart(2, '0')}`;
    const signal = signals.signals[candidateSlot];
    if (!signal) throw new Error(`Missing candidate signal ${candidateSlot}`);
    return { slot: candidateSlot, site, ...signal };
  });
  const minStops = options.minStops ?? DEFAULT_MIN_STOPS;
  const maxStops = Math.min(options.maxStops ?? DEFAULT_MAX_STOPS, curated.length);
  const priorityThreshold = options.priorityThreshold ?? DEFAULT_PRIORITY_THRESHOLD;
  const maxExtension = options.maxExtensionMinutes ?? 60;
  let exploredStateCount = 0;
  for (let ceiling = requestedDuration; ceiling <= requestedDuration + maxExtension; ceiling += 15) {
    const search = searchAtCeiling(curated, ceiling, minStops, maxStops, priorityThreshold);
    exploredStateCount += search.exploredStateCount;
    if (search.routes.length === 0) continue;
    const finalists = search.routes.map((route, index) => ({ ...route, slot: routeSlot(index) }));
    return {
      status: ceiling === requestedDuration ? 'selected' : 'duration_extension_required',
      finalists,
      requestedDuration,
      searchedDuration: ceiling,
      recommendedDuration: ceiling === requestedDuration ? null : ceiling,
      priorityThreshold,
      priorityTotal: curated.filter((item) => item.omissionCost >= priorityThreshold).length,
      maximumFeasiblePriorities: search.maximumFeasiblePriorities,
      exploredStateCount,
    };
  }
  return {
    status: 'no_route', finalists: [], requestedDuration,
    searchedDuration: requestedDuration + maxExtension, recommendedDuration: null,
    priorityThreshold,
    priorityTotal: curated.filter((item) => item.omissionCost >= priorityThreshold).length,
    maximumFeasiblePriorities: 0,
    exploredStateCount,
  };
}

export function buildRouteJuryRequestV3(
  portfolio: EditorialRoutePortfolioResultV3,
  context: Omit<RouteJuryRequestV3, 'routes'>
): RouteJuryRequestV3 {
  if (portfolio.finalists.length !== 5) throw new Error('Route jury requires a five-route portfolio');
  return {
    ...context,
    routes: portfolio.finalists.map((route) => ({
      slot: route.slot,
      candidateSlots: route.candidateSlots,
      stopNames: route.sites.map((site) => site.localName),
      estimatedTourMinutes: route.metrics.estimatedTourMinutes,
      walkingMeters: route.metrics.walkingMeters,
      priorityCovered: route.scores.priorityCovered,
      averageVisitValue: route.scores.averageVisitValue,
    })),
  };
}

export function selectRouteJuryWinnerV3(
  portfolio: EditorialRoutePortfolioResultV3,
  jury: RouteJuryV3
): { winner: EditorialRouteFinalistV3; juryScore: number } {
  if (portfolio.finalists.length === 0) throw new Error('Cannot select a winner from an empty portfolio');
  return portfolio.finalists.map((route) => {
    const scores = jury.scores[route.slot];
    if (!scores) throw new Error(`Missing jury score ${route.slot}`);
    return {
      winner: route,
      juryScore: Number(((scores.paidTourScore * 0.4) + (scores.historicalArcScore * 0.25)
        + (scores.omissionSafetyScore * 0.25) + (scores.distinctivenessScore * 0.1)).toFixed(2)),
    };
  }).sort((left, right) => right.juryScore - left.juryScore
    || right.winner.scores.portfolioUtility - left.winner.scores.portfolioUtility
    || left.winner.metrics.walkingMeters - right.winner.metrics.walkingMeters)[0];
}

function middleRole(site: EditorialSiteCandidateV3): NarrativeRole {
  if (site.category === 'religious') return 'belief';
  if (site.category === 'palace_castle' || site.category === 'civic_power') return 'power';
  if (site.category === 'square_civic' || site.category === 'market') return 'public-life';
  if (site.category === 'memorial') return 'conflict';
  if (site.eligibleRoles.includes('origins')) return 'origins';
  if (site.eligibleRoles.includes('modern-city')) return 'modern-city';
  return 'transformation';
}

export function buildDeterministicEditorialArcV3(route: EditorialRouteFinalistV3): EditorialArcV3 {
  if (route.sites.length < 2) throw new Error('Editorial arc requires at least two stops');
  const assignments: EditorialArcV3['assignments'] = route.sites.map((site, index) => ({
    candidateSlot: route.candidateSlots[index],
    role: index === 0 ? 'opening' : index === route.sites.length - 1 ? 'resolution' : middleRole(site),
  }));
  const middleRoles = assignments.slice(1, -1).map((item) => item.role)
    .filter((role, index, roles) => roles.indexOf(role) === index)
    .slice(0, 4);
  const arc: NarrativeRole[] = ['opening', ...middleRoles, 'resolution'];
  return { arc, assignments };
}
