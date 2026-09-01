import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeEvidenceTierV8 } from './NarrativeDossierV8';
import {
  NarrativeResearchStopInputV8,
  NarrativeResearchStopResultV8,
} from './NarrativeResearchV8';
import { NarrativeScriptV6 } from './NarrativeEditorialV6';
import {
  buildNarrativeEvidenceBoundaryV8,
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
  NarrativeResearchHandoffStopV8,
} from './NarrativeEvidenceBoundaryV8';

export interface NarrativeUserCanaryRequestV8 {
  city: string;
  country: string;
  countryCode: string;
  theme: string;
  language: string;
  durationMinutes: number;
}

export interface NarrativeUserCanaryEditorialResultV8 {
  scripts: NarrativeScriptV6[];
  markdown: string;
  workflowStatus: string;
  scorecardDecision: string | null;
}

export interface NarrativeUserCanaryInputV8 {
  runId: string;
  request: NarrativeUserCanaryRequestV8;
  route: NarrativeRouteBriefV6;
  core: { requiredIds: string[]; disagreement: boolean };
  researchStop(input: NarrativeResearchStopInputV8): Promise<NarrativeResearchStopResultV8>;
  runEditorial(input: {
    route: NarrativeRouteBriefV6;
    admittedStops: NarrativeAdmittedStopV8[];
    evidenceManifest: NarrativeEvidenceManifestV8;
    request: NarrativeUserCanaryRequestV8;
  }): Promise<NarrativeUserCanaryEditorialResultV8>;
}

export const NARRATIVE_USER_CANARY_CONCURRENCY_V8 = {
  researchStops: 2,
  writers: 1,
} as const;

export interface NarrativeUserCanaryResearchSummaryV8 {
  stopId: string;
  entityQid: string;
  status: string;
  evidenceTier: NarrativeEvidenceTierV8 | null;
  evidenceVariant: 'C_FULL' | 'C_PARTIAL' | null;
  routeEligible: boolean;
  minimumEvidenceReady: boolean;
  writerReady: boolean;
  missingRoles: string[];
  queryCount: number;
  searchQueryAttempts: number;
  searchQuerySuccesses: number;
  mapAttempts: number;
  mapSuccesses: number;
  webCaptureAttempts: number;
  webCaptureResponses: number;
  infrastructureFailureCount: number;
  providerFailureCount: number;
  mappedUrlCount: number;
  attemptedUrlCount: number;
  capturedSourceCount: number;
  publisherCount: number;
}

export type NarrativeUserCanaryResultV8 =
  | {
    status: 'approved' | 'request_changes';
    failure: null;
    research: NarrativeUserCanaryResearchSummaryV8[];
    dossiers: NarrativeDossierV6[];
    evidenceManifest: NarrativeEvidenceManifestV8;
    boundaryMigrationPassed: true;
    editorial: {
      workflowStatus: string;
      scriptStopIds: string[];
      scorecardDecision: string | null;
    };
    markdown: string;
  }
  | {
    status: 'blocked' | 'failed';
    failure: { stage: string; code: string; message: string; retryableLater: boolean };
    research: NarrativeUserCanaryResearchSummaryV8[];
    dossiers: NarrativeDossierV6[];
    evidenceManifest: NarrativeEvidenceManifestV8 | null;
    boundaryMigrationPassed: boolean;
    editorial: null;
    markdown: null;
  };

function summarize(
  stopId: string,
  entityQid: string,
  result: NarrativeResearchStopResultV8
): NarrativeUserCanaryResearchSummaryV8 {
  const gates = result.status === 'failed'
    ? { minimumEvidenceReady: false, writerReady: false, missingWriterRoles: [] as string[] }
    : result.gates;
  const evidenceTier = result.status === 'failed' ? null : result.evidenceTier;
  const routeEligible = result.status === 'failed' ? false : result.routeEligible;
  const evidenceVariant = evidenceTier === 'C'
    ? gates.writerReady ? 'C_FULL' : 'C_PARTIAL'
    : null;
  return {
    stopId,
    entityQid,
    status: result.status,
    evidenceTier,
    evidenceVariant,
    routeEligible,
    minimumEvidenceReady: gates.minimumEvidenceReady,
    writerReady: gates.writerReady,
    missingRoles: gates.missingWriterRoles,
    queryCount: result.stats.searchQueries,
    searchQueryAttempts: result.stats.searchQueryAttempts,
    searchQuerySuccesses: result.stats.searchQuerySuccesses,
    mapAttempts: result.stats.mapAttempts,
    mapSuccesses: result.stats.mapSuccesses,
    webCaptureAttempts: result.stats.webCaptureAttempts,
    webCaptureResponses: result.stats.webCaptureResponses,
    infrastructureFailureCount: result.stats.infrastructureFailureCount,
    providerFailureCount: result.captureLog.filter((entry) => (
      entry.phase !== 'wikipedia'
      && (entry.outcome === 'provider_failed' || entry.outcome === 'capture_failed')
    )).length,
    mappedUrlCount: result.stats.mappedUrlCount,
    attemptedUrlCount: result.stats.attemptedUrlCount,
    capturedSourceCount: result.stats.capturedSourceCount,
    publisherCount: result.stats.publisherCount,
  };
}

