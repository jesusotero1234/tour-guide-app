import {
  NARRATIVE_CRITIC_DIGEST_V4,
  NARRATIVE_CRITIC_KEEP_ALIVE_V4,
  NARRATIVE_CRITIC_MODEL_V4,
  prepareNarrativeCriticV4,
  requestNarrativeGroundingCritiqueV4,
} from './NarrativePilotGemmaV4';
import { buildNarrativeClaimPlanV4 } from './NarrativeClaimPlanV4';
import { buildNarrativeGroundingCriticRequestV4 } from './NarrativeCriticV4';
import { loadMadridNarrativeEvidenceCaseV4 } from './NarrativeMadridEvidenceV4';

function tagged(digest: string = NARRATIVE_CRITIC_DIGEST_V4) {
  return { models: [{
    name: NARRATIVE_CRITIC_MODEL_V4,
    digest,
    size: 8_500,
    details: { parameter_size: '12B', quantization_level: 'Q4_K_M' },
  }] };
}

function loaded(options: { digest?: string; sizeVram?: number; present?: boolean } = {}) {
  return { models: options.present === false ? [] : [{
    name: NARRATIVE_CRITIC_MODEL_V4,
    digest: options.digest ?? NARRATIVE_CRITIC_DIGEST_V4,
    size: 8_500,
    size_vram: options.sizeVram ?? 8_500,
  }] };
}

describe('NarrativePilotGemmaV4 lifecycle', () => {
  it('checks tags, warms with 60m keep-alive, then verifies exact digest and full GPU load', async () => {
    const get = jest.fn(async (url: string) => ({
      data: url.endsWith('/api/tags') ? tagged() : loaded(),
    }));
    const post = jest.fn(async () => ({ data: { response: 'OK' } }));
    const lifecycle = await prepareNarrativeCriticV4({ get, post });

    expect(get.mock.calls.map(([url]) => url)).toEqual([
      'http://localhost:11434/api/tags',
      'http://localhost:11434/api/ps',
    ]);
    expect(post).toHaveBeenCalledWith(
      'http://localhost:11434/api/generate',
      expect.objectContaining({ model: NARRATIVE_CRITIC_MODEL_V4, keep_alive: '60m' }),
      { 'Content-Type': 'application/json' }
    );
    expect(lifecycle.model).toMatchObject({
      digest: NARRATIVE_CRITIC_DIGEST_V4,
      quantizationLevel: 'Q4_K_M',
      fullyGpu: true,
    });
    expect(NARRATIVE_CRITIC_KEEP_ALIVE_V4).toBe('60m');
  });

  it('fails closed on the wrong digest or a partial CPU load', async () => {
    await expect(prepareNarrativeCriticV4({
      get: jest.fn(async (url: string) => ({
        data: url.endsWith('/api/tags') ? tagged('f'.repeat(64)) : loaded(),
      })),
      post: jest.fn(async () => ({ data: {} })),
    })).rejects.toThrow('locked digest');

    await expect(prepareNarrativeCriticV4({
      get: jest.fn(async (url: string) => ({
        data: url.endsWith('/api/tags') ? tagged() : loaded({ sizeVram: 4_000 }),
      })),
      post: jest.fn(async () => ({ data: {} })),
    })).rejects.toThrow('fully loaded on GPU');
  });

  it('reloads once when Gemma disappears between critiques and verifies GPU again', async () => {
    const ps = [loaded(), loaded({ present: false }), loaded()];
    const get = jest.fn(async (url: string) => ({
      data: url.endsWith('/api/tags') ? tagged() : ps.shift(),
    }));
    const post = jest.fn(async () => ({ data: { response: 'OK' } }));
    const lifecycle = await prepareNarrativeCriticV4({ get, post });

    await expect(lifecycle.ensureResident()).resolves.toMatchObject({ fullyGpu: true });
    expect(post).toHaveBeenCalledTimes(2);
    expect(ps).toHaveLength(0);
  });

  it('does not turn a wrong digest or repeat disappearance into content rejection', async () => {
    const wrongDigestPs = [loaded(), loaded({ digest: 'a'.repeat(64) })];
    const getWrong = jest.fn(async (url: string) => ({
      data: url.endsWith('/api/tags') ? tagged() : wrongDigestPs.shift(),
    }));
    const lifecycleWrong = await prepareNarrativeCriticV4({
      get: getWrong,
      post: jest.fn(async () => ({ data: {} })),
    });
    await expect(lifecycleWrong.ensureResident()).rejects.toThrow('locked digest');

    const missingPs = [loaded(), loaded({ present: false }), loaded({ present: false })];
    const getMissing = jest.fn(async (url: string) => ({
      data: url.endsWith('/api/tags') ? tagged() : missingPs.shift(),
    }));
    const lifecycleMissing = await prepareNarrativeCriticV4({
      get: getMissing,
      post: jest.fn(async () => ({ data: {} })),
    });
    await expect(lifecycleMissing.ensureResident()).rejects.toThrow('not resident after one reload');
  });

  it('retries an invalid critic reference as protocol and sends keep-alive on every critique', async () => {
    const evidence = loadMadridNarrativeEvidenceCaseV4();
    const clean = {
      schemaVersion: 'narrative-grounding-critic-report-v4',
      unsupportedClaims: [], improperCausality: [], unsupportedInterpretations: [],
      meaningChangingOmissions: [],
    };
    const invalid = {
      ...clean,
      improperCausality: [{
        sceneId: 'palace', claimId: 'missing', detail: 'Referencia inválida.',
      }],
    };
    const responses = [invalid, clean];
    const post = jest.fn(async (_url: string, _body: Record<string, unknown>) => ({
      data: { message: { content: JSON.stringify(responses.shift()) } },
    }));
    const model = {
      name: NARRATIVE_CRITIC_MODEL_V4,
      digest: NARRATIVE_CRITIC_DIGEST_V4,
      parameterSize: '12B',
      quantizationLevel: 'Q4_K_M' as const,
      sizeBytes: 8_500,
      sizeVramBytes: 8_500,
      fullyGpu: true as const,
    };
    const result = await requestNarrativeGroundingCritiqueV4(
      buildNarrativeGroundingCriticRequestV4(evidence, buildNarrativeClaimPlanV4(evidence)),
      {
        model,
        options: { post },
        ensureResident: jest.fn(async () => model),
      }
    );

    expect(result.status).toBe('valid');
    expect(result.attempts.map((attempt) => attempt.status)).toEqual(['semantic_error', 'valid']);
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls.every(([, body]) => body.keep_alive === '60m')).toBe(true);
  });
});
