import {
  buildBlindReviewCardV4,
  evaluateHumanReviewV4,
  HUMAN_REVIEW_SCHEMA_VERSION,
} from './EditorialHumanReviewV4';

const cases = [
  'madrid-history-es-120', 'malaga-history-es-120', 'amsterdam-history-nl-120',
  'toledo-history-es-120', 'berlin-history-de-120', 'barcelona-history-fr-120',
  'paris-history-en-120', 'roma-history-it-150', 'toulouse-history-fr-120',
];

function scores(value: number) {
  return {
    opening: value, progression: value, nonRedundancy: value,
    firstVisitLandmarks: value, resolution: value, walking: value,
  };
}

describe('blinded editorial review v4', () => {
  it('creates a deterministic card without exposing implementation labels', () => {
    const built = buildBlindReviewCardV4('madrid-history-es-120', {
      stops: ['Villa'], actualDuration: 64, walkingMeters: 1000, contributions: ['Origins'],
    }, {
      stops: ['Congress'], actualDuration: 70, walkingMeters: 1200, contributions: ['Power'],
    });
    expect(Object.keys(built.card.variants)).toEqual(['A', 'B']);
    expect(JSON.stringify(built.card)).not.toContain('"v4"');
    expect(new Set(Object.values(built.key.variants))).toEqual(new Set(['v4', 'v3']));
  });

  it('passes only when v4 does not regress, wins six cities and wins Madrid', () => {
    const review = {
      schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION,
      reviews: cases.map((caseId, index) => ({
        caseId, key: { A: 'v4', B: 'v3' },
        scores: { A: scores(5), B: scores(4) }, preferred: index < 6 ? 'A' : 'tie',
      })),
    };
    expect(evaluateHumanReviewV4(review, cases)).toEqual({
      schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION, passed: true, v4Wins: 6, failures: [],
    });
    review.reviews[0].preferred = 'tie';
    const failed = evaluateHumanReviewV4(review, cases);
    expect(failed.passed).toBe(false);
    expect(failed.failures).toContain('Madrid: v4 must be preferred');
  });
});
