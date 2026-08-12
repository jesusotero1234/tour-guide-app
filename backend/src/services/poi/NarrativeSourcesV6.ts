import axios from 'axios';
import { createHash } from 'crypto';
import { lookup as dnsLookup } from 'dns/promises';
import { isIP } from 'net';

export type NarrativeSourceAuthorityTierV6 =
  | 'primary_authority'
  | 'scholarly_authority'
  | 'established_source'
  | 'discovery_only';

export interface NarrativeSourceAuthorityV6 {
  tier: NarrativeSourceAuthorityTierV6;
  publisherKey: string;
  rule: string;
}

export interface NarrativeSourceSearchResultV6 {
  url: string;
  title: string;
  description: string;
  authority: NarrativeSourceAuthorityV6;
}

export interface NarrativeCapturedSourceV6 {
  sourceId: string;
  requestedUrl: string;
  finalUrl: string;
  title: string;
  capturedAt: string;
  content: string;
  fingerprint: string;
  authority: NarrativeSourceAuthorityV6;
  containsInstructionLikeText: boolean;
  wikimediaRevision?: { revisionId: number; timestamp: string };
}

export interface NarrativeSourceProviderV6 {
  search(input: { query: string; limit?: number }): Promise<NarrativeSourceSearchResultV6[]>;
  capture(url: string): Promise<NarrativeCapturedSourceV6>;
}

export type NarrativeDnsLookupV6 = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

export type NarrativeSourcePostV6 = (
  url: string,
  body: Record<string, unknown>,
  headers: Record<string, string>
) => Promise<{ data: unknown }>;

export type NarrativeSourceGetV6 = (
  url: string,
  params: Record<string, string>
) => Promise<{ data: unknown }>;

const DEFAULT_FIRECRAWL_BASE_URL_V6 = 'https://api.firecrawl.dev/v2';
const MAX_CAPTURE_CHARACTERS_V6 = 1_000_000;

const defaultLookup: NarrativeDnsLookupV6 = async (hostname) => (
  dnsLookup(hostname, { all: true })
);

const defaultPost: NarrativeSourcePostV6 = async (url, body, headers) => {
  const response = await axios.post(url, body, { headers, timeout: 60_000, maxRedirects: 0 });
  return { data: response.data };
};

const defaultGet: NarrativeSourceGetV6 = async (url, params) => {
  const response = await axios.get(url, { params, timeout: 30_000, maxRedirects: 0 });
  return { data: response.data };
};

function objectValue(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function privateIpv4(address: string): boolean {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some((octet) => !Number.isInteger(octet)
    || octet < 0 || octet > 255)) return true;
  const [a, b] = octets;
  return a === 0 || a === 10 || a === 127 || a >= 224
    || (a === 100 && b >= 64 && b <= 127)
    || (a === 169 && b === 254)
    || (a === 172 && b >= 16 && b <= 31)
    || (a === 192 && [0, 2, 168].includes(b))
    || (a === 198 && (b === 18 || b === 19 || b === 51))
    || (a === 203 && b === 0);
}

function privateIpv6(address: string): boolean {
  const normalized = address.toLowerCase().replace(/^\[|\]$/g, '');
  const mappedIpv4 = normalized.match(/(?:^|:)ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return privateIpv4(mappedIpv4);
  if (normalized === '::' || normalized === '::1') return true;
  if (/^(fc|fd)/.test(normalized) || /^fe[89ab]/.test(normalized) || /^ff/.test(normalized)) {
    return true;
  }
  if (/^2001:0(?:000)?:/.test(normalized) || /^2001:db8:/.test(normalized)
    || /^2002:/.test(normalized)) return true;
  return !/^[23]/.test(normalized);
}

function privateOrReservedAddress(address: string): boolean {
  const family = isIP(address.replace(/^\[|\]$/g, ''));
  if (family === 4) return privateIpv4(address);
  if (family === 6) return privateIpv6(address);
  return true;
}

export async function assertSafeNarrativeUrlV6(
  raw: string,
  lookup: NarrativeDnsLookupV6 = defaultLookup
): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('source URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('source URL must use https');
  if (url.username || url.password) throw new Error('source URL cannot contain credentials');
  if (url.port && url.port !== '443') throw new Error('source URL cannot use a custom port');
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (hostname === 'localhost' || hostname.endsWith('.localhost')
    || hostname.endsWith('.local') || hostname.endsWith('.internal')
    || hostname === 'metadata.google.internal') {
    throw new Error('source URL hostname is private or reserved');
  }
  const addresses = isIP(hostname)
    ? [{ address: hostname, family: isIP(hostname) }]
    : await lookup(hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => privateOrReservedAddress(address))) {
    throw new Error('source URL resolves to a private or reserved address');
  }
  return url;
}

