import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  buildCoreAuditRequestV6,
  CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6,
  CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6,
  coreAuditResponseSchemaV6,
  CoreAuditV6,
  resolveCanonicalTourCoreV6,
  validateCoreAuditV6,
} from './EditorialCoreResolverV6';
import {
  WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6,
  WikimediaProminenceSnapshotV6,
} from './EditorialProminenceV6';

function entity(index: number): EditorialEntityCandidateV5 {
  const canonicalId = `Q${index + 1}`;
  return {
    canonicalId,
    siteId: `site:${canonicalId}`,
    sourceIds: [`node:${index + 1}`],
    localName: `Candidate ${index + 1}`,
    category: index % 2 === 0 ? 'square_civic' : 'memorial',
    coordinates: { lat: 40.4 + (index * 0.001), lng: -3.7 },
    fameScore: 50,
    recognitionScore: 70,
    evidenceFacts: [{
      id: `${canonicalId}:historical`, source: 'wikidata', sourceId: canonicalId,
      kind: 'claim', value: `inception: 18${String(index).padStart(2, '0')}`,
      observable: false,
    }],
    readiness: {
      ready: true, observableCount: 1, contextCount: 1,
      historicalSpecificCount: 1, missing: [],
    },
    visitConflictGroup: null,
  };
}

function prominence(entities: EditorialEntityCandidateV5[]): WikimediaProminenceSnapshotV6 {
  const candidates = entities.map((candidate, index) => ({
    canonicalId: candidate.canonicalId,
    localName: candidate.localName,
    wikipediaTitle: candidate.localName.replace(/ /g, '_'),
    cityWikipediaLinked: index < 10,
    wikivoyageSeeMentioned: index < 8,
    wikivoyageSectionTitle: index < 8 ? 'Ver' : null,
    sitelinks: 200 - index,
    pageviews365: 100_000 - (index * 1_000),
    pageviewPercentile: Number((1 - (index / entities.length)).toFixed(4)),
    heritageDesignation: index % 3 === 0,
    support: [
      'city_wikipedia_link', 'wikivoyage_see_mention', 'wikidata_sitelinks',
      'wikipedia_pageviews', 'heritage_designation', 'historical_evidence',
    ].map((type, supportIndex) => ({
      supportId: `${candidate.canonicalId}:support-${supportIndex + 1}`,
      type: type as WikimediaProminenceSnapshotV6['candidates'][number]['support'][number]['type'],
      value: `${type} ${'x'.repeat(180)}`,
      sourceRef: `source:${supportIndex + 1}`,
    })),
  }));
  return {
    schemaVersion: WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6,
    cityKey: 'madrid',
    language: 'es',
    capturedAt: '2026-08-07T00:00:00.000Z',
    pageviewWindow: { start: '2025-08-07', end: '2026-08-06' },
    sourceRevisions: [{
      sourceId: 'eswiki:Madrid', project: 'es.wikipedia.org', title: 'Madrid',
      revisionId: 123, revisionTimestamp: '2026-08-06T00:00:00.000Z',
    }],
    candidates,
    fingerprint: 'source-fingerprint',
  };
}

function auditFor(
  request: ReturnType<typeof buildCoreAuditRequestV6>,
  requiredIds: Set<string>
): CoreAuditV6 {
  return validateCoreAuditV6({
    schemaVersion: 'core-audit-v1',
    classifications: request.candidates.map((candidate) => ({
      canonicalId: candidate.canonicalId,
      classification: requiredIds.has(candidate.canonicalId) ? 'required' : 'optional',
      reasonCode: requiredIds.has(candidate.canonicalId) ? 'city_defining' : null,
      omissionReason: requiredIds.has(candidate.canonicalId)
        ? `${candidate.localName} defines the first-visit route.`
        : `${candidate.localName} is useful supporting material.`,
      supportIds: [candidate.support[0].supportId],
    })),
  }, request);
}

