import 'dotenv/config';
import axios from 'axios';
import { readFileSync, writeFileSync, appendFileSync, mkdtempSync } from 'fs';
import { resolve, join } from 'path';
import { createHash } from 'crypto';
import { strict as assert } from 'assert';
import { researchNarrativeStopV8, NarrativeCuratorPacketV8 } from '../../src/services/poi/NarrativeResearchV8';
import { createNarrativeReferenceServicesV8 } from '../../src/services/poi/NarrativeReferencesV8';
import { curatorServiceV8 } from './narrative-user-canary-v8';
import { NarrativeProgressSpendGuardV6 } from '../../src/services/poi/NarrativeProgressSpendGuardV6';
import { evaluateNarrativeRichnessV8 } from '../../src/services/poi/NarrativeRichnessV8';
import { EditorialProgressEventV6 } from '../../src/services/poi/EditorialStructuredLlmV6';

// Single-stop comparison. Initial Wikipedia and curator output are frozen;
// only reference acquisition and at most one new curator API attempt are live.
export async function main(args = process.argv.slice(2)): Promise<void> {
  const sourceArg = args.find(a => a.startsWith('--source='))?.slice(9);
  const stopId = args.find(a => a.startsWith('--stop-id='))?.slice(10);
  const execute = args.includes('--execute');
  const replayPath = args.find(a => a.startsWith('--replay='))?.slice(9);
  if (!sourceArg || !stopId || args.some(a => a !== '--execute' && !a.startsWith('--source=') && !a.startsWith('--stop-id=') && !a.startsWith('--replay='))) throw new Error('Use --source=canary-directory --stop-id=QID [--execute] [--replay=probe-directory]');
  const source = resolve(sourceArg);
  const checkpointPath = join(source, 'checkpoint.private.json');
  const raw = readFileSync(checkpointPath);
  const sourceHash = createHash('sha256').update(raw).digest('hex');
  const replay = replayPath ? JSON.parse(readFileSync(resolve(replayPath, 'result.private.json'), 'utf8')) : null;
  const replaySummary = replayPath ? JSON.parse(readFileSync(resolve(replayPath, 'summary.private.json'), 'utf8')) : null;
  if (replaySummary) assert(replaySummary.sourceHash === sourceHash && replaySummary.stopId === stopId, 'replay inputs do not match');
  const checkpoint = JSON.parse(raw.toString());
  const request = JSON.parse(readFileSync(join(source, 'review.json'), 'utf8')).request;
  const saved = checkpoint.research.find((r: { entityQid: string }) => r.entityQid === stopId);
  const stop = checkpoint.route.stops.find((s: { wikidataId: string }) => s.wikidataId === stopId);
  const target = checkpoint.narrationTargets.find((t: { stopId: string }) => t.stopId === stopId);
  const events = readFileSync(join(source, 'progress.private.jsonl'), 'utf8').split('\n').filter(Boolean).map(line => JSON.parse(line))
    .filter(e => e.phase === 'curator' && e.callId?.endsWith(stopId) && e.event === 'attempt_finished');
  assert(saved && stop && target && events.length >= 1, 'missing frozen inputs');
  const seed = saved.result.captures.find((c: { sourceKind: string }) => c.sourceKind === 'wikipedia_api');
  assert(seed, 'missing Wikipedia seed');
  const frozenRound = JSON.parse(events[0].diagnostic.rawOutput);
  const directory = mkdtempSync(resolve('tmp/narrative-v8/reference-probe-'));
  const save = (name: string, value: unknown) => writeFileSync(join(directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  console.log(JSON.stringify({ directory, execute, stopId, spendLimitUsd: 0.15 }));
  const guard = new NarrativeProgressSpendGuardV6({ limitUsd: 0.15, historicalSpendUsd: replaySummary?.budget.spentUsd ?? 0, path: join(directory, 'spend.private.jsonl') });
  let paidAttempts = 0;
  let completedPaidCurations = 0;
  let curationError: string | null = null;
  const onProgress = (event: EditorialProgressEventV6) => {
    if (event.event === 'attempt_started' && ++paidAttempts > 1) throw new Error('probe_allows_one_paid_attempt');
    guard.record(event);
    appendFileSync(join(directory, 'progress.private.jsonl'), JSON.stringify(event) + '\n', { mode: 0o600 });
  };
  let liveCurator: Awaited<ReturnType<typeof curatorServiceV8>> | null = null;
  if (execute) {
    const key = process.env.OPENROUTER_API_KEY?.trim();
    assert(key, 'OPENROUTER_API_KEY missing');
    const model = 'openai/gpt-5.4-mini';
    const response = await axios.get('https://openrouter.ai/api/v1/models/' + model + '/endpoints', { timeout: 15_000 });
    const endpoints = response.data?.data?.endpoints;
    assert(Array.isArray(endpoints) && endpoints.length, 'no endpoint pricing');
    const rates = endpoints.map((e: { pricing: { prompt: string; completion: string; request?: string } }) => ({
      inputUsdPerToken: Number(e.pricing.prompt), outputUsdPerToken: Number(e.pricing.completion), requestUsd: Number(e.pricing.request ?? 0),
    }));
    assert(rates.every(r => Object.values(r).every(n => Number.isFinite(n) && n >= 0)), 'invalid pricing');
    const pricing = { inputUsdPerToken: Math.max(...rates.map(r => r.inputUsdPerToken)), outputUsdPerToken: Math.max(...rates.map(r => r.outputUsdPerToken)), requestUsd: Math.max(...rates.map(r => r.requestUsd)) };
    save('pricing.private.json', pricing);
    liveCurator = await curatorServiceV8({ apiKey: '', openRouterApiKey: key, openRouterPricing: { [model]: pricing },
      profile: 'qwen38_hybrid', runId: directory.split('/').pop()!, onProgress, maxTokens: 6_000 });
  }
  const references = createNarrativeReferenceServicesV8({
    firecrawlBaseUrl: process.env.FIRECRAWL_BASE_URL?.trim() || 'http://127.0.0.1:3007/v2',
    searxngBaseUrl: process.env.SEARXNG_BASE_URL?.trim() || 'http://127.0.0.1:18081',
    apiKey: process.env.FIRECRAWL_API_KEY?.trim() || undefined,
  });
  let rounds = 0;
  const started = Date.now();
  const result = await researchNarrativeStopV8({
    runId: directory.split('/').pop()!, stopId, stopName: stop.name,
    cityName: checkpoint.run.city, cityQid: checkpoint.run.cityQid, countryCode: request.countryCode, language: checkpoint.run.language,
    required: checkpoint.core.requiredIds.includes(stopId), narrationTarget: target,
  }, {
    resolveIdentity: async () => ({ qid: stopId, labels: [stop.name], aliases: [], wikipediaTitle: seed.title,
      wikipediaLanguage: new URL(seed.finalUrl).hostname.split('.')[0], revision: seed.wikimediaRevision }),
    resolveAuthorities: async () => ({ labels: [stop.name], aliases: [], authorities: saved.result.authorities ?? [] }),
    resolveQidFromWikipedia: async () => stopId,
    captureWikipedia: async () => seed,
    captureWeb: async () => { throw new Error('probe_does_not_recapture_initial_P856'); },
    references: { ...references, load: async input => {
      const html = replayPath ? JSON.parse(readFileSync(resolve(replayPath, 'reference-html.private.json'), 'utf8')).html : await references.load(input);
      save('reference-html.private.json', { html }); return html;
    }, capture: async input => {
      const capture = replay ? replay.captures.find((c: { requestedUrl: string }) => c.requestedUrl === input.url) : await references.capture(input);
      if (!capture) throw new Error('replayed_capture_failure');
      save('capture-' + capture.sourceId + '.private.json', capture); return capture;
    }, ...(replay ? { search: async () => [] } : {}) },
    // This probe deliberately excludes broad discovery and any local Qwen planner.
    search: async () => [], mapOfficialSite: async () => [],
    curate: async (packet: NarrativeCuratorPacketV8) => {
      rounds += 1;
      save('packet-' + rounds + '.private.json', packet);
      if (rounds === 1) return frozenRound;
      assert(rounds === 2, 'unexpected third curator');
      try {
        const output = liveCurator ? await liveCurator(packet) : frozenRound;
        if (liveCurator) completedPaidCurations += 1;
        save('curator-2.private.json', output);
        return output;
      } catch (error) {
        curationError = error instanceof Error ? error.message : String(error);
        save('curator-error.private.json', { error: curationError });
        throw error;
      }
    },
  });
  guard.assertSettled();
  assert.equal(createHash('sha256').update(readFileSync(checkpointPath)).digest('hex'), sourceHash, 'original changed');
  save('result.private.json', result);
  const summary = {
    stopId, mode: execute ? 'one-live-curation' : 'acquisition-only',
    sourceHash, seedFingerprint: seed.fingerprint,
    replayPath: replayPath ?? null, reusedAcquisitionMs: replaySummary?.after.stats.referenceExpansion?.elapsedMs ?? null,
    completedPaidCurations, curationError,
    caveat: 'Original aliases were not persisted. Both arms use the saved stop name; broad discovery disabled in this focused probe.',
    before: { status: saved.result.status, gates: saved.result.gates, captures: saved.result.captures.length,
      curatorCalls: saved.result.stats.curationCount, searchQueries: saved.result.stats.searchQueries,
      richness: evaluateNarrativeRichnessV8(saved.result.dossier, target, { writerReady: saved.result.gates.writerReady }),
      curatorCostUsd: events.reduce((sum, e) => sum + (e.diagnostic.usage?.costUsd ?? 0), 0) },
    after: { status: result.status, gates: 'gates' in result ? result.gates : null, stats: result.stats,
      richness: 'dossier' in result && result.dossier ? evaluateNarrativeRichnessV8(result.dossier, target, { writerReady: result.gates.writerReady }) : null,
      sources: result.captures.map(c => ({ url: c.finalUrl, chars: c.content.length, authority: c.authority, provenance: c.referenceProvenance })) },
    elapsedMs: Date.now() - started, paidAttempts, budget: guard.snapshot(),
  };
  save('summary.private.json', summary);
  console.log(JSON.stringify({ directory, before: { gates: summary.before.gates, sources: summary.before.captures, costUsd: summary.before.curatorCostUsd },
    after: { gates: summary.after.gates, expansion: result.stats.referenceExpansion, sources: summary.after.sources, cards: summary.after.richness?.supportedCardCount },
    elapsedMs: summary.elapsedMs, paidAttempts, budget: summary.budget }, null, 2));
  if (execute && rounds >= 2 && completedPaidCurations !== 1) throw new Error(curationError ?? 'probe_did_not_complete_live_curation');
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
