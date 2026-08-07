import { createHash } from 'crypto';

export const EDITORIAL_BENCHMARK_SCHEMA_VERSION_V7 = 'editorial-benchmark-v7' as const;
export const CITY_EDITORIAL_PROFILE_SCHEMA_VERSION_V1 = 'city-editorial-profile-v1' as const;
export const VISIT_SCENE_SCHEMA_VERSION_V1 = 'visit-scene-v1' as const;
export const EDITORIAL_SCENE_LIMIT_V7 = 8;
export const EDITORIAL_SCENE_FACT_LIMIT_V7 = 4;
export const EDITORIAL_FACT_CHARACTER_LIMIT_V7 = 280;

export type EditorialReviewStatusV1 = 'approved' | 'review_required';
export type EvidenceRoleV1 = 'observable' | 'historical_context' | 'local_function' | 'distinctive';
const EDITORIAL_REVIEW_STATUSES: EditorialReviewStatusV1[] = ['approved', 'review_required'];
const EVIDENCE_ROLES: EvidenceRoleV1[] = [
  'observable', 'historical_context', 'local_function', 'distinctive',
];

export interface OfficialSourceExcerptV1 {
  sourceId: string;
  url: string;
  title: string;
  capturedAt: string;
  excerpt: string;
  contentFingerprint: string;
}

export interface OwnedEvidenceFactV1 {
  factId: string;
  ownerCanonicalId: string;
  sourceId: string;
  role: EvidenceRoleV1;
  value: string;
}

export interface EditorialHumanReviewV1 {
  author: string;
  reviewedAt: string;
  reason: string;
  sourceIds: string[];
  approvedFingerprint: string;
}

export interface EditorialOverrideV1 {
  author: string;
  recordedAt: string;
  reason: string;
  sourceIds: string[];
}

export interface VisitSceneV1 {
  schemaVersion: typeof VISIT_SCENE_SCHEMA_VERSION_V1;
  sceneId: string;
  status: EditorialReviewStatusV1;
  primaryCanonicalId: string;
  memberCanonicalIds: string[];
  name: string;
  observationPoint: { lat: number; lng: number };
  facts: OwnedEvidenceFactV1[];
  sourceIds: string[];
  conflictsWithSceneIds: string[];
  review: EditorialHumanReviewV1 | null;
}

export interface EditorialChapterV1 {
  chapterId: string;
  title: string;
  carrierSceneIds: string[];
}

export interface CityEditorialProfileV1 {
  schemaVersion: typeof CITY_EDITORIAL_PROFILE_SCHEMA_VERSION_V1;
  cityKey: string;
  theme: string;
  productPromise: string;
  requestedDurationMinutes: number;
  status: EditorialReviewStatusV1;
  mustVisitCanonicalIds: string[];
  chapters: EditorialChapterV1[];
  arcChapterIds: string[];
  approvedSceneIds: string[];
  sources: OfficialSourceExcerptV1[];
  overrides: EditorialOverrideV1[];
  requiresStreetAudit: boolean;
  review: EditorialHumanReviewV1 | null;
}

export interface EditorialBenchmarkV7 {
  schemaVersion: typeof EDITORIAL_BENCHMARK_SCHEMA_VERSION_V7;
  caseId: string;
  cityKey: string;
  theme: string;
  requestedDurationMinutes: number;
  mustVisitCanonicalIds: string[];
  requiredChapters: EditorialChapterV1[];
  diagnosticReferenceRoutes: Array<{
    routeId: string;
    purpose: 'diagnostic_only';
    sceneIds: string[];
  }>;
}

export interface BlindReviewV7 {
  reviewerId: string;
  wouldPay: boolean;
  criticalOmissions: string[];
  scores: {
    criticalCoverage: number;
    progression: number;
    uniqueness: number;
    comfort: number;
    resolution: number;
    temporalHonesty: number;
  };
}

export interface BlindReviewGateV7 {
  passed: boolean;
  payVotes: number;
  coherenceMedian: number;
  comfortMedian: number;
  repeatedCriticalOmissions: string[];
}

type ReviewInput = Omit<EditorialHumanReviewV1, 'approvedFingerprint'>;

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

