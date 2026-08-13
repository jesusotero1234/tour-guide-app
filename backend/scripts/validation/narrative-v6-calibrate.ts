import 'dotenv/config';
import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  writeFileSync,
  writeSync,
} from 'fs';
import { dirname, resolve } from 'path';
import manifestJson from '../../fixtures/narrative-madrid-v6/reference.json';
import rubricJson from '../../fixtures/narrative-madrid-v6/research-rubric.json';
import mutationsJson from '../../fixtures/narrative-madrid-v6/editorial-mutations.json';
import {
  evaluateNarrativeEditorialGateV6,
  evaluateNarrativeResearchGateV6,
  narrativeReferenceEvidenceFromCapturesV6,
  narrativeReferenceRequirementsFromRubricV6,
  validateNarrativeMadridResearchRubricV6,
} from '../../src/services/poi/NarrativeCalibrationV6';
import {
  buildNarrativeAuditObjectionsV6,
  assignNarrativeSentenceIdsV6,
  auditNarrativeScriptDeterministicallyV6,
} from '../../src/services/poi/NarrativeEditorialV6';
import {
  NarrativeAgentProtocolErrorV6,
  createNarrativeEditorialAgentsV6,
  reviewNarrativeTourScorecardV6,
} from '../../src/services/poi/NarrativeEditorialAgentsV6';
import { NARRATIVE_BENCHMARK_PRIOR_SPEND_USD_V6 } from '../../src/services/poi/NarrativeBenchmarkV6';
import {
  NarrativeSpendLedgerV6,
  NarrativeSpendReservationV6,
} from '../../src/services/poi/NarrativeSpendLedgerV6';
import {
  runNarrativeEditorialWorkflowV6,
  runPairedNarrativeAuditsV6,
} from '../../src/services/poi/NarrativeEditorialWorkflowV6';
import { createNarrativeSchedulerV6 } from '../../src/services/poi/NarrativeSchedulerV6';
import {
  prepareNarrativeResumeReviewV6,
  validateNarrativeReviewPatchV6,
} from '../../src/services/poi/NarrativeReviewResumeV6';
import { writeNarrativeV6PreviewV6 } from './narrative-v6-preview';
import {
  loadNarrativeMadridDocumentsV6,
  validateNarrativeMadridCorpusV6,
} from '../../src/services/poi/NarrativeMadridCorpusV6';
import {
  buildMadridNarrativeArcV6,
  buildMadridNarrativeRouteBriefV6,
  buildTrustedMadridDossiersV6,
} from '../../src/services/poi/NarrativeMadridTrustedFixturesV6';
import {
  createDeepSeekNarrativeResearchCuratorV6,
  createDeepSeekNarrativeSearchPlannerV6,
  NarrativeResearchStopResultV6,
  researchNarrativeStopV6,
} from '../../src/services/poi/NarrativeResearchV6';
import {
  FirecrawlNarrativeSourceProviderV6,
  NarrativeCapturedSourceV6,
  NarrativeSourceProviderV6,
  ReplayNarrativeSourceProviderV6,
} from '../../src/services/poi/NarrativeSourcesV6';
import {
  EditorialProgressCallbackV6,
  EditorialProgressEventV6,
  EditorialPricingV6,
} from '../../src/services/poi/EditorialStructuredLlmV6';
import {
  openRouterPricingFromPreflightV6,
  preflightBalancedOpenRouterV6,
} from '../../src/services/poi/OpenRouterPreflightV6';

const CALIBRATION_REQUEST_TIMEOUT_MS = 180_000;
const GATE_A_DEADLINE_MS = 20 * 60 * 1_000;
const PROGRESS_HEARTBEAT_MS = 15_000;
const CALIBRATION_SPEND_LIMIT_USD = 2;
const MADRID_RESUME_REVIEW_STOP_IDS_V6 = ['palace', 'almudena', 'villa', 'mayor'];

type CalibrationGateV6 = 'a' | 'b';

interface CalibrationOutputPathsV6 {
  runId: string;
  publicPath: string;
  privatePath: string;
  progressPath: string;
}

interface CalibrationLifecycleEventV6 {
  event: 'run_started' | 'run_finished' | 'run_failed' | 'deadline_reached' | 'sigint';
  at: string;
  runId: string;
  gate: CalibrationGateV6;
  profile: string;
  error?: string;
}

interface CalibrationBudgetSnapshotV6 {
  limitUsd: number;
  spentUsd: number;
  reservedUsd: number;
  remainingUsd: number;
}

type CalibrationProgressEventV6 = EditorialProgressEventV6 & {
  gate: CalibrationGateV6;
  budget: CalibrationBudgetSnapshotV6;
};

interface CalibrationProgressWriterV6 {
  append(event: CalibrationProgressEventV6 | CalibrationLifecycleEventV6): void;
  sync(): void;
  close(): void;
}

class CalibrationAbortErrorV6 extends Error {
  constructor(message: string, readonly exitCode: number) {
    super(message);
    this.name = 'CalibrationAbortErrorV6';
  }
}

