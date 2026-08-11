import { createHash } from 'crypto';
import { narrativeFingerprintV6 } from './NarrativeContractsV6';

export const NARRATIVE_MADRID_REFERENCE_SCHEMA_VERSION_V6 =
  'narrative-madrid-reference-v6' as const;

interface NarrativeReferenceDocumentV6 {
  path: string;
  sha256: string;
}

export interface NarrativeMadridReferenceStopV6 {
  stopId: string;
  position: number;
  name: string;
  wikidataId: string;
  coordinates: { lat: number; lng: number };
  contribution: string;
  dossier: NarrativeReferenceDocumentV6 & { sources: number; propositions: number };
  script: NarrativeReferenceDocumentV6;
  ledger: NarrativeReferenceDocumentV6 & { claims: number };
}

export interface NarrativeMadridReferenceV6 {
  schemaVersion: typeof NARRATIVE_MADRID_REFERENCE_SCHEMA_VERSION_V6;
  caseId: string;
  city: string;
  country: string;
  language: string;
  theme: string;
  durationMinutes: number;
  referenceStatus: string;
  promise: string;
  centralQuestion: string;
  voiceProfile: {
    anchorStopId: string;
    description: string;
    durationGuidance: string;
    rules: string[];
  };
  developmentStopIds: string[];
  validationStopIds: string[];
  decisions: Array<{
    id: string;
    category: string;
    rule: string;
    sourceStopIds: string[];
  }>;
  stops: NarrativeMadridReferenceStopV6[];
}

export type NarrativeMadridDocumentsV6 = Record<string, {
  dossier: string;
  script: string;
  ledger: string;
}>;

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function requiredString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) throw new Error(`${label} must be a string`);
  return value;
}

function positiveInteger(value: unknown, label: string): number {
  if (!Number.isInteger(value) || Number(value) <= 0) throw new Error(`${label} must be positive`);
  return Number(value);
}

function stringArray(value: unknown, label: string): string[] {
  if (!Array.isArray(value)) throw new Error(`${label} must be an array`);
  return value.map((item, index) => requiredString(item, `${label}[${index}]`));
}

function documentValue(value: unknown, label: string): NarrativeReferenceDocumentV6 {
  const document = objectValue(value, label);
  const sha256 = requiredString(document.sha256, `${label}.sha256`);
  if (!/^[a-f0-9]{64}$/.test(sha256)) throw new Error(`${label}.sha256 must be hexadecimal`);
  return { path: requiredString(document.path, `${label}.path`), sha256 };
}

