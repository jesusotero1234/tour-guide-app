import {
  CityEditorialProfileV1,
  EDITORIAL_SCENE_LIMIT_V7,
  validateCityEditorialProfileV1,
  validateVisitSceneV1,
  VisitSceneV1,
} from './EditorialProfileV7';
import {
  walkingLegV4,
  walkingMatrixCandidateFingerprintV4,
  WalkingLegV4,
  WalkingMatrixSnapshotV4,
} from './EditorialWalkingMatrixV4';

export interface EditorialRouteMetricsV7 {
  walkingMeters: number;
  walkingSeconds: number;
  walkingMinutes: number;
  maxSegmentMeters: number;
  maxSegmentSeconds: number;
  maxSegmentMinutes: number;
  explicitExperienceMinutes: number;
  estimatedTourMinutes: number;
  comfortPenalty: number;
}

export interface EditorialRouteV7 {
  sceneIds: string[];
  chapterAssignments: Array<{ chapterId: string; sceneId: string }>;
  coveredCanonicalIds: string[];
  metrics: EditorialRouteMetricsV7;
}

export interface EditorialRouteOptimizerOptionsV7 {
  maxSegmentMeters?: number;
  experienceSecondsBySceneId?: Record<string, number>;
  sceneComfortPenaltyById?: Record<string, number>;
  legComfortPenaltyByPair?: Record<string, number>;
}

interface DiscardedCountsV7 {
  coverage: number;
  arc: number;
  conflict: number;
  physical: number;
  redundant: number;
  duration: number;
}

export type EditorialRouteOptimizationResultV7 = {
  status: 'selected';
  route: EditorialRouteV7;
  searchedDurationMinutes: number;
  recommendedDurationMinutes: number | null;
  attemptedDurationMinutes: number[];
  exploredCompleteOrderCount: number;
  dominatedRouteCount: number;
  discardedCounts: DiscardedCountsV7;
} | {
  status: 'infeasible';
  attemptedDurationMinutes: number[];
  responsibleRequirements: string[];
  exploredCompleteOrderCount: number;
  discardedCounts: DiscardedCountsV7;
};

interface EvaluatedRouteV7 {
  route: EditorialRouteV7;
  signature: string;
  totalSeconds: number;
}

const DURATION_EXTENSIONS = [0, 15, 30, 45, 60] as const;
const ADVERTISED_DURATIONS = [30, 45, 60, 75, 90, 120, 150, 180, 240] as const;

function validateInputs(
  profile: CityEditorialProfileV1,
  scenes: VisitSceneV1[],
  matrix: WalkingMatrixSnapshotV4,
  options: EditorialRouteOptimizerOptionsV7
): Map<string, VisitSceneV1> {
  validateCityEditorialProfileV1(profile);
  if (scenes.length === 0 || scenes.length > EDITORIAL_SCENE_LIMIT_V7) {
    throw new Error('v7 exact optimizer requires one to eight scenes');
  }
  scenes.forEach(validateVisitSceneV1);
  const sceneById = new Map(scenes.map((scene) => [scene.sceneId, scene]));
  const declaredSourceIds = new Set(profile.sources.map((source) => source.sourceId));
  if (scenes.some((scene) => scene.sourceIds.some((sourceId) => !declaredSourceIds.has(sourceId)))) {
    throw new Error('optimizer scenes may cite only sources declared by the profile');
  }
  if (sceneById.size !== scenes.length
    || profile.approvedSceneIds.length !== scenes.length
    || profile.approvedSceneIds.some((sceneId) => !sceneById.has(sceneId))) {
    throw new Error('optimizer scenes must exactly match the profile scene IDs');
  }
  const expectedSites = profile.approvedSceneIds.map((sceneId) => {
    const scene = sceneById.get(sceneId) as VisitSceneV1;
    return { siteId: sceneId, lat: scene.observationPoint.lat, lng: scene.observationPoint.lng };
  });
  if (JSON.stringify(matrix.sites) !== JSON.stringify(expectedSites)) {
    throw new Error('walking matrix must contain every profile scene exactly once');
  }
  if (matrix.schemaVersion !== 'walking-matrix-v1'
    || matrix.provider.id !== 'fossgis-osrm-foot'
    || Number.isNaN(Date.parse(matrix.provider.capturedAt))) {
    throw new Error('walking matrix provenance is invalid');
  }
  if (matrix.candidateFingerprint !== walkingMatrixCandidateFingerprintV4(expectedSites)) {
    throw new Error('walking matrix fingerprint changed');
  }
  if (matrix.legs.length !== matrix.sites.length
    || matrix.legs.some((row) => row.length !== matrix.sites.length)) {
    throw new Error('walking matrix is incomplete');
  }
  matrix.legs.forEach((row, fromIndex) => row.forEach((leg, toIndex) => {
    if (leg.reachable) {
      if (typeof leg.meters !== 'number' || typeof leg.seconds !== 'number'
        || !Number.isFinite(leg.meters) || !Number.isFinite(leg.seconds)
        || leg.meters < 0 || leg.seconds < 0) {
        throw new Error(`walking matrix leg ${fromIndex}:${toIndex} is invalid`);
      }
    } else if (leg.meters !== null || leg.seconds !== null) {
      throw new Error(`unreachable walking matrix leg ${fromIndex}:${toIndex} is invalid`);
    }
  }));
  const validateMap = (values: Record<string, number> | undefined, label: string) => {
    for (const [key, value] of Object.entries(values ?? {})) {
      if (!Number.isFinite(value) || value < 0) throw new Error(`${label} ${key} is invalid`);
    }
  };
  validateMap(options.experienceSecondsBySceneId, 'scene experience');
  validateMap(options.sceneComfortPenaltyById, 'scene comfort penalty');
  validateMap(options.legComfortPenaltyByPair, 'leg comfort penalty');
  return sceneById;
}

