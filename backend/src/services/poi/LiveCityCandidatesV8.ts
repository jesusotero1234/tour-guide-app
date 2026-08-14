import axios from 'axios';
import { RawPoi } from '../../domain/poi/RawPoi';
import { Theme, THEME_TAG_MAP } from '../../domain/poi/themeTags';
import { GeocodedCity } from '../../domain/geocoder/GeocoderTypes';
import { fetchPoisForTheme } from '../../infrastructure/poi/OverpassPoiFetcher';
import { WikidataBatchEnrichment } from '../../infrastructure/enrichment/WikidataEnricher';
import { WikipediaEnrichment } from '../../infrastructure/enrichment/WikipediaEnricher';
import { EditorialCandidateSource, resolveEditorialCityCenter } from './EditorialCandidate';
import {
  buildEditorialEntitiesV5,
  editorialDistanceMetersV5,
  EditorialEntityCandidateV5,
} from './EditorialEvidenceV5';
import {
  LandmarkTieredPoi,
  tierPoisByLandmarkFame,
  WikidataLandmarkMetadata,
} from './LandmarkTiering';
import { enrichShortlistedPois } from './PoiEnrichmentPipeline';
import { PoiEnrichmentCache } from './PoiEnrichmentCache';
import {
  MediaWikiHttpResponseV8,
  narrativeHttpHeadersV8,
  requestMediaWikiWithMaxlagPolicyV8,
} from './MediaWikiRequestPolicyV8';

const NOMINATIM_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const WIKIDATA_API_URL = 'https://www.wikidata.org/w/api.php';
const WIKIPEDIA_API_URL_TEMPLATE = 'https://{lang}.wikipedia.org/w/api.php';

const NOMINATIM_MIN_INTERVAL_MS = 1000;
const WIKIDATA_MIN_INTERVAL_MS = 1500;
const WIKIPEDIA_MIN_INTERVAL_MS = 500;
const READY_CANDIDATE_LIMIT = 30;
const ENRICHMENT_BATCH_SIZE = 40;
const SHORTLIST_LIMIT = 60;
const WIKIDATA_ENTITY_BATCH_SIZE = 50;
const WIKIPEDIA_TITLE_BATCH_SIZE = 50;
const WIKIPEDIA_BODY_CHARACTER_LIMIT = 2000;

const SUPPORTED_THEMES: ReadonlySet<Theme> = new Set(['history', 'architecture', 'food', 'art']);

const CLAIM_PROPS: Record<string, string> = {
  P31: 'instanceOf',
  P571: 'inception',
  P84: 'architect',
  P149: 'architecturalStyle',
  P1435: 'heritageDesignation',
  P131: 'locatedIn',
  P138: 'namedAfter',
};

export interface LiveCityCandidatesV8Input {
  city: string;
  cityKey: string;
  theme: Theme;
  language: string;
  durationMinutes: number;
  countryCode?: string;
}

export interface LiveCityCandidatesV8Result {
  entities: EditorialEntityCandidateV5[];
  readyEntities: EditorialEntityCandidateV5[];
  prefilteredCount: number;
  evidenceGaps: Array<{ canonicalId: string; name: string; missing: string[] }>;
  cityCenter: { lat: number; lng: number };
}

export interface LiveCityCandidatesV8RequestOptions {
  method?: 'GET' | 'POST';
  body?: string;
  headers?: Record<string, string>;
}

export type LiveCityCandidatesV8Get = (
  url: string,
  params: Record<string, string | number | boolean | undefined>,
  options?: LiveCityCandidatesV8RequestOptions
) => Promise<MediaWikiHttpResponseV8<unknown>>;

export type LiveCityCandidatesV8Wait = (milliseconds: number) => Promise<void>;

interface OverpassElementV8 {
  type?: unknown;
  id?: unknown;
  lat?: unknown;
  lon?: unknown;
  center?: unknown;
  tags?: unknown;
}

interface WikidataClaimV8 {
  mainsnak?: unknown;
}

