import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { main as authorMain, runCodex } from './narrative-codex-author-v8';
import { loadCodexAuthorDocumentsV8, preflightCodexLiveV8, runCodexLiveNarrationV8, auditCodexNarrationV8 } from './narrative-codex-live-v8';
import { prepareAuthorCanaryMaterialV8 } from './narrative-author-canary-material-v8';
import { prepareTourWelcomeV8 } from './narrative-tour-welcome-v8';
import { loadNarrativeWriterBenchmarkCheckpointV8 } from './narrative-writer-benchmark-v8';
import { assignNarrativeSentenceIdsV6 } from '../../src/services/poi/NarrativeEditorialV6';
import { evaluateNarrationDeliveryV8 } from '../../src/services/poi/NarrativeDurationTargetsV8';

type Material = ReturnType<typeof prepareAuthorCanaryMaterialV8>[number];
type Call = { role: 'writer' | 'auditor'; id: string; startedAt: string; elapsedMs: number; status: string; inputBytes?: number; usage?: unknown; error?: string };
const CASE = '## Caso y objetivo de esta respuesta';
const REF = '## Referencia de voz — no es evidencia';
const FACTS = '## Material factual permitido — solo esta parada';
const END = '## Entrega';
const hash = (s: string) => createHash('sha256').update(s).digest('hex');
const save = (p: string, v: unknown) => writeFileSync(p, JSON.stringify(v, null, 2) + '\n', { mode: 0o600 });
const words = (s: string) => s.trim().split(/\s+/u).filter(Boolean).length;
function between(s: string, a: string, b: string) {
  const start = s.indexOf(a), end = s.indexOf(b, start + a.length);
  assert(start >= 0 && end > start, 'Author prompt section missing');
  return s.slice(start, end).trim();
}

export function combinedPrompt(materials: Material[], welcome: Material) {
  assert(materials.length && new Set(materials.map(m => m.stopId)).size === materials.length);
  const common = materials[0].authorPrompt.slice(materials[0].authorPrompt.indexOf('\n\n') + 2, materials[0].authorPrompt.indexOf(CASE)).trim();
  for (const m of materials) {
    assert.equal(m.authorPrompt.slice(m.authorPrompt.indexOf('\n\n') + 2, m.authorPrompt.indexOf(CASE)).trim(), common);
    assert(/^[\w-]+$/.test(m.stopId));
  }
  const references = [...new Set(materials.filter(m => m.referenceIncluded).map(m => between(m.authorPrompt, REF, FACTS)))];
  assert(references.length <= 1, 'Expected one shared style reference');
  const welcomeBlocks = welcome.authorPrompt.split('\n\n');
  const evidenceIndex = welcomeBlocks.findIndex(s => s.startsWith('{"city":'));
  assert(evidenceIndex >= 0, 'Welcome evidence missing');
  const evidence = JSON.parse(welcomeBlocks[evidenceIndex]);
  const passages = evidence.passages;
  assert(Array.isArray(passages) && passages.length);
  delete evidence.passages;
  welcomeBlocks[evidenceIndex] = JSON.stringify(evidence);
  welcomeBlocks.pop(); // The shared section format replaces the single-response delivery instruction.
  const prompt = [
    '# Un tour completo en una sola respuesta',
    'Escribe todas las narraciones solicitadas y la bienvenida, sin acortar las últimas piezas. Los criterios comunes se aplican a cada parada.',
    common,
    ...references,
    'La referencia es SOLO estilo. NO copies su narración. En las piezas marcadas referencia excluida no la uses como ejemplo ni como fuente.',
    ...materials.map(m => [
      '# PIEZA ' + m.stopId + ' — ' + m.name,
      'Referencia de estilo: ' + (m.referenceIncluded ? 'permitida' : 'EXCLUIDA para esta parada'),
      between(m.authorPrompt, CASE, REF),
      between(m.authorPrompt, FACTS, END),
    ].join('\n\n')),
    '# PIEZA tour-welcome',
    'Para la bienvenida, el corpus permitido es la unión de los pasajes originales de las paradas anteriores. Los datos canónicos, discrepancias y límites figuran abajo. La bienvenida se escuchará ANTES de la primera parada.',
    welcomeBlocks.join('\n\n'),
    '# FORMATO DE RESPUESTA',
    'Las instrucciones locales de entregar solo el guion se aplican DENTRO de cada pieza. Entrega estas piezas en el orden indicado, una vez cada una. No escribas texto fuera de ellas, ni comentarios, ni planes, ni bloques de código.',
    [...materials, welcome].map(m => '<<<STOP:' + m.stopId + '>>>\n[Guion completo de esta pieza en párrafos]\n<<<END>>>').join('\n\n'),
  ].join('\n\n');
  for (const m of materials) for (const p of m.frozen.inputs[0].preparedRequest.input.passages) assert(prompt.includes(p.quote), 'Source passage omitted');
  for (const p of passages) assert(prompt.includes(p.quote), 'Welcome source passage omitted');
  assert(Buffer.byteLength(prompt) <= 400 * 1024, 'Combined prompt exceeds existing author byte limit');
  return prompt;
}

