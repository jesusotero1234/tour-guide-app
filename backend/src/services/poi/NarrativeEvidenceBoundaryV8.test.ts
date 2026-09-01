import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import {
  NarrativeResearchHandoffStopV8,
  buildNarrativeEvidenceBoundaryV8,
} from './NarrativeEvidenceBoundaryV8';
import { buildNarrativeEvidenceFixtureV8 } from './NarrativeEvidenceFixturesV8.test-support';

const stats = {
  searchQueries: 0,
  searchQueryAttempts: 0,
  searchQuerySuccesses: 0,
  mapAttempts: 0,
  mapSuccesses: 0,
  webCaptureAttempts: 0,
  webCaptureResponses: 0,
  infrastructureFailureCount: 0,
  mappedUrlCount: 0,
  attemptedUrlCount: 0,
  capturedSourceCount: 0,
  publisherCount: 0,
  curationCount: 0,
};

const route = {
  schemaVersion: 'narrative-route-brief-v6',
  caseId: 'boundary-v8-test',
  city: 'Málaga',
  country: 'España',
  language: 'es',
  theme: 'history',
  durationMinutes: 60,
  stops: [{
    stopId: 'route-stop-d',
    position: 1,
    name: 'Parada D',
    narrativeRole: 'opening',
    wikidataId: 'Q1001',
    wikidataUrl: 'https://www.wikidata.org/wiki/Q1001',
    wikipediaUrl: null,
    coordinates: { lat: 36.72, lng: -4.42 },
    previousStopId: null,
    nextStopId: null,
  }],
  fingerprint: 'route-fingerprint-v8',
} satisfies NarrativeRouteBriefV6;

function makeRoute(
  stops: Array<{
    stopId: string;
    position: number;
    name: string;
    narrativeRole: 'opening' | 'middle' | 'closing';
    wikidataId: string;
    wikidataUrl: string;
    wikipediaUrl: string | null;
    coordinates: { lat: number; lng: number };
    previousStopId: string | null;
    nextStopId: string | null;
  }>
): NarrativeRouteBriefV6 {
  return {
    schemaVersion: 'narrative-route-brief-v6',
    caseId: 'boundary-v8-ready-test',
    city: 'Málaga',
    country: 'España',
    language: 'es',
    theme: 'history',
    durationMinutes: 60,
    stops,
    fingerprint: 'route-fingerprint-ready-v8',
  } satisfies NarrativeRouteBriefV6;
}

function makeHandoff(
  routeStopId: string,
  entityQid: string,
  fixture: ReturnType<typeof buildNarrativeEvidenceFixtureV8>
) {
  if (fixture.tier === 'D') {
    throw new Error('makeHandoff does not support tier D fixtures');
  }
  return {
    routeStopId,
    entityQid,
    result: {
      status: 'sufficient',
      stopId: entityQid,
      gates: fixture.gates,
      dossier: fixture.dossier,
      evidenceTier: fixture.tier,
      routeEligible: true,
      stats: {
        searchQueries: 0,
        searchQueryAttempts: 0,
        searchQuerySuccesses: 0,
        mapAttempts: 0,
        mapSuccesses: 0,
        webCaptureAttempts: 0,
        webCaptureResponses: 0,
        infrastructureFailureCount: 0,
        mappedUrlCount: 0,
        attemptedUrlCount: 0,
        capturedSourceCount: fixture.captures.length,
        publisherCount: new Set(fixture.captures.map((c) => c.publisherKey)).size,
        curationCount: 0,
      },
      captures: fixture.captures,
      captureLog: [],
    },
  } satisfies NarrativeResearchHandoffStopV8;
}

