import { EditorialCandidate, EditorialCandidateSet } from './EditorialCandidate';
import {
  EDITORIAL_BENCHMARK_PROVIDERS,
  EditorialBenchmarkPost,
  assertSafeEditorialBenchmarkInput,
  buildEditorialBenchmarkMessages,
  calculateDeepSeekCost,
  essentialSetJaccard,
  evaluateEditorialBenchmarkCase,
  requestEditorialBenchmarkBrief,
} from './EditorialCuratorBenchmark';
import { LoadedEditorialEvaluationCase } from './EditorialEvaluationManifest';
import {
  EditorialRouteBriefRequest,
  ROUTE_EDITORIAL_SCHEMA_VERSION,
  TourEditorialBrief,
} from './EditorialRouteBrief';

function request(): EditorialRouteBriefRequest {
  return {
    city: 'Test City',
    theme: 'history',
    language: 'en',
    requestedDuration: 120,
    candidates: Array.from({ length: 5 }, (_, index) => ({
      canonicalId: `Q${index + 1}`,
      localName: `Place ${index + 1}`,
      category: 'other',
      fameScore: 30 - index,
      facts: [
        { id: `Q${index + 1}:observable`, kind: 'observable' as const, value: 'Visible stone facade' },
        { id: `Q${index + 1}:claim`, kind: 'claim' as const, value: `inception: ${1800 + index}` },
      ],
    })),
  };
}

function validBrief(input = request()): TourEditorialBrief {
  return {
    schemaVersion: ROUTE_EDITORIAL_SCHEMA_VERSION,
    promise: 'Trace the city through its defining landmarks.',
    centralQuestion: 'How did the city become visible?',
    arc: ['opening', 'power', 'resolution'],
    candidateAssessments: input.candidates.map((candidate, index) => ({
      canonicalId: candidate.canonicalId,
      paidValueScore: 90 - index,
      inclusion: index < 4 ? 'essential' : 'supporting',
      recommendedRole: index === 0 ? 'opening' : index === 1 ? 'power' : index === 2 ? 'resolution' : null,
      uniqueContribution: `Contribution ${index + 1}`,
      reason: `Reason ${index + 1}`,
      evidenceIds: [candidate.facts[0].id],
    })),
  };
}

function ollamaResponse(brief: unknown): unknown {
  return {
    model: 'qwen2.5:14b',
    message: { role: 'assistant', content: JSON.stringify(brief) },
    prompt_eval_count: 100,
    eval_count: 50,
  };
}

function deepSeekResponse(brief: unknown): unknown {
  return {
    system_fingerprint: 'fp-test',
    choices: [{
      message: {
        reasoning_content: 'must never be persisted',
        tool_calls: [{
          function: {
            name: 'submit_route_editorial_brief',
            arguments: JSON.stringify(brief),
          },
        }],
      },
    }],
    usage: {
      prompt_tokens: 100,
      completion_tokens: 50,
      prompt_cache_hit_tokens: 40,
      prompt_cache_miss_tokens: 60,
    },
  };
}

