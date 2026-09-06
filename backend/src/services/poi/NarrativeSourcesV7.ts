import axios from 'axios';
import { createHash } from 'crypto';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';
import {
  NarrativeDnsLookupV6,
  NarrativeSourceAuthorityV6,
  NarrativeSourceGetV6,
  NarrativeSourcePostV6,
  NarrativeSourceWaitV6,
  assertSafeNarrativeUrlV6,
} from './NarrativeSourcesV6';
import {
  MediaWikiHttpResponseV8,
  narrativeHttpHeadersV8,
  requestMediaWikiWithMaxlagPolicyV8,
} from './MediaWikiRequestPolicyV8';

export interface NarrativeDiscoveryResultV7 {
  url: string;
  title: string;
  description: string;
  engine: string;
  authority: NarrativeSourceAuthorityV6;
}

export interface NarrativeCapturedSourceV7 {
  sourceLanguage?: string | null;
  sourceId: string;
  requestedUrl: string;
  finalUrl: string;
  title: string;
  capturedAt: string;
  content: string;
  fingerprint: string;
  authority: NarrativeSourceAuthorityV6;
  containsInstructionLikeText: boolean;
  finalHttpStatus: number | null;
  wikimediaRevision?: { revisionId: number; timestamp: string };
}

export type NarrativeSourceKindV8 =
  | 'official_web'
  | 'wikipedia_api'
  | 'wikidata_api'
  | 'other_web'
  | 'historical_corpus';

export interface NarrativeHistoricalProvenanceV8 {
  indexVersion: string;
  documentId: string;
  chunkId: string;
  textHash: string;
  contentHash: string;
  sourceUrl: string;
  publicationYear: number;
  historicalPeriod: string;
  sectionPath: string[];
  entryTitle: string | null;
  pageStart: number;
  pageEnd: number;
  rightsStatus: string;
  rightsVerifiedAt: string;
  rightsIsExplicitlyReusable: boolean;
  coverageStatus: string;
  coverageAcceptedForProduct: boolean;
  coverageStatement: string | null;
  ocrConfidence: number;
  attribution: string | null;
  pageContext?: {
    pageId: string;
    logicalPageNumber: number;
    headerLineId: string;
    headerText: string;
  };
}

export interface NarrativeCapturedSourceV8 extends NarrativeCapturedSourceV7 {
  sourceKind: NarrativeSourceKindV8;
  entityQid: string | null;
  publisherKey: string;
  historicalCorpus?: NarrativeHistoricalProvenanceV8;
}

export function classifyWikipediaCaptureV8(input: {
  capture: NarrativeCapturedSourceV7;
  expectedQid: string | null;
  wikibaseItem: string | null;
}): NarrativeCapturedSourceV8 {
  const entityQid = input.wikibaseItem && /^Q\d+$/u.test(input.wikibaseItem)
    ? input.wikibaseItem
    : null;
  const qidMatch = input.expectedQid !== null && entityQid === input.expectedQid;
  return {
    ...input.capture,
    sourceKind: 'wikipedia_api',
    entityQid,
    publisherKey: 'wikimedia',
    authority: qidMatch
      ? { tier: 'established_source', publisherKey: 'wikimedia', rule: 'wikimedia_qid_match' }
      : { tier: 'discovery_only', publisherKey: 'wikimedia', rule: 'wikimedia_qid_mismatch' },
  };
}

export interface WikipediaArticleCaptureV8Input {
  title: string;
  language: string;
  expectedQid: string | null;
  get?: NarrativeSourceGetV6;
  wait?: NarrativeSourceWaitV6;
  now?: () => Date;
}

