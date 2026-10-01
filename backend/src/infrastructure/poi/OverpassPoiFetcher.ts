import { sourceRecord, sourceEvent, sourceHash } from './SourceAcquisition';
import { requestOverpass, OverpassCoordinatorError } from './OverpassCoordinator';
import { RawPoi } from '../../domain/poi/RawPoi';
import { GeocodedCity } from '../../domain/geocoder/GeocoderTypes';
import { Theme, THEME_TAG_MAP } from '../../domain/poi/themeTags';
import { dedupeByWikidata } from '../../domain/poi/dedupePois';
import { fetchCanonicalWikidataPois, mergeCanonicalWikidataPois } from './WikidataCanonicalPoiFetcher';
import { overpassQueryCache } from './OverpassQueryCache';
import { fetchStaticOsmPois } from './StaticOsmPoiFallback';

// Separate output limits preserve area landmarks when numerous nodes match.
const AREA_FETCH_LIMIT = 120;
const NODE_FETCH_LIMIT = 60;
const PRIORITIZED_POI_TOTAL_LIMIT = 300;
const OVERPASS_QUERY_TIMEOUT_S = 60;

interface OverpassElement {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

interface OverpassResponse {
  elements: OverpassElement[];
  remark?: string;
}

function partitionFiltersByType(filters: string[]): { areaFilters: string[]; nodeFilters: string[] } {
  const areaFilters: string[] = [];
  const nodeFilters: string[] = [];
  for (const filter of filters) {
    if (filter.startsWith('way') || filter.startsWith('relation')) {
      areaFilters.push(filter);
    } else {
      nodeFilters.push(filter);
    }
  }
  return { areaFilters, nodeFilters };
}

/**
 * Builds an Overpass query that emits ways/relations and nodes in separate `out`
 * statements, each with its own limit. This prevents the node flood from starving
 * way/relation landmarks (the iconic ones) out of the result set.
 */
export function buildQuery(city: GeocodedCity, theme: Theme, filters: string[] = THEME_TAG_MAP[theme].unionFilters, areaLimit = AREA_FETCH_LIMIT, nodeLimit = NODE_FETCH_LIMIT): string {
  const { minLat, maxLat, minLng, maxLng } = city.boundingBox;
  const bbox = `${minLat},${minLng},${maxLat},${maxLng}`;
  const { areaFilters, nodeFilters } = partitionFiltersByType(filters);

  const blocks: string[] = [`[out:json][timeout:${OVERPASS_QUERY_TIMEOUT_S}];`];

  if (areaFilters.length > 0) {
    const lines = areaFilters.map(f => `  ${f}(${bbox});`).join('\n');
    blocks.push(`(\n${lines}\n);\nout center tags ${areaLimit};`);
  }
  if (nodeFilters.length > 0) {
    const lines = nodeFilters.map(f => `  ${f}(${bbox});`).join('\n');
    blocks.push(`(\n${lines}\n);\nout center tags ${nodeLimit};`);
  }

  return blocks.join('\n');
}

function isLowValueHistoryPoi(poi: RawPoi): boolean {
  const tags = poi.tags;
  const name = (poi.name || tags.name || '').trim();
  const place = tags.place?.toLowerCase();

  if (!name) return true;
  if (tags.historic === 'aircraft') return true;
  if (place && ['city', 'town', 'village', 'municipality', 'suburb', 'quarter', 'neighbourhood'].includes(place)) return true;

  // Amusement-park rides are often tourism=attraction+wikipedia, but are not
  // useful for a history tour.
  if (tags.attraction || tags.roller_coaster || tags['theme_park']) return true;

  return false;
}

async function fetchPoisForFilters(city: GeocodedCity, theme: Theme, filters: string[], areaLimit = AREA_FETCH_LIMIT, nodeLimit = NODE_FETCH_LIMIT): Promise<RawPoi[]> {
  const query = buildQuery(city, theme, filters, areaLimit, nodeLimit);
  const cityKey = city.wikidataId || `${city.osmType}:${city.osmId}`;
  const queryHash = sourceHash(query);
  const groupIndex = THEME_TAG_MAP[theme].priorityGroups?.indexOf(filters) ?? -1;
  const descriptor = { cityKey, city, theme, group: groupIndex < 0 ? 'general' : groupIndex, filters, query, queryHash, areaLimit, nodeLimit, exhaustive: false };
  let provenance: Record<string, unknown> = {};
  sourceRecord('query-' + queryHash, descriptor);
  try {
    return await overpassQueryCache.getOrFetch(cityKey, query, async () => {
      try {
        const result = await requestOverpass({ cityKey, query, cacheDirectory: overpassQueryCache.directory, ttlMs: overpassQueryCache.ttlMs });
        if (!Array.isArray(result.pois)) throw new Error('Coordinator success is missing POIs');
        provenance = result.provenance ?? {};
        sourceRecord('result-' + queryHash, { ...descriptor, ...provenance,
          status: result.pois.length ? 'complete_under_policy' : 'valid_empty', cacheHit: result.cacheHit });
        return result.pois;
      } catch (error) {
        const failure = error instanceof OverpassCoordinatorError ? error.result : null;
        if (!failure || !['source_recovery_exhausted', 'provider_recovery_exhausted'].includes(failure.type ?? '')) throw error;
        sourceEvent({ event: 'static_osm_fallback_started', ...descriptor, overpassFailure: failure });
        const result = await fetchStaticOsmPois({ city, filters, areaLimit, nodeLimit, queryHash });
        provenance = result.provenance;
        sourceRecord('result-' + queryHash, { ...descriptor, ...provenance,
          status: result.pois.length ? 'complete_under_policy' : 'valid_empty', cacheHit: false });
        sourceEvent({ event: 'static_osm_fallback_completed', ...descriptor, ...provenance });
        return result.pois;
      }
    }, { onHit: entry => sourceRecord('result-' + queryHash, { ...descriptor,
      status: entry.pois.length ? 'complete_under_policy' : 'valid_empty', cacheHit: true,
      fetchedAt: entry.fetchedAt, expiresAt: entry.expiresAt, poiCount: entry.pois.length,
      provenance: entry.provenance ?? { status: 'legacy_cache_provider_not_recorded' } }), provenance: () => provenance });
  } catch (error) {
    const failure = error instanceof OverpassCoordinatorError ? error.result : {
      coordinated: true, status: 'error', type: 'coordinator_unavailable',
      message: error instanceof Error ? error.message : String(error),
    };
    sourceRecord('source-failure', { ...descriptor, ...failure });
    sourceEvent({ event: 'acquisition_deferred_or_failed', ...descriptor, ...failure });
    throw error;
  }
}

export function elementToRawPoi(el: OverpassElement): RawPoi | null {
  const tags = el.tags ?? {};
  const name = tags['name'] ?? '';

  let lat: number;
  let lng: number;

  if (el.type === 'node' && el.lat !== undefined && el.lon !== undefined) {
    lat = el.lat;
    lng = el.lon;
  } else if (el.center) {
    lat = el.center.lat;
    lng = el.center.lon;
  } else {
    return null;
  }

  return {
    osmType: el.type,
    osmId: el.id,
    name,
    lat,
    lng,
    tags: tags as RawPoi['tags'],
  };
}

function exactIdentityFilters(wikidataIds: string[]): string[] {
  const ids = [...new Set(wikidataIds)].sort();
  if (!ids.length) return [];
  if (ids.some(id => !/^Q\d+$/u.test(id))) throw new Error('Invalid protected Wikidata identity');
  const expression = `^(${ids.join('|')})$`;
  return ['node', 'way', 'relation'].map(type => `${type}["wikidata"~"${expression}"]`);
}

function acquisitionPriority(poi: RawPoi, protectedIds: Set<string>): number {
  const tags = poi.tags;
  let score = protectedIds.has(tags.wikidata ?? '') ? 10_000 : 0;
  if (tags.wikidata) score += 20;
  if (tags.wikipedia) score += 18;
  if (tags.wikidata && tags.wikipedia) score += 8;
  if (tags.tourism === 'attraction') score += 12;
  if (tags.tourism === 'museum') score += 6;
  if (tags.heritage) score += 5;
  if (tags.historic && ['castle', 'palace', 'manor', 'city_gate', 'citywalls', 'memorial', 'monument'].includes(tags.historic)) score += 12;
  if (tags.building && ['cathedral', 'palace', 'castle', 'government', 'parliament', 'civic', 'public'].includes(tags.building)) score += 10;
  if (tags.place === 'square') score += 5;
  if (poi.osmType !== 'node') score += 2;
  return score;
}

export async function fetchPoisForTheme(
  city: GeocodedCity,
  theme: Theme,
  protectedWikidataIds: string[] = []
): Promise<RawPoi[]> {
  const priorityGroups = THEME_TAG_MAP[theme].priorityGroups;
  if (!priorityGroups) {
    return fetchPoisForFilters(city, theme, THEME_TAG_MAP[theme].unionFilters);
  }

  // Each priority group is fetched exactly once. The previous round-robin loop
  // re-issued the identical query every round (no pagination/offset), so a group
  // could never yield more than its first page — it only ever marked itself
  // exhausted. A single generous pass per group is equivalent but honest, and the
  // area/node split (see buildQuery) is what actually fixes landmark coverage.
  const protectedIds = new Set(protectedWikidataIds);
  const protectedFilters = exactIdentityFilters(protectedWikidataIds);
  const groups = protectedFilters.length ? [protectedFilters, ...priorityGroups] : priorityGroups;
  const seen = new Set<string>();
  const merged: RawPoi[] = [];
  const completedGroups: number[] = [];

  for (let groupIndex = 0; groupIndex < groups.length; groupIndex++) {
    let pois: RawPoi[];
    try { pois = await fetchPoisForFilters(city, theme, groups[groupIndex]); }
    catch (error) {
      sourceRecord('overpass-manifest', { status: 'unavailable', required: true, city, theme,
        plannedGroups: groups.length, completedGroups, failedGroup: groupIndex, exhaustive: false });
      throw error;
    }
    completedGroups.push(groupIndex);
    for (const poi of pois) {
      if (theme === 'history' && isLowValueHistoryPoi(poi)) continue;
      const key = `${poi.osmType}:${poi.osmId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(poi);
    }
  }

  sourceRecord('overpass-manifest', { status: merged.length ? 'complete_under_policy' : 'valid_empty',
    city, theme, required: true, plannedGroups: groups.length, completedGroups, selectorLimit: PRIORITIZED_POI_TOTAL_LIMIT,
    selectedBeforeWikidataDedupe: merged.length, exhaustive: false,
    stoppedAtSelectorLimit: merged.length >= PRIORITIZED_POI_TOTAL_LIMIT });
  // Collapse multi-element landmarks (same wikidata id) before they reach tiering,
  // so the same place cannot occupy two shortlist slots / two tour stops.
  const uniquePois = dedupeByWikidata(merged);
  const deduped = uniquePois
    .sort((left, right) => acquisitionPriority(right, protectedIds) - acquisitionPriority(left, protectedIds)
      || left.osmType.localeCompare(right.osmType) || left.osmId - right.osmId)
    .slice(0, PRIORITIZED_POI_TOTAL_LIMIT);
  const missingProtected = [...protectedIds].filter(id => !deduped.some(poi => poi.tags.wikidata === id));
  if (missingProtected.length) {
    throw new Error(`protected_identity_missing_from_map: ${missingProtected.join(', ')}`);
  }
  const collapsed = merged.length - uniquePois.length;
  const canonicalPois = theme === 'history'
    ? await fetchCanonicalWikidataPois(city, theme)
    : [];
  const withCanonicalPois = canonicalPois.length > 0
    ? mergeCanonicalWikidataPois(deduped, canonicalPois)
    : deduped;
  console.log(`[OverpassPoiFetcher] Fetched ${withCanonicalPois.length} prioritized ${theme} POIs` +
    (collapsed > 0 ? ` (collapsed ${collapsed} wikidata duplicates)` : ''));
  return withCanonicalPois;
}
