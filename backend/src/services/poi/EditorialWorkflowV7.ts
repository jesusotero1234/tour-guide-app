import {
  CityEditorialProfileV1,
  editorialFingerprintV7,
  EditorialHumanReviewV1,
  profileContentFingerprintV7,
  sceneContentFingerprintV7,
  validateCityEditorialProfileV1,
  validateVisitSceneV1,
  VisitSceneV1,
} from './EditorialProfileV7';
import {
  EditorialRouteOptimizationResultV7,
  EditorialRouteV7,
  optimizeEditorialRouteV7,
} from './EditorialRouteOptimizerV7';
import {
  buildStoryPlanRequestV7,
  calculateEditorialDurationV7,
  EditorialAudioV7,
  EditorialDurationResultV7,
  requestStoryPlanV7,
  StoryModulePlanV1,
  StoryPlanCallResultV7,
  StoryPlanGeneratorV7,
  storyPlanPromptFingerprintV7,
  validateStoryModulePlanV1,
} from './EditorialStoryPlanV7';
import { WalkingMatrixSnapshotV4 } from './EditorialWalkingMatrixV4';

export const EDITORIAL_ROUTE_SNAPSHOT_SCHEMA_VERSION_V7 = 'editorial-route-snapshot-v7' as const;

export interface EditorialStreetAuditV1 {
  status: 'approved' | 'changes_required';
  auditor: string;
  auditedAt: string;
  reason: string;
  routeFingerprint: string;
}

export interface EditorialComponentFingerprintsV7 {
  profile: string;
  scenes: string;
  matrix: string;
  route: string;
  plan: string;
  audio: string;
}

export interface EditorialFingerprintInputV7 {
  profile: CityEditorialProfileV1;
  scenes: VisitSceneV1[];
  matrix: WalkingMatrixSnapshotV4;
  route: EditorialRouteV7 | null;
  plan: StoryModulePlanV1 | null;
  audioByModuleId: Record<string, EditorialAudioV7> | null;
}

export interface EditorialWorkflowInputV7 {
  profile: CityEditorialProfileV1;
  scenes: VisitSceneV1[];
  matrix: WalkingMatrixSnapshotV4;
  language: string;
  generateStoryPlan?: StoryPlanGeneratorV7;
  wordsPerMinute?: number;
  audioByModuleId?: Record<string, EditorialAudioV7>;
  routeReview?: EditorialHumanReviewV1;
  streetAudit?: EditorialStreetAuditV1;
  createdAt?: string;
}

export interface EditorialRouteSnapshotV7 {
  schemaVersion: typeof EDITORIAL_ROUTE_SNAPSHOT_SCHEMA_VERSION_V7;
  createdAt: string;
  status: EditorialRouteResultV7['status'];
  reason: string | null;
  language: string;
  profile: CityEditorialProfileV1;
  scenes: VisitSceneV1[];
  matrix: WalkingMatrixSnapshotV4;
  optimization: EditorialRouteOptimizationResultV7;
  storyPlanCall: StoryPlanCallResultV7 | null;
  wordsPerMinute: number | null;
  audioByModuleId: Record<string, EditorialAudioV7> | null;
  duration: EditorialDurationResultV7 | null;
  routeReview: EditorialHumanReviewV1 | null;
  streetAudit: EditorialStreetAuditV1 | null;
  fingerprints: EditorialComponentFingerprintsV7;
}

export interface EditorialRouteResultV7 {
  status: 'verified' | 'draft_only' | 'review_required' | 'infeasible';
  reason: string | null;
  profile: CityEditorialProfileV1;
  scenes: VisitSceneV1[];
  route: EditorialRouteV7 | null;
  discards: EditorialRouteOptimizationResultV7['discardedCounts'];
  storyPlanCall: StoryPlanCallResultV7 | null;
  duration: EditorialDurationResultV7 | null;
  fingerprints: EditorialComponentFingerprintsV7;
  snapshot: EditorialRouteSnapshotV7;
}

const FINGERPRINT_COMPONENTS: Array<keyof EditorialComponentFingerprintsV7> = [
  'profile', 'scenes', 'matrix', 'route', 'plan', 'audio',
];

function orderedRecord<T>(value: Record<string, T> | null): Array<[string, T]> | null {
  return value ? Object.entries(value).sort(([left], [right]) => left.localeCompare(right)) : null;
}

export function createEditorialComponentFingerprintsV7(
  input: EditorialFingerprintInputV7
): EditorialComponentFingerprintsV7 {
  return {
    profile: editorialFingerprintV7(input.profile),
    scenes: editorialFingerprintV7([...input.scenes].sort((left, right) => left.sceneId.localeCompare(right.sceneId))),
    matrix: editorialFingerprintV7(input.matrix),
    route: editorialFingerprintV7(input.route),
    plan: editorialFingerprintV7(input.plan),
    audio: editorialFingerprintV7(orderedRecord(input.audioByModuleId)),
  };
}

export function changedEditorialComponentsV7(
  saved: EditorialComponentFingerprintsV7,
  current: EditorialComponentFingerprintsV7
): Array<keyof EditorialComponentFingerprintsV7> {
  return FINGERPRINT_COMPONENTS.filter((component) => saved[component] !== current[component]);
}

