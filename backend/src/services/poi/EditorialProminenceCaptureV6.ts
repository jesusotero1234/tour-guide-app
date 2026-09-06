import axios from 'axios';
import { EditorialEntityCandidateV5 } from './EditorialEvidenceV5';
import {
  WikimediaProminenceCandidateV6,
  WikimediaProminenceSnapshotV6,
  WikimediaProminenceSupportV6,
  WikimediaSourceRevisionV6,
  WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6,
  wikimediaProminenceFingerprintV6,
} from './EditorialProminenceV6';

type WikimediaRequestParamsV6 = Record<string, string | number | boolean | undefined>;

export type WikimediaGetV6 = (
  url: string,
  options: {
    params: WikimediaRequestParamsV6;
    headers: Record<string, string>;
    timeout: number;
  }
) => Promise<{ data: unknown }>;

export interface CaptureWikimediaProminenceOptionsV6 {
  wikipediaPage?: { language: string; title: string };
  wikivoyagePage?: { language: string; title: string } | null;
  cityKey: string;
  cityTitle: string;
  language: string;
  entities: EditorialEntityCandidateV5[];
  capturedAt?: string;
  pageviewWindow?: { start: string; end: string };
  get?: WikimediaGetV6;
  onProgress?: WikimediaProminenceProgressCallbackV6;
}

export type WikimediaProminenceStageV6 =
  | 'wikidata_entities'
  | 'city_wikipedia_revision'
  | 'city_wikipedia_links'
  | 'city_wikivoyage_revision'
  | 'wikivoyage_sections'
  | 'candidate_wikipedia_revisions'
  | 'candidate_pageviews';

class MissingWikimediaPageErrorV6 extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'MissingWikimediaPageErrorV6';
  }
}

export type WikimediaProminenceProgressV6 =
  | {
    event: 'stage_finished';
    stage: WikimediaProminenceStageV6;
    status: 'completed' | 'failed' | 'unavailable';
    durationMs: number;
  }
  | {
    event: 'pageview_finished';
    canonicalId: string;
    title: string;
    completed: number;
    total: number;
    durationMs: number;
  }
  | {
    event: 'request_retry';
    endpoint: string;
    status: 429 | 503;
    attempt: number;
    waitMs: number;
  };

export type WikimediaProminenceProgressCallbackV6 = (
  event: WikimediaProminenceProgressV6
) => void;

interface WikidataEntityV6 {
  id: string;
  lastrevid: number;
  modified: string;
  sitelinks: Record<string, { title: string }>;
}

const WIKIMEDIA_HEADERS_V6 = {
  'User-Agent': 'tour-guide-app/1.0 (https://github.com/jesusotero1234/tour-guide-app)',
  'Accept-Encoding': 'gzip',
};
const SEE_SECTION_NAMES = new Set([
  'see', 'ver', 'que ver', 'visitar', 'lugares de interes', 'voir', 'sehen', 'zien',
  'vedere', 'vegeu',
]);

const defaultGet: WikimediaGetV6 = async (url, options) => {
  const response = await axios.get(url, options);
  return { data: response.data };
};

function httpStatus(error: unknown): number | null {
  if (!error || typeof error !== 'object') return null;
  const response = (error as { response?: unknown }).response;
  if (!response || typeof response !== 'object') return null;
  const status = (response as { status?: unknown }).status;
  return typeof status === 'number' ? status : null;
}

function retryAfterMilliseconds(error: unknown, attempt: number): number {
  if (!error || typeof error !== 'object') return attempt * 1_000;
  const response = (error as { response?: { headers?: unknown } }).response;
  const rawHeaders = response?.headers;
  let retryAfter: unknown;
  if (rawHeaders && typeof rawHeaders === 'object') {
    const headers = rawHeaders as { get?: (name: string) => unknown; 'retry-after'?: unknown };
    retryAfter = typeof headers.get === 'function'
      ? headers.get('retry-after')
      : headers['retry-after'];
  }
  const seconds = Number(retryAfter);
  return Number.isFinite(seconds) && seconds >= 0
    ? Math.min(60_000, seconds * 1_000)
    : attempt * 1_000;
}

