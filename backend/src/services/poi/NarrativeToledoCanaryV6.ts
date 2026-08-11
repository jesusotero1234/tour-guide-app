import {
  NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6,
  NarrativeEditorialRunV6,
  NarrativeRouteBriefV6,
  NarrativeRouteStopV6,
} from './NarrativeContractsV6';
import { NarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeArcV6, NarrativeEditorialWorkflowResultV6 } from './NarrativeEditorialWorkflowV6';
import { NarrativeResearchStopResultV6 } from './NarrativeResearchV6';

export interface NarrativeToledoCanaryInputV6 {
  runId: string;
  createdAt: string;
  route: NarrativeRouteBriefV6;
  privateArtifactPath: string;
  voiceProfile: string[];
}

export interface NarrativeToledoCanaryServicesV6 {
  research(stop: NarrativeRouteStopV6): Promise<NarrativeResearchStopResultV6>;
  buildArc(input: {
    route: NarrativeRouteBriefV6;
    dossiers: NarrativeDossierV6[];
  }): Promise<NarrativeArcV6>;
  runEditorial(input: {
    route: NarrativeRouteBriefV6;
    dossiers: NarrativeDossierV6[];
    arc: NarrativeArcV6;
    voiceProfile: string[];
  }): Promise<NarrativeEditorialWorkflowResultV6>;
}

export interface NarrativeToledoCanaryResultV6 {
  canaryVerdict:
    | 'ready_for_human_gate'
    | 'principled_refusal_pending_human'
    | 'review_required'
    | 'failed';
  run: NarrativeEditorialRunV6;
  research: NarrativeResearchStopResultV6[];
  editorial?: NarrativeEditorialWorkflowResultV6;
}

function baseRun(input: NarrativeToledoCanaryInputV6) {
  return {
    schemaVersion: NARRATIVE_EDITORIAL_RUN_SCHEMA_VERSION_V6,
    runId: input.runId,
    caseId: input.route.caseId,
    createdAt: input.createdAt,
    diagnostics: { privateArtifactPath: input.privateArtifactPath },
  } as const;
}

function runFromResearchFailure(
  input: NarrativeToledoCanaryInputV6,
  result: Exclude<NarrativeResearchStopResultV6, { status: 'sufficient' }>
): NarrativeEditorialRunV6 {
  if (result.status === 'evidence_review_required') {
    return {
      ...baseRun(input), status: 'evidence_review_required',
      stopIds: result.stopIds, reasons: result.reasons,
    };
  }
  if (result.status === 'model_calibration_failed') {
    return { ...baseRun(input), ...result, reason: result.reason };
  }
  if (result.status === 'source_capture_failed') {
    return { ...baseRun(input), status: result.status, reason: result.reason };
  }
  return {
    ...baseRun(input), status: 'protocol_failed', stage: 'research', reason: result.reason,
  };
}

export async function runNarrativeToledoCanaryV6(
  input: NarrativeToledoCanaryInputV6,
  services: NarrativeToledoCanaryServicesV6
): Promise<NarrativeToledoCanaryResultV6> {
  const alcazar = input.route.stops.find((stop) => stop.stopId === 'alcazar-de-toledo');
  if (!alcazar) {
    return {
      canaryVerdict: 'failed', research: [],
      run: {
        ...baseRun(input), status: 'protocol_failed', stage: 'canary_route',
        reason: 'Toledo canary route does not contain Alcázar de Toledo',
      },
    };
  }
  const research: NarrativeResearchStopResultV6[] = [];
  const alcazarResult = await services.research(alcazar);
  research.push(alcazarResult);
  if (alcazarResult.status !== 'sufficient') {
    return {
      canaryVerdict: alcazarResult.status === 'evidence_review_required'
        ? 'principled_refusal_pending_human'
        : alcazarResult.status === 'model_calibration_failed' ? 'failed' : 'review_required',
      run: runFromResearchFailure(input, alcazarResult),
      research,
    };
  }

  for (const stop of input.route.stops) {
    if (stop.stopId === alcazar.stopId) continue;
    const result = await services.research(stop);
    research.push(result);
    if (result.status !== 'sufficient') {
      return {
        canaryVerdict: result.status === 'model_calibration_failed' ? 'failed' : 'review_required',
        run: runFromResearchFailure(input, result),
        research,
      };
    }
  }
  const dossierByStop = new Map(research.map((result) => [
    result.stopId,
    (result as Extract<NarrativeResearchStopResultV6, { status: 'sufficient' }>).dossier,
  ]));
  const dossiers = input.route.stops.map((stop) => dossierByStop.get(stop.stopId) as NarrativeDossierV6);
  try {
    const arc = await services.buildArc({ route: input.route, dossiers });
    const editorial = await services.runEditorial({
      route: input.route, dossiers, arc, voiceProfile: input.voiceProfile,
    });
    return {
      canaryVerdict: editorial.run.status === 'ready_for_human_gate'
        ? 'ready_for_human_gate'
        : editorial.run.status === 'draft_review_required' ? 'review_required' : 'failed',
      run: editorial.run,
      research,
      editorial,
    };
  } catch (error) {
    return {
      canaryVerdict: 'failed', research,
      run: {
        ...baseRun(input), status: 'protocol_failed', stage: 'canary_orchestration',
        reason: error instanceof Error ? error.message : String(error),
      },
    };
  }
}
