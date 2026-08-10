import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname } from 'path';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NarrativeEvidenceCaseV4,
  validateNarrativeEvidenceCaseV4,
} from './NarrativeEvidenceV4';
import {
  NarrativeExperiencePilotManifestV4,
  buildNarrativeExperiencePilotManifestV4,
  validateNarrativeExperiencePilotManifestV4,
} from './NarrativeExperiencePilotManifestV4';
import {
  NarrativeMadridPilotQualificationV4,
  replayNarrativeMadridPilotQualificationV4,
} from './NarrativeMadridPilotQualificationV4';
import {
  NarrativePilotPreviewV4,
  validateNarrativePilotPreviewV4,
} from './NarrativeMadridPilotPreviewV4';
import { NarrativeTourTextV4, narrativeTourTextFingerprintV4 } from './NarrativeProseV4';

export const NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V4 =
  'narrative-pilot-freeze-document-v4' as const;

export interface NarrativeSelectedArtifactV4 {
  schemaVersion: 'narrative-selected-artifact-v4';
  status: 'machine_approved';
  publicTourStatus: 'review';
  caseId: string;
  variant: string;
  evidenceFingerprint: string;
  planFingerprint: string;
  textFingerprint: string;
  qualificationFingerprint: string;
  text: NarrativeTourTextV4;
  fingerprint: string;
}

export interface NarrativePilotFreezeLinksV4 {
  qualification: string;
  artifact: string;
  preview: string;
  manifest: string;
}

export interface NarrativePilotFreezeDocumentV4<T> {
  schemaVersion: typeof NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V4;
  kind: 'qualification' | 'artifact' | 'preview' | 'manifest';
  freezeLinks: NarrativePilotFreezeLinksV4;
  payload: T;
}

export interface NarrativePilotFreezeDocumentsV4 {
  qualification: NarrativePilotFreezeDocumentV4<NarrativeMadridPilotQualificationV4>;
  artifact: NarrativePilotFreezeDocumentV4<NarrativeSelectedArtifactV4>;
  preview: NarrativePilotFreezeDocumentV4<NarrativePilotPreviewV4>;
  manifest: NarrativePilotFreezeDocumentV4<NarrativeExperiencePilotManifestV4>;
}

export interface NarrativePilotFreezePathsV4 {
  qualificationPath: string;
  artifactPath: string;
  previewPath: string;
  manifestPath: string;
}

function artifactFingerprint(
  artifact: Omit<NarrativeSelectedArtifactV4, 'fingerprint'>
): string {
  return editorialFingerprintV7(artifact);
}

function selectedArtifact(
  result: NarrativeMadridPilotQualificationV4
): NarrativeSelectedArtifactV4 {
  const selected = result.selectedArtifact;
  if (result.status !== 'passed' || !selected?.text || !result.selectedVariant) {
    throw new Error('pilot freeze requires a passing selected artifact');
  }
  const content: Omit<NarrativeSelectedArtifactV4, 'fingerprint'> = {
    schemaVersion: 'narrative-selected-artifact-v4',
    status: 'machine_approved',
    publicTourStatus: 'review',
    caseId: result.caseId,
    variant: result.selectedVariant,
    evidenceFingerprint: selected.evidenceFingerprint,
    planFingerprint: selected.planFingerprint,
    textFingerprint: narrativeTourTextFingerprintV4(selected.text),
    qualificationFingerprint: result.fingerprints.qualification,
    text: selected.text,
  };
  return { ...content, fingerprint: artifactFingerprint(content) };
}

export function buildNarrativePilotFreezeDocumentsV4(
  result: NarrativeMadridPilotQualificationV4,
  evidence: NarrativeEvidenceCaseV4
): NarrativePilotFreezeDocumentsV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  replayNarrativeMadridPilotQualificationV4(result, evidence);
  if (result.status !== 'passed' || !result.preview) {
    throw new Error('only a passing Madrid pilot qualification can be frozen');
  }
  const artifact = selectedArtifact(result);
  const preview = validateNarrativePilotPreviewV4(result.preview, evidence);
  const manifest = buildNarrativeExperiencePilotManifestV4(
    evidence,
    result.fingerprints.qualification,
    preview
  );
  const freezeLinks: NarrativePilotFreezeLinksV4 = {
    qualification: result.fingerprints.qualification,
    artifact: artifact.fingerprint,
    preview: preview.fingerprint,
    manifest: manifest.fingerprint,
  };
  const document = <T>(
    kind: NarrativePilotFreezeDocumentV4<T>['kind'],
    payload: T
  ): NarrativePilotFreezeDocumentV4<T> => ({
      schemaVersion: NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V4,
      kind,
      freezeLinks,
      payload,
    });
  return replayNarrativePilotFreezeDocumentsV4({
    qualification: document('qualification', result),
    artifact: document('artifact', artifact),
    preview: document('preview', preview),
    manifest: document('manifest', manifest),
  }, evidence);
}

