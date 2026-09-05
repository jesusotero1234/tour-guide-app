import 'dotenv/config';
import { mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { loadNarrativeWriterBenchmarkCheckpointV8, buildFrozenWriterCasesV8 } from './narrative-writer-benchmark-v8';
import { curatorServiceV8 } from './narrative-user-canary-v8';
import { retrieveNarrativeHistoricalCorpusV8 } from '../../src/services/poi/NarrativeHistoricalCorpusV8';
import { buildCuratorPacketV8 } from '../../src/services/poi/NarrativeResearchV8';
import { segmentCaptureIntoSpansV7 } from '../../src/services/poi/NarrativeSpansV7';
import { buildValidatedDossierV8, normalizeNarrativeCuratorOutputV8, assessNarrativeEvidenceGatesV8, classifyEvidenceTierV8 } from '../../src/services/poi/NarrativeDossierV8';
import { buildNarrativeDossierV6 } from '../../src/services/poi/NarrativeDossierV6';
import { buildNarrativeEvidenceBoundaryV8 } from '../../src/services/poi/NarrativeEvidenceBoundaryV8';
import { requestEditorialStructuredV6, EditorialProgressCallbackV6, EditorialProviderV6 } from '../../src/services/poi/EditorialStructuredLlmV6';
import { parseNarrativeWriterResponseV8 } from '../../src/services/poi/NarrativeWriterContractV8';
import { NarrativeProgressSpendGuardV6 } from '../../src/services/poi/NarrativeProgressSpendGuardV6';
import { assignNarrativeSentenceIdsV6 } from '../../src/services/poi/NarrativeEditorialV6';
import { verifyNarrativeCompactV8 } from '../../src/services/poi/NarrativeCompactVerificationV8';
import { NARRATIVE_MODEL_PROFILES_V6 } from '../../src/services/poi/NarrativeModelProfilesV6';

const models = [
  { name: 'mini', provider: NARRATIVE_MODEL_PROFILES_V6.qwen38_hybrid.phases.writer.provider, input: .75, output: 4.5 },
  { name: 'gemini', provider: { kind: 'openrouter', model: 'google/gemini-2.5-pro', zeroDataRetention: true }, input: 1.25, output: 10 },
  { name: 'qwen', provider: { kind: 'qwen_local', model: 'qwen-local' }, input: 0, output: 0 },
] as const;
const option = (name: string) => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
const unique = <T>(values: T[]) => [...new Set(values)];
const uniqueBy = <T>(values: T[], key: (v: T) => string) => [...new Map(values.map(v => [key(v), v])).values()];

async function main() {
  const checkpointPath = option('--checkpoint'), runId = option('--run-id');
  const stopIds = option('--stop-ids')?.split(',').filter(Boolean) ?? [];
  const prior = Number(option('--prior-spend-usd'));
  const rag = option('--rag') ?? 'off';
  const requestedModels = (option('--models') ?? 'mini,gemini,qwen').split(',');
  if (!requestedModels.length || unique(requestedModels).length !== requestedModels.length || requestedModels.some(name => !models.some(model => model.name === name))) throw new Error('invalid models');
  const selectedModels = models.filter(model => requestedModels.includes(model.name));
  if (!checkpointPath || !runId || !/^[a-zA-Z0-9_-]+$/.test(runId) || !stopIds.length
    || stopIds.length > 3 || unique(stopIds).length !== stopIds.length
    || !Number.isFinite(prior) || prior < 0 || prior >= 2 || !['on', 'off'].includes(rag)) throw new Error('invalid experiment arguments');
  if (rag === 'on' && !/^Q\d+$/.test(option('--city-qid') ?? '')) throw new Error('--city-qid required for RAG');
  const checkpoint = loadNarrativeWriterBenchmarkCheckpointV8(resolve(checkpointPath));
  for (const id of stopIds) if (!checkpoint.route.stops.some(s => s.stopId === id)) throw new Error('unknown stop ' + id);
  if (!process.argv.includes('--execute')) {
    console.log(JSON.stringify({ dryRun: true, runId, stopIds, rag, writerCalls: stopIds.length * selectedModels.length, remainingUsd: 2 - prior }));
    return;
  }
  const key = process.env.OPENROUTER_API_KEY;
  if (!key) throw new Error('OPENROUTER_API_KEY required');
  const directory = resolve(__dirname, '../../tmp/narrative-oneshot-experiment-v8', runId);
  mkdirSync(resolve(directory, '..'), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  const guard = new NarrativeProgressSpendGuardV6({ limitUsd: 2, historicalSpendUsd: prior, path: resolve(directory, 'spend.private.jsonl') });
  const onProgress: EditorialProgressCallbackV6 = event => {
    guard.record(event);
    appendFileSync(resolve(directory, 'progress.private.jsonl'), JSON.stringify({ ...event, budget: guard.snapshot() }) + '\n', { mode: 0o600 });
    save('budget.private.json', guard.snapshot());
  };
  const pricing = { 'openai/gpt-5.4-mini': { inputUsdPerToken: .75e-6, outputUsdPerToken: 4.5e-6 } };
  const researchEvidence: unknown[] = [], results: unknown[] = [];
  save('budget.private.json', guard.snapshot());
  try {
    if (rag === 'on') {
      const curate = await curatorServiceV8({ apiKey: '', openRouterApiKey: key, openRouterPricing: pricing,
        profile: 'qwen38_hybrid', runId, onProgress });
      for (const stopId of stopIds) {
        const stop = checkpoint.route.stops.find(s => s.stopId === stopId)!;
        const handoff = checkpoint.research.find(s => s.routeStopId === stopId)!;
        const priorResult = handoff.result;
        if (priorResult.status !== 'sufficient') throw new Error('requires admitted saved research');
        const old = priorResult.dossier;
        const ragResult = await retrieveNarrativeHistoricalCorpusV8({ stopId, stopName: stop.name,
          cityQid: option('--city-qid') ?? '', cityName: checkpoint.route.city,
          language: checkpoint.route.language, aliases: old.authorizedNames });
        save('rag-' + stopId + '.private.json', ragResult);
        if (!ragResult.captures.length) continue;
        const captures = uniqueBy([...priorResult.captures, ...ragResult.captures], c => c.sourceId);
        const spansBySource = new Map(captures.map(c => [c.sourceId, segmentCaptureIntoSpansV7(c).spans]));
        const packet = buildCuratorPacketV8({ stopId, stopName: stop.name, language: old.language, captures, spansBySource,
          aliases: old.authorizedNames, narrationTarget: checkpoint.narrationTargets.find(t => t.stopId === stopId) });
        const selectedSources = new Set(packet.spans.map(s => s.sourceId));
        packet.historicalSources = ragResult.captures.filter(c => selectedSources.has(c.sourceId))
          .map(c => ({ sourceId: c.sourceId, ...c.historicalCorpus! }));
        save('curator-input-' + stopId + '.private.json', packet);
        const output = await curate(packet);
        const normalized = normalizeNarrativeCuratorOutputV8({ output, captures, spansBySource, authorizedIdentityNames: old.authorizedNames });
        const checked = buildValidatedDossierV8({ stopId, stopName: stop.name, qid: handoff.entityQid,
          language: old.language, captures, spansBySource, curatorOutput: normalized.output, authorizedIdentityNames: old.authorizedNames });
        save('curator-result-' + stopId + '.private.json', { output, normalized, checked });
        if (checked.status !== 'ok') { researchEvidence.push({ stopId, status: checked.status, historicalPropositions: 0 }); continue; }
        const extra = checked.value.dossier;
        const ragIds = new Set(ragResult.captures.map(c => c.sourceId));
        const additions = extra.propositions.filter(p => p.sourceIds.some(id => ragIds.has(id)));
        // Frozen experiment: retain baseline facts/arc references and add only newly validated historical claims.
        const passages = uniqueBy([...old.passages, ...extra.passages], p => p.passageId);
        const propositions = uniqueBy([...old.propositions, ...additions], p => p.propositionId);
        const { fingerprint: _fingerprint, sufficiency: _sufficiency, sources: _sources, ...proposal } = old;
        const dossier = buildNarrativeDossierV6({ ...proposal, sources: unique(passages.map(p => p.sourceId)), passages, propositions,
          authorizedNames: unique([...old.authorizedNames, ...extra.authorizedNames]),
          authorizedNumbers: unique([...old.authorizedNumbers, ...extra.authorizedNumbers]),
          discrepancies: unique([...old.discrepancies, ...extra.discrepancies]), limits: unique([...old.limits, ...extra.limits]) }, captures);
        const gates = assessNarrativeEvidenceGatesV8(dossier, handoff.entityQid);
        const tier = classifyEvidenceTierV8(dossier, gates, captures);
        if (tier === 'D') throw new Error('enrichment invalidated existing evidence');
        handoff.result = { ...priorResult, dossier, captures, gates, evidenceTier: tier };
        researchEvidence.push({ stopId, status: 'validated', historicalPropositions: additions.length, texts: additions.map(p => p.text) });
      }
      const boundary = buildNarrativeEvidenceBoundaryV8(checkpoint.route, checkpoint.research);
      if (boundary.status !== 'ready') throw new Error('enriched evidence boundary failed');
      checkpoint.evidenceManifest = boundary.manifest;
    }
    save('research-summary.private.json', researchEvidence);
    const frozen = buildFrozenWriterCasesV8(checkpoint, stopIds, true, false);
    save('frozen-input.private.json', frozen);
    save('benchmark-input.private.json', checkpoint);
    for (const item of frozen.cases) {
      for (const model of selectedModels) {
        console.log('[oneshot] writer ' + item.stopId + ' ' + model.name + ' budget=' + guard.snapshot().remainingUsd.toFixed(4));
        const call = await requestEditorialStructuredV6({
          callId: runId + '-' + item.stopId + '-' + model.name,
          provider: { ...model.provider } as EditorialProviderV6,
          options: { openRouterApiKey: key, qwenLocalBaseUrl: 'http://127.0.0.1:8080/v1',
            reasoning: model.name === 'qwen' ? 'none' : 'low', maxTokens: 4000, requestAttempts: 1, rateLimitAttempts: 1,
            requestTimeoutMs: 180000, disableOpenRouterCache: true, includePreviousResponseOnSemanticRetry: false,
            pricing: { inputUsdPerToken: model.input / 1e6, outputUsdPerToken: model.output / 1e6 },
            runId, stopId: item.stopId, phase: 'writer', onProgress },
          systemPrompt: item.systemPrompt, input: item.input, schema: item.schema,
          toolName: 'write_narrative_stop_v8', toolDescription: 'Un relato factual y oral, una sola generación.',
          inputCharacterLimit: 120000, schemaCharacterLimit: 60000,
          validate: value => parseNarrativeWriterResponseV8(item.plan, value),
        });
        const draft = call.value;
        const name = item.stopId + '-' + model.name;
        save(name + '.private.json', call);
        if (draft) writeFileSync(resolve(directory, name + '.md'), draft.text + '\n', { mode: 0o600 });
        let verification: unknown = null;
        if (draft && process.argv.includes('--verify')) {
          const index = checkpoint.research.findIndex(s => s.routeStopId === item.stopId);
          const currentResearch = checkpoint.research[index].result;
          if (currentResearch.status !== 'sufficient') throw new Error('missing audit dossier');
          const dossier = currentResearch.dossier;
          const bridgeIds = new Set(checkpoint.arc.stops[index].bridgePropositionIds ?? []);
          const nextResearch = checkpoint.research[index + 1]?.result;
          const next = nextResearch?.status === 'sufficient' ? nextResearch.dossier : undefined;
          const bridgePropositions = next?.propositions.filter(p => bridgeIds.has(p.propositionId)) ?? [];
          const bridgePassages = new Set(bridgePropositions.flatMap(p => p.passageIds));
          const checked = await verifyNarrativeCompactV8({ profile: 'qwen38_hybrid', openRouterApiKey: key,
            openRouterPricing: pricing, runId: runId + '-' + model.name, onProgress },
            { script: assignNarrativeSentenceIdsV6(item.stopId, draft.text, { sentenceBoundaryPolicy: 'v8' }), dossier },
            { propositions: bridgePropositions, passages: next?.passages.filter(p => bridgePassages.has(p.passageId)) ?? [],
              ...(next ? { nextStop: { stopId: next.stopId, authorizedNames: next.authorizedNames } } : {}) });
          verification = checked.value;
          save(name + '-verification.private.json', checked);
        }
        results.push({ stopId: item.stopId, model: model.name, status: call.status, wordCount: draft?.wordCount ?? null,
          bounds: item.bounds, lengthPassed: !!draft && draft.wordCount >= item.bounds.minimumWords && draft.wordCount <= item.bounds.maximumWords,
          coverage: draft?.coverage ?? null, costUsd: call.usage?.costUsd ?? null, verification,
          attempts: call.attempts.length, file: draft ? name + '.md' : null });
        save('results.private.json', { results, budget: guard.snapshot() });
      }
    }
    guard.assertSettled();
  } finally {
    save('results.private.json', { results, researchEvidence, budget: guard.snapshot() });
    console.log(JSON.stringify({ directory, budget: guard.snapshot() }));
  }
}
if (require.main === module) main().catch(error => {
  const message = error instanceof Error ? error.message : String(error);
  const sanitized = [process.env.OPENROUTER_API_KEY, process.env.DEEPSEEK_API_KEY].filter((secret): secret is string => !!secret)
    .reduce((text, secret) => text.split(secret).join('[REDACTED]'), message);
  console.error(sanitized); process.exitCode = 1;
});