export function parseCombined(text: string, ids: string[]) {
  const pattern = /^<<<STOP:([\w-]+)>>>[ \t]*\r?\n([\s\S]*?)^<<<END>>>[ \t]*(?:\r?\n|$)/gm;
  const found = [...text.matchAll(pattern)];
  assert(!text.replace(pattern, '').trim(), 'Unexpected text outside sections');
  assert.deepEqual(found.map(m => m[1]), ids, 'Missing, duplicated, reordered or unexpected section');
  assert(found.every(m => m[2].trim()), 'Empty narration');
  return found.map(m => ({ stopId: m[1], text: m[2].trim() }));
}

function totalUsage(calls: Call[]) {
  const result = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0, callsWithUsage: 0, callsWithoutUsage: 0 };
  for (const c of calls) {
    const u = c.usage as Record<string, unknown> | undefined;
    if (!u || typeof u.input_tokens !== 'number' || typeof u.output_tokens !== 'number') { result.callsWithoutUsage++; continue; }
    result.callsWithUsage++;
    for (const key of ['input_tokens', 'cached_input_tokens', 'output_tokens', 'reasoning_output_tokens'] as const) {
      if (typeof u[key] === 'number') result[key] += u[key] as number;
    }
  }
  return result;
}

function selfTest() {
  const example = '<<<STOP:A>>>\nUno.\n<<<END>>>\n\n<<<STOP:B>>>\nDos.\n<<<END>>>\n';
  assert.equal(parseCombined(example, ['A', 'B'])[1].text, 'Dos.');
  for (const bad of [example + 'Comentario', example.replace('STOP:B', 'STOP:A'), example.replace('Dos.', ''), example.replace('<<<END>>>', '')]) {
    assert.throws(() => parseCombined(bad, ['A', 'B']));
  }
  assert.throws(() => parseCombined(example, ['B', 'A']));
  const usage = totalUsage([{ role: 'writer', id: 'x', startedAt: '', elapsedMs: 1, status: 'success', usage: { input_tokens: 100, cached_input_tokens: 60, output_tokens: 20 } }]);
  assert.equal(usage.input_tokens, 100); // Cached input is a subset, never added to total input.
  assert.equal(usage.cached_input_tokens, 60);
  console.log('Self-test passed: section coverage/order, rejection cases, token accounting.');
}

