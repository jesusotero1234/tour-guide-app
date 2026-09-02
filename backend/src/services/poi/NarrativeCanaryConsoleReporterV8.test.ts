import { EditorialProgressEventV6 } from './EditorialStructuredLlmV6';
import {
  NarrativeCanaryConsoleReporterV8,
  NarrativeCanaryStopDescriptorV8,
} from './NarrativeCanaryConsoleReporterV8';
import { NarrativeSpendLedgerSnapshotV6 } from './NarrativeSpendLedgerV6';

const budget: NarrativeSpendLedgerSnapshotV6 = {
  limitUsd: 2,
  historicalSpentUsd: 0.3,
  runReportedCostUsd: 0.0841,
  runUnverifiedExposureUsd: 0,
  spentUsd: 0.384148053484,
  reservedUsd: 0,
  remainingUsd: 1.615851946516,
};

const stops: NarrativeCanaryStopDescriptorV8[] = [
  {
    stopId: 'stop-alcazaba',
    position: 1,
    name: 'Alcazaba',
    wikidataId: 'Q123',
  },
  {
    stopId: 'stop-teatro',
    position: 2,
    name: 'Teatro Romano',
    wikidataId: 'Q3849447',
  },
];

function event(overrides: Partial<EditorialProgressEventV6> = {}): EditorialProgressEventV6 {
  return {
    event: 'attempt_started',
    at: '2026-09-02T10:03:11.000Z',
    callId: 'call-writer',
    phase: 'writer',
    stopId: 'stop-alcazaba',
    runId: 'run-5',
    profile: 'qwen38_hybrid',
    requestedModel: 'qwen3:8b',
    requestedEndpoint: 'http://127.0.0.1:8080/v1?api_key=do-not-print',
    reasoning: 'none',
    attempt: 1,
    ...overrides,
  };
}

function harness(options: { sanitizeText?: (value: string) => string } = {}) {
  const lines: string[] = [];
  const reporter = new NarrativeCanaryConsoleReporterV8({
    writeLine: (line) => lines.push(line),
    heartbeatIntervalMs: 30_000,
    now: () => new Date('2026-09-02T10:00:00.000Z'),
    ...options,
  });
  reporter.registerStops(stops);
  return { lines, reporter };
}

