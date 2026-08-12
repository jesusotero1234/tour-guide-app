import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeEditorialAgentsV6 } from './NarrativeEditorialAgentsV6';
import {
  buildNarrativeReviewPackageV6,
  runNarrativeEditorialWorkflowV6,
} from './NarrativeEditorialWorkflowV6';

function diagnostic<T>(callId: string, value: T): EditorialCallResultV6<T> {
  return {
    callId, status: 'valid', value, attempts: [{
      attempt: 1, status: 'valid', latencyMs: 5, rawOutput: 'private raw secret', error: null,
    }],
    model: 'fake', promptFingerprint: 'p', responseFingerprint: 'r',
    inputCharacters: 1, schemaCharacters: 1, input: { private: true },
    rawOutput: 'private raw secret',
  };
}

const route: NarrativeRouteBriefV6 = {
  schemaVersion: 'narrative-route-brief-v6', caseId: 'toledo', city: 'Toledo', country: 'ES',
  language: 'es', theme: 'history', durationMinutes: 120, fingerprint: 'r'.repeat(64),
  stops: [{
    stopId: 'alcazar', position: 0, name: 'Alcázar de Toledo', narrativeRole: 'conflicto',
    wikidataId: 'Q1', wikidataUrl: 'https://www.wikidata.org/wiki/Q1', wikipediaUrl: null,
    coordinates: { lat: 39.8, lng: -4.0 }, previousStopId: null, nextStopId: null,
  }],
};

function dossier(sufficient = true): NarrativeDossierV6 {
  return {
    stopId: 'alcazar', language: 'es',
    sources: [{
      sourceId: 'official', finalUrl: 'https://toledo.es/alcazar', title: 'Ayuntamiento',
      capturedAt: '2026-08-11T12:00:00.000Z', fingerprint: 's'.repeat(64),
      authority: { tier: 'primary_authority', publisherKey: 'toledo.es', rule: 'official_registry' },
    }],
    passages: [{ passageId: 'quote', sourceId: 'official', quote: 'Cuatro torres.' }],
    propositions: [{
      propositionId: 'P1', text: 'Tiene cuatro torres.', role: 'visible_observation',
      certainty: 'high', interpretation: 'direct', sourceIds: ['official'], passageIds: ['quote'],
    }],
    authorizedNames: ['Alcázar de Toledo'], authorizedNumbers: [], discrepancies: [], limits: [],
    sufficiency: {
      isSufficient: sufficient,
      missingRoles: sufficient ? [] : ['distinctive_trait'],
      authoritySourceCount: 2, independentPublisherCount: 2,
    },
    fingerprint: 'd'.repeat(64),
  };
}

function agents(persistentIssue = false): NarrativeEditorialAgentsV6 & { write: jest.Mock } {
  let auditCalls = 0;
  return {
    write: jest.fn(async () => {
      const value = { text: 'Mira las torres del Alcázar. Toda su historia fue pacífica.' };
      return { value, diagnostic: diagnostic('write', value) };
    }),
    audit: jest.fn(async (input, auditor) => {
      auditCalls += 1;
      const afterRepair = auditCalls > 2;
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: sentence.index === 1 && auditor === 'deepseek'
            && (!afterRepair || persistentIssue) ? 'unsupported' as const : 'supported' as const,
          reason: sentence.index === 1 ? 'Comprobar afirmación.' : 'Respaldada.',
          propositionIds: sentence.index === 0 ? ['P1'] : [],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditCalls}`, value) };
    }),
    adjudicate: jest.fn(async (input) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId, decision: 'accepted' as const, reason: 'Debe corregirse.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    }),
    repair: jest.fn(async () => {
      const value = { replacements: [{
        sentenceId: 'alcazar-S002', text: 'El edificio atravesó etapas de conflicto.',
      }] };
      return { value, diagnostic: diagnostic('repair', value) };
    }),
    auditTour: jest.fn(async () => {
      const value = {
        issues: [], progressionWorks: true, promiseDelivered: true, closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    }),
  };
}

describe('narrative v6 editorial workflow', () => {
  const base = {
    runId: 'run-1', createdAt: '2026-08-11T12:00:00.000Z', route,
    dossiers: [dossier()],
    arc: {
      promise: 'Comprender las transformaciones de Toledo', centralQuestion: '¿Cómo cambió?',
      stops: [{ stopId: 'alcazar', contribution: 'Muestra el conflicto', bridge: 'Siguiente' }],
    },
    voiceProfile: ['Anfitrión local cálido', 'Precisión sin tono de ficha'],
    privateArtifactPath: '/private/run-1.json',
  };

  it('repairs one local window, reaudits with both models and reaches the human gate', async () => {
    const result = await runNarrativeEditorialWorkflowV6(base, agents());

    expect(result.run).toMatchObject({
      status: 'ready_for_human_gate',
      stopReviews: [{ stopId: 'alcazar', decision: 'pending' }],
    });
    expect(result.stops[0].repairRoundUsed).toBe(true);
    expect(result.stops[0].finalScript.text).toContain('etapas de conflicto');
    expect(result.stops[0].audits).toHaveLength(4);
  });

  it('stops before writing when any dossier is insufficient', async () => {
    const fake = agents();
    const result = await runNarrativeEditorialWorkflowV6({
      ...base, dossiers: [dossier(false)],
    }, fake);

    expect(result.run.status).toBe('evidence_review_required');
    expect(fake.write).not.toHaveBeenCalled();
  });

  it('requires draft review when a hard issue remains after the single repair round', async () => {
    const result = await runNarrativeEditorialWorkflowV6(base, agents(true));
    expect(result.run).toMatchObject({ status: 'draft_review_required' });
  });

  it('does not reopen an identical objection already rejected by the editor', async () => {
    const fake = agents();
    const originalAudit = fake.audit;
    fake.audit = jest.fn(async (input, auditor) => {
      const result = await originalAudit(input, auditor);
      if (auditor === 'gemma') {
        result.value.findings[0] = {
          ...result.value.findings[0],
          classification: 'distorted',
          reason: 'Objeción repetida que el editor debe valorar.',
        };
      }
      return result;
    });
    fake.adjudicate = jest.fn(async (input) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: objection.auditor === 'gemma' ? 'rejected' as const : 'accepted' as const,
        reason: objection.auditor === 'gemma'
          ? 'La objeción interpreta mal la proposición.'
          : 'La afirmación debe repararse.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run.status).toBe('ready_for_human_gate');
  });

  it('authorizes route and arc names used only to connect neighboring stops', async () => {
    const fake = agents();
    fake.write.mockImplementation(async () => {
      const value = { text: 'Llegamos a Casa de Campo. Toda su historia fue pacífica.' };
      return { value, diagnostic: diagnostic('write', value) };
    });
    const result = await runNarrativeEditorialWorkflowV6({
      ...base,
      route: {
        ...route,
        stops: [{ ...route.stops[0], name: 'Casa de Campo' }],
      },
      dossiers: [{ ...dossier(), authorizedNames: [] }],
    }, fake);

    expect(result.warnings).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'unauthorized_name' }),
    ]));
  });

  it('builds a public review package without raw LLM output or full private inputs', async () => {
    const result = await runNarrativeEditorialWorkflowV6(base, agents());
    const review = buildNarrativeReviewPackageV6(result, [dossier()]);
    const serialized = JSON.stringify(review);

    expect(review.metrics.callCount).toBe(8);
    expect(serialized).not.toContain('private raw secret');
    expect(serialized).not.toContain('"private":true');
    expect(review.sources[0].passages[0].quote).toBe('Cuatro torres.');
  });
});
