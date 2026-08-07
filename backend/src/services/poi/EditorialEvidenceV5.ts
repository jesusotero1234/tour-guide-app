import { PoiCategory, classifyPoiTags } from '../../domain/poi/PoiClassification';
import { EditorialCandidateSource, EvidenceFact } from './EditorialCandidate';

export const EDITORIAL_EVIDENCE_SCHEMA_VERSION_V5 = 'editorial-evidence-v5' as const;
export const EDITORIAL_VISIT_CONFLICT_METERS_V5 = 100;
export const EDITORIAL_OWN_FACT_LIMIT_V5 = 12;
export const EDITORIAL_ROUTE_FACT_LIMIT_V5 = 4;

const OBSERVABLE_OSM_KEYS = new Set([
  'amenity', 'architect', 'building', 'building:colour', 'fountain', 'height', 'heritage',
  'historic', 'material', 'memorial', 'place', 'roof:shape', 'start_date', 'surface',
]);
const HISTORICAL_CLAIMS = new Set([
  'architect', 'architecturalStyle', 'heritageDesignation', 'inception', 'namedAfter',
]);
const HISTORICAL_TEXT = /\b(1[0-9]{3}|20[0-9]{2}|ancien|antigu|arquitect|barroc|built|capital|caus|constru|court|fund|geschicht|histori|medieval|modern|neocl|reform|remodel|revuelta|rey|si[eè]cle|siglo|transform|urban)\b/i;
const OBSERVABLE_TEXT = /\b(arcos?|arches?|barrier|carro|checkpoint|clock|columnas?|columns?|c[uú]pula|dome|fachada|facade|fountain|fuente|granite|guardhouse|kontrollpunkt|leones?|marble|m[aá]rmol|piedra|puerta|reloj|relieves?|sculpture|stone|torre|tower|ventanas?|windows?)\b/i;
const TOKEN_STOPWORDS = new Set([
  'ante', 'bajo', 'como', 'con', 'construido', 'desde', 'donde', 'entre', 'esta', 'este',
  'junto', 'lugar', 'para', 'plaza', 'sobre', 'tras', 'city', 'from', 'into', 'that', 'the',
  'this', 'where', 'with',
]);

export interface EditorialEvidenceReadinessV5 {
  ready: boolean;
  observableCount: number;
  contextCount: number;
  historicalSpecificCount: number;
  missing: Array<'observable' | 'context' | 'historical_specific'>;
}