describe('canonical tour core v6', () => {
  const entities = Array.from({ length: 30 }, (_, index) => entity(index));
  const snapshot = prominence(entities);
  const context = { cityKey: 'madrid', theme: 'history', durationMinutes: 120 };

  it('builds three compact deterministic permutations without changing candidate membership', () => {
    const requests = ['seed-a', 'seed-b', 'seed-c'].map((seed) => (
      buildCoreAuditRequestV6(context, entities, snapshot, seed)
    ));

    expect(new Set(requests.map((request) => (
      request.candidates.map((candidate) => candidate.canonicalId).join('>')
    ))).size).toBe(3);
    for (const request of requests) {
      expect(new Set(request.candidates.map((candidate) => candidate.canonicalId)))
        .toEqual(new Set(entities.map((candidate) => candidate.canonicalId)));
      expect(JSON.stringify(request).length).toBeLessThanOrEqual(CORE_AUDIT_INPUT_CHARACTER_LIMIT_V6);
      expect(JSON.stringify(coreAuditResponseSchemaV6(request)).length)
        .toBeLessThanOrEqual(CORE_AUDIT_SCHEMA_CHARACTER_LIMIT_V6);
    }
  });

  it('rejects invented IDs and evidence owned by another candidate', () => {
    const request = buildCoreAuditRequestV6(context, entities, snapshot, 'seed-a');
    const valid = auditFor(request, new Set(['Q1', 'Q2']));
    const invented = structuredClone(valid);
    invented.classifications[0].canonicalId = 'Q999999';
    expect(() => validateCoreAuditV6(invented, request)).toThrow(/every candidate/i);

    const contaminated = structuredClone(valid);
    contaminated.classifications[0].supportIds = [
      request.candidates.find((candidate) => (
        candidate.canonicalId !== contaminated.classifications[0].canonicalId
      ))!.support[0].supportId,
    ];
    expect(() => validateCoreAuditV6(contaminated, request)).toThrow(/owned/i);

    const verbose = structuredClone(valid);
    verbose.classifications[0].omissionReason = 'x'.repeat(321);
    expect(() => validateCoreAuditV6(verbose, request)).toThrow(/omissionReason/i);
  });

  it('approves only exact three-run consensus with one to eight requirements', () => {
    const seeds = ['seed-a', 'seed-b', 'seed-c'];
    const requests = seeds.map((seed) => buildCoreAuditRequestV6(context, entities, snapshot, seed));
    const required = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
    const result = resolveCanonicalTourCoreV6({
      context,
      sourceFingerprint: snapshot.fingerprint,
      provider: 'deepseek',
      model: 'deepseek-v4-flash',
      promptFingerprint: 'prompt-fingerprint',
      runs: requests.map((request, index) => ({
        seed: seeds[index], request, response: auditFor(request, required),
        responseFingerprint: `response-${index + 1}`,
      })),
    });

    expect(result.status).toBe('approved');
    if (result.status !== 'approved') throw new Error('Expected approved core');
    expect(result.core.requirements.map((requirement) => requirement.canonicalId).sort())
      .toEqual([...required].sort());
    expect(result.core.requirements.every((requirement) => (
      requirement.provenance === 'stable_model_consensus'
    ))).toBe(true);
    expect(result.core.audit.disputedCanonicalIds).toEqual([]);
  });

  it('approves the unanimous required intersection and exposes disputed IDs in audit', () => {
    const seeds = ['seed-a', 'seed-b', 'seed-c'];
    const requests = seeds.map((seed) => buildCoreAuditRequestV6(context, entities, snapshot, seed));
    const sets = [new Set(['Q1', 'Q2']), new Set(['Q1']), new Set(['Q1', 'Q2'])];
    const result = resolveCanonicalTourCoreV6({
      context,
      sourceFingerprint: snapshot.fingerprint,
      provider: 'deepseek', model: 'deepseek-v4-flash', promptFingerprint: 'prompt-fingerprint',
      runs: requests.map((request, index) => ({
        seed: seeds[index], request, response: auditFor(request, sets[index]),
        responseFingerprint: `response-${index + 1}`,
      })),
    });

    expect(result.status).toBe('approved');
    if (result.status !== 'approved') throw new Error('Expected approved core');
    expect(result.core.requirements.map((requirement) => requirement.canonicalId).sort())
      .toEqual(['Q1']);
    expect(result.core.requirements.every((requirement) => (
      requirement.provenance === 'stable_model_consensus'
    ))).toBe(true);
    expect(result.core.audit.disputedCanonicalIds).toEqual(['Q2']);
  });

  it.each([
    ['empty core', [new Set<string>(), new Set<string>(), new Set<string>()]],
    ['more than eight', [
      new Set(Array.from({ length: 9 }, (_, index) => `Q${index + 1}`)),
      new Set(Array.from({ length: 9 }, (_, index) => `Q${index + 1}`)),
      new Set(Array.from({ length: 9 }, (_, index) => `Q${index + 1}`)),
    ]],
  ])('returns core_review_required for %s without filling or truncating', (_label, sets) => {
    const seeds = ['seed-a', 'seed-b', 'seed-c'];
    const requests = seeds.map((seed) => buildCoreAuditRequestV6(context, entities, snapshot, seed));
    const result = resolveCanonicalTourCoreV6({
      context,
      sourceFingerprint: snapshot.fingerprint,
      provider: 'deepseek', model: 'deepseek-v4-flash', promptFingerprint: 'prompt-fingerprint',
      runs: requests.map((request, index) => ({
        seed: seeds[index], request, response: auditFor(request, sets[index]),
        responseFingerprint: `response-${index + 1}`,
      })),
    });

    expect(result.status).toBe('core_review_required');
    if (result.status !== 'core_review_required') throw new Error('Expected review result');
    expect(result.requiredSets).toEqual(sets.map((set) => [...set].sort()));
  });
});
