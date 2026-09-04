import { EditorialCallResultV6, requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import {
  NarrativeAdjudicationInputV6,
  NarrativeAuditInputV6,
  NarrativeRepairInputV6,
  NarrativeWriterInputV6,
} from './NarrativeEditorialAgentsV6';
import { NarrativeAuditorV6, assignNarrativeSentenceIdsV6, narrativeSentenceFingerprintV6 } from './NarrativeEditorialV6';
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
import { NarrativeScriptV6 } from './NarrativeEditorialV6';
import { createNarrativeSchedulerV6 } from './NarrativeSchedulerV6';

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
  narrationLengthOutcome: jest.Mock;
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
  const narrationLengthOutcome = jest.fn(() => null);
  return {
    evidenceManifestFingerprint: manifestFingerprint,
    write,
    audit,
    adjudicate,
    repair,
    auditTour,
    narrationLengthOutcome,
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
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
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
          stops: [{
            stopId: stop.routeStopId,
            contribution: 'Aporte.',
            bridge: '',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          }],
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
            searchQueryAttempts: 0,
            searchQuerySuccesses: 0,
            mappedUrlCount: 0,
            mapAttempts: 0,
            mapSuccesses: 0,
            attemptedUrlCount: 0,
            webCaptureAttempts: 0,
            webCaptureResponses: 0,
            capturedSourceCount: fixture.captures.length,
            publisherCount: new Set(fixture.captures.map((c) => c.publisherKey)).size,
            curationCount: fixture.captures.length,
            infrastructureFailureCount: 0,
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

  test('allows partial script resume where one valid supplied script skips only that writer', async () => {
    const stop1 = admit(evidenceFixture('malaga-partial-01', 'Q5000001', COMPLETE_ROLES));
    const stop2 = admit(evidenceFixture('malaga-partial-02', 'Q5000002', COMPLETE_ROLES));
    const route = routeFor([stop1, stop2]);
    const manifest = manifestFor(route, [stop1, stop2]);
    const agents = fakeAgents(manifest.fingerprint);

    const suppliedScript: NarrativeScriptV6 = {
      stopId: stop1.routeStopId,
      text: 'Script supplied for stop 1.',
      fingerprint: 'supplied-stop-1-fingerprint',
      sentences: [{ sentenceId: 's1', stopId: stop1.routeStopId, index: 0, text: 'Script supplied for stop 1.' }],
    };

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-partial-resume-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop1, stop2],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa parcial.',
          centralQuestion: 'Pregunta parcial.',
          stops: [
            {
              stopId: stop1.routeStopId,
              contribution: 'Aporte 1',
              bridge: 'Puente',
              contributionPropositionIds: [stop1.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop1.dossier.propositions[0].propositionId],
            },
            {
              stopId: stop2.routeStopId,
              contribution: 'Aporte 2',
              bridge: 'Cierre',
              contributionPropositionIds: [stop2.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop2.dossier.propositions[0].propositionId],
            },
          ],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-partial-resume.private.json',
    }, agents, { scripts: [suppliedScript] });

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');
    expect(result.editorial.stops).toHaveLength(2);
    expect(result.editorial.stops[0].initialScript.text).toBe('Script supplied for stop 1.');
    expect(agents.write.mock.calls.map((call) => call[0].stopId)).toEqual([stop2.routeStopId]);
    expect(agents.audit).toHaveBeenCalled();
    expect(agents.auditTour).toHaveBeenCalled();
  });

  test('protocol-fails before any agent call when duplicate partial scripts are supplied', async () => {
    const stop1 = admit(evidenceFixture('malaga-dup-01', 'Q6000001', COMPLETE_ROLES));
    const stop2 = admit(evidenceFixture('malaga-dup-02', 'Q6000002', COMPLETE_ROLES));
    const route = routeFor([stop1, stop2]);
    const manifest = manifestFor(route, [stop1, stop2]);
    const agents = fakeAgents(manifest.fingerprint);

    const script1: NarrativeScriptV6 = {
      stopId: stop1.routeStopId,
      text: 'Script 1.',
      fingerprint: 'duplicate-stop-1-original-fingerprint',
      sentences: [{ sentenceId: 's1', stopId: stop1.routeStopId, index: 0, text: 'Script 1.' }],
    };
    const script1Dup: NarrativeScriptV6 = {
      stopId: stop1.routeStopId,
      text: 'Script 1 dup.',
      fingerprint: 'duplicate-stop-1-copy-fingerprint',
      sentences: [{ sentenceId: 's1', stopId: stop1.routeStopId, index: 0, text: 'Script 1 dup.' }],
    };

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-dup-partial-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop1, stop2],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa.',
          centralQuestion: 'Pregunta.',
          stops: [
            {
              stopId: stop1.routeStopId,
              contribution: 'Aporte 1',
              bridge: 'Puente',
              contributionPropositionIds: [stop1.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop1.dossier.propositions[0].propositionId],
            },
            {
              stopId: stop2.routeStopId,
              contribution: 'Aporte 2',
              bridge: 'Cierre',
              contributionPropositionIds: [stop2.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop2.dossier.propositions[0].propositionId],
            },
          ],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-dup-partial.private.json',
    }, agents, { scripts: [script1, script1Dup] });

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.editorial.run.status).toBe('protocol_failed');
    if (result.editorial.run.status !== 'protocol_failed') throw new Error('Expected inner protocol failure');
    expect(result.editorial.run.reason).toContain('duplicate supplied script stopId');
    expect(agents.write).not.toHaveBeenCalled();
    expect(agents.audit).not.toHaveBeenCalled();
    expect(agents.adjudicate).not.toHaveBeenCalled();
    expect(agents.repair).not.toHaveBeenCalled();
    expect(agents.auditTour).not.toHaveBeenCalled();
  });

  test('forces proposition-scoped deterministic auditing with policy v8 even when caller omits deterministicAuditPolicy', async () => {
    const stop = admit(evidenceFixture('malaga-audit-01', 'Q8000001', COMPLETE_ROLES));
    const route = routeFor([stop]);
    const manifest = manifestFor(route, [stop]);
    const agents = fakeAgents(manifest.fingerprint);

    const auditSpy = jest.spyOn(require('./NarrativeEditorialV6'), 'auditNarrativeScriptDeterministicallyV6');

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-audit-policy-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa de auditoría.',
          centralQuestion: 'Pregunta de auditoría.',
          stops: [{
            stopId: stop.routeStopId,
            contribution: 'Aporte.',
            bridge: 'Cierre.',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          }],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-audit-policy-test.private.json',
    }, agents, {});

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');

    expect(auditSpy).toHaveBeenCalled();
    const expectedPropositionTexts = stop.dossier.propositions.map((p) => p.text);
    for (const call of auditSpy.mock.calls) {
      const input = call[1] as { policy?: 'v8'; authorizedPropositionTexts?: string[] };
      expect(input.policy).toBe('v8');
      expect(input.authorizedPropositionTexts).toEqual(expectedPropositionTexts);
    }
    auditSpy.mockRestore();
  });

  test('protocol-fails before any agent call when unknown partial script is supplied', async () => {
    const stop1 = admit(evidenceFixture('malaga-unknown-01', 'Q7000001', COMPLETE_ROLES));
    const stop2 = admit(evidenceFixture('malaga-unknown-02', 'Q7000002', COMPLETE_ROLES));
    const route = routeFor([stop1, stop2]);
    const manifest = manifestFor(route, [stop1, stop2]);
    const agents = fakeAgents(manifest.fingerprint);

    const unknownScript: NarrativeScriptV6 = {
      stopId: 'malaga-unknown-99',
      text: 'Script unknown.',
      fingerprint: 'unknown-stop-fingerprint',
      sentences: [{ sentenceId: 's1', stopId: 'malaga-unknown-99', index: 0, text: 'Script unknown.' }],
    };

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-unknown-partial-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop1, stop2],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa.',
          centralQuestion: 'Pregunta.',
          stops: [
            {
              stopId: stop1.routeStopId,
              contribution: 'Aporte 1',
              bridge: 'Puente',
              contributionPropositionIds: [stop1.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop1.dossier.propositions[0].propositionId],
            },
            {
              stopId: stop2.routeStopId,
              contribution: 'Aporte 2',
              bridge: 'Cierre',
              contributionPropositionIds: [stop2.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop2.dossier.propositions[0].propositionId],
            },
          ],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-unknown-partial.private.json',
    }, agents, { scripts: [unknownScript] });

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.editorial.run.status).toBe('protocol_failed');
    if (result.editorial.run.status !== 'protocol_failed') throw new Error('Expected inner protocol failure');
    expect(result.editorial.run.reason).toContain('is not in the route');
    expect(agents.write).not.toHaveBeenCalled();
    expect(agents.audit).not.toHaveBeenCalled();
    expect(agents.adjudicate).not.toHaveBeenCalled();
    expect(agents.repair).not.toHaveBeenCalled();
    expect(agents.auditTour).not.toHaveBeenCalled();
  });

  test('combines deterministic, factual, and tour issues into at most one repair call per stop', async () => {
    const stop = admit(evidenceFixture('malaga-repair-01', 'Q9000001', COMPLETE_ROLES));
    const route = routeFor([stop]);
    const manifest = manifestFor(route, [stop]);

    const agents = fakeAgents(manifest.fingerprint);

    const originalText = 'Aquí llegó Napoleón en 1937 para observar el edificio.';
    const repairedText = stop.dossier.propositions[0].text;

    const suppliedScript = assignNarrativeSentenceIdsV6(stop.routeStopId, originalText);

    agents.audit.mockImplementation(async (input: NarrativeAuditInputV6, auditor: NarrativeAuditorV6) => {
      const propositionId = input.dossier.propositions[0]?.propositionId ?? '';
      const isOriginal = input.script.text === originalText;
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: isOriginal ? ('unsupported' as const) : ('supported' as const),
          reason: isOriginal ? 'Sin respaldo.' : 'Respaldada.',
          propositionIds: propositionId ? [propositionId] : [],
          sentenceFingerprint: narrativeSentenceFingerprintV6(sentence),
          claimSpan: isOriginal ? 'Napoleón' : '',
          passageIds: [stop.dossier.passages[0].passageId],
          conflictType: isOriginal ? ('unsupported_claim' as const) : ('none' as const),
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });

    agents.adjudicate.mockImplementation(async (input: NarrativeAdjudicationInputV6) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'accepted' as const,
        reason: 'Accepted for repair.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    agents.auditTour.mockImplementation(async (input: { scripts: NarrativeScriptV6[] }) => {
      const script = input.scripts[0];
      const isOriginal = script.text === originalText;
      const issueId = isOriginal ? 'I1' : 'I2';
      const value = {
        issues: [{
          issueId,
          stopId: stop.routeStopId,
          sentenceId: script.sentences[0].sentenceId,
          severity: 'soft' as const,
          reason: isOriginal ? 'Tour progression issue.' : 'Tour progression issue after repair.',
        }],
        progressionWorks: true,
        promiseDelivered: true,
        closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    agents.repair.mockImplementation(async () => {
      const value = {
        replacements: [{
          sentenceId: suppliedScript.sentences[0].sentenceId,
          text: repairedText,
        }],
      };
      return { value, diagnostic: diagnostic('repair', value) };
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-repair-combined-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa de reparación.',
          centralQuestion: 'Pregunta de reparación.',
          stops: [{
            stopId: stop.routeStopId,
            contribution: 'Aporte.',
            bridge: 'Cierre.',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          }],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-repair-combined.private.json',
    }, agents, { scripts: [suppliedScript], maximumRepairCalls: 1 });

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');

    expect(agents.repair).toHaveBeenCalledTimes(1);
    const repairInput = agents.repair.mock.calls[0][0] as {
      script: NarrativeScriptV6;
      objections: Array<{ objectionId: string; sentenceId: string }>;
    };
    expect(repairInput.script.stopId).toBe(stop.routeStopId);

    const objectionIds = repairInput.objections.map((objection) => objection.objectionId);
    expect(objectionIds.some((id) => id.startsWith('deterministic:'))).toBe(true);
    expect(objectionIds.some((id) => id.startsWith('deepseek:'))).toBe(true);
    expect(objectionIds.some((id) => id.startsWith('deepseek_pro:'))).toBe(true);
    expect(objectionIds).toContain('tour:I1');

    const sentenceIds = repairInput.objections.map((objection) => objection.sentenceId);
    expect(new Set(sentenceIds)).toEqual(new Set([suppliedScript.sentences[0].sentenceId]));

    expect(result.editorial.stops[0].finalScript.text).toBe(repairedText);
    expect(result.editorial.stops[0].repairRoundUsed).toBe(true);

    expect(agents.auditTour).toHaveBeenCalledTimes(2);
    const adjudicateCalls = agents.adjudicate.mock.calls;
    expect(adjudicateCalls.some((call) => {
      const input = call[0] as { objections: Array<{ objectionId: string }> };
      return input.objections.some((objection) => objection.objectionId === 'tour:I2');
    })).toBe(true);

    const issueState = result.editorial.issueStateV8;
    expect(issueState).toBeDefined();
    if (!issueState) throw new Error('expected V8 final issue state');
    expect(issueState.openIssueIds).toContain('tour:I2');
    expect(issueState.openIssueIds).not.toContain('tour:I1');
    for (const id of issueState.openIssueIds) {
      expect(id.startsWith('deterministic:')).toBe(false);
      expect(id.startsWith('deepseek:')).toBe(false);
      expect(id.startsWith('deepseek_pro:')).toBe(false);
    }
    expect(issueState.summary.acceptedTour).toBe(1);
  });

  test('uses remaining budget to repair an issue first discovered by the post-repair global audit', async () => {
    const stop = admit(evidenceFixture('malaga-final-repair-01', 'Q9300001', COMPLETE_ROLES));
    const route = routeFor([stop]);
    const manifest = manifestFor(route, [stop]);
    const agents = fakeAgents(manifest.fingerprint);
    const originalText = 'La cronología original necesita corrección.';
    const firstRepairedText = stop.dossier.propositions[0].text;
    const finalRepairedText = `${firstRepairedText} La cronología queda expresada con precisión.`;
    const suppliedScript = assignNarrativeSentenceIdsV6(stop.routeStopId, originalText);

    agents.audit.mockImplementation(async (input: NarrativeAuditInputV6, auditor: NarrativeAuditorV6) => {
      const isOriginal = input.script.text === originalText;
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: isOriginal ? ('unsupported' as const) : ('supported' as const),
          reason: isOriginal ? 'Sin respaldo.' : 'Respaldada.',
          propositionIds: isOriginal ? [] : [input.dossier.propositions[0].propositionId],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });

    agents.adjudicate.mockImplementation(async (input: NarrativeAdjudicationInputV6) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'accepted' as const,
        reason: 'Accepted for repair.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    agents.auditTour.mockImplementation(async (input: { scripts: NarrativeScriptV6[] }) => {
      const script = input.scripts[0];
      const issues = script.text === originalText
        ? [{
          issueId: 'I1',
          stopId: stop.routeStopId,
          sentenceId: script.sentences[0].sentenceId,
          severity: 'soft' as const,
          reason: 'Initial tour issue.',
        }]
        : script.text === firstRepairedText
          ? [{
            issueId: 'I2',
            stopId: stop.routeStopId,
            sentenceId: script.sentences[0].sentenceId,
            severity: 'soft' as const,
            reason: 'New issue found after the first repair.',
          }]
          : [];
      const value = {
        issues,
        progressionWorks: true,
        promiseDelivered: true,
        closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    agents.repair.mockImplementation(async (input: NarrativeRepairInputV6) => {
      const finalPass = input.objections.some((objection) => objection.objectionId === 'tour:I2');
      const value = {
        replacements: [{
          sentenceId: input.script.sentences[0].sentenceId,
          text: finalPass ? finalRepairedText : firstRepairedText,
        }],
      };
      return { value, diagnostic: diagnostic('repair', value) };
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-final-repair-test',
      createdAt: '2026-09-02T12:00:00.000Z',
      route,
      admittedStops: [stop],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa de reparación final.',
          centralQuestion: 'Pregunta de reparación final.',
          stops: [{
            stopId: stop.routeStopId,
            contribution: 'Aporte.',
            bridge: 'Cierre.',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          }],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-final-repair-test.private.json',
    }, agents, { scripts: [suppliedScript], maximumRepairCalls: 2 });

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(result.reason);
    expect(agents.repair).toHaveBeenCalledTimes(2);
    expect(agents.auditTour).toHaveBeenCalledTimes(3);
    expect(result.editorial.stops[0].finalScript.text).toBe(finalRepairedText);
    expect(result.editorial.issueStateV8?.openIssueIds).not.toContain('tour:I1');
    expect(result.editorial.issueStateV8?.openIssueIds).not.toContain('tour:I2');
  });

  test('generates and validates all planned repair patches before any repaired stop is re-audited', async () => {
    const stop1 = admit(evidenceFixture('malaga-red-01', 'Q9100001', COMPLETE_ROLES));
    const stop2 = admit(evidenceFixture('malaga-red-02', 'Q9100002', COMPLETE_ROLES));
    const route = routeFor([stop1, stop2]);
    const manifest = manifestFor(route, [stop1, stop2]);
    const agents = fakeAgents(manifest.fingerprint);

    const script1Text = 'Script one for stop one.';
    const script2Text = 'Script two for stop two.';
    const suppliedScripts: NarrativeScriptV6[] = [
      assignNarrativeSentenceIdsV6(stop1.routeStopId, script1Text),
      assignNarrativeSentenceIdsV6(stop2.routeStopId, script2Text),
    ];

    agents.audit.mockImplementation(async (input: NarrativeAuditInputV6, auditor: NarrativeAuditorV6) => {
      const propositionId = input.dossier.propositions[0]?.propositionId ?? '';
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: 'unsupported' as const,
          reason: 'Sin respaldo.',
          propositionIds: propositionId ? [propositionId] : [],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });

    agents.adjudicate.mockImplementation(async (input: NarrativeAdjudicationInputV6) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'accepted' as const,
        reason: 'Accepted for repair.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    agents.auditTour.mockImplementation(async (input: { scripts: NarrativeScriptV6[] }) => {
      const value = {
        issues: input.scripts.map((script, index) => ({
          issueId: `I${index + 1}`,
          stopId: script.stopId,
          sentenceId: script.sentences[0].sentenceId,
          severity: 'soft' as const,
          reason: 'Tour progression issue.',
        })),
        progressionWorks: true,
        promiseDelivered: true,
        closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    let repairCallCount = 0;
    agents.repair.mockImplementation(async () => {
      repairCallCount += 1;
      if (repairCallCount === 1) {
        const value = { replacements: [{ sentenceId: suppliedScripts[0].sentences[0].sentenceId, text: stop1.dossier.propositions[0].text }] };
        return { value, diagnostic: diagnostic('repair', value) };
      }
      throw new Error('invalid second patch');
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-red-repair-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop1, stop2],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa RED.',
          centralQuestion: 'Pregunta RED.',
          stops: [
            {
              stopId: stop1.routeStopId,
              contribution: 'Aporte 1',
              bridge: 'Puente',
              contributionPropositionIds: [stop1.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop1.dossier.propositions[0].propositionId],
            },
            {
              stopId: stop2.routeStopId,
              contribution: 'Aporte 2',
              bridge: 'Cierre',
              contributionPropositionIds: [stop2.dossier.propositions[0].propositionId],
              bridgePropositionIds: [stop2.dossier.propositions[0].propositionId],
            },
          ],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-red-repair-test.private.json',
    }, agents, { scripts: suppliedScripts, maximumRepairCalls: 2 });

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.editorial.run.status).toBe('protocol_failed');
    if (result.editorial.run.status !== 'protocol_failed') throw new Error('Expected inner protocol failure');
    expect(result.editorial.run.reason).toContain('invalid second patch');

    expect(agents.repair).toHaveBeenCalledTimes(2);
    expect(agents.audit).toHaveBeenCalledTimes(4);
    expect(agents.auditTour).toHaveBeenCalledTimes(1);
  });

  test('re-audits and adjudicates repaired stops in parallel while preserving route order', async () => {
    const stop1 = admit(evidenceFixture('malaga-parallel-01', 'Q9200001', COMPLETE_ROLES));
    const stop2 = admit(evidenceFixture('malaga-parallel-02', 'Q9200002', COMPLETE_ROLES));
    const stops = [stop1, stop2];
    const route = routeFor(stops);
    const manifest = manifestFor(route, stops);
    const agents = fakeAgents(manifest.fingerprint);
    const suppliedScripts = stops.map((stop) => assignNarrativeSentenceIdsV6(
      stop.routeStopId,
      stop.dossier.propositions[0].text
    ));

    let activeRepairAudits = 0;
    let peakRepairAudits = 0;
    agents.audit.mockImplementation(async (input: NarrativeAuditInputV6, auditor: NarrativeAuditorV6) => {
      const repaired = input.script.text.startsWith('Reparado ');
      if (repaired) {
        activeRepairAudits += 1;
        peakRepairAudits = Math.max(peakRepairAudits, activeRepairAudits);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeRepairAudits -= 1;
      }
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: repaired ? ('unsupported' as const) : ('supported' as const),
          reason: repaired ? 'Requiere revisión final.' : 'Respaldada.',
          propositionIds: repaired ? [] : [input.dossier.propositions[0].propositionId],
          sentenceFingerprint: narrativeSentenceFingerprintV6(sentence),
          claimSpan: repaired ? sentence.text : '',
          passageIds: [input.dossier.passages[0].passageId],
          conflictType: repaired ? ('unsupported_claim' as const) : ('none' as const),
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });

    let activeFinalAdjudications = 0;
    let peakFinalAdjudications = 0;
    agents.adjudicate.mockImplementation(async (input: NarrativeAdjudicationInputV6) => {
      if (input.scope === 'factual') {
        activeFinalAdjudications += 1;
        peakFinalAdjudications = Math.max(peakFinalAdjudications, activeFinalAdjudications);
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeFinalAdjudications -= 1;
      }
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'accepted' as const,
        reason: 'Accepted for repair.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    let tourAuditCalls = 0;
    agents.auditTour.mockImplementation(async (input: { scripts: NarrativeScriptV6[] }) => {
      tourAuditCalls += 1;
      const value = {
        issues: tourAuditCalls === 1
          ? input.scripts.map((script, index) => ({
            issueId: `parallel-I${index + 1}`,
            stopId: script.stopId,
            sentenceId: script.sentences[0].sentenceId,
            severity: 'soft' as const,
            reason: 'Tour progression issue.',
          }))
          : [],
        progressionWorks: true,
        promiseDelivered: true,
        closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    agents.repair.mockImplementation(async (input) => {
      const value = {
        replacements: [{
          sentenceId: input.script.sentences[0].sentenceId,
          text: `Reparado ${input.script.stopId}.`,
        }],
      };
      return { value, diagnostic: diagnostic('repair', value) };
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-parallel-repair-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: stops,
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa paralela.',
          centralQuestion: 'Pregunta paralela.',
          stops: stops.map((stop, index) => ({
            stopId: stop.routeStopId,
            contribution: `Aporte ${index + 1}`,
            bridge: index === stops.length - 1 ? 'Cierre' : 'Puente',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          })),
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-parallel-repair-test.private.json',
    }, agents, {
      scripts: suppliedScripts,
      maximumRepairCalls: 2,
      scheduler: createNarrativeSchedulerV6('balanced_openrouter', {
        editorialStops: 2,
        writers: 1,
        auditStops: 2,
        adjudications: 2,
        globalAudits: 1,
      }),
    });

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(result.reason);
    expect(peakRepairAudits).toBe(4);
    expect(peakFinalAdjudications).toBe(2);
    expect(result.editorial.stops.map((stop) => stop.stopId)).toEqual(
      stops.map((stop) => stop.routeStopId)
    );
    expect(result.editorial.stops.map((stop) => stop.finalScript.sentences.length)).toEqual([1, 1]);
  });

  test('repairs split era abbreviations without empty replacements or changing sentence cardinality', async () => {
    const stop = admit(evidenceFixture('malaga-era-repair-01', 'Q3849447', COMPLETE_ROLES));
    const route = routeFor([stop]);
    const manifest = manifestFor(route, [stop]);
    const agents = fakeAgents(manifest.fingerprint);
    const suppliedScript = assignNarrativeSentenceIdsV6(
      stop.routeStopId,
      'Introducción. Se construyó en los primeros años del siglo I d. C., aprovechando la pendiente. '
        + 'Durante aproximadamente dos siglos tuvo uso escénico, pero desde el siglo V d. C. el espacio cambió de función. '
        + 'Más tarde quedó oculto. Hoy es el principal vestigio. La visita continúa.'
    );
    expect(suppliedScript.sentences).toHaveLength(8);

    agents.adjudicate.mockImplementation(async (input: NarrativeAdjudicationInputV6) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'accepted' as const,
        reason: 'Accepted for repair.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    let tourAuditCalls = 0;
    agents.auditTour.mockImplementation(async () => {
      tourAuditCalls += 1;
      const value = {
        issues: tourAuditCalls === 1
          ? [
            { issueId: 'fragment-S002', stopId: stop.routeStopId, sentenceId: suppliedScript.sentences[1].sentenceId, severity: 'soft' as const, reason: 'Unir S002 y S003.' },
            { issueId: 'fragment-S004', stopId: stop.routeStopId, sentenceId: suppliedScript.sentences[3].sentenceId, severity: 'soft' as const, reason: 'Unir S004 y S005.' },
            { issueId: 'designation-S007', stopId: stop.routeStopId, sentenceId: suppliedScript.sentences[6].sentenceId, severity: 'soft' as const, reason: 'Aclarar la designación.' },
          ]
          : [],
        progressionWorks: true,
        promiseDelivered: true,
        closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    const replacements = [
      { sentenceId: suppliedScript.sentences[1].sentenceId, text: 'Se construyó en los primeros años del siglo I d. C.' },
      { sentenceId: suppliedScript.sentences[2].sentenceId, text: 'Para ello se aprovechó la pendiente del cerro.' },
      { sentenceId: suppliedScript.sentences[3].sentenceId, text: 'Durante aproximadamente dos siglos tuvo uso escénico.' },
      { sentenceId: suppliedScript.sentences[4].sentenceId, text: 'Desde el siglo V d. C., el espacio cambió de función.' },
      { sentenceId: suppliedScript.sentences[6].sentenceId, text: 'Hoy es el principal vestigio arqueológico visible de la ciudad.' },
    ];
    agents.repair.mockImplementation(async () => {
      const value = { replacements };
      return { value, diagnostic: diagnostic('repair', value) };
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-era-repair-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa histórica.',
          centralQuestion: 'Pregunta histórica.',
          stops: [{
            stopId: stop.routeStopId,
            contribution: 'Aporte.',
            bridge: 'Cierre.',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          }],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-era-repair-test.private.json',
    }, agents, { scripts: [suppliedScript], maximumRepairCalls: 1 });

    expect(result.status).toBe('complete');
    if (result.status !== 'complete') throw new Error(result.reason);
    expect(agents.repair).toHaveBeenCalledTimes(1);
    expect(replacements).toHaveLength(5);
    expect(replacements.every((replacement) => replacement.text.trim().length > 0)).toBe(true);
    expect(result.editorial.stops[0].finalScript.sentences).toHaveLength(
      suppliedScript.sentences.length
    );
    expect(result.editorial.stops[0].finalScript.sentences.map((sentence) => sentence.text))
      .toEqual(expect.arrayContaining(replacements.map((replacement) => replacement.text)));
  });

  test('preserves Spanish era abbreviations as complete sentences in newly written scripts', async () => {
    const stop = admit(evidenceFixture('malaga-era-01', 'Q9500001', COMPLETE_ROLES));
    const route = routeFor([stop]);
    const manifest = manifestFor(route, [stop]);
    const agents = fakeAgents(manifest.fingerprint);

    const eraText = 'Se levantó en el siglo II a. C. y cambió en el siglo V d. C. Después llegó el grupo.';
    agents.write.mockImplementation(async (input: NarrativeWriterInputV6) => {
      const value = { text: eraText };
      return { value, diagnostic: diagnostic(`write-${input.stopId}`, value) };
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-era-abbrev-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Comprender la era histórica.',
          centralQuestion: '¿Cómo cambió la ciudad?',
          stops: [{
            stopId: stop.routeStopId,
            contribution: 'Aporte de era.',
            bridge: 'Cierre del recorrido.',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          }],
        },
      },
      voiceProfile: ['Anfitrión local cálido', 'Precisión sin tono de ficha'],
      privateArtifactPath: '/tmp/narrative-v8-era-abbrev-test.private.json',
    }, agents);

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');
    expect(result.editorial.stops).toHaveLength(1);
    expect(result.editorial.stops[0].initialScript.sentences.map((s) => s.text)).toEqual([
      'Se levantó en el siglo II a. C. y cambió en el siglo V d. C.',
      'Después llegó el grupo.',
    ]);
  });

  test('repairs deterministic V8 mechanical style findings even when auditTour reports no issues', async () => {
    const stop1 = admit(evidenceFixture('malaga-mech-01', 'Q9600001', COMPLETE_ROLES));
    const stop2 = admit(evidenceFixture('malaga-mech-02', 'Q9600002', COMPLETE_ROLES));
    const stops = [stop1, stop2];
    const route = routeFor(stops);
    const manifest = manifestFor(route, stops);
    const agents = fakeAgents(manifest.fingerprint);

    const script1Text = 'La memoria del lugar conserva una huella singular.';
    const script2Text = 'La memoria del lugar conserva una huella singular.';
    const suppliedScripts: NarrativeScriptV6[] = [
      assignNarrativeSentenceIdsV6(stop1.routeStopId, script1Text),
      assignNarrativeSentenceIdsV6(stop2.routeStopId, script2Text),
    ];

    agents.audit.mockImplementation(async (input: NarrativeAuditInputV6, auditor: NarrativeAuditorV6) => {
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

    agents.adjudicate.mockImplementation(async (input: NarrativeAdjudicationInputV6) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'rejected' as const,
        reason: 'No requiere corrección.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    agents.auditTour.mockImplementation(async () => {
      const value = {
        issues: [],
        progressionWorks: true,
        promiseDelivered: true,
        closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    agents.repair.mockImplementation(async (_input: NarrativeRepairInputV6) => {
      const laterScript = suppliedScripts[1];
      const value = {
        replacements: [{
          sentenceId: laterScript.sentences[0].sentenceId,
          text: stop2.dossier.propositions[0].text,
        }],
      };
      return { value, diagnostic: diagnostic('repair', value) };
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-mech-style-regression-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: stops,
      arcBundle: {
        manifest,
        arc: {
          promise: 'Comprender la memoria del lugar.',
          centralQuestion: '¿Cómo se construyó la memoria?',
          stops: stops.map((stop, index) => ({
            stopId: stop.routeStopId,
            contribution: `Contribución ${index + 1}`,
            bridge: index + 1 < stops.length ? 'Continuamos.' : 'Cierre del recorrido.',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          })),
        },
      },
      voiceProfile: ['Anfitrión local cálido', 'Precisión sin tono de ficha'],
      privateArtifactPath: '/tmp/narrative-v8-mech-style-regression-test.private.json',
    }, agents, { scripts: suppliedScripts, maximumRepairCalls: 1 });

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');

    expect(agents.repair).toHaveBeenCalledTimes(1);
    const repairInput = agents.repair.mock.calls[0][0] as {
      script: NarrativeScriptV6;
      objections: Array<{ objectionId: string; sentenceId: string }>;
    };
    expect(repairInput.script.stopId).toBe(stop2.routeStopId);
    expect(repairInput.objections.some((objection) => objection.objectionId.startsWith('tour:mechanical-style:'))).toBe(true);

    expect(result.editorial.stops[1].finalScript.text).toBe(stop2.dossier.propositions[0].text);
    expect(result.editorial.stops[0].finalScript.text).toBe(script1Text);

    expect(agents.audit).toHaveBeenCalled();
    const auditCalls = agents.audit.mock.calls;
    expect(auditCalls.some((call) => {
      const input = call[0] as NarrativeAuditInputV6;
      return input.script.stopId === stop2.routeStopId && input.script.text === stop2.dossier.propositions[0].text;
    })).toBe(true);

    expect(result.editorial.issueStateV8).toBeDefined();
    if (!result.editorial.issueStateV8) throw new Error('expected V8 final issue state');
    expect(result.editorial.issueStateV8.openIssueIds).toEqual([]);
    expect(result.editorial.tourAudit?.issues).toEqual([]);
  });

  test('rejects a forged mechanical-style objection that is not produced by deterministic audit', async () => {
    const stop = admit(evidenceFixture('malaga-forged-01', 'Q9700001', COMPLETE_ROLES));
    const route = routeFor([stop]);
    const manifest = manifestFor(route, [stop]);
    const agents = fakeAgents(manifest.fingerprint);

    const scriptText = stop.dossier.propositions[0].text;
    const suppliedScript = assignNarrativeSentenceIdsV6(stop.routeStopId, scriptText);

    agents.audit.mockImplementation(async (input: NarrativeAuditInputV6, auditor: NarrativeAuditorV6) => {
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

    agents.adjudicate.mockImplementation(async (input: NarrativeAdjudicationInputV6) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'rejected' as const,
        reason: 'No requiere corrección.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    agents.auditTour.mockImplementation(async () => {
      const value = {
        issues: [{
          issueId: 'mechanical-style:forged-001',
          stopId: stop.routeStopId,
          sentenceId: suppliedScript.sentences[0].sentenceId,
          severity: 'soft' as const,
          reason: 'Forged mechanical-style issue not produced by deterministic audit.',
        }],
        progressionWorks: true,
        promiseDelivered: true,
        closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    const result = await runNarrativeEditorialWorkflowV8({
      runId: 'v8-forged-mech-style-test',
      createdAt: '2026-09-01T12:00:00.000Z',
      route,
      admittedStops: [stop],
      arcBundle: {
        manifest,
        arc: {
          promise: 'Promesa de estilo mecánico.',
          centralQuestion: 'Pregunta de estilo mecánico.',
          stops: [{
            stopId: stop.routeStopId,
            contribution: 'Aporte.',
            bridge: 'Cierre.',
            contributionPropositionIds: [stop.dossier.propositions[0].propositionId],
            bridgePropositionIds: [stop.dossier.propositions[0].propositionId],
          }],
        },
      },
      voiceProfile: ['Precisión'],
      privateArtifactPath: '/tmp/narrative-v8-forged-mech-style-test.private.json',
    }, agents, { scripts: [suppliedScript], maximumRepairCalls: 1 });

    if (result.status !== 'complete') throw new Error(result.reason);
    expect(result.status).toBe('complete');

    expect(agents.repair).not.toHaveBeenCalled();

    const adjudicateCalls = agents.adjudicate.mock.calls;
    expect(adjudicateCalls.some((call) => {
      const input = call[0] as NarrativeAdjudicationInputV6;
      return input.objections.some((objection) => objection.objectionId === 'tour:mechanical-style:forged-001');
    })).toBe(true);

    expect(result.editorial.issueStateV8).toBeDefined();
    if (!result.editorial.issueStateV8) throw new Error('expected V8 final issue state');
    expect(result.editorial.issueStateV8.openIssueIds).not.toContain('tour:mechanical-style:forged-001');
    expect(result.editorial.issueStateV8.openIssueIds).not.toContain('mechanical-style:forged-001');
  });
});