class CalibrationSpendGuardV6 {
  private readonly historicalSpendUsd = Number(
    option('--prior-spend-usd') ?? NARRATIVE_BENCHMARK_PRIOR_SPEND_USD_V6
  );
  private readonly ledger: NarrativeSpendLedgerV6;
  private readonly reservations = new Map<string, NarrativeSpendReservationV6>();

  constructor() {
    if (!Number.isFinite(this.historicalSpendUsd)
      || this.historicalSpendUsd < 0
      || this.historicalSpendUsd > CALIBRATION_SPEND_LIMIT_USD) {
      throw new Error(
        `--prior-spend-usd must be between 0 and ${CALIBRATION_SPEND_LIMIT_USD}`
      );
    }
    this.ledger = new NarrativeSpendLedgerV6({
      limitUsd: CALIBRATION_SPEND_LIMIT_USD,
      historicalSpendUsd: this.historicalSpendUsd,
      path: option('--spend-ledger') ?? process.env.NARRATIVE_V6_SPEND_LEDGER_PATH,
    });
  }

  record(event: EditorialProgressEventV6): CalibrationBudgetSnapshotV6 {
    if (event.event === 'attempt_started') this.reserve(event);
    if (event.event === 'attempt_finished') this.settle(event);
    return this.snapshot();
  }

  snapshot(): CalibrationBudgetSnapshotV6 {
    return this.ledger.snapshot();
  }

  assertSettled(): void {
    if (this.reservations.size > 0) {
      throw new Error('calibration ended with unsettled cost reservations');
    }
  }

  private reserve(event: EditorialProgressEventV6): void {
    if (event.attempt === undefined) throw new Error('attempt start omitted its attempt number');
    if (event.maximumCostUsd === undefined || !Number.isFinite(event.maximumCostUsd)
      || event.maximumCostUsd < 0) {
      throw new Error(`no verified maximum cost is available for ${event.requestedModel}`);
    }
    const key = this.key(event);
    if (this.reservations.has(key)) throw new Error(`duplicate cost reservation for ${key}`);
    this.reservations.set(key, this.ledger.reserve(event.maximumCostUsd, {
      ...(event.runId ? { runId: event.runId } : {}),
      ...(event.phase ? { phase: event.phase } : {}),
      model: event.requestedModel,
      attempt: event.attempt,
    }));
  }

  private settle(event: EditorialProgressEventV6): void {
    if (event.attempt === undefined) throw new Error('attempt finish omitted its attempt number');
    const key = this.key(event);
    const reservation = this.reservations.get(key);
    if (reservation === undefined) throw new Error(`unknown cost reservation for ${key}`);
    this.reservations.delete(key);
    const actual = event.diagnostic?.usage?.costUsd;
    if (actual !== undefined && (!Number.isFinite(actual) || actual < 0)) {
      throw new Error(`invalid billed cost for ${key}`);
    }
    this.ledger.settle(reservation, actual);
  }

  private key(event: EditorialProgressEventV6): string {
    return `${event.callId}#${event.attempt}`;
  }
}

function option(name: string): string | undefined {
  return process.argv.find((argument) => argument.startsWith(`${name}=`))?.slice(name.length + 1);
}

function requiredSecret(name: 'DEEPSEEK_API_KEY' | 'OPENROUTER_API_KEY'): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function safeError(error: unknown, secrets: string[]): string {
  return secrets.reduce(
    (message, secret) => message.split(secret).join('[REDACTED]'),
    error instanceof Error ? error.message : String(error)
  );
}