export function validateNarrativeMadridCorpusV6(raw: unknown): NarrativeMadridReferenceV6 {
  const value = objectValue(raw, 'Madrid reference');
  if (value.schemaVersion !== NARRATIVE_MADRID_REFERENCE_SCHEMA_VERSION_V6) {
    throw new Error('invalid Madrid reference schema version');
  }
  const developmentStopIds = stringArray(value.developmentStopIds, 'developmentStopIds');
  const validationStopIds = stringArray(value.validationStopIds, 'validationStopIds');
  if (developmentStopIds.some((stopId) => validationStopIds.includes(stopId))) {
    throw new Error('development and validation stops must be disjoint');
  }
  if (!Array.isArray(value.stops) || value.stops.length !== 7) {
    throw new Error('Madrid reference requires seven stops');
  }
  const stops = value.stops.map((rawStop, position): NarrativeMadridReferenceStopV6 => {
    const stop = objectValue(rawStop, `stops[${position}]`);
    if (stop.position !== position) throw new Error('Madrid stop positions must be contiguous');
    const coordinates = objectValue(stop.coordinates, `stops[${position}].coordinates`);
    if (typeof coordinates.lat !== 'number' || typeof coordinates.lng !== 'number') {
      throw new Error(`stops[${position}] coordinates must be numeric`);
    }
    const dossier = objectValue(stop.dossier, `stops[${position}].dossier`);
    const ledger = objectValue(stop.ledger, `stops[${position}].ledger`);
    return {
      stopId: requiredString(stop.stopId, `stops[${position}].stopId`),
      position,
      name: requiredString(stop.name, `stops[${position}].name`),
      wikidataId: requiredString(stop.wikidataId, `stops[${position}].wikidataId`),
      coordinates: { lat: coordinates.lat, lng: coordinates.lng },
      contribution: requiredString(stop.contribution, `stops[${position}].contribution`),
      dossier: {
        ...documentValue(dossier, `stops[${position}].dossier`),
        sources: positiveInteger(dossier.sources, `stops[${position}].dossier.sources`),
        propositions: positiveInteger(
          dossier.propositions, `stops[${position}].dossier.propositions`
        ),
      },
      script: documentValue(stop.script, `stops[${position}].script`),
      ledger: {
        ...documentValue(ledger, `stops[${position}].ledger`),
        claims: positiveInteger(ledger.claims, `stops[${position}].ledger.claims`),
      },
    };
  });
  const stopIds = stops.map((stop) => stop.stopId);
  if (new Set(stopIds).size !== stops.length
    || [...developmentStopIds, ...validationStopIds].some((stopId) => !stopIds.includes(stopId))) {
    throw new Error('Madrid split must reference unique known stops');
  }
  if (!Array.isArray(value.decisions)) throw new Error('decisions must be an array');
  const decisions = value.decisions.map((rawDecision, index) => {
    const decision = objectValue(rawDecision, `decisions[${index}]`);
    return {
      id: requiredString(decision.id, `decisions[${index}].id`),
      category: requiredString(decision.category, `decisions[${index}].category`),
      rule: requiredString(decision.rule, `decisions[${index}].rule`),
      sourceStopIds: stringArray(decision.sourceStopIds, `decisions[${index}].sourceStopIds`),
    };
  });
  const voiceProfile = objectValue(value.voiceProfile, 'voiceProfile');
  return {
    schemaVersion: NARRATIVE_MADRID_REFERENCE_SCHEMA_VERSION_V6,
    caseId: requiredString(value.caseId, 'caseId'),
    city: requiredString(value.city, 'city'),
    country: requiredString(value.country, 'country'),
    language: requiredString(value.language, 'language'),
    theme: requiredString(value.theme, 'theme'),
    durationMinutes: positiveInteger(value.durationMinutes, 'durationMinutes'),
    referenceStatus: requiredString(value.referenceStatus, 'referenceStatus'),
    promise: requiredString(value.promise, 'promise'),
    centralQuestion: requiredString(value.centralQuestion, 'centralQuestion'),
    voiceProfile: {
      anchorStopId: requiredString(voiceProfile.anchorStopId, 'voiceProfile.anchorStopId'),
      description: requiredString(voiceProfile.description, 'voiceProfile.description'),
      durationGuidance: requiredString(
        voiceProfile.durationGuidance, 'voiceProfile.durationGuidance'
      ),
      rules: stringArray(voiceProfile.rules, 'voiceProfile.rules'),
    },
    developmentStopIds,
    validationStopIds,
    decisions,
    stops,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

export function loadNarrativeMadridDocumentsV6(
  manifest: NarrativeMadridReferenceV6,
  read: (relativePath: string) => string
): NarrativeMadridDocumentsV6 {
  return Object.fromEntries(manifest.stops.map((stop) => {
    const documents = {
      dossier: read(stop.dossier.path),
      script: read(stop.script.path),
      ledger: read(stop.ledger.path),
    };
    for (const kind of ['dossier', 'script', 'ledger'] as const) {
      if (sha256(documents[kind]) !== stop[kind].sha256) {
        throw new Error(`${stop.stopId} ${kind} fingerprint mismatch`);
      }
    }
    return [stop.stopId, documents];
  }));
}

function scriptBody(markdown: string): string {
  return markdown.split(/^## Guion\s*$/m)[1]?.split(/^## /m)[0]?.trim() ?? '';
}

function words(value: string): string[] {
  return value.toLocaleLowerCase('es').match(/[\p{L}\p{N}]+/gu) ?? [];
}

function repeatedPassages(documents: NarrativeMadridDocumentsV6): string[] {
  const owners = new Map<string, Set<string>>();
  for (const [stopId, document] of Object.entries(documents)) {
    const tokens = words(scriptBody(document.script));
    for (let index = 0; index <= tokens.length - 12; index += 1) {
      const passage = tokens.slice(index, index + 12).join(' ');
      const passageOwners = owners.get(passage) ?? new Set<string>();
      passageOwners.add(stopId);
      owners.set(passage, passageOwners);
    }
  }
  return [...owners.entries()]
    .filter(([, stopIds]) => stopIds.size > 1)
    .map(([passage]) => passage)
    .sort();
}

export function auditNarrativeMadridCorpusV6(
  manifest: NarrativeMadridReferenceV6,
  documents: NarrativeMadridDocumentsV6
) {
  const hardWarnings: string[] = [];
  const stops = manifest.stops.map((stop) => {
    const document = documents[stop.stopId];
    if (!document) {
      hardWarnings.push(`${stop.stopId}:missing_documents`);
      return { stopId: stop.stopId, words: 0, estimatedSeconds: 0 };
    }
    const sourceCount = (document.dossier.match(/^\| S\d+/gm) ?? []).length;
    const propositionCount = (document.dossier.match(/^### P\d+/gm) ?? []).length;
    const claimCount = (document.ledger.match(/^\| C\d+/gm) ?? []).length;
    if (sourceCount !== stop.dossier.sources) hardWarnings.push(`${stop.stopId}:source_count`);
    if (propositionCount !== stop.dossier.propositions) {
      hardWarnings.push(`${stop.stopId}:proposition_count`);
    }
    if (claimCount !== stop.ledger.claims) hardWarnings.push(`${stop.stopId}:claim_count`);
    if (!document.script.includes('aprobado editorialmente')
      && !document.script.includes('aprobado por el gate editorial humano')) {
      hardWarnings.push(`${stop.stopId}:human_approval_missing`);
    }
    const wordCount = words(scriptBody(document.script)).length;
    const estimatedSeconds = Math.round((wordCount / 180) * 60);
    if (estimatedSeconds < 120 || estimatedSeconds > 210) {
      hardWarnings.push(`${stop.stopId}:duration`);
    }
    return { stopId: stop.stopId, words: wordCount, estimatedSeconds };
  });
  const development = new Set(manifest.developmentStopIds);
  if (manifest.decisions.some((decision) => (
    decision.sourceStopIds.some((stopId) => !development.has(stopId))
  ))) {
    hardWarnings.push('validation_leakage');
  }
  const fingerprints = manifest.stops.flatMap((stop) => [
    stop.dossier.sha256, stop.script.sha256, stop.ledger.sha256,
  ]);
  return {
    verifiedDocuments: fingerprints.length,
    hardWarnings,
    repeatedPassages: repeatedPassages(documents),
    stops,
    corpusFingerprint: narrativeFingerprintV6({ manifest, fingerprints }),
  };
}