export function editorialFingerprintV7(value: unknown): string {
  return createHash('sha256').update(JSON.stringify(stableValue(value))).digest('hex');
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function uniqueStrings(values: unknown, label: string): asserts values is string[] {
  if (!Array.isArray(values) || values.some((value) => typeof value !== 'string' || value !== value.trim() || !value)
    || new Set(values).size !== values.length) {
    throw new Error(`${label} must contain unique non-empty strings`);
  }
}

function validateReview(
  review: EditorialHumanReviewV1 | null,
  expectedFingerprint: string,
  sourceIds: Set<string>,
  label: string
): void {
  if (!review
    || !review.author.trim()
    || !review.reason.trim()
    || Number.isNaN(Date.parse(review.reviewedAt))
    || review.sourceIds.length === 0
    || review.sourceIds.some((sourceId) => !sourceIds.has(sourceId))
    || review.approvedFingerprint !== expectedFingerprint) {
    throw new Error(`${label} requires a matching human review`);
  }
}

function sourceIds(sources: OfficialSourceExcerptV1[]): Set<string> {
  if (sources.length === 0) throw new Error('profile requires at least one official source');
  uniqueStrings(sources.map((source) => source.sourceId), 'profile source IDs');
  for (const item of sources) {
    const url = requiredString(item.url, `source ${item.sourceId} URL`);
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') throw new Error('unsupported protocol');
    } catch {
      throw new Error(`source ${item.sourceId} URL must be HTTP(S)`);
    }
    requiredString(item.title, `source ${item.sourceId} title`);
    requiredString(item.contentFingerprint, `source ${item.sourceId} fingerprint`);
    if (item.contentFingerprint !== editorialFingerprintV7(item.excerpt)) {
      throw new Error(`source fingerprint changed for ${item.sourceId}`);
    }
    if (Number.isNaN(Date.parse(item.capturedAt))) throw new Error(`source ${item.sourceId} capturedAt is invalid`);
    if (!item.excerpt.trim() || item.excerpt.length > EDITORIAL_FACT_CHARACTER_LIMIT_V7) {
      throw new Error(`source ${item.sourceId} excerpt must be 1 to 280 characters`);
    }
  }
  return new Set(sources.map((source) => source.sourceId));
}

export function sceneContentFingerprintV7(scene: VisitSceneV1): string {
  const { status: _status, review: _review, ...content } = scene;
  return editorialFingerprintV7(content);
}

export function profileContentFingerprintV7(profile: CityEditorialProfileV1): string {
  const { status: _status, review: _review, ...content } = profile;
  return editorialFingerprintV7(content);
}

export function approveVisitSceneV7(scene: VisitSceneV1, review: ReviewInput): VisitSceneV1 {
  const draft = { ...scene, status: 'review_required' as const, review: null };
  return {
    ...draft,
    status: 'approved',
    review: { ...review, approvedFingerprint: sceneContentFingerprintV7(draft) },
  };
}

export function approveCityEditorialProfileV7(
  profile: CityEditorialProfileV1,
  review: ReviewInput
): CityEditorialProfileV1 {
  const draft = { ...profile, status: 'review_required' as const, review: null };
  return {
    ...draft,
    status: 'approved',
    review: { ...review, approvedFingerprint: profileContentFingerprintV7(draft) },
  };
}

export function validateVisitSceneV1(scene: VisitSceneV1): VisitSceneV1 {
  if (scene.schemaVersion !== VISIT_SCENE_SCHEMA_VERSION_V1) throw new Error('invalid visit scene schemaVersion');
  requiredString(scene.sceneId, 'sceneId');
  if (!EDITORIAL_REVIEW_STATUSES.includes(scene.status)) throw new Error('invalid scene review status');
  requiredString(scene.primaryCanonicalId, 'primaryCanonicalId');
  requiredString(scene.name, 'scene name');
  uniqueStrings(scene.memberCanonicalIds, 'scene memberCanonicalIds');
  uniqueStrings(scene.sourceIds, 'scene sourceIds');
  uniqueStrings(scene.conflictsWithSceneIds, 'scene conflicts');
  if (!scene.memberCanonicalIds.includes(scene.primaryCanonicalId)) {
    throw new Error('primary identity must be an exact scene member');
  }
  if (!Number.isFinite(scene.observationPoint.lat) || scene.observationPoint.lat < -90
    || scene.observationPoint.lat > 90 || !Number.isFinite(scene.observationPoint.lng)
    || scene.observationPoint.lng < -180 || scene.observationPoint.lng > 180) {
    throw new Error('scene observation point is invalid');
  }
  if (scene.facts.length === 0 || scene.facts.length > EDITORIAL_SCENE_FACT_LIMIT_V7) {
    throw new Error('scene must contain one to four evidence facts');
  }
  uniqueStrings(scene.facts.map((fact) => fact.factId), 'scene fact IDs');
  for (const fact of scene.facts) {
    if (!EVIDENCE_ROLES.includes(fact.role)) throw new Error('scene evidence role is invalid');
    if (!scene.memberCanonicalIds.includes(fact.ownerCanonicalId)) {
      throw new Error('fact owner must be an exact scene member');
    }
    if (!scene.sourceIds.includes(fact.sourceId)) throw new Error('scene fact source is not declared');
    if (!fact.value.trim() || fact.value.length > EDITORIAL_FACT_CHARACTER_LIMIT_V7) {
      throw new Error('scene evidence fact must be complete and at most 280 characters');
    }
  }
  if (scene.status === 'approved') {
    validateReview(scene.review, sceneContentFingerprintV7(scene), new Set(scene.sourceIds), 'approved scene');
  } else if (scene.review !== null) {
    throw new Error('review-required scene cannot contain an approval');
  }
  return scene;
}

