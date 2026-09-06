import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  replayCanonicalCoreResolutionV6,
  runCanonicalCoreResolutionV6,
} from './EditorialCoreWorkflowV6';
import { CoreAuditRequestV6, CORE_RESOLVER_SYSTEM_PROMPT_V6 } from './EditorialCoreResolverV6';
import { WikimediaProminenceSnapshotV6 } from './EditorialProminenceV6';

function entity(index: number): EditorialEntityCandidateV5 {
  const canonicalId = `Q${index}`;
  return {
    canonicalId, siteId: `site:${canonicalId}`, sourceIds: [`node:${index}`],
    localName: `Candidate ${index}`, category: 'memorial',
    coordinates: { lat: 40.4 + index * 0.001, lng: -3.7 },
    fameScore: 50, recognitionScore: 70,
    evidenceFacts: [{
      id: `${canonicalId}:history`, source: 'wikidata', sourceId: canonicalId,
      kind: 'claim', value: `inception: 18${index}0`, observable: false,
    }],
    readiness: {
      ready: true, observableCount: 1, contextCount: 1,
      historicalSpecificCount: 1, missing: [],
    },
    visitConflictGroup: null,
  };
}

function fixture() {
  const entities = Array.from({ length: 10 }, (_, index) => entity(index + 1));
  const prominence: WikimediaProminenceSnapshotV6 = {
    schemaVersion: 'wikimedia-prominence-v1', cityKey: 'madrid', language: 'es',
    capturedAt: '2026-08-07T00:00:00.000Z',
    pageviewWindow: { start: '2025-08-07', end: '2026-08-06' },
    sourceRevisions: [{
      sourceId: 'eswiki:Madrid', project: 'es.wikipedia.org', title: 'Madrid',
      revisionId: 123, revisionTimestamp: '2026-08-06T00:00:00Z',
    }],
    candidates: entities.map((candidate, index) => ({
      canonicalId: candidate.canonicalId, localName: candidate.localName,
      wikipediaTitle: candidate.localName, cityWikipediaLinked: index < 7,
      wikivoyageSeeMentioned: index < 7, wikivoyageSectionTitle: index < 7 ? 'Ver' : null,
      sitelinks: 100 - index, pageviews365: 10_000 - index,
      pageviewPercentile: Number((1 - index / 10).toFixed(4)),
      heritageDesignation: false,
      support: [{
        supportId: `${candidate.canonicalId}:sitelinks`, type: 'wikidata_sitelinks',
        value: `${100 - index} sitelinks`, sourceRef: `wikidata:${candidate.canonicalId}`,
      }],
    })),
    fingerprint: 'prominence-fingerprint',
  };
  return { entities, prominence };
}

function requestFromBody(body: Record<string, unknown>): CoreAuditRequestV6 {
  const messages = body.messages as Array<{ content: string }>;
  return JSON.parse(messages[1].content.split('\n').slice(1).join('\n')) as CoreAuditRequestV6;
}

function audit(request: CoreAuditRequestV6, requiredIds: Set<string>) {
  return {
    schemaVersion: 'core-audit-v1',
    classifications: request.candidates.map((candidate) => ({
      canonicalId: candidate.canonicalId,
      classification: requiredIds.has(candidate.canonicalId) ? 'required' : 'optional',
      reasonCode: requiredIds.has(candidate.canonicalId) ? 'first_visit_expectation' : null,
      omissionReason: requiredIds.has(candidate.canonicalId)
        ? `${candidate.localName} cannot be omitted.`
        : `${candidate.localName} is supporting material.`,
      supportIds: [candidate.support[0].supportId],
    })),
  };
}

function response(toolName: string, value: unknown) {
  return { data: { choices: [{ message: { tool_calls: [{ function: {
    name: toolName, arguments: typeof value === 'string' ? value : JSON.stringify(value),
  } }] } }] } };
}

