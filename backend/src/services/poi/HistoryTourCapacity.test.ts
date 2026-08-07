import { assessHistoryTourCapacity, assessHistoryTourPreflight, isProtectedHistoryAnchor } from './HistoryTourCapacity';

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

  it('returns generate for a strong history city profile', () => {
    const candidates = [
      ...Array.from({ length: 8 }, (_, index) => ({
        name: `Anchor ${index + 1}`,
        wikidataId: `Q${index + 1}`,
        fameScore: 20 - index,
        historyPlaceScore: 18,
        historyPlaceKinds: ['event-place'],
        historyIsEventSiteLike: true,
        landmarkTier: 'flagship',
      })),
      ...Array.from({ length: 6 }, () => ({
        historyPlaceScore: 11,
        historyPlaceKinds: ['public-square'],
        historyIsEventSiteLike: true,
      })),
    ];

    const result = assessHistoryTourPreflight(candidates, 240, { coverageRatio: 0.95 });

    expect(result.decision).toBe('generate');
    expect(result.tier).toBe('strong_history_city');
    expect(result.topAnchors).toHaveLength(8);
  });

  it('recommends shorter duration instead of pretending a sparse city supports 240 minutes', () => {
    const candidates = [
      { historyPlaceScore: 18, historyPlaceKinds: ['event-place'], historyIsEventSiteLike: true, landmarkTier: 'major' },
      { historyPlaceScore: 11, historyPlaceKinds: ['wikidata'], historyIsEventSiteLike: false },
      { historyPlaceScore: 10, historyPlaceKinds: ['wikidata'], historyIsEventSiteLike: false },
      { category: 'square_civic', historyPlaceScore: 7, historyIsEventSiteLike: false },
    ];

    const result = assessHistoryTourPreflight(candidates, 240, { coverageRatio: 0.92 });

    expect(result.decision).toBe('recommend_shorter_duration');
    expect(result.recommendedDurationMinutes).toBe(90);
    expect(result.reasons).toContain('history_capacity_below_requested');
  });

  it('blocks when there is not enough historical signal to sell a tour', () => {
    const result = assessHistoryTourPreflight([
      { category: 'museum', historyPlaceScore: -2, historyIsMuseumLike: true },
      { category: 'other', historyPlaceScore: 0 },
    ], 120);

    expect(result.decision).toBe('block');
    expect(result.tier).toBe('insufficient_data');
    expect(result.reasons).toEqual(expect.arrayContaining([
      'insufficient_history_anchors',
      'insufficient_history_places',
    ]));
  });
});
