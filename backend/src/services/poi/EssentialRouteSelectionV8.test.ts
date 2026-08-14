import { CanonicalTourCoreV6 } from './EditorialCoreResolverV6';
import {
  EssentialRouteCandidateV8,
  requiredCanonicalIdsFromCoreV8,
  selectEssentialRouteV8,
} from './EssentialRouteSelectionV8';

function place(
  name: string,
  wikidataId: string,
  lat: number,
  lng: number,
  category = 'other',
  options: Partial<EssentialRouteCandidateV8> = {}
): EssentialRouteCandidateV8 & { name: string } {
  return {
    name,
    wikidataId,
    coordinates: { lat, lng },
    category,
    ...options,
  };
}

function coreWith(requiredIds: string[]): CanonicalTourCoreV6 {
  return {
    schemaVersion: 'canonical-tour-core-v1',
    cityKey: 'test-city',
    theme: 'history',
    durationMinutes: 120,
    sourceFingerprint: 'test-fingerprint',
    status: 'approved',
    requirements: requiredIds.map((canonicalId) => ({
      canonicalId,
      reasonCode: 'city_defining',
      omissionReason: 'test',
      supportIds: [],
      provenance: 'stable_model_consensus' as const,
    })),
    audit: {
      provider: 'deepseek',
      model: 'test',
      promptFingerprint: 'test',
      responseFingerprints: ['test'],
      candidatePermutationSeeds: ['a', 'b', 'c'],
    },
  };
}

describe('requiredCanonicalIdsFromCoreV8', () => {
  it('extracts exact Wikidata identities from an approved core', () => {
    const core = coreWith(['Q239', 'Q179684', 'Q17148']);
    expect(requiredCanonicalIdsFromCoreV8(core)).toEqual(['Q17148', 'Q179684', 'Q239']);
  });

  it('returns an empty set when the core is not approved', () => {
    expect(requiredCanonicalIdsFromCoreV8(null)).toEqual([]);
  });
});

describe('selectEssentialRouteV8 identity', () => {
  it('excludes candidates without a real QID and records identity_unresolved', () => {
    const result = selectEssentialRouteV8(
      [
        place('Anchor', 'Q48435', 41.38, 2.17, 'religious'),
        place('OSM only', 'osm:node:1234', 41.382, 2.172, 'market'),
        place('No id', '', 41.383, 2.175, 'market'),
      ],
      ['Q48435'],
      3
    );

    expect(result.route.map((candidate) => candidate.wikidataId)).toEqual(['Q48435']);
    expect(result.identityUnresolved).toEqual(
      expect.arrayContaining(['OSM only', 'No id'])
    );
    expect(result.coverage.optionalCount).toBe(0);
  });

  it('does not let an osm:* candidate satisfy a required QID', () => {
    const result = selectEssentialRouteV8(
      [place('OSM impostor', 'osm:node:999', 41.38, 2.17, 'religious')],
      ['Q48435'],
      3
    );

    expect(result.missingRequiredIds).toEqual(['Q48435']);
    expect(result.route).toEqual([]);
    expect(result.identityUnresolved).toContain('OSM impostor');
  });
});

describe('selectEssentialRouteV8', () => {
  it('keeps a remote required QID even when a central flagship exists', () => {
    const sagrada = place('Sagrada Família', 'Q48435', 41.4036, 2.1744, 'religious', {
      landmarkTier: 'flagship',
      fameScore: 26,
    });
    const centralFlagship = place('Central Cathedral', 'Q111111', 41.3874, 2.1686, 'religious', {
      landmarkTier: 'flagship',
      fameScore: 20,
    });
    const filler = place('Old Market', 'Q222222', 41.3889, 2.1701, 'market', {
      landmarkTier: 'filler',
      fameScore: 10,
    });

    const result = selectEssentialRouteV8(
      [centralFlagship, filler, sagrada],
      ['Q48435'],
      2,
      { requestedDuration: 120 }
    );

    expect(result.route.map((item) => item.wikidataId)).toContain('Q48435');
    expect(result.missingRequiredIds).toEqual([]);
    expect(result.coverage.requiredCovered).toBe(true);
  });

  it('does not let a generic flagship satisfy another required QID', () => {
    const genericFlagship = place('Generic Museum', 'Q999999', 41.3874, 2.1686, 'museum', {
      landmarkTier: 'flagship',
      fameScore: 25,
    });
    const requiredPalace = place('Royal Palace', 'Q888888', 41.3874, 2.1686, 'palace_castle', {
      landmarkTier: 'flagship',
      fameScore: 24,
    });

    const result = selectEssentialRouteV8(
      [genericFlagship],
      ['Q888888'],
      1,
      { requestedDuration: 120 }
    );

    expect(result.missingRequiredIds).toEqual(['Q888888']);
    expect(result.coverage.requiredCovered).toBe(false);
    expect(result.selectedRequiredIds).toEqual([]);
  });

  it('prefers optional places close to required places when scores are equal', () => {
    const required = place('Anchor', 'Q111', 41.38, 2.17, 'square_civic', {
      landmarkTier: 'flagship',
    });
    const nearOptional = place('Near Stop', 'Q222', 41.382, 2.172, 'market', {
      landmarkTier: 'supporting',
    });
    const farOptional = place('Far Stop', 'Q333', 41.50, 2.30, 'market', {
      landmarkTier: 'supporting',
    });

    const result = selectEssentialRouteV8(
      [nearOptional, farOptional, required],
      ['Q111'],
      3,
      { requestedDuration: 120 }
    );

    expect(result.route.map((item) => item.wikidataId)).toContain('Q222');
  });

  it('reports a missing required identity without silently substituting it', () => {
    const result = selectEssentialRouteV8(
      [place('Available Stop', 'Q777', 41.38, 2.17)],
      ['Q48435'],
      2,
      { requestedDuration: 120 }
    );

    expect(result.missingRequiredIds).toEqual(['Q48435']);
    expect(result.route).toHaveLength(1);
    expect(result.coverage.requiredRatio).toBe(0);
  });

  it('keeps wikidataId intact through selection and positioning', () => {
    const result = selectEssentialRouteV8(
      [place('A', 'Q1', 41.38, 2.17), place('B', 'Q2', 41.39, 2.18)],
      ['Q1'],
      2,
      { requestedDuration: 120 }
    );

    result.route.forEach((item, index) => {
      expect(item.position).toBe(index);
      expect(typeof item.wikidataId).toBe('string');
    });
  });

  it('balances categories when filling optional stops', () => {
    const required = place('Anchor', 'Q1', 41.38, 2.17, 'square_civic', {
      landmarkTier: 'flagship',
    });
    const museums = [
      place('M1', 'Q2', 41.381, 2.171, 'museum', { landmarkTier: 'supporting' }),
      place('M2', 'Q3', 41.382, 2.172, 'museum', { landmarkTier: 'supporting' }),
      place('M3', 'Q4', 41.383, 2.173, 'museum', { landmarkTier: 'supporting' }),
    ];
    const market = place('Market', 'Q5', 41.384, 2.174, 'market', {
      landmarkTier: 'supporting',
    });

    const result = selectEssentialRouteV8(
      [...museums, market, required],
      ['Q1'],
      5,
      { requestedDuration: 120 }
    );

    const categories = result.route.map((item) => item.category);
    expect(categories.filter((category) => category === 'museum').length).toBeLessThanOrEqual(3);
    expect(categories).toContain('market');
  });
});