interface WikidataEntityV8 {
  id?: unknown;
  missing?: unknown;
  labels?: unknown;
  claims?: unknown;
  sitelinks?: unknown;
}

interface LiveWikidataStoreV8 {
  cache: LiveEnrichmentCacheV8;
  sitelinksByWikidataId: Record<string, number>;
  wikidataMetadataById: Record<string, WikidataLandmarkMetadata>;
  entitiesByQid: Map<string, WikidataEntityV8>;
}

const lastRequestByHostname = new Map<string, number>();

const defaultSleepV8: LiveCityCandidatesV8Wait = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function numberValue(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseCoordinateV8(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function claimRawValueV8(claim: unknown): string | null {
  if (!claim || typeof claim !== 'object' || Array.isArray(claim)) return null;
  const mainsnak = (claim as WikidataClaimV8).mainsnak;
  if (!mainsnak || typeof mainsnak !== 'object' || Array.isArray(mainsnak)) return null;
  const datavalue = (mainsnak as { datavalue?: unknown }).datavalue;
  if (!datavalue || typeof datavalue !== 'object' || Array.isArray(datavalue)) return null;
  const value = (datavalue as { value?: unknown }).value;
  if (typeof value === 'string') return value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (typeof record.id === 'string') return record.id;
  if (typeof record.time === 'string') return record.time.replace(/^\+/, '').split('T')[0];
  return null;
}

function claimEntityIdsV8(claims: Record<string, unknown>, propId: string): string[] {
  const values = Array.isArray(claims[propId]) ? (claims[propId] as unknown[]) : [];
  return values
    .map(claimRawValueV8)
    .filter((value): value is string => typeof value === 'string' && /^Q\d+$/.test(value));
}

function entityLabelMapV8(entity: WikidataEntityV8): Record<string, string> {
  const labels = entity.labels;
  if (!labels || typeof labels !== 'object' || Array.isArray(labels)) return {};
  const result: Record<string, string> = {};
  for (const [language, raw] of Object.entries(labels as Record<string, unknown>)) {
    const label = objectValue(raw, `label ${language}`).value;
    if (typeof label === 'string') result[language] = label;
  }
  return result;
}

function sitelinkTitlesV8(entity: WikidataEntityV8): Record<string, string> {
  const sitelinks = entity.sitelinks;
  if (!sitelinks || typeof sitelinks !== 'object' || Array.isArray(sitelinks)) return {};
  const result: Record<string, string> = {};
  for (const [site, raw] of Object.entries(sitelinks as Record<string, unknown>)) {
    const title = stringValue(objectValue(raw, `sitelink ${site}`).title);
    if (title) result[site] = title;
  }
  return result;
}

function wikipediaTagV8(sitelinks: Record<string, string>, language: string): string | null {
  const preferred = sitelinks[`${language}wiki`];
  if (preferred) return `${language}:${preferred}`;
  const english = sitelinks.enwiki;
  return english ? `en:${english}` : null;
}

function parseWikipediaTagV8(tag: string): { lang: string; title: string } {
  const colonIdx = tag.indexOf(':');
  if (colonIdx > 0 && colonIdx < 4) {
    return { lang: tag.slice(0, colonIdx), title: tag.slice(colonIdx + 1) };
  }
  return { lang: 'en', title: tag };
}

async function throttledSleep(hostname: string, minIntervalMs: number): Promise<void> {
  const now = Date.now();
  const elapsed = now - (lastRequestByHostname.get(hostname) ?? 0);
  if (elapsed < minIntervalMs) {
    await new Promise((resolve) => setTimeout(resolve, minIntervalMs - elapsed));
  }
  lastRequestByHostname.set(hostname, Date.now());
}

const defaultGetV8: LiveCityCandidatesV8Get = async (url, params, options) => {
  const hostname = new URL(url).hostname;
  const interval = hostname.includes('wikidata')
    ? WIKIDATA_MIN_INTERVAL_MS
    : hostname.includes('wikipedia')
      ? WIKIPEDIA_MIN_INTERVAL_MS
      : hostname.includes('nominatim')
        ? NOMINATIM_MIN_INTERVAL_MS
        : 0;
  if (interval > 0) await throttledSleep(hostname, interval);
  const method = options?.method ?? 'GET';
  const response = await axios.request({
    url,
    method,
    params: method === 'GET' ? params : undefined,
    data: method === 'POST' ? options?.body : undefined,
    headers: {
      ...narrativeHttpHeadersV8(),
      'Accept': 'application/json',
      ...(options?.headers ?? {}),
    },
    timeout: 60_000,
  });
  return {
    data: response.data,
    status: response.status,
    headers: response.headers as Record<string, string | number | string[] | undefined>,
  };
};

export function validateLiveCityCandidatesInputV8(
  input: LiveCityCandidatesV8Input
): LiveCityCandidatesV8Input {
  if (!input.city.trim()) throw new Error('LiveCityCandidatesV8 requires a non-empty city name');
  if (!input.cityKey.trim()) throw new Error('LiveCityCandidatesV8 requires a non-empty city key');
  if (!SUPPORTED_THEMES.has(input.theme)) {
    throw new Error(`LiveCityCandidatesV8 requires a supported theme (${[...SUPPORTED_THEMES].join(', ')})`);
  }
  if (!/^[a-z]{2,3}$/.test(input.language)) {
    throw new Error('LiveCityCandidatesV8 requires a two- or three-letter language code');
  }
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 30) {
    throw new Error('LiveCityCandidatesV8 requires a duration of at least 30 minutes');
  }
  return input;
}

export async function geocodeCityCenterV8(
  city: string,
  countryCode: string | undefined,
  get: LiveCityCandidatesV8Get,
  wait: LiveCityCandidatesV8Wait = defaultSleepV8
): Promise<GeocodedCity> {
  const response = await requestMediaWikiWithMaxlagPolicyV8(
    () => get(NOMINATIM_SEARCH_URL, {
      q: city,
      format: 'json',
      limit: 1,
      ...(countryCode ? { countrycodes: countryCode.toLowerCase() } : {}),
    }),
    wait
  );
  if (!Array.isArray(response.data) || response.data.length === 0) {
    throw new Error(`Nominatim found no city center for "${city}"${countryCode ? ` in ${countryCode}` : ''}`);
  }
  const result = objectValue(response.data[0], 'Nominatim result');
  const lat = parseCoordinateV8(result.lat);
  const lng = parseCoordinateV8(result.lon);
  if (lat === null || lng === null) {
    throw new Error(`Nominatim returned an invalid city center for "${city}"`);
  }
  const osmType = stringValue(result.osm_type) ?? 'relation';
  const osmId = numberValue(result.osm_id);
  if (osmId === null) {
    throw new Error(`Nominatim returned no OSM id for "${city}"`);
  }
  const boundingBoxRaw = result.boundingbox;
  const boundingBox = Array.isArray(boundingBoxRaw)
    && boundingBoxRaw.length === 4
    && boundingBoxRaw.every((value) => typeof value === 'string' || typeof value === 'number')
    ? {
      minLat: Number(boundingBoxRaw[0]),
      maxLat: Number(boundingBoxRaw[1]),
      minLng: Number(boundingBoxRaw[2]),
      maxLng: Number(boundingBoxRaw[3]),
    }
    : {
      minLat: lat - 0.03,
      maxLat: lat + 0.03,
      minLng: lng - 0.03,
      maxLng: lng + 0.03,
    };
  return {
    osmType,
    osmId,
    wikidataId: null,
    displayName: stringValue(result.display_name) ?? city,
    lat,
    lng,
    boundingBox,
  };
}

export type LiveCityPoisFetcherV8 = (
  city: GeocodedCity,
  theme: Theme
) => Promise<RawPoi[]>;

export async function fetchLiveOverpassPoisV8(
  city: GeocodedCity,
  theme: Theme
): Promise<RawPoi[]> {
  return fetchPoisForTheme(city, theme);
}

function wikipediaCandidateListV8(
  tag: string,
  sitelinks: Record<string, string> | null,
  language: string
): Array<{ lang: string; title: string }> {
  const { lang: tagLang, title: tagTitle } = parseWikipediaTagV8(tag);
  const candidates: Array<{ lang: string; title: string }> = [];
  for (const lang of [language, 'en']) {
    const title = sitelinks?.[`${lang}wiki`];
    if (title) candidates.push({ lang, title });
  }
  candidates.push({ lang: tagLang, title: tagTitle });
  const seen = new Set<string>();
  return candidates.filter((candidate) => {
    const key = `${candidate.lang}:${candidate.title}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function fetchWikipediaExtractV8(
  tag: string,
  language: string,
  sitelinks: Record<string, string> | null,
  get: LiveCityCandidatesV8Get
): Promise<WikipediaEnrichment | null> {
  for (const candidate of wikipediaCandidateListV8(tag, sitelinks, language)) {
    const extract = await fetchWikipediaExtractPageV8(candidate.lang, candidate.title, get);
    if (extract) {
      return {
        description: extract.description,
        body: extract.body,
        language: candidate.lang,
        wikipediaUrl: `https://${candidate.lang}.wikipedia.org/wiki/${encodeURIComponent(candidate.title)}`,
      };
    }
  }
  return null;
}

