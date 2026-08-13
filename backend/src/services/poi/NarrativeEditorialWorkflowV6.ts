import {
  EditorialCallResultV6,
  EditorialProgressCallbackV6,
} from './EditorialStructuredLlmV6';
import {
  NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6,
  NarrativeEditorialRunV6,
  NarrativeRouteBriefV6,
  narrativeTourFingerprintV6,
} from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NarrativeEditorialAgentsV6,
  NarrativeAgentProtocolErrorV6,
  NarrativeAgentExecutionV6,
  NarrativeTourAuditV6,
} from './NarrativeEditorialAgentsV6';
import {
  NarrativeAdjudicationV6,
  NarrativeAuditObjectionV6,
  NarrativeAuditReportV6,
  NarrativeProtocolWarningV6,
  NarrativeScriptV6,
  applyNarrativeLocalPatchV6,
  assignNarrativeSentenceIdsV6,
  auditNarrativeScriptDeterministicallyV6,
  buildNarrativeAuditObjectionsV6,
  narrativeRepetitionWarningsV6,
} from './NarrativeEditorialV6';
import {
  NarrativeSchedulerV6,
  createNarrativeSchedulerV6,
} from './NarrativeSchedulerV6';

export interface NarrativeArcV6 {
  promise: string;
  centralQuestion: string;
  stops: Array<{ stopId: string; contribution: string; bridge: string }>;
}

export interface NarrativeEditorialWorkflowInputV6 {
  runId: string;
  createdAt: string;
  route: NarrativeRouteBriefV6;
  dossiers: NarrativeDossierV6[];
  arc: NarrativeArcV6;
  voiceProfile: string[];
  privateArtifactPath: string;
}

export interface NarrativeCallMetricV6 {
  callId: string;
  phase: string | null;
  stopId: string | null;
  runId: string | null;
  profile: string | null;
  requestedModel: string;
  actualModel: string;
  requestedEndpoint: string | null;
  actualProvider: string | null;
  reasoning: string | null;
  temperature: number | null;
  latencyMs: number;
  ttftMs: number | null;
  inputCharacters: number;
  status: string;
  finishReason: string | null;
  schemaValid: boolean;
  retryCount: number;
  rateLimited: boolean;
  timedOut: boolean;
  fallback: boolean;
  promptFingerprint: string;
  requestFingerprint: string | null;
  responseFingerprint: string | null;
  inputTokens: number;
  outputTokens: number;
  reasoningTokens: number;
  cacheReadTokens: number;
  cacheMissTokens: number;
  costUsd: number | null;
}

export interface NarrativeStopEditorialRecordV6 {
  stopId: string;
  initialScript: NarrativeScriptV6;
  finalScript: NarrativeScriptV6;
  audits: NarrativeAuditReportV6[];
  objections: NarrativeAuditObjectionV6[];
  adjudications: NarrativeAdjudicationV6[];
  repairRoundUsed: boolean;
  warnings: NarrativeProtocolWarningV6[];
}

export interface NarrativeEditorialWorkflowResultV6 {
  run: NarrativeEditorialRunV6;
  route: NarrativeRouteBriefV6;
  arc: NarrativeArcV6;
  stops: NarrativeStopEditorialRecordV6[];
  tourAudit: NarrativeTourAuditV6 | null;
  warnings: NarrativeProtocolWarningV6[];
  metrics: NarrativeCallMetricV6[];
  privateDiagnostics: EditorialCallResultV6<unknown>[];
}

export interface NarrativeEditorialWorkflowOptionsV6 {
  scheduler?: NarrativeSchedulerV6;
  profile?: string;
  signal?: AbortSignal;
  onProgress?: EditorialProgressCallbackV6;
  scripts?: NarrativeScriptV6[];
  auditStopIds?: string[];
  maximumAdditionalRepairs?: number;
}

function throwIfCancelled(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new Error('narrative editorial workflow cancelled');
  }
}

