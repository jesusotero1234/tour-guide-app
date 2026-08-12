import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  DEEPSEEK_NARRATIVE_AUDITOR_MODEL_V6,
  DEEPSEEK_NARRATIVE_MODEL_V6,
  GEMMA_NARRATIVE_AUDITOR_MODEL_V6,
  createNarrativeEditorialAgentsV6,
} from './NarrativeEditorialAgentsV6';
import { assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';

const dossier = {
  stopId: 'palace', language: 'es', sources: [], passages: [], propositions: [],
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

    expect(calls.map((call) => call.body.temperature)).toEqual([0.7, 0, 0]);
    expect(written.value).toEqual({
      text: 'Mira la fachada. Aquí comienza la historia del edificio.',
    });
    expect(calls[0].body.tools).toEqual(expect.arrayContaining([
      expect.objectContaining({ function: expect.objectContaining({
        parameters: expect.objectContaining({ properties: expect.objectContaining({
          stop_id: { type: 'string', const: 'palace' },
        }) }),
      }) }),
    ]));
    expect(calls.map((call) => call.body.model)).toEqual([
      DEEPSEEK_NARRATIVE_MODEL_V6,
      DEEPSEEK_NARRATIVE_MODEL_V6,
      DEEPSEEK_NARRATIVE_AUDITOR_MODEL_V6,
    ]);
    const auditPrompt = ((calls[1].body.messages as Array<{ content: string }>)[0].content);
    expect(auditPrompt).toContain('sujeto, acción, objeto, causalidad');
    expect(auditPrompt).toContain('superlativos y adornos que parecen hechos');
    expect(GEMMA_NARRATIVE_AUDITOR_MODEL_V6).toBe('gemma4:12b');
    expect(DEEPSEEK_NARRATIVE_AUDITOR_MODEL_V6).toBe('deepseek-v4-pro');
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
  });
});
