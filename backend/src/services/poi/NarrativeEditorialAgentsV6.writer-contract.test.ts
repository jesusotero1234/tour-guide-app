import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { createNarrativeEditorialAgentsV6Core } from './NarrativeEditorialAgentsV6';
import { assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';

const dossier = {
  stopId: 'palace',
  language: 'es',
  sources: [],
  passages: [],
  propositions: [{
    propositionId: 'prop-palace-1',
    text: 'La fachada puede observarse desde la ruta.',
    role: 'visible_observation',
    certainty: 'high',
    interpretation: 'direct',
    sourceIds: [],
    passageIds: [],
  }],
  authorizedNames: [],
  authorizedNumbers: [],
  discrepancies: [],
  limits: [],
  sufficiency: {
    isSufficient: true,
    missingRoles: [],
    authoritySourceCount: 2,
    independentPublisherCount: 2,
  },
  fingerprint: 'd'.repeat(64),
} as NarrativeDossierV6;

describe('NarrativeEditorialAgentsV6 writer response contract', () => {
  it('uses an opt-in response schema and parser while preserving V6 continuity validation', async () => {
    const schema = {
      type: 'object',
      additionalProperties: false,
      required: ['stop_id', 'segments'],
      properties: {
        stop_id: { type: 'string', const: 'palace' },
        segments: { type: 'array' },
      },
    };
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const tools = body.tools as Array<{
        function: { parameters: Record<string, unknown> };
      }>;
      expect(tools[0].function.parameters).toEqual(schema);
      return {
        data: {
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  name: 'write_narrative_stop_v6',
                  arguments: JSON.stringify({
                    stop_id: 'palace',
                    segments: [
                      { text: 'Observa la fachada.' },
                      {
                        text: 'La autoridad religiosa abre el contraste con el poder civil que veremos después.',
                      },
                    ],
                  }),
                },
              }],
            },
          }],
        },
      };
    });

    const agents = createNarrativeEditorialAgentsV6Core(
      { apiKey: 'test-key', post },
      ({ systemPrompt, input }) => ({ systemPrompt, input }),
      {
        writerResponseContract: (_projectedInput, input) => ({
          schema,
          parse: (value: unknown) => {
            const root = value as {
              stop_id?: unknown;
              segments?: Array<{ text?: unknown }>;
            };
            if (root.stop_id !== input.stopId || !Array.isArray(root.segments)) {
              throw new Error('invalid segmented response');
            }
            const text = root.segments
                .map((segment) => segment.text)
                .filter((text): text is string => typeof text === 'string')
                .join(' ');
            return {
              text,
              segments: root.segments.map((segment) => ({ text: segment.text as string })),
              coverage: 1,
              wordCount: text.split(/\s+/u).filter(Boolean).length,
            };
          },
        }),
      }
    );

    const result = await agents.write({
      stopId: 'palace',
      dossier,
      arc: {
        promise: 'Entender el poder',
        contribution: 'Origen',
        bridge: 'La autoridad religiosa contrasta con el poder civil.',
      },
      previousStop: null,
      nextStop: 'almudena',
      voiceProfile: ['Español oral'],
    });

    expect(result.diagnostic.value).not.toBeNull();
    type WriterShape = {
      text: string;
      segments: Array<{ text: string }>;
      coverage: number;
      wordCount: number;
    };
    const value = result.value as WriterShape;
    const diagnosticValue = result.diagnostic.value as WriterShape;
    expect(value.text).toBe(
      'Observa la fachada. La autoridad religiosa abre el contraste con el poder civil que veremos después.'
    );
    expect(value.segments).toEqual([
      { text: 'Observa la fachada.' },
      { text: 'La autoridad religiosa abre el contraste con el poder civil que veremos después.' },
    ]);
    expect(value.coverage).toBe(1);
    expect(value.wordCount).toBe(16);
    expect(diagnosticValue.text).toBe(value.text);
    expect(diagnosticValue.segments).toEqual(value.segments);
    expect(diagnosticValue.coverage).toBe(value.coverage);
    expect(diagnosticValue.wordCount).toBe(value.wordCount);
    value.segments[0].text = 'mutated';
    expect(diagnosticValue.segments[0].text).toBe('Observa la fachada.');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('validates the fully patched script via an opt-in repair hook', async () => {
    const originalText = 'Observa la fachada. La autoridad religiosa abre el contraste con el poder civil que veremos después.';
    const script = assignNarrativeSentenceIdsV6('palace', originalText);
    const objection = {
      objectionId: 'deepseek:palace-S001:unsupported',
      sentenceId: 'palace-S001',
      classification: 'unsupported' as const,
      reason: 'La afirmación carece de respaldo en el dossier.',
      propositionIds: [],
      auditor: 'deepseek' as const,
    };
    const adjudication = {
      objectionId: 'deepseek:palace-S001:unsupported',
      decision: 'accepted' as const,
      reason: 'Se acepta la objeción por falta de evidencia.',
    };

    let attempt = 0;
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      attempt += 1;
      const tools = body.tools as Array<{
        function: { parameters: Record<string, unknown> };
      }>;
      expect(tools[0].function.parameters).toEqual({
        type: 'object',
        additionalProperties: false,
        required: ['replacements'],
        properties: {
          replacements: {
            type: 'array',
            items: {
              type: 'object',
              additionalProperties: false,
              required: ['sentenceId', 'text'],
              properties: {
                sentenceId: { type: 'string' },
                text: { type: 'string', minLength: 1 },
              },
            },
          },
        },
      });
      const replacements = attempt === 1
        ? [{ sentenceId: 'palace-S001', text: 'Observa.' }]
        : [{ sentenceId: 'palace-S001', text: 'Observa la fachada desde la ruta.' }];
      return {
        data: {
          choices: [{
            message: {
              tool_calls: [{
                function: {
                  name: 'repair_narrative_window_v6',
                  arguments: JSON.stringify({ replacements }),
                },
              }],
            },
          }],
        },
      };
    });

    const agents = createNarrativeEditorialAgentsV6Core(
      { apiKey: 'test-key', post },
      ({ systemPrompt, input }) => ({ systemPrompt, input }),
      {
        validateRepair: (patchedScript) => {
          const words = patchedScript.text.split(/\s+/u).filter(Boolean);
          if (words.length < 16) {
            throw new Error('repair_length_target_missed');
          }
        },
      }
    );

    const result = await agents.repair({
      script,
      dossier,
      scope: 'factual',
      objections: [objection],
      adjudications: [adjudication],
    });

    expect(post).toHaveBeenCalledTimes(2);
    expect(result.diagnostic.attempts[0].error).toContain('repair_length_target_missed');
    expect(result.diagnostic.attempts.map((item) => item.status)).toEqual(['semantic_error', 'valid']);
    expect(result.diagnostic.status).toBe('valid');
    expect(result.value.replacements).toEqual([
      { sentenceId: 'palace-S001', text: 'Observa la fachada desde la ruta.' },
    ]);
  });
});
