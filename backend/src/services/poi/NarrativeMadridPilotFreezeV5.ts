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
  NarrativeExperiencePilotManifestV5,
  buildNarrativeExperiencePilotManifestV5,
  validateNarrativeExperiencePilotManifestV5,
} from './NarrativeExperiencePilotManifestV5';
import {
  NarrativeMadridPilotQualificationV5,
  replayNarrativeMadridPilotQualificationV5,
} from './NarrativeMadridPilotQualificationV5';
import {
  NarrativePilotPreviewV5,
  validateNarrativePilotPreviewV5,
} from './NarrativeMadridPilotPreviewV5';
import { NarrativeTourTextV4 } from './NarrativeProseV4';
import { narrativeTourTextFingerprintV5 } from './NarrativeProseV5';

export const NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V5 =
  'narrative-pilot-freeze-document-v5' as const;

export interface NarrativeSelectedArtifactV5 {
  schemaVersion: 'narrative-selected-artifact-v5';
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

export interface NarrativePilotFreezeLinksV5 {
  qualification: string;
  artifact: string;
  preview: string;
  manifest: string;
}

export interface NarrativePilotFreezeDocumentV5<T> {
  schemaVersion: typeof NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V5;
  kind: 'qualification' | 'artifact' | 'preview' | 'manifest';
  freezeLinks: NarrativePilotFreezeLinksV5;
  payload: T;
}

export interface NarrativePilotFreezeDocumentsV5 {
  qualification: NarrativePilotFreezeDocumentV5<NarrativeMadridPilotQualificationV5>;
  artifact: NarrativePilotFreezeDocumentV5<NarrativeSelectedArtifactV5>;
  preview: NarrativePilotFreezeDocumentV5<NarrativePilotPreviewV5>;
  manifest: NarrativePilotFreezeDocumentV5<NarrativeExperiencePilotManifestV5>;
}

export interface NarrativePilotFreezePathsV5 {
  qualificationPath: string;
  artifactPath: string;
  previewPath: string;
  manifestPath: string;
}

function artifactFingerprint(artifact: Omit<NarrativeSelectedArtifactV5, 'fingerprint'>): string {
  return editorialFingerprintV7(artifact);
}

function selectedArtifact(result: NarrativeMadridPilotQualificationV5): NarrativeSelectedArtifactV5 {
  const selected = result.selectedArtifact;
  if (result.status !== 'passed' || !selected?.text || !result.selectedVariant) {
    throw new Error('pilot freeze v5 requires a passing selected artifact');
  }
  const content: Omit<NarrativeSelectedArtifactV5, 'fingerprint'> = {
    schemaVersion: 'narrative-selected-artifact-v5',
    status: 'machine_approved',
    publicTourStatus: 'review',
    caseId: result.caseId,
    variant: result.selectedVariant,
    evidenceFingerprint: selected.evidenceFingerprint,
    planFingerprint: selected.planFingerprint,
    textFingerprint: narrativeTourTextFingerprintV5(selected.text),
    qualificationFingerprint: result.fingerprints.qualification,
    text: selected.text,
  };
  return { ...content, fingerprint: artifactFingerprint(content) };
}

export function buildNarrativePilotFreezeDocumentsV5(
  result: NarrativeMadridPilotQualificationV5,
  evidence: NarrativeEvidenceCaseV4
): NarrativePilotFreezeDocumentsV5 {
  validateNarrativeEvidenceCaseV4(evidence);
  replayNarrativeMadridPilotQualificationV5(result, evidence);
  if (result.status !== 'passed' || !result.preview) {
    throw new Error('only a passing Madrid pilot V5 qualification can be frozen');
  }
  const artifact = selectedArtifact(result);
  const preview = validateNarrativePilotPreviewV5(result.preview, evidence);
  const manifest = buildNarrativeExperiencePilotManifestV5(
    evidence,
    result.fingerprints.qualification,
    preview
  );
  const freezeLinks: NarrativePilotFreezeLinksV5 = {
    qualification: result.fingerprints.qualification,
    artifact: artifact.fingerprint,
    preview: preview.fingerprint,
    manifest: manifest.fingerprint,
  };
  const document = <T>(
    kind: NarrativePilotFreezeDocumentV5<T>['kind'],
    payload: T
  ): NarrativePilotFreezeDocumentV5<T> => ({
    schemaVersion: NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V5,
    kind,
    freezeLinks,
    payload,
  });
  return replayNarrativePilotFreezeDocumentsV5({
    qualification: document('qualification', result),
    artifact: document('artifact', artifact),
    preview: document('preview', preview),
    manifest: document('manifest', manifest),
  }, evidence);
}

export function replayNarrativePilotFreezeDocumentsV5(
  documents: NarrativePilotFreezeDocumentsV5,
  evidence: NarrativeEvidenceCaseV4
): NarrativePilotFreezeDocumentsV5 {
  validateNarrativeEvidenceCaseV4(evidence);
  const entries = Object.entries(documents) as Array<[
    keyof NarrativePilotFreezeDocumentsV5,
    NarrativePilotFreezeDocumentV5<unknown>,
  ]>;
  for (const [kind, document] of entries) {
    if (document.schemaVersion !== NARRATIVE_PILOT_FREEZE_DOCUMENT_SCHEMA_VERSION_V5
      || document.kind !== kind) {
      throw new Error(`narrative pilot freeze v5 ${kind} document changed`);
    }
  }
  const qualification = replayNarrativeMadridPilotQualificationV5(
    documents.qualification.payload,
    evidence
  );
  const artifact = documents.artifact.payload;
  const { fingerprint: storedArtifactFingerprint, ...artifactContent } = artifact;
  const preview = validateNarrativePilotPreviewV5(documents.preview.payload, evidence);
  const manifest = validateNarrativeExperiencePilotManifestV5(
    documents.manifest.payload,
    evidence,
    preview
  );
  if (artifact.schemaVersion !== 'narrative-selected-artifact-v5'
    || artifact.status !== 'machine_approved'
    || artifact.publicTourStatus !== 'review'
    || artifact.caseId !== evidence.caseId
    || artifact.variant !== qualification.selectedVariant
    || artifact.evidenceFingerprint !== evidence.fingerprint
    || artifact.planFingerprint !== qualification.selectedArtifact?.planFingerprint
    || artifact.textFingerprint !== narrativeTourTextFingerprintV5(artifact.text)
    || artifact.textFingerprint !== preview.selectedTextFingerprint
    || artifact.qualificationFingerprint !== qualification.fingerprints.qualification
    || storedArtifactFingerprint !== artifactFingerprint(artifactContent)) {
    throw new Error('narrative selected artifact v5 changed');
  }
  const links: NarrativePilotFreezeLinksV5 = {
    qualification: qualification.fingerprints.qualification,
    artifact: artifact.fingerprint,
    preview: preview.fingerprint,
    manifest: manifest.fingerprint,
  };
  if (entries.some(([, document]) => (
    editorialFingerprintV7(document.freezeLinks) !== editorialFingerprintV7(links)
  ))) {
    throw new Error('narrative pilot freeze v5 cross fingerprints changed');
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

export function freezeNarrativeMadridPilotV5(
  result: NarrativeMadridPilotQualificationV5,
  evidence: NarrativeEvidenceCaseV4,
  paths: NarrativePilotFreezePathsV5
): NarrativePilotFreezeDocumentsV5 {
  const documents = buildNarrativePilotFreezeDocumentsV5(result, evidence);
  atomicWriteSet([
    { path: paths.qualificationPath, content: `${JSON.stringify(documents.qualification, null, 2)}\n` },
    { path: paths.artifactPath, content: `${JSON.stringify(documents.artifact, null, 2)}\n` },
    { path: paths.previewPath, content: `${JSON.stringify(documents.preview, null, 2)}\n` },
    { path: paths.manifestPath, content: `${JSON.stringify(documents.manifest, null, 2)}\n` },
  ]);
  return documents;
}

export function readNarrativePilotFreezeDocumentsV5(
  paths: NarrativePilotFreezePathsV5
): NarrativePilotFreezeDocumentsV5 {
  const read = <T>(path: string): T => JSON.parse(readFileSync(path, 'utf8')) as T;
  return {
    qualification: read(paths.qualificationPath),
    artifact: read(paths.artifactPath),
    preview: read(paths.previewPath),
    manifest: read(paths.manifestPath),
  };
}
