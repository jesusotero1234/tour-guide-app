import {
  EditorialBenchmarkV7,
  validateCityEditorialProfileV1,
  validateVisitSceneV1,
} from './EditorialProfileV7';
import {
  EditorialRouteResultV7,
  EditorialRouteSnapshotV7,
  replayEditorialSnapshotV7,
  runEditorialWorkflowV7,
} from './EditorialWorkflowV7';

export const EDITORIAL_WORKBENCH_SCHEMA_VERSION_V7 = 'editorial-workbench-v7' as const;
const BLIND_REVIEW_CRITERIA_V7 = [
  'critical_coverage', 'progression', 'uniqueness', 'comfort',
  'resolution', 'temporal_honesty', 'willingness_to_pay',
] as const;
const EXTERNAL_GATE_KEYS_V7: Array<keyof EditorialExternalGatesV7> = [
  'blindReview', 'realAudio', 'calibration', 'sealedHoldouts', 'streetAudit',
];

export interface BlindReviewCardV7 {
  cardId: string;
  productPromise: string;
  stops: Array<{ name: string; contribution: string }>;
  map: Array<{ lat: number; lng: number }>;
  walkingMeters: number;
  walkingMinutes: number;
  maxSegmentMeters: number;
  moduleOptions: Array<{
    stopName: string;
    mainContribution: string;
    deepDiveOptions: string[];
  }>;
  durationRangeMinutes: { minimum: number; maximum: number };
  durationBasis: 'walking_osrm+planned_words+explicit_observations';
  reviewCriteria: [
    'critical_coverage', 'progression', 'uniqueness', 'comfort',
    'resolution', 'temporal_honesty', 'willingness_to_pay',
  ];
}

export interface EditorialExternalGatesV7 {
  blindReview: 'pending' | 'passed' | 'failed';
  realAudio: 'pending' | 'passed' | 'failed';
  calibration: 'pending' | 'passed' | 'failed';
  sealedHoldouts: 'pending' | 'passed' | 'failed';
  streetAudit: 'pending' | 'passed' | 'failed' | 'not_applicable';
}

export interface EditorialWorkbenchV7 {
  schemaVersion: typeof EDITORIAL_WORKBENCH_SCHEMA_VERSION_V7;
  benchmark: EditorialBenchmarkV7;
  blindReviewCards: BlindReviewCardV7[];
  expectedRoute: {
    sceneIds: string[];
    walkingMeters: number;
    walkingMinutes: number;
    maxSegmentMeters: number;
  };
  snapshot: EditorialRouteSnapshotV7;
  externalGates: EditorialExternalGatesV7;
}

function validateBenchmark(benchmark: EditorialBenchmarkV7): void {
  if (benchmark.schemaVersion !== 'editorial-benchmark-v7') throw new Error('invalid v7 benchmark schemaVersion');
  if (!benchmark.caseId.trim() || !benchmark.cityKey.trim() || !benchmark.theme.trim()
    || !Number.isFinite(benchmark.requestedDurationMinutes)
    || benchmark.mustVisitCanonicalIds.length === 0
    || benchmark.requiredChapters.length === 0) {
    throw new Error('v7 benchmark metadata is incomplete');
  }
  if (benchmark.diagnosticReferenceRoutes.some((route) => (
    route.purpose !== 'diagnostic_only' || route.sceneIds.length === 0
  ))) throw new Error('v7 reference routes must remain diagnostic only');
}

function validateBlindCards(cards: BlindReviewCardV7[]): void {
  if (cards.length === 0) return;
  if (cards.length !== 3 || new Set(cards.map((card) => card.cardId)).size !== 3) {
    throw new Error('blind review requires zero or exactly three distinct cards');
  }
  const keys = Object.keys(cards[0]).sort().join(',');
  for (const card of cards) {
    if (Object.keys(card).sort().join(',') !== keys) throw new Error('blind cards must use identical fields');
    if (!card.cardId.trim() || !card.productPromise.trim()
      || card.stops.length === 0
      || card.map.length !== card.stops.length
      || card.moduleOptions.length !== card.stops.length
      || card.moduleOptions.some((module, index) => module.stopName !== card.stops[index].name)
      || card.stops.some((stop) => !stop.name.trim() || !stop.contribution.trim())
      || card.map.some((point) => !Number.isFinite(point.lat) || point.lat < -90 || point.lat > 90
        || !Number.isFinite(point.lng) || point.lng < -180 || point.lng > 180)
      || card.moduleOptions.some((module) => !module.mainContribution.trim()
        || module.deepDiveOptions.some((option) => !option.trim()))
      || !Number.isFinite(card.walkingMeters) || card.walkingMeters <= 0
      || !Number.isFinite(card.walkingMinutes) || card.walkingMinutes <= 0
      || !Number.isFinite(card.maxSegmentMeters) || card.maxSegmentMeters <= 0
      || card.durationRangeMinutes.minimum <= 0
      || card.durationRangeMinutes.maximum < card.durationRangeMinutes.minimum
      || card.durationBasis !== 'walking_osrm+planned_words+explicit_observations'
      || JSON.stringify(card.reviewCriteria) !== JSON.stringify(BLIND_REVIEW_CRITERIA_V7)) {
      throw new Error(`blind card ${card.cardId} is invalid`);
    }
  }
}

