import { createHash } from 'crypto';

export const HUMAN_REVIEW_SCHEMA_VERSION = 'editorial-human-review-v4' as const;
export const HUMAN_REVIEW_CRITERIA_V4 = [
  'opening', 'progression', 'nonRedundancy', 'firstVisitLandmarks', 'resolution', 'walking',
] as const;

export type HumanReviewCriterionV4 = typeof HUMAN_REVIEW_CRITERIA_V4[number];

export interface ReviewRouteSummaryV4 {
  stops: string[];
  actualDuration: number;
  walkingMeters: number;
  contributions: string[];
}

export interface BlindReviewCardV4 {
  schemaVersion: 'editorial-human-review-card-v4';
  caseId: string;
  criteria: typeof HUMAN_REVIEW_CRITERIA_V4;
  variants: Record<'A' | 'B', ReviewRouteSummaryV4>;
}

export interface BlindReviewKeyV4 {
  caseId: string;
  variants: Record<'A' | 'B', 'v4' | 'v3'>;
}

export interface HumanReviewEntryV4 {
  caseId: string;
  key: BlindReviewKeyV4['variants'];
  scores: Record<'A' | 'B', Record<HumanReviewCriterionV4, number>>;
  preferred: 'A' | 'B' | 'tie';
}

export interface HumanReviewFileV4 {
  schemaVersion: typeof HUMAN_REVIEW_SCHEMA_VERSION;
  reviews: HumanReviewEntryV4[];
}

export interface HumanReviewGateV4 {
  schemaVersion: typeof HUMAN_REVIEW_SCHEMA_VERSION;
  passed: boolean;
  v4Wins: number;
  failures: string[];
}

export function buildBlindReviewCardV4(
  caseId: string,
  v4: ReviewRouteSummaryV4,
  v3: ReviewRouteSummaryV4
): { card: BlindReviewCardV4; key: BlindReviewKeyV4 } {
  const v4First = Number.parseInt(createHash('sha256').update(caseId).digest('hex').slice(0, 2), 16) % 2 === 0;
  const variants: BlindReviewKeyV4['variants'] = v4First ? { A: 'v4', B: 'v3' } : { A: 'v3', B: 'v4' };
  return {
    card: {
      schemaVersion: 'editorial-human-review-card-v4',
      caseId,
      criteria: HUMAN_REVIEW_CRITERIA_V4,
      variants: { A: variants.A === 'v4' ? v4 : v3, B: variants.B === 'v4' ? v4 : v3 },
    },
    key: { caseId, variants },
  };
}

function score(value: unknown, label: string): number {
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new Error(`${label} must be an integer from 1 to 5`);
  }
  return value as number;
}

export function evaluateHumanReviewV4(value: unknown, expectedCaseIds: string[]): HumanReviewGateV4 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Human review must be an object');
  const reviewFile = value as Partial<HumanReviewFileV4>;
  if (reviewFile.schemaVersion !== HUMAN_REVIEW_SCHEMA_VERSION || !Array.isArray(reviewFile.reviews)) {
    throw new Error('Invalid human review schema');
  }
  const actualCases = reviewFile.reviews.map((review) => review.caseId).sort();
  if (actualCases.join(',') !== [...expectedCaseIds].sort().join(',')) {
    throw new Error('Human review must contain every calibration case exactly once');
  }
  const failures: string[] = [];
  let v4Wins = 0;
  for (const review of reviewFile.reviews) {
    if (!review.key || new Set(Object.values(review.key)).size !== 2
      || !['v4', 'v3'].includes(review.key.A) || !['v4', 'v3'].includes(review.key.B)) {
      throw new Error(`Invalid blind key for ${review.caseId}`);
    }
    if (!['A', 'B', 'tie'].includes(review.preferred)) throw new Error(`Invalid preference for ${review.caseId}`);
    const variantBySource = {
      v4: review.key.A === 'v4' ? 'A' : 'B',
      v3: review.key.A === 'v3' ? 'A' : 'B',
    } as const;
    const normalized: Record<'v4' | 'v3', Record<HumanReviewCriterionV4, number>> = {
      v4: {} as Record<HumanReviewCriterionV4, number>,
      v3: {} as Record<HumanReviewCriterionV4, number>,
    };
    for (const source of ['v4', 'v3'] as const) {
      const raw = review.scores?.[variantBySource[source]];
      if (!raw) throw new Error(`Missing ${source} scores for ${review.caseId}`);
      for (const criterion of HUMAN_REVIEW_CRITERIA_V4) {
        normalized[source][criterion] = score(raw[criterion], `${review.caseId}.${source}.${criterion}`);
      }
    }
    const total = (source: 'v4' | 'v3') => HUMAN_REVIEW_CRITERIA_V4
      .reduce((sum, criterion) => sum + normalized[source][criterion], 0);
    if (total('v4') < total('v3')) failures.push(`${review.caseId}: v4 total is below v3`);
    if (normalized.v4.progression < normalized.v3.progression) failures.push(`${review.caseId}: progression regressed`);
    if (normalized.v4.nonRedundancy < normalized.v3.nonRedundancy) failures.push(`${review.caseId}: redundancy regressed`);
    const preferredSource = review.preferred === 'tie' ? 'tie' : review.key[review.preferred];
    if (preferredSource === 'v4') v4Wins += 1;
    if (review.caseId === 'madrid-history-es-120' && preferredSource !== 'v4') {
      failures.push('Madrid: v4 must be preferred');
    }
  }
  if (v4Wins < 6) failures.push(`v4 wins ${v4Wins}/9; at least 6 are required`);
  return { schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION, passed: failures.length === 0, v4Wins, failures };
}

