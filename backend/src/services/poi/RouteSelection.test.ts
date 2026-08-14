import { buildDiversePrefix, composeWalkingRoute, estimateRouteMetrics, RouteCandidate } from './RouteSelection';

function candidate(name: string, lat: number, lng: number, category: string, importance: number): RouteCandidate & { name: string } {
  return {
    name,
    coordinates: { lat, lng },
    category,
    importance_score: importance,
  };
}

function tieredCandidate(
  name: string,
  lat: number,
  lng: number,
  category: string,
  importance: number,
  landmarkTier: string,
  fameScore?: number
): RouteCandidate & { name: string } {
  return {
    ...candidate(name, lat, lng, category, importance),
    landmarkTier,
    fameScore,
  };
}

describe('buildDiversePrefix', () => {
  it('avoids taking only the top category when alternatives are close', () => {
    const selected = buildDiversePrefix([
      candidate('Palace 1', 40.4168, -3.7038, 'palace_castle', 10),
      candidate('Palace 2', 40.4176, -3.7038, 'palace_castle', 9.8),
      candidate('Square', 40.4184, -3.7038, 'square_civic', 9.7),
      candidate('Market', 40.4192, -3.7038, 'market', 9.6),
    ], 3, 0.4);

    const categories = selected.map((place) => place.category);
    expect(categories).toContain('square_civic');
    expect(categories).toContain('market');
  });

  it('penalizes far supporting outliers when a strong core alternative exists', () => {
    const selected = buildDiversePrefix([
      tieredCandidate('Royal Core', 40.4168, -3.7038, 'palace_castle', 11, 'flagship'),
      tieredCandidate('Grand Square', 40.4180, -3.7041, 'square_civic', 10.7, 'flagship'),
      tieredCandidate('Central Market', 40.4187, -3.7032, 'market', 10.1, 'major'),
      tieredCandidate('Historic Cathedral', 40.4191, -3.7050, 'religious', 9.8, 'major'),
      tieredCandidate('Remote Estate', 40.4950, -3.7800, 'palace_castle', 9.9, 'supporting'),
    ], 4, 0.6, { requestedDuration: 240, requiredFlagships: 2 });

    expect(selected.map((place) => place.name)).not.toContain('Remote Estate');
    expect(selected.map((place) => place.name)).toContain('Historic Cathedral');
  });

  it('prefers a separated flagship over a compact lower-fame cluster filler', () => {
    const selected = buildDiversePrefix([
      tieredCandidate('Main Square', 40.4168, -3.7038, 'square_civic', 18, 'flagship', 24),
      tieredCandidate('Great Museum', 40.4138, -3.6916, 'museum', 17.8, 'flagship', 25),
      tieredCandidate('Royal Palace', 40.4178, -3.7144, 'palace_castle', 17.2, 'flagship', 21.5),
      tieredCandidate('Temple Hill', 40.4240, -3.7178, 'museum', 15.6, 'flagship', 20.9),
      tieredCandidate('Arc Gate', 40.4200, -3.6887, 'other', 15.9, 'flagship', 19.9),
      tieredCandidate('Compact Plaza', 40.4193, -3.6931, 'other', 15.7, 'flagship', 18.2),
      tieredCandidate('Compact Garden', 40.4112, -3.6908, 'other', 15.8, 'flagship', 19.7),
      tieredCandidate('Compact Station', 40.4052, -3.6891, 'other', 16.4, 'flagship', 20.8),
    ], 7, 0.6, { requestedDuration: 240, requiredFlagships: 3 });

    expect(selected.map((place) => place.name)).toContain('Temple Hill');
    expect(selected.map((place) => place.name)).toContain('Arc Gate');
    expect(selected.map((place) => place.name)).not.toContain('Compact Plaza');
  });

  it('counts real flagship selections instead of total selected items', () => {
    const selected = buildDiversePrefix([
      tieredCandidate('History Anchor', 40.4168, -3.7038, 'memorial', 9.5, 'supporting'),
      tieredCandidate('First Flagship', 40.4178, -3.7048, 'palace_castle', 11, 'flagship'),
      tieredCandidate('Second Flagship', 40.4188, -3.7058, 'museum', 10.8, 'flagship'),
      tieredCandidate('Third Flagship', 40.4198, -3.7068, 'square_civic', 10.6, 'flagship'),
    ], 4, 0.6, {
      requestedDuration: 120,
      requiredFlagships: 3,
      theme: 'history',
    });

    const flagshipCount = selected.filter((place) => place.landmarkTier === 'flagship').length;
    expect(flagshipCount).toBe(3);
  });

  it('never exceeds stopCount when flagships and history anchors compete', () => {
    const selected = buildDiversePrefix([
      tieredCandidate('Anchor One', 40.4168, -3.7038, 'memorial', 9.5, 'supporting'),
      tieredCandidate('Anchor Two', 40.4169, -3.7039, 'memorial', 9.4, 'supporting'),
      tieredCandidate('Flagship One', 40.4178, -3.7048, 'palace_castle', 11, 'flagship'),
      tieredCandidate('Flagship Two', 40.4188, -3.7058, 'museum', 10.8, 'flagship'),
      tieredCandidate('Flagship Three', 40.4198, -3.7068, 'square_civic', 10.6, 'flagship'),
    ], 4, 0.6, {
      requestedDuration: 120,
      requiredFlagships: 3,
      theme: 'history',
    });

    expect(selected).toHaveLength(4);
  });
});