function exact(value: unknown, expected: unknown, label: string): void {
  if (JSON.stringify(value) !== JSON.stringify(expected)) throw new Error(`v7 workbench ${label} changed`);
}

function gatesAreUnperformed(gates: EditorialExternalGatesV7, requiresStreetAudit: boolean): boolean {
  return JSON.stringify(Object.keys(gates).sort()) === JSON.stringify([...EXTERNAL_GATE_KEYS_V7].sort())
    && gates.blindReview === 'pending'
    && gates.realAudio === 'pending'
    && gates.calibration === 'pending'
    && gates.sealedHoldouts === 'pending'
    && gates.streetAudit === (requiresStreetAudit ? 'pending' : 'not_applicable');
}

export function validateEditorialWorkbenchV7(value: EditorialWorkbenchV7): EditorialWorkbenchV7 {
  if (value.schemaVersion !== EDITORIAL_WORKBENCH_SCHEMA_VERSION_V7) {
    throw new Error('invalid editorial workbench schemaVersion');
  }
  validateBenchmark(value.benchmark);
  validateBlindCards(value.blindReviewCards);
  const profile = value.snapshot.profile;
  const scenes = value.snapshot.scenes;
  validateCityEditorialProfileV1(profile);
  scenes.forEach(validateVisitSceneV1);
  if (profile.cityKey !== value.benchmark.cityKey
    || profile.theme !== value.benchmark.theme
    || profile.requestedDurationMinutes !== value.benchmark.requestedDurationMinutes
    || JSON.stringify(profile.mustVisitCanonicalIds)
      !== JSON.stringify(value.benchmark.mustVisitCanonicalIds)
    || JSON.stringify(profile.chapters) !== JSON.stringify(value.benchmark.requiredChapters)) {
    throw new Error('v7 workbench benchmark and profile do not match');
  }
  if (profile.status !== 'review_required'
    || !gatesAreUnperformed(value.externalGates, profile.requiresStreetAudit)) {
    throw new Error('unperformed editorial gates cannot be recorded as approved');
  }
  const storyPlan = value.snapshot.storyPlanCall?.value;
  if (!storyPlan
    || storyPlan.routeSceneIds.length !== value.expectedRoute.sceneIds.length
    || storyPlan.routeSceneIds.some((id, index) => id !== value.expectedRoute.sceneIds[index])) {
    throw new Error('v7 workbench story plan changed the expected route');
  }
  const selectedRoute = value.snapshot.optimization.status === 'selected'
    ? value.snapshot.optimization.route
    : null;
  if (!selectedRoute
    || JSON.stringify(selectedRoute.sceneIds) !== JSON.stringify(value.expectedRoute.sceneIds)
    || selectedRoute.metrics.walkingMeters !== value.expectedRoute.walkingMeters
    || selectedRoute.metrics.walkingMinutes !== value.expectedRoute.walkingMinutes
    || selectedRoute.metrics.maxSegmentMeters !== value.expectedRoute.maxSegmentMeters) {
    throw new Error('v7 workbench optimization changed the expected route');
  }
  replayEditorialSnapshotV7(value.snapshot);
  return value;
}

export async function replayEditorialWorkbenchV7(
  workbench: EditorialWorkbenchV7
): Promise<EditorialRouteResultV7 & { externalGates: EditorialExternalGatesV7 }> {
  validateEditorialWorkbenchV7(workbench);
  const storyPlan = workbench.snapshot.storyPlanCall?.value;
  if (!storyPlan) throw new Error('v7 workbench story plan is required for replay');
  const result = await runEditorialWorkflowV7({
    profile: workbench.snapshot.profile,
    scenes: workbench.snapshot.scenes,
    matrix: workbench.snapshot.matrix,
    language: workbench.snapshot.language,
    generateStoryPlan: async () => JSON.stringify(storyPlan),
    wordsPerMinute: workbench.snapshot.wordsPerMinute ?? undefined,
    createdAt: workbench.snapshot.createdAt,
  });
  exact(result.snapshot, workbench.snapshot, 'full replay');
  return { ...result, externalGates: workbench.externalGates };
}
