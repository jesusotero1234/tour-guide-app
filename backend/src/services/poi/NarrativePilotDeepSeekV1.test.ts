import { readFileSync } from 'fs';
import { join } from 'path';
import { NarrativeScriptResponseV1 } from './NarrativePilotV1';
import { EditorialPostV6 } from './EditorialStructuredLlmV6';
import {
  generateNarrativeCandidateV1,
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

describe('DeepSeek narrative candidate v1', () => {
  it('produces all three scripts in one non-thinking structured call', async () => {
    const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
    const frozen = load<NarrativeScriptResponseV1>(
      'narrative-pilot-v1', 'paris-premium-es.response.json'
    );
    const post = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>(
      async () => deepSeekResponse(frozen)
    );

    const result = await generateNarrativeCandidateV1(buildParisNarrativeScriptRequestV1(route), {
      apiKey: 'test-key', post,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('https://api.deepseek.com/beta/chat/completions');
    expect(post.mock.calls[0][1]).toMatchObject({
      model: NARRATIVE_PILOT_MODEL_V1,
      thinking: { type: 'disabled' },
      tools: [{ function: { name: 'submit_narrative_pilot_v1', strict: true } }],
    });
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'cada evidenceFactId puede aparecer como máximo en dos bloques'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'blocks[0] y blocks[1] usan únicamente evidenceFacts[0].factId'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'schemaVersion de salida debe ser exactamente narrative-script-response-v1'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'blocks[1].text debe incluir uno de estos verbos'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'Apunta a 240-250 palabras reales'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      '42-46 palabras y 255-280 caracteres en cada block.text'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'No uses términos de acontecimientos si la palabra no aparece en los excerpts'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'No supongas qué ha visto, visitado, entendido o experimentado el oyente'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'No conviertas una sucesión cronológica en causalidad'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'No traduzcas, abrevies ni inventes nombres propios'
    );
    expect(JSON.stringify(post.mock.calls[0][1])).toContain(
      'repairInstructions son correcciones internas obligatorias'
    );
    const messages = (post.mock.calls[0][1] as {
      messages: Array<{ role: string; content: string }>;
    }).messages;
    const generationInput = JSON.parse(messages[1].content.split('\n').slice(1).join('\n')) as {
      eventTermsByScene: Array<{
        sceneId: string;
        allowedEventTerms: string[];
        prohibitedEventTerms: string[];
      }>;
    };
    expect(generationInput.eventTermsByScene).toContainEqual(expect.objectContaining({
      sceneId: 'palais-royal',
      allowedEventTerms: [],
      prohibitedEventTerms: expect.arrayContaining(['revolución', 'incendio']),
    }));
    expect(result).toMatchObject({ status: 'valid', value: frozen.scripts });
  });

  it('retries transport or malformed JSON but returns semantic errors to the workflow', async () => {
    const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
    const frozen = load<NarrativeScriptResponseV1>(
      'narrative-pilot-v1', 'paris-premium-es.response.json'
    );
    const request = buildParisNarrativeScriptRequestV1(route);

    const transportPost = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>()
      .mockRejectedValueOnce(new Error('temporary outage'))
      .mockResolvedValueOnce(deepSeekResponse(frozen));
    expect((await generateNarrativeCandidateV1(request, {
      apiKey: 'test-key', post: transportPost,
    })).status).toBe('valid');
    expect(transportPost).toHaveBeenCalledTimes(2);

    const malformedPost = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>()
      .mockResolvedValueOnce(deepSeekResponse('{', true))
      .mockResolvedValueOnce(deepSeekResponse(frozen));
    expect((await generateNarrativeCandidateV1(request, {
      apiKey: 'test-key', post: malformedPost,
    })).status).toBe('valid');
    expect(malformedPost).toHaveBeenCalledTimes(2);

    const invalid = structuredClone(frozen);
    invalid.scripts[0].transition.targetSceneId = 'louvre';
    const semanticPost = jest.fn<ReturnType<EditorialPostV6>, Parameters<EditorialPostV6>>(
      async () => deepSeekResponse(invalid)
    );
    const semantic = await generateNarrativeCandidateV1(request, {
      apiKey: 'test-key', post: semanticPost,
    });
    expect(semanticPost).toHaveBeenCalledTimes(1);
    expect(semantic).toMatchObject({ status: 'semantic_error', value: null });
  });
});
