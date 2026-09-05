import { narrativeFingerprintV6 } from './NarrativeContractsV6';
import { NarrativeScriptV6, NarrativeAuditReportV6, assignNarrativeSentenceIdsV6 } from './NarrativeEditorialV6';
import { NarrativeTourAuditV6 } from './NarrativeEditorialAgentsV6';
import { NarrativeStructuredWriterResultV8, NarrativeWriterPlanV8, parseNarrativeWriterResponseV8 } from './NarrativeWriterContractV8';
import { NarrativeEditComparisonV8 } from './NarrativeEditDecisionV8';
import { assertNarrativeSentenceScopeV8 } from './NarrativeSentenceEditV8';

export const NARRATIVE_EDITORIAL_STAGE_VERSION_V8 = 'narrative-editorial-stages-v8-2' as const;

export interface NarrativeStopStageV8 {
  stopId: string;
  writeAttempted: boolean;
  editAttempted: boolean;
  initialScript: NarrativeScriptV6 | null;
  script: NarrativeScriptV6 | null;
  draft: NarrativeStructuredWriterResultV8 | null;
  verification: { scriptFingerprint: string; report: NarrativeAuditReportV6 } | null;
  firstPassVerified: boolean | null;
  editComparison?: NarrativeEditComparisonV8;
  error: { stage: 'write' | 'verify' | 'edit'; message: string } | null;
}

export interface NarrativeEditorialStageStateV8 {
  schemaVersion: typeof NARRATIVE_EDITORIAL_STAGE_VERSION_V8;
  contextFingerprint: string;
  stops: NarrativeStopStageV8[];
  globalReviewsAttempted: number;
  globalReview: { scriptsFingerprint: string; audit: NarrativeTourAuditV6 } | null;
  globalError: string | null;
}

export function narrativeStageScriptsFingerprintV8(stops: NarrativeStopStageV8[]): string {
  return narrativeFingerprintV6(stops.map(stop => ({ stopId: stop.stopId, script: stop.script?.fingerprint ?? null })));
}

export function validateNarrativeStageScriptV8(script: NarrativeScriptV6, stopId: string): void {
  if (!script || typeof script.text !== 'string' || !script.text.trim()
    || narrativeFingerprintV6(script) !== narrativeFingerprintV6(assignNarrativeSentenceIdsV6(stopId, script.text, { sentenceBoundaryPolicy: 'v8' }))) {
    throw new Error(`invalid staged script for ${stopId}`);
  }
}

export function validateNarrativeStageTourAuditV8(audit: NarrativeTourAuditV6, scripts: NarrativeScriptV6[]): void {
  if (!audit || !Array.isArray(audit.issues)
    || [audit.progressionWorks, audit.promiseDelivered, audit.closingWorks].some(v => typeof v !== 'boolean')) {
    throw new Error('invalid staged global audit');
  }
  const ids = new Set<string>();
  for (const issue of audit.issues) {
    if (!issue || typeof issue.issueId !== 'string' || !issue.issueId.trim() || ids.has(issue.issueId)
      || typeof issue.reason !== 'string' || !issue.reason.trim()
      || !['hard', 'soft'].includes(issue.severity)
      || !scripts.some(s => s.stopId === issue.stopId && s.sentences.some(sentence => sentence.sentenceId === issue.sentenceId))) {
      throw new Error('global audit references unknown or duplicate issue/sentence');
    }
    ids.add(issue.issueId);
  }
}

export function createNarrativeStageStateV8(contextFingerprint: string, stopIds: string[]): NarrativeEditorialStageStateV8 {
  return {
    schemaVersion: NARRATIVE_EDITORIAL_STAGE_VERSION_V8, contextFingerprint,
    stops: stopIds.map(stopId => ({ stopId, writeAttempted: false, editAttempted: false,
      initialScript: null, script: null, draft: null, verification: null, firstPassVerified: null, error: null })),
    globalReviewsAttempted: 0, globalReview: null, globalError: null,
  };
}