function outputPaths(gate: CalibrationGateV6): CalibrationOutputPathsV6 {
  const runId = option('--run-id') ?? `madrid-gate-${gate}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const directory = resolve(process.cwd(), 'tmp/narrative-v6', runId);
  mkdirSync(directory, { recursive: true });
  return {
    runId,
    publicPath: resolve(directory, 'review.json'),
    privatePath: resolve(directory, 'diagnostics.private.json'),
    progressPath: resolve(directory, 'progress.private.jsonl'),
  };
}

function createProgressWriter(path: string, appendExisting = false): CalibrationProgressWriterV6 {
  const descriptor = openSync(path, appendExisting ? 'a' : 'ax');
  let closed = false;
  return {
    append(event) {
      if (closed) throw new Error('calibration progress writer is closed');
      writeSync(descriptor, `${JSON.stringify(event)}\n`);
    },
    sync() {
      if (!closed) fsyncSync(descriptor);
    },
    close() {
      if (closed) return;
      fsyncSync(descriptor);
      closeSync(descriptor);
      closed = true;
    },
  };
}

function throwIfAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new CalibrationAbortErrorV6('calibration aborted', 1);
}

const manifest = validateNarrativeMadridCorpusV6(manifestJson);
const documents = loadNarrativeMadridDocumentsV6(
  manifest,
  (path) => readFileSync(resolve(process.cwd(), '..', path), 'utf8')
);
const route = buildMadridNarrativeRouteBriefV6(manifest);
const dossiers = buildTrustedMadridDossiersV6(manifest, documents);

async function gateA(
  paths: CalibrationOutputPathsV6,
  signal: AbortSignal,
  onProgress: EditorialProgressCallbackV6,
  apiKey: string,
  profile: string,
  openRouterApiKey?: string,
  openRouterPricing?: Record<string, EditorialPricingV6>
): Promise<void> {
  const tourOnly = process.argv.includes('--tour-only');
  const agents = createNarrativeEditorialAgentsV6({
    apiKey, openRouterApiKey, profile, runId: paths.runId,
    openRouterPricing,
    requestTimeoutMs: CALIBRATION_REQUEST_TIMEOUT_MS,
    signal,
    onProgress,
  });
  const workflow = await runNarrativeEditorialWorkflowV6({
    runId: paths.runId,
    createdAt: new Date().toISOString(),
    route,
    dossiers,
    arc: buildMadridNarrativeArcV6(manifest),
    voiceProfile: [
      manifest.voiceProfile.description,
      manifest.voiceProfile.durationGuidance,
      ...manifest.voiceProfile.rules,
    ],
    privateArtifactPath: paths.privatePath,
  }, agents, { signal, onProgress, profile });
  throwIfAborted(signal);
  const privateMutationDiagnostics: unknown[] = [];
  const mutations = [];
  if (!Array.isArray(mutationsJson.mutations)) throw new Error('mutation fixture is malformed');
  const mutationInputs = workflow.run.status === 'ready_for_human_gate' && !tourOnly
    ? mutationsJson.mutations
    : [];
  for (const mutation of mutationInputs) {
    throwIfAborted(signal);
    const dossier = dossiers.find((item) => item.stopId === mutation.stopId);
    if (!dossier) throw new Error(`mutation ${mutation.mutationId} has unknown stop`);
    const script = assignNarrativeSentenceIdsV6(mutation.stopId, mutation.text);
    let detected = false;
    let protocolError: string | undefined;
    try {
      if (mutation.detector === 'deterministic') {
        detected = auditNarrativeScriptDeterministicallyV6(script, {
          language: 'es', authorizedNumbers: dossier.authorizedNumbers,
        }).some((warning) => warning.severity === 'hard');
      } else if (mutation.detector === 'global') {
        const result = await agents.auditTour({ promise: manifest.promise, scripts: [script] });
        privateMutationDiagnostics.push(result.diagnostic);
        detected = result.value.issues.some((issue) => issue.severity === 'hard');
      } else {
        const reports = await runPairedNarrativeAuditsV6(
          agents,
          { script, dossier },
          { signal, onProgress }
        );
        privateMutationDiagnostics.push(...reports.map((result) => result.diagnostic));
        detected = buildNarrativeAuditObjectionsV6(reports.map((result) => result.value)).length > 0;
      }
    } catch (error) {
      if (error instanceof NarrativeAgentProtocolErrorV6) {
        privateMutationDiagnostics.push(error.diagnostic);
      }
      protocolError = error instanceof Error ? error.message : String(error);
    }
    throwIfAborted(signal);
    mutations.push({
      mutationId: mutation.mutationId,
      detected,
      ...(protocolError ? { protocolError } : {}),
    });
  }
  const writerFingerprints = workflow.metrics
    .filter((item) => item.callId.includes('-writer-'))
    .map((item) => item.promptFingerprint);
  const promptFingerprint = writerFingerprints[0] ?? 'missing';
  const status = workflow.run.status;
  const gate = tourOnly
    ? { status: 'not_run', reason: 'mutation benchmark omitted by --tour-only' } as const
    : evaluateNarrativeEditorialGateV6({
      developmentStopIds: manifest.developmentStopIds,
      validationStopIds: manifest.validationStopIds,
      stopOutcomes: manifest.stops.map((stop) => ({
        stopId: stop.stopId,
        status,
        promptFingerprint,
      })),
      mutations,
    });
  const review = {
    schemaVersion: 'narrative-madrid-editorial-gate-v6',
    runId: paths.runId,
    gate,
    workflowStatus: workflow.run.status,
    tourOnly,
    workflowRun: workflow.run,
    developmentStopIds: manifest.developmentStopIds,
    validationStopIds: manifest.validationStopIds,
    mutations,
    scripts: workflow.stops.map((stop) => ({ stopId: stop.stopId, text: stop.finalScript.text })),
    warnings: workflow.warnings,
    metrics: workflow.metrics,
    privateDiagnosticsPath: paths.privatePath,
    privateProgressPath: paths.progressPath,
  };
  writeFileSync(paths.privatePath, JSON.stringify({
    workflow: workflow.privateDiagnostics,
    mutations: privateMutationDiagnostics,
  }, null, 2));
  writeFileSync(paths.publicPath, JSON.stringify(review, null, 2));
  process.stdout.write(`${JSON.stringify({ ...review, scripts: undefined, output: paths.publicPath }, null, 2)}\n`);
  if (tourOnly) {
    if (workflow.run.status !== 'ready_for_human_gate') process.exitCode = 1;
  } else if (gate.status !== 'passed') process.exitCode = 1;
}

function scorecardMarkdown(scorecard: Awaited<ReturnType<
  typeof reviewNarrativeTourScorecardV6
>>['value']): string {
  const labels = {
    accuracyGrounding: 'Exactitud y grounding',
    narrativeArcTransitions: 'Arco narrativo y transiciones',
    oralClarityRhythm: 'Claridad oral y ritmo',
    placeObservationSafety: 'Observación del lugar y seguridad',
    styleRepetitionClosing: 'Estilo, repetición y cierre',
  } as const;
  const dimensionRows = Object.entries(labels).map(([key, label]) => {
    const dimension = scorecard.dimensions[key as keyof typeof labels];
    return `| ${label} | ${dimension.score.toFixed(1)} | ${dimension.sentenceIds.join(', ')} |`;
  });
  const dimensionDetails = Object.entries(labels).flatMap(([key, label]) => {
    const dimension = scorecard.dimensions[key as keyof typeof labels];
    return [`### ${label}`, '', dimension.rationale, ''];
  });
  return [
    '# Scorecard editorial — tour de Madrid',
    '',
    `> **Decisión:** ${scorecard.decision}`,
    `> **Media ponderada:** ${scorecard.weightedScore.toFixed(2)}`,
    '',
    '| Dimensión | Nota | Frases citadas |',
    '| --- | ---: | --- |',
    ...dimensionRows,
    '',
    '## Justificación por dimensión',
    '',
    ...dimensionDetails,
    '## Objeciones',
    '',
    ...(scorecard.objections.length === 0
      ? ['Ninguna.']
      : scorecard.objections.flatMap((objection) => [
        `- **${objection.sentenceId}:** ${objection.exactSentence}`,
        `  - Evidencia: ${objection.evidence}`,
        `  - Reemplazo mínimo: ${objection.minimalReplacement}`,
      ])),
    '',
  ].join('\n');
}

