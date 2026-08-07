import { EnrichedPoi } from '../../domain/poi/EnrichedPoi';
import { PoiCategory, classifyPoiTags } from '../../domain/poi/PoiClassification';
import { getHistoryPlaceProfile } from './HistoryPlaceScoring';
import { LandmarkTier } from './LandmarkTiering';

export type NarrativeRole =
  | 'opening'
  | 'origins'
  | 'power'
  | 'public-life'
  | 'belief'
  | 'conflict'
  | 'transformation'
  | 'modern-city'
  | 'resolution';

export type EditorialTier = 'essential' | 'strong' | 'supporting' | 'rejected';

export interface EvidenceFact {
  id: string;
  source: 'wikidata' | 'wikipedia' | 'osm';
  sourceId: string;
  kind: 'claim' | 'context' | 'observable';
  value: string;
  observable: boolean;
}

export interface EditorialCandidate {
  canonicalId: string;
  clusterId: string;
  memberCanonicalIds: string[];
  localName: string;
  category: PoiCategory;
  coordinates: { lat: number; lng: number };
  fameScore: number;
  themeScore: number;
  firstVisitScore: number;
  evidenceScore: number;
  observableScore: number;
  tier: Exclude<EditorialTier, 'rejected'>;
  eligibleRoles: NarrativeRole[];
  evidenceFacts: EvidenceFact[];
}

export type EditorialCandidateRejectionReason =
  | 'missing_canonical_identity'
  | 'insufficient_evidence'
  | 'missing_observable_evidence'
  | 'off_theme'
  | 'remote';

export interface EditorialCandidateRejection {
  sourceId: string;
  localName: string;
  reason: EditorialCandidateRejectionReason;
}

export interface EditorialCandidateSet {
  candidates: EditorialCandidate[];
  rejected: EditorialCandidateRejection[];
}

export interface EditorialCandidateSource extends EnrichedPoi {
  fame?: { sitelinks: number };
  fameScore?: number;
  landmarkTier?: LandmarkTier;
  score?: number;
}

interface CandidateRecord {
  source: EditorialCandidateSource;
  canonicalId: string;
  localName: string;
  category: PoiCategory;
  fameScore: number;
  themeScore: number;
  firstVisitScore: number;
  originSignalCount: number;
  facts: EvidenceFact[];
  isArchaeologicalSite: boolean;
  isCityGate: boolean;
  isOffTheme: boolean;
}

export interface EditorialCandidateSetOptions {
  theme: string;
  language: string;
  requestedDuration?: number;
  cityCenter?: { lat: number; lng: number };
  maxDistanceFromCenterMeters?: number;
}

const STRUCTURAL_NAME_WORDS = new Set([
  'a', 'al', 'castle', 'cathedral', 'catedral', 'de', 'del', 'der', 'des', 'el', 'fountain',
  'fuente', 'gate', 'la', 'las', 'le', 'los', 'monument', 'monumento', 'of', 'palace', 'palacio',
  'place', 'plaza', 'porte', 'puerta', 'square', 'the', 'tor', 'und', 'von', 'y',
]);

const OBSERVABLE_OSM_KEYS = new Set([
  'amenity',
  'architect',
  'building',
  'building:colour',
  'fountain',
  'height',
  'heritage',
  'highway',
  'historic',
  'material',
  'memorial',
  'place',
  'roof:shape',
  'start_date',
  'surface',
]);

const OBSERVABLE_TEXT = /\b(arco|arcos|arch|arches|barrier|cabina|carro|checkpoint|clock|columna|columnas|column|columns|c[uú]pula|dome|fachada|facade|façade|granito|granite|guardhouse|kontrollbaracke|le[oó]n|leones|marble|m[aá]rmol|piedra|puerta|reloj|relieve|relieves|schild|schranke|sculpture|sign|stone|torre|tower|ventana|window)\b/i;

const ORIGIN_SIGNALS = [
  /\bcasco historico\b/,
  /\bhistoric (?:centre|center|core)\b/,
  /\bedad media\b|\bmiddle ages\b/,
  /\bmedieval\b/,
  /\bmas antigu[oa]\b|\boldest\b/,
  /\borigen(?:es)?\b|\borigin(?:s)?\b/,
  /\bprimitiv[oa]\b|\bearliest\b/,
];

function clampScore(value: number): number {
  return Number(Math.max(0, Math.min(100, value)).toFixed(2));
}

function normalizeText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function getCanonicalId(source: EditorialCandidateSource): string | null {
  const wikidataId = source.tags.wikidata?.trim();
  if (wikidataId) {
    return wikidataId;
  }

  const wikipedia = source.tags.wikipedia?.trim();
  return wikipedia ? `wikipedia:${wikipedia}` : null;
}

