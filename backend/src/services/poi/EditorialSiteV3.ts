import { EditorialCandidate, EditorialCandidateSource, EvidenceFact } from './EditorialCandidate';

export const EDITORIAL_SITE_SCHEMA_VERSION = 'editorial-site-v3' as const;

export interface EditorialIdentityEntityV3 {
  entityId: string;
  localName: string;
  coordinates: { lat: number; lng: number };
  sourceId: string;
}

export interface EditorialEvidenceReadinessV3 {
  ready: boolean;
  observableCount: number;
  contextCount: number;
  historicalSpecificCount: number;
  missing: Array<'observable' | 'context' | 'historical_specific'>;
}

export interface EditorialSiteCandidateV3 extends EditorialCandidate {
  siteId: string;
  entityIds: string[];
  entities: EditorialIdentityEntityV3[];
  readiness: EditorialEvidenceReadinessV3;
}

const STRUCTURAL_WORDS = new Set([
  'a', 'al', 'castle', 'cathedral', 'catedral', 'de', 'del', 'der', 'el', 'fountain',
  'fuente', 'gate', 'la', 'las', 'los', 'monument', 'monumento', 'of', 'palace', 'palacio',
  'place', 'plaza', 'porte', 'puerta', 'square', 'the', 'tor', 'und', 'y',
]);

const OBSERVABLE_OSM_KEYS = new Set([
  'amenity', 'architect', 'building', 'fountain', 'height', 'heritage', 'historic', 'material',
  'memorial', 'place', 'roof:shape', 'start_date', 'surface',
]);

const HISTORICAL_CLAIMS = new Set([
  'architect', 'architecturalStyle', 'heritageDesignation', 'inception', 'namedAfter',
]);

const HISTORICAL_TEXT = /\b(1[0-9]{3}|20[0-9]{2}|antigu|arquitect|barroc|built|capital|corte|constru|court|fund|histori|medieval|modern|neocl|reform|remodel|rey|siglo|urban)\b/i;
const OBSERVABLE_TEXT = /\b(arcos?|arches?|barrier|carro|checkpoint|clock|columnas?|columns?|c[uú]pula|dome|fachada|facade|fountain|fuente|granite|guardhouse|kontrollbaracke|kontrollpunkt|leones?|marble|m[aá]rmol|piedra|puerta|reloj|relieves?|schild|schranke|sculpture|stone|torre|tower|ventanas?|windows?)\b/i;

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function identityTokens(value: string): Set<string> {
  return new Set(normalize(value).split(' ')
    .filter((token) => token.length >= 4 && !STRUCTURAL_WORDS.has(token)));
}

function identityKind(value: string): string | null {
  const tokens = new Set(normalize(value).split(' '));
  if (tokens.has('plaza') || tokens.has('square') || tokens.has('place')) return 'square';
  if (tokens.has('fuente') || tokens.has('fountain')) return 'fountain';
  if (tokens.has('palacio') || tokens.has('palace')) return 'palace';
  if (tokens.has('catedral') || tokens.has('cathedral')) return 'cathedral';
  if (tokens.has('puerta') || tokens.has('gate') || tokens.has('porte') || tokens.has('tor')) return 'gate';
  return null;
}

export function editorialDistanceMeters(
  left: { lat: number; lng: number },
  right: { lat: number; lng: number }
): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const radius = 6371000;
  const deltaLat = toRad(right.lat - left.lat);
  const deltaLng = toRad(right.lng - left.lng);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(toRad(left.lat)) * Math.cos(toRad(right.lat)) * Math.sin(deltaLng / 2) ** 2;
  return 2 * radius * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function identityTokenJaccard(leftName: string, rightName: string): number {
  const left = identityTokens(leftName);
  const right = identityTokens(rightName);
  const union = new Set([...left, ...right]);
  if (union.size === 0) return normalize(leftName) === normalize(rightName) ? 1 : 0;
  const intersection = [...left].filter((token) => right.has(token)).length;
  return intersection / union.size;
}

export function areSameEditorialIdentityV3(
  left: EditorialIdentityEntityV3,
  right: EditorialIdentityEntityV3
): boolean {
  if (left.entityId === right.entityId) return true;
  const leftKind = identityKind(left.localName);
  const rightKind = identityKind(right.localName);
  if (leftKind && rightKind && leftKind !== rightKind) return false;
  return editorialDistanceMeters(left.coordinates, right.coordinates) <= 40
    && identityTokenJaccard(left.localName, right.localName) >= 0.6;
}

function sourceId(source: EditorialCandidateSource): string {
  return `${source.osmType}:${source.osmId}`;
}

function entityId(source: EditorialCandidateSource): string {
  return source.tags.wikidata || (source.tags.wikipedia ? `wikipedia:${source.tags.wikipedia}` : sourceId(source));
}

function localName(source: EditorialCandidateSource, language: string): string {
  return source.enriched.nameTranslations[language]
    || source.tags[`name:${language}`]
    || source.name
    || source.tags.name
    || sourceId(source);
}

function sharesSiteName(left: string, right: string): boolean {
  const leftTokens = identityTokens(left);
  return [...identityTokens(right)].some((token) => leftTokens.has(token));
}