const PRIMARY_PUBLISHERS_V6 = [
  'patrimonionacional.es',
  'madrid.es',
  'comunidad.madrid',
  'museodelprado.es',
  'cultura.gob.es',
  'toledo.es',
  'castillalamancha.es',
  'mecd.gob.es',
  'academiacolecciones.com',
  'esmadrid.com',
  'memoriademadrid.es',
  'catedraldelaalmudena.es',
  'archimadrid.org',
  'rae.es',
  'defensa.gob.es',
  'galeriadelascoleccionesreales.es',
  'cdnprado.net',
  'madrid.org',
] as const;

const SCHOLARLY_PUBLISHERS_V6 = [
  'dialnet.unirioja.es',
  'revistas.csic.es',
  'revistas.ucm.es',
  'fcoam.eu',
  'realacademiabellasartessanfernando.com',
  'rah.es',
  'uc3m.es',
  'usal.es',
] as const;

const ESTABLISHED_PUBLISHERS_V6 = [
  'elpais.com', 'abc.es', 'lavanguardia.com', 'eldiario.es', 'bbc.com',
] as const;

function publisherMatch(hostname: string, publishers: readonly string[]): string | null {
  return publishers.find((publisher) => (
    hostname === publisher || hostname.endsWith(`.${publisher}`)
  )) ?? null;
}

function fallbackPublisher(hostname: string): string {
  const labels = hostname.split('.');
  return labels.slice(-2).join('.');
}

export function classifyNarrativeSourceAuthorityV6(rawUrl: string): NarrativeSourceAuthorityV6 {
  const hostname = new URL(rawUrl).hostname.toLowerCase();
  const primary = publisherMatch(hostname, PRIMARY_PUBLISHERS_V6);
  if (primary) return { tier: 'primary_authority', publisherKey: primary, rule: 'official_registry' };
  const scholarly = publisherMatch(hostname, SCHOLARLY_PUBLISHERS_V6);
  if (scholarly) {
    return { tier: 'scholarly_authority', publisherKey: scholarly, rule: 'scholarly_registry' };
  }
  const established = publisherMatch(hostname, ESTABLISHED_PUBLISHERS_V6);
  if (established) {
    return { tier: 'established_source', publisherKey: established, rule: 'editorial_registry' };
  }
  if (hostname === 'doi.org') {
    return { tier: 'discovery_only', publisherKey: hostname, rule: 'doi_locator_requires_resolution' };
  }
  return { tier: 'discovery_only', publisherKey: fallbackPublisher(hostname), rule: 'unregistered' };
}

const AUTHORITY_ORDER_V6: NarrativeSourceAuthorityTierV6[] = [
  'primary_authority', 'scholarly_authority', 'established_source', 'discovery_only',
];

export function applyNarrativeAuthorityCeilingV6(
  deterministic: NarrativeSourceAuthorityV6,
  proposed: NarrativeSourceAuthorityTierV6
): NarrativeSourceAuthorityTierV6 {
  return AUTHORITY_ORDER_V6[Math.max(
    AUTHORITY_ORDER_V6.indexOf(deterministic.tier),
    AUTHORITY_ORDER_V6.indexOf(proposed)
  )];
}

export function narrativeSourcesAreIndependentV6(
  sources: NarrativeSourceAuthorityV6[]
): boolean {
  return sources.length >= 2
    && new Set(sources.map((source) => source.publisherKey)).size === sources.length;
}