function hasSceneConflict(route: VisitSceneV1[]): boolean {
  const memberOwners = new Set<string>();
  for (let index = 0; index < route.length; index += 1) {
    const scene = route[index];
    if (scene.memberCanonicalIds.some((id) => memberOwners.has(id))) return true;
    scene.memberCanonicalIds.forEach((id) => memberOwners.add(id));
    if (route.some((other, otherIndex) => otherIndex !== index
      && (scene.conflictsWithSceneIds.includes(other.sceneId)
        || other.conflictsWithSceneIds.includes(scene.sceneId)))) return true;
  }
  return false;
}

function chapterAssignments(
  profile: CityEditorialProfileV1,
  route: VisitSceneV1[]
): Array<{ chapterId: string; sceneId: string }> | null {
  let lastPosition = 0;
  const assignments: Array<{ chapterId: string; sceneId: string }> = [];
  for (const chapterId of profile.arcChapterIds) {
    const chapter = profile.chapters.find((item) => item.chapterId === chapterId)!;
    const position = route.findIndex((scene, index) => (
      index >= lastPosition && chapter.carrierSceneIds.includes(scene.sceneId)
    ));
    if (position < 0) return null;
    lastPosition = position;
    assignments.push({ chapterId, sceneId: route[position].sceneId });
  }
  return assignments;
}

function coversRequirements(profile: CityEditorialProfileV1, route: VisitSceneV1[]): boolean {
  const members = new Set(route.flatMap((scene) => scene.memberCanonicalIds));
  return profile.mustVisitCanonicalIds.every((canonicalId) => members.has(canonicalId));
}

function routeLegs(
  route: VisitSceneV1[],
  matrix: WalkingMatrixSnapshotV4,
  maxSegmentMeters: number
): WalkingLegV4[] | null {
  const legs: WalkingLegV4[] = [];
  for (let index = 1; index < route.length; index += 1) {
    const leg = walkingLegV4(matrix, route[index - 1].sceneId, route[index].sceneId);
    if (!leg.reachable || leg.meters === null || leg.seconds === null || leg.meters > maxSegmentMeters) {
      return null;
    }
    legs.push(leg);
  }
  return legs;
}

function isBridge(
  route: VisitSceneV1[],
  index: number,
  matrix: WalkingMatrixSnapshotV4,
  maxSegmentMeters: number
): boolean {
  if (index === 0 || index === route.length - 1) return false;
  const direct = walkingLegV4(matrix, route[index - 1].sceneId, route[index + 1].sceneId);
  return !direct.reachable || direct.meters === null || direct.meters > maxSegmentMeters;
}

function allScenesContribute(
  profile: CityEditorialProfileV1,
  route: VisitSceneV1[],
  matrix: WalkingMatrixSnapshotV4,
  maxSegmentMeters: number
): boolean {
  return route.every((scene, index) => {
    const others = route.filter((_, otherIndex) => otherIndex !== index);
    const uniquelyRequired = scene.memberCanonicalIds.some((canonicalId) => (
      profile.mustVisitCanonicalIds.includes(canonicalId)
      && !others.some((other) => other.memberCanonicalIds.includes(canonicalId))
    ));
    const uniquelyCarriesChapter = profile.chapters.some((chapter) => (
      chapter.carrierSceneIds.includes(scene.sceneId)
      && !others.some((other) => chapter.carrierSceneIds.includes(other.sceneId))
    ));
    return uniquelyRequired || uniquelyCarriesChapter || isBridge(route, index, matrix, maxSegmentMeters);
  });
}