export async function runPairedNarrativeAuditsV6(
  agents: NarrativeEditorialAgentsV6,
  input: Parameters<NarrativeEditorialAgentsV6['audit']>[0],
  execution: NarrativeAgentExecutionV6
) {
  throwIfCancelled(execution.signal);
  const pairController = new AbortController();
  const cancelPair = () => pairController.abort(
    execution.signal?.reason ?? new Error('paired narrative audit cancelled')
  );
  execution.signal?.addEventListener('abort', cancelPair, { once: true });
  const auditors = ['deepseek', 'deepseek_pro'] as const;
  const pending = auditors.map((auditor) => agents.audit(input, auditor, {
    signal: pairController.signal,
    ...(execution.onProgress ? { onProgress: execution.onProgress } : {}),
  }).catch((error) => {
    if (!pairController.signal.aborted) pairController.abort(error);
    throw error;
  }));
  try {
    const settled = await Promise.allSettled(pending);
    const rejected = settled.find((result) => result.status === 'rejected');
    if (rejected?.status === 'rejected') throw rejected.reason;
    return settled.map((result) => {
      if (result.status !== 'fulfilled') throw new Error('paired audit did not settle');
      return result.value;
    });
  } finally {
    execution.signal?.removeEventListener('abort', cancelPair);
  }
}

function metric(result: EditorialCallResultV6<unknown>): NarrativeCallMetricV6 {
  return {
    callId: result.callId,
    phase: result.phase ?? null,
    stopId: result.stopId ?? null,
    runId: result.runId ?? null,
    profile: result.profile ?? null,
    requestedModel: result.requestedModel ?? result.model,
    actualModel: result.actualModel ?? result.model,
    requestedEndpoint: result.requestedEndpoint ?? null,
    actualProvider: result.actualProvider ?? null,
    reasoning: result.reasoning ?? null,
    temperature: result.temperature ?? null,
    latencyMs: result.attempts.reduce((total, attempt) => total + attempt.latencyMs, 0),
    ttftMs: result.ttftMs ?? null,
    inputCharacters: result.inputCharacters,
    status: result.status,
    finishReason: result.finishReason ?? null,
    schemaValid: result.schemaValid ?? false,
    retryCount: result.retryCount ?? Math.max(0, result.attempts.length - 1),
    rateLimited: result.attempts.some((attempt) => attempt.rateLimited === true),
    timedOut: result.attempts.some((attempt) => attempt.timedOut === true),
    fallback: result.routing?.fallback ?? false,
    promptFingerprint: result.promptFingerprint,
    requestFingerprint: result.requestFingerprint ?? null,
    responseFingerprint: result.responseFingerprint,
    inputTokens: result.usage?.inputTokens ?? 0,
    outputTokens: result.usage?.outputTokens ?? 0,
    reasoningTokens: result.usage?.reasoningTokens ?? 0,
    cacheReadTokens: result.usage?.cacheReadTokens ?? 0,
    cacheMissTokens: result.usage?.cacheMissTokens ?? 0,
    costUsd: result.usage?.costUsd ?? null,
  };
}

function agentDiagnostics(result: {
  diagnostic: EditorialCallResultV6<unknown>;
  diagnostics?: EditorialCallResultV6<unknown>[];
}): EditorialCallResultV6<unknown>[] {
  return result.diagnostics ?? [result.diagnostic];
}

function appendDiagnostics(
  result: {
    diagnostic: EditorialCallResultV6<unknown>;
    diagnostics?: EditorialCallResultV6<unknown>[];
  },
  metrics: NarrativeCallMetricV6[],
  privateDiagnostics: EditorialCallResultV6<unknown>[]
): void {
  const diagnostics = agentDiagnostics(result);
  metrics.push(...diagnostics.map(metric));
  privateDiagnostics.push(...diagnostics);
}

class NarrativeStopExecutionErrorV6 extends Error {
  constructor(
    readonly causeValue: unknown,
    readonly metrics: NarrativeCallMetricV6[],
    readonly diagnostics: EditorialCallResultV6<unknown>[]
  ) {
    super(causeValue instanceof Error ? causeValue.message : String(causeValue));
    this.name = 'NarrativeStopExecutionErrorV6';
  }
}