export async function captureWikipediaArticleV8(
  input: WikipediaArticleCaptureV8Input
): Promise<NarrativeCapturedSourceV8 | null> {
  const get = input.get ?? defaultGet;
  const wait = input.wait ?? defaultWait;
  const now = input.now ?? (() => new Date());
  const origin = `https://${input.language}.wikipedia.org`;
  const response = await requestMediaWikiWithMaxlagPolicyV8(
    () => get(`${origin}/w/api.php`, {
      action: 'query',
      prop: 'extracts|pageprops|revisions',
      explaintext: '1',
      exsectionformat: 'plain',
      rvprop: 'ids|timestamp',
      redirects: '1',
      converttitles: '1',
      maxlag: '30',
      titles: input.title,
      format: 'json',
      formatversion: '2',
      origin: '*',
    }),
    wait
  );
  const root = objectValue(response.data, 'Wikipedia article response');
  const query = objectValue(root.query, 'Wikipedia article query');
  if (!Array.isArray(query.pages) || query.pages.length === 0) return null;
  const page = objectValue(query.pages[0], 'Wikipedia article page');
  if (page.missing === true) return null;
  const content = typeof page.extract === 'string' ? page.extract.trim() : '';
  if (!content) return null;
  const pageprops = (page.pageprops && typeof page.pageprops === 'object')
    ? page.pageprops as Record<string, unknown>
    : {};
  const wikibaseItem = typeof pageprops.wikibase_item === 'string'
    ? pageprops.wikibase_item
    : null;
  const firstRevision = Array.isArray(page.revisions) ? page.revisions[0] : null;
  const revisionRecord = firstRevision && typeof firstRevision === 'object'
    ? firstRevision as Record<string, unknown>
    : {};
  const revisionId = typeof revisionRecord.revid === 'number' ? revisionRecord.revid : null;
  const timestamp = typeof revisionRecord.timestamp === 'string'
    ? revisionRecord.timestamp
    : null;
  const finalUrl = `${origin}/wiki/${encodeURIComponent(input.title.replace(/ /g, '_'))}`;
  const source: NarrativeCapturedSourceV7 = {
    sourceId: `source-wiki-${input.language}`,
    sourceLanguage: input.language,
    requestedUrl: finalUrl,
    finalUrl,
    title: typeof page.title === 'string' ? page.title : input.title,
    capturedAt: now().toISOString(),
    content: content.slice(0, MAX_CAPTURE_CHARACTERS_V7),
    fingerprint: fingerprint(finalUrl, content),
    authority: classifyNarrativeSourceAuthorityV7(finalUrl),
    containsInstructionLikeText: instructionLikeText(content),
    finalHttpStatus: 200,
    ...(revisionId !== null && timestamp
      ? { wikimediaRevision: { revisionId, timestamp } }
      : {}),
  };
  return classifyWikipediaCaptureV8({
    capture: source,
    expectedQid: input.expectedQid,
    wikibaseItem,
  });
}

export interface NarrativeDiscoveryProviderV7 {
  search(input: {
    query: string;
    language: string;
    countryCode: string;
    limit: number;
  }): Promise<NarrativeDiscoveryResultV7[]>;

  mapOfficialSite(input: {
    origin: string;
    search: string;
    limit: number;
    language?: string;
    countryCode?: string;
  }): Promise<NarrativeDiscoveryResultV7[]>;
}

export interface NarrativeFirecrawlCaptureOptionsV7 {
  timeoutMs?: number;
  maxAttempts?: number;
}

export interface NarrativeCaptureProviderV7 {
  capture(url: string, options?: NarrativeFirecrawlCaptureOptionsV7): Promise<NarrativeCapturedSourceV7>;
}

export interface NarrativeFirecrawlRetryEventV7 {
  path: '/map' | '/scrape';
  attempt: number;
  maxAttempts: number;
  elapsedMs: number;
  waitMs: number;
  httpStatus: number | null;
}

export type NarrativeHttpFailureClassV7 =
  | 'retryable'
  | 'classified_no_retry'
  | 'quota'
  | 'invalid_url';