function openRouterResponse(value: unknown) {
  return {
    data: {
      model: 'openai/gpt-5.4-mini',
      choices: [{
        finish_reason: 'stop',
        message: { content: JSON.stringify(value) },
      }],
      usage: {
        prompt_tokens: 20, completion_tokens: 8, total_tokens: 28,
        cost: 0.0012,
        prompt_tokens_details: { cached_tokens: 0 },
        completion_tokens_details: { reasoning_tokens: 3 },
      },
      openrouter_metadata: {
        requested: 'openai/gpt-5.4-mini',
        strategy: 'direct',
        attempt: 1,
        endpoints: {
          total: 1,
          available: [{ provider: 'OpenAI', model: 'openai/gpt-5.4-mini', selected: true }],
        },
        attempts: [{ provider: 'OpenAI', model: 'openai/gpt-5.4-mini', status: 200 }],
        pipeline: [],
      },
    },
  };
}

describe('canonical core audit workflow v6', () => {
  it('runs three frozen permutations, persists full responses, and replays exactly', async () => {
    const { entities, prominence } = fixture();
    const required = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
    let active = 0;
    let peakActive = 0;
    const progress: string[] = [];
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      active += 1;
      peakActive = Math.max(peakActive, active);
      await new Promise((resolve) => setTimeout(resolve, 5));
      active -= 1;
      const request = requestFromBody(body);
      const toolName = ((body.tools as any[])[0].function.name) as string;
      return response(toolName, audit(request, required));
    });

    const result = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      {
        apiKey: 'test-key', post, createdAt: '2026-08-07T01:00:00.000Z',
        onProgress: (event) => progress.push(event.event),
      }
    );

    expect(result.status).toBe('approved');
    expect(post).toHaveBeenCalledTimes(3);
    expect(peakActive).toBe(3);
    expect(progress.filter((event) => event === 'attempt_started')).toHaveLength(3);
    expect(progress.filter((event) => event === 'attempt_finished')).toHaveLength(3);
    expect(result.snapshot.runs).toHaveLength(3);
    expect(new Set(result.snapshot.runs.map((run) => run.promptFingerprint)).size).toBe(1);
    expect(result.snapshot.runs.every((run) => (
      run.status === 'valid' && run.rawOutput !== null && run.responseFingerprint !== null
    ))).toBe(true);
    expect(result.snapshot.runs.every((run) => run.inputCharacters <= 18_000)).toBe(true);
    expect(result.snapshot.runs.every((run) => run.schemaCharacters <= 8_000)).toBe(true);

    const replay = replayCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      result.snapshot
    );
    expect(replay).toEqual(result);
  });

  it('approves the unanimous required intersection and exposes disputed IDs in audit', async () => {
    const { entities, prominence } = fixture();
    let call = 0;
    const sets = [new Set(['Q1', 'Q2']), new Set(['Q1']), new Set(['Q1', 'Q2'])];
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      const toolName = ((body.tools as any[])[0].function.name) as string;
      return response(toolName, audit(request, sets[call++]));
    });

    const result = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      { apiKey: 'test-key', post }
    );

    expect(result.status).toBe('approved');
    expect(result.coreResult?.status).toBe('approved');
    if (result.coreResult?.status !== 'approved') throw new Error('Expected approved core');
    expect(result.coreResult.core.requirements.map((requirement) => requirement.canonicalId).sort())
      .toEqual(['Q1']);
    expect(result.coreResult.core.audit.disputedCanonicalIds).toEqual(['Q2']);

    const replay = replayCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      result.snapshot
    );
    expect(replay).toEqual(result);
  });

  it('retries malformed JSON once and retries semantic violations once', async () => {
    const { entities, prominence } = fixture();
    const required = new Set(['Q1', 'Q2']);
    let malformedCalls = 0;
    const malformedPost = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      const toolName = ((body.tools as any[])[0].function.name) as string;
      malformedCalls += 1;
      return malformedCalls === 1
        ? response(toolName, '{bad json')
        : response(toolName, audit(request, required));
    });
    const recovered = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      { apiKey: 'test-key', post: malformedPost }
    );
    expect(recovered.status).toBe('approved');
    expect(malformedPost).toHaveBeenCalledTimes(4);

    const semanticPost = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      const invalid = audit(request, required);
      invalid.classifications[0].supportIds = ['invented'];
      const toolName = ((body.tools as any[])[0].function.name) as string;
      return response(toolName, invalid);
    });
    const rejected = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      { apiKey: 'test-key', post: semanticPost }
    );
    expect(rejected.status).toBe('core_review_required');
    expect(rejected.reason).toMatch(/semantic/i);
    expect(semanticPost).toHaveBeenCalledTimes(6);
  });

  it('normalizes OpenRouter QID-keyed core-audit responses and reaches approved consensus', async () => {
    const { entities, prominence } = fixture();
    const required = new Set(['Q1', 'Q2']);
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      const auditResult = audit(request, required);
      const wireValue = {
        schemaVersion: auditResult.schemaVersion,
        classifications: Object.fromEntries(
          auditResult.classifications.map((c) => {
            const { canonicalId, ...rest } = c;
            return [canonicalId, rest];
          })
        ),
      };
      return openRouterResponse(wireValue);
    });

    const result = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'openrouter', model: 'openai/gpt-5.4-mini', expectedProviderName: 'OpenAI', acceptedModels: ['openai/gpt-5.4-mini'] },
      { openRouterApiKey: 'test-key', post }
    );

    expect(result.status).toBe('approved');
    expect(result.coreResult?.status).toBe('approved');
    if (result.coreResult?.status !== 'approved') throw new Error('Expected approved core');
    expect(result.coreResult.core.requirements.map((requirement) => requirement.canonicalId).sort())
      .toEqual(['Q1', 'Q2']);

    const replay = replayCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      result.snapshot
    );
    expect(replay).toEqual(result);
  });

  it('handles missing Wikivoyage signals with null surviving and unknown-not-negative prompt', async () => {
    const { entities } = fixture();
    const prominence: WikimediaProminenceSnapshotV6 = {
      ...fixture().prominence,
      candidates: fixture().prominence.candidates.map((candidate) => ({
        ...candidate,
        wikivoyageSeeMentioned: null,
        wikivoyageSectionTitle: null,
        support: candidate.support.filter((s) => s.type !== 'wikivoyage_see_mention'),
      })),
    };
    const required = new Set(['Q1', 'Q2', 'Q3']);
    let capturedSystem: string | null = null;
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      expect(request.candidates.every(candidate => candidate.signals.wikivoyageSee === null)).toBe(true);
      capturedSystem = (body.messages as Array<{ content: string }>)[0].content;
      const result = audit(request, required);
      return openRouterResponse({ schemaVersion: result.schemaVersion, classifications: Object.fromEntries(
        result.classifications.map(({ canonicalId, ...classification }) => [canonicalId, classification])
      ) });
    });

    const result = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'openrouter', model: 'openai/gpt-5.4-mini', expectedProviderName: 'OpenAI', acceptedModels: ['openai/gpt-5.4-mini'] },
      { openRouterApiKey: 'test-key', post }
    );

    expect(result.status).toBe('approved');
    expect(post).toHaveBeenCalledTimes(3);
    expect(capturedSystem).toContain('unknown');
    expect(capturedSystem).toContain('not a negative signal');

    const replay = replayCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      result.snapshot
    );
    expect(replay).toEqual(result);
  });

  it('uses exactly CORE_RESOLVER_SYSTEM_PROMPT_V6 for boolean fixture and replays exactly', async () => {
    const { entities, prominence } = fixture();
    const required = new Set(['Q1', 'Q2']);
    let capturedSystem: string | null = null;
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      capturedSystem = (body.messages as Array<{ content: string }>)[0].content;
      const toolName = ((body.tools as any[])[0].function.name) as string;
      return response(toolName, audit(request, required));
    });

    const result = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      { apiKey: 'test-key', post }
    );

    expect(result.status).toBe('approved');
    expect(capturedSystem).toBe(CORE_RESOLVER_SYSTEM_PROMPT_V6);

    const replay = replayCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      result.snapshot
    );
    expect(replay).toEqual(result);
  });
});