function baseRun(input: NarrativeEditorialWorkflowInputV6) {
  return {
    schemaVersion: NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6,
    runId: input.runId,
    caseId: input.route.caseId,
    createdAt: input.createdAt,
    diagnostics: { privateArtifactPath: input.privateArtifactPath },
  } as const;
}

function deterministicWarnings(
  input: NarrativeEditorialWorkflowInputV6,
  dossier: NarrativeDossierV6,
  script: NarrativeScriptV6
): NarrativeProtocolWarningV6[] {
  return auditNarrativeScriptDeterministicallyV6(script, {
    language: input.route.language,
    authorizedNames: [
      ...dossier.authorizedNames,
      input.route.city,
      input.route.country,
      ...input.route.stops.map((routeStop) => routeStop.name),
      input.arc.promise,
      input.arc.centralQuestion,
      ...input.arc.stops.flatMap((arcStop) => [arcStop.contribution, arcStop.bridge ?? '']),
    ],
    authorizedNumbers: dossier.authorizedNumbers,
  });
}

export async function runNarrativeEditorialWorkflowV6(
  input: NarrativeEditorialWorkflowInputV6,
  agents: NarrativeEditorialAgentsV6,
  options: NarrativeEditorialWorkflowOptionsV6 = {}
): Promise<NarrativeEditorialWorkflowResultV6> {
  const empty = (run: NarrativeEditorialRunV6): NarrativeEditorialWorkflowResultV6 => ({
    run, route: input.route, arc: input.arc, stops: [], tourAudit: null, warnings: [], metrics: [],
    privateDiagnostics: [],
  });
  const dossierByStop = new Map(input.dossiers.map((dossier) => [dossier.stopId, dossier]));
  const missingDossiers = input.route.stops.filter((stop) => !dossierByStop.has(stop.stopId));
  if (missingDossiers.length > 0) {
    return empty({
      ...baseRun(input), status: 'protocol_failed', stage: 'dossier_boundary',
      reason: `missing dossiers: ${missingDossiers.map((stop) => stop.stopId).join(', ')}`,
    });
  }
  const insufficient = input.route.stops.filter((stop) => (
    !dossierByStop.get(stop.stopId)?.sufficiency.isSufficient
  ));
  if (insufficient.length > 0) {
    return empty({
      ...baseRun(input), status: 'evidence_review_required',
      stopIds: insufficient.map((stop) => stop.stopId),
      reasons: insufficient.map((stop) => {
        const dossier = dossierByStop.get(stop.stopId) as NarrativeDossierV6;
        return `${stop.stopId}: ${dossier.sufficiency.missingRoles.join(', ') || 'insufficient authority'}`;
      }),
    });
  }

  let records: NarrativeStopEditorialRecordV6[] = [];
  const metrics: NarrativeCallMetricV6[] = [];
  const privateDiagnostics: EditorialCallResultV6<unknown>[] = [];
  const openIssueIds: string[] = [];
  const suppliedScripts = new Map((options.scripts ?? []).map((script) => [script.stopId, script]));
  const auditStopIds = options.auditStopIds ? new Set(options.auditStopIds) : undefined;
  let remainingRepairs = options.maximumAdditionalRepairs ?? Number.POSITIVE_INFINITY;
  const consumeRepair = (): boolean => {
    if (remainingRepairs <= 0) return false;
    remainingRepairs -= 1;
    return true;
  };
  if (options.scripts && (suppliedScripts.size !== input.route.stops.length
    || input.route.stops.some((stop) => !suppliedScripts.has(stop.stopId)))) {
    return empty({
      ...baseRun(input), status: 'protocol_failed', stage: 'resume_boundary',
      reason: 'supplied scripts must match the exact route stop set',
    });
  }
  const scheduler = options.scheduler
    ?? createNarrativeSchedulerV6(options.profile ?? agents.profileName);
  const workflowController = new AbortController();
  const workflowSignal = options.signal
    ? AbortSignal.any([options.signal, workflowController.signal])
    : workflowController.signal;
  const agentExecution: NarrativeAgentExecutionV6 = {
    signal: workflowSignal,
    ...(options.onProgress ? { onProgress: options.onProgress } : {}),
  };
  try {
    throwIfCancelled(workflowSignal);
    const settledStopResults = await Promise.allSettled(input.route.stops.map((stop) => (
      scheduler.editorialStop(async () => {
        throwIfCancelled(workflowSignal);
        const stopMetrics: NarrativeCallMetricV6[] = [];
        const stopDiagnostics: EditorialCallResultV6<unknown>[] = [];
        const stopOpenIssueIds: string[] = [];
        try {
          const dossier = dossierByStop.get(stop.stopId) as NarrativeDossierV6;
          const arcStop = input.arc.stops.find((item) => item.stopId === stop.stopId);
          if (!arcStop) throw new Error(`arc is missing stop ${stop.stopId}`);
          const suppliedScript = suppliedScripts.get(stop.stopId);
          let initialScript: NarrativeScriptV6;
          if (suppliedScript) {
            initialScript = suppliedScript;
          } else {
            const written = await scheduler.write(() => agents.write({
              stopId: stop.stopId,
              dossier,
              arc: {
                promise: input.arc.promise,
                contribution: arcStop.contribution,
                bridge: arcStop.bridge,
              },
              previousStop: stop.previousStopId,
              nextStop: stop.nextStopId,
              voiceProfile: input.voiceProfile,
            }, agentExecution));
            appendDiagnostics(written, stopMetrics, stopDiagnostics);
            initialScript = assignNarrativeSentenceIdsV6(stop.stopId, written.value.text);
          }
          let finalScript = initialScript;
          if (auditStopIds && !auditStopIds.has(stop.stopId)) {
            const warnings = deterministicWarnings(input, dossier, finalScript);
            const record: NarrativeStopEditorialRecordV6 = {
              stopId: stop.stopId, initialScript, finalScript, audits: [], objections: [],
              adjudications: [], repairRoundUsed: false, warnings,
            };
            return { record, metrics: stopMetrics, diagnostics: stopDiagnostics, stopOpenIssueIds };
          }
          const initialAudits = await scheduler.auditStop(() => runPairedNarrativeAuditsV6(
            agents, { script: initialScript, dossier }, agentExecution
          ));
          initialAudits.forEach((result) => appendDiagnostics(
            result, stopMetrics, stopDiagnostics
          ));
          const audits = initialAudits.map((result) => result.value);
          const objections = buildNarrativeAuditObjectionsV6(audits);
          let adjudications: NarrativeAdjudicationV6[] = [];
          let repairRoundUsed = false;

          if (objections.length > 0) {
          const adjudicated = await scheduler.adjudicate(() => agents.adjudicate({
            script: initialScript, dossier, objections, scope: 'factual',
          }, agentExecution));
          appendDiagnostics(adjudicated, stopMetrics, stopDiagnostics);
          adjudications = adjudicated.value;
          const acceptedObjections = objections.filter((objection) => (
            adjudications.some((item) => item.objectionId === objection.objectionId
              && item.decision === 'accepted')
          ));
          if (acceptedObjections.length > 0 && consumeRepair()) {
            const repaired = await scheduler.write(() => agents.repair({
              script: initialScript, dossier, objections, adjudications, scope: 'factual',
            }, agentExecution));
            appendDiagnostics(repaired, stopMetrics, stopDiagnostics);
            finalScript = applyNarrativeLocalPatchV6(
              initialScript,
              [...new Set(acceptedObjections.map((objection) => objection.sentenceId))],
              repaired.value
            );
            repairRoundUsed = true;
            const finalAudits = await scheduler.auditStop(() => runPairedNarrativeAuditsV6(
              agents, { script: finalScript, dossier }, agentExecution
            ));
            finalAudits.forEach((result) => appendDiagnostics(
              result, stopMetrics, stopDiagnostics
            ));
            audits.push(...finalAudits.map((result) => result.value));
            const finalObjections = buildNarrativeAuditObjectionsV6(
              finalAudits.map((result) => result.value)
            );
            objections.push(...finalObjections);
            if (finalObjections.length > 0) {
              const finalAdjudicated = await scheduler.adjudicate(() => agents.adjudicate({
                script: finalScript, dossier, objections: finalObjections, scope: 'factual',
              }, agentExecution));
              appendDiagnostics(finalAdjudicated, stopMetrics, stopDiagnostics);
              adjudications.push(...finalAdjudicated.value);
              stopOpenIssueIds.push(...finalAdjudicated.value
                .filter((item) => item.decision === 'accepted')
                .map((item) => item.objectionId));
            }
          } else {
            stopOpenIssueIds.push(...acceptedObjections.map((objection) => objection.objectionId));
          }
          }
          const warnings = deterministicWarnings(input, dossier, finalScript);
          const record: NarrativeStopEditorialRecordV6 = {
            stopId: stop.stopId, initialScript, finalScript, audits, objections,
            adjudications, repairRoundUsed, warnings,
          };
          return { record, metrics: stopMetrics, diagnostics: stopDiagnostics, stopOpenIssueIds };
        } catch (error) {
          if (!workflowController.signal.aborted) workflowController.abort(error);
          throw new NarrativeStopExecutionErrorV6(error, stopMetrics, stopDiagnostics);
        }
      })
    )));
    const stopResults = settledStopResults.flatMap((result) => (
      result.status === 'fulfilled' ? [result.value] : []
    ));
    records = stopResults.map((result) => result.record);
    metrics.push(...stopResults.flatMap((result) => result.metrics));
    privateDiagnostics.push(...stopResults.flatMap((result) => result.diagnostics));
    openIssueIds.push(...stopResults.flatMap((result) => result.stopOpenIssueIds));
    const rejectedStop = settledStopResults.find((result) => result.status === 'rejected');
    for (const result of settledStopResults) {
      if (result.status === 'rejected' && result.reason instanceof NarrativeStopExecutionErrorV6) {
        metrics.push(...result.reason.metrics);
        privateDiagnostics.push(...result.reason.diagnostics);
      }
    }
    if (rejectedStop?.status === 'rejected') {
      throw rejectedStop.reason instanceof NarrativeStopExecutionErrorV6
        ? rejectedStop.reason.causeValue : rejectedStop.reason;
    }

    let scripts = records.map((record) => record.finalScript);
    let tourAuditResult = await scheduler.globalAudit(() => agents.auditTour({
      promise: input.arc.promise, scripts,
    }, agentExecution));
    appendDiagnostics(tourAuditResult, metrics, privateDiagnostics);
    const rejectedTourIssueIds = new Set<string>();
    let globalRepairUsed = false;
    const tourIssues = tourAuditResult.value.issues;
    for (const stopId of [...new Set(tourIssues.map((issue) => issue.stopId))]) {
      const record = records.find((item) => item.stopId === stopId);
      const dossier = dossierByStop.get(stopId);
      if (!record || !dossier) throw new Error(`tour audit references unknown stop ${stopId}`);
      const issues = tourIssues.filter((issue) => issue.stopId === stopId);
      const objections: NarrativeAuditObjectionV6[] = issues.map((issue) => ({
        objectionId: `tour:${issue.issueId}`,
        auditor: 'deepseek',
        sentenceId: issue.sentenceId,
        classification: issue.severity === 'hard' ? 'distorted' : 'unclear',
        reason: issue.reason,
        propositionIds: [],
      }));
      const adjudicated = await scheduler.adjudicate(() => agents.adjudicate({
        script: record.finalScript, dossier, objections, scope: 'tour',
      }, agentExecution));
      appendDiagnostics(adjudicated, metrics, privateDiagnostics);
      record.objections.push(...objections);
      record.adjudications.push(...adjudicated.value);
      for (const issue of issues) {
        if (adjudicated.value.some((item) => (
          item.objectionId === `tour:${issue.issueId}` && item.decision === 'rejected'
        ))) rejectedTourIssueIds.add(issue.issueId);
      }
      const accepted = objections.filter((objection) => adjudicated.value.some((item) => (
        item.objectionId === objection.objectionId && item.decision === 'accepted'
      )));
      if (accepted.length === 0) continue;
      if ((auditStopIds && !auditStopIds.has(stopId)) || !consumeRepair()) continue;
      const repaired = await scheduler.write(() => agents.repair({
        script: record.finalScript, dossier, objections, adjudications: adjudicated.value,
        scope: 'tour',
      }, agentExecution));
      appendDiagnostics(repaired, metrics, privateDiagnostics);
      record.finalScript = applyNarrativeLocalPatchV6(
        record.finalScript,
        [...new Set(accepted.map((objection) => objection.sentenceId))],
        repaired.value
      );
      record.repairRoundUsed = true;
      globalRepairUsed = true;
      const factualAudits = await scheduler.auditStop(() => runPairedNarrativeAuditsV6(
        agents, { script: record.finalScript, dossier }, agentExecution
      ));
      factualAudits.forEach((result) => appendDiagnostics(
        result, metrics, privateDiagnostics
      ));
      record.audits.push(...factualAudits.map((result) => result.value));
      const factualObjections = buildNarrativeAuditObjectionsV6(
        factualAudits.map((result) => result.value)
      );
      record.objections.push(...factualObjections);
      if (factualObjections.length > 0) {
        const factualAdjudicated = await scheduler.adjudicate(() => agents.adjudicate({
          script: record.finalScript, dossier, objections: factualObjections, scope: 'factual',
        }, agentExecution));
        appendDiagnostics(factualAdjudicated, metrics, privateDiagnostics);
        record.adjudications.push(...factualAdjudicated.value);
        openIssueIds.push(...factualAdjudicated.value
          .filter((item) => item.decision === 'accepted')
          .map((item) => item.objectionId));
      }
    }
    if (globalRepairUsed) {
      scripts = records.map((record) => record.finalScript);
      tourAuditResult = await scheduler.globalAudit(() => agents.auditTour({
        promise: input.arc.promise, scripts,
      }, agentExecution));
      appendDiagnostics(tourAuditResult, metrics, privateDiagnostics);
    }
    openIssueIds.push(...tourAuditResult.value.issues
      .filter((issue) => !rejectedTourIssueIds.has(issue.issueId))
      .map((issue) => issue.issueId));
    if (!tourAuditResult.value.progressionWorks) openIssueIds.push('tour:progressionWorks');
    if (!tourAuditResult.value.promiseDelivered) openIssueIds.push('tour:promiseDelivered');
    if (!tourAuditResult.value.closingWorks) openIssueIds.push('tour:closingWorks');
    for (const record of records) {
      record.warnings = deterministicWarnings(
        input, dossierByStop.get(record.stopId) as NarrativeDossierV6, record.finalScript
      );
      openIssueIds.push(...record.warnings.filter((warning) => warning.severity === 'hard')
        .map((warning) => warning.warningId));
    }
    const repetitionWarnings = narrativeRepetitionWarningsV6(scripts);
    const warnings = [...records.flatMap((record) => record.warnings), ...repetitionWarnings];
    const tourFingerprint = narrativeTourFingerprintV6({
      routeFingerprint: input.route.fingerprint,
      dossierFingerprints: input.route.stops.map((stop) => (
        (dossierByStop.get(stop.stopId) as NarrativeDossierV6).fingerprint
      )),
      scripts: scripts.map((script) => ({ stopId: script.stopId, text: script.text })),
    });
    const uniqueOpenIssues = [...new Set(openIssueIds)];
    const run: NarrativeEditorialRunV6 = uniqueOpenIssues.length > 0
      ? {
        ...baseRun(input), status: 'draft_review_required',
        openIssueIds: uniqueOpenIssues, tourFingerprint,
      }
      : {
        ...baseRun(input), status: 'ready_for_human_gate', tourFingerprint,
        stopReviews: input.route.stops.map((stop) => ({
          stopId: stop.stopId, decision: 'pending',
        })),
      };
    return {
      run, route: input.route, arc: input.arc, stops: records,
      tourAudit: tourAuditResult.value, warnings, metrics,
      privateDiagnostics,
    };
  } catch (error) {
    if (error instanceof NarrativeAgentProtocolErrorV6) {
      privateDiagnostics.push(error.diagnostic);
    }
    return {
      ...empty({
        ...baseRun(input), status: 'protocol_failed', stage: 'editorial_workflow',
        reason: error instanceof Error ? error.message : String(error),
      }),
      stops: records,
      metrics,
      privateDiagnostics,
    };
  }
}

