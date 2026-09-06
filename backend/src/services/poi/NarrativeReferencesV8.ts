import axios from 'axios';
import { NarrativeCapturedSourceV7, NarrativeCapturedSourceV8, NarrativeDiscoveryResultV7,
  FirecrawlNarrativeCaptureProviderV7, classifyNarrativeSourceAuthorityV7, assertSelfHostedSearxngUrlV7 } from './NarrativeSourcesV7';
import { narrativeHttpHeadersV8 } from './MediaWikiRequestPolicyV8';
import { normalizeNarrativeIdentityTextV8 } from './NarrativeAuthoritiesV7';

export const NARRATIVE_REFERENCE_BUDGET_V8 = {
  captures: 3, queries: 2, documents: 1, concurrency: 2, elapsedMs: 60_000,
  requestMs: 20_000, maxPages: 12, maxTextBytes: 256_000, maxResponseBytes: 1_000_000,
} as const;

export interface NarrativeReferenceV8 { url: string | null; title: string }
export interface NarrativeReferenceProvenanceV8 {
  wikipediaSourceId: string;
  wikipediaUrl: string;
  revisionId: number | null;
  citationUrl: string | null;
  citationTitle: string;
  parentUrl?: string;
}
export interface NarrativeReferenceServicesV8 {
  load(input: { capture: NarrativeCapturedSourceV8; signal: AbortSignal }): Promise<string>;
  capture(input: { url: string; signal: AbortSignal }): Promise<NarrativeCapturedSourceV7>;
  search(input: { query: string; language: string; countryCode: string; signal: AbortSignal }): Promise<NarrativeDiscoveryResultV7[]>;
}

