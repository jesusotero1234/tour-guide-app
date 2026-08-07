import {
  approveCityEditorialProfileV7,
  approveVisitSceneV7,
  buildProfileProposalV7,
  CityEditorialProfileV1,
  editorialFingerprintV7,
  EditorialBenchmarkV7,
  evaluateBlindReviewGateV7,
  OfficialSourceExcerptV1,
  selectSceneEvidenceV7,
  validateCityEditorialProfileV1,
  validateVisitSceneV1,
  VisitSceneV1,
} from './EditorialProfileV7';

const source: OfficialSourceExcerptV1 = {
  sourceId: 'madrid-villa',
  url: 'https://www.esmadrid.com/en/tourist-information/plaza-de-la-villa',
  title: 'Plaza de la Villa | Tourism Madrid',
  capturedAt: '2026-08-07T00:00:00.000Z',
  excerpt: 'The square was a main centre of medieval Madrid and later housed Madrid City Council.',
  contentFingerprint: editorialFingerprintV7(
    'The square was a main centre of medieval Madrid and later housed Madrid City Council.'
  ),
};

function benchmark(): EditorialBenchmarkV7 {
  return {
    schemaVersion: 'editorial-benchmark-v7',
    caseId: 'madrid-history-es-120',
    cityKey: 'madrid',
    theme: 'history',
    requestedDurationMinutes: 120,
    mustVisitCanonicalIds: ['Q-palace'],
    requiredChapters: [
      { chapterId: 'royal', title: 'Royal power', carrierSceneIds: ['scene-palace'] },
      { chapterId: 'civic', title: 'Civic government', carrierSceneIds: ['scene-villa'] },
    ],
    diagnosticReferenceRoutes: [{
      routeId: 'reference-seven',
      purpose: 'diagnostic_only',
      sceneIds: ['scene-palace', 'scene-extra'],
    }],
  };
}

function scene(status: VisitSceneV1['status'] = 'review_required'): VisitSceneV1 {
  return {
    schemaVersion: 'visit-scene-v1',
    sceneId: 'scene-villa',
    status,
    primaryCanonicalId: 'Q-villa',
    memberCanonicalIds: ['Q-villa'],
    name: 'Plaza de la Villa',
    observationPoint: { lat: 40.4152086, lng: -3.710424 },
    facts: [{
      factId: 'villa-medieval', ownerCanonicalId: 'Q-villa', sourceId: source.sourceId,
      role: 'historical_context',
      value: 'Three streets preserve the primitive medieval layout of Madrid.',
    }],
    sourceIds: [source.sourceId],
    conflictsWithSceneIds: [],
    review: null,
  };
}

describe('editorial profile v7 contracts', () => {
  it('keeps requirements, alternative carriers, and diagnostic routes as separate concepts', () => {
    const proposal = buildProfileProposalV7(benchmark(), {
      productPromise: 'From medieval town to modern capital',
      arcChapterIds: ['royal', 'civic'],
      sources: [source],
      approvedSceneIds: ['scene-palace', 'scene-villa', 'scene-extra'],
      requiresStreetAudit: true,
    });

    expect(proposal.status).toBe('review_required');
    expect(proposal.mustVisitCanonicalIds).toEqual(['Q-palace']);
    expect(proposal.chapters[0].carrierSceneIds).toEqual(['scene-palace']);
    expect(proposal.mustVisitCanonicalIds).not.toContain('scene-extra');
    expect(proposal).not.toHaveProperty('diagnosticReferenceRoutes');
  });

  it('never treats an unreviewed proposal as approved', () => {
    const proposal = buildProfileProposalV7(benchmark(), {
      productPromise: 'From medieval town to modern capital',
      arcChapterIds: ['royal', 'civic'],
      sources: [source],
      approvedSceneIds: ['scene-palace', 'scene-villa'],
      requiresStreetAudit: false,
    });

    expect(validateCityEditorialProfileV1(proposal).status).toBe('review_required');
    expect(() => validateCityEditorialProfileV1({ ...proposal, status: 'approved' })).toThrow(
      'approved profile requires a matching human review'
    );
  });

  it('requires attributable review metadata for an approved profile and overrides', () => {
    const proposal = buildProfileProposalV7(benchmark(), {
      productPromise: 'From medieval town to modern capital',
      arcChapterIds: ['royal', 'civic'], sources: [source],
      approvedSceneIds: ['scene-palace', 'scene-villa'], requiresStreetAudit: false,
    });
    const approved = approveCityEditorialProfileV7(proposal, {
      author: 'editor@example.com', reviewedAt: '2026-08-07T10:00:00.000Z',
      reason: 'Blind review approved the product definition.', sourceIds: [source.sourceId],
    });

    expect(validateCityEditorialProfileV1(approved)).toEqual(approved);
    const invalid = {
      ...approved,
      overrides: [{ author: '', recordedAt: '', reason: '', sourceIds: [] }],
    } as unknown as CityEditorialProfileV1;
    expect(() => validateCityEditorialProfileV1(invalid)).toThrow('override');
  });

  it('rejects a stale official-source fingerprint', () => {
    expect(() => buildProfileProposalV7(benchmark(), {
      productPromise: 'From medieval town to modern capital',
      arcChapterIds: ['royal', 'civic'],
      sources: [{ ...source, excerpt: `${source.excerpt} Changed.` }],
      approvedSceneIds: ['scene-palace', 'scene-villa'], requiresStreetAudit: false,
    })).toThrow('source fingerprint');
  });

  it('rejects unsupported source URLs and unknown review states', () => {
    const proposal = buildProfileProposalV7(benchmark(), {
      productPromise: 'From medieval town to modern capital',
      arcChapterIds: ['royal', 'civic'], sources: [source],
      approvedSceneIds: ['scene-palace', 'scene-villa'], requiresStreetAudit: false,
    });
    expect(() => validateCityEditorialProfileV1({
      ...proposal,
      sources: [{ ...source, url: 'javascript:alert(1)' }],
    })).toThrow('URL must be HTTP(S)');
    expect(() => validateCityEditorialProfileV1({
      ...proposal, status: 'verified' as CityEditorialProfileV1['status'],
    })).toThrow('invalid profile review status');
  });
});