function getSourceId(source: EditorialCandidateSource): string {
  return `${source.osmType}:${source.osmId}`;
}

function getLocalName(source: EditorialCandidateSource, language: string): string {
  return source.enriched.nameTranslations[language]
    || source.tags[`name:${language}`]
    || source.name
    || source.tags.name
    || getSourceId(source);
}

function getIdentityTokens(name: string): Set<string> {
  return new Set(normalizeText(name)
    .split(' ')
    .filter((token) => token.length >= 4 && !STRUCTURAL_NAME_WORDS.has(token)));
}

function distanceMeters(left: { lat: number; lng: number }, right: { lat: number; lng: number }): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusMeters = 6371000;
  const deltaLat = toRad(right.lat - left.lat);
  const deltaLng = toRad(right.lng - left.lng);
  const lat1 = toRad(left.lat);
  const lat2 = toRad(right.lat);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusMeters * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function median(values: number[]): number {
  const sorted = [...values].sort((left, right) => left - right);
  return sorted[Math.floor(sorted.length / 2)];
}

export function resolveEditorialCityCenter(
  sources: EditorialCandidateSource[],
  geocodedCenter?: { lat: number; lng: number }
): { lat: number; lng: number } | undefined {
  const notable = [...sources]
    .filter((source) => Number.isFinite(source.lat) && Number.isFinite(source.lng))
    .sort((left, right) => (right.fameScore ?? 0) - (left.fameScore ?? 0))
    .slice(0, 20);
  if (notable.length === 0) {
    return geocodedCenter;
  }

  const landmarkCenter = {
    lat: median(notable.map((source) => source.lat)),
    lng: median(notable.map((source) => source.lng)),
  };
  if (geocodedCenter && distanceMeters(geocodedCenter, landmarkCenter) <= 2500) {
    return geocodedCenter;
  }
  return landmarkCenter;
}

function belongsToSameCluster(left: CandidateRecord, right: CandidateRecord): boolean {
  if (left.canonicalId === right.canonicalId) {
    return true;
  }

  const separationMeters = distanceMeters(left.source, right.source);
  if (separationMeters <= 40) {
    return true;
  }
  if (separationMeters > 180) {
    return false;
  }

  const leftTokens = getIdentityTokens(left.localName);
  return Array.from(getIdentityTokens(right.localName)).some((token) => leftTokens.has(token));
}

function getEligibleRoles(source: EditorialCandidateSource, category: PoiCategory): NarrativeRole[] {
  if (category === 'square_civic' || category === 'market') {
    return ['opening', 'public-life', 'transformation', 'modern-city', 'resolution'];
  }
  if (category === 'palace_castle' || category === 'civic_power') {
    return ['origins', 'power', 'conflict', 'transformation'];
  }
  if (category === 'religious') {
    return ['origins', 'belief', 'transformation'];
  }
  if (category === 'memorial') {
    return ['conflict', 'transformation', 'resolution'];
  }
  if (source.tags.historic === 'city_gate') {
    return ['origins', 'transformation', 'modern-city', 'resolution'];
  }
  return ['transformation', 'modern-city'];
}

export function calculateFirstVisitScore(
  source: EditorialCandidateSource,
  category: PoiCategory,
  fameScore: number,
  historyScore: number
): number {
  let score = Math.min(55, (fameScore / 35) * 55);
  if (source.landmarkTier === 'flagship') score += 20;
  else if (source.landmarkTier === 'major') score += 10;
  else if (source.landmarkTier === 'supporting') score += 4;

  if (category === 'palace_castle' || category === 'square_civic') score += 8;
  else if (category === 'religious' || category === 'civic_power') score += 6;
  else if (category === 'market' || category === 'memorial') score += 4;

  if (source.tags.building === 'cathedral') score += 10;
  if (source.tags.historic === 'city_gate') score += 8;
  if (source.tags.tourism === 'attraction') score += 4;
  score += Math.min(5, Math.max(0, historyScore) * 0.2);
  return clampScore(score);
}

function wikipediaSentences(source: EditorialCandidateSource): string[] {
  const text = source.enriched.wikipediaBody || source.enriched.wikipediaLead || '';
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.replace(/\s+/g, ' ').trim())
    .filter((sentence) => sentence.length >= 30 && sentence.length <= 500)
    .slice(0, 8);
}