interface WikipediaPageV8 {
  title: string;
  extract: string;
  index: number | null;
}

function wikipediaPagesFromResponseV8(data: unknown, label: string): WikipediaPageV8[] {
  const root = objectValue(data, label);
  const query = objectValue(root.query, `${label}.query`);
  if (!Array.isArray(query.pages)) return [];
  const pages: WikipediaPageV8[] = [];
  for (const raw of query.pages) {
    const page = objectValue(raw, `${label}.page`);
    const title = stringValue(page.title);
    const extract = stringValue(page.extract);
    const index = typeof page.index === 'number' ? page.index : null;
    if (title && extract) pages.push({ title, extract: extract.trim(), index });
  }
  return pages;
}

async function fetchWikipediaExtractsBatchV8(
  lang: string,
  items: Array<{ title: string }>,
  get: LiveCityCandidatesV8Get,
  introOnly: boolean,
  wait: LiveCityCandidatesV8Wait
): Promise<Map<string, string>> {
  const endpoint = WIKIPEDIA_API_URL_TEMPLATE.replace('{lang}', lang);
  const response = await requestMediaWikiWithMaxlagPolicyV8(
    () => get(endpoint, {
      action: 'query',
      prop: 'extracts',
      explaintext: true,
      redirects: true,
      maxlag: 5,
      ...(introOnly
        ? { exintro: true, exsentences: 3 }
        : { exsectionformat: 'plain' }),
      titles: items.map((item) => item.title).join('|'),
      format: 'json',
      formatversion: 2,
    }),
    wait
  );
  const pages = wikipediaPagesFromResponseV8(response.data, `Wikipedia extracts ${lang}`);
  const result = new Map<string, string>();
  for (const [index, item] of items.entries()) {
    const byIndex = pages.find((page) => page.index === index + 1);
    const byTitle = pages.find((page) => page.title === item.title);
    const page = byIndex ?? byTitle;
    if (page) result.set(item.title, page.extract);
  }
  return result;
}

