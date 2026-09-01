import {
  DEEPSEEK_PRICING_V6,
  requestEditorialStructuredV6,
} from './EditorialStructuredLlmV6';
import {
  NARRATIVE_MODEL_PROFILES_V6,
  resolveNarrativeModelProfileV6,
} from './NarrativeModelProfilesV6';
import { preflightBalancedOpenRouterV6 } from './OpenRouterPreflightV6';

function response(toolName: string) {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: toolName, arguments: '{"ok":true}',
  } }] } }], usage: { prompt_tokens: 10, completion_tokens: 4, total_tokens: 14 } } };
}

function openRouterResponse(
  content: string,
  overrides: Record<string, unknown> = {}
) {
  return { data: {
    model: 'openai/gpt-5.4-mini',
    choices: [{ finish_reason: 'stop', message: { content } }],
    usage: {
      prompt_tokens: 20,
      completion_tokens: 8,
      total_tokens: 28,
      cost: 0.0012,
      prompt_tokens_details: { cached_tokens: 0 },
      completion_tokens_details: { reasoning_tokens: 3 },
    },
    openrouter_metadata: {
      requested: 'openai/gpt-5.4-mini',
      strategy: 'direct',
      attempt: 1,
      endpoints: { total: 1, available: [{
        provider: 'OpenAI', model: 'openai/gpt-5.4-mini', selected: true,
      }] },
      attempts: [{ provider: 'OpenAI', model: 'openai/gpt-5.4-mini', status: 200 }],
      pipeline: [],
    },
    ...overrides,
  } };
}