export function validateCityEditorialProfileV1(profile: CityEditorialProfileV1): CityEditorialProfileV1 {
  if (profile.schemaVersion !== CITY_EDITORIAL_PROFILE_SCHEMA_VERSION_V1) throw new Error('invalid profile schemaVersion');
  requiredString(profile.cityKey, 'profile cityKey');
  requiredString(profile.theme, 'profile theme');
  requiredString(profile.productPromise, 'profile productPromise');
  if (!EDITORIAL_REVIEW_STATUSES.includes(profile.status)) throw new Error('invalid profile review status');
  if (typeof profile.requiresStreetAudit !== 'boolean') throw new Error('profile street-audit flag is invalid');
  if (!Number.isFinite(profile.requestedDurationMinutes) || profile.requestedDurationMinutes <= 0) {
    throw new Error('profile requestedDurationMinutes is invalid');
  }
  uniqueStrings(profile.mustVisitCanonicalIds, 'profile mustVisit');
  uniqueStrings(profile.approvedSceneIds, 'profile approvedSceneIds');
  if (profile.approvedSceneIds.length === 0 || profile.approvedSceneIds.length > EDITORIAL_SCENE_LIMIT_V7) {
    throw new Error('profile requires one to eight approved scenes');
  }
  uniqueStrings(profile.chapters.map((chapter) => chapter.chapterId), 'profile chapter IDs');
  for (const chapter of profile.chapters) {
    requiredString(chapter.title, `chapter ${chapter.chapterId} title`);
    uniqueStrings(chapter.carrierSceneIds, `chapter ${chapter.chapterId} carriers`);
    if (chapter.carrierSceneIds.length === 0
      || chapter.carrierSceneIds.some((sceneId) => !profile.approvedSceneIds.includes(sceneId))) {
      throw new Error(`chapter ${chapter.chapterId} requires declared scene carriers`);
    }
  }
  uniqueStrings(profile.arcChapterIds, 'profile arc');
  if (profile.arcChapterIds.length !== profile.chapters.length
    || profile.arcChapterIds.some((id) => !profile.chapters.some((chapter) => chapter.chapterId === id))) {
    throw new Error('profile arc must contain every required chapter exactly once');
  }
  const declaredSources = sourceIds(profile.sources);
  for (const override of profile.overrides) {
    if (!override.author.trim() || !override.reason.trim() || Number.isNaN(Date.parse(override.recordedAt))
      || override.sourceIds.length === 0 || override.sourceIds.some((sourceId) => !declaredSources.has(sourceId))) {
      throw new Error('profile override requires author, date, reason, and declared sources');
    }
  }
  if (profile.status === 'approved') {
    validateReview(profile.review, profileContentFingerprintV7(profile), declaredSources, 'approved profile');
  } else if (profile.review !== null) {
    throw new Error('review-required profile cannot contain an approval');
  }
  return profile;
}

