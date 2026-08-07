import { PoiCategory, classifyPoiTags } from '../../domain/poi/PoiClassification';
import { EditorialCandidateSource, EvidenceFact } from './EditorialCandidate';

export const EDITORIAL_ENTITY_SCHEMA_VERSION = 'editorial-entity-v4' as const;
export const EDITORIAL_VISIT_CONFLICT_METERS_V4 = 100;
const EDITORIAL_CONTEXT_SHARE_METERS_V4 = 40;

export interface EditorialEvidenceReadinessV4 {
  ready: boolean;
  observableCount: number;
  contextCount: number;
  historicalSpecificCount: number;
  missing: Array<'observable' | 'context' | 'historical_specific'>;
}

export interface EditorialEntityCandidateV4 {
  canonicalId: string;
  siteId: string;
  sourceIds: string[];
  localName: string;
  category: PoiCategory;
  coordinates: { lat: number; lng: number };
  fameScore: number;
  recognitionScore?: number;
  baselineScore?: number;
  evidenceFacts: EvidenceFact[];
  readiness: EditorialEvidenceReadinessV4;
  visitConflictGroup: string | null;
}

const OBSERVABLE_OSM_KEYS = new Set([
  'amenity', 'architect', 'building', 'building:colour', 'fountain', 'height', 'heritage',
  'historic', 'material', 'memorial', 'place', 'roof:shape', 'start_date', 'surface',
]);

const HISTORICAL_CLAIMS = new Set([
  'architect', 'architecturalStyle', 'heritageDesignation', 'inception', 'namedAfter',
]);

const HISTORICAL_TEXT = /\b(1[0-9]{3}|20[0-9]{2}|ancien|antigu|arquitect|barroc|built|capital|corte|constru|court|fund|geschicht|histori|medieval|modern|neocl|reform|remodel|rey|si[eè]cle|siglo|urban)\b/i;
const OBSERVABLE_TEXT = /\b(arcos?|arches?|barrier|carro|checkpoint|clock|columnas?|columns?|c[uú]pula|dome|fachada|facade|fountain|fuente|granite|guardhouse|kontrollpunkt|leones?|marble|m[aá]rmol|piedra|puerta|reloj|relieves?|sculpture|stone|torre|tower|ventanas?|windows?)\b/i;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourceId(source: EditorialCandidateSource): string {
  return `${source.osmType}:${source.osmId}`;
}

export function canonicalEntityIdV4(source: EditorialCandidateSource): string {
  const wikidata = source.tags.wikidata?.trim();
  if (wikidata) return wikidata;
  const wikipedia = source.tags.wikipedia?.trim();
  if (wikipedia) return `wikipedia:${wikipedia}`;
  return `osm:${sourceId(source)}`;
}

function localName(source: EditorialCandidateSource, language: string): string {
  return source.enriched.nameTranslations[language]
    || source.tags[`name:${language}`]
    || source.name
    || source.tags.name
    || sourceId(source);
}

function wikipediaSentences(source: EditorialCandidateSource): string[] {
  return (source.enriched.wikipediaBody || source.enriched.wikipediaLead || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 500)
    .slice(0, 12);
}

function evidenceFromSource(source: EditorialCandidateSource, canonicalId: string): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  for (const [key, value] of Object.entries(source.enriched.wikidataClaims ?? {})) {
    if (!value?.trim()) continue;
    facts.push({
      id: `${canonicalId}:wikidata:${key}`,
      source: 'wikidata', sourceId: canonicalId, kind: 'claim',
      value: `${key}: ${value.trim()}`, observable: false,
    });
  }
  wikipediaSentences(source).forEach((sentence, index) => {
    const observable = OBSERVABLE_TEXT.test(sentence);
    facts.push({
      id: `${canonicalId}:wikipedia:${index}`,
      source: 'wikipedia',
      sourceId: source.tags.wikipedia || source.enriched.attribution.wikipedia?.url || canonicalId,
      kind: observable ? 'observable' : 'context', value: sentence, observable,
    });
  });
  for (const [key, value] of Object.entries(source.tags)) {
    if (!value?.trim() || !OBSERVABLE_OSM_KEYS.has(key)) continue;
    facts.push({
      id: `${canonicalId}:osm:${key}`,
      source: 'osm', sourceId: sourceId(source), kind: 'observable',
      value: `${key}: ${value.trim()}`, observable: true,
    });
  }
  return facts;
}

function factKey(fact: EvidenceFact): string {
  return `${fact.source}:${normalize(fact.value)}`;
}

function claimKey(fact: EvidenceFact): string {
  return fact.value.split(':', 1)[0];
}

