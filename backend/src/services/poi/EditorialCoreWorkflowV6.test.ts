import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  replayCanonicalCoreResolutionV6,
  runCanonicalCoreResolutionV6,
} from './EditorialCoreWorkflowV6';
import { CoreAuditRequestV6 } from './EditorialCoreResolverV6';
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

describe('canonical core audit workflow v6', () => {
  it('runs three frozen permutations, persists full responses, and replays exactly', async () => {
    const { entities, prominence } = fixture();
    const required = new Set(['Q1', 'Q2', 'Q3', 'Q4', 'Q5', 'Q6', 'Q7']);
    const post = jest.fn(async (_url: string, body: Record<string, unknown>) => {
      const request = requestFromBody(body);
      const toolName = ((body.tools as any[])[0].function.name) as string;
      return response(toolName, audit(request, required));
    });

    const result = await runCanonicalCoreResolutionV6(
      entities, prominence,
      { cityKey: 'madrid', theme: 'history', durationMinutes: 120 },
      { kind: 'deepseek', model: 'deepseek-v4-flash' },
      { apiKey: 'test-key', post, createdAt: '2026-08-07T01:00:00.000Z' }
    );

    expect(result.status).toBe('approved');
    expect(post).toHaveBeenCalledTimes(3);
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
    expect(semanticPost).toHaveBeenCalledTimes(2);
  });
});