function buildEvidenceFacts(source: EditorialCandidateSource, canonicalId: string): EvidenceFact[] {
  const facts: EvidenceFact[] = [];
  const sourceId = getSourceId(source);

  for (const [key, value] of Object.entries(source.enriched.wikidataClaims ?? {})) {
    if (!value?.trim()) continue;
    facts.push({
      id: `${canonicalId}:wikidata:${key}`,
      source: 'wikidata',
      sourceId: canonicalId,
      kind: 'claim',
      value: `${key}: ${value.trim()}`,
      observable: false,
    });
  }

  wikipediaSentences(source).forEach((sentence, index) => {
    const observable = OBSERVABLE_TEXT.test(sentence);
    facts.push({
      id: `${canonicalId}:wikipedia:${index}`,
      source: 'wikipedia',
      sourceId: source.tags.wikipedia || canonicalId,
      kind: observable ? 'observable' : 'context',
      value: sentence,
      observable,
    });
  });

  for (const [key, value] of Object.entries(source.tags)) {
    if (!value?.trim() || !OBSERVABLE_OSM_KEYS.has(key)) continue;
    facts.push({
      id: `${canonicalId}:osm:${key}`,
      source: 'osm',
      sourceId,
      kind: 'observable',
      value: `${key}: ${value.trim()}`,
      observable: true,
    });
  }

  return facts;
}

function deduplicateFacts(facts: EvidenceFact[]): EvidenceFact[] {
  const unique = new Map<string, EvidenceFact>();
  for (const fact of facts) {
    const key = `${fact.source}:${normalizeText(fact.value)}`;
    if (!unique.has(key)) {
      unique.set(key, fact);
    }
  }
  return Array.from(unique.values());
}

function buildRecord(source: EditorialCandidateSource, canonicalId: string, language: string, theme: string): CandidateRecord {
  const category = classifyPoiTags(source.tags);
  const historyProfile = getHistoryPlaceProfile(source);
  const fameScore = source.fameScore ?? 0;
  const themeScore = theme === 'history' ? clampScore(historyProfile.score * 4) : 50;
  const facts = buildEvidenceFacts(source, canonicalId);
  const normalizedEvidence = normalizeText(facts.map((fact) => fact.value).join(' '));
  return {
    source,
    canonicalId,
    localName: getLocalName(source, language),
    category,
    fameScore,
    themeScore,
    firstVisitScore: calculateFirstVisitScore(source, category, fameScore, historyProfile.score),
    originSignalCount: ORIGIN_SIGNALS.filter((pattern) => pattern.test(normalizedEvidence)).length,
    facts,
    isArchaeologicalSite: source.tags.historic === 'archaeological_site',
    isCityGate: source.tags.historic === 'city_gate',
    isOffTheme: theme === 'history'
      && historyProfile.isMuseumLike
      && !historyProfile.isEventSiteLike,
  };
}

function buildClusters(records: CandidateRecord[]): CandidateRecord[][] {
  const clusters: CandidateRecord[][] = [];

  for (const record of records) {
    const matchingIndexes = clusters
      .map((cluster, index) => cluster.some((member) => belongsToSameCluster(member, record)) ? index : -1)
      .filter((index) => index >= 0);

    if (matchingIndexes.length === 0) {
      clusters.push([record]);
      continue;
    }

    const target = matchingIndexes[0];
    clusters[target].push(record);
    for (const index of matchingIndexes.slice(1).sort((left, right) => right - left)) {
      clusters[target].push(...clusters[index]);
      clusters.splice(index, 1);
    }
  }

  return clusters;
}

function editorialTier(firstVisitScore: number): Exclude<EditorialTier, 'rejected'> {
  if (firstVisitScore >= 82) return 'essential';
  if (firstVisitScore >= 50) return 'strong';
  return 'supporting';
}

function compareRecords(left: CandidateRecord, right: CandidateRecord): number {
  if (right.firstVisitScore !== left.firstVisitScore) return right.firstVisitScore - left.firstVisitScore;
  if (right.fameScore !== left.fameScore) return right.fameScore - left.fameScore;
  return left.canonicalId.localeCompare(right.canonicalId);
}