function blockedScorecardMarkdown(input: {
  workflowStatus: string;
  hardWarningCount: number;
  globalIssueCount: number;
  openIssueIds: string[];
}): string {
  return [
    '# Scorecard editorial — tour de Madrid',
    '',
    '> **Decisión:** Request changes',
    '> **Revisor LLM:** no ejecutado; fallaron condiciones automáticas obligatorias.',
    '',
    `- Estado del workflow: \`${input.workflowStatus}\``,
    `- Warnings duros: ${input.hardWarningCount}`,
    `- Issues globales pendientes: ${input.globalIssueCount}`,
    `- Issues abiertos: ${input.openIssueIds.length}`,
    '',
    '## Issues abiertos',
    '',
    ...(input.openIssueIds.length === 0
      ? ['Ninguno.']
      : input.openIssueIds.map((issueId) => `- \`${issueId}\``)),
    '',
  ].join('\n');
}

async function resumeReviewGateA(
  paths: CalibrationOutputPathsV6,
  signal: AbortSignal,
  onProgress: EditorialProgressCallbackV6,
  apiKey: string,
  profile: string,
  openRouterApiKey?: string,
  openRouterPricing?: Record<string, EditorialPricingV6>
): Promise<void> {
  const reviewPath = resolve(option('--resume-review') as string);
  const patchPath = resolve(option('--patch-file') as string);
  if (reviewPath === paths.publicPath) throw new Error('resumed review cannot overwrite its source run');
  const source = JSON.parse(readFileSync(reviewPath, 'utf8')) as {
    runId?: string;
    workflowRun?: { tourFingerprint?: string };
    scripts?: Array<{ stopId: string; text: string }>;
  };
  if (!source.runId || !source.workflowRun?.tourFingerprint || !Array.isArray(source.scripts)) {
    throw new Error('source review is not a resumable editorial review');
  }
  const patch = validateNarrativeReviewPatchV6(JSON.parse(readFileSync(patchPath, 'utf8')));
  const prepared = prepareNarrativeResumeReviewV6({
    review: {
      runId: source.runId,
      tourFingerprint: source.workflowRun.tourFingerprint,
      scripts: source.scripts,
    },
    patch,
    route,
    dossiers,
    reviewStopIds: MADRID_RESUME_REVIEW_STOP_IDS_V6,
  });
  const agents = createNarrativeEditorialAgentsV6({
    apiKey, openRouterApiKey, profile, runId: paths.runId,
    openRouterPricing,
    requestTimeoutMs: CALIBRATION_REQUEST_TIMEOUT_MS,
    signal,
    onProgress,
  });
  const workflow = await runNarrativeEditorialWorkflowV6({
    runId: paths.runId,
    createdAt: new Date().toISOString(),
    route,
    dossiers,
    arc: buildMadridNarrativeArcV6(manifest),
    voiceProfile: [
      manifest.voiceProfile.description,
      manifest.voiceProfile.durationGuidance,
      ...manifest.voiceProfile.rules,
    ],
    privateArtifactPath: paths.privatePath,
  }, agents, {
    signal,
    onProgress,
    profile,
    scheduler: createNarrativeSchedulerV6(profile, {
      editorialStops: 2,
      auditStops: 2,
      adjudications: 3,
      writers: 1,
      globalAudits: 1,
    }),
    scripts: prepared.scripts,
    auditStopIds: prepared.auditedStopIds,
    maximumAdditionalRepairs: 1,
  });
  throwIfAborted(signal);
  const finalScripts = workflow.stops.map((stop) => stop.finalScript);
  const hardWarnings = workflow.warnings.filter((warning) => warning.severity === 'hard');
  const tourEndPattern = /\b(?:aquí|aqui)\s+termina\s+(?:el\s+)?recorrido\b|\brecorrido\s+termina\s+(?:aquí|aqui)\b/iu;
  const onlyFinalStopClaimsTourEnd = finalScripts.every((script) => (
    script.stopId === 'alcala'
      || !tourEndPattern.test(script.text)
  ));
  const finalStopClaimsTourEnd = tourEndPattern.test(
    finalScripts.find((script) => script.stopId === 'alcala')?.text ?? ''
  );
  const rejectedTourIssueIds = new Set(workflow.stops.flatMap((stop) => (
    stop.adjudications.filter((item) => (
      item.decision === 'rejected' && item.objectionId.startsWith('tour:')
    )).map((item) => item.objectionId.slice('tour:'.length))
  )));
  const pendingGlobalIssueCount = (workflow.tourAudit?.issues ?? [])
    .filter((issue) => !rejectedTourIssueIds.has(issue.issueId)).length;
  const sourceScripts = new Map(source.scripts.map((script) => [script.stopId, script.text]));
  const unmodifiedStopsPreserved = ['sol', 'cibeles', 'alcala'].every((stopId) => (
    finalScripts.find((script) => script.stopId === stopId)?.text === sourceScripts.get(stopId)
  ));
  const wordCounts = finalScripts.map((script) => ({
    stopId: script.stopId,
    words: script.text.trim().split(/\s+/u).length,
  }));
  const automaticChecks = {
    workflowReady: workflow.run.status === 'ready_for_human_gate',
    hardWarningCount: hardWarnings.length,
    globalIssueCount: pendingGlobalIssueCount,
    progressionWorks: workflow.tourAudit?.progressionWorks ?? false,
    promiseDelivered: workflow.tourAudit?.promiseDelivered ?? false,
    closingWorks: workflow.tourAudit?.closingWorks ?? false,
    onlyFinalStopClaimsTourEnd,
    finalStopClaimsTourEnd,
    unmodifiedStopsPreserved,
    safeOrientation: !workflow.warnings.some((warning) => warning.code === 'unsafe_orientation'),
    wordCounts,
    wordCountsInRange: wordCounts.every((item) => item.words >= 330 && item.words <= 470),
  };
  let scorecardResult: Awaited<ReturnType<typeof reviewNarrativeTourScorecardV6>> | undefined;
  if (workflow.run.status === 'ready_for_human_gate'
    && hardWarnings.length === 0
    && automaticChecks.progressionWorks
    && automaticChecks.promiseDelivered
    && automaticChecks.closingWorks
    && automaticChecks.onlyFinalStopClaimsTourEnd
    && automaticChecks.finalStopClaimsTourEnd
    && automaticChecks.unmodifiedStopsPreserved
    && automaticChecks.globalIssueCount === 0
    && automaticChecks.safeOrientation
    && automaticChecks.wordCountsInRange) {
    scorecardResult = await reviewNarrativeTourScorecardV6({
      apiKey, openRouterApiKey, profile, runId: paths.runId,
      openRouterPricing,
      requestTimeoutMs: CALIBRATION_REQUEST_TIMEOUT_MS,
      signal,
      onProgress,
    }, { promise: manifest.promise, scripts: finalScripts, dossiers }, { signal, onProgress });
  }
  throwIfAborted(signal);
  const appliedPatchPath = resolve(dirname(paths.publicPath), 'review-patch.applied.json');
  const scorecardPath = resolve(dirname(paths.publicPath), 'editorial-scorecard.md');
  const review = {
    schemaVersion: 'narrative-madrid-editorial-gate-v6',
    runId: paths.runId,
    gate: { status: 'not_run', reason: 'mutation benchmark omitted by --tour-only' } as const,
    workflowStatus: workflow.run.status,
    tourOnly: true,
    resumedReview: {
      sourceRunId: prepared.sourceRunId,
      sourceReviewPath: reviewPath,
      sourceTourFingerprint: prepared.sourceTourFingerprint,
      patchedTourFingerprint: prepared.patchedTourFingerprint,
      auditedStopIds: prepared.auditedStopIds,
      maximumAdditionalRepairs: 1,
      appliedPatchPath,
    },
    workflowRun: workflow.run,
    tourAudit: workflow.tourAudit,
    performance: workflow.performance,
    automaticChecks,
    scorecard: scorecardResult?.value ?? null,
    developmentStopIds: manifest.developmentStopIds,
    validationStopIds: manifest.validationStopIds,
    mutations: [],
    scripts: finalScripts.map((script) => ({ stopId: script.stopId, text: script.text })),
    warnings: workflow.warnings,
    metrics: workflow.metrics,
    privateDiagnosticsPath: paths.privatePath,
    privateProgressPath: paths.progressPath,
  };
  writeFileSync(paths.privatePath, JSON.stringify({
    workflow: workflow.privateDiagnostics,
    scorecard: scorecardResult?.diagnostic ?? null,
  }, null, 2));
  writeFileSync(appliedPatchPath, `${JSON.stringify(patch, null, 2)}\n`);
  writeFileSync(paths.publicPath, `${JSON.stringify(review, null, 2)}\n`);
  writeFileSync(scorecardPath, `${scorecardResult
    ? scorecardMarkdown(scorecardResult.value)
    : blockedScorecardMarkdown({
      workflowStatus: workflow.run.status,
      hardWarningCount: automaticChecks.hardWarningCount,
      globalIssueCount: automaticChecks.globalIssueCount,
      openIssueIds: workflow.run.status === 'draft_review_required'
        ? workflow.run.openIssueIds : [],
    })}\n`);
  const preview = finalScripts.length === manifest.stops.length
    ? writeNarrativeV6PreviewV6(dirname(paths.publicPath)) : null;
  process.stdout.write(`${JSON.stringify({
    ...review,
    scripts: undefined,
    output: paths.publicPath,
    preview,
    scorecardOutput: scorecardPath,
  }, null, 2)}\n`);
  if (workflow.run.status !== 'ready_for_human_gate'
    || !scorecardResult
    || scorecardResult.value.decision !== 'Approve') process.exitCode = 1;
}

