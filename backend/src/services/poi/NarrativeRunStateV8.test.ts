import {
  ClassifyRunBlockInputV8,
  NarrativeRunDiagnosticsV8,
  classifyRunBlockV8,
} from './NarrativeRunStateV8';

function blockInput(overrides: Partial<ClassifyRunBlockInputV8> = {}): ClassifyRunBlockInputV8 {
  return {
    missingRequiredIds: [],
    geometryStatus: 'walkable',
    geometryReason: null,
    noResults: false,
    captureBlocked: false,
    parseEmpty: false,
    authorityInsufficient: false,
    evidenceReviewRequired: false,
    curatorContractFailed: false,
    coreDisagreement: false,
    ...overrides,
  };
}

describe('classifyRunBlockV8', () => {
  it('returns no reasons when nothing blocks the run', () => {
    expect(classifyRunBlockV8(blockInput())).toEqual([]);
  });

  it('reports required_identity_missing when a required QID is missing', () => {
    expect(classifyRunBlockV8(blockInput({ missingRequiredIds: ['Q48435'] })))
      .toEqual(['required_identity_missing']);
  });

  it('reports too_many_self_transfers when the geometry reason says so', () => {
    expect(classifyRunBlockV8(blockInput({
      geometryStatus: 'route_review_required',
      geometryReason: 'too_many_self_transfers',
    }))).toEqual(['too_many_self_transfers']);
  });

  it('reports guided_duration_infeasible when the geometry reason says so', () => {
    expect(classifyRunBlockV8(blockInput({
      geometryStatus: 'route_review_required',
      geometryReason: 'guided_duration_infeasible',
    }))).toEqual(['guided_duration_infeasible']);
  });

  it('gives capture_blocked priority over no_results', () => {
    expect(classifyRunBlockV8(blockInput({ captureBlocked: true, noResults: true })))
      .toEqual(['capture_blocked']);
  });

  it('reports curator_contract_failed above authority_insufficient', () => {
    expect(classifyRunBlockV8(blockInput({
      curatorContractFailed: true,
      authorityInsufficient: true,
    }))).toEqual(['curator_contract_failed']);
  });

  it('gives core_disagreement priority over required_identity_missing', () => {
    expect(classifyRunBlockV8(blockInput({
      coreDisagreement: true,
      missingRequiredIds: ['Q48435'],
    }))).toEqual(['core_disagreement']);
  });

  it('treats geometry verdicts as higher priority than capture_blocked', () => {
    expect(classifyRunBlockV8(blockInput({
      geometryStatus: 'route_review_required',
      geometryReason: 'too_many_self_transfers',
      captureBlocked: true,
    }))).toEqual(['too_many_self_transfers']);
  });

  it('throws on an unknown geometry reason', () => {
    expect(() => classifyRunBlockV8(blockInput({
      geometryStatus: 'route_review_required',
      geometryReason: 'unknown_reason',
    }))).toThrow('unknown geometry reason');
  });

  it('throws when route review is required without a geometry reason', () => {
    expect(() => classifyRunBlockV8(blockInput({ geometryStatus: 'route_review_required' })))
      .toThrow('requires a geometry reason');
  });

  it('throws when a geometry reason arrives for a non-review status', () => {
    expect(() => classifyRunBlockV8(blockInput({
      geometryStatus: 'walkable',
      geometryReason: 'guided_duration_infeasible',
    }))).toThrow('non-review route status');
  });
});

describe('NarrativeRunDiagnosticsV8', () => {
  it('appendPhase records every phase field', () => {
    const diagnostics = new NarrativeRunDiagnosticsV8();
    diagnostics.appendPhase({
      phase: 'capture',
      provider: 'FirecrawlNarrativeCaptureProviderV7',
      language: 'es',
      country: 'ES',
      resultCount: 3,
      mappedUrls: ['https://example.org/a', 'https://example.org/b'],
      finalHttpStatus: 200,
      authorityTier: 'official',
      cacheHit: false,
      evidenceGaps: ['Q48435', 'Q179684'],
      substitutions: 1,
      editorialCoreCoverage: 0.5,
      freeTransferCount: 0,
      reason: null,
      message: 'captured 3 of 12 allowed URLs',
    });

    expect(diagnostics.phases).toHaveLength(1);
    const entry = diagnostics.phases[0];
    expect(entry.phase).toBe('capture');
    expect(entry.provider).toBe('FirecrawlNarrativeCaptureProviderV7');
    expect(entry.language).toBe('es');
    expect(entry.country).toBe('ES');
    expect(entry.resultCount).toBe(3);
    expect(entry.mappedUrls).toEqual(['https://example.org/a', 'https://example.org/b']);
    expect(entry.finalHttpStatus).toBe(200);
    expect(entry.authorityTier).toBe('official');
    expect(entry.cacheHit).toBe(false);
    expect(entry.evidenceGaps).toEqual(['Q48435', 'Q179684']);
    expect(entry.substitutions).toBe(1);
    expect(entry.editorialCoreCoverage).toBe(0.5);
    expect(entry.freeTransferCount).toBe(0);
    expect(entry.reason).toBeNull();
    expect(entry.message).toBe('captured 3 of 12 allowed URLs');
  });

  it('collects phase reasons into the run-level reasons', () => {
    const diagnostics = new NarrativeRunDiagnosticsV8();
    diagnostics.appendPhase({
      phase: 'geometry',
      provider: 'TourGeometryV8',
      language: 'es',
      country: 'ES',
      resultCount: 0,
      mappedUrls: [],
      finalHttpStatus: null,
      authorityTier: 'core',
      cacheHit: false,
      evidenceGaps: [],
      substitutions: 0,
      editorialCoreCoverage: 1,
      freeTransferCount: 3,
      reason: 'too_many_self_transfers',
    });
    diagnostics.appendPhase({
      phase: 'discovery',
      provider: 'SearxngNarrativeDiscoveryProviderV7',
      language: 'es',
      country: 'ES',
      resultCount: 4,
      mappedUrls: [],
      finalHttpStatus: 200,
      authorityTier: 'official',
      cacheHit: false,
      evidenceGaps: [],
      substitutions: 0,
      editorialCoreCoverage: 0,
      freeTransferCount: 0,
      reason: null,
    });

    expect(diagnostics.reasons).toEqual(['too_many_self_transfers']);
  });
});
