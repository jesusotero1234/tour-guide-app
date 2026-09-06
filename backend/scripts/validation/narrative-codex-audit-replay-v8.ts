import 'dotenv/config';
import { readFileSync, existsSync, mkdirSync, writeFileSync, appendFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { createHash } from 'crypto';
import Ajv from 'ajv';
import { loadNarrativeWriterBenchmarkCheckpointV8 } from './narrative-writer-benchmark-v8';
import { loadCodexAuthorDocumentsV8, CodexLiveStateV8 } from './narrative-codex-live-v8';
import { prepareAuthorCanaryMaterialV8 } from './narrative-author-canary-material-v8';
import { requestEditorialStructuredV6, EditorialPricingV6, EditorialReasoningV6, EditorialProgressCallbackV6 } from '../../src/services/poi/EditorialStructuredLlmV6';
import { compactNarrativeAuditSchemaV8, parseCompactNarrativeAuditV8 } from '../../src/services/poi/NarrativeCompactVerificationV8';
import { NarrativeProgressSpendGuardV6 } from '../../src/services/poi/NarrativeProgressSpendGuardV6';
import { calibrationControls, CANDIDATE_AUDIT_PROMPT } from './narrative-audit-calibration-v8';

export function unwrapStandaloneJsonFenceV8(raw: string): unknown {
  const trimmed = raw.trim();
  const fence = /^```(?:json)?\r?\n([\s\S]*?)\r?\n```$/.exec(trimmed);
  if (!fence) throw new Error('Not a standalone JSON fence');
  const inner = fence[1];
  if (!inner.trim()) throw new Error('Empty JSON fence');
  return JSON.parse(inner);
}

export async function main(args = process.argv.slice(2)) {
  const allowed = ['--source', '--out-dir', '--models', '--reasoning', '--prior-spend-usd', '--spend-limit-usd', '--wire-schema', '--stop-id', '--audit-variant', '--suite', '--unwrap-json-fence', '--frozen-inputs'];
  for (const arg of args) if (arg !== '--execute' && arg !== '--unwrap-json-fence' && !allowed.some(k => arg.startsWith(k + '='))) throw new Error('Unknown argument: ' + arg);
  const option = (name: string) => {
    const values = args.filter(a => a.startsWith(name + '='));
    if (values.length > 1) throw new Error('Duplicate argument: ' + name);
    return values[0]?.slice(name.length + 1);
  };
  const required = (name: string) => { const value = option(name); if (!value?.trim()) throw new Error(name + ' required'); return value; };
  const source = resolve(required('--source')), directory = resolve(required('--out-dir'));
  const models = required('--models').split(',').map(m => m.trim());
  const prior = Number(required('--prior-spend-usd')), limit = Number(required('--spend-limit-usd'));
  const reasoning = option('--reasoning') ?? 'medium';
  const wireSchema = option('--wire-schema') ?? 'full';
  const stopId = option('--stop-id')?.trim() || undefined;
  const auditVariant = option('--audit-variant') ?? 'baseline';
  const suite = option('--suite') ?? 'tour';
  const unwrapJsonFence = args.includes('--unwrap-json-fence');
  const frozenInputsRaw = option('--frozen-inputs');
  if (frozenInputsRaw !== undefined && !frozenInputsRaw.trim()) throw new Error('--frozen-inputs must not be empty');
  if (frozenInputsRaw !== undefined && (suite !== 'tour' || auditVariant !== 'baseline')) throw new Error('--frozen-inputs only allowed with suite=tour and audit-variant=baseline');
  if (!['baseline', 'claim-coverage'].includes(auditVariant)) throw new Error('Invalid audit variant');
  if (!['tour', 'controls'].includes(suite)) throw new Error('Invalid suite');
  if (!['full', 'simple'].includes(wireSchema)) throw new Error('Invalid wire schema');
  if (!['none', 'low', 'medium', 'high'].includes(reasoning)) throw new Error('Invalid reasoning');
  if (!Number.isFinite(prior) || prior < 0 || !Number.isFinite(limit) || limit <= prior) throw new Error('Invalid budget');
  if (source === directory || existsSync(directory)) throw new Error('Output must be a new directory');
  if (models.some(m => m !== 'qwen-local' && !/^[\w.-]+\/[\w.:-]+$/.test(m)) || new Set(models).size !== models.length) throw new Error('Invalid or duplicate models');
  const checkpointPath = resolve(source, 'checkpoint.private.json');
  const authorPath = resolve(source, 'codex-author-review.private.json');
  const checkpoint = loadNarrativeWriterBenchmarkCheckpointV8(checkpointPath);
  const documents = loadCodexAuthorDocumentsV8();
  const materials = prepareAuthorCanaryMaterialV8(checkpoint, documents.template, documents.reference, documents.referenceStopId);
  const original = JSON.parse(readFileSync(authorPath, 'utf8')) as CodexLiveStateV8;
  if (!Array.isArray(original.stops) || original.stops.length !== materials.length) throw new Error('Incomplete original tour');
  const claimCoverageText = 'Antes de clasificar, comprueba por separado el hecho principal y cada afirmación secundaria: profesión o título de una persona, autoría, intención, causa, identidad entre nombres, época, cantidades, acceso y visibilidad. Una cita del hecho principal no respalda automáticamente sus calificativos ni los otros fragmentos. Si una afirmación secundaria carece de evidencia, clasifica la frase completa como unsupported y nombra ese fragmento en reason. Si todo está respaldado, usa supported; si solo hay interpretación prudente, authorized_inference. La identidad y el orden de la siguiente parada autorizados por canonicalContext o bridgeEvidence no necesitan cita histórica: usa authorized_inference y passageIds vacío para un enlace puramente narrativo. No conviertas una inferencia plausible en evidencia de un hecho verificable. No uses conocimiento externo para completar lo que falta. Devuelve exclusivamente un objeto JSON cuya única clave raíz sea checks y cuyo valor sea un array de checks. Nunca devuelvas un array en la raíz, Markdown ni texto adicional. Cada check tiene exactamente sentenceId, classification, passageIds y reason; reason debe tener como máximo 300 caracteres.';
  const buildPrompt = (base: string) => auditVariant === 'claim-coverage' ? base + ' ' + claimCoverageText : base;
  let cases = suite === 'tour' ? materials.map(material => {
    const matches = original.stops.filter(s => s.stopId === material.stopId);
    const stop = matches[0], script = stop?.script;
    if (matches.length !== 1 || !script?.text?.trim() || script.stopId !== material.stopId || !script.sentences?.length
      || new Set(script.sentences.map(s => s.sentenceId)).size !== script.sentences.length) throw new Error('Invalid saved script: ' + material.stopId);
    const input = { ...material.frozen.inputs[0].auditInput, sentences: script.sentences };
    const ids = [...new Set([...input.passages, ...input.bridgeEvidence.passages].map(p => p.passageId))];
    return { stopId: material.stopId, script, input, ids, prompt: buildPrompt(material.frozen.auditPrompt), baseline: stop.audit?.value?.findings ?? [] };
  }) : calibrationControls().map(c => {
    const ids = [...new Set([...c.input.passages, ...c.input.bridgeEvidence.passages].map(p => p.passageId))];
    return { stopId: c.id, script: c.script, input: c.input, ids, prompt: buildPrompt(CANDIDATE_AUDIT_PROMPT), baseline: [], expected: c.expected };
  });
  let frozenInputPath: string | undefined;
  if (frozenInputsRaw !== undefined) {
    frozenInputPath = resolve(frozenInputsRaw);
    if (!existsSync(frozenInputPath)) throw new Error('Frozen inputs file not found: ' + frozenInputPath);
    const snapshot = JSON.parse(readFileSync(frozenInputPath, 'utf8')) as { cases: typeof cases; sourceHashes: Record<string, string> };
    if (!Array.isArray(snapshot.cases)) throw new Error('Frozen snapshot missing cases array');
    if (snapshot.sourceHashes === null || typeof snapshot.sourceHashes !== 'object' || Array.isArray(snapshot.sourceHashes)) throw new Error('Frozen snapshot sourceHashes must be a nonnull object');
    const currentHashes = Object.fromEntries([checkpointPath, authorPath].map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
    for (const p of [checkpointPath, authorPath]) {
      if (!snapshot.sourceHashes[p]) throw new Error('Frozen snapshot missing sourceHashes for ' + p);
      if (snapshot.sourceHashes[p] !== currentHashes[p]) throw new Error('Frozen snapshot sourceHashes mismatch for ' + p);
    }
    if (snapshot.cases.length !== cases.length) throw new Error('Frozen snapshot cases count mismatch: ' + snapshot.cases.length + ' vs ' + cases.length);
    const originalStopIds = new Set(cases.map(c => c.stopId));
    const snapshotStopIds = new Set(snapshot.cases.map(c => c.stopId));
    if (snapshotStopIds.size !== snapshot.cases.length) throw new Error('Frozen snapshot has duplicate stopIds');
    for (const id of originalStopIds) if (!snapshotStopIds.has(id)) throw new Error('Frozen snapshot missing stopId: ' + id);
    for (const id of snapshotStopIds) if (!originalStopIds.has(id)) throw new Error('Frozen snapshot has unexpected stopId: ' + id);
    for (const snapCase of snapshot.cases) {
      const origCase = cases.find(c => c.stopId === snapCase.stopId);
      if (!origCase) throw new Error('Frozen snapshot case not found for stopId: ' + snapCase.stopId);
      if (JSON.stringify(snapCase.script) !== JSON.stringify(origCase.script)) throw new Error('Frozen snapshot script mismatch for stopId: ' + snapCase.stopId);
      if (JSON.stringify(snapCase.input.sentences) !== JSON.stringify(origCase.script.sentences)) throw new Error('Frozen snapshot input.sentences mismatch for stopId: ' + snapCase.stopId);
      if (JSON.stringify(snapCase.input.passages) !== JSON.stringify(origCase.input.passages)) throw new Error('Frozen snapshot input.passages mismatch for stopId: ' + snapCase.stopId);
      if (JSON.stringify(snapCase.input.bridgeEvidence.passages) !== JSON.stringify(origCase.input.bridgeEvidence.passages)) throw new Error('Frozen snapshot input.bridgeEvidence.passages mismatch for stopId: ' + snapCase.stopId);
      const expectedIds = [...new Set([...snapCase.input.passages, ...snapCase.input.bridgeEvidence.passages].map(p => p.passageId))];
      if (JSON.stringify(snapCase.ids) !== JSON.stringify(expectedIds)) throw new Error('Frozen snapshot ids mismatch for stopId: ' + snapCase.stopId);
      if (!snapCase.prompt?.trim()) throw new Error('Frozen snapshot prompt is blank for stopId: ' + snapCase.stopId);
      if (JSON.stringify(snapCase.baseline) !== JSON.stringify(origCase.baseline)) throw new Error('Frozen snapshot baseline mismatch for stopId: ' + snapCase.stopId);
    }
    cases = snapshot.cases;
  }
  if (stopId && !cases.some(c => c.stopId === stopId)) throw new Error('No saved stop matches --stop-id: ' + stopId);
  const selectedCases = stopId ? cases.filter(c => c.stopId === stopId) : cases;
  if (!args.includes('--execute')) {
    console.log(JSON.stringify({ dryRun: true, source, directory, models, reasoning, stopId: stopId ?? null, auditVariant, suite, frozenInputs: frozenInputPath ?? null, calls: models.length * selectedCases.length, remainingUsd: limit - prior }));
    return;
  }
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const remote = models.some(m => m !== 'qwen-local');
  if (remote && !key) throw new Error('OPENROUTER_API_KEY required');
  const clean = (value: unknown) => { const message = String(value instanceof Error ? value.message : value); return key ? message.split(key).join('[redacted]') : message; };
  const response = remote ? await fetch('https://openrouter.ai/api/v1/models', { signal: AbortSignal.timeout(30000) }) : null;
  if (response && !response.ok) throw new Error('Catalog HTTP ' + response.status);
  const catalog = (response ? await response.json() : { data: [] }) as { data: Array<{ id: string; pricing: { prompt: string; completion: string; request?: string }; supported_parameters?: string[] }> };
  const pricing = new Map<string, EditorialPricingV6>();
  const aliases = new Map<string, string[]>();
  for (const model of models) {
    if (model === 'qwen-local') continue;
    const entry = catalog.data.find(m => m.id === model);
    const input = Number(entry?.pricing.prompt), output = Number(entry?.pricing.completion), request = Number(entry?.pricing.request ?? 0);
    if (!entry || !Number.isFinite(input) || input <= 0 || !Number.isFinite(output) || output <= 0 || !Number.isFinite(request) || request < 0) throw new Error('Missing model/pricing: ' + model);
    pricing.set(model, { inputUsdPerToken: input, outputUsdPerToken: output, requestUsd: request });
    const endpointResponse = await fetch('https://openrouter.ai/api/v1/models/' + model + '/endpoints', { signal: AbortSignal.timeout(30000) });
    if (!endpointResponse.ok) throw new Error('Endpoint preflight failed: ' + model);
    const endpoints = await endpointResponse.json() as { data: { endpoints: Array<{ name: string; pricing: { prompt: string; completion: string; request?: string } }> } };
    if (!endpoints.data?.endpoints?.length) throw new Error('No endpoints: ' + model);
    aliases.set(model, [...new Set(endpoints.data.endpoints.map(e => e.name.split('|').pop()!.trim()).filter(n => n.startsWith(model.split('/')[0] + '/')))]);
    for (const endpoint of endpoints.data.endpoints) {
      const p = Number(endpoint.pricing.prompt), c = Number(endpoint.pricing.completion), r = Number(endpoint.pricing.request ?? 0);
      if (![p, c, r].every(n => Number.isFinite(n) && n >= 0)) throw new Error('Invalid endpoint pricing');
      const previous = pricing.get(model)!;
      pricing.set(model, { inputUsdPerToken: Math.max(previous.inputUsdPerToken, p), outputUsdPerToken: Math.max(previous.outputUsdPerToken, c), requestUsd: Math.max(previous.requestUsd ?? 0, r) });
    }
  }
  mkdirSync(dirname(directory), { recursive: true, mode: 0o700 });
  mkdirSync(directory, { mode: 0o700 });
  const save = (name: string, value: unknown) => writeFileSync(resolve(directory, name), JSON.stringify(value, null, 2) + '\n', { mode: 0o600 });
  const hashes = Object.fromEntries([checkpointPath, authorPath].map(p => [p, createHash('sha256').update(readFileSync(p)).digest('hex')]));
  save('inputs.private.json', { sourceHashes: hashes, cases: selectedCases, models, reasoning, wireSchema, stopId: stopId ?? null, auditVariant, suite, unwrapJsonFence, frozenInputs: frozenInputPath ?? null, pricing: Object.fromEntries(pricing), acceptedModels: Object.fromEntries(aliases), baselineAuditor: original.auditor });
  const guard = new NarrativeProgressSpendGuardV6({ limitUsd: limit, historicalSpendUsd: prior, path: resolve(directory, 'spend.private.jsonl') });
  const controller = new AbortController();
  const interrupt = () => controller.abort(new Error('Replay interrupted'));
  process.once('SIGINT', interrupt); process.once('SIGTERM', interrupt);
  const onProgress: EditorialProgressCallbackV6 = event => {
    guard.record(event);
    appendFileSync(resolve(directory, 'progress.private.jsonl'), JSON.stringify({ ...event, budget: guard.snapshot() }) + '\n', { mode: 0o600 });
  };
  type Row = { model: string; stopId: string; status: string; actualModel?: string; actualProvider?: string; costUsd: number | null; latencyMs: number; disagreements: Array<{ sentenceId: string; text: string; baseline: string; candidate: string; reason: string }>; controlChecks?: Array<{ sentenceId: string; expectedAccepted: boolean | undefined; actualAccepted: boolean; correct: boolean }>; normalized?: boolean };
  const rows: Row[] = [];
  let status = 'running', error: string | null = null;
  const persist = () => {
    save('results.private.json', { status, error, baselineIsGroundTruth: false, rows, budget: guard.snapshot() });
    const lines = ['# Comparación de auditores', '', 'Estado: ' + status, '', 'Los desacuerdos con GPT-5.4 requieren revisión humana; la referencia no es verdad establecida.', '', '| Modelo | Auditorías | Coste USD | Tiempo acumulado s | Desacuerdos de clasificación |', '|---|---:|---:|---:|---:|'];
    for (const model of models) {
      const selected = rows.filter(r => r.model === model);
      const cost = selected.length && selected.every(r => r.costUsd !== null) ? selected.reduce((s, r) => s + r.costUsd!, 0).toFixed(6) : 'desconocido';
      lines.push(`| ${model} | ${selected.length}/${selectedCases.length} | ${cost} | ${(selected.reduce((s, r) => s + r.latencyMs, 0) / 1000).toFixed(1)} | ${selected.reduce((s, r) => s + r.disagreements.length, 0)} |`);
    }
    for (const row of rows) for (const d of row.disagreements) lines.push('', `## ${row.model} · ${d.sentenceId}`, '', d.text, '', `${d.baseline} → ${d.candidate}: ${d.reason}`);
    if (suite === 'controls') {
      const mismatches = rows.reduce((s, r) => s + (r.controlChecks?.filter(c => !c.correct).length ?? 0), 0);
      lines.push('', `Desacuerdos de control: ${mismatches}`);
    }
    if (error) lines.push('', 'Error: ' + error);
    writeFileSync(resolve(directory, 'comparison.md'), lines.join('\n') + '\n', { mode: 0o600 });
  };
  persist();
  try {
    for (const [mi, model] of models.entries()) for (const item of selectedCases) {
      controller.signal.throwIfAborted();
      console.log('Auditando ' + model + ' · ' + item.stopId);
      const fullSchema = compactNarrativeAuditSchemaV8(item.script, item.ids);
      const checkFullSchema = new Ajv({ strict: true, validateFormats: false }).compile(fullSchema);
      // Some providers cannot compile the large nested enums/array limits. The
      // original constraints are still checked locally before accepting output.
      const simplify = (value: unknown): unknown => {
        if (Array.isArray(value)) return value.map(simplify);
        if (!value || typeof value !== 'object') return value;
        return Object.fromEntries(Object.entries(value).filter(([k]) => !['enum', 'minItems', 'maxItems', 'minLength', 'maxLength'].includes(k)).map(([k, v]) => [k, simplify(v)]));
      };
      const result = await requestEditorialStructuredV6({
        callId: `replay-${mi}-${item.stopId}`, provider: model === 'qwen-local'
          ? { kind: 'qwen_local', model, endpoint: 'http://127.0.0.1:8080/v1' }
          : { kind: 'openrouter', model, acceptedModels: aliases.get(model) },
        options: { openRouterApiKey: key, pricing: pricing.get(model), reasoning: model === 'qwen-local' ? 'none' : reasoning as EditorialReasoningV6,
          maxTokens: 8000, requestAttempts: 1, rateLimitAttempts: 1, requestTimeoutMs: 180000,
          includePreviousResponseOnSemanticRetry: false, runId: 'audit-replay', stopId: item.stopId, phase: 'auditor_b', onProgress, signal: controller.signal },
        input: item.input, systemPrompt: item.prompt, schema: wireSchema === 'simple' ? simplify(fullSchema) as Record<string, unknown> : fullSchema,
        toolName: 'verify_narrative_compact_v8', toolDescription: 'Verifica cada frase con evidencia admitida.',
        inputCharacterLimit: 120000, schemaCharacterLimit: 60000,
        validate: value => {
          if (!checkFullSchema(value)) throw new Error('Original audit schema validation failed: ' + JSON.stringify(checkFullSchema.errors));
          return parseCompactNarrativeAuditV8(value, item.script, item.ids);
        },
      });
      save(`${mi}-${item.stopId}.private.json`, result);
      let effectiveResult = result;
      if (unwrapJsonFence && result.status === 'malformed_response' && typeof result.rawOutput === 'string') {
        try {
          const recovered = unwrapStandaloneJsonFenceV8(result.rawOutput);
          if (!checkFullSchema(recovered)) throw new Error('Recovered fence failed schema');
          const parsed = parseCompactNarrativeAuditV8(recovered, item.script, item.ids);
          effectiveResult = { ...result, status: 'valid', value: parsed };
          save(`${mi}-${item.stopId}.normalized.private.json`, { normalization: 'markdown_fence', originalStatus: result.status, value: parsed });
        } catch {
          // retain original failure
        }
      }
      const disagreements = (effectiveResult.value?.findings ?? []).flatMap(f => {
        const baseline = item.baseline.find(b => b.sentenceId === f.sentenceId);
        return baseline && baseline.classification !== f.classification ? [{ sentenceId: f.sentenceId, text: item.script.sentences.find(s => s.sentenceId === f.sentenceId)!.text, baseline: baseline.classification, candidate: f.classification, reason: f.reason }] : [];
      });
      const controlChecks = suite === 'controls' && 'expected' in item && item.expected ? (effectiveResult.value?.findings ?? []).map(f => {
        const index = item.script.sentences.findIndex(s => s.sentenceId === f.sentenceId);
        const actualAccepted = ['supported', 'authorized_inference'].includes(f.classification);
        const expectedAccepted = item.expected?.[index];
        return { sentenceId: f.sentenceId, expectedAccepted, actualAccepted, correct: expectedAccepted !== undefined ? expectedAccepted === actualAccepted : true };
      }) : undefined;
      rows.push({ model, stopId: item.stopId, status: effectiveResult.status, actualModel: result.actualModel, actualProvider: result.actualProvider ?? undefined,
        costUsd: result.usage?.costUsd ?? null, latencyMs: result.attempts.reduce((sum, attempt) => sum + attempt.latencyMs, 0), disagreements, controlChecks, normalized: effectiveResult !== result });
      persist();
      if (effectiveResult.status !== 'valid' || !effectiveResult.value) throw new Error('Audit failed: ' + effectiveResult.status);
    }
    guard.assertSettled(); status = 'complete';
  } catch (cause) { status = 'incomplete'; error = clean(cause); process.exitCode = 1; }
  finally { persist(); process.removeListener('SIGINT', interrupt); process.removeListener('SIGTERM', interrupt); }
  console.log(JSON.stringify({ status, error, directory, budget: guard.snapshot() }));
}

if (require.main === module) main().catch(() => { console.error('Replay preflight failed; check arguments, source artifacts and model availability.'); process.exitCode = 1; });