describe('editorial structured LLM v6 providers', () => {
  it('keeps the DeepSeek control default with unpinned OpenRouter phases', () => {
    expect(resolveNarrativeModelProfileV6()).toBe(NARRATIVE_MODEL_PROFILES_V6.deepseek_control);
    const candidate = NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter;
    expect(candidate.phases).toMatchObject({
      planner: {
        provider: { model: 'deepseek/deepseek-v4-flash-0731' },
        reasoning: 'none', temperature: 0,
      },
      curator: {
        provider: { model: 'openai/gpt-5.4-mini' },
        reasoning: 'low',
      },
      curator_complex: {
        provider: { model: 'openai/gpt-5.4' },
        reasoning: 'medium',
      },
      writer: { reasoning: 'none', temperature: 0.7 },
      auditor_a: { reasoning: 'none', temperature: 0, maxTokens: 2_000 },
      auditor_b: {
        provider: { model: 'openai/gpt-5.4-mini' },
        reasoning: 'low', maxTokens: 2_000,
      },
      global_auditor: {
        provider: { model: 'openai/gpt-5.4-mini' },
        reasoning: 'high', maxTokens: 20_000,
      },
    });
    expect(candidate.phases.curator).not.toHaveProperty('temperature');
    expect(candidate.phases.auditor_b).not.toHaveProperty('temperature');
    expect(candidate.phases.global_auditor).not.toHaveProperty('temperature');
  });

  it('preflights the public catalog for compatible endpoints without an API key', async () => {
    const providers: Record<string, { tag: string; provider: string }> = {
      'deepseek/deepseek-v4-flash-0731': {
        tag: 'relace/fp4', provider: 'Relace',
      },
      'openai/gpt-5.4-mini': { tag: 'openai', provider: 'OpenAI' },
      'openai/gpt-5.4': { tag: 'openai', provider: 'OpenAI' },
      'google/gemini-3.5-flash-lite': {
        tag: 'google-ai-studio', provider: 'Google AI Studio',
      },
      'google/gemini-3.6-flash': {
        tag: 'google-vertex/global', provider: 'Google',
      },
    };
    let activeEndpointRequests = 0;
    let peakEndpointRequests = 0;
    let releaseEndpoints: (() => void) | undefined;
    let releaseScheduled = false;
    const endpointBarrier = new Promise<void>((resolve) => { releaseEndpoints = resolve; });
    const controller = new AbortController();
    const get = jest.fn(async (
      url: string,
      headers: Record<string, string>,
      signal?: AbortSignal
    ) => {
      expect(headers).toEqual({ Accept: 'application/json' });
      expect(signal).toBe(controller.signal);
      if (url.endsWith('/models')) {
        return { data: { data: Object.keys(providers).map((id) => ({ id })) } };
      }
      activeEndpointRequests += 1;
      peakEndpointRequests = Math.max(peakEndpointRequests, activeEndpointRequests);
      if (!releaseScheduled) {
        releaseScheduled = true;
        setTimeout(() => releaseEndpoints?.(), 20);
      }
      await endpointBarrier;
      activeEndpointRequests -= 1;
      const model = Object.keys(providers).find((candidate) => url.includes(candidate));
      if (!model) throw new Error(`unexpected URL: ${url}`);
      const provider = providers[model];
      return { data: { data: { id: model, endpoints: [{
        tag: 'incompatible',
        provider_name: 'Incompatible Provider',
        name: `Incompatible Provider | ${model}`,
        pricing: { prompt: '0.1', completion: '0.1', request: '0.1' },
        supported_parameters: ['max_tokens'],
      }, {
        tag: provider.tag,
        provider_name: provider.provider,
        name: `${provider.provider} | ${model}`,
        pricing: { prompt: '0.000001', completion: '0.000004', request: '0' },
        supported_parameters: [
          'max_tokens', 'reasoning', 'response_format', 'structured_outputs', 'temperature',
        ],
      }, {
        tag: 'compatible-backup',
        provider_name: 'Compatible Backup',
        name: `Compatible Backup | ${model}`,
        pricing: {
          prompt: '0.000002', completion: '0.000003', internal_reasoning: '0.000005', request: '0.000006',
        },
        supported_parameters: [
          'max_tokens', 'reasoning', 'response_format', 'structured_outputs', 'temperature',
        ],
      }] } } };
    });

    const result = await preflightBalancedOpenRouterV6({ get, signal: controller.signal });

    expect(result.status).toBe('ready');
    expect(result.issues).toEqual([]);
    expect(result.checks).toHaveLength(3);
    expect(result.checks[0].pricing).toEqual({
      inputUsdPerToken: 0.000002,
      outputUsdPerToken: 0.000004,
      internalReasoningUsdPerToken: 0.000005,
      requestUsd: 0.000006,
    });
    expect(result.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(get).toHaveBeenCalledTimes(4);
    expect(peakEndpointRequests).toBe(3);
    expect(get.mock.calls.flat()).not.toContain(expect.stringContaining('Bearer'));
  });

  it('stops preflight when no endpoint can honor the request protocol', async () => {
    const get = jest.fn(async (url: string) => {
      if (url.endsWith('/models')) {
        return { data: { data: [{ id: 'openai/gpt-5.4-mini' }] } };
      }
      return { data: { data: { endpoints: [{
        tag: url.includes('gpt-5.4') ? 'openai' : 'wrong-endpoint',
        provider_name: 'Wrong Provider',
        pricing: { prompt: '0.000001', completion: '0.000003' },
        supported_parameters: ['max_tokens'],
      }] } } };
    });

    const result = await preflightBalancedOpenRouterV6({ get });

    expect(result.status).toBe('protocol_failed');
    expect(result.issues).toEqual(expect.arrayContaining([
      expect.stringContaining('No compatible endpoint found'),
      expect.stringContaining('Model is absent from the OpenRouter catalog'),
    ]));
  });

  it('sends strict dynamically routed OpenRouter JSON schema requests and validates routing metadata', async () => {
    const phase = NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter.phases.curator;
    const progress: Array<{ event: string; diagnostic?: unknown; maximumCostUsd?: number }> = [];
    const post = jest.fn(async (
      url: string,
      body: Record<string, unknown>,
      headers: Record<string, string>
    ) => {
      expect(url).toBe('https://openrouter.ai/api/v1/chat/completions');
      expect(headers).toMatchObject({
        Authorization: 'Bearer openrouter-test-key',
        'X-OpenRouter-Metadata': 'enabled',
        'X-OpenRouter-Cache': 'false',
      });
      expect(body).toMatchObject({
        model: 'openai/gpt-5.4-mini',
        reasoning: { effort: 'low' },
        provider: { require_parameters: true, allow_fallbacks: false },
        response_format: {
          type: 'json_schema',
          json_schema: { name: 'submit_test_v6', strict: true },
        },
      });
      expect(body).not.toHaveProperty('temperature');
      expect(body).not.toHaveProperty('plugins');
      return openRouterResponse('{"ok":true}');
    });

    const result = await requestEditorialStructuredV6({
      callId: 'openrouter-test', input: { candidate: 'Q1' }, provider: phase.provider,
      options: {
        openRouterApiKey: 'openrouter-test-key', post, reasoning: phase.reasoning,
        maxTokens: phase.maxTokens, disableOpenRouterCache: true,
        pricing: { inputUsdPerToken: 0.000001, outputUsdPerToken: 0.000003 },
        phase: 'curator', profile: 'balanced_openrouter', requestAttempts: 2,
        onProgress: (event) => progress.push(event),
      },
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value) => value as { ok: true },
    });

    expect(result).toMatchObject({
      status: 'valid', actualModel: 'openai/gpt-5.4-mini', actualProvider: 'OpenAI',
      requestedEndpoint: null, schemaValid: true, retryCount: 0, ttftMs: null,
      reasoning: 'low', profile: 'balanced_openrouter',
      usage: {
        inputTokens: 20, outputTokens: 8, totalTokens: 28,
        reasoningTokens: 3, cacheReadTokens: 0, costUsd: 0.0012,
      },
      routing: { strategy: 'direct', fallback: false },
    });
    expect(progress.map((event) => event.event)).toEqual([
      'attempt_started', 'attempt_finished',
    ]);
    expect(progress[0].maximumCostUsd).toBeGreaterThan(0.024);
    expect(result.attempts[0]).toMatchObject({
      usage: { inputTokens: 20, outputTokens: 8, costUsd: 0.0012 },
      finishReason: 'stop', actualModel: 'openai/gpt-5.4-mini', actualProvider: 'OpenAI',
      routing: { fallback: false },
    });
    expect(JSON.stringify(result)).not.toContain('openrouter-test-key');
  });

  it('retries one invalid JSON-schema response but rejects router fallbacks without retrying', async () => {
    const phase = NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter.phases.curator;
    const schemaPost = jest.fn()
      .mockResolvedValueOnce(openRouterResponse('{"ok":"wrong"}'))
      .mockResolvedValueOnce(openRouterResponse('{"ok":true}'));
    const base = {
      callId: 'openrouter-schema-retry', input: {}, provider: phase.provider,
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value as { ok: true },
    };
    const valid = await requestEditorialStructuredV6({
      ...base,
      options: {
        openRouterApiKey: 'test-key', post: schemaPost,
        reasoning: phase.reasoning, requestAttempts: 2,
      },
    });
    expect(valid.attempts.map((item) => item.schemaValid)).toEqual([false, true]);
    expect(valid.retryCount).toBe(1);
    expect(valid.attempts.map((item) => item.usage?.costUsd)).toEqual([0.0012, 0.0012]);
    expect(valid.usage).toMatchObject({
      inputTokens: 40, outputTokens: 16, totalTokens: 56, costUsd: 0.0024,
    });

    const fallbackPost = jest.fn(async () => openRouterResponse('{"ok":true}', {
      openrouter_metadata: {
        requested: 'openai/gpt-5.4-mini', strategy: 'fallback', attempt: 2,
        endpoints: { total: 1, available: [{
          provider: 'OpenAI', model: 'openai/gpt-5.4-mini', selected: true,
        }] },
        attempts: [
          { provider: 'Other', model: 'openai/gpt-5.4-mini', status: 500 },
          { provider: 'OpenAI', model: 'openai/gpt-5.4-mini', status: 200 },
        ],
        pipeline: [],
      },
    }));
    const invalid = await requestEditorialStructuredV6({
      ...base,
      callId: 'openrouter-fallback-rejected',
      options: {
        openRouterApiKey: 'test-key', post: fallbackPost,
        reasoning: phase.reasoning, requestAttempts: 2,
      },
    });
    expect(invalid.status).toBe('semantic_error');
    expect(invalid.attempts[0].error).toContain('fallback');
    expect(fallbackPost).toHaveBeenCalledTimes(1);
  });

  it('rejects inconsistent selected-endpoint and attempt routing metadata', async () => {
    const phase = NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter.phases.curator;
    const base = {
      input: {}, provider: phase.provider,
      options: { openRouterApiKey: 'test-key', requestAttempts: 2 as const },
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value as { ok: true },
    };
    const selectedModel = await requestEditorialStructuredV6({
      ...base,
      callId: 'openrouter-selected-model-mismatch',
      options: {
        ...base.options,
        post: jest.fn(async () => openRouterResponse('{"ok":true}', {
          openrouter_metadata: {
            requested: 'openai/gpt-5.4-mini', strategy: 'direct', attempt: 1,
            endpoints: { available: [{
              provider: 'OpenAI', model: 'unexpected/model', selected: true,
            }] },
            attempts: [{ provider: 'OpenAI', model: 'openai/gpt-5.4-mini', status: 200 }],
            pipeline: [],
          },
        })),
      },
    });
    expect(selectedModel.status).toBe('semantic_error');
    expect(selectedModel.attempts[0].error).toContain('selected endpoint model mismatch');

    const attemptProvider = await requestEditorialStructuredV6({
      ...base,
      callId: 'openrouter-attempt-provider-mismatch',
      options: {
        ...base.options,
        post: jest.fn(async () => openRouterResponse('{"ok":true}', {
          openrouter_metadata: {
            requested: 'openai/gpt-5.4-mini', strategy: 'direct', attempt: 1,
            endpoints: { available: [{
              provider: 'OpenAI', model: 'openai/gpt-5.4-mini', selected: true,
            }] },
            attempts: [{ provider: 'Other', model: 'openai/gpt-5.4-mini', status: 200 }],
            pipeline: [],
          },
        })),
      },
    });
    expect(attemptProvider.status).toBe('semantic_error');
    expect(attemptProvider.attempts[0].error).toContain('attempt metadata is invalid');
  });

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
    expect(writer.usage).toMatchObject({
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 14,
    });
    expect(writer.usage?.costUsd).toBeCloseTo(0.00000252, 12);
    expect(DEEPSEEK_PRICING_V6.effectiveDate).toBe('2026-08-12');
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

  it('retries a schema-invalid response with corrective feedback and succeeds on the second attempt', async () => {
    const phase = NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter.phases.curator;
    const post = jest.fn()
      .mockResolvedValueOnce(openRouterResponse('{"ok":"wrong"}'))
      .mockResolvedValueOnce(openRouterResponse('{"ok":true}'));

    const result = await requestEditorialStructuredV6({
      callId: 'schema-retry-corrective', input: {}, provider: phase.provider,
      options: {
        openRouterApiKey: 'test-key', post, reasoning: phase.reasoning, requestAttempts: 2,
      },
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value as { ok: true },
    });

    expect(result.status).toBe('valid');
    expect(result.attempts[0].status).toBe('semantic_error');
    expect(result.attempts[0].schemaValid).toBe(false);
    expect(result.attempts[1].status).toBe('valid');
    expect(result.attempts[1].schemaValid).toBe(true);
    expect(result.retryCount).toBe(1);
    expect(post).toHaveBeenCalledTimes(2);
    const firstBody = post.mock.calls[0][1] as Record<string, unknown>;
    const firstMessages = firstBody.messages as Array<Record<string, string>>;
    expect(firstMessages).toHaveLength(2);
    expect(firstMessages[1].content).not.toContain('failed validation');
    const secondBody = post.mock.calls[1][1] as Record<string, unknown>;
    const secondMessages = secondBody.messages as Array<Record<string, string>>;
    expect(secondMessages).toHaveLength(3);
    expect(secondMessages[2].content).toContain('failed validation');
    expect(secondMessages[2].content).toContain('Return a complete replacement JSON response');
    expect(secondMessages[2].content).toContain('Copy every enum or const identifier exactly');
  });

  it('retries a semantic-invalid response with corrective feedback and succeeds on the second attempt', async () => {
    const phase = NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter.phases.curator;
    const post = jest.fn()
      .mockResolvedValueOnce(openRouterResponse('{"ok":true}'))
      .mockResolvedValueOnce(openRouterResponse('{"ok":true}'));
    let validations = 0;

    const result = await requestEditorialStructuredV6({
      callId: 'semantic-retry-corrective', input: {}, provider: phase.provider,
      options: {
        openRouterApiKey: 'test-key', post, reasoning: phase.reasoning, requestAttempts: 2,
      },
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => {
        validations += 1;
        if (validations === 1) throw new Error('missing required item');
        return value as { ok: true };
      },
    });

    expect(result.status).toBe('valid');
    expect(result.attempts[0].status).toBe('semantic_error');
    expect(result.attempts[0].schemaValid).toBe(true);
    expect(result.attempts[1].status).toBe('valid');
    expect(result.attempts[1].schemaValid).toBe(true);
    expect(result.retryCount).toBe(1);
    expect(post).toHaveBeenCalledTimes(2);
    const firstBody = post.mock.calls[0][1] as Record<string, unknown>;
    const firstMessages = firstBody.messages as Array<Record<string, string>>;
    expect(firstMessages).toHaveLength(2);
    expect(firstMessages[1].content).not.toContain('failed semantic validation');
    const secondBody = post.mock.calls[1][1] as Record<string, unknown>;
    const secondMessages = secondBody.messages as Array<Record<string, string>>;
    expect(secondMessages).toHaveLength(3);
    expect(secondMessages[2].content).toContain('failed semantic validation');
    expect(secondMessages[2].content).toContain('Return a complete replacement JSON response');
    expect(secondMessages[2].content).toContain('Copy every identifier exactly');
  });

  it('does not retry a structurally valid response that fails semantic validation when configured for a single attempt', async () => {
    const post = jest.fn(async () => response('submit_test_v6'));
    let validations = 0;

    const result = await requestEditorialStructuredV6({
      callId: 'semantic-retry', input: {},
      provider: { kind: 'deepseek', model: 'deepseek-v4-flash' },
      options: { apiKey: 'deepseek-test-key', post, requestAttempts: 1 },
      systemPrompt: 'Return complete structured data.',
      schema: { type: 'object' },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value) => {
        validations += 1;
        if (validations === 1) throw new Error('missing required item');
        return value;
      },
    });

    expect(result.status).toBe('semantic_error');
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['semantic_error']);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('fails immediately on a length-truncated response even when its JSON is valid', async () => {
    const phase = NARRATIVE_MODEL_PROFILES_V6.balanced_openrouter.phases.curator;
    const post = jest.fn(async () => openRouterResponse('{"ok":true}', {
      choices: [{ finish_reason: 'length', message: { content: '{"ok":true}' } }],
    }));

    const result = await requestEditorialStructuredV6({
      callId: 'length-is-protocol-failure', input: {}, provider: phase.provider,
      options: {
        openRouterApiKey: 'test-key', post, reasoning: phase.reasoning, requestAttempts: 2,
      },
      systemPrompt: 'Return valid structured data.',
      schema: {
        type: 'object', additionalProperties: false, required: ['ok'],
        properties: { ok: { type: 'boolean' } },
      },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value as { ok: true },
    });

    expect(result.status).toBe('protocol_failed');
    expect(result.finishReason).toBe('length');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      status: 'protocol_failed', finishReason: 'length', schemaValid: false,
      actualModel: 'openai/gpt-5.4-mini', actualProvider: 'OpenAI',
    });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('uses one absolute AbortSignal deadline for the whole logical call', async () => {
    const seenSignals: AbortSignal[] = [];
    const post = jest.fn(async (
      _url: string,
      _body: Record<string, unknown>,
      _headers: Record<string, string>,
      request?: { timeoutMs: number; signal?: AbortSignal }
    ) => new Promise<{ data: unknown }>((_resolve, reject) => {
      expect(request?.timeoutMs).toBeLessThanOrEqual(1_000);
      expect(request?.signal).toBeDefined();
      seenSignals.push(request?.signal as AbortSignal);
      request?.signal?.addEventListener('abort', () => reject(request.signal?.reason), { once: true });
    }));

    const result = await requestEditorialStructuredV6({
      callId: 'absolute-deadline', input: {},
      provider: { kind: 'deepseek', model: 'deepseek-v4-flash' },
      options: {
        apiKey: 'test-key', post, requestAttempts: 2, requestTimeoutMs: 1_000,
      },
      systemPrompt: 'Return valid structured data.', schema: { type: 'object' },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value,
    });

    expect(result.status).toBe('transport_error');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({ timedOut: true });
    expect(seenSignals).toHaveLength(1);
    expect(seenSignals[0].aborted).toBe(true);
  });

  it('retries only transient transport failures', async () => {
    const transient = Object.assign(new Error('upstream unavailable'), { status: 503 });
    const transientPost = jest.fn()
      .mockRejectedValueOnce(transient)
      .mockResolvedValueOnce(response('submit_test_v6'));
    const base = {
      input: {}, provider: { kind: 'deepseek' as const, model: 'deepseek-v4-flash' },
      systemPrompt: 'Return valid structured data.', schema: { type: 'object' },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value,
    };

    const recovered = await requestEditorialStructuredV6({
      ...base, callId: 'retry-503',
      options: { apiKey: 'test-key', post: transientPost, requestAttempts: 2 },
    });
    expect(recovered.status).toBe('valid');
    expect(recovered.attempts.map((attempt) => attempt.status))
      .toEqual(['transport_error', 'valid']);

    const clientError = Object.assign(new Error('bad request'), { status: 400 });
    const clientErrorPost = jest.fn().mockRejectedValue(clientError);
    const rejected = await requestEditorialStructuredV6({
      ...base, callId: 'no-retry-400',
      options: { apiKey: 'test-key', post: clientErrorPost, requestAttempts: 2 },
    });
    expect(rejected.status).toBe('transport_error');
    expect(rejected.attempts).toHaveLength(1);
    expect(clientErrorPost).toHaveBeenCalledTimes(1);
  });

  it('honors Retry-After for a transient provider failure within the absolute deadline', async () => {
    const throttled = Object.assign(new Error('provider overloaded'), {
      response: { status: 503, headers: { 'retry-after': '0.02' } },
    });
    const post = jest.fn()
      .mockRejectedValueOnce(throttled)
      .mockResolvedValueOnce(response('submit_test_v6'));
    const startedAt = Date.now();

    const result = await requestEditorialStructuredV6({
      callId: 'retry-after-503', input: {},
      provider: { kind: 'deepseek', model: 'deepseek-v4-flash' },
      options: {
        apiKey: 'test-key', post, requestAttempts: 2, requestTimeoutMs: 1_000,
      },
      systemPrompt: 'Return valid structured data.', schema: { type: 'object' },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value,
    });

    expect(result.status).toBe('valid');
    expect(result.attempts[0]).toMatchObject({
      status: 'transport_error', httpStatus: 503, retryAfterMs: 20,
    });
    expect(Date.now() - startedAt).toBeGreaterThanOrEqual(15);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('backs off when a 429 omits Retry-After', async () => {
    const throttled = Object.assign(new Error('provider rate limited'), {
      response: { status: 429, headers: {} },
    });
    const post = jest.fn().mockRejectedValue(throttled);

    const result = await requestEditorialStructuredV6({
      callId: 'retry-default-429', input: {},
      provider: { kind: 'deepseek', model: 'deepseek-v4-flash' },
      options: {
        apiKey: 'test-key', post, requestAttempts: 2, requestTimeoutMs: 1_000,
      },
      systemPrompt: 'Return valid structured data.', schema: { type: 'object' },
      toolName: 'submit_test_v6', toolDescription: 'Submit the test result.',
      inputCharacterLimit: 1_000, schemaCharacterLimit: 1_000,
      validate: (value: unknown) => value,
    });

    expect(result.status).toBe('transport_error');
    expect(result.attempts).toHaveLength(1);
    expect(result.attempts[0]).toMatchObject({
      status: 'transport_error', httpStatus: 429, retryAfterMs: 5_000,
    });
    expect(post).toHaveBeenCalledTimes(1);
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
