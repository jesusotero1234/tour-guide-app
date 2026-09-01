import {
  NarrativeRouteBriefV6,
  narrativeFingerprintV6,
} from './NarrativeContractsV6';
import { buildNarrativeDossierV6, NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeCapturedSourceV6 } from './NarrativeSourcesV6';
import { NARRATIVE_ROLES_V8 } from './NarrativeDossierV8';
import {
  NarrativeResearchStopResultV8,
} from './NarrativeResearchV8';
import { NarrativeScriptV6 } from './NarrativeEditorialV6';
import { runNarrativeUserCanaryV8 } from './NarrativeUserCanaryV8';
import {
  buildNarrativeEvidenceFixtureV8,
  NarrativeEvidenceFixtureInputV8,
  NarrativeEvidenceFixtureResultV8,
} from './NarrativeEvidenceFixturesV8.test-support';
import { NarrativeEvidenceTierV8, NarrativeRoleV8 } from './NarrativeDossierV8';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';

const STOPS = Array.from({ length: 8 }, (_, index) => ({
  qid: `Q1${String(index + 1).padStart(3, '0')}`,
  name: `Parada ${index + 1}`,
  lat: 36.72 + index * 0.001,
  lng: -4.41 + index * 0.001,
}));

function routeWith(stops: typeof STOPS): NarrativeRouteBriefV6 {
  const routeStops = stops.map((stop, position) => ({
    stopId: `route-${stop.qid}`,
    position,
    name: stop.name,
    narrativeRole: `aportar al recorrido: ${stop.name}`,
    wikidataId: stop.qid,
    wikidataUrl: `https://www.wikidata.org/wiki/${stop.qid}`,
    wikipediaUrl: null,
    coordinates: { lat: stop.lat, lng: stop.lng },
    previousStopId: position > 0 ? `route-${stops[position - 1].qid}` : null,
    nextStopId: position + 1 < stops.length ? `route-${stops[position + 1].qid}` : null,
  }));
  const brief = {
    schemaVersion: 'narrative-route-brief-v6' as const,
    caseId: 'test-city-history-es-120',
    city: 'Test City',
    country: 'España',
    language: 'es',
    theme: 'history',
    durationMinutes: 120,
    stops: routeStops,
  };
  return { ...brief, fingerprint: narrativeFingerprintV6(brief) };
}

function capture(sourceId: string, content: string, publisherKey: string): NarrativeCapturedSourceV6 {
  return {
    sourceId,
    requestedUrl: `https://${publisherKey}.example/${sourceId}`,
    finalUrl: `https://${publisherKey}.example/${sourceId}`,
    title: sourceId,
    capturedAt: '2026-08-01T10:00:00Z',
    content,
    fingerprint: `f-${sourceId}`,
    authority: { tier: 'primary_authority', publisherKey, rule: 'official_registry' },
    containsInstructionLikeText: false,
  };
}

function buildFixtureForCase(
  caseId: 'A' | 'B' | 'C_complete' | 'C_partial' | 'D',
  routeStopId: string,
  entityQid: string
): NarrativeEvidenceFixtureResultV8 {
  const allRoles: NarrativeRoleV8[] = [
    'visible_observation',
    'chronology_or_transformation',
    'human_agency_or_lived_function',
    'tension_or_contrast',
    'distinctive_trait',
  ];

  let includedRoles: NarrativeRoleV8[];
  let sources: NarrativeEvidenceFixtureInputV8['sources'];

  if (caseId === 'A') {
    includedRoles = allRoles;
    sources = [
      { sourceId: 'src-a-1', publisherKey: 'pub-a-1', authorityTier: 'primary_authority' },
      { sourceId: 'src-a-2', publisherKey: 'pub-a-2', authorityTier: 'primary_authority' },
    ];
  } else if (caseId === 'B') {
    includedRoles = allRoles;
    sources = [
      { sourceId: 'src-b-1', publisherKey: 'pub-b-1', authorityTier: 'primary_authority' },
    ];
  } else if (caseId === 'C_complete') {
    includedRoles = allRoles;
    sources = [
      { sourceId: 'src-c-1', publisherKey: 'pub-c-1', authorityTier: 'established_source' },
    ];
  } else if (caseId === 'C_partial') {
    includedRoles = allRoles.filter((role) => role !== 'tension_or_contrast');
    sources = [
      { sourceId: 'src-cp-1', publisherKey: 'pub-cp-1', authorityTier: 'established_source' },
    ];
  } else {
    includedRoles = allRoles.filter((role) => role !== 'visible_observation');
    sources = [
      { sourceId: 'src-d-1', publisherKey: 'pub-d-1', authorityTier: 'established_source' },
    ];
  }

  const fixture = buildNarrativeEvidenceFixtureV8({
    routeStopId,
    entityQid,
    includedRoles,
    sources,
  });

  const expectedTier: NarrativeEvidenceTierV8 =
    caseId === 'A' ? 'A' :
    caseId === 'B' ? 'B' :
    caseId === 'C_complete' ? 'C' :
    caseId === 'C_partial' ? 'C' :
    'D';

  if (fixture.tier !== expectedTier) {
    throw new Error(`Fixture tier mismatch for ${caseId}: expected ${expectedTier}, got ${fixture.tier}`);
  }

  return fixture;
}

