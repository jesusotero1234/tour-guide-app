import axios from 'axios';
import { GeocodedCity } from '../../domain/geocoder/GeocoderTypes';
import { RawPoi } from '../../domain/poi/RawPoi';
import { Theme } from '../../domain/poi/themeTags';
import { getHistoryPlaceProfile } from '../../services/poi/HistoryPlaceScoring';

const USER_AGENT = 'tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)';
const WIKIDATA_SPARQL_ENDPOINT = 'https://query.wikidata.org/sparql';
const MIN_CANONICAL_SITELINKS = 15;
const MAX_CANONICAL_RESULTS = 160;

const NON_PLACE_INSTANCE_PATTERNS = [
  /arson/i,
  /demolition/i,
  /historical event/i,
  /photograph/i,
  /summit/i,
];

const PLACE_INSTANCE_PATTERNS = [
  /architectural landmark/i,
  /barrier/i,
  /border checkpoint/i,
  /building/i,
  /city gate/i,
  /government building/i,
  /memorial/i,
  /monument/i,
  /national symbol/i,
  /palace/i,
  /parliament building/i,
  /public square|square/i,
  /separation barrier/i,
  /tourist attraction/i,
  /war cemetery/i,
];

interface SparqlBindingValue {
  value?: string;
}

interface WikidataCanonicalBinding {
  item?: SparqlBindingValue;
  itemLabel?: SparqlBindingValue;
  coord?: SparqlBindingValue;
  sitelinks?: SparqlBindingValue;
  instanceLabels?: SparqlBindingValue;
}

interface WikidataSparqlResponse {
  results?: {
    bindings?: WikidataCanonicalBinding[];
  };
}

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const toRad = (degrees: number) => degrees * (Math.PI / 180);
  const earthRadiusKm = 6371;
  const deltaLat = toRad(b.lat - a.lat);
  const deltaLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h = Math.sin(deltaLat / 2) ** 2
    + Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLng / 2) ** 2;
  return 2 * earthRadiusKm * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

function getCanonicalSearchRadiusKm(city: GeocodedCity): number {
  const { minLat, maxLat, minLng, maxLng } = city.boundingBox;
  const center = { lat: city.lat, lng: city.lng };
  const corners = [
    { lat: minLat, lng: minLng },
    { lat: minLat, lng: maxLng },
    { lat: maxLat, lng: minLng },
    { lat: maxLat, lng: maxLng },
  ];
  const farthestCornerKm = Math.max(...corners.map((corner) => haversineKm(center, corner)));

  return Math.min(14, Math.max(4, farthestCornerKm * 0.45));
}

function parseWikidataId(uri: string | undefined): string | null {
  const match = uri?.match(/\/entity\/(Q\d+)$/);
  return match?.[1] ?? null;
}

function parsePointWkt(value: string | undefined): { lat: number; lng: number } | null {
  const match = value?.match(/^Point\((-?\d+(?:\.\d+)?) (-?\d+(?:\.\d+)?)\)$/);
  if (!match) {
    return null;
  }

  return {
    lng: Number(match[1]),
    lat: Number(match[2]),
  };
}

function syntheticOsmIdFromWikidataId(wikidataId: string): number {
  const numeric = Number(wikidataId.replace(/^Q/, ''));
  if (Number.isFinite(numeric) && numeric > 0) {
    return -numeric;
  }

  return -Math.abs(Array.from(wikidataId).reduce((hash, char) => ((hash * 31) + char.charCodeAt(0)) | 0, 0));
}

function hasAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some((pattern) => pattern.test(text));
}

function inferCanonicalTags(name: string, instanceLabels: string): Partial<RawPoi['tags']> {
  const haystack = `${name} ${instanceLabels}`.toLowerCase();
  const tags: Partial<RawPoi['tags']> = {
    tourism: 'attraction',
  };

  if (hasAny(haystack, [/city gate|\bgate\b/])) {
    tags.historic = 'city_gate';
  } else if (hasAny(haystack, [/city wall|\bwall\b/])) {
    tags.historic = 'citywalls';
  } else if (hasAny(haystack, [/memorial|war memorial/])) {
    tags.historic = 'memorial';
  } else if (hasAny(haystack, [/monument/])) {
    tags.historic = 'monument';
  } else if (hasAny(haystack, [/palace/]) && !hasAny(haystack, [/palace hotel/])) {
    tags.historic = 'palace';
    tags.building = 'palace';
  } else if (hasAny(haystack, [/castle|citadel|fortress|fortification/])) {
    tags.historic = 'castle';
    tags.building = 'castle';
  } else if (hasAny(haystack, [/archaeological site|ruin/])) {
    tags.historic = 'archaeological_site';
  } else if (hasAny(haystack, [/public square|\bsquare\b|plaza/])) {
    tags.place = 'square';
  } else if (hasAny(haystack, [/government building|parliament|legislative building|senate|congress|assembly|capitol|reichstag|bundestag/])) {
    tags.building = 'government';
  } else if (hasAny(haystack, [/cathedral|church|synagogue|mosque|basilica/])) {
    tags.amenity = 'place_of_worship';
    tags.building = hasAny(haystack, [/cathedral|basilica/]) ? 'cathedral' : 'church';
  } else if (hasAny(haystack, [/museum/])) {
    tags.tourism = 'museum';
  }

  return tags;
}

