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

const STOPS = Array.from({ length: 8 }, (_, index) => ({
  qid: `Q1${String(index + 1).padStart(3, '0')}`,
  name: `Parada ${index + 1}`,
  lat: 36.72 + index * 0.001,
  lng: -4.41 + index * 0.001,
}));

function routeWith(stops: typeof STOPS): NarrativeRouteBriefV6 {
  const routeStops = stops.map((stop, position) => ({
    stopId: stop.qid,
    position,
    name: stop.name,
    narrativeRole: `aportar al recorrido: ${stop.name}`,
    wikidataId: stop.qid,
    wikidataUrl: `https://www.wikidata.org/wiki/${stop.qid}`,
    wikipediaUrl: null,
    coordinates: { lat: stop.lat, lng: stop.lng },
    previousStopId: position > 0 ? stops[position - 1].qid : null,
    nextStopId: position + 1 < stops.length ? stops[position + 1].qid : null,
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
    const dossiers = STOPS.map((stop) => dossierFor(stop.qid, stop.name));
    let editorialCalls = 0;
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
        const dossier = dossiers.find((item) => item.stopId === stopId)!;
        return {
          status: 'sufficient',
          stopId,
          gates: {
            minimumEvidenceReady: true,
            writerReady: true,
            missingMinimumRoles: [],
            missingWriterRoles: [],
          },
          dossier,
          captures: [],
          captureLog: [],
          stats: {
            searchQueries: 4,
            mappedUrlCount: 0,
            attemptedUrlCount: 2,
            capturedSourceCount: 2,
            publisherCount: 2,
            curationCount: 1,
          },
        } as NarrativeResearchStopResultV8;
      },
      runEditorial: async ({ dossiers: inputDossiers, request }) => {
        editorialCalls += 1;
        expect(inputDossiers.length).toBe(STOPS.length);
        const scripts: NarrativeScriptV6[] = inputDossiers.map((dossier) => {
          const name = route.stops.find((stop) => stop.wikidataId === dossier.stopId)?.name ?? dossier.stopId;
          const script = {
            stopId: dossier.stopId,
            text: `Texto del guion de ${name}.`,
            sentences: [{
              sentenceId: `${dossier.stopId}-s1`,
              stopId: dossier.stopId,
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
  });

  it('blocks before writers when a required stop is not writerReady', async () => {
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
        if (stopId === STOPS[0].qid) {
          return {
            status: 'evidence_review_required',
            stopId,
            gates: {
              minimumEvidenceReady: false,
              writerReady: false,
              missingMinimumRoles: ['visible_observation'],
              missingWriterRoles: ['visible_observation'],
            },
            dossier: null,
            captures: [],
            captureLog: [],
            stats: {
              searchQueries: 4,
              mappedUrlCount: 0,
              attemptedUrlCount: 1,
              capturedSourceCount: 0,
              publisherCount: 0,
              curationCount: 0,
            },
            reasons: ['missing writer role visible_observation'],
          } as NarrativeResearchStopResultV8;
        }
        const dossier = dossierFor(stopId, 'Parada');
        return {
          status: 'sufficient',
          stopId,
          gates: {
            minimumEvidenceReady: true,
            writerReady: true,
            missingMinimumRoles: [],
            missingWriterRoles: [],
          },
          dossier,
          captures: [],
          captureLog: [],
          stats: {
            searchQueries: 4,
            mappedUrlCount: 0,
            attemptedUrlCount: 2,
            capturedSourceCount: 2,
            publisherCount: 2,
            curationCount: 1,
          },
        } as NarrativeResearchStopResultV8;
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
        const dossier = dossierFor(stopId, 'Parada');
        current -= 1;
        return {
          status: 'sufficient',
          stopId,
          gates: {
            minimumEvidenceReady: true,
            writerReady: true,
            missingMinimumRoles: [],
            missingWriterRoles: [],
          },
          dossier,
          captures: [],
          captureLog: [],
          stats: {
            searchQueries: 4,
            mappedUrlCount: 0,
            attemptedUrlCount: 2,
            capturedSourceCount: 2,
            publisherCount: 2,
            curationCount: 1,
          },
        } as NarrativeResearchStopResultV8;
      },
      runEditorial: async ({ dossiers: inputDossiers }) => {
        const scripts = inputDossiers.map((dossier) => {
          const script = {
            stopId: dossier.stopId,
            text: 'Texto.',
            sentences: [{
              sentenceId: dossier.stopId + '-s1',
              stopId: dossier.stopId,
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
      researchStop: async ({ stopId, required }) => {
        researchCalls += 1;
        if (required) {
          return {
            status: 'evidence_review_required',
            stopId,
            gates: {
              minimumEvidenceReady: false,
              writerReady: false,
              missingMinimumRoles: ['visible_observation'],
              missingWriterRoles: ['visible_observation'],
            },
            dossier: null,
            captures: [],
            captureLog: [],
            stats: {
              searchQueries: 4,
              mappedUrlCount: 0,
              attemptedUrlCount: 1,
              capturedSourceCount: 0,
              publisherCount: 0,
              curationCount: 0,
            },
            reasons: ['authority_insufficient'],
          } as NarrativeResearchStopResultV8;
        }
        const dossier = dossierFor(stopId, 'Parada');
        return {
          status: 'sufficient',
          stopId,
          gates: {
            minimumEvidenceReady: true,
            writerReady: true,
            missingMinimumRoles: [],
            missingWriterRoles: [],
          },
          dossier,
          captures: [],
          captureLog: [],
          stats: {
            searchQueries: 4,
            mappedUrlCount: 0,
            attemptedUrlCount: 2,
            capturedSourceCount: 2,
            publisherCount: 2,
            curationCount: 1,
          },
        } as NarrativeResearchStopResultV8;
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
});