function instructionLikeText(value: string): boolean {
  return /ignore (?:all |the |any )?(?:previous|prior) instructions|system prompt|run (?:a |the )?tool|execute (?:a |the )?command/i
    .test(value);
}

function fingerprint(finalUrl: string, content: string): string {
  return createHash('sha256').update(`${finalUrl}\n${content}`).digest('hex');
}

export class FirecrawlNarrativeSourceProviderV6 implements NarrativeSourceProviderV6 {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly post: NarrativeSourcePostV6;
  private readonly get: NarrativeSourceGetV6;
  private readonly lookup: NarrativeDnsLookupV6;
  private readonly now: () => Date;

  constructor(options: {
    baseUrl?: string;
    apiKey?: string;
    post?: NarrativeSourcePostV6;
    get?: NarrativeSourceGetV6;
    lookup?: NarrativeDnsLookupV6;
    now?: () => Date;
  }) {
    this.baseUrl = (options.baseUrl ?? DEFAULT_FIRECRAWL_BASE_URL_V6).replace(/\/$/, '');
    this.apiKey = options.apiKey?.trim() || undefined;
    this.post = options.post ?? defaultPost;
    this.get = options.get ?? defaultGet;
    this.lookup = options.lookup ?? defaultLookup;
    this.now = options.now ?? (() => new Date());
    if (new URL(this.baseUrl).hostname === 'api.firecrawl.dev' && !this.apiKey) {
      throw new Error('Firecrawl cloud requires an API key');
    }
  }