function decode(value: string): string {
  return value.replace(/&amp;/gu, '&').replace(/&quot;/gu, '"').replace(/&#39;|&apos;/gu, "'")
    .replace(/&lt;/gu, '<').replace(/&gt;/gu, '>').replace(/&#(\d+);/gu, (_, n) => {
      const code = Number(n);
      return code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : '';
    });
}
function plain(value: string): string {
  return decode(value.replace(/<[^>]*>/gu, ' ')).replace(/\s+/gu, ' ').trim();
}
export function referenceUrlV8(raw: string, base?: string): string | null {
  try {
    const url = new URL(decode(raw).replace(/^http:\/\//iu, 'https://'), base);
    if (url.protocol !== 'https:' || url.username || url.password || url.port) return null;
    if (/^(?:localhost|.*\.(?:local|internal|lan))$/iu.test(url.hostname)
      || /(?:^|\.)(?:wikipedia|wikimedia|wikidata)\.org$/iu.test(url.hostname)) return null;
    url.hash = '';
    return url.toString();
  } catch { return null; }
}

/** Only citations and explicit bibliography/external-link sections; never every article link. */
export function extractWikipediaReferencesV8(content: string): NarrativeReferenceV8[] {
  content = content.replace(/&#95;/gu, '_'); // MediaWiki escapes underscores in citation IDs.
  const blocks = [...content.matchAll(/<ref\b[^>]*>([\s\S]*?)<\/ref>/giu)].map(m => m[1]);
  blocks.push(...[...content.matchAll(/<li\b[^>]*\bid=["']cite_note[^"']*["'][^>]*>([\s\S]*?)<\/li>/giu)].map(m => m[1]));
  const section = /(?:^|\n)(?:={2,}\s*|#{1,6}\s*)?(?:Referencias|Bibliograf[ií]a|Notas|Enlaces externos|References|Bibliography|Notes|External links|Références|Liens externes|Bibliographie|Referències|Enllaços externs)\s*(?:={2,})?\s*\n([\s\S]*?)(?=\n(?:={2,}|#{1,6}\s)|$)/giu;
  for (const match of content.matchAll(section)) blocks.push(...match[1].split('\n').filter(line => line.trim()));
  // Rendered MediaWiki external-link sections do not have cite_note list IDs.
  for (const match of content.matchAll(/<h[23]\b[^>]*>[\s\S]*?(?:id=["'](?:External_links|Enlaces_externos|Enllaços_externs|Liens_externes)["'])[\s\S]*?<\/h[23]>([\s\S]*?)(?=<h[23]\b|$)/giu)) blocks.push(match[1]);
  const result: NarrativeReferenceV8[] = [];
  const seen = new Set<string>();
  for (const block of blocks.slice(0, 100)) {
    const title = plain(block.replace(/https?:\/\/[^\s<>"'\]|}]+/giu, ' ')).slice(0, 300);
    const urls = [...block.matchAll(/https?:\/\/[^\s<>"'\]|}]+/giu)]
      .map(m => {
        let raw = m[0].replace(/[.,;]+$/u, '');
        while (raw.endsWith(')') && (raw.match(/\)/gu)?.length ?? 0) > (raw.match(/\(/gu)?.length ?? 0)) raw = raw.slice(0, -1);
        return referenceUrlV8(raw);
      }).filter((url): url is string => url !== null);
    for (const url of urls) {
      if (!seen.has(url)) { seen.add(url); result.push({ url, title }); }
    }
    if (urls.length === 0 && title.length >= 25 && !seen.has(title)) {
      seen.add(title); result.push({ url: null, title });
    }
  }
  return result.slice(0, 40);
}

export function rankReferencesV8(refs: NarrativeReferenceV8[], names: string[], domains: string[], missingRoles: string[]): NarrativeReferenceV8[] {
  const terms = names.map(normalizeNarrativeIdentityTextV8).filter(term => term.length >= 3);
  const score = (ref: NarrativeReferenceV8): number => {
    const text = normalizeNarrativeIdentityTextV8(ref.title + ' ' + (ref.url ?? ''));
    const host = ref.url ? new URL(ref.url).hostname : '';
    return (terms.some(term => text.includes(term)) ? 8 : 0)
      + (domains.some(domain => host === domain || host.endsWith('.' + domain)) ? 5 : 0)
      + (/muse|patrimon|inventar|campan|heritage|histori/u.test(text) ? 3 : 0)
      + (missingRoles.includes('tension_or_contrast') && /histori|restaur|transform|uso|funci/u.test(text) ? 2 : 0)
      + (ref.url ? 1 : 0);
  };
  return [...refs].sort((a, b) => score(b) - score(a)); // citation order breaks ties
}

/** One same-host, explicitly labelled history/heritage PDF, not a recursive crawler. */
export function associatedReferenceDocumentV8(capture: NarrativeCapturedSourceV7): NarrativeReferenceV8 | null {
  if (/\.pdf$/iu.test(new URL(capture.finalUrl).pathname)) return null;
  const links = [...capture.content.matchAll(/\[([^\]]+)\]\(([^\s)]+)\)/gu)]
    .map(m => ({ title: m[1], url: referenceUrlV8(m[2], capture.finalUrl) }));
  return links.find(ref => ref.url
    && new URL(ref.url).hostname === new URL(capture.finalUrl).hostname
    && /\.pdf$/iu.test(new URL(ref.url).pathname)
    && /histori|patrimoni|heritage|gu[ií]a|guide|campanar|bell.?tower/iu.test(ref.title + ' ' + ref.url)) ?? null;
}

/** Conservative: cited originals do not independently corroborate their Wikipedia parent. */
export function independentReferencePublisherCountV8(captures: NarrativeCapturedSourceV8[]): number {
  const dependentWikiIds = new Set(captures.flatMap(c => c.referenceProvenance ? [c.referenceProvenance.wikipediaSourceId] : []));
  return new Set(captures.filter(c => !dependentWikiIds.has(c.sourceId)).map(c => c.authority.publisherKey)).size;
}

export function createNarrativeReferenceServicesV8(options: {
  firecrawlBaseUrl: string; searxngBaseUrl: string; apiKey?: string;
}): NarrativeReferenceServicesV8 {
  assertSelfHostedSearxngUrlV7(options.searxngBaseUrl);
  // Promise caches deliberately retain failures for this run. No repeated retry per stop.
  const pages = new Map<string, Promise<string>>();
  const captures = new Map<string, Promise<NarrativeCapturedSourceV7>>();
  const provider = new FirecrawlNarrativeCaptureProviderV7({
    baseUrl: options.firecrawlBaseUrl, apiKey: options.apiKey,
    post: async (url, body, headers, requestOptions) => {
      const response = await axios.post(url, body, {
        headers, timeout: requestOptions?.timeoutMs ?? 20_000,
        signal: requestOptions?.signal, maxRedirects: 0,
        maxContentLength: NARRATIVE_REFERENCE_BUDGET_V8.maxResponseBytes,
      });
      return { data: response.data };
    },
  });
  return {
    load({ capture, signal }) {
      const revisionId = capture.wikimediaRevision?.revisionId;
      const origin = new URL(capture.finalUrl).origin;
      if (!/^https:\/\/[a-z-]+\.wikipedia\.org$/u.test(origin) || !Number.isSafeInteger(revisionId) || !revisionId) return Promise.resolve('');
      const key = origin + ':' + revisionId;
      if (!pages.has(key)) pages.set(key, (async () => {
        const response = await axios.get(origin + '/w/api.php', {
          params: { action: 'parse', oldid: revisionId, prop: 'text', format: 'json', formatversion: 2, maxlag: 5 },
          signal, timeout: 15_000, maxRedirects: 0, headers: narrativeHttpHeadersV8(),
          maxContentLength: NARRATIVE_REFERENCE_BUDGET_V8.maxResponseBytes,
        });
        if (response.data?.error || response.data?.parse?.revid !== revisionId) throw new Error('reference_revision_unavailable');
        return typeof response.data.parse.text === 'string' ? response.data.parse.text : '';
      })());
      return pages.get(key)!;
    },
    capture({ url, signal }) {
      const key = referenceUrlV8(url);
      if (!key) return Promise.reject(new Error('invalid_reference_url'));
      if (!captures.has(key)) captures.set(key, provider.capture(key, {
        timeoutMs: 20_000, maxAttempts: 1, signal,
        referenceLimits: { maxPages: NARRATIVE_REFERENCE_BUDGET_V8.maxPages, maxTextBytes: NARRATIVE_REFERENCE_BUDGET_V8.maxTextBytes },
      }));
      return captures.get(key)!;
    },
    async search({ query, language, countryCode, signal }) {
      // One transport call per query, no hidden retries or multilingual fan-out.
      const response = await axios.get(options.searxngBaseUrl.replace(/\/$/u, '') + '/search', {
        params: { q: query.slice(0, 500), format: 'json', language: language + '-' + countryCode, categories: 'general', safesearch: 0 },
        signal, timeout: 10_000, maxRedirects: 0, maxContentLength: NARRATIVE_REFERENCE_BUDGET_V8.maxResponseBytes,
      });
      if (!Array.isArray(response.data?.results)) throw new Error('reference_search_invalid');
      return response.data.results.slice(0, 10).flatMap((item: { url?: string; title?: string; content?: string }) => {
        const url = item.url ? referenceUrlV8(item.url) : null;
        return url ? [{ url, title: (item.title ?? '').slice(0, 500), description: (item.content ?? '').slice(0, 4000),
          engine: 'searxng-reference', authority: classifyNarrativeSourceAuthorityV7(url) }] : [];
      });
    },
  };
}
