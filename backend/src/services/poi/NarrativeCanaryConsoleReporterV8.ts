import { EditorialProgressEventV6 } from './EditorialStructuredLlmV6';
import { NarrativeSpendLedgerSnapshotV6 } from './NarrativeSpendLedgerV6';

export interface NarrativeCanaryStopDescriptorV8 {
  stopId: string;
  position: number;
  name: string;
  wikidataId: string;
}

interface ActiveCallV8 {
  startedAtMs: number;
  lastHeartbeatPrintedAtMs: number;
  attempt: number;
  phase: string;
  stopId: string | null;
  requestedModel: string | null;
}

const STAGE_LABELS: Record<string, string> = {
  research_preflight: 'PREPARANDO INVESTIGACIÓN',
  preflight: 'VALIDACIÓN DE SERVICIOS',
  candidate_loading: 'CARGA DE CANDIDATOS',
  route: 'RUTA',
  research: 'INVESTIGACIÓN',
  boundary: 'LÍMITE DE EVIDENCIA',
  arc: 'ARCO NARRATIVO',
  editorial_workflow: 'EDITORIAL',
  scorecard: 'EVALUACIÓN FINAL',
  artifact_write: 'GUARDADO DE RESULTADOS',
  writer: 'ESCRITURA',
  auditor_a: 'AUDITOR A',
  auditor_b: 'AUDITOR B',
  adjudicator: 'DESEMPATE EDITORIAL',
  repair: 'REPARACIÓN',
  global_auditor: 'AUDITORÍA GLOBAL',
  core_audit: 'AUDITORÍA BASE',
};

const STATUS_LABELS: Record<string, string> = {
  transport_error: 'ERROR DE TRANSPORTE',
  malformed_response: 'RESPUESTA MALFORMADA',
  semantic_error: 'ERROR SEMÁNTICO',
  protocol_failed: 'FALLO DE PROTOCOLO',
};

function stageLabel(phase: string | null): string {
  if (!phase) return 'FASE DESCONOCIDA';
  const known = STAGE_LABELS[phase];
  if (known) return known;
  return phase.replace(/_/g, ' ').toUpperCase();
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  const s = String(d.getSeconds()).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

function formatDurationHuman(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes > 0) return `${minutes} min ${seconds} s`;
  return `${seconds} s`;
}

function formatDurationSeconds(ms: number): string {
  const seconds = ms / 1000;
  return `${seconds.toFixed(1)} s`;
}

function formatUsd(value: number, fractionDigits = 4): string {
  return `$${value.toFixed(fractionDigits)}`;
}