export function replayNarrativePilotFreezeDocumentsV4(
  documents: NarrativePilotFreezeDocumentsV4,
  evidence: NarrativeEvidenceCaseV4
): NarrativePilotFreezeDocumentsV4 {
  validateNarrativeEvidenceCaseV4(evidence);
  const entries = Object.entries(documents) as Array<[
    keyof NarrativePilotFreezeDocumentsV4,
    NarrativePilotFreezeDocumentV4<unknown>,
  ]>;
  for (const [kind, document] of entries) {
    if (document.schemaVersion !== NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V4
      || document.kind !== kind) {
      throw new Error(`narrative pilot freeze ${kind} document changed`);
    }
  }
  const qualification = replayNarrativeMadridPilotQualificationV4(
    documents.qualification.payload,
    evidence
  );
  const artifact = documents.artifact.payload;
  const { fingerprint: storedArtifactFingerprint, ...artifactContent } = artifact;
  const preview = validateNarrativePilotPreviewV4(documents.preview.payload, evidence);
  const manifest = validateNarrativeExperiencePilotManifestV4(
    documents.manifest.payload,
    evidence,
    preview
  );
  if (artifact.schemaVersion !== 'narrative-selected-artifact-v4'
    || artifact.status !== 'machine_approved' || artifact.publicTourStatus !== 'review'
    || artifact.caseId !== evidence.caseId
    || artifact.variant !== qualification.selectedVariant
    || artifact.evidenceFingerprint !== evidence.fingerprint
    || artifact.planFingerprint !== qualification.selectedArtifact?.planFingerprint
    || artifact.textFingerprint !== narrativeTourTextFingerprintV4(artifact.text)
    || artifact.textFingerprint !== preview.selectedTextFingerprint
    || artifact.qualificationFingerprint !== qualification.fingerprints.qualification
    || storedArtifactFingerprint !== artifactFingerprint(artifactContent)) {
    throw new Error('narrative selected artifact v4 changed');
  }
  const links: NarrativePilotFreezeLinksV4 = {
    qualification: qualification.fingerprints.qualification,
    artifact: artifact.fingerprint,
    preview: preview.fingerprint,
    manifest: manifest.fingerprint,
  };
  if (entries.some(([, document]) => (
    editorialFingerprintV7(document.freezeLinks) !== editorialFingerprintV7(links)
  ))) {
    throw new Error('narrative pilot freeze cross fingerprints changed');
  }
  return documents;
}

function safeUnlink(path: string): void {
  try {
    if (existsSync(path)) unlinkSync(path);
  } catch {
    // A stale backup is safer than silently weakening an installed freeze set.
  }
}

function atomicWriteSet(outputs: Array<{ path: string; content: string }>): void {
  const suffix = `${process.pid}-${Date.now()}`;
  const staged = outputs.map((output) => ({ ...output, temp: `${output.path}.${suffix}.tmp` }));
  const backups = outputs.map((output) => ({
    path: output.path,
    backup: `${output.path}.${suffix}.bak`,
    existed: existsSync(output.path),
  }));
  const moved: typeof backups = [];
  const installed: string[] = [];
  try {
    outputs.forEach((output) => mkdirSync(dirname(output.path), { recursive: true }));
    staged.forEach((output) => {
      writeFileSync(output.temp, output.content, { encoding: 'utf8', flag: 'wx' });
    });
    backups.forEach((backup) => {
      if (backup.existed) {
        renameSync(backup.path, backup.backup);
        moved.push(backup);
      }
    });
    staged.forEach((output) => {
      renameSync(output.temp, output.path);
      installed.push(output.path);
    });
    backups.forEach((backup) => safeUnlink(backup.backup));
  } catch (error) {
    staged.forEach((output) => safeUnlink(output.temp));
    installed.forEach(safeUnlink);
    moved.forEach((backup) => {
      if (existsSync(backup.backup)) renameSync(backup.backup, backup.path);
    });
    throw error;
  }
}

export function freezeNarrativeMadridPilotV4(
  result: NarrativeMadridPilotQualificationV4,
  evidence: NarrativeEvidenceCaseV4,
  paths: NarrativePilotFreezePathsV4
): NarrativePilotFreezeDocumentsV4 {
  const documents = buildNarrativePilotFreezeDocumentsV4(result, evidence);
  replayNarrativePilotFreezeDocumentsV4(documents, evidence);
  atomicWriteSet([
    { path: paths.qualificationPath, content: `${JSON.stringify(documents.qualification, null, 2)}\n` },
    { path: paths.artifactPath, content: `${JSON.stringify(documents.artifact, null, 2)}\n` },
    { path: paths.previewPath, content: `${JSON.stringify(documents.preview, null, 2)}\n` },
    { path: paths.manifestPath, content: `${JSON.stringify(documents.manifest, null, 2)}\n` },
  ]);
  return documents;
}

export function readNarrativePilotFreezeDocumentsV4(
  paths: NarrativePilotFreezePathsV4
): NarrativePilotFreezeDocumentsV4 {
  const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
  return {
    qualification: read(paths.qualificationPath),
    artifact: read(paths.artifactPath),
    preview: read(paths.previewPath),
    manifest: read(paths.manifestPath),
  };
}
