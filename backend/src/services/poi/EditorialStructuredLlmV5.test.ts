import {
  createEditorialCallBudgetV5,
  requestEditorialStructuredV5,
} from './EditorialStructuredLlmV5';

function response(argumentsValue: string) {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: 'submit_test', arguments: argumentsValue,
  } }] } }] } };
}

function config(
  phase: 'initial' | 'final',
  budget: ReturnType<typeof createEditorialCallBudgetV5>,
  post: jest.Mock
) {
  return {
    phase,
    budget,
    input: { phase },
    provider: { kind: 'deepseek' as const, model: 'deepseek-v4-flash' },
    options: { apiKey: 'secret', post },
    systemPrompt: 'Return the value.',
    schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
    toolName: 'submit_test',
    toolDescription: 'Submit test.',
    validate: (value: unknown) => {
      if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) {
        throw new Error('semantic invalid');
      }
      return value as { ok: true };
    },
  };
}

describe('shared editorial LLM budget v5', () => {
  it('allows two normal calls and only one shared malformed-response retry', async () => {
    const budget = createEditorialCallBudgetV5();
    const post = jest.fn()
      .mockResolvedValueOnce(response('{bad json'))
      .mockResolvedValueOnce(response('{"ok":true}'))
      .mockResolvedValueOnce(response('{"ok":true}'));

    const initial = await requestEditorialStructuredV5(config('initial', budget, post));
    const final = await requestEditorialStructuredV5(config('final', budget, post));

    expect(initial.status).toBe('valid');
    expect(initial.attempts).toHaveLength(2);
    expect(final.status).toBe('valid');
    expect(post).toHaveBeenCalledTimes(3);
    expect(budget).toMatchObject({
      normalPhases: ['initial', 'final'], retryUsed: true, actualCallCount: 3,
    });
  });

  it('never retries semantic errors', async () => {
    const budget = createEditorialCallBudgetV5();
    const post = jest.fn().mockResolvedValue(response('{"ok":false}'));

    const result = await requestEditorialStructuredV5(config('initial', budget, post));

    expect(result.status).toBe('semantic_error');
    expect(post).toHaveBeenCalledTimes(1);
    expect(budget.retryUsed).toBe(false);
  });

  it('does not grant the final call another retry after the initial call used it', async () => {
    const budget = createEditorialCallBudgetV5();
    const post = jest.fn()
      .mockRejectedValueOnce(new Error('temporary'))
      .mockResolvedValueOnce(response('{"ok":true}'))
      .mockResolvedValueOnce(response('{bad json'));

    expect((await requestEditorialStructuredV5(config('initial', budget, post))).status).toBe('valid');
    const final = await requestEditorialStructuredV5(config('final', budget, post));

    expect(final.status).toBe('malformed_response');
    expect(final.attempts).toHaveLength(1);
    expect(post).toHaveBeenCalledTimes(3);
  });

  it('refuses duplicate or third normal phases', async () => {
    const budget = createEditorialCallBudgetV5();
    const post = jest.fn().mockResolvedValue(response('{"ok":true}'));
    await requestEditorialStructuredV5(config('initial', budget, post));

    await expect(requestEditorialStructuredV5(config('initial', budget, post)))
      .rejects.toThrow('already started');
  });
});
