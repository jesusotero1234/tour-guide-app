import { validateNarrativeArcShapeV6 } from './NarrativeArcArchitectV6';
import { NarrativeArcBundleV8 } from './NarrativeArcArchitectV8';
import { NarrativeRouteBriefV6 } from './NarrativeContractsV6';
import { NarrativeEditorialAgentsV8, NarrativeLengthOutcomeV8 } from './NarrativeEditorialAgentsV8';
import {
  NarrativeAdmittedStopV8,
  NarrativeEvidenceManifestV8,
  NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
} from './NarrativeEvidenceBoundaryV8';
import {
  NarrativeEditorialWorkflowOptionsV6,
  NarrativeEditorialWorkflowResultV6,
  runNarrativeEditorialWorkflowCoreV6,
} from './NarrativeEditorialWorkflowV6';

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
  options: NarrativeEditorialWorkflowOptionsV6 = {}
): Promise<NarrativeEditorialWorkflowResultV8> {
  const reason = validateWorkflowBoundaryV8(input, agents);
  if (reason) {
    return {
      status: 'protocol_failed',
      evidenceManifest: input.arcBundle.manifest,
      reason,
    };
  }

  const editorial = await runNarrativeEditorialWorkflowCoreV6(
    {
      runId: input.runId,
      createdAt: input.createdAt,
      route: input.route,
      dossiers: input.admittedStops.map((stop) => stop.dossier),
      arc: input.arcBundle.arc,
      voiceProfile: input.voiceProfile,
      privateArtifactPath: input.privateArtifactPath,
      coreStops: input.admittedStops.map((stop) => ({
        routeStopId: stop.routeStopId,
        dossier: stop.dossier,
      })),
    },
    agents,
    { ...options, allowPartialScripts: true, deterministicAuditPolicy: 'v8', editorialIssuePolicy: 'v8' }
  );

  const lengthOutcomes = collectNarrativeLengthOutcomesV8(editorial, agents);

  return {
    status: 'complete',
    evidenceManifest: input.arcBundle.manifest,
    editorial,
    lengthOutcomes,
  };
}
