import { createHash } from 'crypto';
import {
  NarrativeCapturedSourceV6,
  NarrativeSourceAuthorityV6,
  ReplayNarrativeSourceProviderV6,
  classifyNarrativeSourceAuthorityV6,
} from './NarrativeSourcesV6';

export const NARRATIVE_RESEARCH_SNAPSHOT_SCHEMA_VERSION_V6 =
  'narrative-research-snapshot-v2' as const;
export const NARRATIVE_RESEARCH_PRIVATE_ARTIFACT_VERSION_V6 =
  'narrative-research-private-v2' as const;
export const MAX_NARRATIVE_RESEARCH_EXCERPTS_PER_SOURCE_V6 = 3;
export const MAX_NARRATIVE_RESEARCH_EXCERPT_CHARACTERS_V6 = 500;
export const MAX_NARRATIVE_RESEARCH_EXCERPT_TOTAL_CHARACTERS_V6 = 1_000;

export interface NarrativeResearchSnapshotSourceV6 {
  sourceId: string;
  finalUrl: string;
  requestedUrlFingerprint: string;
  title: string;
  authority: NarrativeSourceAuthorityV6;
  fingerprint: string;
  capturedAt: string;
  excerpts: string[];
  wikimediaRevision?: { revisionId: number; timestamp: string };
}

export interface NarrativeResearchSnapshotManifestV6 {
  schemaVersion: typeof NARRATIVE_RESEARCH_SNAPSHOT_SCHEMA_VERSION_V6;
  capturePolicy: 'once';
  sources: NarrativeResearchSnapshotSourceV6[];
  fingerprint: string;
}

export interface NarrativeResearchPrivateArtifactV6 {
  schemaVersion: typeof NARRATIVE_RESEARCH_PRIVATE_ARTIFACT_VERSION_V6;
  manifestFingerprint: string;
  captures: NarrativeCapturedSourceV6[];
}

export interface NarrativeResearchSnapshotBundleV6 {
  manifest: NarrativeResearchSnapshotManifestV6;
  privateArtifact: NarrativeResearchPrivateArtifactV6;
}

export type NarrativeResearchSnapshotPreflightV6 =
  | { status: 'ready'; sourceIds: string[] }
  | {
    status: 'reference_evidence_missing';
    missingReferenceIds: string[];
    reason: string;
  };

type ManifestWithoutFingerprintV6 = Omit<NarrativeResearchSnapshotManifestV6, 'fingerprint'>;

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, expected: string[], label: string): void {
  if (Object.keys(value).sort().join(',') !== [...expected].sort().join(',')) {
    throw new Error(`${label} has unexpected or missing fields`);
  }
}

function requiredString(value: unknown, label: string, maximum: number): string {
  if (typeof value !== 'string' || !value || value !== value.trim() || value.length > maximum) {
    throw new Error(`${label} must be a trimmed string of at most ${maximum} characters`);
  }
  return value;
}

function isoTimestamp(value: unknown, label: string): string {
  const timestamp = requiredString(value, label, 64);
  if (!Number.isFinite(Date.parse(timestamp)) || new Date(timestamp).toISOString() !== timestamp) {
    throw new Error(`${label} must be an ISO timestamp`);
  }
  return timestamp;
}

function httpsUrl(value: unknown, label: string): string {
  const raw = requiredString(value, label, 4_000);
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
    throw new Error(`${label} must be an HTTPS URL without credentials or a fragment`);
  }
  return raw;
}

function fingerprint(value: unknown, label: string): string {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/u.test(value)) {
    throw new Error(`${label} must be a SHA-256 fingerprint`);
  }
  return value;
}

function authority(value: unknown, finalUrl: string, label: string): NarrativeSourceAuthorityV6 {
  const row = objectValue(value, label);
  exactKeys(row, ['tier', 'publisherKey', 'rule'], label);
  const expected = classifyNarrativeSourceAuthorityV6(finalUrl);
  if (row.tier !== expected.tier || row.publisherKey !== expected.publisherKey
    || row.rule !== expected.rule) {
    throw new Error(`${label} does not match deterministic authority classification`);
  }
  return expected;
}

function wikimediaRevision(
  value: unknown,
  label: string
): { revisionId: number; timestamp: string } | undefined {
  if (value === undefined) return undefined;
  const row = objectValue(value, label);
  exactKeys(row, ['revisionId', 'timestamp'], label);
  if (!Number.isInteger(row.revisionId) || (row.revisionId as number) < 1) {
    throw new Error(`${label}.revisionId must be a positive integer`);
  }
  return {
    revisionId: row.revisionId as number,
    timestamp: isoTimestamp(row.timestamp, `${label}.timestamp`),
  };
}

