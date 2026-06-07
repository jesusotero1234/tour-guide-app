import { RawPoi } from '../../domain/poi/RawPoi';
import { classifyPoiTags, PoiCategory } from '../../domain/poi/PoiClassification';

export interface ConceptRuleInput {
  poi: RawPoi;
  sitelinks: number;
  instanceOfLabels: string[];
  wikipediaBodyLength: number;
  landmarkTier?: string;
}

const HISTORY_EXCLUDED_INSTANCE_OF_LABELS = new Set([
  'spacecraft',
  'lunar lander',
  'satellite program',
  'artificial satellite',
  'satellite',
  'rocket',
  'space probe',
  'space vehicle',
  'vehicle family',
  'road vehicle',
  'automobile model',
  'aircraft',
  'aerospace vehicle',
  'space launch vehicle',
  'rocket stage',
  'missile',
]);

const ALLOWED_NOTABILITY_HISTORIC_VALUES = new Set(['castle', 'palace', 'manor', 'city_gate', 'citywalls']);
const ALLOWED_NOTABILITY_BUILDINGS = new Set(['cathedral', 'palace', 'castle']);

function normalizeLabel(label: string): string {
  return label.trim().toLowerCase();
}

export function isEligibleForL1({ poi, instanceOfLabels }: ConceptRuleInput, routeType: string): boolean {
  if (!poi.name?.trim()) {
    return false;
  }

  if (typeof poi.lat !== 'number' || typeof poi.lng !== 'number' || Number.isNaN(poi.lat) || Number.isNaN(poi.lng)) {
    return false;
  }

  if (routeType !== 'historical') {
    return true;
  }

  const place = poi.tags.place?.toLowerCase();
  if (place && ['city', 'town', 'village', 'municipality', 'suburb', 'quarter', 'neighbourhood'].includes(place)) {
    return false;
  }

  return !instanceOfLabels.map(normalizeLabel).some((label) => HISTORY_EXCLUDED_INSTANCE_OF_LABELS.has(label));
}

export function isEligibleForL2({ poi, sitelinks }: ConceptRuleInput): boolean {
  const hasNotabilitySignal = Boolean(
    poi.tags.wikidata
    || poi.tags.wikipedia
    || poi.tags.heritage
    || (poi.tags.historic && ALLOWED_NOTABILITY_HISTORIC_VALUES.has(poi.tags.historic))
    || (poi.tags.building && ALLOWED_NOTABILITY_BUILDINGS.has(poi.tags.building))
    || (poi.tags.tourism === 'attraction' && (poi.tags.wikidata || poi.tags.wikipedia || poi.tags.historic || poi.tags.heritage))
  );

  if (!hasNotabilitySignal) {
    return false;
  }

  if (poi.tags.wikidata && sitelinks < 3) {
    return false;
  }

  return true;
}

export function isEligibleForL3({ poi, sitelinks, wikipediaBodyLength, landmarkTier }: ConceptRuleInput): boolean {
  const category = classifyPoiTags(poi.tags);

  return (landmarkTier === 'flagship' || landmarkTier === 'major')
    && sitelinks >= 8
    && wikipediaBodyLength >= 500
    && category !== 'other';
}

export function conceptCategoryMatches(routeType: string, category: PoiCategory): boolean {
  if (routeType === 'royal') return category === 'palace_castle';
  if (routeType === 'religious') return category === 'religious';
  if (routeType === 'markets') return category === 'market' || category === 'square_civic';
  if (routeType === 'art') return category === 'museum' || category === 'artwork';
  return true;
}
