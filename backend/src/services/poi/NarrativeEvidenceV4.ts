import { editorialFingerprintV7 } from './EditorialProfileV7';

export const NARRATIVE_EVIDENCE_SCHEMA_VERSION_V4 = 'narrative-evidence-v4' as const;

export type NarrativeEvidenceRoleV4 =
  | 'observable'
  | 'historical_change'
  | 'human_agency'
  | 'tension_or_contrast';

export type NarrativeEvidenceRelationSupportV4 = 'direct' | 'chronology' | 'causality';

export interface NarrativeEvidenceSourceV4 {
  sourceId: string;
  title: string;
  url: string;
  capturedAt: string;
  revisionId: string;
  fingerprint: string;
}

export interface NarrativeEvidenceFactV4 {
  factId: string;
  ownerCanonicalId: string;
  role: NarrativeEvidenceRoleV4;
  atomicTextEs: string;
  originalExcerpt: string;
  originalLanguage: string;
  relationSupport: NarrativeEvidenceRelationSupportV4[];
  allowsCausality: boolean;
  critical: boolean;
  visibility: { kind: 'on_site'; cueEs: string } | { kind: 'contextual' };
  source: NarrativeEvidenceSourceV4;
  fingerprint: string;
}

export interface NarrativeEvidenceSceneV4 {
  sceneId: string;
  name: string;
  ownerCanonicalId: string;
  routePosition: number;
  previousSceneId: string | null;
  nextSceneId: string | null;
  observationPoint: { lat: number; lng: number };
  contribution: string;
  closingInterpretation: { textEs: string; basisFactIds: string[] };
  evidenceFacts: NarrativeEvidenceFactV4[];
}

export interface NarrativeEvidenceCaseV4 {
  schemaVersion: typeof NARRATIVE_EVIDENCE_SCHEMA_VERSION_V4;
  caseId: string;
  city: string;
  theme: 'history';
  language: 'es-ES';
  title: string;
  subtitle: string;
  experienceLabel: string;
  promise: string;
  centralQuestion: string;
  route: {
    sourceFixture: string;
    sourceFingerprint: string;
    sceneIds: string[];
    walkingMeters: number;
    walkingSeconds: number;
    recommendedDurationMinutes: 60;
  };
  scenes: NarrativeEvidenceSceneV4[];
  fingerprint: string;
}

export type NarrativeEvidenceSourceInputV4 = Omit<NarrativeEvidenceSourceV4, 'fingerprint'>;
export type NarrativeEvidenceFactInputV4 =
  Omit<NarrativeEvidenceFactV4, 'source' | 'fingerprint'> & {
    source: NarrativeEvidenceSourceInputV4;
  };
export type NarrativeEvidenceSceneInputV4 =
  Omit<NarrativeEvidenceSceneV4, 'evidenceFacts'> & {
    evidenceFacts: NarrativeEvidenceFactInputV4[];
  };
export type NarrativeEvidenceCaseInputV4 =
  Omit<NarrativeEvidenceCaseV4, 'scenes' | 'fingerprint'> & {
    scenes: NarrativeEvidenceSceneInputV4[];
  };

const ROLES: NarrativeEvidenceRoleV4[] = [
  'observable', 'historical_change', 'human_agency', 'tension_or_contrast',
];
const RELATIONS: NarrativeEvidenceRelationSupportV4[] = [
  'direct', 'chronology', 'causality',
];

function requiredString(value: string, label: string): void {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
}

function uniqueStrings(values: string[], label: string): void {
  if (!Array.isArray(values) || values.length === 0
    || values.some((value) => typeof value !== 'string' || !value.trim())
    || new Set(values).size !== values.length) {
    throw new Error(`${label} must contain unique strings`);
  }
}

