import { EditorialCallResultV6, requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import {
  NarrativeAdjudicationInputV6,
  NarrativeAuditInputV6,
  NarrativeWriterInputV6,
} from './NarrativeEditorialAgentsV6';
import { NarrativeAuditorV6 } from './NarrativeEditorialV6';
import {
  NarrativeEditorialAgentsV8,
} from './NarrativeEditorialAgentsV8';
import {
  NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8,
  NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
  NarrativeResearchHandoffStopV8,
  buildNarrativeEvidenceBoundaryV8,
} from './NarrativeEvidenceBoundaryV8';
import {
  buildNarrativeEvidenceFixtureV8,
  NarrativeEvidenceFixtureResultV8,
} from './NarrativeEvidenceFixturesV8.test-support';
import { createNarrativeArcArchitectV8 } from './NarrativeArcArchitectV8';
import { runNarrativeEditorialWorkflowV8 } from './NarrativeEditorialWorkflowV8';

jest.mock('./EditorialStructuredLlmV6', () => ({
  requestEditorialStructuredV6: jest.fn(),
}));

const COMPLETE_ROLES = [
  'visible_observation',
  'chronology_or_transformation',
  'human_agency_or_lived_function',
  'tension_or_contrast',
  'distinctive_trait',
] as const;
const PARTIAL_ROLES = [
  'visible_observation',
  'chronology_or_transformation',
  'human_agency_or_lived_function',
  'distinctive_trait',
] as const;

function diagnostic<T>(callId: string, value: T): EditorialCallResultV6<T> {
  return {
    callId,
    status: 'valid',
    value,
    attempts: [{
      attempt: 1,
      status: 'valid',
      latencyMs: 1,
      rawOutput: '{}',
      error: null,
    }],
    model: 'fake',
    promptFingerprint: 'p',
    responseFingerprint: 'r',
    inputCharacters: 1,
    schemaCharacters: 1,
    input: {},
    rawOutput: '{}',
  };
}

function evidenceFixture(
  routeStopId: string,
  entityQid: string,
  roles: readonly (typeof COMPLETE_ROLES[number])[]
): NarrativeEvidenceFixtureResultV8 {
  return buildNarrativeEvidenceFixtureV8({
    routeStopId,
    entityQid,
    includedRoles: [...roles],
    sources: [{
      sourceId: `source-${routeStopId}`,
      publisherKey: `publisher-${routeStopId}.example`,
      authorityTier: 'established_source',
    }],
  });
}

function admit(fixture: NarrativeEvidenceFixtureResultV8): NarrativeAdmittedStopV8 {
  if (fixture.tier === 'D') throw new Error('fixture must be admitted');
  return {
    routeStopId: fixture.routeStopId,
    entityQid: fixture.entityQid,
    dossier: fixture.dossier,
    evidence: {
      schemaVersion: NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8,
      routeStopId: fixture.routeStopId,
      entityQid: fixture.entityQid,
      evidenceTier: fixture.tier,
      routeEligible: true,
      gates: fixture.gates,
      dossierFingerprint: fixture.dossier.fingerprint,
      legacyV6IsSufficient: fixture.dossier.sufficiency.isSufficient,
    },
  };
}

function manifestFor(
  route: NarrativeRouteBriefV6,
  stops: NarrativeAdmittedStopV8[]
): NarrativeEvidenceManifestV8 {
  return {
    schemaVersion: NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
    routeFingerprint: route.fingerprint,
    stops: stops.map(({ evidence }) => ({
      routeStopId: evidence.routeStopId,
      entityQid: evidence.entityQid,
      evidenceTier: evidence.evidenceTier,
      routeEligible: evidence.routeEligible,
      gates: evidence.gates,
      dossierFingerprint: evidence.dossierFingerprint,
      legacyV6IsSufficient: evidence.legacyV6IsSufficient,
    })),
    fingerprint: 'm'.repeat(64),
  };
}

type FakeAgentsV8 = NarrativeEditorialAgentsV8 & {
  write: jest.Mock;
  audit: jest.Mock;
  adjudicate: jest.Mock;
  repair: jest.Mock;
  auditTour: jest.Mock;
};

function fakeAgents(manifestFingerprint: string): FakeAgentsV8 {
  const write = jest.fn(async (input: NarrativeWriterInputV6) => {
    const value = {
      text: input.dossier.propositions.map((proposition) => proposition.text).join(' '),
    };
    return { value, diagnostic: diagnostic(`write-${input.stopId}`, value) };
  });
  const audit = jest.fn(async (input: NarrativeAuditInputV6, auditor: NarrativeAuditorV6) => {
    const propositionId = input.dossier.propositions[0]?.propositionId ?? '';
    const value = {
      auditor,
      findings: input.script.sentences.map((sentence) => ({
        sentenceId: sentence.sentenceId,
        classification: 'supported' as const,
        reason: 'Respaldada.',
        propositionIds: propositionId ? [propositionId] : [],
      })),
    };
    return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
  });
  const adjudicate = jest.fn(async (input: NarrativeAdjudicationInputV6) => {
    const value = input.objections.map((objection) => ({
      objectionId: objection.objectionId,
      decision: 'rejected' as const,
      reason: 'No requiere corrección.',
    }));
    return { value, diagnostic: diagnostic('adjudicate', value) };
  });
  const repair = jest.fn(async () => {
    const value = { replacements: [] };
    return { value, diagnostic: diagnostic('repair', value) };
  });
  const auditTour = jest.fn(async () => {
    const value = {
      issues: [],
      progressionWorks: true,
      promiseDelivered: true,
      closingWorks: true,
    };
    return { value, diagnostic: diagnostic('tour-audit', value) };
  });
  return {
    evidenceManifestFingerprint: manifestFingerprint,
    write,
    audit,
    adjudicate,
    repair,
    auditTour,
  };
}

function routeFor(stops: NarrativeAdmittedStopV8[]): NarrativeRouteBriefV6 {
  return {
    schemaVersion: 'narrative-route-brief-v6',
    caseId: 'malaga-v8-test',
    city: 'Málaga',
    country: 'ES',
    language: 'es',
    theme: 'history',
    durationMinutes: 60,
    fingerprint: 'r'.repeat(64),
    stops: stops.map((stop, index) => ({
      stopId: stop.routeStopId,
      position: index,
      name: `Parada ${index + 1}`,
      narrativeRole: index === 0 ? 'apertura' : 'contraste',
      wikidataId: stop.entityQid,
      wikidataUrl: `https://www.wikidata.org/wiki/${stop.entityQid}`,
      wikipediaUrl: null,
      coordinates: { lat: 36.72 + index / 100, lng: -4.42 },
      previousStopId: index > 0 ? stops[index - 1].routeStopId : null,
      nextStopId: index + 1 < stops.length ? stops[index + 1].routeStopId : null,
    })),
  };
}

describe('NarrativeEditorialWorkflowV8', () => {
  test('runs complete and partial C stops by routeStopId without changing legacy sufficiency', async () => {
    const complete = admit(evidenceFixture('malaga-stop-03', 'Q3849447', COMPLETE_ROLES));
    const partial = admit(evidenceFixture('malaga-stop-04', 'Q3849448', PARTIAL_ROLES));
    expect(complete.evidence.evidenceTier).toBe('C');
    expect(partial.evidence.evidenceTier).toBe('C');
    expect(partial.evidence.gates.writerReady).toBe(false);
    const admittedStops = [complete, partial];
    const route = routeFor(admittedStops);
    const manifest = manifestFor(route, admittedStops);
    const agents = fakeAgents(manifest.fingerprint);

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-workflow-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops,
      arcBundle: {
        manifest,
        arc: {
          promise: 'Comprender la transformación histórica de Málaga.',
          centralQuestion: '¿Cómo cambió la ciudad?',
          stops: admittedStops.map((stop, index) => ({
            stopId: stop.routeStopId,
            contribution: `Contribución ${index + 1}`,
            bridge: index + 1 < admittedStops.length ? 'Continuamos.' : 'Cierre del recorrido.',
          })),
        },
      },
      voiceProfile: ['Anfitrión local cálido', 'Precisión sin tono de ficha'],
      privateArtifactPath: '/tmp/narrative-v8-workflow-test.private.json',
    }, agents);

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');
    expect(result.evidenceManifest).toBe(manifest);
    expect(result.editorial.stops).toHaveLength(2);
    expect(agents.write.mock.calls.map((call) => call[0].stopId))
      .toEqual(['malaga-stop-03', 'malaga-stop-04']);
    expect(complete.dossier.stopId).toBe('Q3849447');
    expect(partial.dossier.stopId).toBe('Q3849448');
    expect(complete.dossier.sufficiency.isSufficient).toBe(false);
    expect(partial.dossier.sufficiency.isSufficient).toBe(false);
  });

  test('returns protocol_failed before all agents when the manifest identity is corrupt', async () => {
    const stop = admit(evidenceFixture('malaga-stop-03', 'Q3849447', COMPLETE_ROLES));
    const route = routeFor([stop]);
    const manifest = manifestFor(route, [stop]);
    const agents = fakeAgents('wrong-manifest-fingerprint');

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-workflow-corrupt',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa.',
          centralQuestion: 'Pregunta.',
          stops: [{ stopId: stop.routeStopId, contribution: 'Aporte.', bridge: '' }],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-workflow-corrupt.private.json',
    }, agents);

    expect(result).toMatchObject({
      status: 'protocol_failed',
      reason: 'editorial agents/evidence manifest fingerprint mismatch',
    });
    expect(agents.write).not.toHaveBeenCalled();
    expect(agents.audit).not.toHaveBeenCalled();
    expect(agents.adjudicate).not.toHaveBeenCalled();
    expect(agents.repair).not.toHaveBeenCalled();
    expect(agents.auditTour).not.toHaveBeenCalled();
  });

  test('runs mixed A+B+complete-C+partial-C route through boundary, arc, and editorial workflow', async () => {
    const fixtureA = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-mixed-stop-01',
      entityQid: 'Q1000001',
      includedRoles: [...COMPLETE_ROLES],
      sources: [
        { sourceId: 'source-a-1', publisherKey: 'publisher-a-1.example', authorityTier: 'primary_authority' },
        { sourceId: 'source-a-2', publisherKey: 'publisher-a-2.example', authorityTier: 'primary_authority' },
      ],
    });
    const fixtureB = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-mixed-stop-02',
      entityQid: 'Q1000002',
      includedRoles: [...COMPLETE_ROLES],
      sources: [
        { sourceId: 'source-b-1', publisherKey: 'publisher-b-1.example', authorityTier: 'primary_authority' },
      ],
    });
    const fixtureCComplete = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-mixed-stop-03',
      entityQid: 'Q1000003',
      includedRoles: [...COMPLETE_ROLES],
      sources: [
        { sourceId: 'source-c-1', publisherKey: 'publisher-c-1.example', authorityTier: 'established_source' },
      ],
    });
    const fixtureCPartial = buildNarrativeEvidenceFixtureV8({
      routeStopId: 'malaga-mixed-stop-04',
      entityQid: 'Q1000004',
      includedRoles: [...PARTIAL_ROLES],
      sources: [
        { sourceId: 'source-cp-1', publisherKey: 'publisher-cp-1.example', authorityTier: 'established_source' },
      ],
    });

    const fixtures = [fixtureA, fixtureB, fixtureCComplete, fixtureCPartial];
    const routeStopIds = fixtures.map((f) => f.routeStopId);

    const route: NarrativeRouteBriefV6 = {
      schemaVersion: 'narrative-route-brief-v6',
      caseId: 'malaga-mixed-v8-test',
      city: 'Málaga',
      country: 'ES',
      language: 'es',
      theme: 'history',
      durationMinutes: 60,
      fingerprint: 'mixed-v8-route-fingerprint',
      stops: fixtures.map((fixture, index) => ({
        stopId: fixture.routeStopId,
        position: index,
        name: `Parada ${index + 1}`,
        narrativeRole: index === 0 ? 'apertura' : 'contraste',
        wikidataId: fixture.entityQid,
        wikidataUrl: `https://www.wikidata.org/wiki/${fixture.entityQid}`,
        wikipediaUrl: null,
        coordinates: { lat: 36.72 + index / 100, lng: -4.42 },
        previousStopId: index > 0 ? fixtures[index - 1].routeStopId : null,
        nextStopId: index + 1 < fixtures.length ? fixtures[index + 1].routeStopId : null,
      })),
    };

    const handoffs: NarrativeResearchHandoffStopV8[] = fixtures.map((fixture) => {
      if (fixture.tier === 'D') throw new Error('fixture must be admitted');
      return {
        routeStopId: fixture.routeStopId,
        entityQid: fixture.entityQid,
        result: {
          status: 'sufficient',
          stopId: fixture.entityQid,
          gates: fixture.gates,
          dossier: fixture.dossier,
          evidenceTier: fixture.tier,
          routeEligible: true,
          stats: {
            searchQueries: 0,
            mappedUrlCount: 0,
            attemptedUrlCount: 0,
            capturedSourceCount: fixture.captures.length,
            publisherCount: new Set(fixture.captures.map((c) => c.publisherKey)).size,
            curationCount: fixture.captures.length,
          },
          captures: fixture.captures,
          captureLog: [],
        },
      };
    });

    const boundary = buildNarrativeEvidenceBoundaryV8(route, handoffs);
    expect(boundary.status).toBe('ready');
    if (boundary.status !== 'ready') throw new Error(`boundary was ${boundary.status}`);

    const admittedStops = boundary.admittedStops;
    expect(admittedStops.map((s) => s.evidence.evidenceTier)).toEqual(['A', 'B', 'C', 'C']);

    const requester = requestEditorialStructuredV6 as jest.Mock;
    requester.mockReset();
    requester.mockResolvedValue({
      status: 'valid',
      value: {
        promise: 'Comprender la transformación mixta de Málaga.',
        centralQuestion: '¿Cómo se entrelazan estos lugares?',
        stops: routeStopIds.map((stopId, index) => ({
          stopId,
          contribution: `Contribución ${index + 1}`,
          bridge: index + 1 < routeStopIds.length ? 'Continuamos.' : 'Cierre del recorrido.',
        })),
      },
    });

    const arcResult = await createNarrativeArcArchitectV8({}).build({
      route,
      admittedStops,
      manifest: boundary.manifest,
    });

    expect(requester).toHaveBeenCalledTimes(1);
    expect(arcResult.manifest.fingerprint).toBe(boundary.manifest.fingerprint);
    expect(arcResult.arc.stops.map((s) => s.stopId)).toEqual(routeStopIds);

    const agents = fakeAgents(boundary.manifest.fingerprint);

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-mixed-pipeline-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops,
      arcBundle: {
        manifest: arcResult.manifest,
        arc: arcResult.arc,
      },
      voiceProfile: ['Anfitrión local cálido', 'Precisión sin tono de ficha'],
      privateArtifactPath: '/tmp/narrative-v8-mixed-pipeline-test.private.json',
    }, agents);

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');
    expect(result.evidenceManifest).toBe(arcResult.manifest);
    expect(result.editorial.stops).toHaveLength(4);
    expect(agents.write.mock.calls.map((call) => call[0].stopId)).toEqual(routeStopIds);

    expect(fixtureA.dossier.sufficiency.isSufficient).toBe(true);
    expect(fixtureB.dossier.sufficiency.isSufficient).toBe(false);
    expect(fixtureCComplete.dossier.sufficiency.isSufficient).toBe(false);
    expect(fixtureCPartial.dossier.sufficiency.isSufficient).toBe(false);

    expect(admittedStops[2].evidence.gates.writerReady).toBe(true);
    expect(admittedStops[3].evidence.gates.writerReady).toBe(false);
  });
});
