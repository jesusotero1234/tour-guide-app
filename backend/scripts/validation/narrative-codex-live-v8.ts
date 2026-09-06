import { readFileSync, writeFileSync, mkdirSync, appendFileSync } from 'fs';
import { resolve } from 'path';
import { prepareAuthorCanaryMaterialV8, appendAuthorStyleHistoryV8 } from './narrative-author-canary-material-v8';
import { checkAuth, main as authorMain, runCodex } from './narrative-codex-author-v8';
import { assignNarrativeSentenceIdsV6 } from '../../src/services/poi/NarrativeEditorialV6';
import { evaluateNarrationDeliveryV8 } from '../../src/services/poi/NarrativeDurationTargetsV8';
import { CODEX_AUDITOR_V8, requestCodexAuditV8 } from './narrative-codex-auditor-v8';
import { EditorialPricingV6, EditorialProgressCallbackV6 } from '../../src/services/poi/EditorialStructuredLlmV6';
import { compactNarrativeAuditSchemaV8, parseCompactNarrativeAuditV8 } from '../../src/services/poi/NarrativeCompactVerificationV8';

type Material = ReturnType<typeof prepareAuthorCanaryMaterialV8>[number];
type Script = ReturnType<typeof assignNarrativeSentenceIdsV6>;
type Audit = Awaited<ReturnType<typeof auditCodexNarrationV8>>;
type WriterResult = { text: string; usage?: unknown };
export interface CodexLiveStopV8 {
  stopId: string; name: string; targetWords: number; wordCount: number;
  status: 'writing' | 'audit_pending' | 'audited' | 'writer_failed' | 'audit_failed';
  script?: Script; audit?: Audit; usage?: unknown; error?: string;
}
export interface CodexLiveStateV8 {
  status: 'running' | 'complete_needs_review' | 'partial';
  publicationPassed: false;
  writer: { transport: 'codex_cli'; model: 'gpt-6-astra'; reasoning: 'low'; billing: 'ChatGPT quota' };
  auditor: string;
  auditorTransport?: 'codex_cli';
  auditorReasoning?: 'low';
  auditorBilling?: 'ChatGPT quota';
  writerAttempts: number; auditAttempts: number;
  stops: CodexLiveStopV8[];
  missingStopIds: string[];
  delivery: ReturnType<typeof evaluateNarrationDeliveryV8>;
  error?: string;
}
export function codexWriterTransportV8(value: string | undefined, profile: string, hasResume: boolean) {
  const transport = value ?? 'openrouter';
  if (transport !== 'openrouter' && transport !== 'codex') throw new Error('--writer-transport must be openrouter or codex');
  if (transport === 'codex' && profile !== 'qwen38_hybrid') throw new Error('Codex live canary currently requires --profile=qwen38_hybrid');
  if (transport === 'codex' && hasResume) throw new Error('Codex live canary requires a new run; resume is not supported yet');
  return transport;
}
export function loadCodexAuthorDocumentsV8() {
  // These are style/instruction assets, never city selection rules or evidence.
  const root = process.env.NARRATIVE_AUTHOR_ASSET_ROOT || resolve(__dirname, '../../../docs/operations');
  const template = readFileSync(resolve(root, 'narrative-author-context-pack-20260906/malagueta-oneshot.md'), 'utf8');
  const reference = readFileSync(resolve(root, 'narrative-plaza-mayor-reference-20260905.md'), 'utf8');
  if (!template.includes('## Caso y objetivo de esta respuesta')
    || !reference.includes('## Guion para narrar') || !reference.includes('## Notas de revisión')) throw new Error('invalid Codex author documents');
  return { template, reference, referenceStopId: 'Q1123493' };
}
export async function preflightCodexLiveV8() {
  const documents = loadCodexAuthorDocumentsV8();
  await checkAuth();
  return documents;
}
type AuditOptions = {
  openRouterApiKey: string; pricing: Record<string, EditorialPricingV6>;
  runId: string; onProgress: EditorialProgressCallbackV6; signal: AbortSignal;
  requireLanguageReview?: boolean;
};
export async function auditCodexNarrationV8(material: Material, script: Script, options: AuditOptions) {
  const input = material.frozen.inputs[0].auditInput;
  const passageIds = [...new Set([...input.passages, ...input.bridgeEvidence.passages].map(p => p.passageId))];
  const requireLanguageReview = options.requireLanguageReview === true;
  const baseSchema = compactNarrativeAuditSchemaV8(script, passageIds);
  const schema = requireLanguageReview
    ? {
        ...baseSchema,
        required: [...(baseSchema.required as string[]), 'languageReview'],
        properties: {
          ...(baseSchema.properties as Record<string, unknown>),
          languageReview: {
            type: 'object',
            additionalProperties: false,
            required: ['matchesRequestedLanguage', 'naturalForListening', 'issues'],
            properties: {
              matchesRequestedLanguage: { type: 'boolean' },
              naturalForListening: { type: 'boolean' },
              issues: { type: 'array', maxItems: 10, description: 'Only actual actionable language problems. Return an empty array when there are none. Do not include praise, successful checks, or explanations that local names are acceptable.', items: { type: 'string' } },
            },
          },
        },
      }
    : baseSchema;
  const systemPrompt = requireLanguageReview
    ? material.frozen.auditPrompt + ' Independently evaluate the requested input.language against the narration: verify that the narration matches the requested language, assess naturalness for spoken listening, and identify any language mix. Preserve canonical local names. Original passages may contain other languages.'
    : material.frozen.auditPrompt;
  return requestCodexAuditV8({
    callId: options.runId + '-codex-audit-' + material.stopId,
    signal: options.signal,
    input: { ...input, sentences: script.sentences }, systemPrompt,
    schema,
    validate: value => {
      const raw = value as Record<string, unknown> | null;
      if (requireLanguageReview && (!raw || Object.keys(raw).length !== 2 || !('checks' in raw) || !('languageReview' in raw))) throw new Error('invalid multilingual audit root');
      const parsed = parseCompactNarrativeAuditV8(requireLanguageReview ? { checks: raw!.checks } : value, script, passageIds);
      if (!requireLanguageReview) return { ...parsed, languageReview: undefined };
      const root = value as Record<string, unknown> | null;
      if (!root || typeof root !== 'object' || Array.isArray(root)) throw new Error('invalid audit root');
      const lr = root.languageReview;
      if (!lr || typeof lr !== 'object' || Array.isArray(lr)) throw new Error('missing languageReview');
      const item = lr as Record<string, unknown>;
      if (Object.keys(item).length !== 3
        || Object.keys(item).some(k => !['matchesRequestedLanguage', 'naturalForListening', 'issues'].includes(k))
        || typeof item.matchesRequestedLanguage !== 'boolean'
        || typeof item.naturalForListening !== 'boolean'
        || !Array.isArray(item.issues)
        || item.issues.length > 10
        || item.issues.some(i => typeof i !== 'string')) {
        throw new Error('invalid languageReview');
      }
      return { ...parsed, languageReview: { matchesRequestedLanguage: item.matchesRequestedLanguage, naturalForListening: item.naturalForListening, issues: item.issues as string[] } };
    },
  });
}
export function renderCodexLiveTourV8(materials: Material[], state: CodexLiveStateV8, city: string, minutes: number) {
  const words = state.stops.reduce((sum, s) => sum + s.wordCount, 0);
  return [
    '# Tour de ' + city + ' — Codex / Astra low',
    '> Estado: ' + state.status + '. Borrador para revisión, no publicado.',
    '> Duración solicitada del recorrido: ' + minutes + ' min (no son minutos de voz).',
    '> Narración generada: ' + words + ' palabras, ~' + (words / 120).toFixed(1) + ' min a 120 palabras/minuto. TTS no medido.',
    '> Ajuste a los objetivos narrativos: ' + (state.delivery.passed ? 'dentro de tolerancia' : 'pendiente / fuera de tolerancia') + '. Consulte review.json para ruta y tiempo total.',
    '> Primeras respuestas, sin reparaciones automáticas. Auditorías detalladas: codex-author-review.private.json.',
    ...materials.flatMap((m, index) => {
      const stop = state.stops.find(s => s.stopId === m.stopId);
      const objections = stop?.audit?.value?.findings.filter(f => !['supported', 'authorized_inference'].includes(f.classification)).length;
      return [
        '## ' + (index + 1) + '. ' + m.name,
        stop?.script?.text ?? '*Narración pendiente.*',
        '> Auditoría: ' + (stop?.audit?.status ?? 'no completada') + (objections !== undefined ? '; hallazgos a revisar: ' + objections : '') + (stop?.error ? '. ' + stop.error : ''),
        '### Fuentes del material',
        m.sourceUrls.filter(s => /^https?:\/\//u.test(s.url))
          .map(s => '- [' + s.title.replace(/[\r\n\[\]]/gu, ' ') + '](' + s.url + ')').join('\n'),
      ];
    }),
  ].join('\n\n') + '\n';
}
export async function runCodexLiveNarrationV8(options: AuditOptions & {
  materials: Material[]; directory: string; city: string; durationMinutes: number;
  budget: () => unknown; sanitize: (error: unknown) => string;
  onUpdate?: (state: CodexLiveStateV8) => Promise<void>;
}, deps: {
  write?: (prompt: string, outputDirectory: string, signal: AbortSignal) => Promise<WriterResult>;
  audit?: (material: Material, script: Script, options: AuditOptions) => Promise<Audit>;
} = {}): Promise<CodexLiveStateV8> {
  const { materials, directory, signal } = options;
  if (!materials.length || new Set(materials.map(m => m.stopId)).size !== materials.length
    || materials.some(m => !m.authorPrompt.trim() || !Number.isFinite(m.targetWords) || m.targetWords <= 0)) throw new Error('invalid author materials');
  const state: CodexLiveStateV8 = {
    status: 'running', publicationPassed: false,
    writer: { transport: 'codex_cli', model: 'gpt-6-astra', reasoning: 'low', billing: 'ChatGPT quota' },
    auditor: CODEX_AUDITOR_V8.model, auditorTransport: CODEX_AUDITOR_V8.transport, auditorReasoning: CODEX_AUDITOR_V8.reasoning, auditorBilling: CODEX_AUDITOR_V8.billing, writerAttempts: 0, auditAttempts: 0, stops: [],
    missingStopIds: materials.map(m => m.stopId), delivery: evaluateNarrationDeliveryV8([]),
  };
  let saveTail: Promise<void> = Promise.resolve();
  const save = () => {
    const pendingSave = saveTail.then(async () => {
      state.missingStopIds = materials.filter(m => !state.stops.some(s => s.stopId === m.stopId && s.script)).map(m => m.stopId);
      state.delivery = evaluateNarrationDeliveryV8(materials.map(m => ({
        targetWords: m.targetWords, actualWords: state.stops.find(s => s.stopId === m.stopId)?.wordCount ?? 0,
      })));
      const snapshot = structuredClone(state);
      writeFileSync(resolve(directory, 'codex-author-review.private.json'), JSON.stringify({ ...snapshot, budget: options.budget() }, null, 2) + '\n', { mode: 0o600 });
      writeFileSync(resolve(directory, 'tour.md'), renderCodexLiveTourV8(materials, snapshot, options.city, options.durationMinutes), { mode: 0o600 });
      await options.onUpdate?.(snapshot);
    });
    saveTail = pendingSave.catch(() => {}); // A failed update must not poison the final partial save.
    return pendingSave;
  };
  const record = (stopId: string, stage: string) => {
    appendFileSync(resolve(directory, 'codex-author-progress.private.jsonl'), JSON.stringify({ at: new Date().toISOString(), stopId, stage }) + '\n', { mode: 0o600 });
    console.log('[v8-canary] Codex author · ' + stopId + ' · ' + stage);
  };
  const write = deps.write ?? (async (prompt, outputDirectory, abortSignal) => {
    const promptFile = outputDirectory + '.prompt.private.md';
    writeFileSync(promptFile, prompt, { mode: 0o600, flag: 'wx' });
    const result = await authorMain(['--prompt=' + promptFile, '--out-dir=' + outputDirectory, '--execute'], {
      run: (p, d, e) => runCodex(p, d, e, { signal: abortSignal }),
    });
    if (result.status !== 'success') throw new Error(result.error ?? 'Codex writer failed');
    return { text: readFileSync(resolve(outputDirectory, 'narration.md'), 'utf8'), usage: result.usage };
  });
  const writerRoot = resolve(directory, 'codex-author');
  mkdirSync(writerRoot, { mode: 0o700 }); // Run IDs cannot overwrite an existing author run.
  const runAudit = async (material: Material, stop: CodexLiveStopV8) => {
    state.auditAttempts++;
    record(material.stopId, 'audit_started');
    stop.audit = await (deps.audit ?? auditCodexNarrationV8)(material, stop.script!, options);
    if (stop.audit.status !== 'valid' || !stop.audit.value) throw new Error('audit failed: ' + stop.audit.status);
    if (options.requireLanguageReview) {
      const lr = (stop.audit.value as Record<string, unknown>).languageReview;
      if (!lr || typeof lr !== 'object' || Array.isArray(lr)) throw new Error('audit failed: missing languageReview');
      const lrObj = lr as Record<string, unknown>;
      if (typeof lrObj.matchesRequestedLanguage !== 'boolean' || lrObj.matchesRequestedLanguage === false) throw new Error('audit failed: languageReview.matchesRequestedLanguage is false');
    }
    stop.status = 'audited';
    record(material.stopId, 'audit_completed');
    await save();
  };
  await save();
  let previousAudit: Promise<void> | null = null;
  const auditFailure: { value?: { error: unknown } } = {};
  const assertAuditSucceeded = () => {
    if (auditFailure.value) throw auditFailure.value.error;
  };
  try {
    for (const [index, material] of materials.entries()) {
      signal.throwIfAborted();
      assertAuditSucceeded();
      const stop: CodexLiveStopV8 = { stopId: material.stopId, name: material.name, targetWords: material.targetWords, wordCount: 0, status: 'writing' };
      state.stops.push(stop);
      try {
        const history = state.stops.flatMap(s => s.script ? [{ name: s.name, text: s.script.text }] : []);
        state.writerAttempts++;
        record(material.stopId, 'writer_started');
        const result = await write(appendAuthorStyleHistoryV8(material.authorPrompt, history), resolve(writerRoot, String(index + 1)), signal);
        if (!result.text.trim()) throw new Error('Codex writer returned empty narration');
        stop.script = assignNarrativeSentenceIdsV6(material.stopId, result.text, { sentenceBoundaryPolicy: 'v8', preserveParagraphs: true });
        stop.wordCount = result.text.trim().split(/\s+/u).length;
        stop.usage = result.usage;
        stop.status = 'audit_pending';
        record(material.stopId, 'writer_completed');
        await save(); // Preserve the lookahead text even if the previous audit fails.
      } catch (error) {
        stop.status = 'writer_failed';
        stop.error = options.sanitize(error);
        throw error;
      }
      // Only writing the next stop overlaps: never queue a second audit or a second lookahead.
      await previousAudit;
      assertAuditSucceeded();
      signal.throwIfAborted();
      previousAudit = runAudit(material, stop).catch(error => {
        auditFailure.value = { error };
        stop.status = 'audit_failed';
        stop.error = options.sanitize(error);
      });
    }
    await previousAudit;
    assertAuditSucceeded();
    signal.throwIfAborted();
    state.status = 'complete_needs_review';
  } catch (error) {
    state.status = 'partial';
    state.error = options.sanitize(error);
  } finally {
    await previousAudit; // No background audit may overwrite the final state after return.
    await save();
  }
  return state;
}