async function gateB(
  paths: CalibrationOutputPathsV6,
  signal: AbortSignal,
  onProgress: EditorialProgressCallbackV6,
  apiKey: string,
  profile: string,
  openRouterApiKey?: string,
  firecrawlKey?: string,
  openRouterPricing?: Record<string, EditorialPricingV6>
): Promise<void> {
  const rubric = validateNarrativeMadridResearchRubricV6(rubricJson);
  const stage = option('--stage') ?? 'spot-check';
  if (stage !== 'spot-check' && stage !== 'full') throw new Error('--stage must be spot-check or full');
  const humanSpotCheck = option('--human-spot-check') ?? 'pending';
  if (!['pending', 'accepted', 'rejected'].includes(humanSpotCheck)) {
    throw new Error('--human-spot-check must be pending, accepted or rejected');
  }
  if (stage === 'full' && humanSpotCheck === 'pending') {
    throw new Error('full gate B requires an explicit accepted or rejected human spot-check');
  }
  if (stage === 'spot-check' && humanSpotCheck !== 'pending') {
    throw new Error('spot-check stage always remains pending; accept or reject it in the full stage');
  }
  const selectedRubric = stage === 'spot-check' ? { ...rubric, stops: [rubric.stops[0]] } : rubric;
  const replayPrivatePath = option('--replay-private');
  let sourceProvider: NarrativeSourceProviderV6;
  let replayQueries: string[] | undefined;
  if (replayPrivatePath) {
    if (stage !== 'spot-check') throw new Error('--replay-private is supported only for spot-check');
    const replay = JSON.parse(readFileSync(resolve(replayPrivatePath), 'utf8')) as Array<{
      captures?: NarrativeCapturedSourceV6[];
      searchDiagnostic?: { value?: { queries?: string[] } };
    }>;
    if (!Array.isArray(replay) || !Array.isArray(replay[0]?.captures)) {
      throw new Error('research replay does not contain captured pages');
    }
    sourceProvider = new ReplayNarrativeSourceProviderV6(replay[0].captures);
    replayQueries = replay[0].searchDiagnostic?.value?.queries;
  } else {
    sourceProvider = new FirecrawlNarrativeSourceProviderV6({
      baseUrl: process.env.FIRECRAWL_BASE_URL ?? 'http://127.0.0.1:3007/v2',
      apiKey: firecrawlKey,
    });
  }
  const curator = createDeepSeekNarrativeResearchCuratorV6({
    apiKey, openRouterApiKey, profile, runId: paths.runId,
    openRouterPricing,
    requestTimeoutMs: CALIBRATION_REQUEST_TIMEOUT_MS,
    signal,
    onProgress,
  });
  const searchPlanner = replayQueries
    ? { plan: async () => ({ queries: replayQueries as string[] }) }
    : createDeepSeekNarrativeSearchPlannerV6({
      apiKey, openRouterApiKey, profile, runId: paths.runId,
      openRouterPricing,
      requestTimeoutMs: CALIBRATION_REQUEST_TIMEOUT_MS,
      signal,
      onProgress,
    });
  const results: NarrativeResearchStopResultV6[] = [];
  let humanReview: Record<string, string> | undefined;
  if (stage === 'full') {
    const spotCheckPath = option('--spot-check-report');
    const spotCheckPrivatePath = option('--spot-check-private');
    const reviewedBy = option('--reviewed-by');
    const reviewReason = option('--review-reason');
    if (!spotCheckPath || !spotCheckPrivatePath || !reviewedBy || !reviewReason) {
      throw new Error(
        'full gate B requires --spot-check-report, --spot-check-private, --reviewed-by and --review-reason'
      );
    }
    const spotCheck = JSON.parse(readFileSync(resolve(spotCheckPath), 'utf8')) as {
      stage?: string;
      gate?: { status?: string };
      stops?: NarrativeResearchStopResultV6[];
    };
    const reviewed = spotCheck.stops?.[0];
    if (spotCheck.stage !== 'spot-check'
      || spotCheck.gate?.status !== 'human_spot_check_required'
      || reviewed?.status !== 'sufficient'
      || !reviewed.dossier?.fingerprint) {
      throw new Error('spot-check report is not a reviewable sufficient Madrid dossier');
    }
    const privateSpotCheck = JSON.parse(
      readFileSync(resolve(spotCheckPrivatePath), 'utf8')
    ) as Array<{ stopId?: string; captures?: NarrativeCapturedSourceV6[] }>;
    const reviewedPrivate = privateSpotCheck.find((item) => item.stopId === reviewed.stopId);
    if (!reviewedPrivate?.captures?.length || reviewedPrivate.captures.some((capture) => (
      !reviewed.dossier!.sources.some((source) => (
        source.sourceId === capture.sourceId && source.fingerprint === capture.fingerprint
      ))
    ))) {
      throw new Error('spot-check private captures do not match the reviewed dossier');
    }
    results.push({ ...reviewed, captures: reviewedPrivate.captures });
    humanReview = {
      decision: humanSpotCheck,
      reviewedBy,
      reason: reviewReason,
      reviewedAt: new Date().toISOString(),
      dossierFingerprint: reviewed.dossier.fingerprint,
      sourceReport: resolve(spotCheckPath),
    };
  }
  for (const reference of selectedRubric.stops) {
    throwIfAborted(signal);
    if (results.some((result) => result.stopId === reference.stopId)) continue;
    const stop = route.stops.find((item) => item.stopId === reference.stopId);
    if (!stop) throw new Error(`research rubric references unknown stop ${reference.stopId}`);
    results.push(await researchNarrativeStopV6({
      stop, city: route.city, language: route.language, sourceProvider, curator,
      searchPlanner,
      calibrationExpectedSufficient: true,
      requiredReferenceEvidence: narrativeReferenceRequirementsFromRubricV6(
        selectedRubric,
        reference.stopId
      ),
    }));
    throwIfAborted(signal);
  }
  const outcomes = results.map((result) => ({
    stopId: result.stopId,
    status: result.status === 'sufficient'
      ? 'sufficient' as const
      : result.status === 'evidence_review_required'
        ? 'evidence_review_required' as const
        : 'failed' as const,
    dossier: result.dossier,
  }));
  const gate = evaluateNarrativeResearchGateV6({
    rubric: selectedRubric,
    outcomes,
    humanSpotCheck: humanSpotCheck as 'pending' | 'accepted' | 'rejected',
    referenceEvidence: narrativeReferenceEvidenceFromCapturesV6(
      selectedRubric,
      results.flatMap((result) => result.captures)
    ),
  });
  const review = {
    schemaVersion: 'narrative-madrid-research-gate-v6',
    runId: paths.runId,
    stage,
    gate,
    humanReview,
    stops: results.map((result) => ({
      stopId: result.stopId,
      status: result.status,
      stats: result.stats,
      reason: result.reason,
      dossier: result.dossier,
    })),
    privateDiagnosticsPath: paths.privatePath,
    privateProgressPath: paths.progressPath,
  };
  writeFileSync(paths.privatePath, JSON.stringify(results.map((result) => ({
    stopId: result.stopId,
    searchResultsByQuery: result.searchResultsByQuery,
    captures: result.captures,
    captureErrors: result.captureErrors,
    searchDiagnostic: result.searchDiagnostic,
    diagnostic: result.diagnostic,
    complexDiagnostic: result.complexDiagnostic,
  })), null, 2));
  writeFileSync(paths.publicPath, JSON.stringify(review, null, 2));
  process.stdout.write(`${JSON.stringify({ ...review, stops: review.stops.map((stop) => ({
    stopId: stop.stopId, status: stop.status, stats: stop.stats, reason: stop.reason,
  })), output: paths.publicPath }, null, 2)}\n`);
  if (gate.status === 'model_calibration_failed') process.exitCode = 1;
}

