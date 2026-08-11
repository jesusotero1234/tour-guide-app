import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
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
        ? { text: 'Mira la fachada. Aquí comienza la historia del edificio.' }
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

    expect(calls.map((call) => call.body.temperature)).toEqual([0.7, 0]);
    expect(calls.every((call) => call.body.model === DEEPSEEK_NARRATIVE_MODEL_V6)).toBe(true);
    expect(GEMMA_NARRATIVE_AUDITOR_MODEL_V6).toBe('gemma4:12b');
  });
});