export function buildProfileProposalV7(
  benchmark: EditorialBenchmarkV7,
  input: Pick<CityEditorialProfileV1,
    'productPromise' | 'arcChapterIds' | 'sources' | 'approvedSceneIds' | 'requiresStreetAudit'>
): CityEditorialProfileV1 {
  if (benchmark.schemaVersion !== EDITORIAL_BENCHMARK_SCHEMA_VERSION_V7) throw new Error('invalid benchmark schemaVersion');
  return validateCityEditorialProfileV1({
    schemaVersion: CITY_EDITORIAL_PROFILE_SCHEMA_VERSION_V1,
    cityKey: benchmark.cityKey,
    theme: benchmark.theme,
    productPromise: input.productPromise,
    requestedDurationMinutes: benchmark.requestedDurationMinutes,
    status: 'review_required',
    mustVisitCanonicalIds: [...benchmark.mustVisitCanonicalIds],
    chapters: benchmark.requiredChapters.map((chapter) => ({
      ...chapter, carrierSceneIds: [...chapter.carrierSceneIds],
    })),
    arcChapterIds: [...input.arcChapterIds],
    approvedSceneIds: [...input.approvedSceneIds],
    sources: [...input.sources],
    overrides: [],
    requiresStreetAudit: input.requiresStreetAudit,
    review: null,
  });
}

const ROLE_ORDER: EvidenceRoleV1[] = [
  'observable', 'historical_context', 'local_function', 'distinctive',
];

function tokens(value: string): Set<string> {
  return new Set(value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .split(/[^a-z0-9]+/).filter((token) => token.length >= 4));
}

function novelty(fact: OwnedEvidenceFactV1, selected: OwnedEvidenceFactV1[]): number {
  const used = new Set(selected.flatMap((item) => [...tokens(item.value)]));
  return [...tokens(fact.value)].filter((token) => !used.has(token)).length;
}

export function selectSceneEvidenceV7(facts: OwnedEvidenceFactV1[]): OwnedEvidenceFactV1[] {
  const eligible = [...new Map([...facts]
    .filter((fact) => fact.value.trim().length > 0 && fact.value.length <= EDITORIAL_FACT_CHARACTER_LIMIT_V7)
    .sort((left, right) => left.factId.localeCompare(right.factId))
    .map((fact) => [fact.factId, { ...fact, value: fact.value.replace(/\s+/g, ' ').trim() }])).values()];
  const selected: OwnedEvidenceFactV1[] = [];
  for (const role of ROLE_ORDER) {
    const best = eligible.filter((fact) => fact.role === role && !selected.includes(fact))
      .sort((left, right) => novelty(right, selected) - novelty(left, selected)
        || left.factId.localeCompare(right.factId))[0];
    if (best) selected.push(best);
  }
  while (selected.length < EDITORIAL_SCENE_FACT_LIMIT_V7) {
    const best = eligible.filter((fact) => !selected.includes(fact))
      .sort((left, right) => novelty(right, selected) - novelty(left, selected)
        || ROLE_ORDER.indexOf(left.role) - ROLE_ORDER.indexOf(right.role)
        || left.factId.localeCompare(right.factId))[0];
    if (!best) break;
    selected.push(best);
  }
  return selected;
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[1];
}

export function evaluateBlindReviewGateV7(reviews: BlindReviewV7[]): BlindReviewGateV7 {
  if (reviews.length !== 3 || new Set(reviews.map((review) => review.reviewerId)).size !== 3) {
    throw new Error('blind review gate requires exactly three distinct reviewers');
  }
  const expectedScoreKeys = [
    'comfort', 'criticalCoverage', 'progression', 'resolution', 'temporalHonesty', 'uniqueness',
  ];
  for (const review of reviews) {
    if (!review.reviewerId.trim() || typeof review.wouldPay !== 'boolean') {
      throw new Error('blind review requires a reviewer and pay decision');
    }
    uniqueStrings(review.criticalOmissions, 'blind review critical omissions');
    if (Object.keys(review.scores).sort().join(',') !== expectedScoreKeys.join(',')
      || Object.values(review.scores).some((score) => !Number.isInteger(score) || score < 1 || score > 5)) {
      throw new Error('blind review scores must be integers from 1 to 5');
    }
  }
  const omissionCounts = new Map<string, number>();
  reviews.flatMap((review) => [...new Set(review.criticalOmissions)])
    .forEach((omission) => omissionCounts.set(omission, (omissionCounts.get(omission) ?? 0) + 1));
  const repeatedCriticalOmissions = [...omissionCounts.entries()]
    .filter(([, count]) => count >= 2).map(([omission]) => omission).sort();
  const payVotes = reviews.filter((review) => review.wouldPay).length;
  const coherenceMedian = median(reviews.map((review) => review.scores.progression));
  const comfortMedian = median(reviews.map((review) => review.scores.comfort));
  return {
    passed: payVotes >= 2 && coherenceMedian >= 4 && comfortMedian >= 4
      && repeatedCriticalOmissions.length === 0,
    payVotes, coherenceMedian, comfortMedian, repeatedCriticalOmissions,
  };
}