describe('editorial curator benchmark providers', () => {
  it('parses an Ollama JSON response', async () => {
    const input = request();
    const post = jest.fn<ReturnType<EditorialBenchmarkPost>, Parameters<EditorialBenchmarkPost>>()
      .mockResolvedValue({ data: ollamaResponse(validBrief(input)) });

    const result = await requestEditorialBenchmarkBrief(
      input,
      EDITORIAL_BENCHMARK_PROVIDERS['ollama-qwen'],
      { post }
    );

    expect(result.status).toBe('valid');
    expect(result.brief?.candidateAssessments).toHaveLength(5);
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('parses strict DeepSeek tool arguments without retaining reasoning content', async () => {
    const input = request();
    const post = jest.fn<ReturnType<EditorialBenchmarkPost>, Parameters<EditorialBenchmarkPost>>()
      .mockResolvedValue({ data: deepSeekResponse(validBrief(input)) });

    const result = await requestEditorialBenchmarkBrief(
      input,
      EDITORIAL_BENCHMARK_PROVIDERS['deepseek-flash-thinking-high'],
      { post, apiKey: 'secret-test-key' }
    );

    expect(result.status).toBe('valid');
    expect(result.attempts[0].systemFingerprint).toBe('fp-test');
    expect(result.totalCostUsd).toBe(calculateDeepSeekCost({
      promptTokens: 100,
      completionTokens: 50,
      cacheHitPromptTokens: 40,
      cacheMissPromptTokens: 60,
    }));
    const body = post.mock.calls[0][1] as Record<string, unknown>;
    expect(body).not.toHaveProperty('tool_choice');
    expect(JSON.stringify(body)).toContain('"strict":true');
    expect(JSON.stringify(result)).not.toContain('must never be persisted');
    expect(JSON.stringify(result)).not.toContain('secret-test-key');
  });

  it('retries transport and malformed output once', async () => {
    const input = request();
    const transportPost = jest.fn<ReturnType<EditorialBenchmarkPost>, Parameters<EditorialBenchmarkPost>>()
      .mockRejectedValueOnce(new Error('temporary network error'))
      .mockResolvedValueOnce({ data: ollamaResponse(validBrief(input)) });
    const malformedPost = jest.fn<ReturnType<EditorialBenchmarkPost>, Parameters<EditorialBenchmarkPost>>()
      .mockResolvedValueOnce({ data: { model: 'qwen2.5:14b', message: { content: '' } } })
      .mockResolvedValueOnce({ data: ollamaResponse(validBrief(input)) });

    const transport = await requestEditorialBenchmarkBrief(
      input,
      EDITORIAL_BENCHMARK_PROVIDERS['ollama-qwen'],
      { post: transportPost }
    );
    const malformed = await requestEditorialBenchmarkBrief(
      input,
      EDITORIAL_BENCHMARK_PROVIDERS['ollama-qwen'],
      { post: malformedPost }
    );

    expect(transport.status).toBe('valid');
    expect(transport.attempts.map((attempt) => attempt.status)).toEqual(['transport_error', 'valid']);
    expect(malformed.status).toBe('valid');
    expect(malformed.attempts.map((attempt) => attempt.status)).toEqual(['malformed_response', 'valid']);
  });

  it('does not retry a semantic validation error', async () => {
    const input = request();
    const invalid = validBrief(input);
    invalid.candidateAssessments[0].canonicalId = 'Q999';
    const post = jest.fn<ReturnType<EditorialBenchmarkPost>, Parameters<EditorialBenchmarkPost>>()
      .mockResolvedValue({ data: ollamaResponse(invalid) });

    const result = await requestEditorialBenchmarkBrief(
      input,
      EDITORIAL_BENCHMARK_PROVIDERS['ollama-qwen'],
      { post }
    );

    expect(result.status).toBe('semantic_error');
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('accounts for malformed DeepSeek output without retaining reasoning', async () => {
    const response = deepSeekResponse(validBrief()) as {
      choices: Array<{ message: Record<string, unknown> }>;
    };
    response.choices[0].message = {
      reasoning_content: 'private reasoning',
      content: '{}',
    };
    const post = jest.fn<ReturnType<EditorialBenchmarkPost>, Parameters<EditorialBenchmarkPost>>()
      .mockResolvedValue({ data: response });

    const result = await requestEditorialBenchmarkBrief(
      request(),
      EDITORIAL_BENCHMARK_PROVIDERS['deepseek-flash-thinking-high'],
      { post, apiKey: 'secret-test-key' }
    );

    expect(result.status).toBe('malformed_response');
    expect(result.attempts).toHaveLength(2);
    expect(result.totalCostUsd).toBeGreaterThan(0);
    expect(result.attempts[0].rawOutput).toBe('{}');
    expect(JSON.stringify(result)).not.toContain('private reasoning');
  });

  it('redacts the API key from transport failures', async () => {
    const secret = 'secret-test-key';
    const post = jest.fn<ReturnType<EditorialBenchmarkPost>, Parameters<EditorialBenchmarkPost>>()
      .mockRejectedValue(new Error(`request failed with ${secret}`));

    const result = await requestEditorialBenchmarkBrief(
      request(),
      EDITORIAL_BENCHMARK_PROVIDERS['deepseek-flash-nonthinking'],
      { post, apiKey: secret }
    );

    expect(result.status).toBe('transport_error');
    expect(JSON.stringify(result)).not.toContain(secret);
    expect(result.attempts[0].error).toContain('[REDACTED]');
  });

  it('uses identical prompts and rejects forbidden provider input fields', () => {
    const input = request();
    const first = buildEditorialBenchmarkMessages(input);
    const second = buildEditorialBenchmarkMessages(input);
    const unsafe = {
      ...input,
      candidates: [{ ...input.candidates[0], coordinates: { lat: 1, lng: 2 } }],
    } as unknown as EditorialRouteBriefRequest;

    expect(first).toEqual(second);
    expect(() => assertSafeEditorialBenchmarkInput(unsafe)).toThrow('forbidden fields');
  });
});

describe('editorial benchmark evaluation', () => {
  const candidates: EditorialCandidate[] = Array.from({ length: 5 }, (_, index) => ({
    canonicalId: `Q${index + 1}`,
    clusterId: `Q${index + 1}`,
    memberCanonicalIds: [`Q${index + 1}`],
    localName: `Place ${index + 1}`,
    category: 'other',
    coordinates: { lat: 40 + (index * 0.001), lng: -3 },
    fameScore: 30 - index,
    themeScore: 80,
    firstVisitScore: 90 - index,
    evidenceScore: 90,
    observableScore: 80,
    tier: index < 4 ? 'essential' : 'supporting',
    eligibleRoles: ['opening', 'power', 'resolution'],
    evidenceFacts: [
      {
        id: `Q${index + 1}:observable`,
        source: 'osm',
        sourceId: `node:${index + 1}`,
        kind: 'observable',
        value: 'Visible stone facade',
        observable: true,
      },
      ...Array.from({ length: 3 }, (_, factIndex) => ({
        id: `Q${index + 1}:claim:${factIndex}`,
        source: 'wikidata' as const,
        sourceId: `Q${index + 1}`,
        kind: 'claim' as const,
        value: `Historical claim ${factIndex}`,
        observable: false,
      })),
    ],
  }));
  const candidateSet: EditorialCandidateSet = { candidates, rejected: [] };
  const evaluationCase: LoadedEditorialEvaluationCase = {
    id: 'madrid-test-120',
    scope: 'calibration',
    city: 'Madrid',
    theme: 'history',
    language: 'en',
    durationMinutes: 120,
    oracleFile: 'unused.json',
    oracle: {
      city: 'Madrid',
      theme: 'history',
      language: 'en',
      durationMinutes: 120,
      purpose: 'test',
      stops: candidates.map((candidate) => ({ qid: candidate.canonicalId, name: candidate.localName })),
    },
  };

  it('calculates route gates deterministically', () => {
    const brief = validBrief();
    const first = evaluateEditorialBenchmarkCase(evaluationCase, candidateSet, brief);
    const second = evaluateEditorialBenchmarkCase(evaluationCase, candidateSet, brief);

    expect(first).toEqual(second);
    expect(first.gates.passed).toBe(true);
    expect(first.routeOracleIds).toHaveLength(5);
    expect(first.actualDuration).toBeLessThanOrEqual(120);
  });

  it('measures essential-set stability with Jaccard', () => {
    const left = validBrief();
    const right = validBrief();
    right.candidateAssessments[3].inclusion = 'supporting';
    right.candidateAssessments[4].inclusion = 'essential';

    expect(essentialSetJaccard(left, right)).toBe(0.6);
  });
});