function evaluateRoute(
  profile: CityEditorialProfileV1,
  route: VisitSceneV1[],
  matrix: WalkingMatrixSnapshotV4,
  options: EditorialRouteOptimizerOptionsV7,
  discarded: DiscardedCountsV7
): EvaluatedRouteV7 | null {
  if (!coversRequirements(profile, route)
    || profile.chapters.some((chapter) => !route.some((scene) => chapter.carrierSceneIds.includes(scene.sceneId)))) {
    discarded.coverage += 1;
    return null;
  }
  if (hasSceneConflict(route)) {
    discarded.conflict += 1;
    return null;
  }
  const assignments = chapterAssignments(profile, route);
  if (!assignments) {
    discarded.arc += 1;
    return null;
  }
  const maxSegmentMeters = options.maxSegmentMeters ?? 1500;
  const legs = routeLegs(route, matrix, maxSegmentMeters);
  if (!legs) {
    discarded.physical += 1;
    return null;
  }
  if (!allScenesContribute(profile, route, matrix, maxSegmentMeters)) {
    discarded.redundant += 1;
    return null;
  }
  const walkingMeters = legs.reduce((sum, leg) => sum + (leg.meters as number), 0);
  const walkingSeconds = legs.reduce((sum, leg) => sum + (leg.seconds as number), 0);
  const explicitExperienceSeconds = route.reduce((sum, scene) => (
    sum + (options.experienceSecondsBySceneId?.[scene.sceneId] ?? 0)
  ), 0);
  const comfortPenalty = route.reduce((sum, scene) => (
    sum + (options.sceneComfortPenaltyById?.[scene.sceneId] ?? 0)
  ), 0) + route.slice(1).reduce((sum, scene, index) => (
    sum + (options.legComfortPenaltyByPair?.[`${route[index].sceneId}>${scene.sceneId}`] ?? 0)
  ), 0);
  const maxMeters = Math.max(0, ...legs.map((leg) => leg.meters as number));
  const maxSeconds = Math.max(0, ...legs.map((leg) => leg.seconds as number));
  const totalSeconds = walkingSeconds + explicitExperienceSeconds;
  return {
    signature: route.map((scene) => scene.sceneId).join('>'),
    totalSeconds,
    route: {
      sceneIds: route.map((scene) => scene.sceneId),
      chapterAssignments: assignments,
      coveredCanonicalIds: [...new Set(route.flatMap((scene) => scene.memberCanonicalIds))].sort(),
      metrics: {
        walkingMeters: Number(walkingMeters.toFixed(2)),
        walkingSeconds: Number(walkingSeconds.toFixed(2)),
        walkingMinutes: Number((walkingSeconds / 60).toFixed(2)),
        maxSegmentMeters: Number(maxMeters.toFixed(2)),
        maxSegmentSeconds: Number(maxSeconds.toFixed(2)),
        maxSegmentMinutes: Number((maxSeconds / 60).toFixed(2)),
        explicitExperienceMinutes: Number((explicitExperienceSeconds / 60).toFixed(2)),
        estimatedTourMinutes: Number((totalSeconds / 60).toFixed(2)),
        comfortPenalty: Number(comfortPenalty.toFixed(2)),
      },
    },
  };
}

function compareRoutes(left: EvaluatedRouteV7, right: EvaluatedRouteV7): number {
  return left.route.metrics.walkingMeters - right.route.metrics.walkingMeters
    || left.route.metrics.maxSegmentMeters - right.route.metrics.maxSegmentMeters
    || left.route.metrics.comfortPenalty - right.route.metrics.comfortPenalty
    || left.route.sceneIds.length - right.route.sceneIds.length
    || left.signature.localeCompare(right.signature);
}

function dominates(left: EvaluatedRouteV7, right: EvaluatedRouteV7): boolean {
  const leftValues = [
    left.route.metrics.walkingMeters,
    left.route.metrics.maxSegmentMeters,
    left.route.metrics.comfortPenalty,
    left.route.sceneIds.length,
  ];
  const rightValues = [
    right.route.metrics.walkingMeters,
    right.route.metrics.maxSegmentMeters,
    right.route.metrics.comfortPenalty,
    right.route.sceneIds.length,
  ];
  return leftValues.every((value, index) => value <= rightValues[index])
    && leftValues.some((value, index) => value < rightValues[index]);
}

