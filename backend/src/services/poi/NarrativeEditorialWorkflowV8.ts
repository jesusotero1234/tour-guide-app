import { validateNarrativeArcShapeV6 } from './NarrativeArcArchitectV6';
import { NarrativeArcBundleV8 } from './NarrativeArcArchitectV8';
import { NarrativeRouteBriefV6, narrativeFingerprintV6, narrativeTourFingerprintV6, NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6 } from './NarrativeContractsV6';
import { NarrativeEditorialAgentsV8, NarrativeLengthOutcomeV8 } from './NarrativeEditorialAgentsV8';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
  NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
} from './NarrativeEvidenceBoundaryV8';
import {
  NarrativeEditorialWorkflowOptionsV6,
  NarrativeEditorialWorkflowResultV6,
  appendDiagnostics,
  mergeMechanicalStyleIssuesIntoTourAuditV8,
} from './NarrativeEditorialWorkflowV6';
import { NarrativeAgentProtocolErrorV6, NarrativeAgentResultV6, NarrativeTourAuditV6 } from './NarrativeEditorialAgentsV6';
import { NarrativeScriptV6, NarrativeAuditReportV6, NarrativeProtocolWarningV6, assignNarrativeSentenceIdsV6, auditNarrativeScriptDeterministicallyV6, buildNarrativeAuditObjectionsV6 } from './NarrativeEditorialV6';
import { createNarrativeSchedulerV6 } from './NarrativeSchedulerV6';
import { parseNarrativeWriterResponseV8 } from './NarrativeWriterContractV8';
import { parseCompactNarrativeAuditV8 } from './NarrativeCompactVerificationV8';
import { buildFinalNarrativeIssueStateV8, NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8 } from './NarrativeEditorialIssuePolicyV8';
import { decideNarrativeEditV8, reconcileNarrativeEditReportsV8 } from './NarrativeEditDecisionV8';
import { resolveNarrativeSentenceTargetsV8, assertNarrativeSentenceScopeV8 } from './NarrativeSentenceEditV8';
import {
  NarrativeEditorialStageStateV8, NarrativeStopStageV8, NarrativeFinalWriterTraceV8,
  createNarrativeStageStateV8, restoreNarrativeStageStateV8, narrativeStageScriptsFingerprintV8,
  validateNarrativeStageScriptV8, validateNarrativeStageTourAuditV8,
} from './NarrativeEditorialStageStateV8';

export interface NarrativeEditorialWorkflowOptionsV8 extends NarrativeEditorialWorkflowOptionsV6 {
  resumeState?: unknown;
  onCheckpoint?: (state: NarrativeEditorialStageStateV8) => Promise<void>;
  /** Validate saved stages without making requests (scorecard-only resume). */
  resumeOnly?: boolean;
}

export interface NarrativeEditorialWorkflowInputV8 {
  runId: string;
  createdAt: string;
  route: NarrativeRouteBriefV6;
  admittedStops: NarrativeAdmittedStopV8[];
  arcBundle: NarrativeArcBundleV8;
  voiceProfile: string[];
  privateArtifactPath: string;
}

