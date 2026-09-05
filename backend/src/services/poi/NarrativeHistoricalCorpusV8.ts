import axios from 'axios';
import { createHash } from 'crypto';
import { isIP } from 'net';
import { normalizeNarrativeIdentityTextV8 } from './NarrativeAuthoritiesV7';
import { NarrativeCapturedSourceV8, NarrativeHistoricalProvenanceV8 } from './NarrativeSourcesV7';
import { NarrativeHistoricalPageContextV8, resolveNarrativeHistoricalPageContextV8 } from './NarrativeHistoricalPageContextV8';

interface HistoricalQueryV8 {
  stopId: string; stopName: string; cityQid: string; cityName: string; language: string; aliases: string[];
}
interface HistoricalOptionsV8 {
  baseUrl?: string; signal?: AbortSignal;
  post?: (url: string, body: Record<string, unknown>) => Promise<unknown>;
  get?: (url: string) => Promise<unknown>;
}
const searchQueues = new Map<string, Promise<void>>();
async function queuedSearch<T>(origin: string, signal: AbortSignal | undefined, work: () => Promise<T>): Promise<T> {
  signal?.throwIfAborted();
  const previous = searchQueues.get(origin) ?? Promise.resolve();
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  const tail = previous.then(() => gate);
  searchQueues.set(origin, tail);
  let onAbort: (() => void) | undefined;
  try {
    await new Promise<void>((resolve, reject) => {
      onAbort = () => reject(signal?.reason ?? new Error('cancelled'));
      signal?.addEventListener('abort', onAbort, { once: true });
      previous.then(resolve, reject);
    });
    signal?.throwIfAborted();
    return await work();
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
    release();
    void tail.then(() => { if (searchQueues.get(origin) === tail) searchQueues.delete(origin); });
  }
}
export function historicalCorpusOriginV8(baseUrl = 'http://127.0.0.1:3010'): string {
  const url = new URL(baseUrl);
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username || url.password || url.search || url.hash || url.pathname !== '/') {
    throw new Error('historical corpus requires an HTTP loopback origin');
  }
  return url.origin;
}
/** Switching an off checkpoint to RAG requires fresh research; no saved factual approval is reused. */
export function narrativeRagResumeRequestFingerprintV8(input: {
  enabled: boolean; fromPhase: string; saved: string; baseline: string; current: string;
}): string {
  return input.enabled && input.fromPhase === 'research' && input.saved === input.baseline ? input.baseline : input.current;
}
const hash = (text: string) => createHash('sha256').update(text).digest('hex');
const digest = (value: unknown): value is string => typeof value === 'string' && /^sha256:[a-f0-9]{64}$/u.test(value);
const nonempty = (value: unknown, max = 2048): value is string => typeof value === 'string' && !!value.trim() && value.length <= max;
const strings = (value: unknown): value is string[] => Array.isArray(value) && value.every(v => typeof v === 'string');
const normalized = (text: string) => normalizeNarrativeIdentityTextV8(text.replace(/(\p{L})-\s*\n\s*(\p{L})/gu, '$1$2'));
const contains = (text: string, name: string) => {
  const term = normalized(name);
  return term.length >= 3 && (' ' + normalized(text) + ' ').includes(' ' + term + ' ');
};
function publicSourceUrl(value: unknown): URL | null {
  if (!nonempty(value)) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || isIP(host.replace(/^\[|\]$/gu, ''))
      || !host.includes('.') || /(?:^|\.)(?:localhost|local|internal|test|invalid)$/iu.test(host)) return null;
    return url;
  } catch { return null; }
}
function subjectCompatible(h: Record<string, unknown>, input: HistoricalQueryV8): boolean {
  if (h.entryTitle !== undefined && h.entryTitle !== null && !nonempty(h.entryTitle, 100)) return false;
  const tagged = strings(h.entityQids) && strings(h.cityQids)
    && h.entityQids.includes(input.stopId) && h.cityQids.includes(input.cityQid);
  if (tagged) {
    const entryTitle = nonempty(h.entryTitle, 100) ? h.entryTitle : null;
    if (entryTitle) {
      const normalizedTitle = normalized(entryTitle);
      const candidates = [input.stopName, ...input.aliases].filter(name => normalized(name) !== normalized(input.cityName));
      if (!candidates.some(name => normalized(name) === normalizedTitle)) return false;
    }
    return true;
  }
  const entryTitle = nonempty(h.entryTitle, 100) ? h.entryTitle : null;
  let subjectText: string | null = null;
  if (entryTitle) {
    subjectText = entryTitle;
  } else if (Array.isArray(h.sectionPath) && h.sectionPath.length > 0) {
    subjectText = String(h.sectionPath[h.sectionPath.length - 1]);
  }
  if (!subjectText) return false;
  const normalizedSubject = normalized(subjectText);
  const candidates = [input.stopName, ...input.aliases].filter(name => normalized(name) !== normalized(input.cityName));
  return candidates.some(name => normalized(name) === normalizedSubject);
}
function captureHit(raw: unknown, input: HistoricalQueryV8, indexVersion: string, pageContext?: NarrativeHistoricalPageContextV8): NarrativeCapturedSourceV8 | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const h = raw as Record<string, unknown>;
  const sourceUrl = publicSourceUrl(h.sourceUrl);
  if (!sourceUrl || !nonempty(h.text, 16000) || !nonempty(h.title, 1024) || !nonempty(h.documentId, 256)
    || !nonempty(h.historicalPeriod, 64) || !digest(h.chunkId) || !digest(h.textHash) || !digest(h.contentHash)
    || !Number.isInteger(h.pageStart) || !Number.isInteger(h.pageEnd)
    || (h.pageStart as number) < 1 || (h.pageEnd as number) < (h.pageStart as number)
    || !Number.isInteger(h.publicationYear) || (h.publicationYear as number) < 1 || (h.publicationYear as number) > new Date().getUTCFullYear()
    || h.language !== input.language || h.sourceClass !== 'primary_historical'
    || h.rightsStatus !== 'reviewed_reusable' || h.rightsIsExplicitlyReusable !== true
    || !nonempty(h.rightsVerifiedAt) || !Number.isFinite(Date.parse(h.rightsVerifiedAt))
    || !['partial_source', 'complete_source'].includes(String(h.coverageStatus)) || h.coverageAcceptedForProduct !== true
    || h.sourceIsExactRecord !== true || typeof h.ocrConfidence !== 'number' || !Number.isFinite(h.ocrConfidence)
    || h.ocrConfidence < 0.9 || h.ocrConfidence > 1 || typeof h.rerankScore !== 'number'
    || !Number.isFinite(h.rerankScore) || h.rerankScore < 0 || h.rerankScore > 1
    || !strings(h.cityQids) || !strings(h.entityQids) || !strings(h.sectionPath)) return null;
  if ((h.cityQids.length && !h.cityQids.includes(input.cityQid))
    || (h.entityQids.length && !h.entityQids.includes(input.stopId))) return null;
  if (!subjectCompatible(h, input)) return null;
  const tagged = h.entityQids.includes(input.stopId) && h.cityQids.includes(input.cityQid);
  const stopIdentityText = h.text + ' ' + h.sectionPath.join(' ');
  const hasCityText = contains(h.text, input.cityName);
  const hasStopText = [input.stopName, ...input.aliases].some(name => normalized(name) !== normalized(input.cityName) && contains(stopIdentityText, name));
  if (!tagged && !(hasCityText && hasStopText)) {
    if (!pageContext) return null;
    if (!hasStopText) return null;
  }
  const historicalCorpus: NarrativeHistoricalProvenanceV8 = {
    indexVersion, documentId: h.documentId, chunkId: h.chunkId, textHash: h.textHash, contentHash: h.contentHash,
    sourceUrl: sourceUrl.toString(), publicationYear: h.publicationYear as number, historicalPeriod: h.historicalPeriod,
    sectionPath: h.sectionPath, entryTitle: nonempty(h.entryTitle, 100) ? h.entryTitle : null,
    pageStart: h.pageStart as number, pageEnd: h.pageEnd as number,
    rightsStatus: h.rightsStatus, rightsVerifiedAt: h.rightsVerifiedAt, rightsIsExplicitlyReusable: true,
    coverageStatus: String(h.coverageStatus), coverageAcceptedForProduct: true,
    coverageStatement: nonempty(h.coverageStatement) ? h.coverageStatement : null,
    ocrConfidence: h.ocrConfidence, attribution: nonempty(h.attribution) ? h.attribution : null,
    ...(pageContext ? { pageContext } : {}),
  };
  // Verbatim OCR content; historicalCorpus metadata carries provenance separately.
  const content = h.text;
  sourceUrl.hash = 'corpus-chunk=' + h.chunkId;
  const publisherKey = sourceUrl.hostname.replace(/^www\./u, '');
  return {
    sourceId: 'source-corpus-' + h.chunkId.slice(7), requestedUrl: sourceUrl.toString(), finalUrl: sourceUrl.toString(),
    title: h.title + ' (' + h.publicationYear + '), páginas lógicas ' + h.pageStart + '-' + h.pageEnd,
    capturedAt: new Date().toISOString(), content, fingerprint: hash(JSON.stringify({ content, historicalCorpus })),
    authority: { tier: 'established_source', publisherKey, rule: 'historical_corpus_reviewed' },
    containsInstructionLikeText: /ignore.*instructions|system\s*:|ignora.*instrucciones/iu.test(h.text),
    finalHttpStatus: 200, sourceKind: 'historical_corpus',
    entityQid: h.entityQids.includes(input.stopId) ? input.stopId : null, publisherKey, historicalCorpus,
  };
}
export async function retrieveNarrativeHistoricalCorpusV8(input: HistoricalQueryV8, options: HistoricalOptionsV8 = {}) {
  const origin = historicalCorpusOriginV8(options.baseUrl);
  const started = Date.now();
  const result = { captures: [] as NarrativeCapturedSourceV8[], queries: 0, hits: 0, rejected: 0,
    queueWaitMs: 0, pageRequests: 0,
    rejectionReasons: { metadata_or_identity: 0, page_context_unavailable: 0 } as Record<string, number>,
    indexVersion: null as string | null, error: null as string | null, elapsedMs: 0 };
  const post = options.post ?? (async (url, body) => (await axios.post(url, body, {
    timeout: 20000, maxRedirects: 0, maxContentLength: 2000000, signal: options.signal,
  })).data as unknown);
  const get = options.get ?? (options.post ? null : async (url: string) => (await axios.get(url, {
    timeout: 20000, maxRedirects: 0, maxContentLength: 2000000, signal: options.signal,
  })).data as unknown);
  const body = { query: (input.stopName + ' ' + input.cityName + ' historia').slice(0, 2048),
    languages: [input.language], limit: 6, minOcrConfidence: 0.9 };
  const pageCache = new Map<string, unknown>();
  try {
    for (const tagged of [true, false]) {
      options.signal?.throwIfAborted();
      result.queries += 1;
      const queuedAt = Date.now();
      // The server serializes reranking; only execution consumes the HTTP timeout.
      const raw = await queuedSearch(origin, options.signal, () => {
        result.queueWaitMs += Date.now() - queuedAt;
        return post(origin + '/v1/search', { ...body, ...(tagged ? { cityQid: input.cityQid, stopQid: input.stopId } : {}) });
      });
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('malformed corpus response');
      const response = raw as Record<string, unknown>;
      if (!digest(response.indexVersion) || !Array.isArray(response.hits) || response.hits.length > 50) throw new Error('malformed corpus response');
      if (result.indexVersion !== null && response.indexVersion !== result.indexVersion) throw new Error('corpus index changed during retrieval');
      result.indexVersion = response.indexVersion;
      result.hits += response.hits.length;
      const hits = response.hits as unknown[];
      for (let i = 0; i < hits.length; i++) {
        const hit = hits[i];
        let capture = captureHit(hit, input, response.indexVersion);
        if (!capture && get && i < 6 && hit && typeof hit === 'object' && !Array.isArray(hit)) {
          const h = hit as Record<string, unknown>;
          const isFallbackCandidate = typeof h.documentId === 'string' && typeof h.text === 'string'
            && Number.isInteger(h.pageStart) && (h.pageStart as number) > 0 && h.pageStart === h.pageEnd
            && strings(h.sectionPath) && !contains(h.text, input.cityName)
            && [input.stopName, ...input.aliases].some(name => normalized(name) !== normalized(input.cityName)
              && contains(String(h.text) + ' ' + (h.sectionPath as string[]).join(' '), name));
          if (isFallbackCandidate) {
            const cacheKey = encodeURIComponent(String(h.documentId)) + '/' + h.pageStart;
            let pageRaw: unknown;
            if (pageCache.has(cacheKey)) {
              pageRaw = pageCache.get(cacheKey);
            } else {
              if (result.pageRequests >= 3) {
                result.rejected += 1;
                result.rejectionReasons.page_context_unavailable += 1;
                continue;
              }
              result.pageRequests += 1;
              try {
                pageRaw = await get(origin + '/v1/documents/' + encodeURIComponent(String(h.documentId)) + '/pages/' + h.pageStart);
              } catch (error) {
                if (options.signal?.aborted || (error instanceof Error && ['AbortError', 'CanceledError'].includes(error.name))
                  || (error as { code?: string })?.code === 'ERR_CANCELED') throw error;
                pageCache.set(cacheKey, null);
                result.rejected += 1;
                result.rejectionReasons.page_context_unavailable += 1;
                continue;
              }
              pageCache.set(cacheKey, pageRaw);
            }
            const pageContext = resolveNarrativeHistoricalPageContextV8(h, pageRaw, input.cityName, [input.stopName, ...input.aliases]);
            if (!pageContext) {
              result.rejected += 1;
              result.rejectionReasons.page_context_unavailable += 1;
              continue;
            }
            capture = captureHit(h, input, response.indexVersion, pageContext);
            if (!capture) {
              result.rejected += 1;
              result.rejectionReasons.metadata_or_identity += 1;
              continue;
            }
          } else {
            result.rejected += 1;
            result.rejectionReasons.metadata_or_identity += 1;
            continue;
          }
        } else if (!capture) {
          result.rejected += 1;
          result.rejectionReasons.metadata_or_identity += 1;
          continue;
        }
        if (result.captures.length < 3 && !result.captures.some(c => c.sourceId === capture.sourceId)) result.captures.push(capture);
      }
      if (response.hits.length) break;
    }
  } catch (error) {
    if (options.signal?.aborted || (error instanceof Error && ['AbortError', 'CanceledError'].includes(error.name))
      || (error as { code?: string })?.code === 'ERR_CANCELED') throw error;
    result.captures = [];
    result.error = error instanceof Error ? error.message.slice(0, 300) : 'historical corpus unavailable';
  }
  result.elapsedMs = Date.now() - started;
  return result;
}