function removeDominatedRoutes(routes: EvaluatedRouteV7[]): {
  routes: EvaluatedRouteV7[];
  dominatedCount: number;
} {
  const frontier: EvaluatedRouteV7[] = [];
  let dominatedCount = 0;
  for (const route of routes) {
    if (frontier.some((candidate) => dominates(candidate, route))) {
      dominatedCount += 1;
      continue;
    }
    const survivors = frontier.filter((candidate) => {
      if (!dominates(route, candidate)) return true;
      dominatedCount += 1;
      return false;
    });
    frontier.splice(0, frontier.length, ...survivors, route);
  }
  return { routes: frontier, dominatedCount };
}

export function recommendAdvertisedDurationV7(
  actualMinutes: number,
  requestedDurationMinutes: number
): number {
  if (!Number.isFinite(actualMinutes) || actualMinutes <= 0
    || !Number.isFinite(requestedDurationMinutes) || requestedDurationMinutes <= 0) {
    throw new Error('duration values must be positive');
  }
  const matching = ADVERTISED_DURATIONS.filter((duration) => (
    duration <= requestedDurationMinutes
    && actualMinutes <= duration
    && actualMinutes >= duration * 0.85
  )).at(-1);
  if (matching) return matching;
  return Math.ceil(actualMinutes / 15) * 15;
}

function responsibleRequirements(profile: CityEditorialProfileV1): string[] {
  return [
    ...profile.chapters.map((chapter) => chapter.chapterId),
    ...profile.mustVisitCanonicalIds.map((canonicalId) => `mustVisit:${canonicalId}`),
  ].sort();
}

export function optimizeEditorialRouteV7(
  profile: CityEditorialProfileV1,
  scenes: VisitSceneV1[],
  matrix: WalkingMatrixSnapshotV4,
  options: EditorialRouteOptimizerOptionsV7 = {}
): EditorialRouteOptimizationResultV7 {
  const sceneById = validateInputs(profile, scenes, matrix, options);
  const orderedScenes = profile.approvedSceneIds.map((sceneId) => sceneById.get(sceneId) as VisitSceneV1);
  const discarded: DiscardedCountsV7 = {
    coverage: 0, arc: 0, conflict: 0, physical: 0, redundant: 0, duration: 0,
  };
  const routes: EvaluatedRouteV7[] = [];
  let exploredCompleteOrderCount = 0;
  const enumerate = (route: VisitSceneV1[], remaining: VisitSceneV1[]): void => {
    if (route.length > 0) {
      const evaluated = evaluateRoute(profile, route, matrix, options, discarded);
      if (evaluated) routes.push(evaluated);
    }
    if (remaining.length === 0) exploredCompleteOrderCount += 1;
    for (let index = 0; index < remaining.length; index += 1) {
      enumerate(
        [...route, remaining[index]],
        remaining.filter((_, remainingIndex) => remainingIndex !== index)
      );
    }
  };
  enumerate([], orderedScenes);

  const attemptedDurationMinutes = DURATION_EXTENSIONS.map((extension) => (
    profile.requestedDurationMinutes + extension
  ));
  for (const searchedDurationMinutes of attemptedDurationMinutes) {
    const feasible = routes.filter((route) => route.totalSeconds <= searchedDurationMinutes * 60);
    const nonDominated = removeDominatedRoutes(feasible);
    if (nonDominated.routes.length > 0) {
      const winner = nonDominated.routes.sort(compareRoutes)[0];
      return {
        status: 'selected',
        route: winner.route,
        searchedDurationMinutes,
        recommendedDurationMinutes: options.experienceSecondsBySceneId
          ? recommendAdvertisedDurationV7(
            winner.route.metrics.estimatedTourMinutes,
            Math.max(profile.requestedDurationMinutes, searchedDurationMinutes)
          )
          : null,
        attemptedDurationMinutes: attemptedDurationMinutes.filter((duration) => duration <= searchedDurationMinutes),
        exploredCompleteOrderCount,
        dominatedRouteCount: nonDominated.dominatedCount,
        discardedCounts: discarded,
      };
    }
    discarded.duration += routes.filter((route) => route.totalSeconds > searchedDurationMinutes * 60).length;
  }
  return {
    status: 'infeasible', attemptedDurationMinutes,
    responsibleRequirements: responsibleRequirements(profile),
    exploredCompleteOrderCount, discardedCounts: discarded,
  };
}