export function classifyNarrativeHttpFailureV7(
  error: unknown
): { classification: NarrativeHttpFailureClassV7; status: number | null } {
  const status = (error as {
    response?: { status?: number };
  })?.response?.status ?? null;
  const code = (error as { code?: string })?.code;
  if (status === null) {
    const retryable = code === 'ECONNABORTED' || code === 'ETIMEDOUT' || code === 'ESOCKETTIMEDOUT';
    return { classification: retryable ? 'retryable' : 'classified_no_retry', status: null };
  }
  if (status === 402) return { classification: 'quota', status };
  if (status === 429 || (status >= 500 && status <= 599)) {
    return { classification: 'retryable', status };
  }
  return { classification: 'classified_no_retry', status };
}

const DEFAULT_SEARXNG_BASE_URL_V7 = 'http://127.0.0.1:18081';
const DEFAULT_FIRECRAWL_BASE_URL_V7 = 'http://127.0.0.1:3007/v2';
const MAX_CAPTURE_CHARACTERS_V7 = 1_000_000;

const defaultLookup: NarrativeDnsLookupV6 = async (hostname) => (
  dnsLookup(hostname, { all: true })
);

const defaultPost: NarrativeSourcePostV6 = async (url, body, headers, options) => {
  const response = await axios.post(url, body, {
    headers: { ...narrativeHttpHeadersV8(), ...(headers ?? {}) },
    timeout: options?.timeoutMs ?? 60_000,
    maxRedirects: 0,
  });
  return { data: response.data };
};

const defaultGet: NarrativeSourceGetV6 = async (url, params) => {
  const response = await axios.get(url, {
    params,
    timeout: 30_000,
    maxRedirects: 0,
    headers: narrativeHttpHeadersV8(),
  });
  return { data: response.data };
};

const defaultWait: NarrativeSourceWaitV6 = async (milliseconds) => {
  await new Promise((resolve) => setTimeout(resolve, milliseconds));
};

export interface NarrativeHostnameThrottleV7 {
  waitIfNeeded(hostname: string): Promise<void>;
}

export interface NarrativeHostnameThrottleOptionsV7 {
  minIntervalMs?: number;
  now?: () => Date;
  wait?: NarrativeSourceWaitV6;
}

export const DEFAULT_SEARXNG_MIN_INTERVAL_MS_V7 = 1_500;

/**
 * Centralized per-hostname pacing. Reusable by any provider that must avoid
 * bursting requests to the same host (e.g. the local SearXNG instance).
 * `wait` is injectable so tests can record delays without sleeping.
 */
export function createHostnameThrottleV7(
  options: NarrativeHostnameThrottleOptionsV7 = {}
): NarrativeHostnameThrottleV7 {
  const minIntervalMs = options.minIntervalMs ?? DEFAULT_SEARXNG_MIN_INTERVAL_MS_V7;
  const now = options.now ?? (() => new Date());
  const wait = options.wait ?? defaultWait;
  const nextAllowedAtByHost = new Map<string, number>();
  return {
    async waitIfNeeded(hostname) {
      const key = hostname.toLowerCase();
      const current = now().getTime();
      const nextAllowedAt = nextAllowedAtByHost.get(key) ?? 0;
      const remaining = nextAllowedAt - current;
      if (remaining > 0) {
        await wait(remaining);
      }
      nextAllowedAtByHost.set(
        key,
        Math.max(now().getTime(), nextAllowedAt) + minIntervalMs
      );
    },
  };
}

function retryDelaySeconds(error: unknown, retry: number): number {
  const response = (error as {
    response?: { status?: number; headers?: Record<string, unknown> };
  })?.response;
  const retryAfter = response?.headers?.['retry-after'];
  const retryAfterSeconds = typeof retryAfter === 'number'
    ? retryAfter
    : typeof retryAfter === 'string' ? Number(retryAfter) : Number.NaN;
  if (response?.status === 429 && Number.isFinite(retryAfterSeconds) && retryAfterSeconds >= 0) {
    return Math.min(retryAfterSeconds, 60);
  }
  return Math.min(2 ** retry, 30);
}

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function instructionLikeText(value: string): boolean {
  return /ignore (?:all |the |any )?(?:previous|prior) instructions|system prompt|run (?:a |the )?tool|execute (?:a |the )?command/i
    .test(value);
}

