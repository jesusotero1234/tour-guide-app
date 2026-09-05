import 'dotenv/config';
import { readFileSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { editNarrativeSegmentsV8 } from '../../src/services/poi/NarrativeSegmentEditV8';
import { resolveNarrativeSentenceTargetsV8, assertNarrativeSentenceScopeV8 } from '../../src/services/poi/NarrativeSentenceEditV8';
import { verifyNarrativeCompactV8 } from '../../src/services/poi/NarrativeCompactVerificationV8';
import { assignNarrativeSentenceIdsV6 } from '../../src/services/poi/NarrativeEditorialV6';
import { decideNarrativeEditV8 } from '../../src/services/poi/NarrativeEditDecisionV8';
import { NarrativeProgressSpendGuardV6 } from '../../src/services/poi/NarrativeProgressSpendGuardV6';
import { preflightNarrativeOpenRouterV6, openRouterPricingFromPreflightV6 } from '../../src/services/poi/OpenRouterPreflightV6';
import { EditorialProgressCallbackV6 } from '../../src/services/poi/EditorialStructuredLlmV6';

const option = (name: string) => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
async function main() {
  const source = option('--source'), runId = option('--run-id'), stopId = option('--stop-id');
  const prior = Number(option('--prior-spend-usd')), limit = Number(option('--spend-limit-usd'));
  if (!source || !runId || !/^[a-zA-Z0-9_-]+$/.test(runId) || !stopId || !/^Q\d+$/.test(stopId)
    || !Number.isFinite(prior) || prior < 0 || !Number.isFinite(limit) || limit <= prior) throw new Error('invalid pilot arguments');
  const checkpoint = JSON.parse(readFileSync(resolve(source, 'checkpoint.private.json'), 'utf8'));
  const diagnostics = JSON.parse(readFileSync(resolve(source, 'diagnostics.private.json'), 'utf8'));
  const before = checkpoint.editorial.stageState.stops.find((s: any) => s.stopId === stopId)?.editComparison?.before;
  const oldEdit = diagnostics.privateDiagnostics.find((d: any) => d.callId === 'narrative-v8-segment-edit-' + stopId);
  const handoff = diagnostics.research.find((r: any) => r.routeStopId === stopId);
  if (!before || !oldEdit?.input?.plan || handoff?.result?.status !== 'sufficient') throw new Error('missing frozen pilot inputs');
  const dossier = handoff.result.dossier, plan = oldEdit.input.plan, bridge = oldEdit.input.bridgeEvidence;
  const findings = before.verification.report.findings.filter((f: any) => !['supported', 'authorized_inference'].includes(f.classification));
  const ids = findings.map((f: any) => f.sentenceId);
  const targets = resolveNarrativeSentenceTargetsV8(stopId, before.draft, ids);
  if (!process.argv.includes('--execute')) {
    console.log(JSON.stringify({ dryRun: true, stopId, targets: targets.length, remainingUsd: limit - prior }));
    return;
  }
  const key = process.env.OPENROUTER_API_KEY?.trim();
  if (!key) throw new Error('OPENROUTER_API_KEY required');
  const signal = AbortSignal.timeout(240000);
  const preflight = await preflightNarrativeOpenRouterV6({ profile: 'qwen38_hybrid', signal });
  if (preflight.status !== 'ready') throw new Error('OpenRouter preflight failed: ' + preflight.issues.join('; '));
  const directory = resolve(__dirname, '../../tmp/narrative-editorial-local-pilot-v8', runId);
  mkdirSync(resolve(directory, '..'), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const save = (file: string, value: unknown) => writeFileSync(resolve(directory, file), JSON.stringify(value, null, 2), { mode: 0o600 });
  const guard = new NarrativeProgressSpendGuardV6({ limitUsd: limit, historicalSpendUsd: prior, path: resolve(directory, 'spend.private.jsonl') });
  const onProgress: EditorialProgressCallbackV6 = event => {
    guard.record(event);
    appendFileSync(resolve(directory, 'progress.private.jsonl'), JSON.stringify(event) + '\n', { mode: 0o600 });
    save('budget.private.json', guard.snapshot());
  };
  const options = { profile: 'qwen38_hybrid', openRouterApiKey: key, openRouterPricing: openRouterPricingFromPreflightV6(preflight),
    qwenLocalBaseUrl: process.env.QWEN_LOCAL_BASE_URL?.trim() || 'http://127.0.0.1:8080/v1',
    runId, onProgress, signal, requestTimeoutMs: 180000 };
  save('inputs.private.json', { stopId, before, plan, dossier, bridge, targets });
  save('budget.private.json', guard.snapshot());
  try {
    const edited = await editNarrativeSegmentsV8(options, plan, before.draft, ids,
      findings.map((f: any) => f.sentenceId + ': ' + f.reason), dossier, bridge);
    save('edit.private.json', edited);
    assertNarrativeSentenceScopeV8(stopId, before.draft, edited.value, ids);
    const script = assignNarrativeSentenceIdsV6(stopId, edited.value.text, { sentenceBoundaryPolicy: 'v8' });
    const checked = await verifyNarrativeCompactV8(options, { script, dossier }, bridge);
    const candidate = { draft: edited.value, script, verification: { scriptFingerprint: script.fingerprint, report: checked.value } };
    const decision = decideNarrativeEditV8(before, candidate, plan.narrationTarget.targetWords, ids);
    guard.assertSettled();
    const result = { stopId, originalWords: before.draft.wordCount, candidateWords: edited.value.wordCount,
      protectedTextPassed: true, decision, budget: guard.snapshot() };
    save('result.private.json', { ...result, before, candidate, auditDiagnostic: checked.diagnostic });
    console.log(JSON.stringify(result, null, 2));
  } catch (error) {
    const message = (error instanceof Error ? error.message : String(error)).split(key).join('[REDACTED]');
    save('failure.private.json', { message, budget: guard.snapshot() });
    console.error(message);
    process.exitCode = 1;
  } finally {
    save('budget.private.json', guard.snapshot());
  }
}
main().catch(error => { console.error((error as Error).message.replace(/sk-[\w-]+/g, '[REDACTED]')); process.exitCode = 1; });