export async function runNarrativeUserCanaryV8(
  input: NarrativeUserCanaryInputV8
): Promise<NarrativeUserCanaryResultV8> {
  const research: NarrativeResearchHandoffStopV8[] = [];
  let failed = false;
  let nextIndex = 0;
  const worker = async (): Promise<void> => {
    while (!failed) {
      const index = nextIndex;
      nextIndex += 1;
      if (index >= input.route.stops.length) return;
      const stop = input.route.stops[index];
      const result = await input.researchStop({
        runId: input.runId,
        stopId: stop.wikidataId,
        stopName: stop.name,
        cityName: input.request.city,
        cityQid: '',
        countryCode: input.request.countryCode,
        language: input.request.language,
        required: input.core.requiredIds.includes(stop.wikidataId),
      });
      research.push({ routeStopId: stop.stopId, entityQid: stop.wikidataId, result });
      if (!result.routeEligible) {
        failed = true;
        return;
      }
    }
  };
  await Promise.all(Array.from(
    { length: Math.min(NARRATIVE_USER_CANARY_CONCURRENCY_V8.researchStops, input.route.stops.length) },
    () => worker()
  ));
  const orderByStopId = new Map(
    input.route.stops.map((stop, index) => [stop.stopId, index])
  );
  research.sort((left, right) => (
    (orderByStopId.get(left.routeStopId) ?? Number.MAX_SAFE_INTEGER)
      - (orderByStopId.get(right.routeStopId) ?? Number.MAX_SAFE_INTEGER)
  ));
  const summary = research.map((handoff) => summarize(handoff.routeStopId, handoff.entityQid, handoff.result));
  const candidateDossiers = research
    .filter((handoff) => handoff.result.routeEligible && handoff.result.status === 'sufficient')
    .map((handoff) => (handoff.result.routeEligible && handoff.result.status === 'sufficient' ? handoff.result.dossier : null))
    .filter((dossier): dossier is NarrativeDossierV6 => dossier !== null);

  if (candidateDossiers.length !== input.route.stops.length) {
    const ineligible = research.filter((handoff) => !handoff.result.routeEligible);
    const failedHandoff = ineligible.find((handoff) => handoff.result.status === 'failed');
    const hasFailed = failedHandoff !== undefined;
    const status: 'failed' | 'blocked' = hasFailed ? 'failed' : 'blocked';
    const code = failedHandoff?.result.status === 'failed'
      ? failedHandoff.result.failure.code
      : 'evidence_review_required';
    const message = ineligible
      .map((handoff) => (
        `${handoff.routeStopId}: ${handoff.result.status}${handoff.result.status === 'evidence_review_required'
          ? ` — ${handoff.result.reasons.join('; ')}`
          : handoff.result.status === 'failed' ? ` — ${handoff.result.failure.message}` : ''}`
      ))
      .join('; ');
    return {
      status,
      failure: {
        stage: 'research',
        code,
        message,
        retryableLater: code === 'research_infrastructure_unavailable',
      },
      research: summary,
      dossiers: candidateDossiers,
      evidenceManifest: null,
      boundaryMigrationPassed: false,
      editorial: null,
      markdown: null,
    };
  }

  const boundary = buildNarrativeEvidenceBoundaryV8(input.route, research);
  if (boundary.status === 'blocked') {
    return {
      status: 'blocked',
      failure: {
        stage: 'evidence_boundary',
        code: 'evidence_review_required',
        message: boundary.reasons.join('; '),
        retryableLater: false,
      },
      research: summary,
      dossiers: candidateDossiers,
      evidenceManifest: null,
      boundaryMigrationPassed: false,
      editorial: null,
      markdown: null,
    };
  }
  if (boundary.status === 'protocol_failed') {
    return {
      status: 'failed',
      failure: {
        stage: 'evidence_boundary',
        code: 'protocol_failed',
        message: boundary.reason,
        retryableLater: false,
      },
      research: summary,
      dossiers: candidateDossiers,
      evidenceManifest: null,
      boundaryMigrationPassed: false,
      editorial: null,
      markdown: null,
    };
  }

  const dossiers = boundary.admittedStops.map((stop) => stop.dossier);
  const editorial = await input.runEditorial({
    route: input.route,
    admittedStops: boundary.admittedStops,
    evidenceManifest: boundary.manifest,
    request: input.request,
  });
  const routeStopIds = input.route.stops.map((stop) => stop.stopId);
  const scriptStopIds = editorial.scripts.map((script) => script.stopId);
  if (JSON.stringify(scriptStopIds) !== JSON.stringify(routeStopIds)) {
    return {
      status: 'failed',
      failure: {
        stage: 'editorial_workflow',
        code: 'script_id_mismatch',
        message: `scripts and route diverge: ${scriptStopIds.join(',')} vs ${routeStopIds.join(',')}`,
        retryableLater: false,
      },
      research: summary,
      dossiers,
      evidenceManifest: boundary.manifest,
      boundaryMigrationPassed: true,
      editorial: null,
      markdown: null,
    };
  }
  const approved = editorial.workflowStatus === 'ready_for_human_gate'
    && editorial.scorecardDecision === 'Approve';
  return {
    status: approved ? 'approved' : 'request_changes',
    failure: null,
    research: summary,
    dossiers,
    evidenceManifest: boundary.manifest,
    boundaryMigrationPassed: true,
    editorial: {
      workflowStatus: editorial.workflowStatus,
      scriptStopIds,
      scorecardDecision: editorial.scorecardDecision,
    },
    markdown: editorial.markdown,
  };
}
