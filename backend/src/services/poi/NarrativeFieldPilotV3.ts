import {
  AutonomousNarrativeArtifactV3,
  replayAutonomousNarrativeArtifactV3,
} from './AutonomousNarrativeV3';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import { NarrativeEvidenceCaseV3 } from './NarrativeEvidenceV3';

export const NARRATIVE_FIELD_PILOT_SCHEMA_VERSION_V3 =
  'narrative-field-pilot-v3' as const;

export const NARRATIVE_FIELD_PILOT_POLICY_V3 = {
  minimumCompletedParticipants: 15,
  minimumCompletionRate: 0.8,
  minimumPaidPurchases: 3,
  minimumAverageExperienceScore: 4,
  maximumCriticalFactualComplaints: 0,
  offer: { currency: 'EUR', amount: 9.99 },
} as const;

export interface NarrativeFieldPilotManifestV3 {
  schemaVersion: typeof NARRATIVE_FIELD_PILOT_SCHEMA_VERSION_V3;
  state: 'prepared';
  caseId: string;
  city: string;
  language: 'es-ES';
  routeFingerprint: string;
  sceneIds: string[];
  candidateTextFingerprint: string;
  qualificationFingerprint: string;
  machineApprovalIsDemandEvidence: false;
  researchQuestion: string;
  checkout: {
    status: 'required_before_pilot';
    currency: 'EUR';
    amount: number;
    realChargeRequired: true;
    refundsRecordedSeparately: true;
  };
  dataCollection: {
    aggregateCountsOnly: true;
    participantNamesForbidden: true;
    paymentCredentialsForbidden: true;
  };
  successGate: typeof NARRATIVE_FIELD_PILOT_POLICY_V3;
}

export interface NarrativeFieldPilotObservationV3 {
  invitedParticipants: number;
  startedParticipants: number;
  completedParticipants: number;
  paidPurchases: number;
  refundedPurchases: number;
  criticalFactualComplaints: number;
  averageExperienceScore: number;
}

export type NarrativeFieldPilotFailureReasonV3 =
  | 'completed_participants_below_15'
  | 'completion_rate_below_80_percent'
  | 'paid_purchases_below_3'
  | 'critical_factual_complaint'
  | 'average_experience_below_4';

export function buildNarrativeFieldPilotManifestV3(
  artifact: AutonomousNarrativeArtifactV3,
  testCase: NarrativeEvidenceCaseV3
): NarrativeFieldPilotManifestV3 {
  if (artifact.outcome.type !== 'machine_approved') {
    throw new Error('field pilot requires a machine-approved candidate');
  }
  replayAutonomousNarrativeArtifactV3(artifact, testCase);
  if (artifact.caseId !== testCase.caseId || artifact.request.caseId !== testCase.caseId
    || artifact.request.city !== testCase.city
    || artifact.request.routeFingerprint !== testCase.routeFingerprint
    || artifact.scripts.length !== testCase.scenes.length) {
    throw new Error('field pilot candidate does not match the evidence case');
  }
  return {
    schemaVersion: NARRATIVE_FIELD_PILOT_SCHEMA_VERSION_V3,
    state: 'prepared',
    caseId: testCase.caseId,
    city: testCase.city,
    language: 'es-ES',
    routeFingerprint: testCase.routeFingerprint,
    sceneIds: testCase.scenes.map((scene) => scene.sceneId),
    candidateTextFingerprint: artifact.fingerprints.text,
    qualificationFingerprint: editorialFingerprintV7({
      evidenceCaseFingerprint: artifact.evidenceCaseFingerprint,
      fingerprints: artifact.fingerprints,
    }),
    machineApprovalIsDemandEvidence: false,
    researchQuestion:
      'Después de completar esta ruta, ¿compran los participantes una siguiente ruta histórica al precio mostrado?',
    checkout: {
      status: 'required_before_pilot',
      currency: NARRATIVE_FIELD_PILOT_POLICY_V3.offer.currency,
      amount: NARRATIVE_FIELD_PILOT_POLICY_V3.offer.amount,
      realChargeRequired: true,
      refundsRecordedSeparately: true,
    },
    dataCollection: {
      aggregateCountsOnly: true,
      participantNamesForbidden: true,
      paymentCredentialsForbidden: true,
    },
    successGate: NARRATIVE_FIELD_PILOT_POLICY_V3,
  };
}

function count(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0) throw new Error(`${label} must be a non-negative integer`);
  return value;
}

export function evaluateNarrativeFieldPilotV3(
  manifest: NarrativeFieldPilotManifestV3,
  raw: NarrativeFieldPilotObservationV3
): { passed: boolean; reasons: NarrativeFieldPilotFailureReasonV3[] } {
  if (manifest.schemaVersion !== NARRATIVE_FIELD_PILOT_SCHEMA_VERSION_V3
    || manifest.state !== 'prepared' || manifest.machineApprovalIsDemandEvidence !== false) {
    throw new Error('invalid narrative field pilot manifest');
  }
  const invited = count(raw.invitedParticipants, 'invitedParticipants');
  const started = count(raw.startedParticipants, 'startedParticipants');
  const completed = count(raw.completedParticipants, 'completedParticipants');
  const purchases = count(raw.paidPurchases, 'paidPurchases');
  const refunds = count(raw.refundedPurchases, 'refundedPurchases');
  const complaints = count(raw.criticalFactualComplaints, 'criticalFactualComplaints');
  if (started > invited || completed > started || purchases > completed || refunds > purchases
    || !Number.isFinite(raw.averageExperienceScore)
    || raw.averageExperienceScore < 1 || raw.averageExperienceScore > 5) {
    throw new Error('narrative field pilot observations are inconsistent');
  }
  const reasons: NarrativeFieldPilotFailureReasonV3[] = [];
  if (completed < manifest.successGate.minimumCompletedParticipants) {
    reasons.push('completed_participants_below_15');
  }
  if (started === 0 || completed / started < manifest.successGate.minimumCompletionRate) {
    reasons.push('completion_rate_below_80_percent');
  }
  if (purchases - refunds < manifest.successGate.minimumPaidPurchases) {
    reasons.push('paid_purchases_below_3');
  }
  if (complaints > manifest.successGate.maximumCriticalFactualComplaints) {
    reasons.push('critical_factual_complaint');
  }
  if (raw.averageExperienceScore < manifest.successGate.minimumAverageExperienceScore) {
    reasons.push('average_experience_below_4');
  }
  return { passed: reasons.length === 0, reasons };
}