/** Stage data is deliberately small and JSON-only: never credentials, usage or raw responses. */
export function restoreNarrativeStageStateV8(
  value: unknown, contextFingerprint: string, stopIds: string[],
  writerPlan: (stopId: string) => NarrativeWriterPlanV8 | null
): NarrativeEditorialStageStateV8 {
  const state = JSON.parse(JSON.stringify(value)) as NarrativeEditorialStageStateV8;
  if (!state || state.schemaVersion !== NARRATIVE_EDITORIAL_STAGE_VERSION_V8
    || state.contextFingerprint !== contextFingerprint) {
    throw new Error('editorial checkpoint policy/evidence/context changed; start a new editorial generation explicitly');
  }
  if (!Array.isArray(state.stops) || state.stops.length !== stopIds.length
    || !Number.isInteger(state.globalReviewsAttempted) || state.globalReviewsAttempted < 0 || state.globalReviewsAttempted > 2
    || (state.globalError !== null && typeof state.globalError !== 'string')) {
    throw new Error('invalid editorial stage state');
  }
  state.stops.forEach((stop, index) => {
    if (!stop || stop.stopId !== stopIds[index] || typeof stop.writeAttempted !== 'boolean'
      || typeof stop.editAttempted !== 'boolean'
      || (stop.firstPassVerified !== null && typeof stop.firstPassVerified !== 'boolean')
      || (stop.error !== null && (!stop.error || !['write', 'verify', 'edit'].includes(stop.error.stage)
        || typeof stop.error.message !== 'string'))) throw new Error('invalid editorial stop stage');
    if (stop.initialScript) validateNarrativeStageScriptV8(stop.initialScript, stop.stopId);
    if (stop.script) validateNarrativeStageScriptV8(stop.script, stop.stopId);
    if (stop.draft) {
      const plan = writerPlan(stop.stopId);
      if (!plan) throw new Error('staged structured draft has no writer plan');
      const parsed = parseNarrativeWriterResponseV8(plan, { stop_id: stop.stopId, segments: stop.draft.segments });
      if (!stop.script || parsed.text !== stop.script.text) throw new Error('staged draft/text mismatch');
      stop.draft = parsed;
    }
    if (stop.verification && (!stop.script || stop.verification.scriptFingerprint !== stop.script.fingerprint)) {
      stop.verification = null;
    }
    if (stop.editComparison) {
      if (!stop.editAttempted) throw new Error('editComparison requires editAttempted');
      const comp = stop.editComparison;
      if (!comp || typeof comp.decision !== 'string' || !['pending', 'accepted', 'rejected'].includes(comp.decision)
        || (comp.reason !== null && typeof comp.reason !== 'string')) {
        throw new Error('invalid editComparison structure');
      }
      if (!Array.isArray(comp.targetSentenceIds) || comp.targetSentenceIds.length === 0
        || comp.targetSentenceIds.some(id => typeof id !== 'string')
        || new Set(comp.targetSentenceIds).size !== comp.targetSentenceIds.length) {
        throw new Error('editComparison requires nonempty distinct targetSentenceIds');
      }
      const validateVersion = (version: { draft: NarrativeStructuredWriterResultV8; script: NarrativeScriptV6; verification: { scriptFingerprint: string; report: NarrativeAuditReportV6 } | null }, label: string) => {
        if (!version || !version.script || !version.draft) throw new Error(`invalid ${label} version`);
        validateNarrativeStageScriptV8(version.script, stop.stopId);
        const plan = writerPlan(stop.stopId);
        if (!plan) throw new Error(`no writer plan for ${label}`);
        const parsed = parseNarrativeWriterResponseV8(plan, { stop_id: stop.stopId, segments: version.draft.segments });
        if (parsed.text !== version.script.text) throw new Error(`${label} draft/text mismatch`);
        if (version.verification && version.verification.scriptFingerprint !== version.script.fingerprint) {
          throw new Error(`${label} verification fingerprint mismatch`);
        }
      };
      validateVersion(comp.before, 'before');
      validateVersion(comp.candidate, 'candidate');
      if (!comp.before.verification) throw new Error('before version must be verified');
      try {
        assertNarrativeSentenceScopeV8(stop.stopId, comp.before.draft, comp.candidate.draft, comp.targetSentenceIds!);
      } catch (error) {
        throw new Error(`editComparison scope invalid: ${error instanceof Error ? error.message : String(error)}`);
      }

      const currentScript = stop.script;
      const currentDraft = stop.draft;
      if (!currentScript || !currentDraft) throw new Error('current script/draft required for editComparison');

      const expectedVersion = comp.decision === 'rejected' ? comp.before : comp.candidate;

      if (currentScript.fingerprint !== expectedVersion.script.fingerprint || currentScript.text !== expectedVersion.script.text) {
        throw new Error('current script does not match expected editComparison version');
      }

      const plan = writerPlan(stop.stopId);
      if (!plan) throw new Error('no writer plan for current draft');
      const parsedCurrent = parseNarrativeWriterResponseV8(plan, { stop_id: stop.stopId, segments: currentDraft.segments });
      if (parsedCurrent.text !== expectedVersion.script.text) {
        throw new Error('current draft does not match expected editComparison version');
      }

      if (comp.decision === 'accepted' || comp.decision === 'rejected') {
        if (!comp.candidate.verification) throw new Error('candidate verification required for accepted/rejected');
        if (!stop.verification) throw new Error('stop verification required for accepted/rejected');
        if (stop.verification.scriptFingerprint !== expectedVersion.verification?.scriptFingerprint) {
          throw new Error('stop verification does not match selected version');
        }
      }
    }
  });
  if (state.globalReview && state.globalReview.scriptsFingerprint !== narrativeStageScriptsFingerprintV8(state.stops)) {
    state.globalReview = null;
  }
  if (state.globalReview) validateNarrativeStageTourAuditV8(state.globalReview.audit, state.stops.flatMap(s => s.script ? [s.script] : []));
  return state;
}

export interface NarrativeFinalWriterTraceV8 {
  scriptFingerprint: string;
  plan: NarrativeWriterPlanV8;
  draft: NarrativeStructuredWriterResultV8;
}