async function main() {
  const [mode, directoryArg, checkpointArg] = process.argv.slice(2);
  if (mode === '--self-test') { selfTest(); return; }
  assert(['prepare', 'separate', 'together'].includes(mode) && directoryArg, 'Usage: prepare|separate|together DIRECTORY [CHECKPOINT]');
  const directory = resolve(directoryArg);
  if (mode === 'prepare') {
    assert(checkpointArg, 'Checkpoint required');
    const checkpointPath = resolve(checkpointArg), checkpoint = loadNarrativeWriterBenchmarkCheckpointV8(checkpointPath);
    const docs = loadCodexAuthorDocumentsV8();
    const materials = prepareAuthorCanaryMaterialV8(checkpoint, docs.template, docs.reference, docs.referenceStopId, 'es');
    const welcome = prepareTourWelcomeV8(materials);
    const prompt = combinedPrompt(materials, welcome);
    selfTest();
    mkdirSync(directory, { mode: 0o700 });
    const frozen = { materials, welcome, city: checkpoint.route.city, durationMinutes: checkpoint.route.durationMinutes };
    const frozenText = JSON.stringify(frozen);
    writeFileSync(join(directory, 'inputs.private.json'), frozenText, { mode: 0o600, flag: 'wx' });
    writeFileSync(join(directory, 'combined.prompt.private.md'), prompt, { mode: 0o600, flag: 'wx' });
    save(join(directory, 'manifest.json'), {
      checkpointPath, checkpointSha256: hash(readFileSync(checkpointPath, 'utf8')), inputsSha256: hash(frozenText), combinedPromptSha256: hash(prompt),
      model: 'gpt-6-astra', reasoning: 'low', transport: 'codex_cli', billing: 'ChatGPT quota',
      stopCount: materials.length, pieces: [...materials, welcome].map(m => ({ stopId: m.stopId, targetWords: m.targetWords })),
      separatePromptBytesBeforeStyleHistory: [...materials, welcome].reduce((n, m) => n + Buffer.byteLength(m.authorPrompt), 0),
      combinedPromptBytes: Buffer.byteLength(prompt), apiRequests: 0, productionChanged: false,
      limitations: ['One sample per strategy, sequential execution; server load/cache can differ.', 'Global style reference is visible to all pieces; its own stop explicitly excludes it.', 'Separate audits remain unchanged. No audio or five-language evaluation.'],
    });
    console.log('Prepared frozen inputs for ' + materials.length + ' stops plus welcome. No inference.');
    return;
  }
  const manifest = JSON.parse(readFileSync(join(directory, 'manifest.json'), 'utf8'));
  const frozenText = readFileSync(join(directory, 'inputs.private.json'), 'utf8');
  assert.equal(hash(frozenText), manifest.inputsSha256);
  const frozen = JSON.parse(frozenText) as { materials: Material[]; welcome: Material; city: string; durationMinutes: number };
  const prompt = readFileSync(join(directory, 'combined.prompt.private.md'), 'utf8');
  assert.equal(hash(prompt), manifest.combinedPromptSha256);
  assert.equal(hash(readFileSync(manifest.checkpointPath, 'utf8')), manifest.checkpointSha256);
  await preflightCodexLiveV8();
  const arm = join(directory, mode);
  mkdirSync(arm, { mode: 0o700 }); // Never overwrite or silently retry an experiment.
  mkdirSync(join(arm, 'audits'), { mode: 0o700 });
  const calls: Call[] = [], signal = AbortSignal.timeout(14 * 60 * 1000);
  const record = (call: Call) => {
    calls.push(call);
    appendFileSync(join(arm, 'calls.private.jsonl'), JSON.stringify(call) + '\n', { mode: 0o600 });
    console.log(mode + ' ' + call.role + ' ' + call.id + ': ' + call.status + ' ' + (call.elapsedMs / 1000).toFixed(1) + 's');
  };
  const started = Date.now();
  const options = { openRouterApiKey: '', pricing: {}, runId: 'astra-batching-' + mode, onProgress: () => {}, signal, requireLanguageReview: true };
  const write = async (p: string, out: string, abortSignal: AbortSignal) => {
    const start = Date.now(), id = out.split('/').pop()!;
    const promptFile = out + '.prompt.private.md';
    writeFileSync(promptFile, p, { mode: 0o600, flag: 'wx' });
    try {
      const result = await authorMain(['--prompt=' + promptFile, '--out-dir=' + out, '--execute'], {
        run: (body, target, env) => runCodex(body, target, env, { signal: abortSignal, timeoutMs: mode === 'together' ? 600000 : 180000 }),
      });
      record({ role: 'writer', id, startedAt: new Date(start).toISOString(), elapsedMs: Date.now() - start, status: result.status, inputBytes: Buffer.byteLength(p), usage: result.usage, error: result.error });
      if (result.status !== 'success') throw new Error(result.error ?? 'Writer failed');
      return { text: readFileSync(join(out, 'narration.md'), 'utf8'), usage: result.usage };
    } catch (error) {
      if (!calls.some(c => c.role === 'writer' && c.id === id)) record({ role: 'writer', id, startedAt: new Date(start).toISOString(), elapsedMs: Date.now() - start, status: 'failed', error: String(error) });
      throw error;
    }
  };
  const audit: typeof auditCodexNarrationV8 = async (material, script, auditOptions) => {
    const start = Date.now();
    try {
      const result = await auditCodexNarrationV8(material, script, auditOptions);
      save(join(arm, 'audits', material.stopId + '.private.json'), result);
      record({ role: 'auditor', id: material.stopId, startedAt: new Date(start).toISOString(), elapsedMs: Date.now() - start, status: result.status, usage: result.quotaUsage });
      return result;
    } catch (error) {
      record({ role: 'auditor', id: material.stopId, startedAt: new Date(start).toISOString(), elapsedMs: Date.now() - start, status: 'failed', error: String(error) });
      throw error;
    }
  };
  let state: unknown, error: string | undefined;
  try {
    if (mode === 'separate') {
      state = await runCodexLiveNarrationV8({ ...options, ...frozen, directory: arm, budget: () => ({ apiSpendUsd: 0 }), sanitize: String, generateIntroduction: true }, { write, audit });
    } else {
      const result = await write(prompt, join(arm, 'combined-author'), signal);
      const pieces = parseCombined(result.text, [...frozen.materials, frozen.welcome].map(m => m.stopId));
      const stops: Array<Record<string, unknown>> = [];
      const combinedState = { status: 'running', stops };
      state = combinedState;
      for (const [i, material] of [...frozen.materials, frozen.welcome].entries()) {
        const script = assignNarrativeSentenceIdsV6(material.stopId, pieces[i].text, { sentenceBoundaryPolicy: 'v8', preserveParagraphs: true });
        const row: Record<string, unknown> = { stopId: material.stopId, name: material.name, targetWords: material.targetWords, wordCount: words(script.text), script, status: 'audit_pending' };
        stops.push(row);
        save(join(arm, 'review.private.json'), combinedState);
        const report = await audit(material, script, options);
        row.audit = report;
        if (report.status !== 'valid' || !report.value) throw new Error('Audit failed');
        if (report.value.languageReview?.matchesRequestedLanguage !== true) throw new Error('Audit language mismatch');
        if (material.stopId === 'tour-welcome' && report.value.findings.some(f => !['supported', 'authorized_inference'].includes(f.classification))) throw new Error('Welcome audit rejected');
        row.status = 'audited';
        save(join(arm, 'review.private.json'), combinedState);
      }
      combinedState.status = 'complete_needs_review';
      writeFileSync(join(arm, 'tour.md'), [pieces[pieces.length - 1], ...pieces.slice(0, -1)].map(p => '## ' + p.stopId + '\n\n' + p.text).join('\n\n'), { mode: 0o600 });
    }
  } catch (e) { error = String(e); }
  const s = state as { status?: string; stops?: Array<{ stopId: string; wordCount: number; targetWords: number; audit?: { status: string; value?: { findings?: Array<{ classification: string }>; languageReview?: unknown } } }>; introduction?: { wordCount: number; audit?: unknown } } | undefined;
  const stops = s?.stops?.filter(r => r.stopId !== 'tour-welcome') ?? [];
  const intro = s?.introduction ?? s?.stops?.find(r => r.stopId === 'tour-welcome');
  const summary = {
    strategy: mode, status: error ? 'partial' : s?.status, error, elapsedMs: Date.now() - started, calls: calls.length,
    writerCalls: calls.filter(c => c.role === 'writer').length, auditorCalls: calls.filter(c => c.role === 'auditor').length,
    writerMs: calls.filter(c => c.role === 'writer').reduce((n, c) => n + c.elapsedMs, 0),
    auditorMs: calls.filter(c => c.role === 'auditor').reduce((n, c) => n + c.elapsedMs, 0),
    writerUsage: totalUsage(calls.filter(c => c.role === 'writer')), auditorUsage: totalUsage(calls.filter(c => c.role === 'auditor')), totalUsage: totalUsage(calls),
    delivery: evaluateNarrationDeliveryV8(frozen.materials.map(m => ({ targetWords: m.targetWords, actualWords: stops.find(r => r.stopId === m.stopId)?.wordCount ?? 0 }))),
    stops: stops.map(r => ({ stopId: r.stopId, words: r.wordCount, target: r.targetWords, auditStatus: r.audit?.status, objections: r.audit?.value?.findings?.filter(f => !['supported', 'authorized_inference'].includes(f.classification)).length, languageReview: r.audit?.value?.languageReview })),
    welcome: intro, inputsSha256: manifest.inputsSha256, apiSpendUsd: 0, quotaPercentageMeasured: false, publicationPassed: false,
  };
  save(join(arm, 'review.private.json'), state ?? { error });
  save(join(arm, 'summary.private.json'), summary);
  console.log(JSON.stringify({ strategy: mode, status: summary.status, seconds: summary.elapsedMs / 1000, calls: summary.calls, tokens: summary.totalUsage }));
  if (error || summary.status !== 'complete_needs_review') process.exitCode = 1;
}
if (require.main === module) main().catch(e => { console.error(String(e)); process.exitCode = 1; });