export function selectEditorialFactPackV4(facts: EvidenceFact[]): EvidenceFact[] {
  const unique = [...new Map(facts.map((fact) => [factKey(fact), fact])).values()];
  const observables = unique.filter((fact) => fact.kind === 'observable');
  const claims = unique.filter((fact) => fact.kind === 'claim').sort((left, right) => (
    Number(HISTORICAL_CLAIMS.has(claimKey(right))) - Number(HISTORICAL_CLAIMS.has(claimKey(left)))
      || left.id.localeCompare(right.id)
  ));
  const contexts = unique.filter((fact) => fact.kind === 'context').sort((left, right) => (
    Number(HISTORICAL_TEXT.test(right.value)) - Number(HISTORICAL_TEXT.test(left.value))
      || left.id.localeCompare(right.id)
  ));
  return [observables[0], claims[0], claims[1], contexts[0], contexts[1]]
    .filter((fact): fact is EvidenceFact => Boolean(fact));
}

export function assessEditorialEvidenceReadinessV4(facts: EvidenceFact[]): EditorialEvidenceReadinessV4 {
  const observableCount = facts.filter((fact) => fact.kind === 'observable').length;
  const contextCount = facts.filter((fact) => fact.kind === 'context').length;
  const historicalSpecificCount = facts.filter((fact) => (
    (fact.kind === 'claim' && HISTORICAL_CLAIMS.has(claimKey(fact)))
      || (fact.kind === 'context' && HISTORICAL_TEXT.test(fact.value))
  )).length;
  const missing: EditorialEvidenceReadinessV4['missing'] = [];
  if (observableCount === 0) missing.push('observable');
  if (contextCount === 0) missing.push('context');
  if (historicalSpecificCount === 0) missing.push('historical_specific');
  return { ready: missing.length === 0, observableCount, contextCount, historicalSpecificCount, missing };
}

export function editorialDistanceMetersV4(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const deltaLat = toRad(right.lat - left.lat);
  const deltaLng = toRad(right.lng - left.lng);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRad(left.lat)) * Math.cos(toRad(right.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 12742000 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function applyVisitConflicts(entities: EditorialEntityCandidateV4[]): EditorialEntityCandidateV4[] {
  const groups: number[][] = [];
  entities.forEach((entity, index) => {
    const group = groups.find((members) => members.every((member) => (
      editorialDistanceMetersV4(entity.coordinates, entities[member].coordinates)
        <= EDITORIAL_VISIT_CONFLICT_METERS_V4
    )));
    if (group) group.push(index);
    else groups.push([index]);
  });
  return entities.map((entity, index) => {
    const group = groups.find((members) => members.includes(index)) as number[];
    if (group.length < 2) return entity;
    const groupId = group.map((item) => entities[item].canonicalId).sort()[0];
    return { ...entity, visitConflictGroup: `visit-conflict:${groupId}` };
  });
}

function applyVisitContextEvidence(entities: EditorialEntityCandidateV4[]): EditorialEntityCandidateV4[] {
  return entities.map((entity) => {
    if (!entity.visitConflictGroup) return entity;
    const colocatedFacts = entities
      .filter((candidate) => candidate.visitConflictGroup === entity.visitConflictGroup
        && editorialDistanceMetersV4(candidate.coordinates, entity.coordinates)
          <= EDITORIAL_CONTEXT_SHARE_METERS_V4)
      .flatMap((candidate) => candidate.evidenceFacts);
    const evidenceFacts = selectEditorialFactPackV4(colocatedFacts);
    return { ...entity, evidenceFacts, readiness: assessEditorialEvidenceReadinessV4(evidenceFacts) };
  });
}

export function buildEditorialEntitiesV4(
  sources: EditorialCandidateSource[],
  language: string
): EditorialEntityCandidateV4[] {
  const grouped = new Map<string, EditorialCandidateSource[]>();
  for (const source of sources) {
    const id = canonicalEntityIdV4(source);
    grouped.set(id, [...(grouped.get(id) ?? []), source]);
  }
  const entities = [...grouped.entries()].map(([canonicalId, members]) => {
    const representative = [...members].sort((left, right) => (
      (right.fameScore ?? 0) - (left.fameScore ?? 0)
        || sourceId(left).localeCompare(sourceId(right))
    ))[0];
    const evidenceFacts = selectEditorialFactPackV4(
      members.flatMap((member) => evidenceFromSource(member, canonicalId))
    );
    const legacyFame = Math.max(...members.map((member) => member.fameScore ?? 0));
    const sitelinks = Math.max(0, ...members.map((member) => member.fame?.sitelinks ?? 0));
    const publicRecognition = Math.log2(sitelinks + 1) * 10;
    return {
      canonicalId,
      siteId: `site:${canonicalId}`,
      sourceIds: members.map(sourceId).sort(),
      localName: localName(representative, language),
      category: classifyPoiTags(representative.tags),
      coordinates: { lat: representative.lat, lng: representative.lng },
      fameScore: legacyFame,
      recognitionScore: Number(Math.min(100, Math.max(legacyFame * 2, publicRecognition)).toFixed(2)),
      baselineScore: legacyFame,
      evidenceFacts,
      readiness: assessEditorialEvidenceReadinessV4(evidenceFacts),
      visitConflictGroup: null,
    } satisfies EditorialEntityCandidateV4;
  }).sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  return applyVisitContextEvidence(applyVisitConflicts(entities));
}
