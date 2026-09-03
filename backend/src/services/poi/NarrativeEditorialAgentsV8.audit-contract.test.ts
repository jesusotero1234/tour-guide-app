import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { createNarrativeEditorialAgentsV6Core } from './NarrativeEditorialAgentsV6';
import {
  assignNarrativeSentenceIdsV6,
  narrativeSentenceFingerprintV6,
} from './NarrativeEditorialV6';

describe('Narrative V8 factual audit contract', () => {
  it('requires current literal evidence anchors for every audit finding', async () => {
    const script = assignNarrativeSentenceIdsV6('stop-a', 'Observa la fachada histórica.');
    const dossier = {
      stopId: 'stop-a',
      language: 'es',
      sources: [],
      passages: [{ passageId: 'passage-1', sourceId: 'source-1', quote: 'fachada histórica' }],
      propositions: [{
        propositionId: 'prop-1',
        text: 'La fachada es histórica.',
        role: 'visible_observation',
        certainty: 'high',
        interpretation: 'direct',
        sourceIds: ['source-1'],
        passageIds: ['passage-1'],
      }],
      authorizedNames: [],
      authorizedNumbers: [],
      discrepancies: [],
      limits: [],
      sufficiency: {
        isSufficient: true,
        missingRoles: [],
        authoritySourceCount: 1,
        independentPublisherCount: 1,
      },
      fingerprint: 'dossier-fingerprint',
    } as NarrativeDossierV6;
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const messages = body.messages as Array<{ role: string; content: string }>;
      const tools = body.tools as Array<{
        function: { name: string; parameters: Record<string, unknown> };
      }>;
      const findingSchema = ((tools[0].function.parameters.properties as {
        findings: { items: { required: string[] } };
      }).findings.items);
      expect(findingSchema.required).toEqual(expect.arrayContaining([
        'sentenceFingerprint', 'claimSpan', 'passageIds', 'conflictType',
      ]));
      expect(messages[0].content).toContain('fragmento literal de la frase actual');
      expect(messages[0].content).toContain('afirmación verificable ambigua');

      return {
        data: { choices: [{ message: { tool_calls: [{ function: {
          name: tools[0].function.name,
          arguments: JSON.stringify({ findings: [{
            sentenceId: script.sentences[0].sentenceId,
            classification: 'supported',
            reason: 'La proposición respalda la frase.',
            propositionIds: ['prop-1'],
            sentenceFingerprint: narrativeSentenceFingerprintV6(script.sentences[0]),
            claimSpan: '',
            passageIds: ['passage-1'],
            conflictType: 'none',
          }] }),
        } }] } }] },
      };
    });
    const agents = createNarrativeEditorialAgentsV6Core(
      { apiKey: 'test-key', post },
      ({ systemPrompt, input }) => ({ systemPrompt, input }),
      { auditAnchorsRequired: true }
    );

    const result = await agents.audit({ script, dossier }, 'deepseek');

    expect(result.value.findings[0]).toMatchObject({
      sentenceFingerprint: narrativeSentenceFingerprintV6(script.sentences[0]),
      claimSpan: '',
      passageIds: ['passage-1'],
      conflictType: 'none',
    });
  });
});