function fingerprint(finalUrl: string, content: string): string {
  return createHash('sha256').update(`${finalUrl}\n${content}`).digest('hex');
}

export function classifyNarrativeSourceAuthorityV7(rawUrl: string): NarrativeSourceAuthorityV6 {
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  const labels = hostname.split('.');
  return {
    tier: 'discovery_only',
    publisherKey: labels.slice(-2).join('.'),
    rule: 'unregistered_awaiting_registry',
  };
}

function isPrivateIpv4Host(hostname: string): boolean {
  const octets = hostname.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet)
    || octet < 0 || octet > 255)) return false;
  const [a, b] = octets;
  return a === 10 || a === 127
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && (b === 0 || b === 168))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0);
}

function isPrivateIpv6Host(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === '::' || normalized === '::1') return true;
  if (/^fc|^fd/u.test(normalized)) return true;
  if (/^fe[89ab]/u.test(normalized)) return true;
  return false;
}

function isSelfHostedSearxngHost(hostname: string): boolean {
  if (hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal')
    || hostname.endsWith('.lan')) {
    return true;
  }
  const family = isIP(hostname);
  if (family === 4) return isPrivateIpv4Host(hostname);
  if (family === 6) return isPrivateIpv6Host(hostname);
  return !hostname.includes('.');
}

export class SearxngNarrativeDiscoveryProviderV7 implements NarrativeDiscoveryProviderV7 {
  private readonly baseUrl: string;
  private readonly hostname: string;
  private readonly get: NarrativeSourceGetV6;
  private readonly lookup: NarrativeDnsLookupV6;
  private readonly now: () => Date;
  private readonly wait: NarrativeSourceWaitV6;
  private readonly throttle: NarrativeHostnameThrottleV7;

