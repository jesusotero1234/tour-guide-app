import { NarrativeDossierV6, NarrativeDossierProposalV6 } from './NarrativeDossierV6';
import { NarrativeEvidenceGatesV8, assessNarrativeEvidenceGatesV8, classifyEvidenceTierV8 } from './NarrativeDossierV8';
import { NarrativeResearchStopResultV8 } from './NarrativeResearchV8';
import { NarrativeRouteBriefV6, narrativeFingerprintV6 } from './NarrativeContractsV6';
import { buildNarrativeDossierV6 } from './NarrativeDossierV6';
import { NarrativeCapturedSourceV8 } from './NarrativeSourcesV7';

export const NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8 = 'narrative-evidence-context-v8' as const;
export const NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8 = 'narrative-evidence-manifest-v8' as const;

export type NarrativeAdmittedTierV8 = 'A' | 'B' | 'C';

export interface NarrativeResearchHandoffStopV8 {
  routeStopId: string;
  entityQid: string;
  result: NarrativeResearchStopResultV8;
}

export interface NarrativeEvidenceContextV8 {
  schemaVersion: typeof NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8;
  routeStopId: string;
  entityQid: string;
  evidenceTier: NarrativeAdmittedTierV8;
  routeEligible: true;
  gates: NarrativeEvidenceGatesV8;
  dossierFingerprint: string;
  legacyV6IsSufficient: boolean;
}

export interface NarrativeAdmittedStopV8 {
  routeStopId: string;
  entityQid: string;
  dossier: NarrativeDossierV6;
  evidence: NarrativeEvidenceContextV8;
}

export interface NarrativeEvidenceManifestStopV8 {
  routeStopId: string;
  entityQid: string;
  evidenceTier: NarrativeAdmittedTierV8;
  routeEligible: true;
  gates: NarrativeEvidenceGatesV8;
  dossierFingerprint: string;
  legacyV6IsSufficient: boolean;
}

export interface NarrativeEvidenceManifestV8 {
  schemaVersion: typeof NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8;
  routeFingerprint: string;
  stops: NarrativeEvidenceManifestStopV8[];
  fingerprint: string;
}

export type NarrativeEvidenceBoundaryResultV8 =
  | {
    status: 'ready';
    manifest: NarrativeEvidenceManifestV8;
    admittedStops: NarrativeAdmittedStopV8[];
  }
  | {
    status: 'blocked';
    stopIds: string[];
    reasons: string[];
  }
  | {
    status: 'protocol_failed';
    reason: string;
  };

function rebuildDossierV8(
  proposal: NarrativeDossierProposalV6,
  captures: NarrativeCapturedSourceV8[]
): NarrativeDossierV6 {
  return buildNarrativeDossierV6(proposal, captures);
}

function dossiersAreEqualV8(left: NarrativeDossierV6, right: NarrativeDossierV6): boolean {
  return narrativeFingerprintV6(left) === narrativeFingerprintV6(right);
}

function protocolFailedV8(reason: string): NarrativeEvidenceBoundaryResultV8 {
  return { status: 'protocol_failed', reason };
}

function manifestFingerprintV8(
  schemaVersion: string,
  routeFingerprint: string,
  stops: NarrativeEvidenceManifestStopV8[]
): string {
  const payload = {
    schemaVersion,
    routeFingerprint,
    stops,
  };
  return narrativeFingerprintV6(payload);
}

type NarrativeAdmissionResultV8 =
  | { status: 'admitted'; stop: NarrativeAdmittedStopV8 }
  | { status: 'protocol_failed'; reason: string };

