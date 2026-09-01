import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeEditorialAgentsV6 } from './NarrativeEditorialAgentsV6';
import { assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';
import {
  buildNarrativeReviewPackageV6,
  runNarrativeEditorialWorkflowV6,
} from './NarrativeEditorialWorkflowV6';
import { createNarrativeSchedulerV6 } from './NarrativeSchedulerV6';
import {
  NarrativeBenchmarkRunnerV6,
  NarrativeBenchmarkSpendBudgetV6,
  parseNarrativeBenchmarkArgsV6,
  runNarrativeBenchmarkV6,
} from './NarrativeBenchmarkV6';
import { createHash } from 'crypto';

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
    const fake = agents();
    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run).toMatchObject({
      status: 'ready_for_human_gate',
      stopReviews: [{ stopId: 'alcazar', decision: 'pending' }],
    });
    expect(result.stops[0].repairRoundUsed).toBe(true);
    expect(result.stops[0].finalScript.text).toContain('etapas de conflicto');
    expect(result.stops[0].audits).toHaveLength(4);
    const writerInput = fake.write.mock.calls[0][0];
    expect(writerInput).not.toHaveProperty('evidence');
    expect(writerInput).not.toHaveProperty('evidenceContext');
  });

  it('stops before writing when any dossier is insufficient', async () => {
    const fake = agents();
    const result = await runNarrativeEditorialWorkflowV6({
      ...base, dossiers: [dossier(false)],
    }, fake);

    expect(result.run.status).toBe('evidence_review_required');
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.audit).not.toHaveBeenCalled();
    expect(fake.adjudicate).not.toHaveBeenCalled();
    expect(fake.repair).not.toHaveBeenCalled();
    expect(fake.auditTour).not.toHaveBeenCalled();
  });

  it('resumes from supplied scripts without invoking writers or auditing excluded stops', async () => {
    const fake = agents();
    const supplied = assignNarrativeSentenceIdsV6(
      'alcazar', 'Mira las torres del Alcázar. El edificio atravesó etapas de conflicto.'
    );
    const result = await runNarrativeEditorialWorkflowV6(base, fake, {
      scripts: [supplied], auditStopIds: [], maximumAdditionalRepairs: 1,
    });

    expect(result.run).toMatchObject({ status: 'ready_for_human_gate' });
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.audit).not.toHaveBeenCalled();
    expect(result.stops[0].finalScript.text).toBe(supplied.text);
  });

  it('repairs an accepted global issue on an explicitly repairable resumed stop', async () => {
    const fake = agents();
    const supplied = assignNarrativeSentenceIdsV6(
      'alcazar', 'Mira las torres del Alcázar. El edificio atravesó etapas de conflicto.'
    );
    fake.audit = jest.fn(async (input, auditor) => {
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId, classification: 'supported' as const,
          reason: 'Respaldada.', propositionIds: ['P1'],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });
    fake.repair = jest.fn(async (input) => {
      const value = { replacements: [{
        sentenceId: input.objections[0].sentenceId,
        text: 'Observa cómo las torres ordenan la silueta del edificio.',
      }] };
      return { value, diagnostic: diagnostic('global-repair', value) };
    });
    let tourAudits = 0;
    fake.auditTour = jest.fn(async () => {
      tourAudits += 1;
      const value = {
        issues: tourAudits === 1 ? [{
          issueId: 'repetition', stopId: 'alcazar', sentenceId: 'alcazar-S001',
          severity: 'soft' as const, reason: 'Repite la observación anterior.',
        }] : [],
        progressionWorks: true, promiseDelivered: true, closingWorks: true,
      };
      return { value, diagnostic: diagnostic(`tour-audit-${tourAudits}`, value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake, {
      scripts: [supplied], auditStopIds: [], repairStopIds: ['alcazar'],
      maximumAdditionalRepairs: 1,
    });

    expect(result.run).toEqual(expect.objectContaining({ status: 'ready_for_human_gate' }));
    expect(fake.write).not.toHaveBeenCalled();
    expect(fake.audit).toHaveBeenCalledTimes(2);
    expect(fake.repair).toHaveBeenCalledWith(expect.objectContaining({ scope: 'tour' }), expect.any(Object));
    expect(fake.auditTour).toHaveBeenCalledTimes(2);
  });

  it('requires draft review when a hard issue remains after the single repair round', async () => {
    const fake = agents(true);
    const result = await runNarrativeEditorialWorkflowV6(base, fake);
    expect(result.run).toMatchObject({ status: 'draft_review_required' });
    expect(fake.adjudicate).toHaveBeenCalledTimes(2);
    expect(fake.adjudicate).toHaveBeenLastCalledWith(expect.objectContaining({
      scope: 'factual',
      objections: [expect.objectContaining({ sentenceId: 'alcazar-S002' })],
    }), expect.any(Object));
  });

  it('does not leave a reaudited objection open when the editor rejects it', async () => {
    const fake = agents();
    const originalAudit = fake.audit;
    fake.audit = jest.fn(async (input, auditor) => {
      const result = await originalAudit(input, auditor);
      if (auditor === 'deepseek_pro') {
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
        decision: objection.auditor === 'deepseek_pro' ? 'rejected' as const : 'accepted' as const,
        reason: objection.auditor === 'deepseek_pro'
          ? 'La objeción interpreta mal la proposición.'
          : 'La afirmación debe repararse.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run).toMatchObject({ status: 'ready_for_human_gate' });
    expect(fake.adjudicate).toHaveBeenCalledTimes(2);
  });

  it('adjudicates global issues locally and reruns factual and tour audits', async () => {
    const fake = agents();
    fake.audit = jest.fn(async (input, auditor) => {
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: 'supported' as const,
          reason: 'Respaldada.',
          propositionIds: ['P1'],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });
    fake.repair = jest.fn(async (input) => {
      const value = { replacements: [{
        sentenceId: input.objections[0].sentenceId,
        text: 'Mira las torres del Alcázar desde la plaza.',
      }] };
      return { value, diagnostic: diagnostic('global-repair', value) };
    });
    let tourAudits = 0;
    fake.auditTour = jest.fn(async () => {
      tourAudits += 1;
      const value = {
        issues: tourAudits === 1 ? [{
          issueId: 'alcazar-S001-global', stopId: 'alcazar', sentenceId: 'alcazar-S001',
          severity: 'soft' as const, reason: 'La transición sitúa mal el edificio.',
        }] : [],
        progressionWorks: true, promiseDelivered: true, closingWorks: true,
      };
      return { value, diagnostic: diagnostic(`tour-audit-${tourAudits}`, value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run.status).toBe('ready_for_human_gate');
    expect(result.stops[0].finalScript.sentences[0].text)
      .toBe('Mira las torres del Alcázar desde la plaza.');
    expect(fake.auditTour).toHaveBeenCalledTimes(2);
    expect(fake.audit).toHaveBeenCalledTimes(4);
    expect(fake.adjudicate).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'tour',
    }), expect.any(Object));
  });

  it('blocks on a new soft global issue that has not been adjudicated', async () => {
    const fake = agents();
    fake.audit = jest.fn(async (input, auditor) => {
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId, classification: 'supported' as const,
          reason: 'Respaldada.', propositionIds: ['P1'],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });
    fake.repair = jest.fn(async (input) => {
      const value = { replacements: [{
        sentenceId: input.objections[0].sentenceId,
        text: 'Mira las torres del Alcázar desde la plaza.',
      }] };
      return { value, diagnostic: diagnostic('global-repair', value) };
    });
    let tourAudits = 0;
    fake.auditTour = jest.fn(async () => {
      tourAudits += 1;
      const value = {
        issues: tourAudits === 1 ? [{
          issueId: 'premature-close', stopId: 'alcazar', sentenceId: 'alcazar-S001',
          severity: 'soft' as const, reason: 'Cierre prematuro.',
        }] : [{
          issueId: 'new-transition', stopId: 'alcazar', sentenceId: 'alcazar-S001',
          severity: 'soft' as const, reason: 'La transición nueva sigue sin funcionar.',
        }],
        progressionWorks: true, promiseDelivered: true, closingWorks: true,
      };
      return { value, diagnostic: diagnostic(`tour-audit-${tourAudits}`, value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run).toMatchObject({
      status: 'draft_review_required', openIssueIds: ['new-transition'],
    });
  });

  it('does not block on a global issue explicitly rejected with tour scope', async () => {
    const fake = agents();
    fake.audit = jest.fn(async (input, auditor) => {
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId, classification: 'supported' as const,
          reason: 'Respaldada.', propositionIds: ['P1'],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });
    fake.auditTour = jest.fn(async () => {
      const value = {
        issues: [{
          issueId: 'valid-transition', stopId: 'alcazar', sentenceId: 'alcazar-S001',
          severity: 'soft' as const, reason: 'La transición podría ser más explícita.',
        }],
        progressionWorks: true, promiseDelivered: true, closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });
    fake.adjudicate = jest.fn(async (input) => {
      const value = input.objections.map((objection) => ({
        objectionId: objection.objectionId, decision: 'rejected' as const,
        reason: 'La transición ya cumple su función narrativa.',
      }));
      return { value, diagnostic: diagnostic('adjudicate', value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run.status).toBe('ready_for_human_gate');
    expect(fake.adjudicate).toHaveBeenCalledWith(expect.objectContaining({
      scope: 'tour',
    }), expect.any(Object));
  });

  it('requires all three global audit booleans to pass', async () => {
    const fake = agents();
    fake.auditTour = jest.fn(async () => {
      const value = {
        issues: [], progressionWorks: false, promiseDelivered: true, closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run).toMatchObject({
      status: 'draft_review_required', openIssueIds: ['tour:progressionWorks'],
    });
  });

  it('rejects a global issue that references a stop outside the route', async () => {
    const fake = agents();
    fake.auditTour = jest.fn(async () => {
      const value = {
        issues: [{
          issueId: 'unknown-stop', stopId: 'not-on-route', sentenceId: 'not-on-route-S001',
          severity: 'hard' as const, reason: 'Referencia inválida.',
        }],
        progressionWorks: true, promiseDelivered: true, closingWorks: true,
      };
      return { value, diagnostic: diagnostic('tour-audit', value) };
    });

    const result = await runNarrativeEditorialWorkflowV6(base, fake);

    expect(result.run).toMatchObject({
      status: 'protocol_failed', reason: 'tour audit references unknown stop not-on-route',
    });
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

  it('applies the current serialized stop profile and preserves route order', async () => {
    let activeWriters = 0;
    let peakWriters = 0;
    const multiRoute = {
      ...route,
      stops: [0, 1, 2].map((position) => ({
        ...route.stops[0],
        stopId: `stop-${position}`,
        position,
        previousStopId: position === 0 ? null : `stop-${position - 1}`,
        nextStopId: position === 2 ? null : `stop-${position + 1}`,
      })),
    };
    const fake = agents() as ReturnType<typeof agents>;
    fake.write = jest.fn(async (input) => {
      activeWriters += 1;
      peakWriters = Math.max(peakWriters, activeWriters);
      await Promise.resolve();
      activeWriters -= 1;
      const value = { text: 'Mira el Alcázar de Toledo.' };
      return { value, diagnostic: diagnostic(`write-${input.stopId}`, value) };
    });
    fake.audit = jest.fn(async (input, auditor) => {
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: 'supported' as const,
          reason: 'Respaldada.',
          propositionIds: ['P1'],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${auditor}`, value) };
    });
    const result = await runNarrativeEditorialWorkflowV6({
      ...base,
      route: multiRoute,
      dossiers: multiRoute.stops.map((stop) => ({ ...dossier(), stopId: stop.stopId })),
      arc: {
        ...base.arc,
        stops: multiRoute.stops.map((stop) => ({
          stopId: stop.stopId, contribution: stop.stopId, bridge: 'Siguiente',
        })),
      },
    }, fake, { scheduler: createNarrativeSchedulerV6('balanced_openrouter') });

    expect(result.run.status).toBe('ready_for_human_gate');
    expect(peakWriters).toBe(1);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['stop-0', 'stop-1', 'stop-2']);
  });

  it('applies explicit scheduler overrides without changing profile defaults', () => {
    const baseline = createNarrativeSchedulerV6('balanced_openrouter');
    const parallel = createNarrativeSchedulerV6('balanced_openrouter', {
      editorialStops: 2,
      auditStops: 2,
    });

    expect(baseline.limits).toMatchObject({ editorialStops: 1, auditStops: 1 });
    expect(parallel.limits).toMatchObject({
      editorialStops: 2, auditStops: 2, writers: 1, globalAudits: 1,
    });
    expect(() => createNarrativeSchedulerV6('balanced_openrouter', {
      auditStops: 0,
    })).toThrow('auditStops must be a positive integer');
  });

  it('audits two stops concurrently but assigns the single repair in route order', async () => {
    const multiRoute = {
      ...route,
      stops: [0, 1].map((position) => ({
        ...route.stops[0],
        stopId: `stop-${position}`,
        position,
        previousStopId: position === 0 ? null : 'stop-0',
        nextStopId: position === 0 ? 'stop-1' : null,
      })),
    };
    const scripts = multiRoute.stops.map((stop) => assignNarrativeSentenceIdsV6(
      stop.stopId, 'Mira las torres. Esta afirmación requiere reparación.'
    ));
    const fake = agents();
    let activeAuditors = 0;
    let peakAuditors = 0;
    let initialAuditors = 0;
    let releaseInitialAudits: (() => void) | undefined;
    const initialAuditBarrier = new Promise<void>((resolve) => { releaseInitialAudits = resolve; });
    fake.audit = jest.fn(async (input, auditor) => {
      const repaired = input.script.text.includes('afirmación corregida');
      if (!repaired) {
        activeAuditors += 1;
        peakAuditors = Math.max(peakAuditors, activeAuditors);
        initialAuditors += 1;
        if (initialAuditors === 4) releaseInitialAudits?.();
        await initialAuditBarrier;
        await new Promise((resolve) => setTimeout(resolve, 20));
        activeAuditors -= 1;
      }
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: sentence.index === 1 && auditor === 'deepseek' && !repaired
            ? 'unsupported' as const : 'supported' as const,
          reason: sentence.index === 1 ? 'Debe corregirse.' : 'Respaldada.',
          propositionIds: sentence.index === 0 ? ['P1'] : [],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${input.script.stopId}-${auditor}`, value) };
    });
    const repairedStopIds: string[] = [];
    fake.repair = jest.fn(async (input) => {
      repairedStopIds.push(input.script.stopId);
      const value = { replacements: [{
        sentenceId: `${input.script.stopId}-S002`, text: 'Esta es la afirmación corregida.',
      }] };
      return { value, diagnostic: diagnostic(`repair-${input.script.stopId}`, value) };
    });

    const result = await runNarrativeEditorialWorkflowV6({
      ...base,
      route: multiRoute,
      dossiers: multiRoute.stops.map((stop) => ({ ...dossier(), stopId: stop.stopId })),
      arc: {
        ...base.arc,
        stops: multiRoute.stops.map((stop) => ({
          stopId: stop.stopId, contribution: stop.stopId, bridge: 'Siguiente',
        })),
      },
    }, fake, {
      scripts,
      auditStopIds: multiRoute.stops.map((stop) => stop.stopId),
      maximumAdditionalRepairs: 1,
      scheduler: createNarrativeSchedulerV6('balanced_openrouter', {
        editorialStops: 2, auditStops: 2,
      }),
    });

    expect(peakAuditors).toBe(4);
    expect(repairedStopIds).toEqual(['stop-0']);
    expect(result.stops.map((stop) => stop.stopId)).toEqual(['stop-0', 'stop-1']);
    expect(result.run).toMatchObject({
      status: 'draft_review_required',
      openIssueIds: ['deepseek:stop-1-S002:unsupported'],
    });
    expect(result.performance).toMatchObject({
      configuredEditorialStops: 2,
      configuredAuditStops: 2,
      peakEditorialStops: 2,
      peakAuditStops: 2,
      peakAuditorCalls: 4,
    });
    expect(result.performance?.reviewSpeedup).toBeGreaterThanOrEqual(1.5);
  });

  it('gives the repair to the next eligible route stop', async () => {
    const multiRoute = {
      ...route,
      stops: [0, 1].map((position) => ({
        ...route.stops[0], stopId: `stop-${position}`, position,
        previousStopId: position === 0 ? null : 'stop-0',
        nextStopId: position === 0 ? 'stop-1' : null,
      })),
    };
    const fake = agents();
    fake.audit = jest.fn(async (input, auditor) => {
      const needsRepair = input.script.stopId === 'stop-1'
        && !input.script.text.includes('corregida');
      const value = {
        auditor,
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: needsRepair && auditor === 'deepseek'
            ? 'unsupported' as const : 'supported' as const,
          reason: needsRepair ? 'Debe corregirse.' : 'Respaldada.',
          propositionIds: [],
        })),
      };
      return { value, diagnostic: diagnostic(`audit-${input.script.stopId}-${auditor}`, value) };
    });
    const repairedStopIds: string[] = [];
    fake.repair = jest.fn(async (input) => {
      repairedStopIds.push(input.script.stopId);
      const value = { replacements: [{
        sentenceId: `${input.script.stopId}-S001`, text: 'Esta frase está corregida.',
      }] };
      return { value, diagnostic: diagnostic(`repair-${input.script.stopId}`, value) };
    });

    const result = await runNarrativeEditorialWorkflowV6({
      ...base,
      route: multiRoute,
      dossiers: multiRoute.stops.map((stop) => ({ ...dossier(), stopId: stop.stopId })),
      arc: {
        ...base.arc,
        stops: multiRoute.stops.map((stop) => ({
          stopId: stop.stopId, contribution: stop.stopId, bridge: 'Siguiente',
        })),
      },
    }, fake, {
      scripts: multiRoute.stops.map((stop) => assignNarrativeSentenceIdsV6(
        stop.stopId, 'Esta frase requiere revisión.'
      )),
      auditStopIds: multiRoute.stops.map((stop) => stop.stopId),
      maximumAdditionalRepairs: 1,
      scheduler: createNarrativeSchedulerV6('balanced_openrouter', {
        editorialStops: 2, auditStops: 2,
      }),
    });

    expect(result.run.status).toBe('ready_for_human_gate');
    expect(repairedStopIds).toEqual(['stop-1']);
  });

  it('cancels a sibling auditor and waits for both before releasing the audit semaphore', async () => {
    const fake = agents();
    const onProgress = jest.fn();
    const signals: AbortSignal[] = [];
    let siblingSettled = false;
    fake.audit = jest.fn(async (_input, auditor, execution) => {
      signals.push(execution?.signal as AbortSignal);
      if (auditor === 'deepseek') throw new Error('auditor A failed');
      await new Promise<void>((resolve) => {
        execution?.signal?.addEventListener('abort', () => {
          siblingSettled = true;
          resolve();
        }, { once: true });
      });
      throw new Error('auditor B cancelled');
    });
    const scheduler = createNarrativeSchedulerV6('deepseek_control');
    let releasedAfterSiblingSettled = false;
    const wrappedScheduler = {
      ...scheduler,
      auditStop: async <T>(task: () => Promise<T>): Promise<T> => {
        try {
          return await scheduler.auditStop(task);
        } finally {
          releasedAfterSiblingSettled = siblingSettled;
        }
      },
    };

    const result = await runNarrativeEditorialWorkflowV6(base, fake, {
      scheduler: wrappedScheduler,
      onProgress,
    });

    expect(result.run).toMatchObject({ status: 'protocol_failed' });
    expect(signals).toHaveLength(2);
    expect(signals[0]).toBe(signals[1]);
    expect(signals[0].aborted).toBe(true);
    expect(releasedAfterSiblingSettled).toBe(true);
    expect(fake.write).toHaveBeenCalledWith(expect.any(Object), expect.objectContaining({
      onProgress,
    }));
  });

  it('cancels other active stops and skips the global audit after a parallel failure', async () => {
    const multiRoute = {
      ...route,
      stops: [0, 1].map((position) => ({
        ...route.stops[0], stopId: `stop-${position}`, position,
        previousStopId: position === 0 ? null : 'stop-0',
        nextStopId: position === 0 ? 'stop-1' : null,
      })),
    };
    const fake = agents();
    let startedAuditors = 0;
    let settledAuditors = 0;
    let releaseAuditors: (() => void) | undefined;
    const auditorBarrier = new Promise<void>((resolve) => { releaseAuditors = resolve; });
    fake.audit = jest.fn(async (input, auditor, execution) => {
      startedAuditors += 1;
      if (startedAuditors === 4) releaseAuditors?.();
      await auditorBarrier;
      try {
        if (input.script.stopId === 'stop-0' && auditor === 'deepseek') {
          throw new Error('primary parallel audit failed');
        }
        await new Promise<void>((_resolve, reject) => {
          const signal = execution?.signal as AbortSignal;
          if (signal.aborted) reject(signal.reason);
          else signal.addEventListener('abort', () => reject(signal.reason), { once: true });
        });
        throw new Error('unreachable');
      } finally {
        settledAuditors += 1;
      }
    });

    const result = await runNarrativeEditorialWorkflowV6({
      ...base,
      route: multiRoute,
      dossiers: multiRoute.stops.map((stop) => ({ ...dossier(), stopId: stop.stopId })),
      arc: {
        ...base.arc,
        stops: multiRoute.stops.map((stop) => ({
          stopId: stop.stopId, contribution: stop.stopId, bridge: 'Siguiente',
        })),
      },
    }, fake, {
      scripts: multiRoute.stops.map((stop) => assignNarrativeSentenceIdsV6(
        stop.stopId, 'Mira las torres.'
      )),
      auditStopIds: multiRoute.stops.map((stop) => stop.stopId),
      maximumAdditionalRepairs: 1,
      scheduler: createNarrativeSchedulerV6('balanced_openrouter', {
        editorialStops: 2, auditStops: 2,
      }),
    });

    expect(result.run).toMatchObject({ status: 'protocol_failed' });
    expect(startedAuditors).toBe(4);
    expect(settledAuditors).toBe(4);
    expect(fake.auditTour).not.toHaveBeenCalled();
  });

  it('fails the benchmark closed on budget, configuration and routing protocol violations', async () => {
    const fp = (value: string) => createHash('sha256').update(value).digest('hex');
    expect(parseNarrativeBenchmarkArgsV6([])).toEqual({
      profiles: ['deepseek_control', 'balanced_openrouter'],
      repetitions: 3,
      maxSpendUsd: 2,
      fixture: 'madrid',
    });
    expect(() => parseNarrativeBenchmarkArgsV6(['--max-spned-usd=1']))
      .toThrow('unknown narrative benchmark argument');
    const budget = new NarrativeBenchmarkSpendBudgetV6(0.1);
    budget.reserve(0.08);
    expect(() => budget.reserve(0.03)).toThrow('spend cap exhausted before call');

    const fingerprints = {
      fixture: fp('fixture-v1'), input: fp('input-v1'), snapshot: fp('snapshot-v1'),
    };
    const phases = [
      'planner', 'curator', 'architect', 'writer',
      'auditor_a', 'auditor_b', 'global_auditor',
    ];
    const costPolicy = Object.fromEntries([
      'smoke-model',
      ...['deepseek_control', 'balanced_openrouter'].flatMap((profile) => (
        phases.map((phase) => `${profile}-${phase}`)
      )),
    ].map((modelKey) => [
      modelKey,
      { inputUsdPerToken: 0.00001, outputUsdPerToken: 0.00001 },
    ]));
    const runner: NarrativeBenchmarkRunnerV6 = {
      preflight: async () => ({
        status: 'ready', fingerprint: fp('preflight-v1'),
        fixtureFingerprint: fingerprints.fixture,
        inputFingerprint: fingerprints.input,
        snapshotFingerprint: fingerprints.snapshot,
        frozenGateFingerprints: {
          deepseek_control: fp('deepseek-gate-a'),
          balanced_openrouter: fp('openrouter-gate-a'),
        },
        requiredSmokeModelKeys: ['smoke-model'],
        costPolicy,
      }),
      runPaidSmokes: async (_input, execute) => {
        await execute({
          id: 'smoke', profile: 'deepseek_control', phase: 'smoke',
          comparisonKey: 'smoke-model', modelKey: 'smoke-model',
          requestFingerprint: fp('smoke-request'), schemaFingerprint: fp('smoke-schema'),
          configurationFingerprint: fp('smoke-config'),
          maximumInputTokens: 10, maximumOutputTokens: 10, temperature: 0,
          invoke: async () => ({
            actualCostUsd: 0.0001, protocolValid: true, fallbackUsed: false,
            attempts: [{
              durationMs: 1, schemaValid: true, costUsd: 0.0001, reason: 'initial',
            }],
            fullResponse: { ok: true },
          }),
        });
      },
      runTour: async ({ profile, repetition }, execute) => {
        for (const phase of phases) {
          await execute({
            id: `${phase}-${repetition}`, profile, phase,
            comparisonKey: phase, modelKey: `${profile}-${phase}`,
            requestFingerprint: fp(`${profile}-${phase}-${repetition}-request`),
            schemaFingerprint: fp(`${phase}-schema`),
            configurationFingerprint: fp(`${profile}-${phase}-config`),
            maximumInputTokens: 10, maximumOutputTokens: 10, temperature: 0,
            invoke: async () => ({
              actualCostUsd: 0.0001,
              protocolValid: true,
              fallbackUsed: profile === 'balanced_openrouter' && repetition === 1
                && phase === 'writer',
              attempts: [{
                durationMs: 2, schemaValid: true, costUsd: 0.0001, reason: 'initial',
              }],
              fullResponse: { profile, phase },
            }),
          });
        }
        return {
          quality: {
            detectedMutations: 8, totalMutations: 8, hardFactualWarnings: 0,
            dossierComparable: true, disputedInterpretationsWithSingleSource: 0,
          },
          fingerprints,
          reusedFrozenGate: true,
          gateFingerprint: profile === 'deepseek_control'
            ? fp('deepseek-gate-a') : fp('openrouter-gate-a'),
        };
      },
    };

    const report = await runNarrativeBenchmarkV6(
      parseNarrativeBenchmarkArgsV6(['--max-spend-usd=1']), runner
    );

    expect(report.status).toBe('model_calibration_failed');
    expect(report.reasons).toEqual(expect.arrayContaining([
      expect.stringContaining('provider fallback'),
    ]));
    expect(report.budget.spentUsd).toBeLessThanOrEqual(1);
    expect(report.budget.reservedUsd).toBe(0);
  });
});