  private headers(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {}),
    };
  }

  async search(input: { query: string; limit?: number }): Promise<NarrativeSourceSearchResultV6[]> {
    const query = input.query.trim();
    const limit = input.limit ?? 20;
    if (!query || query.length > 500) throw new Error('search query must contain 1 to 500 characters');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error('narrative search limit must be between 1 and 20');
    }
    const response = await this.post(`${this.baseUrl}/search`, {
      query, limit, country: 'ES', ignoreInvalidURLs: true,
    }, this.headers());
    const root = objectValue(response.data, 'Firecrawl search response');
    if (root.success !== true) throw new Error('Firecrawl search was not successful');
    const data = objectValue(root.data, 'Firecrawl search data');
    if (!Array.isArray(data.web) || data.web.length > limit) {
      throw new Error('Firecrawl search returned an invalid result count');
    }
    const results: NarrativeSourceSearchResultV6[] = [];
    const seen = new Set<string>();
    for (const [index, raw] of data.web.entries()) {
      const item = objectValue(raw, `Firecrawl search result ${index}`);
      if (typeof item.url !== 'string' || typeof item.title !== 'string') {
        throw new Error(`Firecrawl search result ${index} is malformed`);
      }
      try {
        const url = await assertSafeNarrativeUrlV6(item.url, this.lookup);
        url.hash = '';
        const normalizedUrl = url.toString();
        if (seen.has(normalizedUrl)) continue;
        seen.add(normalizedUrl);
        results.push({
          url: normalizedUrl,
          title: item.title.slice(0, 500),
          description: typeof item.description === 'string' ? item.description.slice(0, 4_000) : '',
          authority: classifyNarrativeSourceAuthorityV6(normalizedUrl),
        });
      } catch {
        continue;
      }
    }
    return results;
  }

  async capture(rawUrl: string): Promise<NarrativeCapturedSourceV6> {
    const requested = await assertSafeNarrativeUrlV6(rawUrl, this.lookup);
    requested.hash = '';
    const response = await this.post(`${this.baseUrl}/scrape`, {
      url: requested.toString(), formats: ['markdown'], onlyMainContent: true,
    }, this.headers());
    const root = objectValue(response.data, 'Firecrawl capture response');
    if (root.success !== true) throw new Error('Firecrawl capture was not successful');
    const data = objectValue(root.data, 'Firecrawl capture data');
    const metadata = objectValue(data.metadata, 'Firecrawl capture metadata');
    if (typeof data.markdown !== 'string' || !data.markdown.trim()) {
      throw new Error('Firecrawl capture markdown is missing');
    }
    if (data.markdown.length > MAX_CAPTURE_CHARACTERS_V6) {
      throw new Error(`capture content exceeds ${MAX_CAPTURE_CHARACTERS_V6} characters`);
    }
    if (typeof metadata.statusCode === 'number'
      && (metadata.statusCode < 200 || metadata.statusCode >= 300)) {
      throw new Error(`Firecrawl capture returned HTTP ${metadata.statusCode}`);
    }
    const finalRaw = typeof metadata.url === 'string'
      ? metadata.url
      : typeof metadata.sourceURL === 'string' ? metadata.sourceURL : requested.toString();
    const finalUrl = await assertSafeNarrativeUrlV6(finalRaw, this.lookup);
    finalUrl.hash = '';
    const content = data.markdown.trim();
    const sourceFingerprint = fingerprint(finalUrl.toString(), content);
    const wikimediaRevision = await this.captureWikimediaRevision(finalUrl);
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
      authority: classifyNarrativeSourceAuthorityV6(finalUrl.toString()),
      containsInstructionLikeText: instructionLikeText(content),
      ...(wikimediaRevision ? { wikimediaRevision } : {}),
    };
  }

  private async captureWikimediaRevision(
    url: URL
  ): Promise<{ revisionId: number; timestamp: string } | undefined> {
    const hostname = url.hostname.toLowerCase();
    if (!hostname.endsWith('.wikipedia.org') && hostname !== 'www.wikidata.org') return undefined;
    const title = decodeURIComponent(url.pathname.replace(/^\/wiki\//, '')).replace(/_/g, ' ');
    if (!title || title === url.pathname) throw new Error('Wikimedia page title is invalid');
    const response = await this.get(`${url.origin}/w/api.php`, {
      action: 'query', prop: 'revisions', rvprop: 'ids|timestamp', titles: title,
      format: 'json', formatversion: '2', origin: '*',
    });
    const root = objectValue(response.data, 'MediaWiki revision response');
    const query = objectValue(root.query, 'MediaWiki revision query');
    if (!Array.isArray(query.pages) || query.pages.length !== 1) {
      throw new Error('MediaWiki revision response has no page');
    }
    const page = objectValue(query.pages[0], 'MediaWiki revision page');
    if (!Array.isArray(page.revisions) || page.revisions.length === 0) {
      throw new Error('MediaWiki revision response has no revision');
    }
    const revision = objectValue(page.revisions[0], 'MediaWiki revision');
    if (!Number.isInteger(revision.revid) || typeof revision.timestamp !== 'string'
      || Number.isNaN(Date.parse(revision.timestamp))) {
      throw new Error('MediaWiki revision is malformed');
    }
    return { revisionId: Number(revision.revid), timestamp: revision.timestamp };
  }
}

export class ReplayNarrativeSourceProviderV6 implements NarrativeSourceProviderV6 {
  private searchCall = 0;

  constructor(private readonly captures: NarrativeCapturedSourceV6[]) {
    if (captures.length === 0) throw new Error('source replay requires captured pages');
    if (new Set(captures.map((capture) => capture.finalUrl)).size !== captures.length) {
      throw new Error('source replay capture URLs must be unique');
    }
  }

  async search(input: { query: string; limit?: number }): Promise<NarrativeSourceSearchResultV6[]> {
    const query = input.query.trim();
    const limit = input.limit ?? 20;
    if (!query || query.length > 500) throw new Error('search query must contain 1 to 500 characters');
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) {
      throw new Error('narrative search limit must be between 1 and 20');
    }
    const offset = (this.searchCall * limit) % this.captures.length;
    this.searchCall += 1;
    return Array.from({ length: Math.min(limit, this.captures.length) }, (_, index) => (
      this.captures[(offset + index) % this.captures.length]
    )).map((capture) => ({
      url: capture.finalUrl,
      title: capture.title,
      description: 'Frozen narrative source replay.',
      authority: capture.authority,
    }));
  }

  async capture(url: string): Promise<NarrativeCapturedSourceV6> {
    const capture = this.captures.find((item) => item.finalUrl === url || item.requestedUrl === url);
    if (!capture) throw new Error(`source replay has no capture for ${url}`);
    return capture;
  }
}