async function main(): Promise<void> {
  if (!process.argv.includes('--generate') || !process.argv.includes('--allow-external')) {
    throw new Error('calibration requires --generate --allow-external');
  }
  const gateValue = option('--gate');
  if (gateValue !== 'a' && gateValue !== 'b') throw new Error('--gate must be a or b');
  const gate: CalibrationGateV6 = gateValue;
  const resumeReview = option('--resume-review');
  const patchFile = option('--patch-file');
  if (Boolean(resumeReview) !== Boolean(patchFile)) {
    throw new Error('--resume-review and --patch-file must be provided together');
  }
  if (resumeReview && gate !== 'a') throw new Error('resumed editorial review requires --gate=a');
  const profile = option('--profile') ?? process.env.NARRATIVE_MODEL_PROFILE ?? 'deepseek_control';
  const paths = outputPaths(gate);
  if (resumeReview && existsSync(paths.publicPath)) {
    const existing = JSON.parse(readFileSync(paths.publicPath, 'utf8')) as {
      workflowStatus?: string;
    };
    if (existing.workflowStatus !== 'protocol_failed') {
      throw new Error('derived review run already has a public result');
    }
  }
  const progressWriter = createProgressWriter(paths.progressPath, Boolean(resumeReview));
  const abortController = new AbortController();
  const spendGuard = new CalibrationSpendGuardV6();
  let interrupted = false;
  const onProgress: EditorialProgressCallbackV6 = (event) => {
    try {
      const budget = spendGuard.record(event);
      progressWriter.append({ ...event, gate, budget });
    } catch (error) {
      if (event.event === 'attempt_started') throw error;
      if (!abortController.signal.aborted) abortController.abort(error);
      progressWriter.append({ ...event, gate, budget: spendGuard.snapshot() });
    }
  };
  const lifecycle = (
    event: CalibrationLifecycleEventV6['event'],
    error?: string
  ): void => {
    progressWriter.append({
      event,
      at: new Date().toISOString(),
      runId: paths.runId,
      gate,
      profile,
      ...(error ? { error } : {}),
    });
  };
  const handleSigint = (): void => {
    if (abortController.signal.aborted) return;
    interrupted = true;
    const error = new CalibrationAbortErrorV6('calibration interrupted by SIGINT', 130);
    lifecycle('sigint', error.message);
    progressWriter.sync();
    process.exitCode = error.exitCode;
    abortController.abort(error);
  };
  process.on('SIGINT', handleSigint);
  const heartbeat = setInterval(() => onProgress({
    event: 'heartbeat',
    at: new Date().toISOString(),
    callId: `narrative-v6-gate-${gate}`,
    phase: `gate_${gate}`,
    stopId: null,
    runId: paths.runId,
    profile,
    requestedModel: 'workflow',
    requestedEndpoint: null,
    reasoning: 'none',
  }), PROGRESS_HEARTBEAT_MS);
  heartbeat.unref?.();
  const gateDeadline = gate === 'a' ? setTimeout(() => {
    if (abortController.signal.aborted) return;
    const error = new CalibrationAbortErrorV6(
      `Gate A exceeded its absolute ${GATE_A_DEADLINE_MS}ms deadline`,
      1
    );
    lifecycle('deadline_reached', error.message);
    progressWriter.sync();
    abortController.abort(error);
  }, GATE_A_DEADLINE_MS) : undefined;
  gateDeadline?.unref?.();
  lifecycle('run_started');
  try {
    const apiKey = requiredSecret('DEEPSEEK_API_KEY');
    const openRouterApiKey = profile === 'balanced_openrouter'
      ? requiredSecret('OPENROUTER_API_KEY') : undefined;
    let openRouterPricing: Record<string, EditorialPricingV6> | undefined;
    if (profile === 'balanced_openrouter') {
      const preflight = await preflightBalancedOpenRouterV6({ signal: abortController.signal });
      if (preflight.status !== 'ready') {
        throw new Error(`OpenRouter endpoint preflight failed: ${preflight.issues.join('; ')}`);
      }
      openRouterPricing = openRouterPricingFromPreflightV6(preflight);
    }
    if (gate === 'a') {
      if (resumeReview) {
        await resumeReviewGateA(
          paths,
          abortController.signal,
          onProgress,
          apiKey,
          profile,
          openRouterApiKey,
          openRouterPricing
        );
      } else {
        await gateA(
          paths,
          abortController.signal,
          onProgress,
          apiKey,
          profile,
          openRouterApiKey,
          openRouterPricing
        );
      }
    } else {
      await gateB(
        paths,
        abortController.signal,
        onProgress,
        apiKey,
        profile,
        openRouterApiKey,
        process.env.FIRECRAWL_API_KEY?.trim() || undefined,
        openRouterPricing
      );
    }
    throwIfAborted(abortController.signal);
    spendGuard.assertSettled();
    lifecycle('run_finished');
  } catch (error) {
    const safe = safeError(error, [
      process.env.DEEPSEEK_API_KEY,
      process.env.OPENROUTER_API_KEY,
      process.env.FIRECRAWL_API_KEY,
    ].filter((value): value is string => Boolean(value)));
    if (!interrupted) lifecycle('run_failed', safe);
    if (error instanceof CalibrationAbortErrorV6) process.exitCode = error.exitCode;
    throw error;
  } finally {
    if (gateDeadline) clearTimeout(gateDeadline);
    clearInterval(heartbeat);
    process.removeListener('SIGINT', handleSigint);
    progressWriter.close();
  }
}

main().catch((error) => {
  const secrets = [
    process.env.DEEPSEEK_API_KEY,
    process.env.OPENROUTER_API_KEY,
    process.env.FIRECRAWL_API_KEY,
  ]
    .filter((value): value is string => Boolean(value));
  process.stderr.write(`${safeError(error, secrets)}\n`);
  if (process.exitCode === undefined) process.exitCode = 1;
});