  constructor(options: {
    baseUrl?: string;
    get?: NarrativeSourceGetV6;
    lookup?: NarrativeDnsLookupV6;
    now?: () => Date;
    wait?: NarrativeSourceWaitV6;
  }) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_SEARXNG_BASE_URL_V7).replace(/\/$/, '');
    this.get = options.get ?? defaultGet;
    this.lookup = options.lookup ?? defaultLookup;
    this.now = options.now ?? (() => new Date());
    this.wait = options.wait ?? defaultWait;
    const hostname = new URL(this.baseUrl).hostname.toLowerCase().replace(/^\[|\]$/g, '');
    if (!isSelfHostedSearxngHost(hostname)) {
      throw new Error('SearXNG must be self-hosted; public instances are not allowed');
    }
    this.hostname = hostname;
    this.throttle = createHostnameThrottleV7({ now: this.now, wait: this.wait });
  }

  private async request(
    query: string,
    language: string,
    countryCode: string,
    limit: number,
    siteFilter?: string
  ): Promise<{ data: unknown }> {
    const queryWithSite = siteFilter ? `site:${siteFilter} ${query}` : query;
    for (let retry = 1; retry <= 4; retry += 1) {
      try {
        await this.throttle.waitIfNeeded(this.hostname);
        return await this.get(`${this.baseUrl}/search`, {
          q: queryWithSite,
          format: 'json',
          language: `${language}-${countryCode}`,
          safesearch: '0',
          categories: 'general',
        });
      } catch (error) {
        const { classification } = classifyNarrativeHttpFailureV7(error);
        if (classification !== 'retryable' || retry === 4) throw error;
        await this.wait(retryDelaySeconds(error, retry) * 1_000);
      }
    }
    throw new Error('SearXNG request retries exhausted');
  }

  private toResults(raw: unknown, limit: number, engine: string): NarrativeDiscoveryResultV7[] {
    const root = objectValue(raw, 'SearXNG response');
    if (root.error) {
      throw new Error(`SearXNG returned an error: ${String(root.error)}`);
    }
    if (!Array.isArray(root.results)) {
      throw new Error('SearXNG response has no results array');
    }
    const results: NarrativeDiscoveryResultV7[] = [];
    const seen = new Set<string>();
    for (const rawResult of root.results) {
      const item = objectValue(rawResult, 'SearXNG result');
      if (typeof item.url !== 'string' || typeof item.title !== 'string') continue;
      try {
        const url = new URL(item.url);
        if (url.protocol !== 'https:') continue;
        const normalizedUrl = url.toString();
        if (seen.has(normalizedUrl)) continue;
        seen.add(normalizedUrl);
        results.push({
          url: normalizedUrl,
          title: item.title.slice(0, 500),
          description: typeof item.description === 'string'
            ? item.description.slice(0, 4_000) : '',
          engine,
          authority: classifyNarrativeSourceAuthorityV7(normalizedUrl),
        });
      } catch {
        continue;
      }
      if (results.length >= limit) break;
    }
    return results;
  }

  async search(input: {
    query: string;
    language: string;
    countryCode: string;
    limit: number;
  }): Promise<NarrativeDiscoveryResultV7[]> {
    const query = input.query.trim();
    if (!query || query.length > 500) throw new Error('search query must contain 1 to 500 characters');
    if (!input.language.trim()) throw new Error('search language is required');
    if (!input.countryCode.trim()) throw new Error('search country code is required');
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) {
      throw new Error('search limit must be between 1 and 20');
    }
    const response = await this.request(query, input.language, input.countryCode, input.limit);
    return this.toResults(response.data, input.limit, 'searxng-json');
  }

  async mapOfficialSite(input: {
    origin: string;
    search: string;
    limit: number;
    language?: string;
    countryCode?: string;
  }): Promise<NarrativeDiscoveryResultV7[]> {
    const origin = input.origin.trim();
    const search = input.search.trim();
    const language = input.language?.trim() || 'es';
    const countryCode = input.countryCode?.trim() || 'ES';
    if (!origin || !search || search.length > 500) {
      throw new Error('mapOfficialSite requires an origin and a 1 to 500 character search');
    }
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 20) {
      throw new Error('map limit must be between 1 and 20');
    }
    const response = await this.request(search, language, countryCode, input.limit, origin);
    return this.toResults(response.data, input.limit, 'searxng-site');
  }
}

export class FirecrawlNarrativeCaptureProviderV7 implements NarrativeCaptureProviderV7 {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly post: NarrativeSourcePostV6;
  private readonly get: NarrativeSourceGetV6;
  private readonly lookup: NarrativeDnsLookupV6;
  private readonly now: () => Date;
  private readonly wait: NarrativeSourceWaitV6;
  private readonly onRetry?: (event: NarrativeFirecrawlRetryEventV7) => void;