function reviewIsValid(
  review: EditorialHumanReviewV1 | undefined | null,
  fingerprint: string,
  allowedSourceIds: Set<string>
): boolean {
  return Boolean(review
    && review.author.trim()
    && review.reason.trim()
    && !Number.isNaN(Date.parse(review.reviewedAt))
    && review.sourceIds.length > 0
    && review.sourceIds.every((sourceId) => allowedSourceIds.has(sourceId))
    && review.approvedFingerprint === fingerprint);
}

function streetAuditIsValid(
  audit: EditorialStreetAuditV1 | undefined | null,
  routeFingerprint: string
): boolean {
  return Boolean(audit
    && audit.status === 'approved'
    && audit.auditor.trim()
    && audit.reason.trim()
    && !Number.isNaN(Date.parse(audit.auditedAt))
    && audit.routeFingerprint === routeFingerprint);
}

function editorialProductIsApproved(profile: CityEditorialProfileV1, scenes: VisitSceneV1[]): boolean {
  try {
    validateCityEditorialProfileV1(profile);
    scenes.forEach(validateVisitSceneV1);
  } catch {
    return false;
  }
  return profile.status === 'approved'
    && profile.review?.approvedFingerprint === profileContentFingerprintV7(profile)
    && scenes.every((scene) => scene.status === 'approved'
      && scene.review?.approvedFingerprint === sceneContentFingerprintV7(scene));
}

function decision(input: {
  profile: CityEditorialProfileV1;
  scenes: VisitSceneV1[];
  route: EditorialRouteV7;
  storyPlanCall: StoryPlanCallResultV7 | null;
  duration: EditorialDurationResultV7 | null;
  routeReview: EditorialHumanReviewV1 | null;
  streetAudit: EditorialStreetAuditV1 | null;
}): Pick<EditorialRouteResultV7, 'status' | 'reason'> {
  if (!editorialProductIsApproved(input.profile, input.scenes)) {
    return { status: 'draft_only', reason: 'editorial_review_required' };
  }
  if (!input.storyPlanCall?.value) {
    return {
      status: 'review_required',
      reason: input.storyPlanCall ? `story_plan_${input.storyPlanCall.status}` : 'story_plan_required',
    };
  }
  if (!input.duration || input.duration.narrationSource !== 'audio_actual') {
    return { status: 'review_required', reason: 'real_audio_required' };
  }
  if (input.duration.totalMinutes > input.profile.requestedDurationMinutes + 60) {
    return { status: 'review_required', reason: 'duration_exceeds_maximum_extension' };
  }
  const routeFingerprint = editorialFingerprintV7(input.route);
  const allowedSourceIds = new Set(input.profile.sources.map((source) => source.sourceId));
  if (!reviewIsValid(input.routeReview, routeFingerprint, allowedSourceIds)) {
    return { status: 'review_required', reason: 'route_review_required' };
  }
  if (input.profile.requiresStreetAudit && !streetAuditIsValid(input.streetAudit, routeFingerprint)) {
    return { status: 'review_required', reason: 'street_audit_required' };
  }
  const advertised = input.duration.recommendedDurationMinutes;
  if (input.duration.totalMinutes > advertised || input.duration.totalMinutes < advertised * 0.85) {
    return { status: 'review_required', reason: 'duration_band_review_required' };
  }
  return { status: 'verified', reason: null };
}

function snapshot(
  input: EditorialWorkflowInputV7,
  optimization: EditorialRouteOptimizationResultV7,
  storyPlanCall: StoryPlanCallResultV7 | null,
  duration: EditorialDurationResultV7 | null,
  status: EditorialRouteResultV7['status'],
  reason: string | null
): EditorialRouteSnapshotV7 {
  const route = optimization.status === 'selected' ? optimization.route : null;
  const plan = storyPlanCall?.value ?? null;
  const audio = input.audioByModuleId ?? null;
  return {
    schemaVersion: EDITORIAL_ROUTE_SNAPSHOT_SCHEMA_VERSION_V7,
    createdAt: input.createdAt ?? new Date().toISOString(),
    status, reason, language: input.language,
    profile: input.profile,
    scenes: input.scenes,
    matrix: input.matrix,
    optimization,
    storyPlanCall,
    wordsPerMinute: audio ? null : (input.wordsPerMinute ?? 150),
    audioByModuleId: audio,
    duration,
    routeReview: input.routeReview ?? null,
    streetAudit: input.streetAudit ?? null,
    fingerprints: createEditorialComponentFingerprintsV7({
      profile: input.profile, scenes: input.scenes, matrix: input.matrix, route, plan,
      audioByModuleId: audio,
    }),
  };
}

function resultFromSnapshot(value: EditorialRouteSnapshotV7): EditorialRouteResultV7 {
  return {
    status: value.status,
    reason: value.reason,
    profile: value.profile,
    scenes: value.scenes,
    route: value.optimization.status === 'selected' ? value.optimization.route : null,
    discards: value.optimization.discardedCounts,
    storyPlanCall: value.storyPlanCall,
    duration: value.duration,
    fingerprints: value.fingerprints,
    snapshot: value,
  };
}