export async function fetchWikipediaExtractsV8(
  tags: Array<{ tag: string; sitelinks: Record<string, string> | null }>,
  language: string,
  get: LiveCityCandidatesV8Get,
  wait: LiveCityCandidatesV8Wait = defaultSleepV8
): Promise<Map<string, WikipediaEnrichment>> {
  const result = new Map<string, WikipediaEnrichment>();
  const candidatesByTag = new Map<string, Array<{ lang: string; title: string }>>();
  for (const { tag, sitelinks } of tags) {
    if (!candidatesByTag.has(tag)) {
      candidatesByTag.set(tag, wikipediaCandidateListV8(tag, sitelinks, language));
    }
  }
  let pending = new Map<string, number>();
  for (const tag of candidatesByTag.keys()) pending.set(tag, 0);
  for (let round = 0; round < 3 && pending.size > 0; round += 1) {
    const byLanguage = new Map<string, Array<{ tag: string; title: string }>>();
    for (const [tag, candidateIndex] of pending) {
      const candidate = candidatesByTag.get(tag)?.[candidateIndex];
      if (!candidate) continue;
      const items = byLanguage.get(candidate.lang) ?? [];
      items.push({ tag, title: candidate.title });
      byLanguage.set(candidate.lang, items);
    }
    const next = new Map<string, number>();
    for (const [lang, items] of byLanguage) {
      for (let offset = 0; offset < items.length; offset += WIKIPEDIA_TITLE_BATCH_SIZE) {
        const batch = items.slice(offset, offset + WIKIPEDIA_TITLE_BATCH_SIZE);
        const intros = await fetchWikipediaExtractsBatchV8(lang, batch, get, true, wait);
        const bodies = intros.size > 0
          ? await fetchWikipediaExtractsBatchV8(lang, batch, get, false, wait)
          : new Map<string, string>();
        for (const item of batch) {
          const description = intros.get(item.title);
          const bodyText = bodies.get(item.title);
          if (description) {
            result.set(item.tag, {
              description,
              body: (bodyText ?? description).slice(0, WIKIPEDIA_BODY_CHARACTER_LIMIT),
              language: lang,
              wikipediaUrl: `https://${lang}.wikipedia.org/wiki/${encodeURIComponent(item.title)}`,
            });
          } else {
            next.set(item.tag, (pending.get(item.tag) ?? 0) + 1);
          }
        }
      }
    }
    pending = next;
  }
  return result;
}