function researchResultFor(
  caseId: 'A' | 'B' | 'C_complete' | 'C_partial' | 'D',
  routeStopId: string,
  entityQid: string
): NarrativeResearchStopResultV8 {
  const fixture = buildFixtureForCase(caseId, routeStopId, entityQid);
  const capturedSourceCount = fixture.captures.length;
  const publisherCount = new Set(fixture.captures.map((capture) => capture.authority.publisherKey)).size;
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
    capturedSourceCount,
    publisherCount,
    curationCount: 1,
  };
  if (fixture.tier === 'D') {
    return {
      status: 'evidence_review_required',
      stopId: entityQid,
      gates: fixture.gates,
      dossier: null,
      evidenceTier: 'D',
      routeEligible: false,
      captures: fixture.captures,
      captureLog: [],
      stats,
      reasons: ['evidence tier D: minimum evidence not ready'],
    };
  }
  return {
    status: 'sufficient',
    stopId: entityQid,
    gates: fixture.gates,
    dossier: fixture.dossier,
    evidenceTier: fixture.tier,
    routeEligible: true,
    captures: fixture.captures,
    captureLog: [],
    stats,
  };
}

function dossierFor(qid: string, name: string): NarrativeDossierV6 {
  const a = capture('a', [
    `Se observa ${name}.`,
    `Construido en el siglo XIX.`,
    `Fue sede del poder local.`,
    `Contrasta con el puerto.`,
    `Su rasgo único es la fachada.`,
  ].join('\n\n'), 'a.example');
  const b = capture('b', `Fue sede del poder local.`, 'b.example');
  const passages = [];
  const propositions = NARRATIVE_ROLES_V8.map((role, index) => ({
    propositionId: `prop-${qid}-${role}`,
    text: `Proposición de ${role} para ${name}.`,
    role,
    certainty: 'high' as const,
    interpretation: 'direct' as const,
    sourceIds: [role === 'human_agency_or_lived_function' ? 'b' : 'a'],
    passageIds: [`p-${qid}-${role}`],
  }));
  for (const role of NARRATIVE_ROLES_V8) {
    passages.push({
      passageId: `p-${qid}-${role}`,
      sourceId: role === 'human_agency_or_lived_function' ? 'b' : 'a',
      quote: role === 'visible_observation' ? `Se observa ${name}.`
        : role === 'chronology_or_transformation' ? 'Construido en el siglo XIX.'
          : role === 'human_agency_or_lived_function' ? 'Fue sede del poder local.'
            : role === 'tension_or_contrast' ? 'Contrasta con el puerto.'
              : 'Su rasgo único es la fachada.',
    });
  }
  const proposal = {
    stopId: qid,
    language: 'es',
    sources: ['a', 'b'],
    passages,
    propositions,
    authorizedNames: [],
    authorizedNumbers: [],
    discrepancies: [],
    limits: [],
  };
  return buildNarrativeDossierV6(proposal, [a, b]);
}

