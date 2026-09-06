import { mkdtempSync, readFileSync, rmSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';
import { EventEmitter } from 'events';
import { prepareAuthorCanaryMaterialV8 } from '../narrative-author-canary-material-v8';
import { auditCodexNarrationV8, codexWriterTransportV8, loadCodexAuthorDocumentsV8, runCodexLiveNarrationV8 } from '../narrative-codex-live-v8';
import { runCodex } from '../narrative-codex-author-v8';
import { assignNarrativeSentenceIdsV6 } from '../../../src/services/poi/NarrativeEditorialV6';
import { NarrativeProgressSpendGuardV6 } from '../../../src/services/poi/NarrativeProgressSpendGuardV6';
import * as codexAuditor from '../narrative-codex-auditor-v8';
function materials(count: number) {
  const ids = Array.from({ length: count }, (_, i) => 'stop-' + i);
  const checkpoint: any = {
    route: { city: 'Villa de Prueba', country: 'País de prueba', language: 'es', durationMinutes: 45,
      stops: ids.map((stopId, i) => ({ stopId, name: 'Lugar ' + i, position: i,
        previousStopId: ids[i - 1] ?? null, nextStopId: ids[i + 1] ?? null })) },
    narrationTargets: ids.map(stopId => ({ stopId, targetWords: 100, targetSeconds: 50 })),
    research: ids.map(routeStopId => ({ routeStopId, result: { dossier: {
      stopId: routeStopId, language: 'es',
      sources: [{ sourceId: 'source-' + routeStopId, title: 'Fuente', finalUrl: 'https://example.org/' + routeStopId }],
      passages: [{ passageId: 'passage-' + routeStopId, sourceId: 'source-' + routeStopId, quote: 'Evidencia ' + routeStopId }],
      propositions: [], discrepancies: [], limits: [],
    } } })),
    arc: { stops: ids.map(stopId => ({ stopId, bridgePropositionIds: [] })) }, evidenceManifest: {},
  };
  return prepareAuthorCanaryMaterialV8(checkpoint,
    '# Autor\n\nEscribe una historia fiel.\n\n## Caso y objetivo de esta respuesta\nCaso descartado',
    '# Voz\n\n## Guion para narrar\nEjemplo de voz.\n## Notas de revisión\nNotas', 'reference-only');
}
const narration = Array.from({ length: 100 }, (_, i) => 'palabra' + i).join(' ');
const validAudit = () => ({ status: 'valid', value: { findings: [] } } as any);
describe('live Codex narration: offline, no paid inference', () => {
  let directory: string;
  beforeEach(() => {
    directory = mkdtempSync(resolve(tmpdir(), 'codex-live-test-'));
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });
  afterEach(() => { jest.restoreAllMocks(); rmSync(directory, { recursive: true, force: true }); });
  const options = (count: number) => ({
    materials: materials(count), directory, city: 'Villa de Prueba', durationMinutes: 45,
    openRouterApiKey: 'test-not-a-key', pricing: {}, runId: 'test', signal: new AbortController().signal,
    onProgress: jest.fn(), budget: () => ({ spentUsd: 0.4 }), sanitize: (e: unknown) => e instanceof Error ? e.message : 'failed',
  });
  test.each([1, 2, 3])('%i-stop material generates one text and one audit per stop without city rules', async count => {
    const write = jest.fn().mockResolvedValue({ text: narration });
    const audit = jest.fn().mockResolvedValue(validAudit());
    const state = await runCodexLiveNarrationV8(options(count), { write, audit });
    expect(state).toMatchObject({ status: 'complete_needs_review', writerAttempts: count, auditAttempts: count, publicationPassed: false, missingStopIds: [], delivery: { passed: true } });
    expect(state).toMatchObject({ auditor: 'gpt-6-astra', auditorTransport: 'codex_cli', auditorReasoning: 'low', auditorBilling: 'ChatGPT quota' });
    expect(write).toHaveBeenCalledTimes(count);
    expect(audit).toHaveBeenCalledTimes(count);
    expect(readFileSync(resolve(directory, 'tour.md'), 'utf8')).toContain('Villa de Prueba');
    if (count > 1) {
      expect(write.mock.calls[1][0]).toContain('Historial de estilo — NO es evidencia factual');
      expect(write.mock.calls[1][0]).not.toContain('Evidencia stop-0');
    }
  });
  test('persists current text before audit and keeps earlier results on provider/budget failure', async () => {
    const o = options(3);
    const audit = jest.fn().mockResolvedValueOnce(validAudit()).mockImplementationOnce(async () => {
      expect(readFileSync(resolve(directory, 'tour.md'), 'utf8')).toContain('Lugar 1');
      const saved = JSON.parse(readFileSync(resolve(directory, 'codex-author-review.private.json'), 'utf8'));
      expect(saved.stops[1].status).toBe('audit_pending');
      expect(saved.stops[1].script.text).toBe(narration);
      throw new Error('budget exhausted');
    });
    const write = jest.fn().mockResolvedValue({ text: narration });
    const state = await runCodexLiveNarrationV8(o, { write, audit });
    expect(state.status).toBe('partial');
    expect(state.stops.map(s => s.status)).toEqual(['audited', 'audit_failed']);
    expect(state.missingStopIds).toEqual(['stop-2']);
    expect(state.stops[1].script?.text).toBe(narration);
    expect(write).toHaveBeenCalledTimes(2);
    expect(state.delivery.passed).toBe(false);
  });
  test('writer failure does not invoke auditor, fallback or retries', async () => {
    const write = jest.fn().mockRejectedValue(new Error('quota unavailable'));
    const audit = jest.fn();
    const state = await runCodexLiveNarrationV8(options(2), { write, audit });
    expect(state.status).toBe('partial');
    expect(state.stops[0].status).toBe('writer_failed');
    expect(write).toHaveBeenCalledTimes(1);
    expect(audit).not.toHaveBeenCalled();
  });
  test('preserves factual objections and short narration without auto-repair or approval', async () => {
    const audit = jest.fn().mockResolvedValue({ status: 'valid', value: { findings: [{ classification: 'unsupported', sentenceId: 's1' }] } });
    const write = jest.fn().mockResolvedValue({ text: 'Texto corto.' });
    const state = await runCodexLiveNarrationV8(options(1), { write, audit });
    expect(state.status).toBe('complete_needs_review');
    expect(state.delivery.passed).toBe(false);
    expect(state.publicationPassed).toBe(false);
    expect(readFileSync(resolve(directory, 'tour.md'), 'utf8')).toContain('hallazgos a revisar: 1');
    expect(write).toHaveBeenCalledTimes(1);
  });
  test('cancellation between writer and auditor preserves narration without an audit call', async () => {
    const controller = new AbortController(), audit = jest.fn();
    const state = await runCodexLiveNarrationV8({ ...options(2), signal: controller.signal }, {
      write: async () => { controller.abort(); return { text: narration }; }, audit,
    });
    expect(state.status).toBe('partial');
    expect(state.stops[0].script?.text).toBe(narration);
    expect(audit).not.toHaveBeenCalled();
  });
  test('audit receives same guard, exact canonical context, one-attempt policy and no writer charge', async () => {
    const o = options(1), m = o.materials[0];
    const guard = new NarrativeProgressSpendGuardV6({ limitUsd: 2, historicalSpendUsd: 0.4, path: resolve(directory, 'spend.jsonl') });
    const onProgress: any = jest.fn();
    const request = jest.spyOn(codexAuditor, 'requestCodexAuditV8').mockImplementation(async (r: any) => {
      return { ...validAudit(), transport: 'codex_cli', billing: 'ChatGPT quota', apiSpendUsd: 0, requestedModel: 'gpt-6-astra', reasoning: 'low' } as any;
    });
    await auditCodexNarrationV8(m, assignNarrativeSentenceIdsV6(m.stopId, narration), {
      ...o, onProgress, pricing: {}, openRouterApiKey: '',
    });
    const r: any = request.mock.calls[0][0];
    expect(r.input.canonicalContext).toEqual(m.canonicalContext);
    expect(r.input.sentences).toEqual(assignNarrativeSentenceIdsV6(m.stopId, narration).sentences);
    expect(r.signal).toBe(o.signal);
    expect(request).toHaveBeenCalledTimes(1);
    expect(onProgress).not.toHaveBeenCalled();
    expect(r.systemPrompt).toBe(m.frozen.auditPrompt);
    expect(guard.snapshot().spentUsd).toBeCloseTo(0.4);
    expect(guard.snapshot().runReportedCostUsd).toBeCloseTo(0);
    guard.assertSettled();
  });
  test('auditor state is gpt-6-astra, transport codex_cli, reasoning low, billing ChatGPT quota', async () => {
    const o = options(1), m = o.materials[0];
    const request = jest.spyOn(codexAuditor, 'requestCodexAuditV8').mockImplementation(async () => ({
      ...validAudit(), transport: 'codex_cli', billing: 'ChatGPT quota', apiSpendUsd: 0, requestedModel: 'gpt-6-astra', reasoning: 'low',
    } as any));
    const result = await auditCodexNarrationV8(m, assignNarrativeSentenceIdsV6(m.stopId, narration), { ...o, pricing: {}, openRouterApiKey: '' });
    expect(result).toMatchObject({ status: 'valid', transport: 'codex_cli', billing: 'ChatGPT quota', requestedModel: 'gpt-6-astra', reasoning: 'low' });
    expect(request).toHaveBeenCalledTimes(1);
  });
  test('loads existing author assets and validates CLI without network', () => {
    expect(loadCodexAuthorDocumentsV8().template).toContain('## Caso y objetivo');
    expect(codexWriterTransportV8(undefined, 'qwen38_hybrid', false)).toBe('openrouter');
    expect(codexWriterTransportV8('codex', 'qwen38_hybrid', false)).toBe('codex');
    expect(() => codexWriterTransportV8('typo', 'qwen38_hybrid', false)).toThrow();
    expect(() => codexWriterTransportV8('codex', 'balanced_openrouter', false)).toThrow();
    expect(() => codexWriterTransportV8('codex', 'qwen38_hybrid', true)).toThrow('resume');
  });
  test('pre-aborted Codex subprocess does not spawn', async () => {
    const controller = new AbortController(); controller.abort();
    const spawnProcess: any = jest.fn();
    const result = await runCodex('prompt', directory, {}, { signal: controller.signal, spawnProcess });
    expect(result.error).toBe('Codex cancelled');
    expect(spawnProcess).not.toHaveBeenCalled();
  });
  test('parent abort terminates active Codex subprocess and removes listener', async () => {
    const controller = new AbortController();
    const remove = jest.spyOn(controller.signal, 'removeEventListener');
    const child: any = new EventEmitter();
    child.stdout = new EventEmitter(); child.stderr = new EventEmitter(); child.stdin = new EventEmitter();
    child.stdin.end = jest.fn(); child.kill = jest.fn(() => { child.emit('close', null); return true; });
    const pending = runCodex('prompt', directory, {}, { signal: controller.signal, spawnProcess: (() => child) as any });
    controller.abort();
    expect((await pending).error).toBe('Codex cancelled');
    expect(child.kill).toHaveBeenCalledWith('SIGTERM');
    expect(remove).toHaveBeenCalledWith('abort', expect.any(Function));
  });
});