async function fetchWikipediaExtractPageV8(
  lang: string,
  title: string,
  get: LiveCityCandidatesV8Get
): Promise<{ description: string; body: string } | null> {
  const endpoint = WIKIPEDIA_API_URL_TEMPLATE.replace('{lang}', lang);
  const introResponse = await get(endpoint, {
    action: 'query',
    prop: 'extracts',
    explaintext: true,
    redirects: true,
    exintro: true,
    exsentences: 3,
    titles: title,
    format: 'json',
    formatversion: 2,
  });
  const intro = wikipediaExtractFromResponseV8(introResponse.data, `Wikipedia intro ${lang}:${title}`);
  if (!intro) return null;
  const bodyResponse = await get(endpoint, {
    action: 'query',
    prop: 'extracts',
    explaintext: true,
    redirects: true,
    exsectionformat: 'plain',
    titles: title,
    format: 'json',
    formatversion: 2,
  });
  const body = wikipediaExtractFromResponseV8(bodyResponse.data, `Wikipedia body ${lang}:${title}`);
  return {
    description: intro,
    body: (body ?? intro).slice(0, WIKIPEDIA_BODY_CHARACTER_LIMIT),
  };
}

function wikipediaExtractFromResponseV8(data: unknown, label: string): string | null {
  const page = wikipediaPagesFromResponseV8(data, label)[0];
  return page ? page.extract : null;
}