export interface NarrativeReviewPackageV6 {
  run: NarrativeEditorialRunV6;
  promise: string;
  sources: Array<{
    stopId: string;
    sources: NarrativeDossierV6['sources'];
    passages: Array<{ passageId: string; sourceId: string; quote: string }>;
    propositions: NarrativeDossierV6['propositions'];
  }>;
  scripts: Array<{ stopId: string; text: string }>;
  objections: Array<{
    stopId: string;
    objectionId: string;
    classification: string;
    decision: 'accepted' | 'rejected' | 'unadjudicated';
    reason: string;
  }>;
  diffs: Array<{
    stopId: string;
    sentenceId: string;
    before: string;
    after: string;
  }>;
  warnings: NarrativeProtocolWarningV6[];
  metrics: {
    callCount: number;
    latencyMs: number;
    inputCharacters: number;
    inputTokens: number;
    outputTokens: number;
    reasoningTokens: number;
    cacheReadTokens: number;
    costUsd: number | null;
    costNote: string;
  };
  checklist: {
    wouldPay: null;
    wouldListenNext: null;
    closingWorks: boolean | null;
  };
}

export function buildNarrativeReviewPackageV6(
  result: NarrativeEditorialWorkflowResultV6,
  dossiers: NarrativeDossierV6[]
): NarrativeReviewPackageV6 {
  return {
    run: result.run,
    promise: result.arc.promise,
    sources: dossiers.map((dossier) => ({
      stopId: dossier.stopId,
      sources: dossier.sources,
      passages: dossier.passages.map((passage) => ({
        ...passage,
        quote: passage.quote.slice(0, 500),
      })),
      propositions: dossier.propositions,
    })),
    scripts: result.stops.map((stop) => ({ stopId: stop.stopId, text: stop.finalScript.text })),
    objections: result.stops.flatMap((stop) => stop.objections.map((objection) => {
      const adjudication = stop.adjudications.find((item) => item.objectionId === objection.objectionId);
      return {
        stopId: stop.stopId,
        objectionId: objection.objectionId,
        classification: objection.classification,
        decision: adjudication?.decision ?? 'unadjudicated',
        reason: adjudication?.reason ?? objection.reason,
      };
    })),
    diffs: result.stops.flatMap((stop) => stop.initialScript.sentences.flatMap((sentence) => {
      const final = stop.finalScript.sentences.find((item) => item.sentenceId === sentence.sentenceId);
      return final && final.text !== sentence.text
        ? [{ stopId: stop.stopId, sentenceId: sentence.sentenceId, before: sentence.text, after: final.text }]
        : [];
    })),
    warnings: result.warnings,
    metrics: {
      callCount: result.metrics.length,
      latencyMs: result.metrics.reduce((total, item) => total + item.latencyMs, 0),
      inputCharacters: result.metrics.reduce((total, item) => total + item.inputCharacters, 0),
      inputTokens: result.metrics.reduce((total, item) => total + item.inputTokens, 0),
      outputTokens: result.metrics.reduce((total, item) => total + item.outputTokens, 0),
      reasoningTokens: result.metrics.reduce((total, item) => total + item.reasoningTokens, 0),
      cacheReadTokens: result.metrics.reduce((total, item) => total + item.cacheReadTokens, 0),
      costUsd: result.metrics.some((item) => item.costUsd === null)
        ? null
        : result.metrics.reduce((total, item) => total + (item.costUsd ?? 0), 0),
      costNote: result.metrics.some((item) => item.costUsd === null)
        ? 'Coste desconocido: al menos una llamada no devolvió uso facturable.'
        : 'OpenRouter usa coste facturado; DeepSeek usa la tabla fechada del adaptador.',
    },
    checklist: {
      wouldPay: null,
      wouldListenNext: null,
      closingWorks: result.tourAudit?.closingWorks ?? null,
    },
  };
}