  constructor(options: {
    baseUrl?: string;
    apiKey?: string;
    post?: NarrativeSourcePostV6;
    get?: NarrativeSourceGetV6;
    lookup?: NarrativeDnsLookupV6;
    now?: () => Date;
    wait?: NarrativeSourceWaitV6;
    onRetry?: (event: NarrativeFirecrawlRetryEventV7) => void;
  }) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_FIRECRAWL_BASE_URL_V7).replace(/\/$/, '');
    this.apiKey = options.apiKey?.trim() || undefined;
    this.post = options.post ?? defaultPost;
    this.get = options.get ?? defaultGet;
    this.lookup = options.lookup ?? defaultLookup;
    this.now = options.now ?? (() => new Date());
    this.wait = options.wait ?? defaultWait;
    this.onRetry = options.onRetry;
    if (new URL(this.baseUrl).hostname === 'api.firecrawl.dev') {
      throw new Error('Firecrawl cloud is disabled; use the self-hosted base URL');
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  private async request(
    path: '/map' | '/scrape',
    body: Record<string, unknown>,
    options?: NarrativeFirecrawlCaptureOptionsV7
  ): Promise<{ data: unknown }> {
    const maxAttempts = options?.maxAttempts ?? 2;
    if (options?.timeoutMs !== undefined && (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0)) {
      throw new Error('timeoutMs must be a positive finite number');
    }
    if (options?.maxAttempts !== undefined && (!Number.isInteger(options.maxAttempts) || options.maxAttempts < 1 || options.maxAttempts > 2)) {
      throw new Error('maxAttempts must be an integer between 1 and 2');
    }
    for (let retry = 1; retry <= maxAttempts; retry += 1) {
      const startedAt = this.now().getTime();
      try {
        return await this.post(`${this.baseUrl}${path}`, body, this.headers(), { timeoutMs: options?.timeoutMs });
      } catch (error) {
        const { classification, status } = classifyNarrativeHttpFailureV7(error);
        if (classification === 'quota') {
          throw new Error('Firecrawl quota or payment required (HTTP 402)');
        }
        if (classification !== 'retryable' || retry === maxAttempts) throw error;
        const waitMs = retryDelaySeconds(error, retry) * 1_000;
        this.onRetry?.({
          path,
          attempt: retry,
          maxAttempts,
          elapsedMs: Math.max(0, this.now().getTime() - startedAt),
          waitMs,
          httpStatus: status,
        });
        await this.wait(waitMs);
      }
    }
    throw new Error('Firecrawl request retries exhausted');
  }

  async mapOfficialSite(input: {
    origin: string;
    search: string;
    limit: number;
  }): Promise<NarrativeDiscoveryResultV7[]> {
    const origin = input.origin.trim();
    const search = input.search.trim();
    if (!origin || !search || search.length > 500) {
      throw new Error('mapOfficialSite requires an origin and a 1 to 500 character search');
    }
    if (!Number.isInteger(input.limit) || input.limit < 1 || input.limit > 100) {
      throw new Error('map limit must be between 1 and 100');
    }
    const safeOrigin = await assertSafeNarrativeUrlV6(`https://${origin}`, this.lookup);
    const response = await this.request('/map', {
      url: safeOrigin.toString(),
      search,
      limit: input.limit,
    });
    const root = objectValue(response.data, 'Firecrawl map response');
    if (root.success !== true) throw new Error('Firecrawl map was not successful');
    const rawLinks = Array.isArray(root.links)
      ? root.links
      : Array.isArray((root.data as { links?: unknown } | undefined)?.links)
        ? (root.data as { links: unknown[] }).links
        : null;
    if (rawLinks === null) {
      throw new Error('Firecrawl map response has no links array');
    }
    const results: NarrativeDiscoveryResultV7[] = [];
    const seen = new Set<string>();
    for (const raw of rawLinks) {
      const rawUrl = typeof raw === 'string'
        ? raw
        : (() => {
          try {
            const item = objectValue(raw, 'Firecrawl map link');
            return typeof item.url === 'string' ? item.url : null;
          } catch {
            return null;
          }
        })();
      if (!rawUrl) continue;
      const rawTitle = typeof raw === 'string'
        ? null
        : (() => {
          try {
            const item = objectValue(raw, 'Firecrawl map link');
            return typeof item.title === 'string' ? item.title : null;
          } catch {
            return null;
          }
        })();
      const rawDescription = typeof raw === 'string'
        ? null
        : (() => {
          try {
            const item = objectValue(raw, 'Firecrawl map link');
            return typeof item.description === 'string' ? item.description : null;
          } catch {
            return null;
          }
        })();
      try {
        const url = await assertSafeNarrativeUrlV6(rawUrl, this.lookup);
        url.hash = '';
        const normalizedUrl = url.toString();
        if (seen.has(normalizedUrl)) continue;
        seen.add(normalizedUrl);
        results.push({
          url: normalizedUrl,
          title: rawTitle?.trim() ? rawTitle.trim().slice(0, 500) : normalizedUrl,
          description: rawDescription?.trim()
            ? rawDescription.trim().slice(0, 4_000)
            : '',
          engine: 'firecrawl-map',
          authority: classifyNarrativeSourceAuthorityV7(normalizedUrl),
        });
      } catch {
        continue;
      }
    }
    return results;
  }

  async capture(rawUrl: string, options?: NarrativeFirecrawlCaptureOptionsV7): Promise<NarrativeCapturedSourceV7> {
    const requested = await assertSafeNarrativeUrlV6(rawUrl, this.lookup);
    requested.hash = '';
    const response = await this.request('/scrape', {
      url: requested.toString(),
      formats: ['markdown'],
      onlyMainContent: true,
    }, options);
    const root = objectValue(response.data, 'Firecrawl capture response');
    if (root.success !== true) throw new Error('Firecrawl capture was not successful');
    const data = objectValue(root.data, 'Firecrawl capture data');
    const metadata = objectValue(data.metadata, 'Firecrawl capture metadata');
    if (typeof data.markdown !== 'string' || !data.markdown.trim()) {
      throw new Error('Firecrawl capture markdown is missing');
    }
    if (data.markdown.length > MAX_CAPTURE_CHARACTERS_V7) {
      throw new Error(`capture content exceeds ${MAX_CAPTURE_CHARACTERS_V7} characters`);
    }
    const finalStatus = typeof metadata.statusCode === 'number'
      ? metadata.statusCode
      : null;
    if (finalStatus !== null && (finalStatus < 200 || finalStatus >= 300)) {
      throw new Error(`Firecrawl capture returned HTTP ${finalStatus}`);
    }
    const finalRaw = typeof metadata.url === 'string'
      ? metadata.url
      : typeof metadata.sourceURL === 'string' ? metadata.sourceURL : requested.toString();
    const finalUrl = await assertSafeNarrativeUrlV6(finalRaw, this.lookup);
    finalUrl.hash = '';
    const content = data.markdown.trim();
    const sourceFingerprint = fingerprint(finalUrl.toString(), content);
    return {
      sourceId: `source-${sourceFingerprint.slice(0, 16)}`,
      requestedUrl: requested.toString(),
      finalUrl: finalUrl.toString(),
      title: typeof metadata.title === 'string' && metadata.title.trim()
        ? metadata.title.trim().slice(0, 500)
        : finalUrl.hostname,
      capturedAt: this.now().toISOString(),
      content,
      fingerprint: sourceFingerprint,
      authority: classifyNarrativeSourceAuthorityV7(finalUrl.toString()),
      containsInstructionLikeText: instructionLikeText(content),
      finalHttpStatus: finalStatus,
      sourceLanguage: typeof metadata.language === 'string' && /^[a-z]{2,3}(?:-[a-z0-9]+)*$/i.test(metadata.language)
        ? metadata.language.toLowerCase() : null,
    };
  }
}