export async function fetchWikidataEntitiesV8(
  wikidataIds: string[],
  get: LiveCityCandidatesV8Get,
  wait: LiveCityCandidatesV8Wait = defaultSleepV8
): Promise<Map<string, WikidataEntityV8>> {
  const uniqueIds = Array.from(new Set(wikidataIds.filter((id) => /^Q\d+$/.test(id))));
  const result = new Map<string, WikidataEntityV8>();
  for (let offset = 0; offset < uniqueIds.length; offset += WIKIDATA_ENTITY_BATCH_SIZE) {
    const batch = uniqueIds.slice(offset, offset + WIKIDATA_ENTITY_BATCH_SIZE);
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => get(WIKIDATA_API_URL, {
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'labels|claims|sitelinks',
        maxlag: 5,
        format: 'json',
        formatversion: 2,
      }),
      wait
    );
    const root = objectValue(response.data, 'Wikidata entities response');
    if (typeof root.error === 'string' || root.error !== undefined) {
      throw new Error(`Wikidata entities request failed: ${JSON.stringify(root.error)}`);
    }
    const rawEntities = objectValue(root.entities, 'Wikidata entities');
    const entries: Array<[string, WikidataEntityV8]> = Array.isArray(rawEntities)
      ? rawEntities
        .filter((entity): entity is WikidataEntityV8 => Boolean(entity?.id))
        .map((entity) => [entity.id as string, entity])
      : Object.entries(rawEntities as Record<string, unknown>)
        .filter((entry): entry is [string, WikidataEntityV8] => (
          Boolean(entry[1]) && typeof entry[1] === 'object'
        ));
    for (const [id, entity] of entries) {
      result.set(id, entity);
    }
  }
  return result;
}

export async function fetchWikidataLabelsV8(
  wikidataIds: string[],
  language: string,
  get: LiveCityCandidatesV8Get,
  wait: LiveCityCandidatesV8Wait = defaultSleepV8
): Promise<Map<string, string>> {
  const uniqueIds = Array.from(new Set(wikidataIds.filter((id) => /^Q\d+$/.test(id))));
  const result = new Map<string, string>();
  for (let offset = 0; offset < uniqueIds.length; offset += WIKIDATA_ENTITY_BATCH_SIZE) {
    const batch = uniqueIds.slice(offset, offset + WIKIDATA_ENTITY_BATCH_SIZE);
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => get(WIKIDATA_API_URL, {
        action: 'wbgetentities',
        ids: batch.join('|'),
        props: 'labels',
        languages: [language, 'en'].join('|'),
        maxlag: 5,
        format: 'json',
        formatversion: 2,
      }),
      wait
    );
    const root = objectValue(response.data, 'Wikidata labels response');
    const rawEntities = objectValue(root.entities, 'Wikidata labels entities');
    const entries: Array<[string, WikidataEntityV8]> = Array.isArray(rawEntities)
      ? rawEntities
        .filter((entity): entity is WikidataEntityV8 => Boolean(entity?.id))
        .map((entity) => [entity.id as string, entity])
      : Object.entries(rawEntities as Record<string, unknown>)
        .filter((entry): entry is [string, WikidataEntityV8] => (
          Boolean(entry[1]) && typeof entry[1] === 'object'
        ));
    for (const [id, entity] of entries) {
      const labels = entityLabelMapV8(entity);
      result.set(id, labels[language] ?? labels.en ?? id);
    }
  }
  return result;
}

function effectiveWikipediaTagsV8(
  pois: RawPoi[],
  entitiesByQid: Map<string, WikidataEntityV8>,
  language: string
): Map<string, { sitelinks: Record<string, string> | null }> {
  const result = new Map<string, { sitelinks: Record<string, string> | null }>();
  for (const poi of pois) {
    const entity = poi.tags.wikidata ? entitiesByQid.get(poi.tags.wikidata) : undefined;
    const sitelinks = entity ? sitelinkTitlesV8(entity) : null;
    const resolved = entity && sitelinks ? wikipediaTagV8(sitelinks, language) : null;
    const tag = poi.tags.wikipedia || resolved;
    if (tag) result.set(tag, { sitelinks });
  }
  return result;
}

