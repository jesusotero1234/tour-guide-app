import 'dotenv/config';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';
import { createHash } from 'crypto';
import { spawn } from 'child_process';
import { loadNarrativeWriterBenchmarkCheckpointV8 } from './narrative-writer-benchmark-v8';
import { prepareAuthorCanaryMaterialV8, appendAuthorStyleHistoryV8 } from './narrative-author-canary-material-v8';
import { evaluateNarrationDeliveryV8 } from '../../src/services/poi/NarrativeDurationTargetsV8';

type Material = ReturnType<typeof prepareAuthorCanaryMaterialV8>[number];
export type ChildBudgetV8 = {
  limitUsd: number; historicalSpentUsd: number; spentUsd: number; reservedUsd: number;
  runReportedCostUsd: number; runUnverifiedExposureUsd: number;
};
export type ChildOutcomeV8 = {
  budget?: ChildBudgetV8; narration?: string; results?: Record<string, any>;
  audit?: { status: string; value?: { findings: Array<Record<string, any>> } };
  evidenceDir?: string; exitCode?: number | null;
};
type Entry = ChildOutcomeV8 & { stopId: string; name: string; targetWords: number; wordCount: number; status: string };
export type AuthorCanaryStateV8 = {
  status: string; error?: string; stops: Entry[]; budget: ChildBudgetV8 & { remainingUsd: number };
};
// Existing plain-writer pilot reserves .90 writer + .65 auditor before each pair.
const PAIR_RESERVATION_USD = 1.55;

export async function runAuthorCanarySequenceV8(
  materials: ReadonlyArray<{ stopId: string; name: string; targetWords: number }>,
  prior: number, limit: number,
  step: (index: number, prior: number, previous: Array<{ name: string; text: string }>) => Promise<ChildOutcomeV8>,
  onUpdate: (state: AuthorCanaryStateV8) => void = () => {}
): Promise<AuthorCanaryStateV8> {
  if (!materials.length || !Number.isFinite(prior) || prior < 0 || !Number.isFinite(limit) || limit <= prior) throw new Error('invalid canary budget/materials');
  const state: AuthorCanaryStateV8 = {
    status: 'running', stops: [],
    budget: { limitUsd: limit, historicalSpentUsd: prior, spentUsd: prior, reservedUsd: 0,
      runReportedCostUsd: 0, runUnverifiedExposureUsd: 0, remainingUsd: limit - prior }
  };
  try {
    onUpdate(state);
    for (let index = 0; index < materials.length; index++) {
      if (state.budget.remainingUsd + 1e-9 < PAIR_RESERVATION_USD) {
        state.status = 'budget_exhausted'; break;
      }
      const childPrior = state.budget.spentUsd;
      const out = await step(index, childPrior, state.stops.filter(s => s.narration).map(s => ({ name: s.name, text: s.narration! })));
      const b = out.budget;
      if (!b || ![b.limitUsd, b.historicalSpentUsd, b.spentUsd, b.reservedUsd, b.runReportedCostUsd, b.runUnverifiedExposureUsd].every(Number.isFinite)
        || Math.abs(b.limitUsd - limit) > 1e-9 || Math.abs(b.historicalSpentUsd - childPrior) > 1e-9
        || b.spentUsd < childPrior || b.reservedUsd < 0 || b.runReportedCostUsd < 0 || b.runUnverifiedExposureUsd < 0
        || Math.abs(b.spentUsd - childPrior - b.runReportedCostUsd - b.runUnverifiedExposureUsd) > 1e-7) {
        state.status = 'accounting_unverified'; state.error = 'Missing or inconsistent child budget; no further requests. Inspect child artifacts.';
        break;
      }
      state.budget.spentUsd = b.spentUsd;
      state.budget.reservedUsd = b.reservedUsd;
      state.budget.runReportedCostUsd += b.runReportedCostUsd;
      state.budget.runUnverifiedExposureUsd += b.runUnverifiedExposureUsd;
      state.budget.remainingUsd = limit - b.spentUsd - b.reservedUsd;
      const material = materials[index], text = out.narration;
      state.stops.push({
        ...out, stopId: material.stopId, name: material.name, targetWords: material.targetWords,
        wordCount: text?.trim() ? text.trim().split(/\s+/u).length : 0,
        status: text?.trim() ? (out.audit?.status === 'valid' && out.results ? 'review_required' : 'audit_failed') : 'writer_failed'
      });
      onUpdate(state);
      if (b.reservedUsd > 0 || state.budget.remainingUsd < -1e-9) {
        state.status = 'accounting_unverified'; state.error = 'Outstanding reservation or exceeded budget; no further requests.'; break;
      }
      if (!text?.trim()) { state.status = 'writer_failed'; break; }
    }
    if (state.status === 'running') state.status = 'complete_needs_review';
  } catch (error) {
    state.status = 'failed'; state.error = error instanceof Error ? error.message : 'canary failed';
  } finally { onUpdate(state); }
  return state;
}