function admitSufficientResultV8(handoff: NarrativeResearchHandoffStopV8): NarrativeAdmissionResultV8 {
  const result = handoff.result;
  if (result.status !== 'sufficient') {
    return { status: 'protocol_failed', reason: 'result status is not sufficient' };
  }
  if (result.stopId !== handoff.entityQid) {
    return { status: 'protocol_failed', reason: 'result.stopId does not match handoff.entityQid' };
  }
  if (result.dossier.stopId !== handoff.entityQid) {
    return { status: 'protocol_failed', reason: 'dossier.stopId does not match handoff.entityQid' };
  }
  if (result.evidenceTier !== 'A' && result.evidenceTier !== 'B' && result.evidenceTier !== 'C') {
    return { status: 'protocol_failed', reason: 'evidenceTier is not A, B, or C' };
  }

  const originalFingerprint = narrativeFingerprintV6(result.dossier);

  const proposal: NarrativeDossierProposalV6 = {
    stopId: result.dossier.stopId,
    language: result.dossier.language,
    sources: result.dossier.sources.map((source) => source.sourceId),
    passages: result.dossier.passages,
    propositions: result.dossier.propositions,
    authorizedNames: result.dossier.authorizedNames,
    authorizedNumbers: result.dossier.authorizedNumbers,
    discrepancies: result.dossier.discrepancies,
    limits: result.dossier.limits,
  };

  let rebuilt: NarrativeDossierV6;
  try {
    rebuilt = rebuildDossierV8(proposal, result.captures);
  } catch (error) {
    return { status: 'protocol_failed', reason: `dossier rebuild failed: ${error instanceof Error ? error.message : String(error)}` };
  }

  if (!dossiersAreEqualV8(result.dossier, rebuilt)) {
    return { status: 'protocol_failed', reason: 'rebuilt dossier does not match original dossier' };
  }

  const recomputedGates = assessNarrativeEvidenceGatesV8(rebuilt, handoff.entityQid);
  if (narrativeFingerprintV6(recomputedGates) !== narrativeFingerprintV6(result.gates)) {
    return { status: 'protocol_failed', reason: 'recomputed gates do not match result.gates' };
  }

  const recomputedTier = classifyEvidenceTierV8(rebuilt, recomputedGates, result.captures);
  if (recomputedTier !== result.evidenceTier) {
    return { status: 'protocol_failed', reason: 'recomputed tier does not match result.evidenceTier' };
  }
  if (!recomputedGates.minimumEvidenceReady) {
    return { status: 'protocol_failed', reason: 'minimumEvidenceReady is not true' };
  }

  const context: NarrativeEvidenceContextV8 = {
    schemaVersion: NARRATIVE_EVIDENCE_CONTEXT_SCHEMA_VERSION_V8,
    routeStopId: handoff.routeStopId,
    entityQid: handoff.entityQid,
    evidenceTier: result.evidenceTier,
    routeEligible: true,
    gates: recomputedGates,
    dossierFingerprint: result.dossier.fingerprint,
    legacyV6IsSufficient: result.dossier.sufficiency.isSufficient,
  };

  const validatedFingerprint = narrativeFingerprintV6(result.dossier);
  if (validatedFingerprint !== originalFingerprint) {
    return { status: 'protocol_failed', reason: 'dossier fingerprint changed during validation' };
  }

  return {
    status: 'admitted',
    stop: {
      routeStopId: handoff.routeStopId,
      entityQid: handoff.entityQid,
      dossier: result.dossier,
      evidence: context,
    },
  };
}

