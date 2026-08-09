import { readFileSync } from 'fs';
import { join } from 'path';
import {
  buildNarrativeCriticRequestV1,
  NarrativeCriticReportV1,
} from './NarrativePilotCriticV1';
import {
  inspectNarrativeCriticModelV1,
  NARRATIVE_CRITIC_MODEL_V1,
  requestNarrativeCritiqueV1,
} from './NarrativePilotGemmaV1';
import { NarrativeScriptResponseV1 } from './NarrativePilotV1';
import { buildParisNarrativeScriptRequestV1 } from './ParisNarrativePilotV1';
import { EditorialWorkbenchV7 } from './EditorialWorkbenchV7';

const FIXTURES = join(__dirname, '..', '..', '..', 'fixtures');
const DIGEST = '4eb23ef187e2c5462566d6a1d3bbbc2f1346d0b4327cbb66d58fffbcc9b2b05c';

function load<T>(...parts: string[]): T {
  return JSON.parse(readFileSync(join(FIXTURES, ...parts), 'utf8')) as T;
}

function criticInput() {
  const route = load<EditorialWorkbenchV7>('editorial-v7', 'paris-history-en-120.json');
  const response = load<NarrativeScriptResponseV1>(
    'narrative-pilot-v1', 'paris-premium-es.response.json'
  );
  return buildNarrativeCriticRequestV1(
    buildParisNarrativeScriptRequestV1(route), response.scripts
  );
}

function approvedReport(): NarrativeCriticReportV1 {
  return {
    schemaVersion: 'narrative-critic-report-v1',
    verdict: 'approve',
    unsupportedClaims: [],
    misleadingOmissions: [],
    scores: {
      dimensions: {
        curiosity: 4, humanTension: 4, lookingUtility: 4, naturalness: 4, progression: 4,
      },
      scenes: [
        { sceneId: 'notre-dame', score: 4, rationale: 'Clara.' },
        { sceneId: 'louvre', score: 4, rationale: 'Clara.' },
        { sceneId: 'palais-royal', score: 4, rationale: 'Clara.' },
      ],
    },
    premiumReadiness: 4,
    repairInstructions: [],
  };
}

function tags(quantization = 'Q4_K_M') {
  return { data: { models: [{
    name: NARRATIVE_CRITIC_MODEL_V1,
    model: NARRATIVE_CRITIC_MODEL_V1,
    digest: DIGEST,
    size: 7_556_508_396,
    details: {
      format: 'gguf', family: 'gemma4', parameter_size: '11.9B',
      quantization_level: quantization,
    },
  }] } };
}

describe('Gemma narrative critic v1 boundary', () => {
  it('resolves the exact local Q4 model and retains its Ollama digest', async () => {
    const get = jest.fn(async () => tags());

    const model = await inspectNarrativeCriticModelV1({
      ollamaHost: 'http://windows-host:11434/', get,
    });

    expect(get).toHaveBeenCalledWith('http://windows-host:11434/api/tags');
    expect(model).toEqual({
      name: NARRATIVE_CRITIC_MODEL_V1,
      digest: DIGEST,
      parameterSize: '11.9B',
      quantizationLevel: 'Q4_K_M',
      sizeBytes: 7_556_508_396,
    });
  });

  it('submits one schema-constrained 16K, seed-fixed, no-thinking critique', async () => {
    const get = jest.fn(async () => tags());
    const post = jest.fn(async (_url: string, _body: Record<string, unknown>) => ({
      data: { message: { content: JSON.stringify(approvedReport()) } },
    }));
    const model = await inspectNarrativeCriticModelV1({
      ollamaHost: 'http://windows-host:11434', get,
    });

    const result = await requestNarrativeCritiqueV1(criticInput(), model, {
      ollamaHost: 'http://windows-host:11434', post,
    });

    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0][0]).toBe('http://windows-host:11434/api/chat');
    expect(post.mock.calls[0][1]).toMatchObject({
      model: NARRATIVE_CRITIC_MODEL_V1,
      stream: false,
      think: false,
      format: { type: 'object', additionalProperties: false },
      options: { temperature: 0, seed: 42, num_ctx: 16_384 },
    });
    expect(result).toMatchObject({
      status: 'valid', value: { verdict: 'approve' }, modelDigest: DIGEST,
    });
  });

  it('rejects a missing or non-Q4 critic before sending narrative text', async () => {
    await expect(inspectNarrativeCriticModelV1({
      get: jest.fn(async () => ({ data: { models: [] } })),
    })).rejects.toThrow('gemma4:12b is not installed');

    await expect(inspectNarrativeCriticModelV1({
      get: jest.fn(async () => tags('Q8_0')),
    })).rejects.toThrow('must use a Q4 quantization');
  });

  it('fails closed after persistent malformed JSON', async () => {
    const model = await inspectNarrativeCriticModelV1({ get: jest.fn(async () => tags()) });
    const post = jest.fn(async () => ({ data: { message: { content: '{' } } }));

    const result = await requestNarrativeCritiqueV1(criticInput(), model, { post });

    expect(post).toHaveBeenCalledTimes(2);
    expect(result).toMatchObject({ status: 'malformed_response', value: null });
  });
});