function isCanonicalHistoryBinding(name: string, instanceLabels: string): boolean {
  const looksLikeNonPlace = hasAny(instanceLabels, NON_PLACE_INSTANCE_PATTERNS);
  const hasPlaceType = hasAny(instanceLabels, PLACE_INSTANCE_PATTERNS);
  if (looksLikeNonPlace && !hasPlaceType) {
    return false;
  }

  const profile = getHistoryPlaceProfile({
    name,
    tags: {
      name,
      'canonical:instance_of': instanceLabels,
      ...inferCanonicalTags(name, instanceLabels),
    },
  });

  return profile.score >= 5;
}

export function canonicalBindingToRawPoi(binding: WikidataCanonicalBinding): RawPoi | null {
  const wikidataId = parseWikidataId(binding.item?.value);
  const coordinates = parsePointWkt(binding.coord?.value);
  const name = binding.itemLabel?.value?.trim();
  const instanceLabels = binding.instanceLabels?.value?.trim() ?? '';
  const sitelinks = Number(binding.sitelinks?.value ?? 0);

  if (!wikidataId || !coordinates || !name || !Number.isFinite(sitelinks)) {
    return null;
  }

  if (sitelinks < MIN_CANONICAL_SITELINKS || !isCanonicalHistoryBinding(name, instanceLabels)) {
    return null;
  }

  return {
    osmType: 'node',
    osmId: syntheticOsmIdFromWikidataId(wikidataId),
    name,
    lat: coordinates.lat,
    lng: coordinates.lng,
    tags: {
      name,
      wikidata: wikidataId,
      'canonical:source': 'wikidata-sparql',
      'canonical:sitelinks': String(sitelinks),
      'canonical:instance_of': instanceLabels,
      ...inferCanonicalTags(name, instanceLabels),
    },
  };
}

export function mergeCanonicalWikidataPois(rawPois: RawPoi[], canonicalPois: RawPoi[]): RawPoi[] {
  const byWikidata = new Map<string, RawPoi>();
  const withoutWikidata: RawPoi[] = [];

  for (const poi of rawPois) {
    const wikidataId = poi.tags.wikidata;
    if (wikidataId) {
      byWikidata.set(wikidataId, poi);
    } else {
      withoutWikidata.push(poi);
    }
  }

  for (const canonicalPoi of canonicalPois) {
    const wikidataId = canonicalPoi.tags.wikidata;
    if (!wikidataId) {
      withoutWikidata.push(canonicalPoi);
      continue;
    }

    const existing = byWikidata.get(wikidataId);
    if (!existing) {
      byWikidata.set(wikidataId, canonicalPoi);
      continue;
    }

    byWikidata.set(wikidataId, {
      ...existing,
      tags: {
        ...canonicalPoi.tags,
        ...existing.tags,
        'canonical:source': canonicalPoi.tags['canonical:source'],
        'canonical:sitelinks': canonicalPoi.tags['canonical:sitelinks'],
        'canonical:instance_of': canonicalPoi.tags['canonical:instance_of'],
      },
    });
  }

  return [...byWikidata.values(), ...withoutWikidata];
}

function buildCanonicalHistoryQuery(city: GeocodedCity, radiusKm: number): string {
  return `
SELECT ?item ?itemLabel ?coord ?sitelinks (GROUP_CONCAT(DISTINCT ?instanceLabel; separator="|") AS ?instanceLabels) WHERE {
  SERVICE wikibase:around {
    ?item wdt:P625 ?coord .
    bd:serviceParam wikibase:center "Point(${city.lng} ${city.lat})"^^geo:wktLiteral .
    bd:serviceParam wikibase:radius "${radiusKm.toFixed(2)}" .
  }
  ?item wikibase:sitelinks ?sitelinks .
  FILTER(?sitelinks >= ${MIN_CANONICAL_SITELINKS})
  OPTIONAL {
    ?item wdt:P31 ?instance .
    ?instance rdfs:label ?instanceLabel .
    FILTER(LANG(?instanceLabel) = "en")
  }
  SERVICE wikibase:label {
    bd:serviceParam wikibase:language "en" .
    ?item rdfs:label ?itemLabel .
  }
}
GROUP BY ?item ?itemLabel ?coord ?sitelinks
ORDER BY DESC(?sitelinks)
LIMIT ${MAX_CANONICAL_RESULTS}`;
}

export async function fetchCanonicalWikidataPois(city: GeocodedCity, theme: Theme): Promise<RawPoi[]> {
  if (theme !== 'history') {
    return [];
  }

  const radiusKm = getCanonicalSearchRadiusKm(city);
  const query = buildCanonicalHistoryQuery(city, radiusKm);

  try {
    const response = await axios.get<WikidataSparqlResponse>(WIKIDATA_SPARQL_ENDPOINT, {
      params: { query, format: 'json' },
      headers: {
        Accept: 'application/sparql-results+json',
        'User-Agent': USER_AGENT,
      },
      timeout: 20000,
    });

    return (response.data.results?.bindings ?? [])
      .map(canonicalBindingToRawPoi)
      .filter((poi): poi is RawPoi => Boolean(poi));
  } catch (error) {
    console.warn('[WikidataCanonicalPoiFetcher] Failed to fetch canonical history POIs:', error);
    return [];
  }
}
