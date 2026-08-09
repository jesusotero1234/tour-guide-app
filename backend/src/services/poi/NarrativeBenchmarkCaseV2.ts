import { readFileSync } from 'fs';
import { editorialFingerprintV7 } from './EditorialProfileV7';
import {
  NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V1,
  NarrativeEvidenceFactV1,
  NarrativeScriptRequestV1,
  narrativeEvidenceFactFingerprintV1,
  validateNarrativeScriptRequestV1,
} from './NarrativePilotV1';

export const NARRATIVE_BENCHMARK_CASE_SCHEMA_VERSION_V2 =
  'narrative-benchmark-case-v2' as const;

export interface NarrativeSourceFactV2 {
  factId: string;
  ownerCanonicalId: string;
  originalExcerpt: string;
  originalLanguage: string;
  normalizedEs: string;
  sourceUrl: string;
  sourceTitle: string;
  capturedAt: string;
  fingerprint: string;
}

export interface NarrativeBenchmarkSceneV2 {
  sceneId: string;
  name: string;
  routePosition: number;
  previousSceneId: string | null;
  nextSceneId: string | null;
  contribution: string;
  allowedProperNouns: string[];
  evidenceFacts: NarrativeSourceFactV2[];
}

export interface NarrativeBenchmarkCaseV2 {
  schemaVersion: typeof NARRATIVE_BENCHMARK_CASE_SCHEMA_VERSION_V2;
  caseId: string;
  city: string;
  theme: 'history';
  language: 'es-ES';
  promise: string;
  centralQuestion: string;
  routeFingerprint: string;
  routeSceneIds: string[];
  scenes: NarrativeBenchmarkSceneV2[];
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

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} is required`);
  return value.trim();
}

function strings(value: unknown, label: string): string[] {
  if (!Array.isArray(value) || value.length === 0
    || value.some((item) => typeof item !== 'string' || !item.trim())) {
    throw new Error(`${label} must contain strings`);
  }
  const result = value.map((item) => (item as string).trim());
  if (new Set(result).size !== result.length) throw new Error(`${label} must be unique`);
  return result;
}

export function narrativeSourceFactFingerprintV2(
  fact: Omit<NarrativeSourceFactV2, 'fingerprint'>
): string {
  return editorialFingerprintV7(fact);
}

export function narrativeBenchmarkRouteFingerprintV2(
  value: Omit<NarrativeBenchmarkCaseV2, 'routeFingerprint'> | NarrativeBenchmarkCaseV2
): string {
  return editorialFingerprintV7({
    caseId: value.caseId,
    routeSceneIds: value.routeSceneIds,
    scenes: value.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      routePosition: scene.routePosition,
      previousSceneId: scene.previousSceneId,
      nextSceneId: scene.nextSceneId,
    })),
  });
}

export function narrativeEvidenceProvenanceFingerprintV2(
  value: NarrativeBenchmarkCaseV2
): string {
  return editorialFingerprintV7(value.scenes.map((scene) => ({
    sceneId: scene.sceneId,
    evidenceFacts: scene.evidenceFacts,
  })));
}

export function validateNarrativeBenchmarkCaseV2(raw: unknown): NarrativeBenchmarkCaseV2 {
  const root = objectValue(raw, 'narrative benchmark case');
  exactKeys(root, [
    'schemaVersion', 'caseId', 'city', 'theme', 'language', 'promise', 'centralQuestion',
    'routeFingerprint', 'routeSceneIds', 'scenes',
  ], 'narrative benchmark case');
  if (root.schemaVersion !== NARRATIVE_BENCHMARK_CASE_SCHEMA_VERSION_V2
    || root.theme !== 'history' || root.language !== 'es-ES') {
    throw new Error('invalid narrative benchmark case metadata');
  }
  const routeSceneIds = strings(root.routeSceneIds, 'narrative benchmark route scene IDs');
  if (!Array.isArray(root.scenes) || root.scenes.length !== 3) {
    throw new Error('narrative benchmark case requires exactly three scenes');
  }
  const scenes = root.scenes.map((rawScene, index) => {
    const scene = objectValue(rawScene, `narrative benchmark scenes[${index}]`);
    exactKeys(scene, [
      'sceneId', 'name', 'routePosition', 'previousSceneId', 'nextSceneId', 'contribution',
      'allowedProperNouns', 'evidenceFacts',
    ], `narrative benchmark scenes[${index}]`);
    const sceneId = requiredString(scene.sceneId, `narrative benchmark scenes[${index}].sceneId`);
    const routeIndex = routeSceneIds.indexOf(sceneId);
    if (routeIndex < 0 || scene.routePosition !== routeIndex + 1
      || scene.previousSceneId !== (routeSceneIds[routeIndex - 1] ?? null)
      || scene.nextSceneId !== (routeSceneIds[routeIndex + 1] ?? null)) {
      throw new Error(`narrative benchmark ${sceneId} has invalid route neighbours`);
    }
    if (!Array.isArray(scene.evidenceFacts) || scene.evidenceFacts.length !== 4) {
      throw new Error(`narrative benchmark ${sceneId} requires four evidence facts`);
    }
    const evidenceFacts = scene.evidenceFacts.map((rawFact, factIndex) => {
      const fact = objectValue(rawFact, `${sceneId} source facts[${factIndex}]`);
      exactKeys(fact, [
        'factId', 'ownerCanonicalId', 'originalExcerpt', 'originalLanguage', 'normalizedEs',
        'sourceUrl', 'sourceTitle', 'capturedAt', 'fingerprint',
      ], `${sceneId} source facts[${factIndex}]`);
      const result: NarrativeSourceFactV2 = {
        factId: requiredString(fact.factId, `${sceneId} factId`),
        ownerCanonicalId: requiredString(fact.ownerCanonicalId, `${sceneId} ownerCanonicalId`),
        originalExcerpt: requiredString(fact.originalExcerpt, `${sceneId} originalExcerpt`),
        originalLanguage: requiredString(fact.originalLanguage, `${sceneId} originalLanguage`),
        normalizedEs: requiredString(fact.normalizedEs, `${sceneId} normalizedEs`),
        sourceUrl: requiredString(fact.sourceUrl, `${sceneId} sourceUrl`),
        sourceTitle: requiredString(fact.sourceTitle, `${sceneId} sourceTitle`),
        capturedAt: requiredString(fact.capturedAt, `${sceneId} capturedAt`),
        fingerprint: requiredString(fact.fingerprint, `${sceneId} fingerprint`),
      };
      const url = new URL(result.sourceUrl);
      if ((url.protocol !== 'https:' && url.protocol !== 'http:')
        || Number.isNaN(Date.parse(result.capturedAt))) {
        throw new Error(`narrative benchmark ${result.factId} source metadata is invalid`);
      }
      const { fingerprint: _fingerprint, ...content } = result;
      if (result.fingerprint !== narrativeSourceFactFingerprintV2(content)) {
        throw new Error(`narrative source fact fingerprint changed for ${result.factId}`);
      }
      return result;
    });
    strings(evidenceFacts.map((fact) => fact.factId), `${sceneId} source fact IDs`);
    return {
      sceneId,
      name: requiredString(scene.name, `${sceneId} name`),
      routePosition: scene.routePosition as number,
      previousSceneId: scene.previousSceneId as string | null,
      nextSceneId: scene.nextSceneId as string | null,
      contribution: requiredString(scene.contribution, `${sceneId} contribution`),
      allowedProperNouns: strings(scene.allowedProperNouns, `${sceneId} allowed proper nouns`),
      evidenceFacts,
    };
  });
  strings(scenes.map((scene) => scene.sceneId), 'narrative benchmark scene IDs');
  const result: NarrativeBenchmarkCaseV2 = {
    schemaVersion: NARRATIVE_BENCHMARK_CASE_SCHEMA_VERSION_V2,
    caseId: requiredString(root.caseId, 'narrative benchmark caseId'),
    city: requiredString(root.city, 'narrative benchmark city'),
    theme: 'history',
    language: 'es-ES',
    promise: requiredString(root.promise, 'narrative benchmark promise'),
    centralQuestion: requiredString(root.centralQuestion, 'narrative benchmark centralQuestion'),
    routeFingerprint: requiredString(root.routeFingerprint, 'narrative benchmark route fingerprint'),
    routeSceneIds,
    scenes,
  };
  if (result.routeFingerprint !== narrativeBenchmarkRouteFingerprintV2(result)) {
    throw new Error('narrative benchmark route fingerprint changed');
  }
  return result;
}

function toNarrativeEvidenceFact(fact: NarrativeSourceFactV2): NarrativeEvidenceFactV1 {
  const content = {
    factId: fact.factId,
    ownerCanonicalId: fact.ownerCanonicalId,
    excerpt: fact.normalizedEs,
    sourceUrl: fact.sourceUrl,
    sourceTitle: fact.sourceTitle,
    capturedAt: fact.capturedAt,
  };
  return { ...content, fingerprint: narrativeEvidenceFactFingerprintV1(content) };
}

export function buildNarrativeScriptRequestFromCaseV2(
  raw: NarrativeBenchmarkCaseV2
): NarrativeScriptRequestV1 {
  const value = validateNarrativeBenchmarkCaseV2(raw);
  return validateNarrativeScriptRequestV1({
    schemaVersion: NARRATIVE_SCRIPT_REQUEST_SCHEMA_VERSION_V1,
    language: 'es-ES',
    promise: value.promise,
    centralQuestion: value.centralQuestion,
    routeFingerprint: value.routeFingerprint,
    routeSceneIds: [...value.routeSceneIds],
    scenes: value.scenes.map((scene) => ({
      sceneId: scene.sceneId,
      name: scene.name,
      routePosition: scene.routePosition,
      previousSceneId: scene.previousSceneId,
      nextSceneId: scene.nextSceneId,
      contribution: scene.contribution,
      allowedProperNouns: [...scene.allowedProperNouns],
      evidenceFacts: scene.evidenceFacts.map(toNarrativeEvidenceFact),
    })),
  });
}

export function loadNarrativeBenchmarkCaseV2(path: string): NarrativeBenchmarkCaseV2 {
  return validateNarrativeBenchmarkCaseV2(JSON.parse(readFileSync(path, 'utf8')));
}
