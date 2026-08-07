import { RawPoi } from '../../domain/poi/RawPoi';
import { classifyPoiTags } from '../../domain/poi/PoiClassification';

export interface HistoryPlaceProfile {
  score: number;
  kinds: string[];
  isEventSiteLike: boolean;
  isMuseumLike: boolean;
}

function normalizeText(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function addKind(kinds: Set<string>, condition: boolean, kind: string): void {
  if (condition) {
    kinds.add(kind);
  }
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

const EVENT_SITE_NAME_PATTERNS = [
  /\b(gate|city gate|wall|bridge|old town hall|town hall|checkpoint|memorial|monument|parliament|senate|congress|assembly|capitol|citadel|fortress|fort|castle|palace|square|plaza|battlefield|prison|ruins?)\b/i,
  /\b(reichstag|bundestag|bundesrat|parlement|parlamento|parlamento|senado|senat|assembl[eé]e|cortes|corte|congreso)\b/i,
  /\b(muro|puerta|puente|memorial|monumento|palacio|castillo|plaza|fortaleza|parlamento|congreso|senado)\b/i,
  /\b(mur|porte|pont|m[ée]morial|monument|palais|ch[âa]teau|place|forteresse|parlement|s[ée]nat)\b/i,
  /\b(mauer|tor|br[üu]cke|gedenk|denkmal|schloss|burg|platz|festung|parlament|reichstag|bundestag)\b/i,
  /\b(muro|porta|ponte|memoriale|monumento|palazzo|castello|piazza|fortezza|parlamento|senato)\b/i,
  /\b(most|radnice|orloj)\b/i,
];

const EVENT_SITE_LABEL_PATTERNS = [
  /archaeological site/i,
  /battlefield/i,
  /bridge/i,
  /city gate|gate/i,
  /city wall|wall/i,
  /checkpoint/i,
  /fortification|fortress|citadel|fort\b/i,
  /government building|parliament|legislative building|senate|capitol|congress|assembly/i,
  /town hall|city hall|clock tower|astronomical clock/i,
  /historic site|historic district/i,
  /memorial|monument|war memorial/i,
  /palace|castle/i,
  /public square|plaza|square/i,
  /prison/i,
  /ruin/i,
];

const STRONG_MUSEUM_SITE_CONTEXT_LABEL_PATTERNS = [
  /archaeological site/i,
  /battlefield/i,
  /bridge/i,
  /city gate|gate/i,
  /city wall|wall/i,
  /checkpoint/i,
  /fortification|fortress|citadel|fort\b/i,
  /government building|parliament|legislative building|senate|capitol|congress|assembly/i,
  /town hall|city hall|clock tower|astronomical clock/i,
  /historic house/i,
  /historic site|historic district/i,
  /palace|castle/i,
  /public square|plaza|square/i,
  /prison/i,
  /ruin/i,
  /war memorial|cautionary memorial/i,
];

const MUSEUM_LABEL_PATTERNS = [
  /museum/i,
  /art gallery/i,
];

const MUSEUM_NAME_PATTERNS = [
  /\bmuseum\b/i,
  /\bmuseo\b/i,
  /\bmusée\b/i,
  /\bmuseu\b/i,
  /\bmuseo\b/i,
];

export function getHistoryPlaceProfile(poi: Pick<RawPoi, 'name' | 'tags'>): HistoryPlaceProfile {
  const tags = poi.tags;
  const category = classifyPoiTags(tags);
  const name = normalizeText(poi.name || tags.name);
  const historic = normalizeText(tags.historic);
  const building = normalizeText(tags.building);
  const tourism = normalizeText(tags.tourism);
  const amenity = normalizeText(tags.amenity);
  const place = normalizeText(tags.place);
  const bridge = normalizeText(tags.bridge);
  const manMade = normalizeText(tags.man_made);
  const memorial = normalizeText(tags.memorial);
  const instanceLabels = normalizeText(tags['canonical:instance_of']);
  const description = normalizeText(tags.description || tags['description:en'] || tags['description:de'] || tags['description:es']);
  const oldName = normalizeText(tags.old_name);
  const combinedText = [name, historic, building, tourism, amenity, place, bridge, manMade, memorial, instanceLabels, description].join(' ');
  const kinds = new Set<string>();
  let score = 0;

  const isMuseumLike = tourism === 'museum' || hasAny(instanceLabels, MUSEUM_LABEL_PATTERNS);
  const hasMuseumName = hasAny(name, MUSEUM_NAME_PATTERNS);
  const hasEventName = hasAny(name, EVENT_SITE_NAME_PATTERNS);
  const hasEventLabel = hasAny(instanceLabels, EVENT_SITE_LABEL_PATTERNS);
  const hasStrongMuseumSiteContextLabel = hasAny(instanceLabels, STRONG_MUSEUM_SITE_CONTEXT_LABEL_PATTERNS);
  const hasEventDescription = hasAny(description, [
    /war|battle|revolution|uprising|dictatorship|occupation|independence|reunification|border|wall|checkpoint/i,
    /guerra|batalla|revoluci[oó]n|levantamiento|dictadura|ocupaci[oó]n|independencia|frontera|muro/i,
    /krieg|schlacht|revolution|aufstand|diktatur|besatzung|wiedervereinigung|grenze|mauer/i,
  ]);
  const isRepurposedHistoricBuilding = isMuseumLike
    && Boolean(oldName && tags.start_date && tags.heritage);

  if (historic) {
    score += 2;
    kinds.add('historic-tagged');
  }

  if (['city_gate', 'citywalls', 'battlefield', 'archaeological_site', 'fort', 'fortress', 'ruins'].includes(historic)) {
    score += 6;
    kinds.add('event-place');
  }

  if (bridge || manMade === 'bridge' || hasAny(combinedText, [/\bbridge\b/i, /\bpuente\b/i, /\bpont\b/i, /\bbr[üu]cke\b/i, /\bponte\b/i, /\bmost\b/i])) {
    score += 6;
    kinds.add('event-place');
  }

  if (['memorial', 'monument'].includes(historic) || memorial) {
    score += 5;
    kinds.add('memory-site');
  }

  if (['castle', 'palace', 'manor'].includes(historic) || ['castle', 'palace'].includes(building)) {
    score += 4;
    kinds.add('power-site');
  }

  if (place === 'square' || category === 'square_civic') {
    score += 4;
    kinds.add('public-square');
  }

  if (['government', 'public', 'civic', 'parliament'].includes(building) || ['townhall', 'courthouse'].includes(amenity)) {
    score += 5;
    kinds.add('civic-power-site');
  }

  if (tourism === 'attraction' && (historic || hasEventName || hasEventLabel)) {
    score += 3;
    kinds.add('walkable-landmark');
  }

  if (hasEventName) {
    score += 3;
    kinds.add('event-name');
  }

  if (hasEventLabel) {
    score += 4;
    kinds.add('event-type');
  }

  if (hasEventDescription) {
    score += 2;
    kinds.add('event-description');
  }

  if (isRepurposedHistoricBuilding) {
    score += 6;
    kinds.add('repurposed-historic-building');
  }

  if (category === 'religious' && (tags.heritage || historic || hasEventLabel)) {
    score += 1.5;
    kinds.add('heritage-religious');
  }

  const hasStrongMuseumSiteContext = kinds.has('event-place')
    || kinds.has('power-site')
    || kinds.has('civic-power-site')
    || kinds.has('public-square')
    || kinds.has('event-description')
    || kinds.has('repurposed-historic-building')
    || hasStrongMuseumSiteContextLabel
    || (hasEventName && !hasMuseumName);

  if (isMuseumLike && !hasStrongMuseumSiteContext) {
    score -= 6;
    kinds.add('museum-container');
  } else if (isMuseumLike) {
    score -= 1;
    kinds.add('museum-with-site-context');
  }

  const canonicalSitelinks = Number(tags['canonical:sitelinks'] || 0);
  if (Number.isFinite(canonicalSitelinks) && canonicalSitelinks > 0) {
    score += Math.min(4, Math.log2(canonicalSitelinks + 1) / 2);
    kinds.add('wikidata-canonical');
  }

  addKind(kinds, Boolean(tags.wikidata), 'wikidata');
  addKind(kinds, Boolean(tags.wikipedia), 'wikipedia');

  const isEventSiteLike = score >= 5
    && !kinds.has('museum-container')
    && (!isMuseumLike || hasStrongMuseumSiteContext);
  return {
    score: Number(score.toFixed(2)),
    kinds: Array.from(kinds),
    isEventSiteLike,
    isMuseumLike,
  };
}