export async function runEditorialWorkflowV7(
  input: EditorialWorkflowInputV7
): Promise<EditorialRouteResultV7> {
  const optimization = optimizeEditorialRouteV7(input.profile, input.scenes, input.matrix);
  if (optimization.status === 'infeasible') {
    return resultFromSnapshot(snapshot(
      input, optimization, null, null, 'infeasible', 'route_infeasible'
    ));
  }
  let storyPlanCall: StoryPlanCallResultV7 | null = null;
  let duration: EditorialDurationResultV7 | null = null;
  if (input.generateStoryPlan) {
    const request = buildStoryPlanRequestV7(optimization.route.sceneIds, input.scenes, input.language);
    storyPlanCall = await requestStoryPlanV7(request, input.generateStoryPlan);
    if (storyPlanCall.value) {
      duration = calculateEditorialDurationV7({
        requestedDurationMinutes: input.profile.requestedDurationMinutes,
        walkingSeconds: optimization.route.metrics.walkingSeconds,
        plan: storyPlanCall.value,
        wordsPerMinute: input.wordsPerMinute,
        audioByModuleId: input.audioByModuleId,
      });
    }
  }
  const finalDecision = decision({
    profile: input.profile, scenes: input.scenes, route: optimization.route,
    storyPlanCall, duration,
    routeReview: input.routeReview ?? null,
    streetAudit: input.streetAudit ?? null,
  });
  return resultFromSnapshot(snapshot(
    input, optimization, storyPlanCall, duration, finalDecision.status, finalDecision.reason
  ));
}

function assertExact(label: string, actual: unknown, expected: unknown): void {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`v7 snapshot ${label} changed`);
}

export function replayEditorialSnapshotV7(
  saved: EditorialRouteSnapshotV7
): EditorialRouteSnapshotV7 {
  if (saved.schemaVersion !== EDITORIAL_ROUTE_SNAPSHOT_SCHEMA_VERSION_V7) {
    throw new Error('invalid editorial route snapshot schemaVersion');
  }
  const route = saved.optimization.status === 'selected' ? saved.optimization.route : null;
  const plan = saved.storyPlanCall?.value ?? null;
  const currentFingerprints = createEditorialComponentFingerprintsV7({
    profile: saved.profile, scenes: saved.scenes, matrix: saved.matrix, route, plan,
    audioByModuleId: saved.audioByModuleId,
  });
  const changed = changedEditorialComponentsV7(saved.fingerprints, currentFingerprints);
  if (changed.length > 0) throw new Error(`v7 snapshot changed components: ${changed.join(', ')}`);
  const optimization = optimizeEditorialRouteV7(saved.profile, saved.scenes, saved.matrix);
  assertExact('route optimization', optimization, saved.optimization);
  if (optimization.status === 'infeasible') {
    if (saved.status !== 'infeasible' || saved.reason !== 'route_infeasible'
      || saved.storyPlanCall !== null || saved.duration !== null) {
      throw new Error('v7 infeasible snapshot decision changed');
    }
    return saved;
  }
  let duration: EditorialDurationResultV7 | null = null;
  if (saved.storyPlanCall?.value) {
    const request = buildStoryPlanRequestV7(optimization.route.sceneIds, saved.scenes, saved.language);
    assertExact('story input', saved.storyPlanCall.input, request);
    if (saved.storyPlanCall.promptFingerprint !== storyPlanPromptFingerprintV7()) {
      throw new Error('v7 snapshot story prompt changed');
    }
    const validatedPlan = validateStoryModulePlanV1(saved.storyPlanCall.value, request);
    assertExact('story plan', validatedPlan, saved.storyPlanCall.value);
    const validAttempt = saved.storyPlanCall.attempts.find((attempt) => (
      attempt.status === 'valid' && attempt.rawOutput !== null
    ));
    try {
      if (!validAttempt?.rawOutput) throw new Error('missing output');
      const rawPlan = validateStoryModulePlanV1(JSON.parse(validAttempt.rawOutput), request);
      assertExact('raw story output', rawPlan, validatedPlan);
    } catch {
      throw new Error('v7 snapshot raw story output changed');
    }
    duration = calculateEditorialDurationV7({
      requestedDurationMinutes: saved.profile.requestedDurationMinutes,
      walkingSeconds: optimization.route.metrics.walkingSeconds,
      plan: validatedPlan,
      wordsPerMinute: saved.wordsPerMinute ?? undefined,
      audioByModuleId: saved.audioByModuleId ?? undefined,
    });
  }
  assertExact('duration', duration, saved.duration);
  const finalDecision = decision({
    profile: saved.profile, scenes: saved.scenes, route: optimization.route,
    storyPlanCall: saved.storyPlanCall,
    duration,
    routeReview: saved.routeReview,
    streetAudit: saved.streetAudit,
  });
  assertExact('decision', finalDecision, { status: saved.status, reason: saved.reason });
  return saved;
}
