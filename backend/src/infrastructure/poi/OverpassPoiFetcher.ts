import axios, { AxiosError } from 'axios';
import { RawPoi } from '../../domain/poi/RawPoi';
import { GeocodedCity } from '../../domain/geocoder/GeocoderTypes';
import { Theme, THEME_TAG_MAP } from '../../domain/poi/themeTags';
import { dedupeByWikidata } from '../../domain/poi/dedupePois';
import { fetchCanonicalWikidataPois, mergeCanonicalWikidataPois } from './WikidataCanonicalPoiFetcher';

const USER_AGENT = 'tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)';
const OVERPASS_BASE = 'https://overpass-api.de/api/interpreter';
const MIN_INTERVAL_MS = 3000;
// Overpass emits elements in type order (node -> way -> relation). Iconic landmarks
// are almost always ways/relations (geometries), while nodes are dominated by statues,
// markers, and bus stops. A single shared cap lets the node flood truncate the query
// before any relation is emitted, so we give areas (way/relation) their own generous
// budget separate from nodes. See diagnose-shortlist.ts for the evidence.
const AREA_FETCH_LIMIT = 120;
const NODE_FETCH_LIMIT = 60;
const PRIORITIZED_POI_TOTAL_LIMIT = 300;
const MAX_FETCH_RETRIES = 3;
const OVERPASS_QUERY_TIMEOUT_S = 60;

let lastRequestTime = 0;

async function enforceRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise(resolve => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestTime = Date.now();
}

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
function buildQuery(city: GeocodedCity, theme: Theme, filters: string[] = THEME_TAG_MAP[theme].unionFilters, areaLimit = AREA_FETCH_LIMIT, nodeLimit = NODE_FETCH_LIMIT): string {
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

  for (let attempt = 0; attempt <= MAX_FETCH_RETRIES; attempt++) {
    await enforceRateLimit();

    try {
      const response = await axios.post<OverpassResponse>(OVERPASS_BASE, query, {
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'text/plain',
        },
        timeout: (OVERPASS_QUERY_TIMEOUT_S + 10) * 1000,
      });

      return (response.data?.elements ?? [])
        .map(elementToRawPoi)
        .filter((p): p is RawPoi => p !== null);
    } catch (err) {
      const axiosErr = err as AxiosError;
      const status = axiosErr.response?.status;
      // 429 (rate limit), 504/502/503 (gateway/overload), and network errors are
      // transient: a dropped group silently shrinks the candidate pool and changes
      // results run-to-run, so retry with backoff before giving up.
      const retriable = !axiosErr.response || status === 429 || status === 502 || status === 503 || status === 504;

      if (retriable && attempt < MAX_FETCH_RETRIES) {
        // On 429, respect Retry-After header if present; otherwise exponential backoff.
        // Retry-After can be seconds (integer) or HTTP-date (RFC 7231).
        let backoffMs = MIN_INTERVAL_MS * Math.pow(2, attempt);
        let minBackoffMs = 0;
        if (status === 429) {
          const retryAfter = axiosErr.response?.headers?.['retry-after'];
          if (retryAfter) {
            const asSeconds = parseInt(retryAfter, 10);
            if (!isNaN(asSeconds)) {
              minBackoffMs = asSeconds * 1000;
            } else {
              const asDate = Date.parse(retryAfter);
              if (!isNaN(asDate)) {
                minBackoffMs = Math.max(0, asDate - Date.now());
              }
            }
            backoffMs = Math.max(backoffMs, minBackoffMs);
          }
        }
        // Jitter (+0-20%) but never drop below Retry-After minimum
        const jitter = backoffMs * (1.0 + Math.random() * 0.2);
        const waitMs = Math.max(Math.round(jitter), minBackoffMs);
        console.warn(`[OverpassPoiFetcher] ${status ?? 'network'} error; retrying in ${waitMs}ms (attempt ${attempt + 1}/${MAX_FETCH_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, waitMs));
        continue;
      }

      console.error(`[OverpassPoiFetcher] Giving up after ${attempt + 1} attempt(s): ${status ? `server error ${status}` : `network error ${axiosErr.message}`}`);
      return [];
    }
  }

  return [];
}

function elementToRawPoi(el: OverpassElement): RawPoi | null {
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

export async function fetchPoisForTheme(city: GeocodedCity, theme: Theme): Promise<RawPoi[]> {
  const priorityGroups = THEME_TAG_MAP[theme].priorityGroups;
  if (!priorityGroups) {
    return fetchPoisForFilters(city, theme, THEME_TAG_MAP[theme].unionFilters);
  }

  // Each priority group is fetched exactly once. The previous round-robin loop
  // re-issued the identical query every round (no pagination/offset), so a group
  // could never yield more than its first page — it only ever marked itself
  // exhausted. A single generous pass per group is equivalent but honest, and the
  // area/node split (see buildQuery) is what actually fixes landmark coverage.
  const seen = new Set<string>();
  const merged: RawPoi[] = [];

  for (let groupIndex = 0; groupIndex < priorityGroups.length; groupIndex++) {
    if (merged.length >= PRIORITIZED_POI_TOTAL_LIMIT) break;

    const pois = await fetchPoisForFilters(city, theme, priorityGroups[groupIndex]);
    for (const poi of pois) {
      if (theme === 'history' && isLowValueHistoryPoi(poi)) continue;
      const key = `${poi.osmType}:${poi.osmId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      merged.push(poi);
      if (merged.length >= PRIORITIZED_POI_TOTAL_LIMIT) break;
    }
  }

  // Collapse multi-element landmarks (same wikidata id) before they reach tiering,
  // so the same place cannot occupy two shortlist slots / two tour stops.
  const deduped = dedupeByWikidata(merged);
  const collapsed = merged.length - deduped.length;
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
