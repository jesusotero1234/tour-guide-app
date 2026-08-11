import { EditorialCallResultV6 } from './EditorialStructuredLlmV6';
import {
  NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6,
  NarrativeEditorialRunV6,
  NarrativeRouteBriefV6,
  narrativeTourFingerprintV6,
} from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NarrativeEditorialAgentsV6,
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

interface NarrativeCallMetricV6 {
  callId: string;
  model: string;
  latencyMs: number;
  inputCharacters: number;
  status: string;
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
}

function metric(result: EditorialCallResultV6<unknown>): NarrativeCallMetricV6 {
  return {
    callId: result.callId,
    model: result.model,
    latencyMs: result.attempts.reduce((total, attempt) => total + attempt.latencyMs, 0),
    inputCharacters: result.inputCharacters,
    status: result.status,
  };
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

function hardAuditIssueIds(reports: NarrativeAuditReportV6[]): string[] {
  return buildNarrativeAuditObjectionsV6(reports).map((objection) => objection.objectionId);
}

export async function runNarrativeEditorialWorkflowV6(
  input: NarrativeEditorialWorkflowInputV6,
  agents: NarrativeEditorialAgentsV6
): Promise<NarrativeEditorialWorkflowResultV6> {
  const empty = (run: NarrativeEditorialRunV6): NarrativeEditorialWorkflowResultV6 => ({
    run, route: input.route, arc: input.arc, stops: [], tourAudit: null, warnings: [], metrics: [],
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

  const records: NarrativeStopEditorialRecordV6[] = [];
  const metrics: NarrativeCallMetricV6[] = [];
  const openIssueIds: string[] = [];
  try {
    for (const stop of input.route.stops) {
      const dossier = dossierByStop.get(stop.stopId) as NarrativeDossierV6;
      const arcStop = input.arc.stops.find((item) => item.stopId === stop.stopId);
      if (!arcStop) throw new Error(`arc is missing stop ${stop.stopId}`);
      const written = await agents.write({
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
      });
      metrics.push(metric(written.diagnostic));
      const initialScript = assignNarrativeSentenceIdsV6(stop.stopId, written.value.text);
      let finalScript = initialScript;
      const initialAudits = await Promise.all([
        agents.audit({ script: initialScript, dossier }, 'deepseek'),
        agents.audit({ script: initialScript, dossier }, 'gemma'),
      ]);
      metrics.push(...initialAudits.map((result) => metric(result.diagnostic)));
      const audits = initialAudits.map((result) => result.value);
      const objections = buildNarrativeAuditObjectionsV6(audits);
      let adjudications: NarrativeAdjudicationV6[] = [];
      let repairRoundUsed = false;

      if (objections.length > 0) {
        const adjudicated = await agents.adjudicate({ script: initialScript, dossier, objections });
        metrics.push(metric(adjudicated.diagnostic));
        adjudications = adjudicated.value;
        const acceptedObjections = objections.filter((objection) => (
          adjudications.some((item) => item.objectionId === objection.objectionId
            && item.decision === 'accepted')
        ));
        if (acceptedObjections.length > 0) {
          const repaired = await agents.repair({
            script: initialScript, dossier, objections, adjudications,
          });
          metrics.push(metric(repaired.diagnostic));
          finalScript = applyNarrativeLocalPatchV6(
            initialScript,
            [...new Set(acceptedObjections.map((objection) => objection.sentenceId))],
            repaired.value
          );
          repairRoundUsed = true;
          const finalAudits = await Promise.all([
            agents.audit({ script: finalScript, dossier }, 'deepseek'),
            agents.audit({ script: finalScript, dossier }, 'gemma'),
          ]);
          metrics.push(...finalAudits.map((result) => metric(result.diagnostic)));
          audits.push(...finalAudits.map((result) => result.value));
          openIssueIds.push(...hardAuditIssueIds(finalAudits.map((result) => result.value)));
        }
      }
      const warnings = auditNarrativeScriptDeterministicallyV6(finalScript, {
        language: input.route.language,
        authorizedNumbers: dossier.authorizedNumbers,
      });
      openIssueIds.push(...warnings.filter((warning) => warning.severity === 'hard')
        .map((warning) => warning.warningId));
      records.push({
        stopId: stop.stopId, initialScript, finalScript, audits, objections,
        adjudications, repairRoundUsed, warnings,
      });
    }

    const scripts = records.map((record) => record.finalScript);
    const repetitionWarnings = narrativeRepetitionWarningsV6(scripts);
    const tourAuditResult = await agents.auditTour({ promise: input.arc.promise, scripts });
    metrics.push(metric(tourAuditResult.diagnostic));
    openIssueIds.push(...tourAuditResult.value.issues
      .filter((issue) => issue.severity === 'hard').map((issue) => issue.issueId));
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
    };
  } catch (error) {
    return {
      ...empty({
        ...baseRun(input), status: 'protocol_failed', stage: 'editorial_workflow',
        reason: error instanceof Error ? error.message : String(error),
      }),
      stops: records,
      metrics,
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
  metrics: { callCount: number; latencyMs: number; inputCharacters: number };
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
    },
    checklist: {
      wouldPay: null,
      wouldListenNext: null,
      closingWorks: result.tourAudit?.closingWorks ?? null,
    },
  };
}
