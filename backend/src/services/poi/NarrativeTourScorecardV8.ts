import {
  NarrativeAgentExecutionV6,
  NarrativeAgentResultV6,
  NarrativeTourScorecardV6,
  reviewNarrativeTourScorecardV6Core,
} from './NarrativeEditorialAgentsV6';
import { NarrativeScriptV6 } from './NarrativeEditorialV6';
import { NarrativeModelClientOptionsV6 } from './NarrativeModelProfilesV6';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
} from './NarrativeEvidenceBoundaryV8';
import { createNarrativeEditorialRequestProjectorV8 } from './NarrativeEditorialEvidenceProjectionV8';

export interface NarrativeTourScorecardInputV8 {
  promise: string;
  scripts: NarrativeScriptV6[];
  admittedStops: NarrativeAdmittedStopV8[];
  evidenceManifest: NarrativeEvidenceManifestV8;
}

export interface NarrativeTourScorecardResultV8
  extends NarrativeAgentResultV6<NarrativeTourScorecardV6> {
  evidenceManifest: NarrativeEvidenceManifestV8;
}

export async function reviewNarrativeTourScorecardV8(
  options: NarrativeModelClientOptionsV6,
  input: NarrativeTourScorecardInputV8,
  request?: NarrativeAgentExecutionV6
): Promise<NarrativeTourScorecardResultV8> {
  if (
    input.scripts.length !== input.admittedStops.length
    || input.scripts.some((script, index) => (
      script.stopId !== input.admittedStops[index]?.routeStopId
    ))
  ) {
    throw new Error('scorecard scripts/admitted stops mismatch');
  }

  const requestProjector = createNarrativeEditorialRequestProjectorV8(
    input.admittedStops,
    input.evidenceManifest
  );
  const result = await reviewNarrativeTourScorecardV6Core(
    options,
    {
      promise: input.promise,
      scripts: input.scripts,
      dossiers: input.admittedStops.map((stop) => stop.dossier),
    },
    request,
    (scorecardInput) => requestProjector({
      operation: 'auditTour',
      systemPrompt: '',
      input: scorecardInput,
    }).input
  );

  return {
    ...result,
    evidenceManifest: input.evidenceManifest,
  };
}