function belongsToVisitSite(
  candidate: EditorialCandidate,
  source: EditorialCandidateSource,
  language: string
): boolean {
  const id = entityId(source);
  if (candidate.memberCanonicalIds.includes(id)) return true;
  return editorialDistanceMeters(candidate.coordinates, source) <= 150
    && sharesSiteName(candidate.localName, localName(source, language));
}

function wikipediaSentences(source: EditorialCandidateSource): string[] {
  return (source.enriched.wikipediaBody || source.enriched.wikipediaLead || '')
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 500)
    .slice(0, 12);
}

function evidenceFromSource(source: EditorialCandidateSource): EvidenceFact[] {
  const id = entityId(source);
  const facts: EvidenceFact[] = [];
  for (const [key, value] of Object.entries(source.enriched.wikidataClaims ?? {})) {
    if (!value?.trim()) continue;
    facts.push({
      id: `${id}:wikidata:${key}`,
      source: 'wikidata',
      sourceId: id,
      kind: 'claim',
      value: `${key}: ${value.trim()}`,
      observable: false,
    });
  }
  wikipediaSentences(source).forEach((sentence, index) => {
    const observable = OBSERVABLE_TEXT.test(sentence);
    facts.push({
      id: `${id}:wikipedia:${index}`,
      source: 'wikipedia',
      sourceId: source.tags.wikipedia || source.enriched.attribution.wikipedia?.url || id,
      kind: observable ? 'observable' : 'context',
      value: sentence,
      observable,
    });
  });
  for (const [key, value] of Object.entries(source.tags)) {
    if (!value?.trim() || !OBSERVABLE_OSM_KEYS.has(key)) continue;
    facts.push({
      id: `${id}:osm:${key}`,
      source: 'osm',
      sourceId: sourceId(source),
      kind: 'observable',
      value: `${key}: ${value.trim()}`,
      observable: true,
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

export function selectEditorialFactPackV3(facts: EvidenceFact[], limit = 8): EvidenceFact[] {
  const unique = [...new Map(facts.map((fact) => [factKey(fact), fact])).values()];
  const observables = unique.filter((fact) => fact.kind === 'observable');
  const specificClaims = unique.filter((fact) => fact.kind === 'claim' && HISTORICAL_CLAIMS.has(claimKey(fact)));
  const historicalContexts = unique.filter((fact) => fact.kind === 'context' && HISTORICAL_TEXT.test(fact.value));
  const otherContexts = unique.filter((fact) => fact.kind === 'context' && !HISTORICAL_TEXT.test(fact.value));
  const genericClaims = unique.filter((fact) => fact.kind === 'claim' && !HISTORICAL_CLAIMS.has(claimKey(fact)));
  const selected = [
    observables[0],
    historicalContexts[0],
    specificClaims[0],
    specificClaims[1],
    historicalContexts[1],
    observables[1],
    otherContexts[0],
    genericClaims[0],
  ].filter((fact): fact is EvidenceFact => Boolean(fact));
  for (const fact of [...specificClaims, ...historicalContexts, ...observables, ...otherContexts, ...genericClaims]) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item.id === fact.id)) selected.push(fact);
  }
  return selected.slice(0, limit);
}

export function assessEditorialEvidenceReadinessV3(facts: EvidenceFact[]): EditorialEvidenceReadinessV3 {
  const observableCount = facts.filter((fact) => fact.kind === 'observable').length;
  const contextCount = facts.filter((fact) => fact.kind === 'context').length;
  const historicalSpecificCount = facts.filter((fact) => (
    (fact.kind === 'claim' && HISTORICAL_CLAIMS.has(claimKey(fact)))
      || (fact.kind === 'context' && HISTORICAL_TEXT.test(fact.value))
  )).length;
  const missing: EditorialEvidenceReadinessV3['missing'] = [];
  if (observableCount === 0) missing.push('observable');
  if (contextCount === 0) missing.push('context');
  if (historicalSpecificCount === 0) missing.push('historical_specific');
  return { ready: missing.length === 0, observableCount, contextCount, historicalSpecificCount, missing };
}

export function buildEditorialSitesV3(
  candidates: EditorialCandidate[],
  sources: EditorialCandidateSource[],
  language: string
): EditorialSiteCandidateV3[] {
  return candidates.map((candidate) => {
    const members = sources.filter((source) => belongsToVisitSite(candidate, source, language));
    const entities = [...new Map(members.map((source) => {
      const id = entityId(source);
      return [id, {
        entityId: id,
        localName: localName(source, language),
        coordinates: { lat: source.lat, lng: source.lng },
        sourceId: sourceId(source),
      } satisfies EditorialIdentityEntityV3];
    })).values()];
    const entityIds = Array.from(new Set([
      ...candidate.memberCanonicalIds,
      ...entities.map((entity) => entity.entityId),
    ])).sort();
    const evidenceFacts = selectEditorialFactPackV3([
      ...candidate.evidenceFacts,
      ...members.flatMap(evidenceFromSource),
    ]);
    return {
      ...candidate,
      siteId: `site:${candidate.canonicalId}`,
      entityIds,
      entities,
      evidenceFacts,
      readiness: assessEditorialEvidenceReadinessV3(evidenceFacts),
    };
  });
}