export type NarrativeEditorialWorkflowResultV8 =
  | {
      status: 'complete';
      evidenceManifest: NarrativeEvidenceManifestV8;
      editorial: NarrativeEditorialWorkflowResultV6;
      lengthOutcomes: NarrativeLengthOutcomeV8[];
      stageState: NarrativeEditorialStageStateV8;
      finalWriterTraces: Record<string, NarrativeFinalWriterTraceV8>;
    }
  | {
      status: 'protocol_failed';
      evidenceManifest: NarrativeEvidenceManifestV8;
      reason: string;
    };

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function validateWorkflowBoundaryV8(
  input: NarrativeEditorialWorkflowInputV8,
  agents: NarrativeEditorialAgentsV8
): string | null {
  const manifest = input.arcBundle.manifest;
  if (manifest.schemaVersion !== NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8) {
    return 'invalid evidence manifest schema version';
  }
  if (manifest.routeFingerprint !== input.route.fingerprint) {
    return 'route/evidence manifest fingerprint mismatch';
  }
  if (agents.evidenceManifestFingerprint !== manifest.fingerprint) {
    return 'editorial agents/evidence manifest fingerprint mismatch';
  }
  if (
    input.route.stops.length !== input.admittedStops.length
    || manifest.stops.length !== input.admittedStops.length
  ) {
    return 'route/admitted/manifest cardinality mismatch';
  }

  for (let index = 0; index < input.route.stops.length; index += 1) {
    const routeStop = input.route.stops[index];
    const admitted = input.admittedStops[index];
    const manifestStop = manifest.stops[index];
    if (!routeStop || !admitted || !manifestStop) {
      return `missing V8 workflow stop at index ${index}`;
    }
    if (
      routeStop.stopId !== admitted.routeStopId
      || routeStop.wikidataId !== admitted.entityQid
      || admitted.dossier.stopId !== admitted.entityQid
      || admitted.evidence.routeStopId !== admitted.routeStopId
      || admitted.evidence.entityQid !== admitted.entityQid
      || admitted.evidence.routeEligible !== true
      || admitted.evidence.dossierFingerprint !== admitted.dossier.fingerprint
      || admitted.evidence.legacyV6IsSufficient !== admitted.dossier.sufficiency.isSufficient
      || manifestStop.routeStopId !== admitted.routeStopId
      || manifestStop.entityQid !== admitted.entityQid
      || manifestStop.evidenceTier !== admitted.evidence.evidenceTier
      || manifestStop.routeEligible !== admitted.evidence.routeEligible
      || manifestStop.dossierFingerprint !== admitted.evidence.dossierFingerprint
      || manifestStop.legacyV6IsSufficient !== admitted.evidence.legacyV6IsSufficient
      || !sameValue(manifestStop.gates, admitted.evidence.gates)
    ) {
      return `V8 workflow evidence mismatch for route stop ${routeStop.stopId}`;
    }
  }

  try {
    validateNarrativeArcShapeV6(input.arcBundle.arc, input.route);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
  return null;
}

export function collectNarrativeLengthOutcomesV8(
  editorial: NarrativeEditorialWorkflowResultV6,
  agents: NarrativeEditorialAgentsV8
): NarrativeLengthOutcomeV8[] {
  const outcomes: NarrativeLengthOutcomeV8[] = [];
  for (const stop of editorial.stops) {
    const outcome = agents.narrationLengthOutcome(stop.stopId, stop.finalScript.text);
    if (outcome !== null) {
      outcomes.push(outcome);
    }
  }
  return outcomes;
}

export async function runNarrativeEditorialWorkflowV8(
  input: NarrativeEditorialWorkflowInputV8,
  agents: NarrativeEditorialAgentsV8,
  options: NarrativeEditorialWorkflowOptionsV8 = {}
): Promise<NarrativeEditorialWorkflowResultV8> {
  const reason = validateWorkflowBoundaryV8(input, agents);
  if (reason) {
    return {
      status: 'protocol_failed',
      evidenceManifest: input.arcBundle.manifest,
      reason,
    };
  }

  const arc = input.arcBundle.arc;
  const stopIds = input.route.stops.map(stop => stop.stopId);
  const contextFingerprint = narrativeFingerprintV6({
    route: input.route, admittedStops: input.admittedStops, arc,
    voiceProfile: input.voiceProfile, policy: agents.policyFingerprint,
  });
  let state: NarrativeEditorialStageStateV8;
  try {
    state = options.resumeState === undefined
      ? createNarrativeStageStateV8(contextFingerprint, stopIds)
      : restoreNarrativeStageStateV8(options.resumeState, contextFingerprint, stopIds, id => agents.writerPlan(id));
    if (options.resumeState === undefined) {
      const supplied = options.scripts ?? [];
      if (new Set(supplied.map(s => s.stopId)).size !== supplied.length) throw new Error('duplicate supplied script');
      for (const script of supplied) {
        const stop = state.stops.find(s => s.stopId === script.stopId);
        if (!stop) throw new Error(`unknown supplied script ${script.stopId}`);
        validateNarrativeStageScriptV8(script, stop.stopId);
        stop.script = script;
        stop.initialScript = script;
        stop.writeAttempted = true;
      }
    }
  } catch (error) {
    return { status: 'protocol_failed', evidenceManifest: input.arcBundle.manifest,
      reason: error instanceof Error ? error.message : String(error) };
  }
  const baseRun = {
    schemaVersion: NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6,
    runId: input.runId, caseId: input.route.caseId, createdAt: input.createdAt,
    diagnostics: { privateArtifactPath: input.privateArtifactPath },
  };
  const editorial: NarrativeEditorialWorkflowResultV6 = {
    run: { ...baseRun, status: 'draft_review_required', openIssueIds: [], tourFingerprint: '' },
    route: input.route, arc, stops: [], tourAudit: null, warnings: [], metrics: [], privateDiagnostics: [], performance: null,
  };
  const scheduler = options.scheduler ?? createNarrativeSchedulerV6(options.profile ?? agents.profileName);
  const execution = { signal: options.signal, onProgress: options.onProgress };
  const save = async () => {
    await options.onCheckpoint?.(JSON.parse(JSON.stringify(state)) as NarrativeEditorialStageStateV8);
  };
  const record = (result: NarrativeAgentResultV6<unknown>) => appendDiagnostics(result, editorial.metrics, editorial.privateDiagnostics);
  const recoverable = (error: unknown): error is NarrativeAgentProtocolErrorV6 => {
    if (options.signal?.aborted || !(error instanceof NarrativeAgentProtocolErrorV6)) return false;
    return !error.diagnostic.attempts.some(attempt => /(?:HTTP|status(?: code)?)[\s:=]*(?:400|401|402|403|404|422)\b/iu.test(attempt.error ?? ''));
  };
  const bridgePropositions = (index: number) => {
    const ids = new Set(arc.stops[index].bridgePropositionIds ?? []);
    return (input.admittedStops[index + 1]?.dossier.propositions ?? []).filter(p => ids.has(p.propositionId));
  };
  const validateReport = (index: number, report: NarrativeAuditReportV6, script: NarrativeScriptV6 = state.stops[index].script!) => {
    const bridgeIds = new Set(bridgePropositions(index).flatMap(p => p.passageIds));
    const passageIds = [...input.admittedStops[index].dossier.passages,
      ...(input.admittedStops[index + 1]?.dossier.passages ?? []).filter(p => bridgeIds.has(p.passageId))].map(p => p.passageId);
    return parseCompactNarrativeAuditV8({ checks: report.findings.map(f => ({
      sentenceId: f.sentenceId, classification: f.classification, passageIds: f.passageIds ?? [], reason: f.reason,
    })) }, script, passageIds);
  };
  // Cached reports still have to satisfy the current citation/coverage contract.
  try {
    state.stops.forEach((stop, index) => {
      if (stop.verification) stop.verification.report = validateReport(index, stop.verification.report);
      if (stop.editComparison) {
        const comp = stop.editComparison;
        if (comp.before.verification) comp.before.verification.report = validateReport(index, comp.before.verification.report, comp.before.script);
        if (comp.candidate.verification) comp.candidate.verification.report = validateReport(index, comp.candidate.verification.report, comp.candidate.script);
        if (comp.decision !== 'pending') {
          const plan = agents.writerPlan(stop.stopId);
          const targetWords = plan?.narrationTarget.targetWords;
          const selected = comp.decision === 'rejected' ? comp.before : comp.candidate;
          const reconciled = reconcileNarrativeEditReportsV8(comp.before, comp.candidate);
          const selectedReconciled = comp.decision === 'rejected' ? reconciled.before : reconciled.candidate;
          if (narrativeFingerprintV6(stop.verification?.report) !== narrativeFingerprintV6(validateReport(index, selectedReconciled, selected.script))) {
            throw new Error('protocol_failed: selected verification incoherence');
          }
          const recomputed = decideNarrativeEditV8(comp.before, comp.candidate, targetWords, comp.targetSentenceIds);
          if (recomputed.decision !== comp.decision || recomputed.reason !== comp.reason) {
            throw new Error('protocol_failed: edit decision incoherence');
          }
        }
      }
    });
  } catch (error) {
    return { status: 'protocol_failed', evidenceManifest: input.arcBundle.manifest,
      reason: `invalid saved verification: ${error instanceof Error ? error.message : String(error)}` };
  }
  await save();
  for (const [index, stop] of state.stops.entries()) {
    // An explicit resume may retry a missing draft; it never rewrites a saved one.
    if (options.resumeOnly || stop.script) continue;
    options.signal?.throwIfAborted();
    stop.writeAttempted = true;
    await save();
    let written;
    try {
      written = await scheduler.write(() => agents.write({
        stopId: stop.stopId, dossier: input.admittedStops[index].dossier,
        arc: { promise: arc.promise, contribution: arc.stops[index].contribution, bridge: arc.stops[index].bridge },
        previousStop: input.route.stops[index - 1]?.name ?? null,
        nextStop: input.route.stops[index + 1]?.name ?? null, voiceProfile: input.voiceProfile,
      }, execution));
    } catch (error) {
      if (!recoverable(error)) throw error;
      record({ value: null, diagnostic: error.diagnostic });
      stop.error = { stage: 'write', message: error.message };
      await save();
      continue;
    }
    record(written);
    const plan = agents.writerPlan(stop.stopId);
    stop.draft = plan ? parseNarrativeWriterResponseV8(plan, {
      stop_id: stop.stopId, segments: (written.value as { segments?: unknown }).segments,
    }) : null;
    stop.script = assignNarrativeSentenceIdsV6(stop.stopId, stop.draft?.text ?? written.value.text, { sentenceBoundaryPolicy: 'v8' });
    stop.initialScript = stop.script;
    stop.error = null;
    await save();
  }
  const settleEdit = (stop: NarrativeStopStageV8) => {
    if (!stop.editComparison || stop.editComparison.decision !== 'pending' || !stop.verification) return;
    const comp = stop.editComparison;
    comp.candidate.verification = stop.verification;
    const plan = agents.writerPlan(stop.stopId);
    const targetWords = plan?.narrationTarget.targetWords;
    const reconciled = reconcileNarrativeEditReportsV8(comp.before, comp.candidate);
    const result = decideNarrativeEditV8(comp.before, comp.candidate, targetWords, comp.targetSentenceIds);
    comp.decision = result.decision;
    comp.reason = result.reason;
    const selected = result.decision === 'rejected' ? comp.before : comp.candidate;
    const selectedReconciled = result.decision === 'rejected' ? reconciled.before : reconciled.candidate;
    stop.script = selected.script;
    stop.draft = selected.draft;
    stop.verification = { scriptFingerprint: selected.script.fingerprint, report: selectedReconciled };
  };
  const verify = async (stop: NarrativeStopStageV8, index: number) => {
    if (options.resumeOnly || !stop.script || stop.verification) return;
    options.signal?.throwIfAborted();
    let checked;
    try {
      checked = await scheduler.auditStop(() => agents.verify({ script: stop.script!, dossier: input.admittedStops[index].dossier }, execution));
    } catch (error) {
      if (!recoverable(error)) throw error;
      record({ value: null, diagnostic: error.diagnostic });
      stop.error = { stage: 'verify', message: error.message };
      await save();
      return;
    }
    record(checked);
    stop.verification = { scriptFingerprint: stop.script.fingerprint, report: validateReport(index, checked.value) };
    if (stop.firstPassVerified === null) stop.firstPassVerified = !stop.editAttempted
      && stop.verification.report.findings.every(f => ['supported', 'authorized_inference'].includes(f.classification));
    if (stop.error?.stage === 'verify') stop.error = null;
    settleEdit(stop);
    await save();
  };
  for (const [index, stop] of state.stops.entries()) {
    await verify(stop, index);
    if (stop.verification && stop.editComparison && stop.editComparison.decision === 'pending') {
      settleEdit(stop);
      await save();
    }
  }
  const globalReview = async () => {
    if (options.resumeOnly || state.globalReview || state.globalReviewsAttempted >= 2
      || state.stops.some(s => !s.script || !s.verification)) return;
    options.signal?.throwIfAborted();
    state.globalReviewsAttempted += 1;
    await save();
    const scripts = state.stops.map(s => s.script!);
    let reviewed;
    try {
      reviewed = await scheduler.globalAudit(() => agents.auditTour({ promise: arc.promise, scripts }, execution));
    } catch (error) {
      if (!recoverable(error)) throw error;
      record({ value: null, diagnostic: error.diagnostic });
      state.globalError = error.message;
      await save();
      return;
    }
    record(reviewed);
    try {
      validateNarrativeStageTourAuditV8(reviewed.value, scripts);
    } catch (error) {
      state.globalError = `invalid global review: ${error instanceof Error ? error.message : String(error)}`;
      await save();
      return;
    }
    state.globalReview = { scriptsFingerprint: narrativeStageScriptsFingerprintV8(state.stops),
      audit: mergeMechanicalStyleIssuesIntoTourAuditV8(reviewed.value, scripts) };
    state.globalError = null;
    await save();
  };
  await globalReview();
  const warningsFor = (index: number): NarrativeProtocolWarningV6[] => {
    const stop = state.stops[index];
    if (!stop.script) return [];
    const dossier = input.admittedStops[index].dossier;
    const warnings = auditNarrativeScriptDeterministicallyV6(stop.script, {
      language: input.route.language, policy: 'v8',
      authorizedNames: [...dossier.authorizedNames, input.route.city, input.route.country, ...input.route.stops.map(s => s.name)],
      authorizedNumbers: dossier.authorizedNumbers,
      authorizedPropositionTexts: [...dossier.propositions.map(p => p.text), ...dossier.passages.map(p => p.quote), ...bridgePropositions(index).map(p => p.text)],
    }).filter(w => w.code !== 'duration_outlier').map(w => ({ ...w, scriptFingerprint: stop.script!.fingerprint }));
    const length = agents.narrationLengthOutcome(stop.stopId, stop.script.text);
    if (length && length.lengthStatus !== 'within_bounds') warnings.push({
      warningId: `${stop.stopId}:duration_outlier`, stopId: stop.stopId, code: 'duration_outlier', severity: 'hard',
      message: `Narración ${length.actualWords} palabras; banda ${length.minimumWords}-${length.maximumWords}.`,
      scriptFingerprint: stop.script.fingerprint,
    });
    return warnings;
  };
  const savedGlobalReview = state.globalReview;
  const reviewBeforeEdits = state.globalReview?.audit;
  let editsRemaining = Math.min(options.maximumRepairCalls ?? stopIds.length, options.maximumAdditionalRepairs ?? stopIds.length);
  for (const [index, stop] of state.stops.entries()) {
    if (options.resumeOnly || !reviewBeforeEdits || !stop.script || !stop.draft || !stop.verification
      || stop.editAttempted || editsRemaining <= 0 || (options.repairStopIds && !options.repairStopIds.includes(stop.stopId))) continue;
    const objections = buildNarrativeAuditObjectionsV6([stop.verification.report]);
    const warnings = warningsFor(index).filter(w => w.severity === 'hard' && w.code !== 'duration_outlier');
    const tourIssues = reviewBeforeEdits.issues.filter(issue => issue.stopId === stop.stopId);
    const combined = [
      ...objections.map(item => ({ sentenceId: item.sentenceId, reason: item.reason })),
      ...tourIssues.map(item => ({ sentenceId: item.sentenceId, reason: item.reason })),
      ...warnings.map(item => ({ sentenceId: item.sentenceId, reason: item.message })),
    ];
    if (!combined.length) continue;
    const uniqueTargetSentenceIds = [...new Set(combined.map(item => item.sentenceId).filter((id): id is string => typeof id === 'string'))];
    let resolvedTargets;
    try {
      if (combined.some(item => typeof item.sentenceId !== 'string')) throw new Error('issue has no sentence anchor');
      resolvedTargets = resolveNarrativeSentenceTargetsV8(stop.stopId, stop.draft!, uniqueTargetSentenceIds);
    } catch (error) {
      stop.error = { stage: 'edit', message: `edit_scope_unresolved: ${error instanceof Error ? error.message : String(error)}` };
      await save();
      continue;
    }
    const targetSentenceIds = resolvedTargets.map(t => t.sentenceId);
    const reasons = combined.map(item => `${item.sentenceId}: ${item.reason}`);
    options.signal?.throwIfAborted();
    stop.editAttempted = true;
    editsRemaining -= 1;
    await save();
    let edited;
    try {
      edited = await scheduler.write(() => agents.edit(stop.stopId, stop.draft!, targetSentenceIds, reasons, execution));
    } catch (error) {
      if (!recoverable(error)) throw error;
      record({ value: null, diagnostic: error.diagnostic });
      stop.error = { stage: 'edit', message: error.message };
      await save();
      continue;
    }
    record(edited);
    const before = { draft: stop.draft, script: stop.script, verification: stop.verification };
    let candidateDraft;
    try {
      candidateDraft = parseNarrativeWriterResponseV8(agents.writerPlan(stop.stopId)!, { stop_id: stop.stopId, segments: edited.value.segments });
      assertNarrativeSentenceScopeV8(stop.stopId, stop.draft!, candidateDraft, targetSentenceIds);
    } catch (error) {
      stop.error = { stage: 'edit', message: `edit_scope_invalid: ${error instanceof Error ? error.message : String(error)}` };
      await save();
      continue;
    }
    stop.draft = candidateDraft;
    stop.script = assignNarrativeSentenceIdsV6(stop.stopId, candidateDraft.text, { sentenceBoundaryPolicy: 'v8' });
    stop.editComparison = { before, candidate: { draft: stop.draft, script: stop.script, verification: null }, decision: 'pending', reason: null, targetSentenceIds };
    stop.verification = null;
    stop.error = null;
    state.globalReview = null;
    await save();
    await verify(stop, index);
  }
  // Only a changed tour needs another review; a failed call is retried on an explicit resume.
  if (reviewBeforeEdits && !state.globalReview) {
    if (savedGlobalReview && narrativeStageScriptsFingerprintV8(state.stops) === savedGlobalReview.scriptsFingerprint) {
      state.globalReview = savedGlobalReview;
    } else {
      await globalReview();
    }
  }
  editorial.stops = state.stops.flatMap((stop, index) => stop.script ? [{
    stopId: stop.stopId, initialScript: stop.initialScript ?? stop.script, finalScript: stop.script,
    audits: stop.verification ? [stop.verification.report] : [],
    objections: stop.verification ? buildNarrativeAuditObjectionsV6([stop.verification.report]) : [],
    adjudications: [], repairRoundUsed: stop.editAttempted, warnings: warningsFor(index),
  }] : []);
  editorial.warnings = editorial.stops.flatMap(s => s.warnings);
  const scripts = editorial.stops.map(s => s.finalScript);
  const tourFingerprint = narrativeTourFingerprintV6({ routeFingerprint: input.route.fingerprint,
    dossierFingerprints: input.admittedStops.map(s => s.dossier.fingerprint), scripts });
  editorial.tourAudit = state.globalReview?.audit ?? null;
  const tourAudit = editorial.tourAudit;
  const issueState = buildFinalNarrativeIssueStateV8(editorial.warnings, editorial.stops.flatMap(s => s.objections),
    (tourAudit?.issues ?? []).map(issue => ({ objectionId: `tour:${issue.issueId}`, auditor: 'deepseek_pro' as const,
      sentenceId: issue.sentenceId, classification: 'unclear' as const, reason: issue.reason, propositionIds: [] })), scripts,
    { progressionWorks: tourAudit?.progressionWorks ?? null, promiseDelivered: tourAudit?.promiseDelivered ?? null,
      closingWorks: tourAudit?.closingWorks ?? null, tourFingerprint });
  for (const stop of state.stops) {
    const pending = !stop.script ? 'write_pending' : !stop.verification ? 'verification_pending'
      : stop.error ? `${stop.error.stage}_failed` : agents.writerPlan(stop.stopId) && !stop.draft ? 'traceability_missing' : null;
    if (!pending) continue;
    const issueId = `${stop.stopId}:${pending}`;
    issueState.issues.push({ schemaVersion: NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8, issueId,
      source: 'deterministic', stopId: stop.stopId, sentenceIds: [], code: pending, severity: 'hard', state: 'open',
      scriptFingerprint: stop.script?.fingerprint ?? contextFingerprint, reason: stop.error?.message ?? pending });
    issueState.openIssueIds.push(issueId);
    issueState.summary.hardWarnings += 1;
    issueState.summary.byStop[stop.stopId] = (issueState.summary.byStop[stop.stopId] ?? 0) + 1;
  }
  issueState.summary.totalOpen = issueState.openIssueIds.length;
  editorial.issueStateV8 = issueState;
  editorial.run = issueState.openIssueIds.length ? { ...baseRun, status: 'draft_review_required',
    openIssueIds: issueState.openIssueIds, tourFingerprint } : { ...baseRun, status: 'ready_for_human_gate', tourFingerprint,
    stopReviews: stopIds.map(stopId => ({ stopId, decision: 'pending' as const })) };
  const finalWriterTraces: Record<string, NarrativeFinalWriterTraceV8> = {};
  for (const stop of state.stops) {
    const plan = agents.writerPlan(stop.stopId);
    if (plan && stop.draft && stop.script) finalWriterTraces[stop.stopId] = { plan, draft: stop.draft, scriptFingerprint: stop.script.fingerprint };
  }
  await save();
  return { status: 'complete', evidenceManifest: input.arcBundle.manifest, editorial,
    lengthOutcomes: collectNarrativeLengthOutcomesV8(editorial, agents), stageState: state, finalWriterTraces };
}