describe('narrative v8 evidence boundary', () => {
  it('blocks a valid tier D result before admission', () => {
    const handoff = {
      routeStopId: 'route-stop-d',
      entityQid: 'Q1001',
      result: {
        status: 'evidence_review_required',
        stopId: 'Q1001',
        gates: {
          minimumEvidenceReady: false,
          writerReady: false,
          missingMinimumRoles: ['visible_observation'],
          missingWriterRoles: ['visible_observation'],
        },
        dossier: null,
        evidenceTier: 'D',
        routeEligible: false,
        stats,
        captures: [],
        captureLog: [],
        reasons: ['minimum evidence missing'],
      },
    } satisfies NarrativeResearchHandoffStopV8;

    expect(buildNarrativeEvidenceBoundaryV8(route, [handoff])).toEqual({
      status: 'blocked',
      stopIds: ['route-stop-d'],
      reasons: ['minimum evidence missing'],
    });
  });

  it('admits a mixed A+B+complete-C+partial-C ready path', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-a-1', publisherKey: 'pub-a-1', authorityTier: 'primary_authority' },
        { sourceId: 'src-a-2', publisherKey: 'pub-a-2', authorityTier: 'primary_authority' },
      ],
    });

    const fixtureB = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-b',
      entityQid: 'Q1003',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-b-1', publisherKey: 'pub-b-1', authorityTier: 'primary_authority' },
      ],
    });

    const fixtureCComplete = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-history-stop-03',
      entityQid: 'Q3849447',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-c-1', publisherKey: 'pub-c-1', authorityTier: 'established_source' },
      ],
    });

    const fixtureCPartial = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-c-partial',
      entityQid: 'Q1004',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-cp-1', publisherKey: 'pub-cp-1', authorityTier: 'established_source' },
        { sourceId: 'src-cp-2', publisherKey: 'pub-cp-2', authorityTier: 'established_source' },
      ],
    });

    const readyRoute = makeRoute([
      {
        stopId: 'route-stop-a',
        position: 1,
        name: 'Parada A',
        narrativeRole: 'opening',
        wikidataId: 'Q1002',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q1002',
        wikipediaUrl: null,
        coordinates: { lat: 36.72, lng: -4.42 },
        previousStopId: null,
        nextStopId: 'route-stop-b',
      },
      {
        stopId: 'route-stop-b',
        position: 2,
        name: 'Parada B',
        narrativeRole: 'middle',
        wikidataId: 'Q1003',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q1003',
        wikipediaUrl: null,
        coordinates: { lat: 36.72, lng: -4.42 },
        previousStopId: 'route-stop-a',
        nextStopId: 'malaga-history-stop-03',
      },
      {
        stopId: 'malaga-history-stop-03',
        position: 3,
        name: 'Parada C',
        narrativeRole: 'middle',
        wikidataId: 'Q3849447',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q3849447',
        wikipediaUrl: null,
        coordinates: { lat: 36.72, lng: -4.42 },
        previousStopId: 'route-stop-b',
        nextStopId: 'route-stop-c-partial',
      },
      {
        stopId: 'route-stop-c-partial',
        position: 4,
        name: 'Parada C Partial',
        narrativeRole: 'closing',
        wikidataId: 'Q1004',
        wikidataUrl: 'https://www.wikidata.org/wiki/Q1004',
        wikipediaUrl: null,
        coordinates: { lat: 36.72, lng: -4.42 },
        previousStopId: 'malaga-history-stop-03',
        nextStopId: null,
      },
    ]);

    const handoffs = [
      makeHandoff('route-stop-a', 'Q1002', fixtureA),
      makeHandoff('route-stop-b', 'Q1003', fixtureB),
      makeHandoff('malaga-history-stop-03', 'Q3849447', fixtureCComplete),
      makeHandoff('route-stop-c-partial', 'Q1004', fixtureCPartial),
    ];

    const originalFingerprints = handoffs.map((h) => h.result.dossier!.fingerprint);
    const originalSufficiency = handoffs.map((h) => h.result.dossier.sufficiency.isSufficient);

    const result = buildNarrativeEvidenceBoundaryV8(readyRoute, handoffs);

    if (result.status !== 'ready') {
      throw new Error(`Expected ready status, got ${result.status}`);
    }

    expect(result.admittedStops.map((s) => s.routeStopId)).toEqual([
      'route-stop-a',
      'route-stop-b',
      'malaga-history-stop-03',
      'route-stop-c-partial',
    ]);
    expect(result.manifest.stops.map((s) => s.evidenceTier)).toEqual(['A', 'B', 'C', 'C']);
    expect(result.manifest.stops.map((s) => s.legacyV6IsSufficient)).toEqual([true, false, false, false]);
    expect(result.manifest.routeFingerprint).toBe(readyRoute.fingerprint);

    const afterFingerprints = handoffs.map((h) => h.result.dossier!.fingerprint);
    const afterSufficiency = handoffs.map((h) => h.result.dossier!.sufficiency.isSufficient);
    expect(afterFingerprints).toEqual(originalFingerprints);
    expect(afterSufficiency).toEqual(originalSufficiency);

    const result2 = buildNarrativeEvidenceBoundaryV8(readyRoute, handoffs);
    if (result2.status !== 'ready') {
      throw new Error(`Expected ready status, got ${result2.status}`);
    }
    expect(result2.manifest.fingerprint).toBe(result.manifest.fingerprint);
  });

  it('rejects a real C result falsely declared tier A', () => {
    const fixtureC = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-c-1', publisherKey: 'pub-c-1', authorityTier: 'established_source' },
      ],
    });

    const handoff = makeHandoff('route-stop-a', 'Q1002', fixtureC);
    handoff.result.evidenceTier = 'A';

    const result = buildNarrativeEvidenceBoundaryV8(route, [handoff]);
    expect(result.status).toBe('protocol_failed');
  });

  it('rejects a real admitted result with fabricated gates', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-a-1', publisherKey: 'pub-a-1', authorityTier: 'primary_authority' },
        { sourceId: 'src-a-2', publisherKey: 'pub-a-2', authorityTier: 'primary_authority' },
      ],
    });

    const handoff = makeHandoff('route-stop-a', 'Q1002', fixtureA);
    handoff.result.gates = {
      minimumEvidenceReady: true,
      writerReady: true,
      missingMinimumRoles: [],
      missingWriterRoles: [],
    };

    const result = buildNarrativeEvidenceBoundaryV8(route, [handoff]);
    expect(result.status).toBe('protocol_failed');
  });

  it('rejects a technical status failed result as protocol_failed', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-a-1', publisherKey: 'pub-a-1', authorityTier: 'primary_authority' },
      ],
    });

    const handoff: NarrativeResearchHandoffStopV8 = {
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      result: {
        status: 'failed',
        stopId: 'Q1002',
        failure: { code: 'curator_contract_failed', message: 'fixture technical failure' },
        evidenceTier: null,
        routeEligible: false,
        stats,
        captures: fixtureA.captures,
        captureLog: [],
      },
    };

    const result = buildNarrativeEvidenceBoundaryV8(route, [handoff]);
    expect(result.status).toBe('protocol_failed');
  });

  it('rejects missing handoff coverage', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-a-1', publisherKey: 'pub-a-1', authorityTier: 'primary_authority' },
      ],
    });

    const handoff = makeHandoff('route-stop-a', 'Q1002', fixtureA);
    const result = buildNarrativeEvidenceBoundaryV8(route, []);
    expect(result.status).toBe('protocol_failed');
  });

  it('rejects extra handoff coverage', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-a-1', publisherKey: 'pub-a-1', authorityTier: 'primary_authority' },
      ],
    });

    const handoff = makeHandoff('route-stop-a', 'Q1002', fixtureA);
    const extraHandoff = makeHandoff('route-stop-extra', 'Q9999', fixtureA);
    const result = buildNarrativeEvidenceBoundaryV8(route, [handoff, extraHandoff]);
    expect(result.status).toBe('protocol_failed');
  });

  it('rejects duplicate handoff coverage and preserves dossier integrity', () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'route-stop-a',
      entityQid: 'Q1002',
      includedRoles: [
        'visible_observation',
        'chronology_or_transformation',
        'human_agency_or_lived_function',
        'tension_or_contrast',
        'distinctive_trait',
      ],
      sources: [
        { sourceId: 'src-a-1', publisherKey: 'pub-a-1', authorityTier: 'primary_authority' },
      ],
    });

    const handoff1 = makeHandoff('route-stop-a', 'Q1002', fixtureA);
    const handoff2 = makeHandoff('route-stop-a', 'Q1002', fixtureA);

    const originalDossierJson = JSON.stringify(handoff1.result.dossier);
    const originalFingerprint = handoff1.result.dossier.fingerprint;

    const result = buildNarrativeEvidenceBoundaryV8(route, [handoff1, handoff2]);
    expect(result.status).toBe('protocol_failed');
    expect(JSON.stringify(handoff1.result.dossier)).toBe(originalDossierJson);
    expect(handoff1.result.dossier.fingerprint).toBe(originalFingerprint);
  });
});
