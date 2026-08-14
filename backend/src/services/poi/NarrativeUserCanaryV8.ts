import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import {
  NarrativeResearchStopInputV8,
  NarrativeResearchStopResultV8,
} from './NarrativeResearchV8';
import { NarrativeScriptV6 } from './NarrativeEditorialV6';

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
    dossiers: NarrativeDossierV6[];
    request: NarrativeUserCanaryRequestV8;
  }): Promise<NarrativeUserCanaryEditorialResultV8>;
}

export interface NarrativeUserCanaryResearchSummaryV8 {
  stopId: string;
  status: string;
  minimumEvidenceReady: boolean;
  writerReady: boolean;
  missingRoles: string[];
  queryCount: number;
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
    editorial: null;
    markdown: null;
  };

function summarize(
  stopId: string,
  result: NarrativeResearchStopResultV8
): NarrativeUserCanaryResearchSummaryV8 {
  const gates = result.status === 'failed'
    ? { minimumEvidenceReady: false, writerReady: false, missingWriterRoles: [] as string[] }
    : result.gates;
  return {
    stopId,
    status: result.status,
    minimumEvidenceReady: result.status === 'sufficient' || gates.minimumEvidenceReady,
    writerReady: result.status === 'sufficient',
    missingRoles: result.status === 'sufficient' ? [] : gates.missingWriterRoles,
    queryCount: result.stats.searchQueries,
    mappedUrlCount: result.stats.mappedUrlCount,
    attemptedUrlCount: result.stats.attemptedUrlCount,
    capturedSourceCount: result.stats.capturedSourceCount,
    publisherCount: result.stats.publisherCount,
  };
}

export async function runNarrativeUserCanaryV8(
  input: NarrativeUserCanaryInputV8
): Promise<NarrativeUserCanaryResultV8> {
  const research = [];
  for (const stop of input.route.stops) {
    const result = await input.researchStop({
      runId: input.runId,
      stopId: stop.wikidataId,
      stopName: stop.name,
      cityQid: '',
      countryCode: input.request.countryCode,
      language: input.request.language,
      required: input.core.requiredIds.includes(stop.wikidataId),
    });
    research.push({ stopId: stop.stopId, result });
  }
  const summary = research.map(({ stopId, result }) => summarize(stopId, result));
  const dossiers = research
    .filter(({ result }) => result.status === 'sufficient')
    .map(({ result }) => (result.status === 'sufficient' ? result.dossier : null))
    .filter((dossier): dossier is NarrativeDossierV6 => dossier !== null);

  if (dossiers.length !== input.route.stops.length) {
    const message = research
      .filter(({ result }) => result.status !== 'sufficient')
      .map(({ stopId, result }) => (
        `${stopId}: ${result.status}${result.status === 'evidence_review_required'
          ? ` — ${result.reasons.join('; ')}` : ''}`
      ))
      .join('; ');
    return {
      status: 'blocked',
      failure: {
        stage: 'research',
        code: 'evidence_review_required',
        message,
        retryableLater: false,
      },
      research: summary,
      dossiers: [],
      editorial: null,
      markdown: null,
    };
  }

  const routeIds = input.route.stops.map((stop) => stop.wikidataId);
  const dossierIds = dossiers.map((dossier) => dossier.stopId);
  if (JSON.stringify(routeIds) !== JSON.stringify(dossierIds)) {
    return {
      status: 'failed',
      failure: {
        stage: 'dossier_boundary',
        code: 'dossier_id_mismatch',
        message: `route IDs and dossier IDs diverge: ${routeIds.join(',')} vs ${dossierIds.join(',')}`,
        retryableLater: false,
      },
      research: summary,
      dossiers,
      editorial: null,
      markdown: null,
    };
  }

  const editorial = await input.runEditorial({
    route: input.route,
    dossiers,
    request: input.request,
  });
  const scriptStopIds = editorial.scripts.map((script) => script.stopId);
  if (JSON.stringify(scriptStopIds) !== JSON.stringify(routeIds)) {
    return {
      status: 'failed',
      failure: {
        stage: 'editorial_workflow',
        code: 'script_id_mismatch',
        message: `scripts and route diverge: ${scriptStopIds.join(',')} vs ${routeIds.join(',')}`,
        retryableLater: false,
      },
      research: summary,
      dossiers,
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
    editorial: {
      workflowStatus: editorial.workflowStatus,
      scriptStopIds,
      scorecardDecision: editorial.scorecardDecision,
    },
    markdown: editorial.markdown,
  };
}