function sanitizeText(value: string): string {
  const collapsed = value.replace(/\r/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (collapsed.length <= 180) return collapsed;
  return `${collapsed.slice(0, 180)}…`;
}

function normalizeLine(value: string): string {
  return value.replace(/\r/g, '').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

export class NarrativeCanaryConsoleReporterV8 {
  private readonly writeLine: (line: string) => void;
  private readonly heartbeatIntervalMs: number;
  private readonly now: () => Date;
  private readonly sanitize: (value: string) => string;
  private readonly onReporterError?: (error: unknown) => void;
  private readonly stops: Map<string, NarrativeCanaryStopDescriptorV8> = new Map();
  private readonly stopsByWikidata: Map<string, NarrativeCanaryStopDescriptorV8> = new Map();
  private readonly activeCalls: Map<string, ActiveCallV8> = new Map();
  private reporterDisabled = false;
  private lastObservedPhase: string | null = null;
  private lastObservedStopId: string | null = null;

  constructor(options: {
    writeLine?: (line: string) => void;
    heartbeatIntervalMs?: number;
    now?: () => Date;
    sanitizeText?: (value: string) => string;
    onReporterError?: (error: unknown) => void;
  } = {}) {
    this.writeLine = options.writeLine ?? ((line: string) => process.stdout.write(line + '\n'));
    this.heartbeatIntervalMs = options.heartbeatIntervalMs ?? 30000;
    this.now = options.now ?? (() => new Date());
    this.sanitize = options.sanitizeText ?? ((value: string) => value);
    this.onReporterError = options.onReporterError;
  }

  registerStops(stops: NarrativeCanaryStopDescriptorV8[]): void {
    for (const stop of stops) {
      this.stops.set(stop.stopId, stop);
      this.stopsByWikidata.set(stop.wikidataId, stop);
    }
  }

  runStarted(input: { city: string; runId: string; profile: string }): void {
    const time = formatTime(this.now().toISOString());
    this.emit(
      `[${time}] [v8-canary] ▶ CANARIO · ${input.city} · perfil=${input.profile} · run=${input.runId}`
    );
  }

  stageSkipped(phase: string, detail: string): void {
    const time = formatTime(this.now().toISOString());
    const label = stageLabel(phase);
    const short = detail.replace(/\s+/g, ' ').trim();
    this.emit(`[${time}] [v8-canary] ↷ ${label} · ${short}`);
  }

  stageStarted(phase: string, detail: string): void {
    const time = formatTime(this.now().toISOString());
    const label = stageLabel(phase);
    const short = detail.replace(/\s+/g, ' ').trim();
    this.emit(`[${time}] [v8-canary] ▶ ${label} · ${short}`);
  }

  stageCompleted(phase: string, detail: string): void {
    const time = formatTime(this.now().toISOString());
    const label = stageLabel(phase);
    this.emit(`[${time}] [v8-canary] ✓ ${label} · ${detail}`);
  }

  runCompleted(input: {
    status: string;
    elapsedMs: number;
    checkpointPath: string;
    diagnosticsPath: string;
    progressPath: string;
    budget: NarrativeSpendLedgerSnapshotV6;
  }): void {
    const time = formatTime(this.now().toISOString());
    const duration = formatDurationHuman(input.elapsedMs);
    this.emit(
      `[${time}] [v8-canary] ✓ CANARIO · estado=${input.status} · ${duration}`
    );
    this.emit(
      `[${time}] [v8-canary] checkpoint=${input.checkpointPath} · diagnóstico=${input.diagnosticsPath} · progreso=${input.progressPath} · gastado=${formatUsd(input.budget.spentUsd)} · restante=${formatUsd(input.budget.remainingUsd)}`
    );
  }

  runFailed(input: {
    stage: string;
    message: string;
    checkpointPath: string;
    diagnosticsPath: string;
    progressPath: string;
    budget: NarrativeSpendLedgerSnapshotV6;
  }): void {
    const time = formatTime(this.now().toISOString());
    const stageLabelLocal = stageLabel(input.stage);
    const lastOp = this.lastObservedPhase ? stageLabel(this.lastObservedPhase) : 'NO DISPONIBLE';
    const stopContext = this.stopContext(this.lastObservedStopId);
    const safeMessage = sanitizeText(this.sanitize(input.message));
    const budgetPart = `gastado=${formatUsd(input.budget.spentUsd)}`;

    const parts: string[] = [
      `✗ CANARIO · fase=${stageLabelLocal}`,
      `última operación observada=${lastOp}`,
    ];
    if (stopContext) parts.push(stopContext);
    parts.push(safeMessage);
    parts.push(budgetPart);

    this.emit(`[${time}] [v8-canary] ${parts.join(' · ')}`);
    this.emit(
      `[${time}] [v8-canary] checkpoint=${input.checkpointPath} · diagnóstico=${input.diagnosticsPath} · progreso=${input.progressPath}`
    );
  }

  onProgress(event: EditorialProgressEventV6, budget: NarrativeSpendLedgerSnapshotV6): void {
    const eventTimeMs = Date.parse(event.at);
    const time = formatTime(event.at);
    const label = stageLabel(event.phase);
    const stopContext = this.stopContext(event.stopId);

    if (event.event === 'attempt_started') {
      const attempt = event.attempt ?? 1;
      const parts: string[] = [];
      const stop = event.stopId
        ? this.stops.get(event.stopId) ?? this.stopsByWikidata.get(event.stopId)
        : undefined;
      if (stop) {
        parts.push(`[${stop.position}/${this.stops.size}] ▶ ${label}`);
        parts.push(`${stop.name} (${stop.wikidataId})`);
      } else {
        parts.push(`▶ ${label}`);
        if (stopContext) parts.push(stopContext);
      }
      if (event.requestedModel) parts.push(event.requestedModel);
      parts.push(`intento ${attempt}`);
      this.emit(`[${time}] [v8-canary] ${parts.join(' · ')}`);

      this.activeCalls.set(event.callId, {
        startedAtMs: eventTimeMs,
        lastHeartbeatPrintedAtMs: eventTimeMs,
        attempt,
        phase: event.phase ?? '',
        stopId: event.stopId,
        requestedModel: event.requestedModel ?? null,
      });
      this.lastObservedPhase = event.phase;
      this.lastObservedStopId = event.stopId;
      return;
    }

    if (event.event === 'heartbeat') {
      const call = this.activeCalls.get(event.callId);
      if (!call) return;
      const elapsedSinceLast = eventTimeMs - call.lastHeartbeatPrintedAtMs;
      if (elapsedSinceLast >= this.heartbeatIntervalMs) {
        const elapsedSeconds = Math.floor((eventTimeMs - call.startedAtMs) / 1000);
        const stopCtx = this.stopContext(call.stopId);
        const heartbeatLabel = stageLabel(call.phase);
        const parts: string[] = [`${heartbeatLabel} · intento ${call.attempt}`];
        if (call.requestedModel) parts.push(call.requestedModel);
        parts.push(`${elapsedSeconds} s esperando al modelo`);
        if (stopCtx) parts.push(stopCtx);
        parts.push('…');
        this.emit(`[${time}] [v8-canary] ${parts.join(' · ')}`);
        call.lastHeartbeatPrintedAtMs = eventTimeMs;
      }
      return;
    }

    if (event.event === 'attempt_finished') {
      const diagnostic = event.diagnostic;
      if (!diagnostic) return;

      const activeCall = this.activeCalls.get(event.callId);
      const resolvedPhase = event.phase ?? activeCall?.phase ?? '';
      const resolvedStopId = event.stopId ?? activeCall?.stopId ?? null;
      const resolvedLabel = stageLabel(resolvedPhase);
      const resolvedStopContext = this.stopContext(resolvedStopId);

      const attempt = diagnostic.attempt;
      const duration = formatDurationSeconds(diagnostic.latencyMs);

      if (diagnostic.status === 'valid') {
        const parts: string[] = [`✓ ${resolvedLabel}`, 'respuesta válida', duration];
        if (diagnostic.actualProvider && diagnostic.actualModel) {
          parts.push(`${diagnostic.actualProvider}/${diagnostic.actualModel}`);
        }
        if (diagnostic.usage?.costUsd !== undefined) {
          parts.push(`coste=${formatUsd(diagnostic.usage.costUsd, 6)}`);
        }
        parts.push(`gastado=${formatUsd(budget.spentUsd)}`);
        parts.push(`restante=${formatUsd(budget.remainingUsd)}`);
        if (resolvedStopContext) parts.push(resolvedStopContext);
        this.emit(`[${time}] [v8-canary] ${parts.join(' · ')}`);
      } else if (diagnostic.rateLimited) {
        const parts: string[] = [`⚠ ${resolvedLabel}`, `intento ${attempt}`];
        if (diagnostic.httpStatus !== undefined) {
          parts.push(`HTTP ${diagnostic.httpStatus}`);
        } else {
          parts.push('límite de tasa');
        }
        if (diagnostic.retryAfterMs !== undefined) {
          const seconds = Math.round(diagnostic.retryAfterMs / 1000);
          parts.push(`espera indicada=${seconds} s`);
        }
        parts.push(duration);
        parts.push(`gastado=${formatUsd(budget.spentUsd)}`);
        parts.push(`restante=${formatUsd(budget.remainingUsd)}`);
        if (resolvedStopContext) parts.push(resolvedStopContext);
        this.emit(`[${time}] [v8-canary] ${parts.join(' · ')}`);
      } else {
        const isProtocolFailureCancellation =
          diagnostic.status === 'transport_error' &&
          diagnostic.error?.includes('failed protocol validation with status');
        const statusLabel = isProtocolFailureCancellation
          ? 'CANCELADA POR FALLO EDITORIAL PREVIO'
          : STATUS_LABELS[diagnostic.status] ?? diagnostic.status.toUpperCase();
        const parts: string[] = [`✗ ${resolvedLabel} · intento ${attempt} · ${statusLabel}`];
        if (diagnostic.error) {
          const safeError = sanitizeText(this.sanitize(diagnostic.error));
          parts.push(safeError);
        }
        parts.push(duration);
        if (diagnostic.httpStatus !== undefined) {
          parts.push(`HTTP ${diagnostic.httpStatus}`);
        }
        if (resolvedStopContext) parts.push(resolvedStopContext);
        parts.push(`gastado=${formatUsd(budget.spentUsd)}`);
        this.emit(`[${time}] [v8-canary] ${parts.join(' · ')}`);
      }

      this.activeCalls.delete(event.callId);
      this.lastObservedPhase = resolvedPhase;
      this.lastObservedStopId = resolvedStopId;
    }
  }

  private stopContext(stopId: string | null): string | null {
    if (!stopId) return null;
    const stop = this.stops.get(stopId) ?? this.stopsByWikidata.get(stopId);
    if (!stop) return stopId;
    return `[${stop.position}/${this.stops.size}] ${stop.name} (${stop.wikidataId})`;
  }

  private emit(line: string): void {
    if (this.reporterDisabled) return;
    try {
      const sanitized = this.sanitize(line);
      const normalized = normalizeLine(sanitized);
      this.writeLine(normalized);
    } catch (error) {
      this.reporterDisabled = true;
      try {
        this.onReporterError?.(error);
      } catch {
        // Human-readable progress must never interrupt the canary.
      }
    }
  }
}