describe('visit scenes and evidence v7', () => {
  it('preserves Villa medieval, built-environment, and municipal facts without 80-character clipping', () => {
    const facts = selectSceneEvidenceV7([
      { factId: 'observable', ownerCanonicalId: 'Q-villa', sourceId: source.sourceId, role: 'observable', value: 'The façades of the Lujanes tower, Cisneros house and Casa de la Villa remain visible around the square.' },
      { factId: 'medieval', ownerCanonicalId: 'Q-villa', sourceId: source.sourceId, role: 'historical_context', value: 'The streets of Codo, Cordón and Madrid preserve the primitive medieval layout and made this one of medieval Madrid’s main centres.' },
      { factId: 'municipal', ownerCanonicalId: 'Q-villa', sourceId: source.sourceId, role: 'local_function', value: 'Casa de la Villa was the seat of Madrid City Council, giving the square a distinct civic function.' },
      { factId: 'distinctive', ownerCanonicalId: 'Q-villa', sourceId: source.sourceId, role: 'distinctive', value: 'Three major civil buildings from the fifteenth, sixteenth and seventeenth centuries share one compact scene.' },
      { factId: 'overflow', ownerCanonicalId: 'Q-villa', sourceId: source.sourceId, role: 'historical_context', value: 'A'.repeat(281) },
    ]);

    expect(facts.map((fact) => fact.factId)).toEqual([
      'observable', 'medieval', 'municipal', 'distinctive',
    ]);
    expect(facts.every((fact) => fact.value.length > 80 && fact.value.length <= 280)).toBe(true);
  });

  it('allows Cibeles member facts only through an explicitly approved composite scene', () => {
    const draft: VisitSceneV1 = {
      ...scene(), sceneId: 'scene-cibeles', primaryCanonicalId: 'Q1537446',
      memberCanonicalIds: ['Q1537446', 'Q2736564', 'Q1849031'], name: 'Cibeles',
      facts: [
        { factId: 'square', ownerCanonicalId: 'Q1537446', sourceId: source.sourceId, role: 'observable', value: 'The square begins the Paseo del Arte.' },
        { factId: 'fountain', ownerCanonicalId: 'Q2736564', sourceId: source.sourceId, role: 'historical_context', value: 'The fountain has stood here since 1782.' },
        { factId: 'palace', ownerCanonicalId: 'Q1849031', sourceId: source.sourceId, role: 'local_function', value: 'The former main post office now houses Madrid City Hall.' },
      ],
    };
    const approved = approveVisitSceneV7(draft, {
      author: 'editor@example.com', reviewedAt: '2026-08-07T10:00:00.000Z',
      reason: 'All three identities form one visible scene.', sourceIds: [source.sourceId],
    });

    expect(validateVisitSceneV1(approved)).toEqual(approved);
    expect(approved.facts.map((fact) => fact.ownerCanonicalId)).toEqual([
      'Q1537446', 'Q2736564', 'Q1849031',
    ]);
    expect(() => validateVisitSceneV1({
      ...approved,
      facts: [...approved.facts, {
        factId: 'borrowed', ownerCanonicalId: 'Q-not-a-member', sourceId: source.sourceId,
        role: 'distinctive', value: 'Borrowed fact',
      }],
    })).toThrow('fact owner must be an exact scene member');
  });
});

describe('blind review gate v7', () => {
  it('passes only with two pay votes, strong medians, and no repeated critical omission', () => {
    const reviews = ['a', 'b', 'c'].map((reviewerId, index) => ({
      reviewerId, wouldPay: index < 2, criticalOmissions: index < 2 ? [] : ['minor'],
      scores: { criticalCoverage: 4, progression: 4, uniqueness: 4, comfort: 5, resolution: 4, temporalHonesty: 5 },
    }));
    expect(evaluateBlindReviewGateV7(reviews).passed).toBe(true);
    reviews[0].criticalOmissions = ['missing-villa'];
    reviews[1].criticalOmissions = ['missing-villa'];
    expect(evaluateBlindReviewGateV7(reviews).passed).toBe(false);
  });

  it('rejects incomplete scorecards instead of treating missing scores as low scores', () => {
    const reviews = ['a', 'b', 'c'].map((reviewerId) => ({
      reviewerId, wouldPay: true, criticalOmissions: [],
      scores: { criticalCoverage: 5, progression: 5, uniqueness: 5, comfort: 5, resolution: 5 },
    }));

    expect(() => evaluateBlindReviewGateV7(
      reviews as unknown as Parameters<typeof evaluateBlindReviewGateV7>[0]
    )).toThrow('scores must be integers');
  });
});
