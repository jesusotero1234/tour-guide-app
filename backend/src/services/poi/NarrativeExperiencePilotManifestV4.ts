import { editorialFingerprintV7 } from './EditorialProfileV7';
import { NarrativeEvidenceCaseV4, validateNarrativeEvidenceCaseV4 } from './NarrativeEvidenceV4';
import { NarrativePilotPreviewV4, validateNarrativePilotPreviewV4 } from './NarrativeMadridPilotPreviewV4';

export const NARRATIVE_EXPERIENCE_PILOT_MANIFEST_SCHEMA_VERSION_V4 =
  'narrative-experience-pilot-manifest-v4' as const;

export interface NarrativeExperiencePilotManifestV4 {
  schemaVersion: typeof NARRATIVE_EXPERIENCE_PILOT_MANIFEST_SCHEMA_VERSION_V4;
  state: 'prepared';
  caseId: string;
  routeFingerprint: string;
  qualificationFingerprint: string;
  previewFingerprint: string;
  selectedTextFingerprint: string;
  sceneIds: string[];
  experience: {
    text: true;
    map: true;
    audio: false;
    checkout: false;
    forms: false;
    telemetry: false;
  };
  machineApprovalMeans: 'safe_to_test';
  machineApprovalIsDemandEvidence: false;
  participantsRecorded: false;
  demandDemonstrated: false;
  fingerprint: string;
}

function manifestFingerprint(
  manifest: Omit<NarrativeExperiencePilotManifestV4, 'fingerprint'>
): string {
  return editorialFingerprintV7(manifest);
}

export function buildNarrativeExperiencePilotManifestV4(
  evidence: NarrativeEvidenceCaseV4,
  qualificationFingerprint: string,
  preview: NarrativePilotPreviewV4
): NarrativeExperiencePilotManifestV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  validateNarrativePilotPreviewV4(preview, evidence);
  if (!/^[a-f0-9]{64}$/.test(qualificationFingerprint)) {
    throw new Error('pilot manifest requires a qualification fingerprint');
  }
  const content: Omit<NarrativeExperiencePilotManifestV4, 'fingerprint'> = {
    schemaVersion: NARRATIVE_EXPERIENCE_PILOT_MANIFEST_SCHEMA_VERSION_V4,
    state: 'prepared',
    caseId: evidence.caseId,
    routeFingerprint: evidence.route.sourceFingerprint,
    qualificationFingerprint,
    previewFingerprint: preview.fingerprint,
    selectedTextFingerprint: preview.selectedTextFingerprint,
    sceneIds: evidence.scenes.map((scene) => scene.sceneId),
    experience: {
      text: true,
      map: true,
      audio: false,
      checkout: false,
      forms: false,
      telemetry: false,
    },
    machineApprovalMeans: 'safe_to_test',
    machineApprovalIsDemandEvidence: false,
    participantsRecorded: false,
    demandDemonstrated: false,
  };
  return { ...content, fingerprint: manifestFingerprint(content) };
}

export function validateNarrativeExperiencePilotManifestV4(
  manifest: NarrativeExperiencePilotManifestV4,
  evidence: NarrativeEvidenceCaseV4,
  preview: NarrativePilotPreviewV4
): NarrativeExperiencePilotManifestV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  validateNarrativePilotPreviewV4(preview, evidence);
  const { fingerprint, ...content } = manifest;
  if (manifest.schemaVersion !== NARRATIVE_EXPERIENCE_PILOT_MANIFEST_SCHEMA_VERSION_V4
    || manifest.state !== 'prepared'
    || manifest.caseId !== evidence.caseId
    || manifest.routeFingerprint !== evidence.route.sourceFingerprint
    || manifest.previewFingerprint !== preview.fingerprint
    || manifest.selectedTextFingerprint !== preview.selectedTextFingerprint
    || manifest.sceneIds.join(',') !== evidence.route.sceneIds.join(',')
    || manifest.experience.text !== true || manifest.experience.map !== true
    || Object.values({
      audio: manifest.experience.audio,
      checkout: manifest.experience.checkout,
      forms: manifest.experience.forms,
      telemetry: manifest.experience.telemetry,
    }).some((value) => value !== false)
    || manifest.machineApprovalMeans !== 'safe_to_test'
    || manifest.machineApprovalIsDemandEvidence !== false
    || manifest.participantsRecorded !== false || manifest.demandDemonstrated !== false
    || fingerprint !== manifestFingerprint(content)) {
    throw new Error('narrative experience pilot manifest v4 changed');
  }
  return manifest;
}