export interface WikimediaPageContentV7 {
  title: string;
  content: string;
  revisionId: number;
  timestamp: string;
}

export class WikimediaNarrativeCaptureProviderV7 implements NarrativeCaptureProviderV7 {
  private readonly get: NarrativeSourceGetV6;
  private readonly lookup: NarrativeDnsLookupV6;
  private readonly now: () => Date;
  private readonly wait: NarrativeSourceWaitV6;

  constructor(options: {
    get?: NarrativeSourceGetV6;
    lookup?: NarrativeDnsLookupV6;
    now?: () => Date;
    wait?: NarrativeSourceWaitV6;
  }) {
    this.get = options.get ?? defaultGet;
    this.lookup = options.lookup ?? defaultLookup;
    this.now = options.now ?? (() => new Date());
    this.wait = options.wait ?? defaultWait;
  }

  private async getJson(
    origin: string,
    params: Record<string, string>
  ): Promise<unknown> {
    const response = await requestMediaWikiWithMaxlagPolicyV8(
      () => this.get(`${origin}/w/api.php`, {
        ...params,
        format: 'json',
        formatversion: '2',
        origin: '*',
      }),
      this.wait
    );
    const root = objectValue(response.data, 'MediaWiki response');
    if (root.error) {
      throw new Error(`MediaWiki error: ${JSON.stringify(root.error)}`);
    }
    return root;
  }

