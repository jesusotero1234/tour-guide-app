import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseTourBlueprintSnapshot, TourBlueprintSnapshot } from '../../src/services/TourBlueprint';
import { TourRequest } from '../../src/types/api';
import { preflightCodexLiveV8, runCodexLiveNarrationV8 } from './narrative-codex-live-v8';
import { prepareAuthorCanaryMaterialV8 } from './narrative-author-canary-material-v8';
import { NarrativeProgressSpendGuardV6 } from '../../src/services/poi/NarrativeProgressSpendGuardV6';
import { tourLocale, NARRATION_RATES, NARRATION_POLICY_VERSION } from '../../src/services/tourReadiness/TourLanguage';

export async function narrateTourBlueprint(input: {
  snapshot: TourBlueprintSnapshot; request: TourRequest; runId: string; directory: string;
  limitUsd: number; signal: AbortSignal;
}) {
  writeFileSync(resolve(input.directory, 'budget.private.json'), JSON.stringify({ spentUsd: 0, reservedUsd: 0 }), { mode: 0o600 });
  const snapshot = parseTourBlueprintSnapshot(input.snapshot);
  const request = { ...input.request, language: tourLocale(input.request.language) };
  if (request.city !== snapshot.destination.city || request.countryCode !== snapshot.destination.countryCode
    || request.country !== snapshot.destination.country || request.theme !== snapshot.checkpoint.route.theme
    || request.durationMinutes !== snapshot.checkpoint.route.durationMinutes) throw new Error('Blueprint request mismatch');
  const docs = await preflightCodexLiveV8();
  const guard = new NarrativeProgressSpendGuardV6({ limitUsd: input.limitUsd, historicalSpendUsd: 0,
    path: resolve(input.directory, 'spend.private.jsonl') });
  const saveBudget = () => writeFileSync(resolve(input.directory, 'budget.private.json'), JSON.stringify(guard.snapshot()), { mode: 0o600 });
  saveBudget();
  const materials = prepareAuthorCanaryMaterialV8(snapshot.checkpoint, docs.template, docs.reference, docs.referenceStopId, request.language);
  const author = await runCodexLiveNarrationV8({
    materials, directory: input.directory, city: request.city, durationMinutes: request.durationMinutes,
    openRouterApiKey: '', pricing: {}, runId: input.runId, signal: input.signal, requireLanguageReview: true,
    onProgress: event => { guard.record(event); saveBudget(); },
    budget: () => guard.snapshot(),
    sanitize: () => 'Author error',
    onUpdate: async state => {
      writeFileSync(resolve(input.directory, 'review.json'), JSON.stringify({
        schemaVersion: 'narrative-user-canary-v8', runId: input.runId, request,
        status: state.status, writerTransport: 'codex', publicationPassed: false, boundaryMigrationPassed: true,
        route: { stops: snapshot.checkpoint.route.stops, source: 'blueprint' }, geometry: snapshot.geometry,
        blueprintFingerprint: snapshot.fingerprint, budget: guard.snapshot(),
        narrationEstimate: { ...NARRATION_RATES[request.language], policyVersion: NARRATION_POLICY_VERSION },
      }), { mode: 0o600 });
    },
  });
  saveBudget();
  guard.assertSettled();
  if (author.status !== 'complete_needs_review') throw new Error('Narration incomplete');
}
async function main() {
  const option = (name: string) => process.argv.find(arg => arg.startsWith(name + '='))?.slice(name.length + 1);
  if (!process.argv.includes('--allow-external')) throw new Error('--allow-external required');
  const file = option('--input'), runId = option('--run-id'), limitUsd = Number(option('--spend-limit-usd'));
  if (!file || !runId || !/^app-[a-z0-9-]+$/.test(runId) || !Number.isFinite(limitUsd) || limitUsd <= 0) throw new Error('Invalid author invocation');
  if (statSync(file).size > 9 * 1024 * 1024) throw new Error('Input too large');
  const payload = JSON.parse(readFileSync(file, 'utf8'));
  const directory = resolve(process.cwd(), 'tmp/narrative-v8', runId);
  mkdirSync(directory, { recursive: false, mode: 0o700 });
  const controller = new AbortController();
  const abort = () => controller.abort();
  process.once('SIGTERM', abort); process.once('SIGINT', abort);
  const timer = setTimeout(abort, 30 * 60 * 1000);
  try { await narrateTourBlueprint({ ...payload, runId, directory, limitUsd, signal: controller.signal }); }
  finally { clearTimeout(timer); process.removeListener('SIGTERM', abort); process.removeListener('SIGINT', abort); }
}
if (require.main === module) void main().catch(error => {
  process.stderr.write((error instanceof Error ? error.message : 'Author worker failed') + '\n');
  process.exitCode = 1;
});