export function renderAuthorCanaryTourV8(materials: Material[], state: AuthorCanaryStateV8, city: string, durationMinutes: number): string {
  const words = state.stops.reduce((sum, s) => sum + s.wordCount, 0);
  const complete = state.stops.length === materials.length && state.stops.every(s => s.narration?.trim());
  return [
    '# Tour de ' + city + ' — Astra low',
    '> Estado: ' + (complete ? 'COMPLETE_NEEDS_REVIEW' : 'PARTIAL') + '. Ejecución: ' + state.status + '.',
    '> Petición original: ' + durationMinutes + ' minutos. Ruta y objetivos reutilizados; navegación y TTS no revalidados.',
    '> Narración: ' + words + ' palabras, aproximadamente ' + (words / 120).toFixed(1) + ' minutos de voz a 120 palabras/minuto. No es una medición de audio.',
    '> Los textos son las primeras respuestas originales, sin reparaciones. Consulte review.private.json para auditorías y duración.',
    ...materials.flatMap((m, i) => {
      const entry = state.stops.find(s => s.stopId === m.stopId);
      return [
        '## ' + (i + 1) + '. ' + m.name,
        entry?.narration?.trimEnd() ?? '*Narración no completada.*',
        '### Fuentes del material',
        m.sourceUrls.filter(s => /^https?:\/\//.test(s.url)).map(s => '- [' + s.title.replace(/[\r\n\[\]]/g, ' ') + '](' + s.url + ')').join('\n')
      ];
    })
  ].join('\n\n') + '\n';
}

export async function main(argv = process.argv.slice(2)) {
  const option = (name: string) => argv.find(a => a.startsWith(name + '='))?.slice(name.length + 1);
  const source = option('--source'), template = option('--template'), reference = option('--reference'),
    referenceStopId = option('--reference-stop-id'), runId = option('--run-id');
  const prior = Number(option('--prior-spend-usd')), limit = Number(option('--spend-limit-usd'));
  if (!source || !template || !reference || !referenceStopId || !runId || !/^[a-zA-Z0-9_-]+$/.test(runId)
    || !Number.isFinite(prior) || prior < 0 || !Number.isFinite(limit) || limit <= prior) throw new Error('invalid arguments');
  const sourcePath = resolve(source), templatePath = resolve(template), referencePath = resolve(reference);
  const checkpoint = loadNarrativeWriterBenchmarkCheckpointV8(sourcePath);
  const materials = prepareAuthorCanaryMaterialV8(checkpoint, readFileSync(templatePath, 'utf8'), readFileSync(referencePath, 'utf8'), referenceStopId);
  if (!argv.includes('--execute')) {
    console.log(JSON.stringify({ dryRun: true, intendedCalls: materials.length * 2, durationMinutes: checkpoint.route.durationMinutes,
      targetWords: materials.reduce((sum, s) => sum + s.targetWords, 0), budgetUsd: limit - prior,
      stops: materials.map(m => ({ stopId: m.stopId, name: m.name, targetWords: m.targetWords,
        inputBytes: Buffer.byteLength(m.authorPrompt), referenceIncluded: m.referenceIncluded })) }));
    return;
  }
  const backend = resolve(__dirname, '../..');
  const root = resolve(backend, 'tmp/narrative-author-route-canary-v8'), dir = resolve(root, runId);
  const childIds = materials.map((_, index) => runId + '-' + (index + 1));
  const childDirs = childIds.map(id => resolve(backend, 'tmp/narrative-plain-writer-pilot-v8', id));
  if (existsSync(dir) || childDirs.some(d => existsSync(d))) throw new Error('run artifacts already exist; use a new run-id');
  mkdirSync(root, { recursive: true, mode: 0o700 }); mkdirSync(dir, { mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(resolve(dir, name), JSON.stringify(value, null, 2), { mode: 0o600 });
  save('inputs.private.json', {
    source: sourcePath, sourceSha256: createHash('sha256').update(readFileSync(sourcePath)).digest('hex'),
    route: checkpoint.route, narrationTargets: checkpoint.narrationTargets, runId, priorSpendUsd: prior, limitUsd: limit,
    template: templatePath, reference: referencePath, referenceStopId, expectedCalls: materials.length * 2,
    writer: 'openai/gpt-6-astra', reasoning: 'low', experimentalAstraOpenAiNoZdr: true
  });
  const started = Date.now();
  const saveState = (state: AuthorCanaryStateV8) => {
    const allTexts = state.stops.length === materials.length && state.stops.every(s => s.narration?.trim());
    save('budget.private.json', state.budget);
    save('review.private.json', {
      ...state, elapsedMs: Date.now() - started, expectedStops: materials.length, completedNarrations: state.stops.filter(s => s.narration?.trim()).length,
      delivery: allTexts ? evaluateNarrationDeliveryV8(state.stops.map(s => ({ targetWords: s.targetWords, actualWords: s.wordCount }))) : null
    });
    writeFileSync(resolve(dir, 'tour.md'), renderAuthorCanaryTourV8(materials, state, checkpoint.route.city, checkpoint.route.durationMinutes), { mode: 0o600 });
  };
  const state = await runAuthorCanarySequenceV8(materials, prior, limit, async (index, childPrior, previous) => {
    const m = materials[index], preparedDir = resolve(dir, String(index + 1));
    mkdirSync(preparedDir, { mode: 0o700 });
    writeFileSync(resolve(preparedDir, 'inputs.private.json'), JSON.stringify(m.frozen, null, 2), { mode: 0o600 });
    const promptPath = resolve(preparedDir, 'author-prompt.md');
    writeFileSync(promptPath, appendAuthorStyleHistoryV8(m.authorPrompt, previous), { mode: 0o600 });
    console.log('[author-canary] ' + (index + 1) + '/' + materials.length + ' ' + m.name + ' — writer + audit');
    const childStarted = Date.now();
    const exitCode = await new Promise<number | null>((done, reject) => {
      const child = spawn(process.execPath, [
        '-r', 'ts-node/register', resolve(__dirname, 'narrative-plain-writer-pilot-v8.ts'),
        '--source-dir=' + preparedDir, '--brief=' + templatePath, '--reference=' + referencePath,
        '--author-context=' + promptPath, '--writer-model=openai/gpt-6-astra',
        '--experimental-astra-openai-no-zdr', '--run-id=' + childIds[index],
        '--prior-spend-usd=' + childPrior, '--spend-limit-usd=' + limit, '--execute'
      ], { cwd: backend, stdio: ['ignore', 'pipe', 'pipe'] });
      child.stdout.on('data', data => process.stdout.write(data));
      child.stderr.on('data', data => process.stderr.write(data));
      child.on('error', reject); child.on('close', done);
    });
    const childDir = childDirs[index];
    const readJson = (name: string) => existsSync(resolve(childDir, name)) ? JSON.parse(readFileSync(resolve(childDir, name), 'utf8')) : undefined;
    const budget = readJson('budget.private.json'), rawResults = readJson('results.private.json');
    const narration = existsSync(resolve(childDir, 'narration.md')) ? readFileSync(resolve(childDir, 'narration.md'), 'utf8') : undefined;
    console.log('[author-canary] ' + m.name + ' — ' + ((Date.now() - childStarted) / 1000).toFixed(1) + 's; coste=' + (budget?.runReportedCostUsd ?? 'desconocido'));
    return { budget, narration, results: rawResults?.results, audit: readJson('audit.private.json'), evidenceDir: childDir, exitCode };
  }, saveState);
  console.log(JSON.stringify({ dir, status: state.status, budget: state.budget }));
  if (state.status !== 'complete_needs_review') process.exitCode = 1;
}
if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : 'author canary failed'); process.exitCode = 1; });