function excerpts(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length < 1
    || value.length > MAX_NARRATIVE_RESEARCH_EXCERPTS_PER_SOURCE_V6) {
    throw new Error(
      `${label} must contain 1 to ${MAX_NARRATIVE_RESEARCH_EXCERPTS_PER_SOURCE_V6} excerpts`
    );
  }
  const result = value.map((item, index) => requiredString(
    item,
    `${label}[${index}]`,
    MAX_NARRATIVE_RESEARCH_EXCERPT_CHARACTERS_V6
  ));
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique`);
  if (result.reduce((total, item) => total + item.length, 0)
    > MAX_NARRATIVE_RESEARCH_EXCERPT_TOTAL_CHARACTERS_V6) {
    throw new Error(
      `${label} exceeds ${MAX_NARRATIVE_RESEARCH_EXCERPT_TOTAL_CHARACTERS_V6} total characters`
    );
  }
  return result;
}

function manifestSource(
  value: unknown,
  index: number
): NarrativeResearchSnapshotSourceV6 {
  const label = `narrative research manifest sources[${index}]`;
  const row = objectValue(value, label);
  const hasRevision = row.wikimediaRevision !== undefined;
  exactKeys(row, [
    'sourceId', 'finalUrl', 'requestedUrlFingerprint', 'title', 'authority', 'fingerprint',
    'capturedAt', 'excerpts',
    ...(hasRevision ? ['wikimediaRevision'] : []),
  ], label);
  const finalUrl = httpsUrl(row.finalUrl, `${label}.finalUrl`);
  const revision = wikimediaRevision(row.wikimediaRevision, `${label}.wikimediaRevision`);
  return {
    sourceId: requiredString(row.sourceId, `${label}.sourceId`, 200),
    finalUrl,
    requestedUrlFingerprint: fingerprint(
      row.requestedUrlFingerprint,
      `${label}.requestedUrlFingerprint`
    ),
    title: requiredString(row.title, `${label}.title`, 500),
    authority: authority(row.authority, finalUrl, `${label}.authority`),
    fingerprint: fingerprint(row.fingerprint, `${label}.fingerprint`),
    capturedAt: isoTimestamp(row.capturedAt, `${label}.capturedAt`),
    excerpts: excerpts(row.excerpts, `${label}.excerpts`),
    ...(revision ? { wikimediaRevision: revision } : {}),
  };
}

function canonicalManifest(
  sources: NarrativeResearchSnapshotSourceV6[]
): ManifestWithoutFingerprintV6 {
  return {
    schemaVersion: NARRATIVE_RESEARCH_SNAPSHOT_SCHEMA_VERSION_V6,
    capturePolicy: 'once',
    sources: [...sources].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
  };
}

export function narrativeResearchSnapshotFingerprintV6(
  manifest: ManifestWithoutFingerprintV6
): string {
  return sha256(JSON.stringify(canonicalManifest(manifest.sources)));
}

function assertUniqueSources(sources: NarrativeResearchSnapshotSourceV6[]): void {
  const keys: Array<[string, (source: NarrativeResearchSnapshotSourceV6) => string]> = [
    ['source IDs', (source) => source.sourceId],
    ['final URLs', (source) => source.finalUrl],
    ['source fingerprints', (source) => source.fingerprint],
  ];
  for (const [label, select] of keys) {
    if (new Set(sources.map(select)).size !== sources.length) {
      throw new Error(`narrative research manifest ${label} must be unique`);
    }
  }
}

export function validateNarrativeResearchSnapshotManifestV6(
  value: unknown
): NarrativeResearchSnapshotManifestV6 {
  const root = objectValue(value, 'narrative research manifest');
  exactKeys(root, ['schemaVersion', 'capturePolicy', 'sources', 'fingerprint'],
    'narrative research manifest');
  if (root.schemaVersion !== NARRATIVE_RESEARCH_SNAPSHOT_SCHEMA_VERSION_V6
    || root.capturePolicy !== 'once') {
    throw new Error('narrative research manifest protocol changed');
  }
  if (!Array.isArray(root.sources) || root.sources.length < 1) {
    throw new Error('narrative research manifest requires captured sources');
  }
  const sources = root.sources.map(manifestSource);
  assertUniqueSources(sources);
  const canonical = canonicalManifest(sources);
  const expectedFingerprint = narrativeResearchSnapshotFingerprintV6(canonical);
  if (fingerprint(root.fingerprint, 'narrative research manifest fingerprint')
    !== expectedFingerprint) {
    throw new Error('narrative research manifest fingerprint changed');
  }
  return { ...canonical, fingerprint: expectedFingerprint };
}

export function preflightNarrativeResearchSnapshotV6(input: {
  manifest: unknown;
  requiredReferences: ReadonlyArray<{
    referenceId: string;
    finalUrl: string;
    literalAnchors: readonly string[];
  }>;
}): NarrativeResearchSnapshotPreflightV6 {
  const manifest = validateNarrativeResearchSnapshotManifestV6(input.manifest);
  const missingReferenceIds: string[] = [];
  const sourceIds: string[] = [];
  for (const requirement of input.requiredReferences) {
    const source = manifest.sources.find((item) => item.finalUrl === requirement.finalUrl);
    if (!source || requirement.literalAnchors.some((anchor) => (
      !source.excerpts.some((excerpt) => excerpt.includes(anchor))
    ))) {
      missingReferenceIds.push(requirement.referenceId);
      continue;
    }
    sourceIds.push(source.sourceId);
  }
  return missingReferenceIds.length > 0
    ? {
      status: 'reference_evidence_missing',
      missingReferenceIds,
      reason: `snapshot lacks required human evidence: ${missingReferenceIds.join(', ')}`,
    }
    : { status: 'ready', sourceIds };
}

function contentFingerprint(capture: NarrativeCapturedSourceV6): string {
  return sha256(`${capture.finalUrl}\n${capture.content}`);
}

function instructionLikeText(value: string): boolean {
  return /ignore (?:all |the |any )?(?:previous|prior) instructions|system prompt|run (?:a |the )?tool|execute (?:a |the )?command/iu
    .test(value);
}

function copyCapture(capture: NarrativeCapturedSourceV6): NarrativeCapturedSourceV6 {
  return {
    ...capture,
    authority: { ...capture.authority },
    ...(capture.wikimediaRevision
      ? { wikimediaRevision: { ...capture.wikimediaRevision } }
      : {}),
  };
}

function validatePrivateCapture(
  value: NarrativeCapturedSourceV6,
  manifestSourceValue: NarrativeResearchSnapshotSourceV6
): NarrativeCapturedSourceV6 {
  const label = `private capture ${manifestSourceValue.sourceId}`;
  const capture = objectValue(value, label) as unknown as NarrativeCapturedSourceV6;
  const expectedKeys = [
    'sourceId', 'requestedUrl', 'finalUrl', 'title', 'capturedAt', 'content', 'fingerprint',
    'authority', 'containsInstructionLikeText',
    ...(capture.wikimediaRevision !== undefined ? ['wikimediaRevision'] : []),
  ];
  exactKeys(capture as unknown as Record<string, unknown>, expectedKeys, label);
  httpsUrl(capture.requestedUrl, `${label}.requestedUrl`);
  const finalUrl = httpsUrl(capture.finalUrl, `${label}.finalUrl`);
  const title = requiredString(capture.title, `${label}.title`, 500);
  const capturedAt = isoTimestamp(capture.capturedAt, `${label}.capturedAt`);
  const sourceId = requiredString(capture.sourceId, `${label}.sourceId`, 200);
  if (typeof capture.content !== 'string' || !capture.content.trim()
    || capture.content !== capture.content.trim()) {
    throw new Error(`${label}.content must be non-empty trimmed text`);
  }
  const sourceFingerprint = fingerprint(capture.fingerprint, `${label}.fingerprint`);
  const deterministicAuthority = authority(capture.authority, finalUrl, `${label}.authority`);
  const revision = wikimediaRevision(capture.wikimediaRevision, `${label}.wikimediaRevision`);
  if (capture.containsInstructionLikeText !== instructionLikeText(capture.content)) {
    throw new Error(`${label} instruction-like text flag changed`);
  }
  if (sourceFingerprint !== contentFingerprint(capture)) {
    throw new Error(`${label} content fingerprint changed`);
  }
  const publicFieldsMatch = sourceId === manifestSourceValue.sourceId
    && finalUrl === manifestSourceValue.finalUrl
    && sha256(capture.requestedUrl) === manifestSourceValue.requestedUrlFingerprint
    && title === manifestSourceValue.title
    && capturedAt === manifestSourceValue.capturedAt
    && sourceFingerprint === manifestSourceValue.fingerprint
    && JSON.stringify(deterministicAuthority) === JSON.stringify(manifestSourceValue.authority)
    && JSON.stringify(revision) === JSON.stringify(manifestSourceValue.wikimediaRevision);
  if (!publicFieldsMatch) throw new Error(`${label} does not match the public manifest`);
  if (manifestSourceValue.excerpts.some((excerpt) => !capture.content.includes(excerpt)
    || excerpt === capture.content)) {
    throw new Error(`${label} does not contain every bounded public excerpt literally`);
  }
  return copyCapture({
    ...capture,
    sourceId,
    finalUrl,
    title,
    capturedAt,
    fingerprint: sourceFingerprint,
    authority: deterministicAuthority,
    ...(revision ? { wikimediaRevision: revision } : {}),
  });
}

export function createNarrativeResearchSnapshotBundleV6(input: {
  captures: NarrativeCapturedSourceV6[];
  excerptsBySourceId: Readonly<Record<string, readonly string[]>>;
}): NarrativeResearchSnapshotBundleV6 {
  if (input.captures.length < 1) throw new Error('research snapshot requires captured pages');
  const sourceIds = input.captures.map((capture) => capture.sourceId);
  if (new Set(sourceIds).size !== sourceIds.length) {
    throw new Error('research snapshot source IDs must be unique');
  }
  const excerptIds = Object.keys(input.excerptsBySourceId).sort();
  if ([...sourceIds].sort().join('\n') !== excerptIds.join('\n')) {
    throw new Error('research snapshot excerpts must match captured source IDs exactly');
  }
  const provisionalSources = input.captures.map((capture, index): NarrativeResearchSnapshotSourceV6 => (
    manifestSource({
      sourceId: capture.sourceId,
      finalUrl: capture.finalUrl,
      requestedUrlFingerprint: sha256(capture.requestedUrl),
      title: capture.title,
      authority: capture.authority,
      fingerprint: capture.fingerprint,
      capturedAt: capture.capturedAt,
      excerpts: [...input.excerptsBySourceId[capture.sourceId]],
      ...(capture.wikimediaRevision ? { wikimediaRevision: capture.wikimediaRevision } : {}),
    }, index)
  ));
  assertUniqueSources(provisionalSources);
  const manifestWithoutFingerprint = canonicalManifest(provisionalSources);
  const manifest = validateNarrativeResearchSnapshotManifestV6({
    ...manifestWithoutFingerprint,
    fingerprint: narrativeResearchSnapshotFingerprintV6(manifestWithoutFingerprint),
  });
  const bySourceId = new Map(manifest.sources.map((source) => [source.sourceId, source]));
  const captures = input.captures.map((capture) => validatePrivateCapture(
    capture,
    bySourceId.get(capture.sourceId) as NarrativeResearchSnapshotSourceV6
  ));
  if (new Set(captures.map((capture) => capture.requestedUrl)).size !== captures.length) {
    throw new Error('research snapshot requested URLs must be unique for capture-once replay');
  }
  return {
    manifest,
    privateArtifact: {
      schemaVersion: NARRATIVE_RESEARCH_PRIVATE_ARTIFACT_VERSION_V6,
      manifestFingerprint: manifest.fingerprint,
      captures,
    },
  };
}

export function replayNarrativeResearchSnapshotV6(
  manifestValue: unknown,
  privateArtifactValue: unknown
): ReplayNarrativeSourceProviderV6 {
  const manifest = validateNarrativeResearchSnapshotManifestV6(manifestValue);
  const artifact = objectValue(privateArtifactValue, 'narrative research private artifact');
  exactKeys(artifact, ['schemaVersion', 'manifestFingerprint', 'captures'],
    'narrative research private artifact');
  if (artifact.schemaVersion !== NARRATIVE_RESEARCH_PRIVATE_ARTIFACT_VERSION_V6
    || artifact.manifestFingerprint !== manifest.fingerprint) {
    throw new Error('narrative research private artifact does not match the public manifest');
  }
  if (!Array.isArray(artifact.captures) || artifact.captures.length !== manifest.sources.length) {
    throw new Error('narrative research private captures do not match the manifest source count');
  }
  const rawCaptures = artifact.captures as NarrativeCapturedSourceV6[];
  const capturesById = new Map(rawCaptures.map((capture) => [capture?.sourceId, capture]));
  if (capturesById.size !== rawCaptures.length) {
    throw new Error('narrative research private capture IDs must be unique');
  }
  const captures = manifest.sources.map((source) => {
    const capture = capturesById.get(source.sourceId);
    if (!capture) throw new Error(`private artifact has no capture for ${source.sourceId}`);
    return validatePrivateCapture(capture, source);
  });
  if (new Set(captures.map((capture) => capture.requestedUrl)).size !== captures.length) {
    throw new Error('narrative research private requested URLs must be unique');
  }
  return new ReplayNarrativeSourceProviderV6(captures);
}
