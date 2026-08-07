import {
  CityEditorialProfileV1,
  editorialFingerprintV7,
  VisitSceneV1,
} from './EditorialProfileV7';
import {
  optimizeEditorialRouteV7,
  recommendAdvertisedDurationV7,
} from './EditorialRouteOptimizerV7';
import {
  walkingMatrixCandidateFingerprintV4,
  WalkingMatrixSnapshotV4,
} from './EditorialWalkingMatrixV4';

const MADRID = [
  ['palace', 'Q171517', 'Royal Palace'],
  ['almudena', 'Q849711', 'Almudena Cathedral'],
  ['villa', 'Q2711992', 'Plaza de la Villa'],
  ['mayor', 'Q1123493', 'Plaza Mayor'],
  ['sol', 'Q427163', 'Puerta del Sol'],
  ['cibeles', 'Q1537446', 'Cibeles'],
  ['alcala', 'Q1140634', 'Puerta de Alcalá'],
] as const;

function scenes(
  values: ReadonlyArray<readonly [string, string, string]> = MADRID
): VisitSceneV1[] {
  return values.map(([sceneId, canonicalId, name], index) => ({
    schemaVersion: 'visit-scene-v1', sceneId, status: 'review_required',
    primaryCanonicalId: canonicalId, memberCanonicalIds: [canonicalId], name,
    observationPoint: { lat: 40.4 + index / 1000, lng: -3.7 },
    facts: [{
      factId: `${sceneId}-fact`, ownerCanonicalId: canonicalId, sourceId: 'source',
      role: 'distinctive', value: `${name} has a distinct contribution to Madrid's history.`,
    }],
    sourceIds: ['source'], conflictsWithSceneIds: [], review: null,
  }));
}

function profile(sceneValues: VisitSceneV1[], duration = 120): CityEditorialProfileV1 {
  const chapters = sceneValues.map((item) => ({
    chapterId: `chapter-${item.sceneId}`,
    title: `Chapter ${item.sceneId}`,
    carrierSceneIds: [item.sceneId],
  }));
  return {
    schemaVersion: 'city-editorial-profile-v1', cityKey: 'madrid', theme: 'history',
    productPromise: 'From historic town to modern capital', requestedDurationMinutes: duration,
    status: 'review_required', mustVisitCanonicalIds: [sceneValues[0].primaryCanonicalId],
    chapters, arcChapterIds: chapters.map((chapter) => chapter.chapterId),
    approvedSceneIds: sceneValues.map((item) => item.sceneId),
    sources: [{
      sourceId: 'source', url: 'https://www.esmadrid.com/', title: 'Tourism Madrid',
      capturedAt: '2026-08-07T00:00:00.000Z', excerpt: 'Official Madrid tourism evidence.',
      contentFingerprint: editorialFingerprintV7('Official Madrid tourism evidence.'),
    }],
    overrides: [], requiresStreetAudit: false, review: null,
  };
}

function matrix(
  sceneValues: VisitSceneV1[],
  legs: Record<string, { meters: number; seconds: number }>,
  fallback: { meters: number; seconds: number } | null = { meters: 900, seconds: 720 }
): WalkingMatrixSnapshotV4 {
  const sites = sceneValues.map((item) => ({
    siteId: item.sceneId, lat: item.observationPoint.lat, lng: item.observationPoint.lng,
  }));
  return {
    schemaVersion: 'walking-matrix-v1',
    provider: { id: 'fossgis-osrm-foot', capturedAt: '2026-08-07T00:00:00.000Z' },
    candidateFingerprint: walkingMatrixCandidateFingerprintV4(sites), sites,
    legs: sites.map((from, fromIndex) => sites.map((to, toIndex) => {
      if (fromIndex === toIndex) return { meters: 0, seconds: 0, reachable: true };
      const leg = legs[`${from.siteId}>${to.siteId}`] ?? fallback;
      return leg
        ? { ...leg, reachable: true }
        : { meters: null, seconds: null, reachable: false };
    })),
  };
}