export interface EditorialEntityCandidateV5 {
  canonicalId: string;
  siteId: string;
  sourceIds: string[];
  localName: string;
  category: PoiCategory;
  coordinates: { lat: number; lng: number };
  fameScore: number;
  recognitionScore: number;
  evidenceFacts: EvidenceFact[];
  readiness: EditorialEvidenceReadinessV5;
  visitConflictGroup: string | null;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function sourceId(source: EditorialCandidateSource): string {
  return `${source.osmType}:${source.osmId}`;
}

export function canonicalEntityIdV5(source: EditorialCandidateSource): string {
  const wikidata = source.tags.wikidata?.trim();
  return wikidata || `osm:${sourceId(source)}`;
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
  const origin = sourceId(source);
  const facts: EvidenceFact[] = [];
  for (const [key, value] of Object.entries(source.enriched.wikidataClaims ?? {})) {
    if (!value?.trim()) continue;
    facts.push({
      id: `${canonicalId}:${origin}:wikidata:${key}`,
      source: 'wikidata', sourceId: canonicalId, kind: 'claim',
      value: `${key}: ${value.trim()}`, observable: false,
    });
  }
  wikipediaSentences(source).forEach((sentence, index) => {
    const observable = OBSERVABLE_TEXT.test(sentence);
    facts.push({
      id: `${canonicalId}:${origin}:wikipedia:${index}`,
      source: 'wikipedia',
      sourceId: source.tags.wikipedia || source.enriched.attribution.wikipedia?.url || canonicalId,
      kind: observable ? 'observable' : 'context', value: sentence, observable,
    });
  });
  for (const [key, value] of Object.entries(source.tags)) {
    if (!value?.trim() || !OBSERVABLE_OSM_KEYS.has(key)) continue;
    facts.push({
      id: `${canonicalId}:${origin}:osm:${key}`,
      source: 'osm', sourceId: origin, kind: 'observable',
      value: `${key}: ${value.trim()}`, observable: true,
    });
  }
  return facts;
}

function claimKey(fact: EvidenceFact): string {
  return fact.value.split(':', 1)[0];
}

function factKey(fact: EvidenceFact): string {
  return `${fact.source}:${normalize(fact.value)}`;
}

function editorialFactScore(fact: EvidenceFact): number {
  if (fact.kind === 'context') {
    return (HISTORICAL_TEXT.test(fact.value) ? 30 : 10) + (/(?:^|\D)\d{4}(?:\D|$)/.test(fact.value) ? 5 : 0);
  }
  if (fact.kind === 'claim') {
    return (HISTORICAL_CLAIMS.has(claimKey(fact)) ? 25 : 8)
      + (/(?:^|\D)\d{4}(?:\D|$)/.test(fact.value) ? 5 : 0);
  }
  return fact.source === 'wikipedia' ? 22 : 20;
}

export function selectOwnEvidenceFactsV5(facts: EvidenceFact[]): EvidenceFact[] {
  const unique = [...new Map(
    [...facts].sort((left, right) => left.id.localeCompare(right.id))
      .map((fact) => [factKey(fact), fact])
  ).values()];
  return unique.sort((left, right) => (
    editorialFactScore(right) - editorialFactScore(left) || left.id.localeCompare(right.id)
  )).slice(0, EDITORIAL_OWN_FACT_LIMIT_V5);
}

export function assessEditorialEvidenceReadinessV5(facts: EvidenceFact[]): EditorialEvidenceReadinessV5 {
  const observableCount = facts.filter((fact) => fact.kind === 'observable').length;
  const contextCount = facts.filter((fact) => fact.kind === 'context').length;
  const historicalSpecificCount = facts.filter((fact) => (
    (fact.kind === 'claim' && HISTORICAL_CLAIMS.has(claimKey(fact)))
      || (fact.kind === 'context' && HISTORICAL_TEXT.test(fact.value))
  )).length;
  const missing: EditorialEvidenceReadinessV5['missing'] = [];
  if (observableCount === 0) missing.push('observable');
  if (contextCount === 0) missing.push('context');
  if (historicalSpecificCount === 0) missing.push('historical_specific');
  return { ready: missing.length === 0, observableCount, contextCount, historicalSpecificCount, missing };
}

export function editorialDistanceMetersV5(
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

function applyVisitConflicts(entities: EditorialEntityCandidateV5[]): EditorialEntityCandidateV5[] {
  const groups: number[][] = [];
  entities.forEach((entity, index) => {
    const group = groups.find((members) => members.every((member) => (
      editorialDistanceMetersV5(entity.coordinates, entities[member].coordinates)
        <= EDITORIAL_VISIT_CONFLICT_METERS_V5
    )));
    if (group) group.push(index);
    else groups.push([index]);
  });
  return entities.map((entity, index) => {
    const group = groups.find((members) => members.includes(index)) as number[];
    if (group.length < 2) return entity;
    const groupId = group.map((member) => entities[member].canonicalId).sort()[0];
    return { ...entity, visitConflictGroup: `visit-conflict:${groupId}` };
  });
}

export function buildEditorialEntitiesV5(
  sources: EditorialCandidateSource[],
  language: string
): EditorialEntityCandidateV5[] {
  const grouped = new Map<string, EditorialCandidateSource[]>();
  for (const source of sources) {
    const id = canonicalEntityIdV5(source);
    grouped.set(id, [...(grouped.get(id) ?? []), source]);
  }
  const entities = [...grouped.entries()].map(([canonicalId, unsortedMembers]) => {
    const members = [...unsortedMembers].sort((left, right) => sourceId(left).localeCompare(sourceId(right)));
    const representative = [...members].sort((left, right) => (
      (right.fameScore ?? 0) - (left.fameScore ?? 0) || sourceId(left).localeCompare(sourceId(right))
    ))[0];
    const evidenceFacts = selectOwnEvidenceFactsV5(
      members.flatMap((member) => evidenceFromSource(member, canonicalId))
    );
    const fameScore = Math.max(...members.map((member) => member.fameScore ?? 0));
    const sitelinks = Math.max(0, ...members.map((member) => member.fame?.sitelinks ?? 0));
    return {
      canonicalId,
      siteId: `site:${canonicalId}`,
      sourceIds: members.map(sourceId),
      localName: localName(representative, language),
      category: classifyPoiTags(representative.tags),
      coordinates: { lat: representative.lat, lng: representative.lng },
      fameScore,
      recognitionScore: Number(Math.min(100, Math.max(fameScore * 2, Math.log2(sitelinks + 1) * 10)).toFixed(2)),
      evidenceFacts,
      readiness: assessEditorialEvidenceReadinessV5(evidenceFacts),
      visitConflictGroup: null,
    } satisfies EditorialEntityCandidateV5;
  }).sort((left, right) => left.canonicalId.localeCompare(right.canonicalId));
  return applyVisitConflicts(entities);
}

function lexicalTokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ').filter((token) => token.length >= 4 && !TOKEN_STOPWORDS.has(token)));
}

function contextNoveltyScore(fact: EvidenceFact, comparisonTokens: Set<string>): number {
  const tokens = [...lexicalTokens(fact.value)];
  const novel = tokens.filter((token) => !comparisonTokens.has(token)).length;
  return novel * 10 + (HISTORICAL_TEXT.test(fact.value) ? 5 : 0)
    + (/(?:^|\D)\d{4}(?:\D|$)/.test(fact.value) ? 2 : 0);
}

export function selectRouteConditionedFactPackV5(
  entity: EditorialEntityCandidateV5,
  routeEntities: EditorialEntityCandidateV5[]
): EvidenceFact[] {
  const comparisonTokens = new Set(routeEntities
    .filter((candidate) => candidate.canonicalId !== entity.canonicalId)
    .flatMap((candidate) => candidate.evidenceFacts.flatMap((fact) => [...lexicalTokens(fact.value)])));
  const byId = (left: EvidenceFact, right: EvidenceFact) => left.id.localeCompare(right.id);
  const observable = entity.evidenceFacts.filter((fact) => fact.kind === 'observable')
    .sort((left, right) => contextNoveltyScore(right, comparisonTokens)
      - contextNoveltyScore(left, comparisonTokens) || byId(left, right))[0];
  const claim = entity.evidenceFacts.filter((fact) => (
    fact.kind === 'claim' && HISTORICAL_CLAIMS.has(claimKey(fact))
  )).sort((left, right) => editorialFactScore(right) - editorialFactScore(left) || byId(left, right))[0];
  const contexts = entity.evidenceFacts.filter((fact) => fact.kind === 'context')
    .sort((left, right) => contextNoveltyScore(right, comparisonTokens)
      - contextNoveltyScore(left, comparisonTokens) || byId(left, right))
    .slice(0, 2);
  return [observable, claim, ...contexts]
    .filter((fact): fact is EvidenceFact => Boolean(fact))
    .slice(0, EDITORIAL_ROUTE_FACT_LIMIT_V5);
}
