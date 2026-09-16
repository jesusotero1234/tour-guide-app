import { calculateDeepseekCostV6, requestEditorialStructuredV6, EditorialProgressEventV6 } from './EditorialStructuredLlmV6';
import { NARRATIVE_MODEL_PROFILES_V6 } from './NarrativeModelProfilesV6';
import { narrativeCanaryCoreProviderV8 } from './NarrativeUserCanaryRuntimeV8';
import { preflightNarrativeOpenRouterV6 } from './OpenRouterPreflightV6';
import { codexWriterTransportV8 } from '../../../scripts/validation/narrative-codex-live-v8';
import { buildCodexArgs } from '../../../scripts/validation/narrative-codex-author-v8';

describe('DeepSeek Flash preparation with Astra narration', () => {
  it('routes all preparation stages directly to Flash and keeps Astra as the default writer', () => {
    const expected = { kind: 'deepseek', model: 'deepseek-flash' };
    const phases = NARRATIVE_MODEL_PROFILES_V6.deepseek_control.phases;
    for (const phase of [phases.planner, phases.curator, phases.curator_complex, phases.architect]) {
      expect(phase.provider).toEqual(expected);
      expect(phase.reasoning).toBe('none');
    }
    expect(phases.curator.maxTokens).toBe(NARRATIVE_MODEL_PROFILES_V6.qwen38_hybrid.phases.curator.maxTokens);
    expect(NARRATIVE_MODEL_PROFILES_V6.deepseek_control.concurrency).toEqual(NARRATIVE_MODEL_PROFILES_V6.qwen38_hybrid.concurrency);
    expect(narrativeCanaryCoreProviderV8('deepseek_control', {})).toEqual(expected);
    expect(codexWriterTransportV8(undefined, 'deepseek_control', false)).toBe('codex');
    expect(codexWriterTransportV8('codex', 'deepseek_control', false)).toBe('codex');
    expect(() => codexWriterTransportV8('codex', 'deepseek_control', true)).toThrow('resume');
    expect(buildCodexArgs('test')).toEqual(expect.arrayContaining(['gpt-6-astra', 'model_reasoning_effort="low"']));
  });

  it('does not contact OpenRouter when the profile has no OpenRouter models', async () => {
    const get = jest.fn().mockRejectedValue(new Error('OpenRouter must not be contacted'));
    const result = await preflightNarrativeOpenRouterV6({ profile: 'deepseek_control', get });
    expect(result).toMatchObject({ status: 'ready', checks: [], issues: [] });
    expect(get).not.toHaveBeenCalled();
  });

  it('bills Flash using launch time, peak boundaries, cache hits and weekend rates', () => {
    const usage = { model: 'deepseek-flash', cacheReadTokens: 1_000_000, cacheMissTokens: 1_000_000, outputTokens: 1_000_000 };
    for (const at of ['2026-09-10T06:00:00Z', '2026-09-10T09:59:59Z', '2026-09-11T01:00:00Z']) {
      expect(calculateDeepseekCostV6({ ...usage, at: new Date(at) })).toBeCloseTo(1.506, 12);
    }
    for (const at of ['2026-09-10T04:00:00Z', '2026-09-10T10:00:00Z', '2026-09-12T08:00:00Z']) {
      expect(calculateDeepseekCostV6({ ...usage, at: new Date(at) })).toBeCloseTo(0.753, 12);
    }
    expect(calculateDeepseekCostV6({ ...usage, at: new Date('2026-09-10T03:59:59Z') })).toBeUndefined();
    expect(calculateDeepseekCostV6({ ...usage, at: new Date('invalid') })).toBeUndefined();
    expect(calculateDeepseekCostV6({
      model: 'deepseek-v4-flash', cacheReadTokens: 5248, cacheMissTokens: 79,
      outputTokens: 2454, at: new Date('2026-09-01T17:00:00Z'),
    })).toBeCloseTo(0.001673756, 12);
  });

  it('uses the direct stable API without OpenRouter credentials and reports bounded spend', async () => {
    const post = jest.fn().mockResolvedValue({ data: {
      model: 'deepseek-flash', created: Date.parse('2026-09-10T08:00:00Z') / 1000,
      choices: [{ finish_reason: 'tool_calls', message: { content: null, tool_calls: [{
        id: 'call-1', type: 'function', function: { name: 'submit_test', arguments: '{"ok":true}' },
      }] } }],
      usage: { prompt_tokens: 100, prompt_cache_hit_tokens: 20, prompt_cache_miss_tokens: 80, completion_tokens: 10, total_tokens: 110 },
    } });
    const events: EditorialProgressEventV6[] = [];
    const result = await requestEditorialStructuredV6({
      callId: 'deepseek-flash-test', input: {}, provider: { kind: 'deepseek', model: 'deepseek-flash' },
      options: { apiKey: 'test-only', post, maxTokens: 100, reasoning: 'none', requestAttempts: 1, onProgress: event => events.push(event) },
      systemPrompt: 'Return the result.', toolName: 'submit_test', toolDescription: 'Submit result.',
      schema: { type: 'object', additionalProperties: false, required: ['ok'], properties: { ok: { type: 'boolean' } } },
      inputCharacterLimit: 1000, schemaCharacterLimit: 1000,
      validate: value => value as { ok: boolean },
    });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('https://api.deepseek.com/chat/completions');
    expect(post.mock.calls[0][1]).toMatchObject({
      model: 'deepseek-flash', thinking: { type: 'disabled' },
      tool_choice: { type: 'function', function: { name: 'submit_test' } },
    });
    expect(result).toMatchObject({ status: 'valid', value: { ok: true }, actualModel: 'deepseek-flash' });
    expect(result.usage?.costUsd).toBeCloseTo(0.00003612, 12);
    const reserved = events.find(event => event.event === 'attempt_started')?.maximumCostUsd;
    expect(reserved).toBeGreaterThanOrEqual(result.usage!.costUsd!);
    expect(Number.isFinite(reserved)).toBe(true);
  });
});