  private wikimediaHost(rawUrl: string): { origin: string; title: string } | null {
    let url: URL;
    try {
      url = new URL(rawUrl);
    } catch {
      return null;
    }
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith('.wikipedia.org') && hostname !== 'www.wikidata.org') return null;
    if (hostname === 'www.wikidata.org') return null;
    const title = decodeURIComponent(url.pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ');
    if (!title || title === url.pathname) return null;
    return { origin: url.origin, title };
  }

  async capture(rawUrl: string): Promise<NarrativeCapturedSourceV7> {
    const requested = await assertSafeNarrativeUrlV6(rawUrl, this.lookup);
    const wikimedia = this.wikimediaHost(requested.toString());
    if (!wikimedia) {
      throw new Error('Wikimedia capture provider only supports Wikipedia pages');
    }
    const page = await this.getJson(wikimedia.origin, {
      action: 'query',
      prop: 'revisions',
      rvprop: 'ids|timestamp|content',
      rvslots: 'main',
      titles: wikimedia.title,
    });
    const query = objectValue(
      (page as { query?: unknown }).query,
      'MediaWiki query'
    );
    if (!Array.isArray(query.pages) || query.pages.length !== 1) {
      throw new Error('MediaWiki revision response has no page');
    }
    const item = objectValue(query.pages[0], 'MediaWiki revision page');
    if (item.missing === true) {
      throw new Error(`MediaWiki page ${wikimedia.title} does not exist`);
    }
    if (!Array.isArray(item.revisions) || item.revisions.length === 0) {
      throw new Error('MediaWiki revision response has no revision');
    }
    const revision = objectValue(item.revisions[0], 'MediaWiki revision');
    const slots = objectValue(revision.slots, 'MediaWiki revision slots');
    const main = objectValue(slots.main, 'MediaWiki revision main slot');
    if (typeof main.content !== 'string' || !main.content.trim()) {
      throw new Error('MediaWiki revision has no main slot content');
    }
    const content = main.content.trim();
    if (content.length > MAX_CAPTURE_CHARACTERS_V7) {
      throw new Error(`capture content exceeds ${MAX_CAPTURE_CHARACTERS_V7} characters`);
    }
    if (!Number.isInteger(revision.revid) || typeof revision.timestamp !== 'string'
      || Number.isNaN(Date.parse(revision.timestamp))) {
      throw new Error('MediaWiki revision is malformed');
    }
    const finalUrl = requested.toString();
    const sourceFingerprint = fingerprint(finalUrl, content);
    return {
      sourceId: `source-${sourceFingerprint.slice(0, 16)}`,
      requestedUrl: finalUrl,
      finalUrl,
      title: typeof item.title === 'string' ? item.title.slice(0, 500) : wikimedia.title,
      capturedAt: this.now().toISOString(),
      content,
      fingerprint: sourceFingerprint,
      authority: classifyNarrativeSourceAuthorityV7(finalUrl),
      containsInstructionLikeText: instructionLikeText(content),
      finalHttpStatus: 200,
      wikimediaRevision: {
        revisionId: Number(revision.revid),
        timestamp: revision.timestamp,
      },
    };
  }
}
