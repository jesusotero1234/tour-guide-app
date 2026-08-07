import { readFileSync } from 'fs';
import { join } from 'path';
import { NarrativePilotArtifactV1 } from './NarrativePilotV1';
import { EditorialPostV6 } from './EditorialStructuredLlmV6';
import {
  generateNarrativePilotV1,
  NARRATIVE_PILOT_MODEL_V1,
} from './NarrativePilotDeepSeekV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');

function load<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...parts), 'utf8')) as T;
}

function deepSeekResponse(value: unknown, raw = false): { data: unknown } {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: 'submit_narrative_pilot_v1', arguments: raw ? String(value) : JSON.stringify(value),
  } }] } }] } };
}

describe('DeepSeek narrative pilot v1', () => {
  it('produces all three scripts in one structured call and starts review-required', async () => {
    const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
    const frozen = load<{ scripts: NarrativePilotArtifactV1['scripts'] }>(
      'narrative-pilot-v1', 'paris-premium-es.response.json'
    );
    const post = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>(
      async () => deepSeekResponse(frozen)
    );

    const result = await generateNarrativePilotV1(buildParisNarrativeScriptRequestV1(route), {
      apiKey: 'test-key', post,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('https://api.deepseek.com/beta/chat/completions');
    expect(post.mock.calls[0][1]).toMatchObject({
      model: NARRATIVE_PILOT_MODEL_V1,
      tools: [{ function: { name: 'submit_narrative_pilot_v1' } }],
    });
    expect(result).toMatchObject({
      status: 'review_required', scripts: frozen.scripts,
      generation: { status: 'valid', model: NARRATIVE_PILOT_MODEL_V1 },
    });
  });

  it('retries once after transport or malformed JSON but never after a semantic error', async () => {
    const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
    const frozen = load<{ scripts: NarrativePilotArtifactV1['scripts'] }>(
      'narrative-pilot-v1', 'paris-premium-es.response.json'
    );
    const request = buildParisNarrativeScriptRequestV1(route);
    const valid = frozen;

    const transportPost = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(deepSeekResponse(valid));
    expect((await generateNarrativePilotV1(request, {
      apiKey: 'test-key', post: transportPost,
    })).generation.status).toBe('valid');
    expect(transportPost).toHaveBeenCalledTimes(2);

    const malformedPost = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>()
      .mockResolvedValueOnce(deepSeekResponse('{', true))
      .mockResolvedValueOnce(deepSeekResponse(valid));
    expect((await generateNarrativePilotV1(request, {
      apiKey: 'test-key', post: malformedPost,
    })).generation.status).toBe('valid');
    expect(malformedPost).toHaveBeenCalledTimes(2);

    const invalid = structuredClone(valid);
    invalid.scripts[0].transition.targetSceneId = 'louvre';
    const semanticPost = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>(
      async () => deepSeekResponse(invalid)
    );
    const semantic = await generateNarrativePilotV1(request, {
      apiKey: 'test-key', post: semanticPost,
    });
    expect(semanticPost).toHaveBeenCalledTimes(1);
    expect(semantic).toMatchObject({
      status: 'review_required', scripts: [], generation: { status: 'semantic_error' },
    });
  });
});