export function buildNarrativeEvidenceBoundaryV8(
  route: NarrativeRouteBriefV6,
  handoffs: NarrativeResearchHandoffStopV8[]
): NarrativeEvidenceBoundaryResultV8 {
  const routeStopIds = route.stops.map((stop) => stop.stopId);
  const routeStopIdSet = new Set(routeStopIds);
  if (routeStopIdSet.size !== routeStopIds.length) {
    return protocolFailedV8('duplicate route stop IDs');
  }

  if (handoffs.length === 0) {
    return protocolFailedV8('missing handoffs');
  }

  const handoffRouteStopIds = handoffs.map((handoff) => handoff.routeStopId);
  const handoffRouteStopIdSet = new Set(handoffRouteStopIds);
  if (handoffRouteStopIdSet.size !== handoffRouteStopIds.length) {
    return protocolFailedV8('duplicate handoff routeStopIds');
  }

  const unknownHandoffRouteStopIds = handoffRouteStopIds.filter((id) => !routeStopIdSet.has(id));
  const missingRouteStopIds = routeStopIds.filter((id) => !handoffRouteStopIdSet.has(id));
  if (missingRouteStopIds.length > 0 || unknownHandoffRouteStopIds.length > 0) {
    const reasons: string[] = [];
    if (missingRouteStopIds.length > 0) {
      reasons.push(`missing handoffs for route stops: ${missingRouteStopIds.join(', ')}`);
    }
    if (unknownHandoffRouteStopIds.length > 0) {
      reasons.push(`unknown handoff routeStopIds: ${unknownHandoffRouteStopIds.join(', ')}`);
    }
    return protocolFailedV8(reasons.join('; '));
  }

  const handoffByRouteStopId = new Map<string, NarrativeResearchHandoffStopV8>();
  for (const handoff of handoffs) {
    handoffByRouteStopId.set(handoff.routeStopId, handoff);
  }

  const blockedStopIds: string[] = [];
  const blockedReasons: string[] = [];
  const admittedStops: NarrativeAdmittedStopV8[] = [];
  let protocolError: string | null = null;

  for (const stop of route.stops) {
    const handoff = handoffByRouteStopId.get(stop.stopId);
    if (!handoff) {
      protocolError = `missing handoff for route stop ${stop.stopId}`;
      break;
    }
    if (handoff.routeStopId !== stop.stopId) {
      protocolError = `handoff routeStopId does not match route stopId for ${stop.stopId}`;
      break;
    }
    if (handoff.entityQid !== stop.wikidataId) {
      protocolError = `handoff entityQid does not match route wikidataId for ${stop.stopId}`;
      break;
    }

    const result = handoff.result;
    if (result.status === 'failed') {
      if (result.stopId !== handoff.entityQid) {
        protocolError = `result.stopId does not match handoff.entityQid for failed result ${stop.stopId}`;
        break;
      }
      protocolError = `result status failed for ${stop.stopId}`;
      break;
    }

    if (result.status === 'evidence_review_required') {
      if (result.stopId !== handoff.entityQid) {
        protocolError = `result.stopId does not match handoff.entityQid for evidence_review_required result ${stop.stopId}`;
        break;
      }
      if (result.evidenceTier !== 'D') {
        protocolError = `evidence_review_required with non-D tier for ${stop.stopId}`;
        break;
      }
      blockedStopIds.push(stop.stopId);
      blockedReasons.push(...result.reasons);
      continue;
    }

    const admission = admitSufficientResultV8(handoff);
    if (admission.status === 'protocol_failed') {
      protocolError = admission.reason;
      break;
    }

    admittedStops.push(admission.stop);
  }

  if (protocolError !== null) {
    return protocolFailedV8(protocolError);
  }

  if (blockedStopIds.length > 0) {
    return {
      status: 'blocked',
      stopIds: blockedStopIds,
      reasons: blockedReasons,
    };
  }

  const manifestStops: NarrativeEvidenceManifestStopV8[] = admittedStops.map((stop) => ({
    routeStopId: stop.routeStopId,
    entityQid: stop.entityQid,
    evidenceTier: stop.evidence.evidenceTier,
    routeEligible: true,
    gates: stop.evidence.gates,
    dossierFingerprint: stop.evidence.dossierFingerprint,
    legacyV6IsSufficient: stop.evidence.legacyV6IsSufficient,
  }));

  const routeFingerprint = route.fingerprint;
  const manifest: NarrativeEvidenceManifestV8 = {
    schemaVersion: NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8,
    routeFingerprint,
    stops: manifestStops,
    fingerprint: manifestFingerprintV8(NARRATIVE_EVIDENCE_MANIFEST_SCHEMA_VERSION_V8, routeFingerprint, manifestStops),
  };

  return {
    status: 'ready',
    manifest,
    admittedStops,
  };
}