export async function enrichLivePoisV8(
  pois: RawPoi[],
  language: string,
  get: LiveCityCandidatesV8Get,
  wait: LiveCityCandidatesV8Wait = defaultSleepV8
): Promise<LiveWikidataStoreV8> {
  const qids = Array.from(new Set(pois
    .map((poi) => poi.tags.wikidata)
    .filter((qid): qid is string => typeof qid === 'string' && qid.length > 0)));
  const entitiesByQid = await fetchWikidataEntitiesV8(qids, get, wait);

  const referencedIds = new Set<string>();
  for (const entity of entitiesByQid.values()) {
    const claims = entity.claims;
    if (!claims || typeof claims !== 'object' || Array.isArray(claims)) continue;
    for (const propId of Object.keys(CLAIM_PROPS)) {
      for (const id of claimEntityIdsV8(claims as Record<string, unknown>, propId)) {
        referencedIds.add(id);
      }
    }
  }
  const labelsByQid = await fetchWikidataLabelsV8([...referencedIds], language, get, wait);

  const wikidataCache = new Map<string, WikidataBatchEnrichment>();
  const osmTagByQid = new Map(pois
    .filter((poi) => poi.tags.wikidata && poi.tags.wikipedia)
    .map((poi) => [poi.tags.wikidata as string, poi.tags.wikipedia as string]));
  const sitelinksByWikidataId: Record<string, number> = {};
  const wikidataMetadataById: Record<string, WikidataLandmarkMetadata> = {};

  for (const [qid, entity] of entitiesByQid) {
    if (entity.missing !== undefined) continue;
    const sitelinks = sitelinkTitlesV8(entity);
    const sitelinksCount = Object.keys(sitelinks).length;
    sitelinksByWikidataId[qid] = sitelinksCount;
    const claims = entity.claims;
    const rawClaims: Record<string, string> = {};
    const instanceOfLabels: string[] = [];
    if (claims && typeof claims === 'object' && !Array.isArray(claims)) {
      const claimRecord = claims as Record<string, unknown>;
      for (const [propId, fieldName] of Object.entries(CLAIM_PROPS)) {
        const value = claimRawValueV8(Array.isArray(claimRecord[propId]) ? (claimRecord[propId] as unknown[])[0] : undefined);
        if (!value) continue;
        rawClaims[fieldName] = /^Q\d+$/.test(value) ? (labelsByQid.get(value) ?? value) : value;
      }
      for (const instanceOfId of claimEntityIdsV8(claimRecord, 'P31')) {
        instanceOfLabels.push(labelsByQid.get(instanceOfId) ?? instanceOfId);
      }
    }
    const resolvedTag = wikipediaTagV8(sitelinks, language) ?? osmTagByQid.get(qid) ?? undefined;
    wikidataCache.set(qid, {
      wikidataId: qid,
      nameTranslations: entityLabelMapV8(entity),
      wikidataUrl: `https://www.wikidata.org/wiki/${qid}`,
      wikidataClaims: Object.keys(rawClaims).length > 0 ? rawClaims : null,
      ...(resolvedTag ? { wikipediaTag: resolvedTag } : {}),
    });
    wikidataMetadataById[qid] = {
      sitelinks: sitelinksCount,
      instanceOfLabels,
    };
  }

  return {
    cache: new LiveEnrichmentCacheV8(wikidataCache, new Map()),
    sitelinksByWikidataId,
    wikidataMetadataById,
    entitiesByQid,
  };
}

class LiveEnrichmentCacheV8 implements PoiEnrichmentCache {
  readonly isCompleteSnapshot = true;

  constructor(
    private readonly wikidata: Map<string, WikidataBatchEnrichment>,
    private readonly wikipedia: Map<string, WikipediaEnrichment>
  ) {}

  async getWikidata(wikidataId: string): Promise<WikidataBatchEnrichment | null> {
    return this.wikidata.get(wikidataId) ?? null;
  }

  async setWikidata(wikidataId: string, _language: string, payload: WikidataBatchEnrichment): Promise<void> {
    this.wikidata.set(wikidataId, payload);
  }

  async getWikipedia(osmWikipediaTag: string): Promise<WikipediaEnrichment | null> {
    return this.wikipedia.get(osmWikipediaTag) ?? null;
  }

  async setWikipedia(osmWikipediaTag: string, _language: string, payload: WikipediaEnrichment): Promise<void> {
    this.wikipedia.set(osmWikipediaTag, payload);
  }

  setWikipediaExtracts(enrichments: Map<string, WikipediaEnrichment>): void {
    for (const [tag, enrichment] of enrichments) {
      this.wikipedia.set(tag, enrichment);
    }
  }
}

