import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { createNarrativeEditorialAgentsV6Core } from './NarrativeEditorialAgentsV6';

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
            return {
              text: root.segments
                .map((segment) => segment.text)
                .filter((text): text is string => typeof text === 'string')
                .join(' '),
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

    expect(result.value.text).toBe(
      'Observa la fachada. La autoridad religiosa abre el contraste con el poder civil que veremos después.'
    );
    expect(post).toHaveBeenCalledTimes(1);
  });
});
