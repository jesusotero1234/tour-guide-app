import { computeTourConfidence } from './TourConfidenceGate';
import { attemptTourQualityRepair, getTourQualityRepairMode, RepairableTourPlace } from './TourQualityRepair';

function candidate(
  name: string,
  lat: number,
  lng: number,
  category: string,
  importance: number,
  wikidataId: string,
  landmarkTier: string = 'major',
): RepairableTourPlace & { name: string } {
  return {
    name,
    coordinates: { lat, lng },
    category,
    importance_score: importance,
    landmarkTier,
    poi: { tags: { wikidata: wikidataId } },
  };
}

describe('TourQualityRepair', () => {
  it('defaults repair mode to off', () => {
    expect(getTourQualityRepairMode(undefined)).toBe('off');
  });

  it('recomposes category collapse into a passing diverse route when alternatives exist', () => {
    const candidates = [
      candidate('Palace 1', 40.4168, -3.7038, 'palace_castle', 10, 'Q1', 'flagship'),
      candidate('Palace 2', 40.4173, -3.7040, 'palace_castle', 9.8, 'Q2'),
      candidate('Palace 3', 40.4178, -3.7042, 'palace_castle', 9.7, 'Q3'),
      candidate('Palace 4', 40.4183, -3.7044, 'palace_castle', 9.6, 'Q4'),
      candidate('Palace 5', 40.4188, -3.7046, 'palace_castle', 9.5, 'Q5'),
      candidate('Market', 40.4193, -3.7048, 'market', 9.4, 'Q6'),
      candidate('Museum', 40.4198, -3.7050, 'museum', 9.3, 'Q7'),
      candidate('Cathedral', 40.4203, -3.7052, 'religious', 9.2, 'Q8'),
    ];
    const selectedRoute = candidates.slice(0, 5);
    const beforeConfidence = computeTourConfidence({
      input: {
        rawPoolSize: 50,
        wikidataTaggedCount: 20,
        sitelinksResolvedRatio: 0.8,
        maxSitelinks: 12,
      },
      output: {
        shortlistSize: 8,
        routeDuplicateWikidataCount: 0,
        routeMaxCategoryShare: 1,
        routeFlagshipCount: 1,
        degraded: false,
        coverageRatio: 0.95,
        stopCount: 5,
      },
    });

    const result = attemptTourQualityRepair({
      candidates,
      selectedRoute,
      confidence: beforeConfidence,
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 8,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 1,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 0.95,
          stopCount: 5,
        },
      },
      requestedDuration: 60,
      theme: 'history',
      stopBounds: { minStops: 5, maxStops: 5 },
    });

    expect(result.attempted).toBe(true);
    expect(result.applied).toBe(true);
    expect(result.finalConfidence.passed).toBe(true);
    expect(result.route.map((place) => place.category)).toEqual(expect.arrayContaining(['market', 'religious']));
    expect(result.route.filter((place) => place.category === 'palace_castle')).toHaveLength(3);
    expect(result.metadata.strategy).toBe('category_diversity_recompose');
  });

  it('does not apply repair when the pool cannot escape category collapse', () => {
    const candidates = [
      candidate('Palace 1', 40.4168, -3.7038, 'palace_castle', 10, 'Q1', 'flagship'),
      candidate('Palace 2', 40.4173, -3.7040, 'palace_castle', 9.8, 'Q2'),
      candidate('Palace 3', 40.4178, -3.7042, 'palace_castle', 9.7, 'Q3'),
      candidate('Palace 4', 40.4183, -3.7044, 'palace_castle', 9.6, 'Q4'),
      candidate('Palace 5', 40.4188, -3.7046, 'palace_castle', 9.5, 'Q5'),
    ];
    const beforeConfidence = computeTourConfidence({
      input: {
        rawPoolSize: 50,
        wikidataTaggedCount: 20,
        sitelinksResolvedRatio: 0.8,
        maxSitelinks: 12,
      },
      output: {
        shortlistSize: 5,
        routeDuplicateWikidataCount: 0,
        routeMaxCategoryShare: 1,
        routeFlagshipCount: 1,
        degraded: false,
        coverageRatio: 0.95,
        stopCount: 5,
      },
    });

    const result = attemptTourQualityRepair({
      candidates,
      selectedRoute: candidates,
      confidence: beforeConfidence,
      confidenceInput: {
        input: {
          rawPoolSize: 50,
          wikidataTaggedCount: 20,
          sitelinksResolvedRatio: 0.8,
          maxSitelinks: 12,
        },
        output: {
          shortlistSize: 5,
          routeDuplicateWikidataCount: 0,
          routeMaxCategoryShare: 1,
          routeFlagshipCount: 1,
          degraded: false,
          coverageRatio: 0.95,
          stopCount: 5,
        },
      },
      requestedDuration: 60,
      theme: 'history',
      stopBounds: { minStops: 5, maxStops: 5 },
    });

    expect(result.attempted).toBe(true);
    expect(result.applied).toBe(false);
    expect(result.finalConfidence.passed).toBe(false);
    expect(result.finalConfidence.reasons).toContain('category_collapse');
  });
});