function retryingGet(
  rawGet: WikimediaGetV6,
  onProgress?: WikimediaProminenceProgressCallbackV6
): WikimediaGetV6 {
  return async (url, options) => {
    for (let attempt = 1; attempt <= 3; attempt += 1) {
      try {
        return await rawGet(url, options);
      } catch (error) {
        const status = httpStatus(error);
        if (attempt < 3 && (status === 429 || status === 503)) {
          const waitMs = retryAfterMilliseconds(error, attempt);
          const endpoint = new URL(url);
          onProgress?.({
            event: 'request_retry',
            endpoint: `${endpoint.hostname}${endpoint.pathname}`,
            status,
            attempt,
            waitMs,
          });
          await new Promise((resolve) => setTimeout(resolve, waitMs));
          continue;
        }
        const endpoint = new URL(url);
        const detail = status === null
          ? (error instanceof Error ? error.message : String(error))
          : `HTTP ${status}`;
        throw new Error(`${endpoint.hostname}${endpoint.pathname} failed: ${detail}`);
      }
    }
    throw new Error('Wikimedia request exhausted retries unexpectedly');
  };
}

async function captureStage<T>(
  stage: WikimediaProminenceStageV6,
  onProgress: WikimediaProminenceProgressCallbackV6 | undefined,
  operation: () => Promise<T>
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await operation();
    onProgress?.({
      event: 'stage_finished', stage, status: result === null ? 'unavailable' : 'completed', durationMs: Date.now() - startedAt,
    });
    return result;
  } catch (error) {
    onProgress?.({
      event: 'stage_finished', stage, status: 'failed', durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function normalize(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ').trim();
}

function actionPages(value: unknown, label: string): Record<string, unknown>[] {
  const root = objectValue(value, label);
  const query = objectValue(root.query, `${label}.query`);
  if (!Array.isArray(query.pages)) throw new Error(`${label}.query.pages must be an array`);
  return query.pages.map((page, index) => objectValue(page, `${label}.query.pages[${index}]`));
}

function revisionFromPage(
  page: Record<string, unknown>,
  sourceId: string,
  project: string
): WikimediaSourceRevisionV6 {
  if (typeof page.title !== 'string' || !Array.isArray(page.revisions) || page.revisions.length !== 1) {
    throw new Error(`Wikimedia revision ${sourceId} is incomplete`);
  }
  const revision = objectValue(page.revisions[0], `${sourceId}.revision`);
  if (!Number.isInteger(revision.revid) || typeof revision.timestamp !== 'string') {
    throw new Error(`Wikimedia revision ${sourceId} is invalid`);
  }
  return {
    sourceId,
    project,
    title: page.title,
    revisionId: revision.revid as number,
    revisionTimestamp: revision.timestamp,
  };
}

async function requestActionRevision(
  get: WikimediaGetV6,
  endpoint: string,
  project: string,
  sourcePrefix: string,
  title: string
): Promise<WikimediaSourceRevisionV6> {
  // MediaWiki revision IDs/timestamps: https://www.mediawiki.org/wiki/API:Revisions
  const response = await get(endpoint, {
    params: {
      action: 'query', format: 'json', formatversion: 2, redirects: true,
      prop: 'revisions', rvprop: 'ids|timestamp', titles: title,
    },
    headers: WIKIMEDIA_HEADERS_V6, timeout: 30_000,
  });
  const pages = actionPages(response.data, `${project} revision response`);
  if (pages.length === 1 && pages[0].missing === true) {
    const pageTitle = pages[0].title;
    if (typeof pageTitle === 'string' && pageTitle.trim() !== '' && !('invalid' in pages[0]) && !('revisions' in pages[0])) {
      throw new MissingWikimediaPageErrorV6(`Missing Wikimedia page ${project}:${title}`);
    }
  }
  if (pages.length !== 1 || 'missing' in pages[0] || 'invalid' in pages[0]) {
    throw new Error(`Invalid or incomplete Wikimedia page ${project}:${title}`);
  }
  return revisionFromPage(pages[0], `${sourcePrefix}:${pages[0].title as string}`, project);
}

async function requestWikidataEntities(
  get: WikimediaGetV6,
  canonicalIds: string[]
): Promise<Map<string, WikidataEntityV6>> {
  const qids = canonicalIds.filter((id) => /^Q\d+$/.test(id));
  const result = new Map<string, WikidataEntityV6>();
  for (let offset = 0; offset < qids.length; offset += 50) {
    // Wikibase entity lookup: https://www.mediawiki.org/wiki/Wikibase/API#A_simple_query
    const response = await get('https://www.wikidata.org/w/api.php', {
      params: {
        action: 'wbgetentities', format: 'json', props: 'info|sitelinks',
        ids: qids.slice(offset, offset + 50).join('|'),
      },
      headers: WIKIMEDIA_HEADERS_V6, timeout: 30_000,
    });
    const root = objectValue(response.data, 'Wikidata response');
    if (root.success !== 1) throw new Error('Wikidata response was not successful');
    const rawEntities = objectValue(root.entities, 'Wikidata entities');
    for (const id of qids.slice(offset, offset + 50)) {
      const raw = objectValue(rawEntities[id], `Wikidata entity ${id}`);
      if (raw.id !== id || !Number.isInteger(raw.lastrevid) || typeof raw.modified !== 'string') {
        throw new Error(`Wikidata entity ${id} is incomplete`);
      }
      const rawSitelinks = objectValue(raw.sitelinks, `Wikidata entity ${id} sitelinks`);
      const sitelinks: Record<string, { title: string }> = {};
      for (const [site, value] of Object.entries(rawSitelinks)) {
        const sitelink = objectValue(value, `Wikidata entity ${id} sitelink ${site}`);
        if (typeof sitelink.title !== 'string' || !sitelink.title.trim()) continue;
        sitelinks[site] = { title: sitelink.title };
      }
      result.set(id, {
        id, lastrevid: raw.lastrevid as number, modified: raw.modified,
        sitelinks,
      });
    }
  }
  return result;
}

async function requestCityWikipediaLinks(
  get: WikimediaGetV6,
  endpoint: string,
  cityTitle: string
): Promise<Set<string>> {
  // MediaWiki page links and continuation: https://www.mediawiki.org/wiki/API:Links
  const ids = new Set<string>();
  let continuation: Record<string, string | number> = {};
  do {
    const response = await get(endpoint, {
      params: {
        action: 'query', format: 'json', formatversion: 2, redirects: true,
        generator: 'links', titles: cityTitle, gplnamespace: 0, gpllimit: 'max',
        prop: 'pageprops', ppprop: 'wikibase_item', ...continuation,
      },
      headers: WIKIMEDIA_HEADERS_V6, timeout: 30_000,
    });
    for (const page of actionPages(response.data, 'city Wikipedia links response')) {
      if (!page.pageprops) continue;
      const pageprops = objectValue(page.pageprops, 'city Wikipedia linked pageprops');
      if (typeof pageprops.wikibase_item === 'string') ids.add(pageprops.wikibase_item);
    }
    const root = objectValue(response.data, 'city Wikipedia links response');
    if (!root.continue) {
      continuation = {};
    } else {
      const raw = objectValue(root.continue, 'city Wikipedia link continuation');
      continuation = Object.fromEntries(Object.entries(raw).filter((entry): entry is [string, string | number] => (
        typeof entry[1] === 'string' || typeof entry[1] === 'number'
      )));
    }
  } while (Object.keys(continuation).length > 0);
  return ids;
}

async function requestWikivoyageSeeSections(
  get: WikimediaGetV6,
  endpoint: string,
  cityTitle: string
): Promise<Array<{ title: string; wikitext: string }>> {
  const sectionsResponse = await get(endpoint, {
    params: { action: 'parse', format: 'json', formatversion: 2, page: cityTitle, prop: 'sections' },
    headers: WIKIMEDIA_HEADERS_V6, timeout: 30_000,
  });
  const sectionsRoot = objectValue(sectionsResponse.data, 'Wikivoyage sections response');
  const parse = objectValue(sectionsRoot.parse, 'Wikivoyage sections parse');
  if (!Array.isArray(parse.sections)) throw new Error('Wikivoyage sections must be an array');
  const seeSections = parse.sections.map((item, index) => {
    const section = objectValue(item, `Wikivoyage sections[${index}]`);
    if (typeof section.index !== 'string' || typeof section.line !== 'string') {
      throw new Error(`Wikivoyage sections[${index}] is invalid`);
    }
    return { index: section.index, title: section.line };
  }).filter((section) => SEE_SECTION_NAMES.has(normalize(section.title)));
  const results: Array<{ title: string; wikitext: string }> = [];
  for (const section of seeSections) {
    const response = await get(endpoint, {
      params: {
        action: 'parse', format: 'json', formatversion: 2, page: cityTitle,
        prop: 'wikitext', section: section.index,
      },
      headers: WIKIMEDIA_HEADERS_V6, timeout: 30_000,
    });
    const root = objectValue(response.data, `Wikivoyage ${section.title} response`);
    const parsed = objectValue(root.parse, `Wikivoyage ${section.title} parse`);
    let wikitext: string;
    if (typeof parsed.wikitext === 'string') wikitext = parsed.wikitext;
    else {
      const wrapped = objectValue(parsed.wikitext, `Wikivoyage ${section.title} wikitext`);
      if (typeof wrapped['*'] !== 'string') throw new Error(`Wikivoyage ${section.title} wikitext is invalid`);
      wikitext = wrapped['*'];
    }
    results.push({ title: section.title, wikitext });
  }
  return results;
}

async function requestWikipediaRevisions(
  get: WikimediaGetV6,
  endpoint: string,
  project: string,
  sourcePrefix: string,
  titles: string[]
): Promise<WikimediaSourceRevisionV6[]> {
  const unique = [...new Set(titles)].sort();
  const revisions: WikimediaSourceRevisionV6[] = [];
  for (let offset = 0; offset < unique.length; offset += 50) {
    const response = await get(endpoint, {
      params: {
        action: 'query', format: 'json', formatversion: 2, redirects: true,
        prop: 'revisions', rvprop: 'ids|timestamp',
        titles: unique.slice(offset, offset + 50).join('|'),
      },
      headers: WIKIMEDIA_HEADERS_V6, timeout: 30_000,
    });
    for (const page of actionPages(response.data, `${project} candidate revision response`)) {
      if (page.missing !== undefined) continue;
      revisions.push(revisionFromPage(
        page, `${sourcePrefix}:${page.title as string}`, project
      ));
    }
  }
  return revisions;
}

async function requestPageviews(
  get: WikimediaGetV6,
  project: string,
  title: string,
  window: { start: string; end: string }
): Promise<number> {
  // Per-article endpoint: https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/examples/page-metrics.html#page-views
  // Requests are sequential and identified per the access policy:
  // https://doc.wikimedia.org/generated-data-platform/aqs/analytics-api/documentation/access-policy.html
  const encodedTitle = encodeURIComponent(title.replace(/ /g, '_'));
  const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/${project}`
    + `/all-access/all-agents/${encodedTitle}/daily/${window.start.replace(/-/g, '')}`
    + `/${window.end.replace(/-/g, '')}`;
  const response = await get(url, {
    params: {}, headers: WIKIMEDIA_HEADERS_V6, timeout: 30_000,
  });
  const root = objectValue(response.data, `pageviews ${project}:${title}`);
  if (!Array.isArray(root.items)) throw new Error(`Pageviews ${project}:${title} items must be an array`);
  return root.items.reduce((sum: number, item, index) => {
    const row = objectValue(item, `pageviews ${project}:${title}[${index}]`);
    if (!Number.isFinite(row.views) || (row.views as number) < 0) {
      throw new Error(`Pageviews ${project}:${title}[${index}] is invalid`);
    }
    return sum + (row.views as number);
  }, 0);
}

function pageviewPercentiles(values: Array<number | null>): Array<number | null> {
  const numeric = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
  return values.map((value) => {
    if (value === null) return null;
    if (numeric.length <= 1) return 1;
    const first = numeric.indexOf(value);
    const last = numeric.lastIndexOf(value);
    return Number((((first + last) / 2) / (numeric.length - 1)).toFixed(4));
  });
}

function heritageDesignation(entity: EditorialEntityCandidateV5): boolean {
  return entity.evidenceFacts.some((fact) => (
    /^heritageDesignation:/i.test(fact.value) || /^heritage:/i.test(fact.value)
  ));
}

function uniqueCandidateLabels(
  entities: EditorialEntityCandidateV5[],
  titles: Map<string, string | null>
): Map<string, string[]> {
  const labelsById = new Map(entities.map((entity) => [
    entity.canonicalId,
    [...new Set([entity.localName, titles.get(entity.canonicalId) ?? '']
      .map(normalize).filter((label) => label.length >= 4))],
  ]));
  const counts = new Map<string, number>();
  for (const label of [...labelsById.values()].flat()) counts.set(label, (counts.get(label) ?? 0) + 1);
  return new Map([...labelsById].map(([id, labels]) => [
    id, labels.filter((label) => counts.get(label) === 1),
  ]));
}

export async function captureWikimediaProminenceV6(
  options: CaptureWikimediaProminenceOptionsV6
): Promise<WikimediaProminenceSnapshotV6> {
  if (options.entities.length < 1 || options.entities.length > 30) {
    throw new Error('Wikimedia prominence capture requires 1 to 30 candidates');
  }
  if (new Set(options.entities.map((entity) => entity.canonicalId)).size !== options.entities.length) {
    throw new Error('Wikimedia prominence capture requires unique canonical identities');
  }
  const get = retryingGet(options.get ?? defaultGet, options.onProgress);
  const capturedAt = options.capturedAt ?? new Date().toISOString();
  const end = new Date(new Date(capturedAt).getTime() - 86_400_000);
  const start = new Date(end.getTime() - (364 * 86_400_000));
  const date = (value: Date) => value.toISOString().slice(0, 10);
  const pageviewWindow = options.pageviewWindow ?? { start: date(start), end: date(end) };
  const wikipediaLanguage = options.wikipediaPage?.language ?? options.language;
  const wikipediaTitle = options.wikipediaPage?.title ?? options.cityTitle;
  const wikivoyageLanguage = options.wikivoyagePage?.language ?? options.language;
  const wikivoyageTitle = options.wikivoyagePage?.title ?? options.cityTitle;
  const wikipediaProject = `${wikipediaLanguage}.wikipedia.org`;
  const wikivoyageProject = `${wikivoyageLanguage}.wikivoyage.org`;
  const wikipediaEndpoint = `https://${wikipediaProject}/w/api.php`;
  const wikivoyageEndpoint = `https://${wikivoyageProject}/w/api.php`;
  const wikipediaSourcePrefix = `${wikipediaLanguage}wiki`;
  const wikivoyageSourcePrefix = `${wikivoyageLanguage}wikivoyage`;
  const wikidata = await captureStage('wikidata_entities', options.onProgress, () => (
    requestWikidataEntities(get, options.entities.map((entity) => entity.canonicalId))
  ));
  const cityRevision = await captureStage('city_wikipedia_revision', options.onProgress, () => (
    requestActionRevision(
      get, wikipediaEndpoint, wikipediaProject, wikipediaSourcePrefix, wikipediaTitle
    )
  ));
  const cityLinkedIds = await captureStage('city_wikipedia_links', options.onProgress, () => (
    requestCityWikipediaLinks(get, wikipediaEndpoint, wikipediaTitle)
  ));
  const wikivoyageRevision = await captureStage(
    'city_wikivoyage_revision', options.onProgress, async () => {
      if (options.wikivoyagePage === null) return null;
      try {
        return await requestActionRevision(
          get, wikivoyageEndpoint, wikivoyageProject, wikivoyageSourcePrefix, wikivoyageTitle
        );
      } catch (error) {
        if (error instanceof MissingWikimediaPageErrorV6) return null;
        throw error;
      }
    }
  );
  const seeSections = wikivoyageRevision === null ? []
    : await captureStage('wikivoyage_sections', options.onProgress, () => (
      requestWikivoyageSeeSections(get, wikivoyageEndpoint, wikivoyageTitle)
    ));
  const wikipediaTitles = new Map(options.entities.map((entity) => {
    const sitelinks = wikidata.get(entity.canonicalId)?.sitelinks ?? {};
    return [entity.canonicalId, sitelinks[`${wikipediaLanguage}wiki`]?.title ?? null] as const;
  }));
  const candidateRevisions = await captureStage(
    'candidate_wikipedia_revisions', options.onProgress, () => requestWikipediaRevisions(
      get, wikipediaEndpoint, wikipediaProject, wikipediaSourcePrefix,
      [...wikipediaTitles.values()].filter((title): title is string => Boolean(title))
    )
  );
  const pageviewTotal = [...wikipediaTitles.values()].filter(Boolean).length;
  const pageviews = await captureStage('candidate_pageviews', options.onProgress, async () => {
    const values: Array<number | null> = [];
    let completed = 0;
    for (const entity of options.entities) {
      const title = wikipediaTitles.get(entity.canonicalId) ?? null;
      if (!title) {
        values.push(null);
        continue;
      }
      const startedAt = Date.now();
      values.push(await requestPageviews(get, wikipediaProject, title, pageviewWindow));
      completed += 1;
      options.onProgress?.({
        event: 'pageview_finished',
        canonicalId: entity.canonicalId,
        title,
        completed,
        total: pageviewTotal,
        durationMs: Date.now() - startedAt,
      });
    }
    return values;
  });
  const percentiles = pageviewPercentiles(pageviews);
  const labelsById = uniqueCandidateLabels(options.entities, wikipediaTitles);
  const wikivoyageSectionById = new Map<string, string>();
  for (const entity of options.entities) {
    const labels = labelsById.get(entity.canonicalId) ?? [];
    const matched = seeSections.find((section) => {
      const content = ` ${normalize(section.wikitext)} `;
      return labels.some((label) => content.includes(` ${label} `));
    });
    if (matched) wikivoyageSectionById.set(entity.canonicalId, matched.title);
  }
  const candidates = options.entities.map((entity, index): WikimediaProminenceCandidateV6 => {
    const wikidataEntity = wikidata.get(entity.canonicalId);
    const wikipediaTitle = wikipediaTitles.get(entity.canonicalId) ?? null;
    const sectionTitle = wikivoyageSectionById.get(entity.canonicalId) ?? null;
    const support: WikimediaProminenceSupportV6[] = [];
    const add = (item: WikimediaProminenceSupportV6) => support.push(item);
    if (cityLinkedIds.has(entity.canonicalId)) add({
      supportId: `${entity.canonicalId}:city-wikipedia-link`, type: 'city_wikipedia_link',
      value: `${options.cityTitle} links to ${wikipediaTitle ?? entity.localName}`,
      sourceRef: cityRevision.sourceId,
    });
    if (sectionTitle && wikivoyageRevision !== null) add({
      supportId: `${entity.canonicalId}:wikivoyage-see`, type: 'wikivoyage_see_mention',
      value: `${entity.localName} appears in Wikivoyage section ${sectionTitle}`,
      sourceRef: wikivoyageRevision.sourceId,
    });
    if (wikidataEntity) add({
      supportId: `${entity.canonicalId}:wikidata-sitelinks`, type: 'wikidata_sitelinks',
      value: `${Object.keys(wikidataEntity.sitelinks).length} Wikimedia sitelinks`,
      sourceRef: `wikidata:${entity.canonicalId}`,
    });
    if (pageviews[index] !== null) add({
      supportId: `${entity.canonicalId}:wikipedia-pageviews`, type: 'wikipedia_pageviews',
      value: `${pageviews[index]} pageviews from ${pageviewWindow.start} to ${pageviewWindow.end}`,
      sourceRef: `${wikipediaSourcePrefix}:${wikipediaTitle}`,
    });
    const hasHeritage = heritageDesignation(entity);
    if (hasHeritage) add({
      supportId: `${entity.canonicalId}:heritage`, type: 'heritage_designation',
      value: entity.evidenceFacts.find((fact) => (
        /^heritageDesignation:/i.test(fact.value) || /^heritage:/i.test(fact.value)
      ))!.value,
      sourceRef: `candidate-evidence:${entity.canonicalId}`,
    });
    const historical = entity.evidenceFacts.find((fact) => fact.kind === 'claim' || fact.kind === 'context')
      ?? entity.evidenceFacts[0];
    if (historical) add({
      supportId: `${entity.canonicalId}:historical-evidence`, type: 'historical_evidence',
      value: historical.value.replace(/\s+/g, ' ').trim().slice(0, 180),
      sourceRef: `${historical.source}:${historical.sourceId}`,
    });
    if (support.length === 0) throw new Error(`Candidate ${entity.canonicalId} has no own prominence support`);
    return {
      canonicalId: entity.canonicalId, localName: entity.localName, wikipediaTitle,
      cityWikipediaLinked: cityLinkedIds.has(entity.canonicalId),
      wikivoyageSeeMentioned: wikivoyageRevision === null ? null : sectionTitle !== null,
      wikivoyageSectionTitle: sectionTitle,
      sitelinks: wikidataEntity ? Object.keys(wikidataEntity.sitelinks).length : 0,
      pageviews365: pageviews[index], pageviewPercentile: percentiles[index],
      heritageDesignation: hasHeritage, support,
    };
  });
  const wikidataRevisions: WikimediaSourceRevisionV6[] = [...wikidata.values()].map((entity) => ({
    sourceId: `wikidata:${entity.id}`, project: 'www.wikidata.org', title: entity.id,
    revisionId: entity.lastrevid, revisionTimestamp: entity.modified,
  }));
  const withoutFingerprint = {
    schemaVersion: WIKIMEDIA_PROMINENCE_SCHEMA_VERSION_V6,
    cityKey: options.cityKey,
    language: options.language,
    capturedAt,
    pageviewWindow,
    sourceRevisions: [
      ...wikidataRevisions, cityRevision, ...(wikivoyageRevision !== null ? [wikivoyageRevision] : []), ...candidateRevisions,
    ].sort((left, right) => left.sourceId.localeCompare(right.sourceId)),
    candidates,
  } satisfies Omit<WikimediaProminenceSnapshotV6, 'fingerprint'>;
  return { ...withoutFingerprint, fingerprint: wikimediaProminenceFingerprintV6(withoutFingerprint) };
}