function maximumCandidateDistanceV8(durationMinutes: number): number {
  if (durationMinutes <= 120) return 3_500;
  if (durationMinutes <= 180) return 4_500;
  return 6_000;
}

function toSourcesV8(
  enriched: Awaited<ReturnType<typeof enrichShortlistedPois>>,
  tiered: LandmarkTieredPoi[]
): EditorialCandidateSource[] {
  return enriched.map((poi, index) => ({
    ...poi,
    fameScore: tiered[index]?.fameScore ?? 0,
    landmarkTier: tiered[index]?.landmarkTier,
  }));
}

function selectReadyCandidatesV8(
  entities: EditorialEntityCandidateV5[],
  limit: number
): EditorialEntityCandidateV5[] {
  return [...entities].sort((left, right) => (
    (right.firstVisitScore ?? right.recognitionScore)
      - (left.firstVisitScore ?? left.recognitionScore)
    || right.recognitionScore - left.recognitionScore
    || right.fameScore - left.fameScore
    || left.canonicalId.localeCompare(right.canonicalId)
  )).slice(0, limit);
}

export interface LiveCityCandidatesV8LoadOptions {
  get?: LiveCityCandidatesV8Get;
  fetchPois?: LiveCityPoisFetcherV8;
  wait?: LiveCityCandidatesV8Wait;
}

export async function loadLiveCityCandidatesV8(
  input: LiveCityCandidatesV8Input,
  options: LiveCityCandidatesV8LoadOptions = {}
): Promise<LiveCityCandidatesV8Result> {
  const validated = validateLiveCityCandidatesInputV8(input);
  const get = options.get ?? defaultGetV8;
  const fetchPois = options.fetchPois ?? fetchLiveOverpassPoisV8;
  const wait = options.wait ?? defaultSleepV8;

  const city = await geocodeCityCenterV8(validated.city, validated.countryCode, get, wait);
  const fetchedPois = await fetchPois(city, validated.theme);
  const pois = fetchedPois.filter((poi) => poi.tags.wikidata || poi.tags.wikipedia);
  const store = await enrichLivePoisV8(pois, validated.language, get, wait);

  const tiered = tierPoisByLandmarkFame(
    pois, store.sitelinksByWikidataId, validated.theme, store.wikidataMetadataById
  );
  const shortlisted = tiered.slice(0, SHORTLIST_LIMIT);
  const shortlistTags = effectiveWikipediaTagsV8(shortlisted, store.entitiesByQid, validated.language);
  const wikipediaExtracts = await fetchWikipediaExtractsV8(
    [...shortlistTags].map(([tag, { sitelinks }]) => ({ tag, sitelinks })),
    validated.language,
    get,
    wait
  );
  store.cache.setWikipediaExtracts(wikipediaExtracts);
  const enriched = await enrichShortlistedPois(shortlisted, validated.language, store.cache, ENRICHMENT_BATCH_SIZE);
  const sources = toSourcesV8(enriched, shortlisted);
  const cityCenter = resolveEditorialCityCenter(sources, { lat: city.lat, lng: city.lng })
    ?? { lat: city.lat, lng: city.lng };
  const maximumDistance = maximumCandidateDistanceV8(validated.durationMinutes);
  const entities = buildEditorialEntitiesV5(sources, validated.language).filter((entity) => (
    editorialDistanceMetersV5(entity.coordinates, cityCenter) <= maximumDistance
  ));
  const readyEntities = selectReadyCandidatesV8(
    entities.filter((entity) => entity.readiness.ready), READY_CANDIDATE_LIMIT
  );
  return {
    entities,
    readyEntities,
    prefilteredCount: Math.min(SHORTLIST_LIMIT, tiered.length),
    evidenceGaps: entities.filter((entity) => !entity.readiness.ready).map((entity) => ({
      canonicalId: entity.canonicalId,
      name: entity.localName,
      missing: entity.readiness.missing,
    })),
    cityCenter,
  };
}