describe('runNarrativeUserCanaryV8', () => {
  it('produces one script per stop, writes tour markdown, and never runs writers before all dossiers', async () => {
    const route = routeWith(STOPS);
    let editorialCalls = 0;
    let admittedStopsSeen: NarrativeAdmittedStopV8[] = [];
    let manifestSeen: NarrativeEvidenceManifestV8 | null = null;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-test',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[0].qid], disagreement: false },
      researchStop: async ({ stopId }) => {
        const routeStop = route.stops.find((stop) => stop.wikidataId === stopId)!;
        return researchResultFor('A', routeStop.stopId, stopId);
      },
      runEditorial: async ({ admittedStops, evidenceManifest, request }) => {
        editorialCalls += 1;
        admittedStopsSeen = admittedStops;
        manifestSeen = evidenceManifest;
        expect(admittedStops.length).toBe(STOPS.length);
        const expectedOrder = route.stops.map((stop) => stop.stopId);
        expect(admittedStops.map((stop) => stop.routeStopId)).toEqual(expectedOrder);
        for (const stop of admittedStops) {
          expect(stop.routeStopId).not.toBe(stop.entityQid);
        }
        const scripts: NarrativeScriptV6[] = admittedStops.map((stop) => {
          const name = route.stops.find((r) => r.stopId === stop.routeStopId)?.name ?? stop.routeStopId;
          const script = {
            stopId: stop.routeStopId,
            text: `Texto del guion de ${name}.`,
            sentences: [{
              sentenceId: `${stop.routeStopId}-s1`,
              stopId: stop.routeStopId,
              index: 0,
              text: `Texto del guion de ${name}.`,
            }],
            fingerprint: '',
          };
          return { ...script, fingerprint: narrativeFingerprintV6(script) };
        });
        return {
          scripts,
          markdown: [
            `# Tour de ${request.city}`,
            ...scripts.map((script) => `## ${script.stopId}\n\n${script.text}`),
            'La siguiente parada es Test City. Llega por el medio que prefieras y reanuda el recorrido allí.',
          ].join('\n\n'),
          workflowStatus: 'ready_for_human_gate',
          scorecardDecision: 'Approve',
        };
      },
    });

    expect(result.status).toBe('approved');
    if (result.status !== 'approved') return;
    expect(editorialCalls).toBe(1);
    expect(result.editorial.scriptStopIds).toHaveLength(STOPS.length);
    expect(new Set(result.editorial.scriptStopIds).size).toBe(STOPS.length);
    expect(result.markdown).toContain('# Tour de Test City');
    expect(result.markdown.match(/La siguiente parada es Test City\./gu)?.length).toBe(1);
    expect(admittedStopsSeen.length).toBe(STOPS.length);
    expect(admittedStopsSeen.map((stop) => stop.routeStopId)).toEqual(route.stops.map((stop) => stop.stopId));
    for (const stop of admittedStopsSeen) {
      expect(stop.routeStopId).not.toBe(stop.entityQid);
    }
    expect(manifestSeen).toBe(result.evidenceManifest);
  });

  it('blocks before writers when a required stop is tier D / route-ineligible', async () => {
    const route = routeWith(STOPS.slice(0, 2));
    let editorialCalls = 0;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-test-blocked',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[0].qid], disagreement: false },
      researchStop: async ({ stopId }) => {
        const routeStop = route.stops.find((stop) => stop.wikidataId === stopId)!;
        if (stopId === STOPS[0].qid) {
          return researchResultFor('D', routeStop.stopId, stopId);
        }
        return researchResultFor('A', routeStop.stopId, stopId);
      },
      runEditorial: async () => {
        editorialCalls += 1;
        throw new Error('writers must not run');
      },
    });

    expect(result.status).toBe('blocked');
    expect(editorialCalls).toBe(0);
    if (result.status === 'blocked') {
      expect(result.failure.code).toBe('evidence_review_required');
    }
  });

  it('never researches more than two stops at the same time', async () => {
    const route = routeWith(STOPS);
    let current = 0;
    let maxConcurrent = 0;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-concurrency',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[0].qid], disagreement: false },
      researchStop: async ({ stopId }) => {
        current += 1;
        maxConcurrent = Math.max(maxConcurrent, current);
        await new Promise((resolve) => setTimeout(resolve, 5));
        const routeStop = route.stops.find((stop) => stop.wikidataId === stopId)!;
        const res = researchResultFor('A', routeStop.stopId, stopId);
        current -= 1;
        return res;
      },
      runEditorial: async ({ admittedStops, evidenceManifest }) => {
        const scripts: NarrativeScriptV6[] = admittedStops.map((stop) => {
          const script = {
            stopId: stop.routeStopId,
            text: 'Texto.',
            sentences: [{
              sentenceId: stop.routeStopId + '-s1',
              stopId: stop.routeStopId,
              index: 0,
              text: 'Texto.',
            }],
            fingerprint: '',
          };
          return { ...script, fingerprint: narrativeFingerprintV6(script) };
        });
        return {
          scripts,
          markdown: '# Tour',
          workflowStatus: 'ready_for_human_gate',
          scorecardDecision: 'Approve',
        };
      },
    });

    expect(result.status).toBe('approved');
    expect(maxConcurrent).toBeLessThanOrEqual(2);
    if (result.status !== 'approved') return;
    for (const dossier of result.dossiers) {
      expect(dossier.sufficiency.isSufficient).toBe(true);
    }
    expect(result.boundaryMigrationPassed).toBe(true);
    expect(result.evidenceManifest.fingerprint.length).toBeGreaterThan(0);
    expect(result.evidenceManifest.fingerprint).toHaveLength(64);
  });

  it('stops scheduling new research and never runs writers when a required stop fails', async () => {
    const route = routeWith(STOPS);
    let researchCalls = 0;
    let editorialCalls = 0;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-failfast',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[1].qid], disagreement: false },
      researchStop: async ({ stopId }) => {
        researchCalls += 1;
        const routeStop = route.stops.find((stop) => stop.wikidataId === stopId)!;
        if (stopId === STOPS[1].qid) {
          return researchResultFor('D', routeStop.stopId, stopId);
        }
        return researchResultFor('A', routeStop.stopId, stopId);
      },
      runEditorial: async () => {
        editorialCalls += 1;
        throw new Error('writers must not run');
      },
    });

    expect(result.status).toBe('blocked');
    expect(editorialCalls).toBe(0);
    expect(researchCalls).toBeLessThanOrEqual(3);
    expect(researchCalls).toBeLessThan(STOPS.length);
  });

  it('propagates research infrastructure failure as retryable and never runs Editorial', async () => {
    const route = routeWith(STOPS.slice(0, 1));
    let editorialCalls = 0;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-research-infrastructure-failure',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[0].qid], disagreement: false },
      researchStop: async ({ stopId }) => ({
        status: 'failed',
        stopId,
        failure: {
          code: 'research_infrastructure_unavailable',
          message: 'SearXNG stopped responding.',
        },
        evidenceTier: null,
        routeEligible: false,
        stats: {
          searchQueries: 1,
          searchQueryAttempts: 1,
          searchQuerySuccesses: 0,
          mapAttempts: 0,
          mapSuccesses: 0,
          webCaptureAttempts: 0,
          webCaptureResponses: 0,
          infrastructureFailureCount: 1,
          mappedUrlCount: 0,
          attemptedUrlCount: 0,
          capturedSourceCount: 0,
          publisherCount: 0,
          curationCount: 0,
        },
        captures: [],
        captureLog: [{
          stopId,
          phase: 'deterministic_search',
          requestedUrl: 'query',
          finalUrl: '',
          authorityBeforeCapture: 'search_error',
          authorityAfterCapture: 'search_error',
          publisherKey: null,
          outcome: 'provider_failed',
          httpStatus: null,
          errorClassification: 'ECONNREFUSED',
          attempt: 0,
          elapsedMs: 0,
        }],
      }),
      runEditorial: async () => {
        editorialCalls += 1;
        throw new Error('Editorial must not run');
      },
    });

    expect(result.status).toBe('failed');
    if (result.status !== 'failed') return;
    expect(result.failure).toMatchObject({
      code: 'research_infrastructure_unavailable',
      retryableLater: true,
    });
    expect(result.research[0]).toMatchObject({
      evidenceTier: null,
      routeEligible: false,
      infrastructureFailureCount: 1,
      providerFailureCount: 1,
    });
    expect(editorialCalls).toBe(0);
  });

  it('continues a partial tier C stop with writerReady false without fail-fast', async () => {
    const route = routeWith(STOPS.slice(0, 2));
    let editorialCalls = 0;
    let manifestSeen: NarrativeEvidenceManifestV8 | null = null;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-tier-c-partial',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[0].qid], disagreement: false },
      researchStop: async ({ stopId }) => {
        const routeStop = route.stops.find((stop) => stop.wikidataId === stopId)!;
        return researchResultFor('C_partial', routeStop.stopId, stopId);
      },
      runEditorial: async ({ admittedStops, evidenceManifest }) => {
        editorialCalls += 1;
        manifestSeen = evidenceManifest;
        const scripts: NarrativeScriptV6[] = admittedStops.map((stop) => {
          const script = {
            stopId: stop.routeStopId,
            text: 'Texto.',
            sentences: [{
              sentenceId: stop.routeStopId + '-s1',
              stopId: stop.routeStopId,
              index: 0,
              text: 'Texto.',
            }],
            fingerprint: '',
          };
          return { ...script, fingerprint: narrativeFingerprintV6(script) };
        });
        return {
          scripts,
          markdown: '# Tour',
          workflowStatus: 'ready_for_human_gate',
          scorecardDecision: 'Approve',
        };
      },
    });

    expect(result.status).toBe('approved');
    expect(editorialCalls).toBe(1);
    if (result.status !== 'approved') return;
    expect(result.boundaryMigrationPassed).toBe(true);
    expect(manifestSeen).toBe(result.evidenceManifest);
    expect(result.dossiers).toHaveLength(2);
    expect(result.research).toHaveLength(2);
    for (const entry of result.research) {
      expect(entry.minimumEvidenceReady).toBe(true);
      expect(entry.writerReady).toBe(false);
      expect(entry.evidenceTier).toBe('C');
      expect(entry.evidenceVariant).toBe('C_PARTIAL');
      expect(entry.routeEligible).toBe(true);
      expect(entry.missingRoles).toEqual(['tension_or_contrast']);
    }
    for (const dossier of result.dossiers) {
      expect(dossier.sufficiency.isSufficient).toBe(false);
    }
  });

  it('admits a complete tier C stop with writerReady true and successful Editorial handoff', async () => {
    const route = routeWith(STOPS.slice(0, 2));
    let editorialCalls = 0;
    let manifestSeen: NarrativeEvidenceManifestV8 | null = null;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-tier-c-complete',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[0].qid], disagreement: false },
      researchStop: async ({ stopId }) => {
        const routeStop = route.stops.find((stop) => stop.wikidataId === stopId)!;
        return researchResultFor('C_complete', routeStop.stopId, stopId);
      },
      runEditorial: async ({ admittedStops, evidenceManifest }) => {
        editorialCalls += 1;
        manifestSeen = evidenceManifest;
        const scripts: NarrativeScriptV6[] = admittedStops.map((stop) => {
          const script = {
            stopId: stop.routeStopId,
            text: 'Texto.',
            sentences: [{
              sentenceId: stop.routeStopId + '-s1',
              stopId: stop.routeStopId,
              index: 0,
              text: 'Texto.',
            }],
            fingerprint: '',
          };
          return { ...script, fingerprint: narrativeFingerprintV6(script) };
        });
        return {
          scripts,
          markdown: '# Tour',
          workflowStatus: 'ready_for_human_gate',
          scorecardDecision: 'Approve',
        };
      },
    });

    expect(result.status).toBe('approved');
    expect(editorialCalls).toBe(1);
    if (result.status !== 'approved') return;
    expect(result.boundaryMigrationPassed).toBe(true);
    expect(manifestSeen).toBe(result.evidenceManifest);
    expect(result.dossiers).toHaveLength(2);
    expect(result.research).toHaveLength(2);
    for (const entry of result.research) {
      expect(entry.minimumEvidenceReady).toBe(true);
      expect(entry.writerReady).toBe(true);
      expect(entry.evidenceTier).toBe('C');
      expect(entry.evidenceVariant).toBe('C_FULL');
      expect(entry.routeEligible).toBe(true);
      expect(entry.missingRoles).toEqual([]);
    }
    for (const dossier of result.dossiers) {
      expect(dossier.sufficiency.isSufficient).toBe(false);
    }
  });

  it('fails with protocol_failed when a real A result is corrupted to tier C', async () => {
    const route = routeWith(STOPS.slice(0, 2));
    let editorialCalls = 0;
    const result = await runNarrativeUserCanaryV8({
      runId: 'e2e-corrupted-metadata',
      request: {
        city: 'Test City',
        country: 'España',
        countryCode: 'ES',
        theme: 'history',
        language: 'es',
        durationMinutes: 120,
      },
      route,
      core: { requiredIds: [STOPS[0].qid], disagreement: false },
      researchStop: async ({ stopId }) => {
        const routeStop = route.stops.find((stop) => stop.wikidataId === stopId)!;
        const real = researchResultFor('A', routeStop.stopId, stopId);
        if (real.status !== 'sufficient') {
          throw new Error(`Expected sufficient status for A, got ${real.status}`);
        }
        return { ...real, evidenceTier: 'C' as const };
      },
      runEditorial: async () => {
        editorialCalls += 1;
        throw new Error('writers must not run');
      },
    });

    expect(result.status).toBe('failed');
    expect(editorialCalls).toBe(0);
    if (result.status === 'failed') {
      expect(result.failure.code).toBe('protocol_failed');
    }
  });
});