describe('editorial route optimizer v7', () => {
  it('enumerates Madrid exactly and selects the approved seven-scene arc', () => {
    const madridScenes = scenes();
    const walking = matrix(madridScenes, {
      'palace>almudena': { meters: 306.1, seconds: 244.8 },
      'almudena>villa': { meters: 407.2, seconds: 329.8 },
      'villa>mayor': { meters: 470.2, seconds: 385.9 },
      'mayor>sol': { meters: 423.2, seconds: 338.6 },
      'sol>cibeles': { meters: 976.1, seconds: 780.8 },
      'cibeles>alcala': { meters: 484.8, seconds: 394 },
    });

    const result = optimizeEditorialRouteV7(profile(madridScenes), madridScenes, walking);
    const permuted = optimizeEditorialRouteV7(
      profile(madridScenes), [...madridScenes].reverse(), walking
    );

    expect(result.status).toBe('selected');
    if (result.status !== 'selected' || permuted.status !== 'selected') return;
    expect(result.route.sceneIds).toEqual(MADRID.map(([sceneId]) => sceneId));
    expect(result.route.metrics).toMatchObject({
      walkingMeters: 3067.6,
      walkingSeconds: 2473.9,
      walkingMinutes: 41.23,
      maxSegmentMeters: 976.1,
    });
    expect(result.exploredCompleteOrderCount).toBe(5040);
    expect(permuted.route).toEqual(result.route);
    expect(() => optimizeEditorialRouteV7(
      profile(madridScenes), madridScenes, { ...walking, candidateFingerprint: 'stale' }
    )).toThrow('walking matrix fingerprint');
  });

  it('keeps two plazas when they carry distinct required chapters', () => {
    const plazaScenes = scenes([
      ['villa', 'Q-villa', 'Plaza de la Villa'],
      ['mayor', 'Q-mayor', 'Plaza Mayor'],
    ]);
    const result = optimizeEditorialRouteV7(
      profile(plazaScenes, 60), plazaScenes,
      matrix(plazaScenes, { 'villa>mayor': { meters: 300, seconds: 240 } })
    );

    expect(result.status).toBe('selected');
    if (result.status === 'selected') expect(result.route.sceneIds).toEqual(['villa', 'mayor']);
  });

  it('rejects scene evidence that is not declared by the profile', () => {
    const candidates = scenes([
      ['start', 'Q-start', 'Start'], ['finish', 'Q-finish', 'Finish'],
    ]);
    candidates[1].sourceIds = ['undeclared'];
    candidates[1].facts[0].sourceId = 'undeclared';

    expect(() => optimizeEditorialRouteV7(
      profile(candidates, 60), candidates,
      matrix(candidates, { 'start>finish': { meters: 300, seconds: 240 } })
    )).toThrow('sources declared by the profile');
  });

  it('drops the longer carrier when Cibeles and Alcalá cover exactly the same chapter', () => {
    const candidates = scenes([
      ['palace', 'Q-palace', 'Royal Palace'],
      ['cibeles', 'Q-cibeles', 'Cibeles'],
      ['alcala', 'Q-alcala', 'Puerta de Alcalá'],
    ]);
    const product = profile(candidates, 60);
    product.chapters = [
      { chapterId: 'royal', title: 'Royal power', carrierSceneIds: ['palace'] },
      { chapterId: 'modern', title: 'Modern capital', carrierSceneIds: ['cibeles', 'alcala'] },
    ];
    product.arcChapterIds = ['royal', 'modern'];
    const result = optimizeEditorialRouteV7(product, candidates, matrix(candidates, {
      'palace>cibeles': { meters: 300, seconds: 240 },
      'palace>alcala': { meters: 800, seconds: 640 },
      'cibeles>alcala': { meters: 500, seconds: 400 },
    }));

    expect(result.status).toBe('selected');
    if (result.status === 'selected') expect(result.route.sceneIds).toEqual(['palace', 'cibeles']);
  });

  it('does not add a redundant member after selecting an approved composite scene', () => {
    const candidates = scenes([
      ['palace', 'Q-palace', 'Royal Palace'],
      ['cibeles', 'Q-plaza', 'Cibeles'],
      ['cibeles-palace', 'Q-cibeles-palace', 'Cibeles Palace'],
    ]);
    candidates[1].memberCanonicalIds.push('Q-cibeles-palace');
    candidates[1].conflictsWithSceneIds.push('cibeles-palace');
    const product = profile(candidates, 60);
    product.chapters = [
      { chapterId: 'royal', title: 'Royal power', carrierSceneIds: ['palace'] },
      { chapterId: 'civic', title: 'Civic government', carrierSceneIds: ['cibeles', 'cibeles-palace'] },
    ];
    product.arcChapterIds = ['royal', 'civic'];
    const result = optimizeEditorialRouteV7(product, candidates, matrix(candidates, {
      'palace>cibeles': { meters: 200, seconds: 160 },
      'palace>cibeles-palace': { meters: 210, seconds: 168 },
    }));

    expect(result.status).toBe('selected');
    if (result.status === 'selected') expect(result.route.sceneIds).toEqual(['palace', 'cibeles']);
  });

  it('uses only explicit experience time, tries +15 minute extensions, then reports blockers', () => {
    const candidates = scenes([
      ['start', 'Q-start', 'Start'], ['finish', 'Q-finish', 'Finish'],
    ]);
    const product = profile(candidates, 30);
    const walking = matrix(candidates, { 'start>finish': { meters: 1200, seconds: 1800 } });
    const extended = optimizeEditorialRouteV7(product, candidates, walking, {
      experienceSecondsBySceneId: { start: 300, finish: 300 },
    });
    const impossible = optimizeEditorialRouteV7(product, candidates, walking, {
      experienceSecondsBySceneId: { start: 3000, finish: 3000 },
    });

    expect(extended.status).toBe('selected');
    if (extended.status === 'selected') {
      expect(extended.searchedDurationMinutes).toBe(45);
      expect(extended.route.metrics.estimatedTourMinutes).toBe(40);
    }
    expect(impossible).toMatchObject({
      status: 'infeasible',
      attemptedDurationMinutes: [30, 45, 60, 75, 90],
      responsibleRequirements: ['chapter-finish', 'chapter-start', 'mustVisit:Q-start'],
    });
  });

  it('recommends 90 rather than inflating an 80-minute experience to 120', () => {
    expect(recommendAdvertisedDurationV7(80, 120)).toBe(90);
    expect(recommendAdvertisedDurationV7(102, 120)).toBe(120);
  });
});