export function buildEditorialCandidateSet(
  sources: EditorialCandidateSource[],
  options: EditorialCandidateSetOptions
): EditorialCandidateSet {
  const rejected: EditorialCandidateRejection[] = [];
  const records: CandidateRecord[] = [];
  const archaeologicalCandidateIds = new Set<string>();
  const cityGateCandidateIds = new Set<string>();

  for (const source of sources) {
    const canonicalId = getCanonicalId(source);
    if (!canonicalId) {
      rejected.push({
        sourceId: getSourceId(source),
        localName: getLocalName(source, options.language),
        reason: 'missing_canonical_identity',
      });
      continue;
    }
    records.push(buildRecord(source, canonicalId, options.language, options.theme));
  }

  const candidates: EditorialCandidate[] = [];
  for (const cluster of buildClusters(records)) {
    const representative = [...cluster].sort(compareRecords)[0];
    const facts = deduplicateFacts(cluster.flatMap((member) => member.facts));
    const observableFacts = facts.filter((fact) => fact.observable);
    const memberCanonicalIds = Array.from(new Set(cluster.map((member) => member.canonicalId))).sort();
    const clusterId = memberCanonicalIds.length === 1
      ? memberCanonicalIds[0]
      : `cluster:${memberCanonicalIds.join('+')}`;
    let rejectionReason: EditorialCandidateRejectionReason | null = null;
    const isRemote = options.cityCenter && options.maxDistanceFromCenterMeters
      ? cluster.every((member) => (
        distanceMeters(member.source, options.cityCenter as { lat: number; lng: number })
          > (options.maxDistanceFromCenterMeters as number)
      ))
      : false;
    if (isRemote) rejectionReason = 'remote';
    else if (cluster.every((member) => member.isOffTheme)) rejectionReason = 'off_theme';
    else if (facts.length < 4) rejectionReason = 'insufficient_evidence';
    else if (observableFacts.length === 0) rejectionReason = 'missing_observable_evidence';

    if (rejectionReason) {
      rejected.push({
        sourceId: clusterId,
        localName: representative.localName,
        reason: rejectionReason,
      });
      continue;
    }

    const eligibleRoles = Array.from(new Set(cluster.flatMap((member) => (
      getEligibleRoles(member.source, member.category)
    ))));
    const sourcesPresent = new Set(facts.map((fact) => fact.source)).size;
    candidates.push({
      canonicalId: representative.canonicalId,
      clusterId,
      memberCanonicalIds,
      localName: representative.localName,
      category: representative.category,
      coordinates: { lat: representative.source.lat, lng: representative.source.lng },
      fameScore: Number(representative.fameScore.toFixed(2)),
      themeScore: Math.max(...cluster.map((member) => member.themeScore)),
      firstVisitScore: representative.firstVisitScore,
      evidenceScore: clampScore((facts.length * 8) + (sourcesPresent * 8)),
      observableScore: clampScore((observableFacts.length / facts.length) * 100),
      tier: editorialTier(representative.firstVisitScore),
      eligibleRoles,
      evidenceFacts: facts,
    });

    const candidate = candidates[candidates.length - 1];
    if (cluster.some((member) => member.isArchaeologicalSite)) {
      archaeologicalCandidateIds.add(candidate.canonicalId);
    }
    if (cluster.some((member) => member.isCityGate)) {
      cityGateCandidateIds.add(candidate.canonicalId);
    }
    if (
      (candidate.category === 'square_civic' && cluster.length > 1 && candidate.firstVisitScore >= 70)
      || (Math.max(...cluster.map((member) => member.originSignalCount)) >= 5 && candidate.firstVisitScore >= 50)
    ) {
      candidate.tier = 'essential';
    }
  }

  if ((options.requestedDuration ?? 0) >= 90) {
    const mainArchaeologicalCandidate = candidates
      .filter((candidate) => (
        archaeologicalCandidateIds.has(candidate.canonicalId)
          && candidate.firstVisitScore >= 50
      ))
      .sort((left, right) => right.firstVisitScore - left.firstVisitScore)[0];
    if (mainArchaeologicalCandidate) {
      mainArchaeologicalCandidate.tier = 'essential';
    }

    const mainCityGateCandidate = candidates
      .filter((candidate) => cityGateCandidateIds.has(candidate.canonicalId))
      .sort((left, right) => right.firstVisitScore - left.firstVisitScore)[0];
    if (mainCityGateCandidate) {
      mainCityGateCandidate.tier = 'essential';
    }

    const mainReligiousCandidate = candidates
      .filter((candidate) => candidate.category === 'religious')
      .sort((left, right) => right.firstVisitScore - left.firstVisitScore)[0];
    if (mainReligiousCandidate) {
      mainReligiousCandidate.tier = 'essential';
    }

  }

  const tierOrder: Record<EditorialCandidate['tier'], number> = { essential: 0, strong: 1, supporting: 2 };
  candidates.sort((left, right) => (
    tierOrder[left.tier] - tierOrder[right.tier]
    || right.firstVisitScore - left.firstVisitScore
    || right.evidenceScore - left.evidenceScore
    || left.canonicalId.localeCompare(right.canonicalId)
  ));

  return { candidates, rejected };
}
