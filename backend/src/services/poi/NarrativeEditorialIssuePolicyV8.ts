import {
  NarrativeAdjudicationV6,
  NarrativeAuditObjectionV6,
  NarrativeProtocolWarningV6,
  NarrativeScriptV6,
} from './NarrativeEditorialV6';

export const NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8 = 'narrative-editorial-issue-v8' as const;
export const NARRATIVE_EDITORIAL_ISSUE_SUMMARY_SCHEMA_VERSION_V8 = 'narrative-editorial-issue-summary-v8' as const;

export type NarrativeEditorialIssueSourceV8 = 'deterministic' | 'factual' | 'tour';
export type NarrativeEditorialIssueSeverityV8 = 'hard' | 'soft';
export type NarrativeEditorialIssueStateV8 = 'open' | 'observation';

export interface NarrativeEditorialIssueV8 {
  schemaVersion: typeof NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8;
  issueId: string;
  source: NarrativeEditorialIssueSourceV8;
  stopId: string;
  sentenceIds: string[];
  code: string;
  severity: NarrativeEditorialIssueSeverityV8;
  state: NarrativeEditorialIssueStateV8;
  scriptFingerprint: string;
  reason: string;
  sourceIssueIds?: string[];
}

export interface NarrativeEditorialIssueSummaryV8 {
  schemaVersion: typeof NARRATIVE_EDITORIAL_ISSUE_SUMMARY_SCHEMA_VERSION_V8;
  totalOpen: number;
  hardWarnings: number;
  softWarnings: number;
  acceptedFactual: number;
  acceptedTour: number;
  byStop: Record<string, number>;
}

export interface NarrativeEditorialRepairPlanV8 {
  stopId: string;
  sentenceIds: string[];
  objections: NarrativeAuditObjectionV6[];
  adjudications: NarrativeAdjudicationV6[];
  sourceIssueIds: string[];
}

export interface NarrativeEditorialStopRecordV8 {
  stopId: string;
  script: NarrativeScriptV6;
  warnings: NarrativeProtocolWarningV6[];
  objections: NarrativeAuditObjectionV6[];
  adjudications: NarrativeAdjudicationV6[];
}

export interface NarrativeEditorialFinalIssueStateV8 {
  issues: NarrativeEditorialIssueV8[];
  openIssueIds: string[];
  summary: NarrativeEditorialIssueSummaryV8;
}

