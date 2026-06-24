import { assessHistoryTourCapacity, isProtectedHistoryAnchor } from './HistoryTourCapacity';

describe('HistoryTourCapacity', () => {
  it('recommends a shorter history tour when protected anchors are too sparse for 240 minutes', () => {
    const candidates = [
      { historyPlaceScore: 18, historyPlaceKinds: ['event-place'], historyIsEventSiteLike: true, landmarkTier: 'major' },
      { historyPlaceScore: 12, historyPlaceKinds: ['wikidata'], historyIsEventSiteLike: false },
      { historyPlaceScore: 11, historyPlaceKinds: ['wikidata'], historyIsEventSiteLike: false },
      { historyPlaceScore: 10, historyPlaceKinds: ['wikidata'], historyIsEventSiteLike: false },
      { category: 'square_civic', historyPlaceScore: 7, historyIsEventSiteLike: false },
    ];

    const result = assessHistoryTourCapacity(candidates, 240);

    expect(result.reason).toBe('history_capacity_below_requested');
    expect(result.recommendedDuration).toBe(90);
    expect(result.protectedAnchorCount).toBe(1);
    expect(result.strongHistoryPlaceCount).toBe(5);
  });

  it('allows 240 minutes when the city has enough protected historical anchors', () => {
    const protectedAnchors = Array.from({ length: 4 }, () => ({
      historyPlaceScore: 18,
      historyPlaceKinds: ['event-place'],
      historyIsEventSiteLike: true,
      landmarkTier: 'major',
    }));
    const supportingPlaces = Array.from({ length: 4 }, () => ({
      historyPlaceScore: 11,
      historyPlaceKinds: ['public-square'],
      historyIsEventSiteLike: true,
    }));

    const result = assessHistoryTourCapacity([...protectedAnchors, ...supportingPlaces], 240);

    expect(result.reason).toBeNull();
    expect(result.recommendedDuration).toBe(240);
  });

  it('does not protect museum containers as history anchors', () => {
    expect(isProtectedHistoryAnchor({
      historyPlaceScore: 30,
      historyIsMuseumLike: true,
      historyIsEventSiteLike: false,
      landmarkTier: 'flagship',
    })).toBe(false);
  });
});
