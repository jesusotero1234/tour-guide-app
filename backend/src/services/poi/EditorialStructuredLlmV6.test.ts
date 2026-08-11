import { requestEditorialStructuredV6 } from './EditorialStructuredLlmV6';

function response(toolName: string) {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: toolName, arguments: '{"ok":true}',
  } }] } }] } };
}

describe('editorial structured LLM v6 providers', () => {
  it('uses an explicit temperature and fingerprints the effective request configuration', async () => {
    const temperatures: unknown[] = [];
    const post = jest.fn(async (
      _url: string,
      body: Record<string, unknown>
    ) => {
      expect(body).toMatchObject({ model: 'deepseek-v4-flash' });
      temperatures.push(body.temperature);
      return response('submit_test_v6');
    });

    const base = {
      callId: 'deepseek-temperature-test', input: { candidate: 'Q1' },
      provider: { kind: 'deepseek' as const, model: 'deepseek-v4-flash' },
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value as { ok: true },
    };
    const writer = await requestEditorialStructuredV6({
      ...base,
      options: { apiKey: 'deepseek-test-key', temperature: 0.7, post },
    });
    const auditor = await requestEditorialStructuredV6({
      ...base,
      options: { apiKey: 'deepseek-test-key', post },
    });

    expect(writer.status).toBe('valid');
    expect(auditor.status).toBe('valid');
    expect(temperatures).toEqual([0.7, 0]);
    expect(writer.temperature).toBe(0.7);
    expect(auditor.temperature).toBe(0);
    expect(writer.requestFingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(writer.requestFingerprint).not.toBe(auditor.requestFingerprint);
  });

  it('rejects temperatures outside the shared provider range before transport', async () => {
    const post = jest.fn();

    await expect(requestEditorialStructuredV6({
      callId: 'invalid-temperature', input: {},
      provider: { kind: 'ollama', model: 'gemma4:12b' },
      options: { temperature: Number.NaN, post },
      systemPrompt: 'Return valid structured data.',
      schema: { type: 'object' },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value) => value,
    })).rejects.toThrow('temperature must be between 0 and 2');
    expect(post).not.toHaveBeenCalled();
  });

  it('uses the documented OneProvider OpenAI-compatible tool endpoint without persisting its key', async () => {
    const post = jest.fn(async (
      url: string,
      body: Record<string, unknown>,
      headers: Record<string, string>
    ) => {
      expect(url).toBe('https://api.oneprovider.dev/v1/chat/completions');
      expect(headers.Authorization).toBe('Bearer one-provider-test-key');
      expect(body).not.toHaveProperty('thinking');
      expect(body).toMatchObject({
        model: 'claude-sonnet-4-6', temperature: 0,
      });
      return response('submit_test_v6');
    });

    const result = await requestEditorialStructuredV6({
      callId: 'oneprovider-test', input: { candidate: 'Q1' },
      provider: { kind: 'oneprovider', model: 'claude-sonnet-4-6' },
      options: { oneProviderApiKey: 'one-provider-test-key', post },
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value) => {
        if (!value || typeof value !== 'object' || (value as { ok?: unknown }).ok !== true) {
          throw new Error('invalid');
        }
        return value as { ok: true };
      },
    });

    expect(result.status).toBe('valid');
    expect(result.value).toEqual({ ok: true });
    expect(JSON.stringify(result)).not.toContain('one-provider-test-key');
    expect(post).toHaveBeenCalledTimes(1);
  });
});