function uniqueSorted(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function resolveCanonicalSentenceId(
  sentenceId: string,
  sentenceById: Map<string, NarrativeScriptV6>
): string {
  if (sentenceById.has(sentenceId)) return sentenceId;
  const match = sentenceId.match(/^(.*)-S(\d+)$/);
  if (match) {
    const paddedId = `${match[1]}-S${match[2].padStart(3, '0')}`;
    if (sentenceById.has(paddedId)) return paddedId;
  }
  throw new Error(`no exact sentence match for ${sentenceId}`);
}

function acceptedObjectionsForStop(
  stopId: string,
  objections: NarrativeAuditObjectionV6[],
  adjudications: NarrativeAdjudicationV6[]
): NarrativeAuditObjectionV6[] {
  const acceptedIds = new Set(
    adjudications
      .filter((item) => item.decision === 'accepted')
      .map((item) => item.objectionId)
  );
  return objections.filter((objection) => (
    objection.sentenceId.startsWith(`${stopId}-S`) && acceptedIds.has(objection.objectionId)
  ));
}

export function planNarrativeRepairsV8(
  routeStopIds: string[],
  stops: NarrativeEditorialStopRecordV8[],
  allowedStopIds?: string[],
  maximumRepairCalls = Number.POSITIVE_INFINITY
): NarrativeEditorialRepairPlanV8[] {
  const allowed = allowedStopIds ? new Set(allowedStopIds) : undefined;
  const stopById = new Map(stops.map((stop) => [stop.stopId, stop]));
  const plans: NarrativeEditorialRepairPlanV8[] = [];
  let remaining = maximumRepairCalls;

  for (const stopId of routeStopIds) {
    if (remaining <= 0) break;
    if (allowed && !allowed.has(stopId)) continue;
    const stop = stopById.get(stopId);
    if (!stop) throw new Error(`unknown stop ${stopId}`);

    const hardWarnings = stop.warnings.filter((warning) => (
      warning.severity === 'hard' && warning.sentenceId
    ));
    const acceptedFactual = acceptedObjectionsForStop(stopId, stop.objections, stop.adjudications);
    const deterministicObjections: NarrativeAuditObjectionV6[] = hardWarnings.map((warning) => ({
      objectionId: `deterministic:${warning.warningId}`,
      auditor: 'deepseek',
      sentenceId: warning.sentenceId as string,
      classification: 'distorted',
      reason: warning.message,
      propositionIds: [],
    }));
    const combinedObjections = [...deterministicObjections, ...acceptedFactual];
    if (combinedObjections.length === 0) continue;

    const combinedAdjudications = [
      ...deterministicObjections.map((objection) => ({
        objectionId: objection.objectionId,
        decision: 'accepted' as const,
        reason: 'deterministic hard warning requires repair',
      })),
      ...stop.adjudications.filter((item) => (
        acceptedFactual.some((objection) => objection.objectionId === item.objectionId)
      )),
    ];
    const sentenceIds = uniqueSorted(combinedObjections.map((objection) => objection.sentenceId));
    const sourceIssueIds = uniqueSorted([
      ...hardWarnings.map((warning) => warning.warningId),
      ...acceptedFactual.map((objection) => objection.objectionId),
    ]);

    plans.push({
      stopId,
      sentenceIds,
      objections: combinedObjections,
      adjudications: combinedAdjudications,
      sourceIssueIds,
    });
    remaining -= 1;
  }

  return plans;
}

export function buildFinalNarrativeIssueStateV8(
  finalWarnings: NarrativeProtocolWarningV6[],
  finalAcceptedFactualObjections: NarrativeAuditObjectionV6[],
  finalAcceptedTourObjections: NarrativeAuditObjectionV6[],
  finalScripts: NarrativeScriptV6[],
  tourBooleanFailures: {
    progressionWorks: boolean;
    promiseDelivered: boolean;
    closingWorks: boolean;
    tourFingerprint: string;
  }
): NarrativeEditorialFinalIssueStateV8 {
  if (!tourBooleanFailures.tourFingerprint) {
    throw new Error('tourFingerprint is required for tour boolean statuses');
  }
  const scriptByStop = new Map(finalScripts.map((script) => [script.stopId, script]));
  const sentenceById = new Map<string, NarrativeScriptV6>();
  for (const script of finalScripts) {
    for (const sentence of script.sentences) {
      sentenceById.set(sentence.sentenceId, script);
    }
  }
  const issues: NarrativeEditorialIssueV8[] = [];

  for (const warning of finalWarnings) {
    const script = scriptByStop.get(warning.stopId);
    if (!script) throw new Error(`unknown stop ${warning.stopId}`);
    if (!warning.scriptFingerprint) throw new Error(`warning ${warning.warningId} missing scriptFingerprint`);
    if (warning.scriptFingerprint !== script.fingerprint) {
      throw new Error(`warning ${warning.warningId} fingerprint does not match final script`);
    }
    const sentenceIds = warning.sentenceId ? [warning.sentenceId] : [];
    issues.push({
      schemaVersion: NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8,
      issueId: warning.warningId,
      source: 'deterministic',
      stopId: warning.stopId,
      sentenceIds,
      code: warning.code,
      severity: warning.severity,
      state: warning.severity === 'hard' ? 'open' : 'observation',
      scriptFingerprint: script.fingerprint,
      reason: warning.message,
    });
  }

  for (const objection of finalAcceptedFactualObjections) {
    const canonicalSentenceId = resolveCanonicalSentenceId(objection.sentenceId, sentenceById);
    const script = sentenceById.get(canonicalSentenceId)!;
    issues.push({
      schemaVersion: NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8,
      issueId: objection.objectionId,
      source: 'factual',
      stopId: script.stopId,
      sentenceIds: [canonicalSentenceId],
      code: objection.classification,
      severity: 'hard',
      state: 'open',
      scriptFingerprint: script.fingerprint,
      reason: objection.reason,
    });
  }

  for (const objection of finalAcceptedTourObjections) {
    const canonicalSentenceId = resolveCanonicalSentenceId(objection.sentenceId, sentenceById);
    const script = sentenceById.get(canonicalSentenceId)!;
    const canonicalId = objection.objectionId.startsWith('tour:')
      ? objection.objectionId
      : `tour:${objection.objectionId}`;
    issues.push({
      schemaVersion: NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8,
      issueId: canonicalId,
      source: 'tour',
      stopId: script.stopId,
      sentenceIds: [canonicalSentenceId],
      code: objection.classification,
      severity: 'hard',
      state: 'open',
      scriptFingerprint: script.fingerprint,
      reason: objection.reason,
    });
  }

  const booleanFailures: Array<{ id: string; reason: string }> = [];
  if (!tourBooleanFailures.progressionWorks) {
    booleanFailures.push({ id: 'tour:progressionWorks', reason: 'Tour progression does not work' });
  }
  if (!tourBooleanFailures.promiseDelivered) {
    booleanFailures.push({ id: 'tour:promiseDelivered', reason: 'Tour promise not delivered' });
  }
  if (!tourBooleanFailures.closingWorks) {
    booleanFailures.push({ id: 'tour:closingWorks', reason: 'Tour closing does not work' });
  }

  for (const failure of booleanFailures) {
    issues.push({
      schemaVersion: NARRATIVE_EDITORIAL_ISSUE_SCHEMA_VERSION_V8,
      issueId: failure.id,
      source: 'tour',
      stopId: 'tour',
      sentenceIds: [],
      code: failure.id.split(':')[1] ?? 'tour_boolean',
      severity: 'hard',
      state: 'open',
      scriptFingerprint: tourBooleanFailures.tourFingerprint,
      reason: failure.reason,
    });
  }

  const openIssueIds = uniqueSorted(
    issues.filter((issue) => issue.state === 'open').map((issue) => issue.issueId)
  );
  const byStop: Record<string, number> = {};
  for (const issue of issues) {
    if (issue.stopId !== 'tour') byStop[issue.stopId] = (byStop[issue.stopId] ?? 0) + 1;
  }

  const summary: NarrativeEditorialIssueSummaryV8 = {
    schemaVersion: NARRATIVE_EDITORIAL_ISSUE_SUMMARY_SCHEMA_VERSION_V8,
    totalOpen: openIssueIds.length,
    hardWarnings: issues.filter((issue) => (
      issue.source === 'deterministic' && issue.severity === 'hard'
    )).length,
    softWarnings: issues.filter((issue) => (
      issue.source === 'deterministic' && issue.severity === 'soft'
    )).length,
    acceptedFactual: issues.filter((issue) => issue.source === 'factual').length,
    acceptedTour: issues.filter((issue) => issue.source === 'tour' && issue.sentenceIds.length > 0).length,
    byStop,
  };

  return { issues, openIssueIds, summary };
}