export function narrativeUnicodeWordsV4(value: string): string[] {
  return value.match(/[\p{L}\p{N}]+(?:[’'-][\p{L}\p{N}]+)*/gu) ?? [];
}

export function narrativeEvidenceSourceFingerprintV4(
  source: NarrativeEvidenceSourceInputV4
): string {
  return editorialFingerprintV7(source);
}

export function narrativeEvidenceFactFingerprintV4(
  fact: Omit<NarrativeEvidenceFactV4, 'fingerprint'>
): string {
  return editorialFingerprintV7(fact);
}

export function narrativeEvidenceCaseFingerprintV4(
  evidence: Omit<NarrativeEvidenceCaseV4, 'fingerprint'>
): string {
  return editorialFingerprintV7(evidence);
}

function validateSource(source: NarrativeEvidenceSourceV4, label: string): void {
  requiredString(source.sourceId, `${label} sourceId`);
  requiredString(source.title, `${label} title`);
  requiredString(source.revisionId, `${label} revisionId`);
  if (!Number.isFinite(Date.parse(source.capturedAt))) {
    throw new Error(`${label} capturedAt is invalid`);
  }
  let url: URL;
  try {
    url = new URL(source.url);
  } catch {
    throw new Error(`${label} URL is invalid`);
  }
  if (url.protocol !== 'https:') throw new Error(`${label} URL must use https`);
  const { fingerprint, ...content } = source;
  if (fingerprint !== narrativeEvidenceSourceFingerprintV4(content)) {
    throw new Error(`${label} source fingerprint changed`);
  }
}

function validateFact(
  fact: NarrativeEvidenceFactV4,
  scene: NarrativeEvidenceSceneV4
): void {
  const label = `narrative v4 ${scene.sceneId}:${fact.factId}`;
  requiredString(fact.factId, `${label} factId`);
  if (fact.ownerCanonicalId !== scene.ownerCanonicalId) {
    throw new Error(`${label} owner changed`);
  }
  if (!ROLES.includes(fact.role)) throw new Error(`${label} role is invalid`);
  requiredString(fact.atomicTextEs, `${label} atomicTextEs`);
  const wordCount = narrativeUnicodeWordsV4(fact.atomicTextEs).length;
  if (wordCount < 8 || wordCount > 45) {
    throw new Error(`${label} atomicTextEs must contain 8 to 45 Unicode words`);
  }
  if ((fact.atomicTextEs.match(/[.!?]+/g) ?? []).length > 1) {
    throw new Error(`${label} atomicTextEs must contain one proposition`);
  }
  requiredString(fact.originalExcerpt, `${label} originalExcerpt`);
  requiredString(fact.originalLanguage, `${label} originalLanguage`);
  uniqueStrings(fact.relationSupport, `${label} relationSupport`);
  if (fact.relationSupport.some((relation) => !RELATIONS.includes(relation))) {
    throw new Error(`${label} relationSupport is invalid`);
  }
  if (fact.allowsCausality !== fact.relationSupport.includes('causality')) {
    throw new Error(`${label} causality support changed`);
  }
  if (typeof fact.critical !== 'boolean') throw new Error(`${label} critical is invalid`);
  if (fact.role === 'observable') {
    if (fact.visibility.kind !== 'on_site') {
      throw new Error(`${label} observable fact requires an on-site cue`);
    }
    requiredString(fact.visibility.cueEs, `${label} cueEs`);
  } else if (fact.visibility.kind !== 'contextual') {
    throw new Error(`${label} only observable facts may contain an on-site cue`);
  }
  validateSource(fact.source, label);
  const { fingerprint, ...content } = fact;
  if (fingerprint !== narrativeEvidenceFactFingerprintV4(content)) {
    throw new Error(`${label} fact fingerprint changed`);
  }
}

export function validateNarrativeEvidenceCaseV4(
  evidence: NarrativeEvidenceCaseV4
): NarrativeEvidenceCaseV4 {
  if (evidence.schemaVersion !== NARRATIVE_EVIDENCE_SCHEMA_VERSION_V4
    || evidence.theme !== 'history' || evidence.language !== 'es-ES'
    || evidence.scenes.length !== 7 || evidence.route.recommendedDurationMinutes !== 60) {
    throw new Error('narrative v4 evidence metadata is invalid');
  }
  for (const [value, label] of [
    [evidence.caseId, 'caseId'], [evidence.city, 'city'], [evidence.title, 'title'],
    [evidence.subtitle, 'subtitle'], [evidence.experienceLabel, 'experienceLabel'],
    [evidence.promise, 'promise'], [evidence.centralQuestion, 'centralQuestion'],
    [evidence.route.sourceFixture, 'route sourceFixture'],
    [evidence.route.sourceFingerprint, 'route sourceFingerprint'],
  ]) requiredString(value as string, `narrative v4 ${label}`);
  if (!Number.isFinite(evidence.route.walkingMeters) || evidence.route.walkingMeters <= 0
    || !Number.isFinite(evidence.route.walkingSeconds) || evidence.route.walkingSeconds <= 0) {
    throw new Error('narrative v4 route metrics are invalid');
  }
  uniqueStrings(evidence.route.sceneIds, 'narrative v4 route scene IDs');
  if (evidence.route.sceneIds.length !== evidence.scenes.length) {
    throw new Error('narrative v4 route scene count changed');
  }
  for (const [index, scene] of evidence.scenes.entries()) {
    const expectedSceneId = evidence.route.sceneIds[index];
    if (scene.sceneId !== expectedSceneId || scene.routePosition !== index
      || scene.previousSceneId !== (evidence.route.sceneIds[index - 1] ?? null)
      || scene.nextSceneId !== (evidence.route.sceneIds[index + 1] ?? null)) {
      throw new Error(`narrative v4 ${scene.sceneId} route metadata changed`);
    }
    requiredString(scene.name, `narrative v4 ${scene.sceneId} name`);
    requiredString(scene.ownerCanonicalId, `narrative v4 ${scene.sceneId} owner`);
    requiredString(scene.contribution, `narrative v4 ${scene.sceneId} contribution`);
    requiredString(
      scene.closingInterpretation.textEs,
      `narrative v4 ${scene.sceneId} closing interpretation`
    );
    if (!Number.isFinite(scene.observationPoint.lat)
      || !Number.isFinite(scene.observationPoint.lng)) {
      throw new Error(`narrative v4 ${scene.sceneId} observation point changed`);
    }
    if (scene.evidenceFacts.length !== 4
      || new Set(scene.evidenceFacts.map((fact) => fact.role)).size !== ROLES.length
      || ROLES.some((role) => !scene.evidenceFacts.some((fact) => fact.role === role))) {
      throw new Error(`narrative v4 ${scene.sceneId} requires exactly four explicit roles`);
    }
    uniqueStrings(
      scene.evidenceFacts.map((fact) => fact.factId),
      `narrative v4 ${scene.sceneId} fact IDs`
    );
    scene.evidenceFacts.forEach((fact) => validateFact(fact, scene));
    uniqueStrings(
      scene.closingInterpretation.basisFactIds,
      `narrative v4 ${scene.sceneId} closing basisFactIds`
    );
    if (editorialFingerprintV7([...scene.closingInterpretation.basisFactIds].sort())
      !== editorialFingerprintV7(scene.evidenceFacts.map((fact) => fact.factId).sort())) {
      throw new Error(`narrative v4 ${scene.sceneId} closing basis changed`);
    }
  }
  const { fingerprint, ...content } = evidence;
  if (fingerprint !== narrativeEvidenceCaseFingerprintV4(content)) {
    throw new Error('narrative v4 case fingerprint changed');
  }
  return evidence;
}

export function hydrateNarrativeEvidenceCaseV4(
  input: NarrativeEvidenceCaseInputV4
): NarrativeEvidenceCaseV4 {
  const scenes: NarrativeEvidenceSceneV4[] = input.scenes.map((scene) => ({
    ...scene,
    closingInterpretation: {
      ...scene.closingInterpretation,
      basisFactIds: [...scene.closingInterpretation.basisFactIds],
    },
    evidenceFacts: scene.evidenceFacts.map((fact) => {
      const source: NarrativeEvidenceSourceV4 = {
        ...fact.source,
        fingerprint: narrativeEvidenceSourceFingerprintV4(fact.source),
      };
      const content: Omit<NarrativeEvidenceFactV4, 'fingerprint'> = {
        ...fact,
        relationSupport: [...fact.relationSupport],
        visibility: { ...fact.visibility },
        source,
      };
      return { ...content, fingerprint: narrativeEvidenceFactFingerprintV4(content) };
    }),
  }));
  const content: Omit<NarrativeEvidenceCaseV4, 'fingerprint'> = {
    ...input,
    route: { ...input.route, sceneIds: [...input.route.sceneIds] },
    scenes,
  };
  return validateNarrativeEvidenceCaseV4({
    ...content,
    fingerprint: narrativeEvidenceCaseFingerprintV4(content),
  });
}