describe('estimateRouteMetrics', () => {
  it('returns finite route metrics for walkable candidates', () => {
    const metrics = estimateRouteMetrics([
      candidate('A', 40.4168, -3.7038, 'other', 8),
      candidate('B', 40.4181, -3.7038, 'other', 8),
      candidate('C', 40.4195, -3.7038, 'other', 8),
    ]);

    expect(metrics.walkingMeters).toBeGreaterThan(0);
    expect(metrics.estimatedTourMinutes).toBeGreaterThan(0);
    expect(metrics.hasOverMaxSegment).toBe(false);
  });
});

describe('composeWalkingRoute', () => {
  it('returns a non-degraded route when the duration fits', () => {
    const result = composeWalkingRoute([
      candidate('A', 40.4168, -3.7038, 'palace_castle', 10),
      candidate('B', 40.4181, -3.7038, 'square_civic', 9.8),
      candidate('C', 40.4194, -3.7038, 'market', 9.5),
      candidate('D', 40.4207, -3.7038, 'religious', 9.2),
    ], 45, 'history', { minStops: 3, maxStops: 4 });

    expect(result.route.length).toBeGreaterThanOrEqual(3);
    expect(result.diagnostics.degraded).toBe(false);
    expect(result.diagnostics.degradationReason).toBeNull();
  });

  it('marks the route degraded when the request is unrealistically long', () => {
    const result = composeWalkingRoute([
      candidate('A', 40.4168, -3.7038, 'palace_castle', 10),
      candidate('B', 40.4181, -3.7038, 'square_civic', 9.8),
      candidate('C', 40.4194, -3.7038, 'market', 9.5),
    ], 240, 'history', { minStops: 3, maxStops: 5 });

    expect(result.diagnostics.degraded).toBe(true);
    expect(result.diagnostics.degradationReason).toBe('duration_below_requested');
    expect(result.diagnostics.coverageRatio).toBeLessThan(0.75);
  });

  it('keeps long landmark-rich tours from collapsing into a tiny compact route', () => {
    const richCityCandidates = Array.from({ length: 10 }, (_, index) => {
      const categories = ['palace_castle', 'square_civic', 'market', 'religious', 'museum'];
      return candidate(
        `Landmark ${index + 1}`,
        40.4168 + (index * 0.0105),
        -3.7038,
        categories[index % categories.length],
        10 - (index * 0.1)
      );
    });

    const result = composeWalkingRoute(richCityCandidates, 240, 'history', { minStops: 6, maxStops: 10 });

    expect(result.diagnostics.degraded).toBe(false);
    expect(result.diagnostics.coverageRatio).toBeGreaterThanOrEqual(0.75);
    expect(result.route.length).toBeGreaterThanOrEqual(6);
  });

  it('uses extra stops beyond the nominal cap when a compact 240-minute route would be too short', () => {
    const compactCandidates = Array.from({ length: 13 }, (_, index) => {
      const categories = ['palace_castle', 'square_civic', 'market', 'religious', 'museum'];
      return candidate(
        `Compact landmark ${index + 1}`,
        40.4168 + (index * 0.001),
        -3.7038,
        categories[index % categories.length],
        13 - (index * 0.1)
      );
    });

    const result = composeWalkingRoute(compactCandidates, 240, 'history', { minStops: 6, maxStops: 10 });

    expect(result.route.length).toBeGreaterThan(10);
    expect(result.route.length).toBe(13);
  });

  it('prioritizes event-site history over museum-heavy history when both are walkable', () => {
    const result = composeWalkingRoute([
      {
        ...tieredCandidate('Famous History Museum', 52.5200, 13.3970, 'museum', 24, 'flagship', 24),
        historyPlaceScore: -2,
        historyIsMuseumLike: true,
      },
      {
        ...tieredCandidate('National Museum Annex', 52.5204, 13.3980, 'museum', 22, 'flagship', 22),
        historyPlaceScore: -2,
        historyIsMuseumLike: true,
      },
      {
        ...tieredCandidate('Parliament Gate', 52.5180, 13.3777, 'other', 15, 'major', 15),
        historyPlaceScore: 10,
        historyPlaceKinds: ['civic-power-site', 'event-name'],
        historyIsEventSiteLike: true,
      },
      {
        ...tieredCandidate('City Wall Memorial', 52.5070, 13.3900, 'memorial', 14, 'major', 14),
        historyPlaceScore: 9,
        historyPlaceKinds: ['memory-site', 'event-name'],
        historyIsEventSiteLike: true,
      },
      {
        ...tieredCandidate('Old Public Square', 52.5150, 13.3920, 'square_civic', 13, 'major', 13),
        historyPlaceScore: 7,
        historyPlaceKinds: ['public-square'],
        historyIsEventSiteLike: true,
      },
    ], 120, 'history', { minStops: 3, maxStops: 3 });

    const names = result.route.map((place) => place.name);
    expect(names).toEqual(expect.arrayContaining(['Parliament Gate', 'City Wall Memorial']));
    expect(names.filter((name) => name.includes('Museum')).length).toBeLessThanOrEqual(1);
  });

  it('protects four strong history anchors before adding secondary long-tour filler', () => {
    const result = composeWalkingRoute([
      {
        ...tieredCandidate('Alcazaba', 36.7211, -4.4162, 'palace_castle', 12, 'major', 18),
        historyPlaceScore: 19,
        historyPlaceKinds: ['event-place', 'power-site'],
        historyIsEventSiteLike: true,
      },
      {
        ...tieredCandidate('Roman Theatre', 36.7213, -4.4168, 'other', 11.8, 'major', 17),
        historyPlaceScore: 18,
        historyPlaceKinds: ['event-place'],
        historyIsEventSiteLike: true,
      },
      {
        ...tieredCandidate('Gibralfaro', 36.7238, -4.4104, 'palace_castle', 11.6, 'major', 16),
        historyPlaceScore: 18,
        historyPlaceKinds: ['event-place', 'power-site'],
        historyIsEventSiteLike: true,
      },
      {
        ...tieredCandidate('Nazarí Wall', 36.7204, -4.4190, 'memorial', 11.4, 'major', 15),
        historyPlaceScore: 17,
        historyPlaceKinds: ['event-place', 'memory-site'],
        historyIsEventSiteLike: true,
      },
      tieredCandidate('Old Suburban Station', 36.7170, -4.4210, 'other', 12.5, 'flagship', 20),
      tieredCandidate('Music Conservatory', 36.7192, -4.4230, 'other', 12.2, 'flagship', 19),
      tieredCandidate('Port Office', 36.7155, -4.4185, 'other', 12.1, 'flagship', 18),
      tieredCandidate('Commercial Street', 36.7182, -4.4212, 'other', 11.9, 'major', 17),
    ], 240, 'history', { minStops: 6, maxStops: 8 });

    expect(result.route.map((place) => place.name)).toEqual(expect.arrayContaining([
      'Alcazaba',
      'Roman Theatre',
      'Gibralfaro',
      'Nazarí Wall',
    ]));
  });

  it('keeps a separated flagship instead of replacing it with compact filler', () => {
    const result = composeWalkingRoute([
      tieredCandidate('Royal Palace', 40.4168, -3.7038, 'palace_castle', 11, 'flagship'),
      tieredCandidate('Main Square', 40.4180, -3.7041, 'square_civic', 10.8, 'flagship'),
      tieredCandidate('Temple Hill', 40.4258, -3.7176, 'museum', 10.3, 'flagship'),
      tieredCandidate('Central Market', 40.4187, -3.7032, 'market', 10, 'major'),
      tieredCandidate('Core Church', 40.4191, -3.7050, 'religious', 9.8, 'major'),
      tieredCandidate('Compact Filler', 40.4194, -3.7035, 'museum', 9.4, 'supporting'),
    ], 180, 'history', { minStops: 4, maxStops: 6 });

    expect(result.route.map((place) => place.name)).toContain('Temple Hill');
  });

  it('keeps separated high-fame flagships in long routes without collapsing into compact substitutes', () => {
    const result = composeWalkingRoute([
      tieredCandidate('Main Square', 40.4168, -3.7038, 'square_civic', 18, 'flagship', 24),
      tieredCandidate('Great Museum', 40.4138, -3.6916, 'museum', 17.8, 'flagship', 25),
      tieredCandidate('Royal Palace', 40.4178, -3.7144, 'palace_castle', 17.2, 'flagship', 21.5),
      tieredCandidate('Temple Hill', 40.4240, -3.7178, 'museum', 15.6, 'flagship', 20.9),
      tieredCandidate('Arc Gate', 40.4200, -3.6887, 'other', 15.9, 'flagship', 19.9),
      tieredCandidate('Compact Plaza', 40.4193, -3.6931, 'other', 15.7, 'flagship', 18.2),
      tieredCandidate('Compact Garden', 40.4112, -3.6908, 'other', 15.8, 'flagship', 19.7),
      tieredCandidate('Compact Station', 40.4052, -3.6891, 'other', 16.4, 'flagship', 20.8),
      tieredCandidate('Remote Estate', 40.4833, -3.8015, 'palace_castle', 16.1, 'flagship', 20.5),
    ], 240, 'history', { minStops: 6, maxStops: 9 });

    const names = result.route.map((place) => place.name);
    expect(names).toContain('Temple Hill');
    expect(names).toContain('Arc Gate');
    expect(names).not.toContain('Remote Estate');
    expect(result.diagnostics.degraded).toBe(false);
  });

  it('avoids collapsing into a memorial cluster when diverse history candidates exist', () => {
    const memorialCluster = Array.from({ length: 8 }, (_, index) => tieredCandidate(
      `Memorial ${index + 1}`,
      -12.0464 + (index * 0.0003),
      -77.0428 + (index * 0.00025),
      'memorial',
      18 - (index * 0.2),
      index < 5 ? 'flagship' : 'major',
      20 - (index * 0.25)
    ));

    const diverseCore = [
      tieredCandidate('Main Square', -12.0469, -77.0281, 'square_civic', 19.2, 'flagship', 22),
      tieredCandidate('National Congress', -12.0491, -77.0297, 'other', 19.0, 'flagship', 21.5),
      tieredCandidate('Historic Cathedral', -12.0459, -77.0305, 'religious', 18.8, 'flagship', 21.1),
      tieredCandidate('Archaeology Museum', -12.0715, -77.0622, 'museum', 18.4, 'flagship', 20.4),
      tieredCandidate('Government Palace', -12.0439, -77.0288, 'palace_castle', 17.8, 'major', 19.3),
      tieredCandidate('City Museum', -12.0581, -77.0360, 'museum', 17.6, 'major', 18.9),
      tieredCandidate('Bolivar Square', -12.0475, -77.0308, 'square_civic', 17.1, 'major', 18.2),
    ];

    const result = composeWalkingRoute([...diverseCore, ...memorialCluster], 240, 'history', { minStops: 6, maxStops: 10 });
    const counts = result.route.reduce((acc, place) => {
      const key = place.category ?? 'other';
      acc.set(key, (acc.get(key) ?? 0) + 1);
      return acc;
    }, new Map<string, number>());
    const maxShare = Math.max(...counts.values()) / result.route.length;
    const nonMemorialCount = result.route.filter((place) => place.category !== 'memorial').length;

    expect(maxShare).toBeLessThanOrEqual(0.7);
    expect(nonMemorialCount).toBeGreaterThanOrEqual(3);
  });
});
