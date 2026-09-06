import 'dotenv/config';
import { readFileSync, mkdirSync, writeFileSync } from 'fs';
import { resolve } from 'path';
import { editNarrativeSegmentsV8 } from '../../src/services/poi/NarrativeSegmentEditV8';
import { NARRATIVE_MODEL_PROFILES_V6 } from '../../src/services/poi/NarrativeModelProfilesV6';
import { NarrativeDossierV6 } from '../../src/services/poi/NarrativeDossierV6';

const option = (name: string) => process.argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
async function main() {
  const source = option('--source'), stopId = option('--stop-id'), runId = option('--run-id');
  if (!source || !stopId || !runId || !/^[a-zA-Z0-9_-]+$/.test(runId)) throw new Error('source, stop-id, safe run-id required');
  if (NARRATIVE_MODEL_PROFILES_V6.qwen38_hybrid.phases.repair.provider.kind !== 'qwen_local') throw new Error('Replay is local-only');
  const diagnostics = JSON.parse(readFileSync(resolve(source, 'diagnostics.private.json'), 'utf8'));
  const calls = diagnostics.privateDiagnostics.filter((d: any) => d.phase === 'repair' && d.stopId === stopId);
  if (calls.length !== 1) throw new Error('Expected exactly one frozen repair');
  const input = calls[0].input;
  const dir = resolve(__dirname, '../../tmp/narrative-local-repair-replay-v8', runId);
  mkdirSync(resolve(dir, '..'), { recursive: true, mode: 0o700 });
  mkdirSync(dir, { mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(resolve(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  save('input.private.json', input);
  const result = await editNarrativeSegmentsV8({
    profile: 'qwen38_hybrid', runId, qwenLocalBaseUrl: process.env.QWEN_LOCAL_BASE_URL,
    onProgress: event => {
      if (event.event === 'attempt_started' && (event.requestedModel !== 'qwen-local' || event.maximumCostUsd !== 0)) {
        throw new Error('Refusing nonlocal or nonzero-cost request');
      }
    },
  }, input.plan, input.draft, input.targets.map((t: any) => t.sentenceId), input.reasons,
  { language: input.language, passages: input.writerEvidencePassages, discrepancies: input.discrepancies,
    limits: input.limits } as NarrativeDossierV6, input.bridgeEvidence);
  save('result.private.json', result);
  const replacement = JSON.parse(result.diagnostic.rawOutput ?? '{}');
  console.log(JSON.stringify({ directory: dir, wordCount: result.value.wordCount,
    replacements: replacement.replacements, status: result.diagnostic.status, costUsd: result.diagnostic.usage?.costUsd ?? 0 }));
  const forbidden = option('--expect-absent');
  if (forbidden && result.value.text.includes(forbidden)) throw new Error('Expected absent content remains in candidate');
}
main().catch(error => { console.error(String(error).replace(/sk-[\w-]+/g, '[REDACTED]')); process.exitCode = 1; });
