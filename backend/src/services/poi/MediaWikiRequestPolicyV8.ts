export const MEDIAWIKI_MAXLAG_MAX_ATTEMPTS_V8 = 6;
export const MEDIAWIKI_MAXLAG_MAX_TOTAL_WAIT_MS_V8 = 180_000;
export const MEDIAWIKI_MAXLAG_MIN_WAIT_MS_V8 = 5_000;

const EXPLICIT_TIMEOUT_CODES_V8 = new Set([
  'ECONNABORTED',
  'ETIMEDOUT',
  'ESOCKETTIMEDOUT',
]);

export interface MediaWikiMaxlagErrorPayloadV8 {
  code: 'maxlag';
  info?: string;
  host?: string;
  lag?: number;
  type?: string;
}

export interface MediaWikiHttpResponseV8<T> {
  data: T;
  status?: number;
  headers?: Record<string, string | number | string[] | undefined>;
}

export function isMediaWikiMaxlagErrorV8(data: unknown): boolean {
  const error = (data as { error?: unknown })?.error;
  return Boolean(error && typeof error === 'object'
    && (error as { code?: unknown }).code === 'maxlag');
}

export function mediaWikiMaxlagSecondsV8(data: unknown): number | null {
  if (!isMediaWikiMaxlagErrorV8(data)) return null;
  const lag = (data as { error?: { lag?: unknown } }).error?.lag;
  return typeof lag === 'number' && Number.isFinite(lag) && lag >= 0 ? lag : null;
}

export interface MediaWikiFailureClassificationV8 {
  retriable: boolean;
  status: number | null;
  code: string | null;
}

/**
 * Single retry policy for MediaWiki and the external network: only explicit
 * Axios timeouts, HTTP 429, HTTP 5xx and the MediaWiki `maxlag` JSON error are
 * retried. DNS, connection refused, TLS and generic errors without a code or
 * status are never retried.
 */
export function classifyMediaWikiFailureV8(
  error: unknown
): MediaWikiFailureClassificationV8 {
  const candidate = error as {
    response?: { status?: number };
    code?: unknown;
  };
  const status = typeof candidate.response?.status === 'number'
    ? candidate.response.status
    : null;
  const code = typeof candidate.code === 'string' ? candidate.code : null;
  if (status !== null) {
    if (status === 429 || (status >= 500 && status <= 599)) {
      return { retriable: true, status, code };
    }
    return { retriable: false, status, code };
  }
  if (code !== null) {
    if (EXPLICIT_TIMEOUT_CODES_V8.has(code)) {
      return { retriable: true, status: null, code };
    }
    return { retriable: false, status: null, code };
  }
  return { retriable: false, status: null, code: null };
}

export function retryAfterMsFromHeaderV8(
  value: string | number | string[] | undefined
): number | null {
  if (Array.isArray(value)) value = value[0];
  if (typeof value === 'number' && Number.isFinite(value) && value >= 0) {
    return value * 1000;
  }
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  const seconds = Number(trimmed);
  if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
  const dateMs = Date.parse(trimmed);
  if (!Number.isNaN(dateMs)) return Math.max(0, dateMs - Date.now());
  return null;
}

function retryAfterFromErrorV8(error: unknown): number | null {
  const headers = (error as {
    response?: { headers?: Record<string, string | number | string[] | undefined> };
  })?.response?.headers;
  return retryAfterMsFromHeaderV8(headers?.['retry-after']);
}

export class MediaWikiMaxlagExhaustedErrorV8 extends Error {
  readonly code = 'maxlag_exhausted';

  constructor(
    readonly attempts: number,
    readonly totalWaitMs: number,
    readonly lastLagSeconds: number | null,
    readonly lastRetryAfterMs: number | null
  ) {
    super('MediaWiki request kept failing with maxlag and was abandoned');
    this.name = 'MediaWikiMaxlagExhaustedErrorV8';
  }
}

export interface MediaWikiMaxlagPolicyOptionsV8 {
  maxAttempts?: number;
  maxTotalWaitMs?: number;
}

/**
 * Shared retry wrapper for every MediaWiki call site. Handles both thrown
 * HTTP/network failures (per `classifyMediaWikiFailureV8`) and HTTP-200
 * `maxlag` error bodies, with a single attempt cap and accumulated wait
 * budget. For `maxlag`, each wait is `max(5 s, Retry-After, lag)` and never
 * runs a partial wait followed by a premature request when it would exceed the
 * remaining budget.
 */
export async function requestMediaWikiWithMaxlagPolicyV8<T>(
  request: () => Promise<MediaWikiHttpResponseV8<T>>,
  wait: (milliseconds: number) => Promise<void>,
  options: MediaWikiMaxlagPolicyOptionsV8 = {}
): Promise<MediaWikiHttpResponseV8<T>> {
  const maxAttempts = options.maxAttempts ?? MEDIAWIKI_MAXLAG_MAX_ATTEMPTS_V8;
  const maxTotalWaitMs = options.maxTotalWaitMs ?? MEDIAWIKI_MAXLAG_MAX_TOTAL_WAIT_MS_V8;
  let attempts = 0;
  let totalWaitMs = 0;
  let lastLagSeconds: number | null = null;
  let lastRetryAfterMs: number | null = null;
  for (;;) {
    let response: MediaWikiHttpResponseV8<T>;
    try {
      response = await request();
    } catch (error) {
      const classification = classifyMediaWikiFailureV8(error);
      attempts += 1;
      if (!classification.retriable || attempts >= maxAttempts) throw error;
      const retryAfterMs = retryAfterFromErrorV8(error);
      const requiredWaitMs = Math.max(MEDIAWIKI_MAXLAG_MIN_WAIT_MS_V8, retryAfterMs ?? 0);
      if (requiredWaitMs > maxTotalWaitMs - totalWaitMs) throw error;
      await wait(requiredWaitMs);
      totalWaitMs += requiredWaitMs;
      continue;
    }
    attempts += 1;
    if (!isMediaWikiMaxlagErrorV8(response.data)) return response;
    lastLagSeconds = mediaWikiMaxlagSecondsV8(response.data);
    lastRetryAfterMs = retryAfterMsFromHeaderV8(response.headers?.['retry-after']);
    if (attempts >= maxAttempts) break;
    const requiredWaitMs = Math.max(
      MEDIAWIKI_MAXLAG_MIN_WAIT_MS_V8,
      lastRetryAfterMs ?? 0,
      lastLagSeconds !== null ? lastLagSeconds * 1000 : 0
    );
    if (requiredWaitMs > maxTotalWaitMs - totalWaitMs) break;
    await wait(requiredWaitMs);
    totalWaitMs += requiredWaitMs;
  }
  throw new MediaWikiMaxlagExhaustedErrorV8(
    attempts,
    totalWaitMs,
    lastLagSeconds,
    lastRetryAfterMs
  );
}

const DEFAULT_NARRATIVE_HTTP_USER_AGENT_V8 =
  'TourGuideApp/1.0 (https://github.com/jesusotero1234/tour-guide-app; contact: jesusoteo1234@gmail.com)';

export function narrativeHttpUserAgentV8(): string {
  const override = process.env.NARRATIVE_HTTP_USER_AGENT?.trim();
  if (override && !/(?:example\.|github\.com\/example)/iu.test(override)) return override;
  return DEFAULT_NARRATIVE_HTTP_USER_AGENT_V8;
}

export function narrativeHttpHeadersV8(): Record<string, string> {
  return {
    'User-Agent': narrativeHttpUserAgentV8(),
    'Accept-Encoding': 'gzip',
  };
}
