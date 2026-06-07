import { computeTourConfidence, getTourConfidenceGateMode } from './TourConfidenceGate';

describe('TourConfidenceGate', () => {
  it('passes when the minimum input and output thresholds are met', () => {
    const result = computeTourConfidence({
      input: {
        rawPoolSize: 42,
        wikidataTaggedCount: 18,
        sitelinksResolvedRatio: 0.8,
        maxSitelinks: 22,
      },
      output: {
        shortlistSize: 7,
        routeDuplicateWikidataCount: 0,
        routeMaxCategoryShare: 0.57,
        routeFlagshipCount: 2,
        degraded: false,
        coverageRatio: 0.91,
        stopCount: 7,
      },
    });

    expect(result).toMatchObject({
      passed: true,
      stage: 'output',
      reasons: [],
    });
    expect(result.score).toBe(1);
    expect(result.signals?.coverageRatio).toBe(0.91);
  });

  it('fails at input stage when the raw pool is too weak', () => {
    const result = computeTourConfidence({
      input: {
        rawPoolSize: 18,
        wikidataTaggedCount: 6,
        sitelinksResolvedRatio: 0.4,
        maxSitelinks: 2,
      },
      output: {
        shortlistSize: 6,
        routeDuplicateWikidataCount: 0,
        routeMaxCategoryShare: 0.5,
        routeFlagshipCount: 1,
        degraded: false,
        coverageRatio: 0.85,
        stopCount: 6,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.stage).toBe('input');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'insufficient_raw_pool',
      'low_wikidata_coverage',
      'weak_absolute_landmark_signal',
    ]));
  });

  it('fails at output stage when route quality collapses', () => {
    const result = computeTourConfidence({
      input: {
        rawPoolSize: 55,
        wikidataTaggedCount: 21,
        sitelinksResolvedRatio: 0.75,
        maxSitelinks: 19,
      },
      output: {
        shortlistSize: 6,
        routeDuplicateWikidataCount: 1,
        routeMaxCategoryShare: 0.84,
        routeFlagshipCount: 0,
        degraded: true,
        coverageRatio: 0.61,
        stopCount: 6,
      },
    });

    expect(result.passed).toBe(false);
    expect(result.stage).toBe('output');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'duplicate_landmarks',
      'category_collapse',
      'no_strong_flagships',
      'route_degraded',
      'coverage_ratio_too_low',
    ]));
  });

  it('defaults gate mode to off in test and shadow otherwise', () => {
    expect(getTourConfidenceGateMode(undefined, 'test')).toBe('off');
    expect(getTourConfidenceGateMode(undefined, 'development')).toBe('shadow');
    expect(getTourConfidenceGateMode(undefined, 'production')).toBe('shadow');
    expect(getTourConfidenceGateMode('enforce', 'test')).toBe('enforce');
  });
});
