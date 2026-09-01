import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  DEEPSEEK_NARRATIVE_AUDITOR_MODEL_V6,
  DEEPSEEK_NARRATIVE_MODEL_V6,
  GEMMA_NARRATIVE_AUDITOR_MODEL_V6,
  createNarrativeEditorialAgentsV6,
  reviewNarrativeTourScorecardV6,
} from './NarrativeEditorialAgentsV6';
import { assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';

type CapturedPostBody = Record<string, unknown>;

function projectPostBody(body: CapturedPostBody): {
  messages: Array<{ role: string; content: string }>;
  tools: Array<{ function: { name: string; parameters: Record<string, unknown> } }>;
  tool_choice: { type: string; function: { name: string } };
} {
  return {
    messages: body.messages as Array<{ role: string; content: string }>,
    tools: body.tools as Array<{ function: { name: string; parameters: Record<string, unknown> } }>,
    tool_choice: body.tool_choice as { type: string; function: { name: string } },
  };
}

const dossier = {
  stopId: 'palace', language: 'es', sources: [], passages: [], propositions: [{
    propositionId: 'prop-palace-1', text: 'La fachada puede observarse desde la ruta.',
    role: 'visible_observation', certainty: 'high', interpretation: 'direct',
    sourceIds: [], passageIds: [],
  }],
  authorizedNames: [], authorizedNumbers: [], discrepancies: [], limits: [],
  sufficiency: {
    isSufficient: true, missingRoles: [], authoritySourceCount: 2, independentPublisherCount: 2,
  },
  fingerprint: 'd'.repeat(64),
} as NarrativeDossierV6;

describe('narrative v6 editorial agents', () => {
  it('uses DeepSeek at 0.7 only for writing and keeps both auditors at 0', async () => {
    const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
    const post = jest.fn(async (url: string, body: Record<string, unknown>) => {
      calls.push({ url, body });
      const toolName = ((body.tool_choice as { function: { name: string } }).function.name);
      const args = toolName === 'write_narrative_stop_v6'
        ? {
          stop_id: 'palace',
          script: 'Mira la fachada. Aquí comienza la historia del edificio.',
        }
        : { findings: [
          { sentenceId: 'palace-S001', classification: 'supported', reason: 'P1', propositionIds: [] },
          { sentenceId: 'palace-S002', classification: 'supported', reason: 'P1', propositionIds: [] },
        ] };
      return { data: { choices: [{ message: { tool_calls: [{
        function: { name: toolName, arguments: JSON.stringify(args) },
      }] } }] } };
    });
    const agents = createNarrativeEditorialAgentsV6({ apiKey: 'test-key', post });
    const written = await agents.write({
      stopId: 'palace', dossier, arc: { promise: 'Entender el poder', contribution: 'Origen' },
      previousStop: null, nextStop: 'almudena', voiceProfile: ['Español oral'],
    });
    const script = assignNarrativeSentenceIdsV6('palace', written.value.text);
    await agents.audit({ script, dossier }, 'deepseek');
    await agents.audit({ script, dossier }, 'deepseek_pro');

    const writerBody = projectPostBody(calls[0].body);
    const auditBody = projectPostBody(calls[1].body);

    expect(calls.map((call) => call.body.temperature)).toEqual([0.7, 0, 0]);
    expect(written.value).toEqual({
      text: 'Mira la fachada. Aquí comienza la historia del edificio.',
    });
    expect(writerBody.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ function: expect.objectContaining({
        parameters: expect.objectContaining({ properties: expect.objectContaining({
          stop_id: { type: 'string', const: 'palace' },
        }) }),
      }) }),
    ]));
    const writerPrompt = writerBody.messages[0].content;
    expect(writerPrompt).toContain('no una ruta');
    expect(writerPrompt).toContain('Mantén separadas la fecha de diseño o construcción');
    expect(writerPrompt).toContain('cierra explícitamente el recorrido');
    const auditSchema = ((auditBody.tools[0].function.parameters.properties as {
      findings: Record<string, unknown>;
    }).findings);
    expect(auditSchema).toMatchObject({ minItems: 2, maxItems: 2 });
    expect(auditSchema.items).toMatchObject({ properties: {
      sentenceId: { enum: ['palace-S001', 'palace-S002'] },
      reason: { maxLength: 120 },
      propositionIds: {
        maxItems: 1,
        items: { enum: ['prop-palace-1'] },
      },
    } });
    expect((auditSchema.items as { properties: { propositionIds: object } })
      .properties.propositionIds).not.toHaveProperty('uniqueItems');
    expect(calls.slice(1).map((call) => call.body.max_tokens)).toEqual([2_000, 2_000]);
    expect(calls.map((call) => call.body.model)).toEqual([
      DEEPSEEK_NARRATIVE_MODEL_V6,
      DEEPSEEK_NARRATIVE_MODEL_V6,
      DEEPSEEK_NARRATIVE_AUDITOR_MODEL_V6,
    ]);
    const auditPrompt = auditBody.messages[0].content;
    expect(auditPrompt).toContain('sujeto, acción, objeto, causalidad');
    expect(auditPrompt).toContain('superlativos y adornos que parecen hechos');
    expect(auditPrompt).toContain('no necesitan respaldo explícito del dossier');
    expect(GEMMA_NARRATIVE_AUDITOR_MODEL_V6).toBe('gemma4:12b');
    expect(DEEPSEEK_NARRATIVE_AUDITOR_MODEL_V6).toBe('deepseek-v4-pro');

    // Freeze writer request contract
    expect(writerBody.tool_choice).toEqual({ type: 'function', function: { name: 'write_narrative_stop_v6' } });
    expect(writerBody.messages[0].role).toBe('system');
    expect(writerBody.messages[1].role).toBe('user');
    const writerUserContent = writerBody.messages[1].content;
    expect(writerUserContent).toContain('stopId');
    expect(writerUserContent).toContain('dossier');
    expect(writerUserContent).toContain('arc');
    expect(writerUserContent).toContain('voiceProfile');
    expect(writerBody.tools[0].function.name).toBe('write_narrative_stop_v6');

    // Freeze factual audit request contract
    expect(auditBody.tool_choice).toEqual({ type: 'function', function: { name: 'audit_narrative_sentences_v6' } });
    expect(auditBody.messages[0].role).toBe('system');
    expect(auditBody.messages[1].role).toBe('user');
    const auditUserContent = auditBody.messages[1].content;
    expect(auditUserContent).toContain('script');
    expect(auditUserContent).toContain('dossier');
    expect(auditBody.tools[0].function.name).toBe('audit_narrative_sentences_v6');
    expect(auditBody.tools[0].function.parameters.type).toBe('object');
    expect(auditBody.tools[0].function.parameters.required).toEqual(['findings']);
  });

  it('batches long Gemma audits and still returns one complete sentence ledger', async () => {
    const batchSizes: number[] = [];
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const userMessage = (body.messages as Array<{ role: string; content: string }>)[1].content;
      const input = JSON.parse(userMessage.split('\n').slice(1).join('\n')) as {
        script: ReturnType<typeof assignNarrativeSentenceIdsV6>;
      };
      batchSizes.push(input.script.sentences.length);
      return { data: { message: { content: JSON.stringify({
        findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: 'supported',
          reason: 'Respaldada por el dossier.',
          propositionIds: [],
        })),
      }) } } };
    });
    const agents = createNarrativeEditorialAgentsV6({ ollamaHost: 'http://ollama.test', post });
    const longScript = assignNarrativeSentenceIdsV6(
      'palace',
      Array.from({ length: 13 }, (_, index) => `Esta es la frase número ${index + 1}.`).join(' ')
    );

    const result = await agents.audit({ script: longScript, dossier }, 'gemma');

    expect(batchSizes).toEqual([6, 6, 1]);
    expect(result.value.findings).toHaveLength(13);
    expect(result.value.findings.map((finding) => finding.sentenceId))
      .toEqual(longScript.sentences.map((sentence) => sentence.sentenceId));
  });

  it('batches provider audits so the 2,000-token response contract remains bounded', async () => {
    const batchSizes: number[] = [];
    let activeBatches = 0;
    let peakBatches = 0;
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      activeBatches += 1;
      peakBatches = Math.max(peakBatches, activeBatches);
      await Promise.resolve();
      const userMessage = (body.messages as Array<{ role: string; content: string }>)[1].content;
      const input = JSON.parse(userMessage.split('\n').slice(1).join('\n')) as {
        script: ReturnType<typeof assignNarrativeSentenceIdsV6>;
      };
      batchSizes.push(input.script.sentences.length);
      activeBatches -= 1;
      return { data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'audit_narrative_sentences_v6',
        arguments: JSON.stringify({ findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: 'supported',
          reason: 'Respaldada.',
          propositionIds: [],
        })) }),
      } }] } }] } };
    });
    const agents = createNarrativeEditorialAgentsV6({ apiKey: 'test-key', post });
    const longScript = assignNarrativeSentenceIdsV6(
      'palace',
      Array.from({ length: 17 }, (_, index) => `Esta es la frase número ${index + 1}.`).join(' ')
    );

    const result = await agents.audit({ script: longScript, dossier }, 'deepseek');

    expect(batchSizes).toEqual([6, 6, 5]);
    expect(peakBatches).toBe(1);
    expect(result.value.findings).toHaveLength(17);
  });

  it('splits a provider audit batch sequentially when its output reaches the token limit', async () => {
    const batchSizes: number[] = [];
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const userMessage = (body.messages as Array<{ role: string; content: string }>)[1].content;
      const input = JSON.parse(userMessage.split('\n').slice(1).join('\n')) as {
        script: ReturnType<typeof assignNarrativeSentenceIdsV6>;
      };
      batchSizes.push(input.script.sentences.length);
      if (batchSizes.length === 1) {
        return { data: { choices: [{
          finish_reason: 'length', message: { content: '{"findings":[' },
        }] } };
      }
      return { data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'audit_narrative_sentences_v6',
        arguments: JSON.stringify({ findings: input.script.sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: 'supported',
          reason: 'Respaldada.',
          propositionIds: [],
        })) }),
      } }] } }] } };
    });
    const agents = createNarrativeEditorialAgentsV6({ apiKey: 'test-key', post });
    const script = assignNarrativeSentenceIdsV6(
      'palace',
      Array.from({ length: 6 }, (_, index) => `Esta es la frase número ${index + 1}.`).join(' ')
    );

    const result = await agents.audit({ script, dossier }, 'deepseek');

    expect(batchSizes).toEqual([6, 3, 3]);
    expect(result.value.findings).toHaveLength(6);
    expect(result.diagnostics?.map((diagnostic) => diagnostic.status))
      .toEqual(['protocol_failed', 'valid', 'valid']);
  });

  it('splits only a Gemma batch that remains semantically incomplete after retry', async () => {
    const batchSizes: number[] = [];
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const userMessage = (body.messages as Array<{ role: string; content: string }>)[1].content;
      const input = JSON.parse(userMessage.split('\n').slice(1).join('\n')) as {
        script: ReturnType<typeof assignNarrativeSentenceIdsV6>;
      };
      batchSizes.push(input.script.sentences.length);
      const sentences = input.script.sentences.length > 3
        ? input.script.sentences.slice(0, -1)
        : input.script.sentences;
      return { data: { message: { content: JSON.stringify({
        findings: sentences.map((sentence) => ({
          sentenceId: sentence.sentenceId,
          classification: 'supported',
          reason: 'Respaldada por el dossier.',
          propositionIds: [],
        })),
      }) } } };
    });
    const agents = createNarrativeEditorialAgentsV6({ ollamaHost: 'http://ollama.test', post });
    const scriptWithSixSentences = assignNarrativeSentenceIdsV6(
      'palace',
      Array.from({ length: 6 }, (_, index) => `Esta es la frase número ${index + 1}.`).join(' ')
    );

    const result = await agents.audit({ script: scriptWithSixSentences, dossier }, 'gemma');

    expect(batchSizes).toEqual([6, 6, 3, 3]);
    expect(result.value.findings).toHaveLength(6);
  });

  it('requires repair prompts to remove the accepted objection instead of paraphrasing it', async () => {
    let repairPrompt = '';
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      repairPrompt = (body.messages as Array<{ content: string }>)[0].content;
      return { data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'repair_narrative_window_v6',
        arguments: JSON.stringify({ replacements: [{
          sentenceId: 'palace-S001', text: 'La ornamentación exterior es contenida.',
        }] }),
      } }] } }] } };
    });
    const agents = createNarrativeEditorialAgentsV6({ apiKey: 'test-key', post });
    const script = assignNarrativeSentenceIdsV6(
      'palace', 'La institución quería parecer seria.'
    );
    await agents.repair({
      script,
      dossier,
      scope: 'factual',
      objections: [{
        objectionId: 'gemma:palace-S001:distorted', auditor: 'gemma',
        sentenceId: 'palace-S001', classification: 'distorted',
        reason: 'Atribuye psicología institucional no documentada.', propositionIds: [],
      }],
      adjudications: [{
        objectionId: 'gemma:palace-S001:distorted', decision: 'accepted',
        reason: 'Debe eliminarse toda la atribución psicológica.',
      }],
    });

    expect(repairPrompt).toContain('eliminar por completo el motivo aceptado');
    expect(repairPrompt).toContain('No basta con acortar o parafrasear');

    // Freeze factual repair request contract
    const repairBody = projectPostBody(post.mock.calls[0][1]);
    expect(repairBody.tool_choice).toEqual({ type: 'function', function: { name: 'repair_narrative_window_v6' } });
    expect(repairBody.messages[0].role).toBe('system');
    expect(repairBody.messages[1].role).toBe('user');
    const repairUserContent = repairBody.messages[1].content;
    expect(repairUserContent).toContain('script');
    expect(repairUserContent).toContain('dossier');
    expect(repairUserContent).toContain('objections');
    expect(repairUserContent).toContain('adjudications');
    expect(repairBody.tools[0].function.name).toBe('repair_narrative_window_v6');
    expect(repairBody.tools[0].function.parameters.type).toBe('object');
    expect(repairBody.tools[0].function.parameters.required).toEqual(['replacements']);
  });

  it('adjudicates premature closure with tour-wide narrative scope', async () => {
    let adjudicationPrompt = '';
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      adjudicationPrompt = (body.messages as Array<{ content: string }>)[0].content;
      return { data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'adjudicate_narrative_objections_v6',
        arguments: JSON.stringify({ adjudications: [{
          objectionId: 'tour:premature-close', decision: 'accepted',
          reason: 'La primera parada no puede cerrar el tour completo.',
        }] }),
      } }] } }] } };
    });
    const agents = createNarrativeEditorialAgentsV6({ apiKey: 'test-key', post });
    const script = assignNarrativeSentenceIdsV6(
      'palace', 'Este recorrido histórico termina aquí, ante el Palacio Real.'
    );

    const result = await agents.adjudicate({
      script,
      dossier,
      scope: 'tour',
      objections: [{
        objectionId: 'tour:premature-close', auditor: 'deepseek',
        sentenceId: 'palace-S001', classification: 'unclear',
        reason: 'Cierra el recorrido en la primera parada.', propositionIds: [],
      }],
    });

    expect(result.value[0].decision).toBe('accepted');
    expect(adjudicationPrompt).toContain('progresión, transiciones, repetición');
    expect(adjudicationPrompt).toContain('aunque no exista un error factual');

    // Freeze tour adjudication request contract
    const adjudicationBody = projectPostBody(post.mock.calls[0][1]);
    expect(adjudicationBody.tool_choice).toEqual({ type: 'function', function: { name: 'adjudicate_narrative_objections_v6' } });
    expect(adjudicationBody.messages[0].role).toBe('system');
    expect(adjudicationBody.messages[1].role).toBe('user');
    const adjudicationUserContent = adjudicationBody.messages[1].content;
    expect(adjudicationUserContent).toContain('script');
    expect(adjudicationUserContent).toContain('dossier');
    expect(adjudicationUserContent).toContain('objections');
    expect(adjudicationBody.tools[0].function.name).toBe('adjudicate_narrative_objections_v6');
    expect(adjudicationBody.tools[0].function.parameters.type).toBe('object');
    expect(adjudicationBody.tools[0].function.parameters.required).toEqual(['adjudications']);
  });

  it('does not turn unsupported visitor actions into factual objections', async () => {
    let adjudicationPrompt = '';
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      adjudicationPrompt = (body.messages as Array<{ content: string }>)[0].content;
      return { data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'adjudicate_narrative_objections_v6',
        arguments: JSON.stringify({ adjudications: [{
          objectionId: 'deepseek:palace-S001:unclear', decision: 'rejected',
          reason: 'Es una instrucción de observación, no una afirmación factual.',
        }] }),
      } }] } }] } };
    });
    const agents = createNarrativeEditorialAgentsV6({ apiKey: 'test-key', post });
    const script = assignNarrativeSentenceIdsV6(
      'palace', 'Compara por un momento las dos fachadas.'
    );

    const result = await agents.adjudicate({
      script,
      dossier,
      scope: 'factual',
      objections: [{
        objectionId: 'deepseek:palace-S001:unclear', auditor: 'deepseek',
        sentenceId: 'palace-S001', classification: 'unclear',
        reason: 'La acción del visitante no figura en el dossier.', propositionIds: [],
      }],
    });

    expect(result.value[0].decision).toBe('rejected');
    expect(adjudicationPrompt).toContain('su único motivo es que una transición');
    expect(adjudicationPrompt).toContain('No rebajes el control de hechos');

    // Freeze factual adjudication request contract
    const adjudicationBody = projectPostBody(post.mock.calls[0][1]);
    expect(adjudicationBody.tool_choice).toEqual({ type: 'function', function: { name: 'adjudicate_narrative_objections_v6' } });
    expect(adjudicationBody.messages[0].role).toBe('system');
    expect(adjudicationBody.messages[1].role).toBe('user');
    const adjudicationUserContent = adjudicationBody.messages[1].content;
    expect(adjudicationUserContent).toContain('script');
    expect(adjudicationUserContent).toContain('dossier');
    expect(adjudicationUserContent).toContain('objections');
    expect(adjudicationBody.tools[0].function.name).toBe('adjudicate_narrative_objections_v6');
    expect(adjudicationBody.tools[0].function.parameters.type).toBe('object');
    expect(adjudicationBody.tools[0].function.parameters.required).toEqual(['adjudications']);
  });

  it('limits global issues to material publication blockers', async () => {
    let auditPrompt = '';
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      auditPrompt = (body.messages as Array<{ content: string }>)[0].content;
      return { data: { choices: [{ message: { tool_calls: [{ function: {
        name: 'audit_narrative_tour_v6',
        arguments: JSON.stringify({
          issues: [], progressionWorks: true, promiseDelivered: true, closingWorks: true,
        }),
      } }] } }] } };
    });
    const agents = createNarrativeEditorialAgentsV6({ apiKey: 'test-key', post });

    await agents.auditTour({
      promise: 'Comprender Madrid',
      scripts: [assignNarrativeSentenceIdsV6('palace', 'Mira la fachada del palacio.')],
    });

    expect(auditPrompt).toContain('solo defectos materiales');
    expect(auditPrompt).toContain('el pulido opcional no es un issue');
    expect(auditPrompt).toContain('identificaciones necesarias al llegar');

    // Freeze tour audit request contract
    const tourAuditBody = projectPostBody(post.mock.calls[0][1]);
    expect(tourAuditBody.tool_choice).toEqual({ type: 'function', function: { name: 'audit_narrative_tour_v6' } });
    expect(tourAuditBody.messages[0].role).toBe('system');
    expect(tourAuditBody.messages[1].role).toBe('user');
    const tourAuditUserContent = tourAuditBody.messages[1].content;
    expect(tourAuditUserContent).toContain('promise');
    expect(tourAuditUserContent).toContain('scripts');
    expect(tourAuditBody.tools[0].function.name).toBe('audit_narrative_tour_v6');
    expect(tourAuditBody.tools[0].function.parameters.type).toBe('object');
    expect(tourAuditBody.tools[0].function.parameters.required).toEqual(['issues', 'progressionWorks', 'promiseDelivered', 'closingWorks']);
  });

  it('derives approval from discrete publishable grades and sentence citations', async () => {
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const toolName = ((body.tool_choice as { function: { name: string } }).function.name);
      const dimensions = Object.fromEntries([
        'accuracyGrounding', 'narrativeArcTransitions', 'oralClarityRhythm',
        'placeObservationSafety', 'styleRepetitionClosing',
      ].map((dimension) => [dimension, {
        score: 8.5, rationale: 'La frase concreta sostiene esta dimensión.',
        sentenceIds: ['palace-S001'],
      }]));
      return { data: { choices: [{ message: { tool_calls: [{ function: {
        name: toolName,
        arguments: JSON.stringify({ dimensions, polishNotes: [], objections: [] }),
      } }] } }] } };
    });
    const script = assignNarrativeSentenceIdsV6('palace', 'Mira la fachada del palacio.');

    const result = await reviewNarrativeTourScorecardV6(
      { apiKey: 'test-key', post },
      { promise: 'Comprender Madrid', scripts: [script], dossiers: [dossier] }
    );

    expect(result.value).toMatchObject({
      decision: 'Approve', overallBand: 'Good', weightedScore: 8.5,
    });
    expect(result.value.dimensions.accuracyGrounding.sentenceIds).toEqual(['palace-S001']);
  });
});