describe('NarrativeCanaryConsoleReporterV8', () => {
  it('prints run and stage lifecycle in compact Spanish lines', () => {
    const { lines, reporter } = harness();

    reporter.runStarted({
      city: 'Málaga',
      runId: 'run-5',
      profile: 'qwen38_hybrid',
    });
    reporter.stageSkipped('research', 'checkpoint run-4 · 7 paradas');
    reporter.stageStarted(
      'editorial_workflow',
      '7 paradas · 1 parada a la vez; auditores A+B en paralelo'
    );
    reporter.stageCompleted('editorial_workflow', 'estado=draft_review_required');
    reporter.runCompleted({
      status: 'draft_review_required',
      elapsedMs: 62_000,
      checkpointPath: '/tmp/run-5/checkpoint.private.json',
      diagnosticsPath: '/tmp/run-5/diagnostics.private.json',
      progressPath: '/tmp/run-5/progress.private.jsonl',
      budget,
    });

    expect(lines[0]).toContain('▶ CANARIO · Málaga · perfil=qwen38_hybrid · run=run-5');
    expect(lines[1]).toContain('↷ INVESTIGACIÓN · checkpoint run-4 · 7 paradas');
    expect(lines[2]).toContain('▶ EDITORIAL · 7 paradas');
    expect(lines[3]).toContain('✓ EDITORIAL · estado=draft_review_required');
    expect(lines[4]).toContain('✓ CANARIO · estado=draft_review_required · 1 min 2 s');
    expect(lines[5]).toContain('checkpoint=/tmp/run-5/checkpoint.private.json');
    expect(lines.every((line) => !line.includes('\u001b'))).toBe(true);
    expect(lines.every((line) => !line.includes('\r'))).toBe(true);
  });

  it.each([
    ['research_preflight', 'PREPARANDO INVESTIGACIÓN'],
    ['preflight', 'VALIDACIÓN DE SERVICIOS'],
    ['candidate_loading', 'CARGA DE CANDIDATOS'],
    ['route', 'RUTA'],
    ['boundary', 'LÍMITE DE EVIDENCIA'],
    ['arc', 'ARCO NARRATIVO'],
    ['scorecard', 'EVALUACIÓN FINAL'],
    ['artifact_write', 'GUARDADO DE RESULTADOS'],
  ])('uses a readable Spanish label for stage %s', (stage, label) => {
    const { lines, reporter } = harness();

    reporter.stageStarted(stage, 'en curso');

    expect(lines[0]).toContain(`▶ ${label} · en curso`);
  });

  it('identifies the stop, operation, model and attempt without exposing the endpoint', () => {
    const { lines, reporter } = harness();

    reporter.onProgress(event(), budget);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('[1/2] ▶ ESCRITURA');
    expect(lines[0]).toContain('Alcazaba (Q123)');
    expect(lines[0]).toContain('qwen3:8b');
    expect(lines[0]).toContain('intento 1');
    expect(lines[0]).not.toContain('127.0.0.1');
    expect(lines[0]).not.toContain('do-not-print');
  });

  it('prints heartbeats every 30 seconds independently for concurrent calls', () => {
    const { lines, reporter } = harness();

    reporter.onProgress(event({
      callId: 'call-a',
      phase: 'auditor_a',
      at: '2026-09-02T10:00:00.000Z',
    }), budget);
    reporter.onProgress(event({
      callId: 'call-b',
      phase: 'auditor_b',
      at: '2026-09-02T10:00:10.000Z',
    }), budget);
    lines.length = 0;

    reporter.onProgress(event({
      event: 'heartbeat',
      callId: 'call-a',
      phase: 'auditor_a',
      at: '2026-09-02T10:00:15.000Z',
      attempt: undefined,
    }), budget);
    reporter.onProgress(event({
      event: 'heartbeat',
      callId: 'call-b',
      phase: 'auditor_b',
      at: '2026-09-02T10:00:25.000Z',
      attempt: undefined,
    }), budget);
    expect(lines).toHaveLength(0);

    reporter.onProgress(event({
      event: 'heartbeat',
      callId: 'call-a',
      phase: 'auditor_a',
      at: '2026-09-02T10:00:30.000Z',
      attempt: undefined,
    }), budget);
    reporter.onProgress(event({
      event: 'heartbeat',
      callId: 'call-b',
      phase: 'auditor_b',
      at: '2026-09-02T10:00:40.000Z',
      attempt: undefined,
    }), budget);
    reporter.onProgress(event({
      event: 'heartbeat',
      callId: 'call-a',
      phase: 'auditor_a',
      at: '2026-09-02T10:00:45.000Z',
      attempt: undefined,
    }), budget);
    reporter.onProgress(event({
      event: 'heartbeat',
      callId: 'call-a',
      phase: 'auditor_a',
      at: '2026-09-02T10:01:00.000Z',
      attempt: undefined,
    }), budget);

    expect(lines).toHaveLength(3);
    expect(lines[0]).toContain('AUDITOR A · intento 1 · qwen3:8b · 30 s esperando al modelo');
    expect(lines[1]).toContain('AUDITOR B · intento 1 · qwen3:8b · 30 s esperando al modelo');
    expect(lines[2]).toContain('AUDITOR A · intento 1 · qwen3:8b · 60 s esperando al modelo');
  });

  it('summarizes a valid response with duration, resolved provider, cost and budget', () => {
    const { lines, reporter } = harness();

    reporter.onProgress(event(), budget);
    reporter.onProgress(event({
      event: 'attempt_finished',
      diagnostic: {
        attempt: 1,
        status: 'valid',
        latencyMs: 51_340,
        rawOutput: 'PRIVATE MODEL OUTPUT',
        error: null,
        usage: {
          inputTokens: 100,
          outputTokens: 50,
          totalTokens: 150,
          costUsd: 0.000123,
        },
        actualModel: 'deepseek-v4-flash',
        actualProvider: 'OpenInference',
      },
    }), budget);

    const line = lines[1];
    expect(line).toContain('✓ ESCRITURA · respuesta válida · 51.3 s');
    expect(line).toContain('[1/2] Alcazaba (Q123)');
    expect(line).toContain('OpenInference/deepseek-v4-flash');
    expect(line).toContain('coste=$0.000123');
    expect(line).toContain('gastado=$0.3841');
    expect(line).toContain('restante=$1.6159');
    expect(line).not.toContain('PRIVATE MODEL OUTPUT');
  });

  it('reports a rate limit without promising a retry before the next attempt starts', () => {
    const { lines, reporter } = harness();

    reporter.onProgress(event({
      phase: 'auditor_a',
      callId: 'call-a',
    }), budget);
    reporter.onProgress(event({
      event: 'attempt_finished',
      phase: 'auditor_a',
      callId: 'call-a',
      diagnostic: {
        attempt: 1,
        status: 'transport_error',
        latencyMs: 682,
        rawOutput: null,
        error: 'Request failed',
        httpStatus: 429,
        rateLimited: true,
        retryAfterMs: 5_000,
      },
    }), budget);

    expect(lines[1]).toContain('⚠ AUDITOR A · intento 1 · HTTP 429 · espera indicada=5 s');
    expect(lines[1]).not.toContain('intento 2');

    reporter.onProgress(event({
      phase: 'auditor_a',
      callId: 'call-a',
      attempt: 2,
      at: '2026-09-02T10:03:17.000Z',
    }), budget);

    expect(lines[2]).toContain('▶ AUDITOR A');
    expect(lines[2]).toContain('intento 2');
  });

  it('distinguishes a cancellation caused by another call protocol failure from a transport error', () => {
    const { lines, reporter } = harness();

    reporter.onProgress(event({
      callId: 'call-audit-3849447',
      phase: 'auditor_a',
      stopId: 'stop-teatro',
    }), budget);
    reporter.onProgress(event({
      event: 'attempt_finished',
      callId: 'call-audit-3849447',
      phase: 'auditor_a',
      stopId: 'stop-teatro',
      diagnostic: {
        attempt: 1,
        status: 'transport_error',
        latencyMs: 120,
        rawOutput: null,
        error: 'cancelled because Q969308 failed protocol validation with status semantic_error',
      },
    }), budget);

    expect(lines[1]).toContain('CANCELADA POR FALLO EDITORIAL PREVIO');
    expect(lines[1]).not.toContain('ERROR DE TRANSPORTE');
    expect(lines[1]).toContain('cancelled because Q969308 failed protocol validation with status semantic_error');
  });

  it('allowlists diagnostic fields, sanitizes errors and truncates long text', () => {
    const { lines, reporter } = harness({
      sanitizeText: (value) => value.split('SECRET').join('[REDACTED]'),
    });

    reporter.onProgress(event({
      event: 'attempt_finished',
      phase: 'adjudicator',
      callId: 'call-adjudicator',
      diagnostic: {
        attempt: 1,
        status: 'semantic_error',
        latencyMs: 1_200,
        rawOutput: 'RAW PRIVATE CONTENT',
        error: `token SECRET   ${'x'.repeat(300)}`,
      },
    }), budget);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('✗ DESEMPATE EDITORIAL · intento 1 · ERROR SEMÁNTICO');
    expect(lines[0]).toContain('[1/2] Alcazaba (Q123)');
    expect(lines[0]).toContain('[REDACTED]');
    expect(lines[0]).toContain('…');
    expect(lines[0]).not.toContain('SECRET');
    expect(lines[0]).not.toContain('RAW PRIVATE CONTENT');
    expect(lines[0]).not.toContain('HTTP  ·');
    expect(lines[0]).not.toContain('  ');
  });

  it('normalizes and sanitizes untrusted labels into one append-only line', () => {
    const lines: string[] = [];
    const reporter = new NarrativeCanaryConsoleReporterV8({
      writeLine: (line) => lines.push(line),
      sanitizeText: (value) => value.split('SECRET').join('[REDACTED]'),
    });
    reporter.registerStops([{
      stopId: 'stop-unsafe',
      position: 1,
      name: 'Nombre\nSECRET',
      wikidataId: 'Q999',
    }]);

    reporter.onProgress(event({
      stopId: 'stop-unsafe',
      requestedModel: 'model\r\nSECRET',
    }), budget);

    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain('Nombre [REDACTED]');
    expect(lines[0]).toContain('model [REDACTED]');
    expect(lines[0]).not.toContain('SECRET');
    expect(lines[0]).not.toContain('\n');
    expect(lines[0]).not.toContain('\r');
  });

  it('disables human output after one writer failure without throwing', () => {
    const failures: string[] = [];
    let writes = 0;
    const reporter = new NarrativeCanaryConsoleReporterV8({
      writeLine: () => {
        writes += 1;
        throw new Error('broken output');
      },
      onReporterError: (error) => {
        failures.push(error instanceof Error ? error.message : String(error));
      },
    });

    expect(() => reporter.runStarted({
      city: 'Málaga',
      runId: 'run-5',
      profile: 'qwen38_hybrid',
    })).not.toThrow();
    expect(() => reporter.stageStarted('editorial_workflow', '7 paradas')).not.toThrow();

    expect(writes).toBe(1);
    expect(failures).toEqual(['broken output']);
  });

  it('prints fatal context and artifact paths without claiming the last call caused the failure', () => {
    const { lines, reporter } = harness();

    reporter.onProgress(event({
      callId: 'call-repair',
      phase: 'repair',
      stopId: 'stop-teatro',
      requestedModel: 'qwen3:8b',
    }), budget);
    lines.length = 0;

    reporter.runFailed({
      stage: 'editorial_workflow',
      message: 'patch replacement cannot be empty',
      checkpointPath: '/tmp/run-5/checkpoint.private.json',
      diagnosticsPath: '/tmp/run-5/diagnostics.private.json',
      progressPath: '/tmp/run-5/progress.private.jsonl',
      budget,
    });

    const output = lines.join('\n');
    expect(output).toContain('✗ CANARIO · fase=EDITORIAL');
    expect(output).toContain('última operación observada=REPARACIÓN');
    expect(output).toContain('[2/2] Teatro Romano (Q3849447)');
    expect(output).toContain('patch replacement cannot be empty');
    expect(output).toContain('checkpoint=/tmp/run-5/checkpoint.private.json');
    expect(output).toContain('diagnóstico=/tmp/run-5/diagnostics.private.json');
    expect(output).toContain('progreso=/tmp/run-5/progress.private.jsonl');
    expect(output).toContain('gastado=$0.3841');
  });
});
