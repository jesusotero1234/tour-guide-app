import axios, { AxiosError, type AxiosRequestConfig } from 'axios';

const USER_AGENT = 'tour-guide-app/1.0 (contact: jesusoteo1234@gmail.com)';
const WIKIDATA_API = 'https://www.wikidata.org/w/api.php';
const MIN_INTERVAL_MS = 1500;
const MAX_RETRIES = 3;
const BASE_BACKOFF_MS = 2000;

let lastRequestTime = 0;
let requestQueue: Promise<void> = Promise.resolve();

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function enforceWikidataRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestTime;
  if (elapsed < MIN_INTERVAL_MS) {
    await sleep(MIN_INTERVAL_MS - elapsed);
  }
  lastRequestTime = Date.now();
}

async function runSerializedWikidataRequest<T>(operation: () => Promise<T>): Promise<T> {
  const previous = requestQueue;
  let release!: () => void;
  requestQueue = new Promise<void>((resolve) => {
    release = resolve;
  });

  await previous;

  try {
    return await operation();
  } finally {
    release();
  }
}

function isRateLimited(error: AxiosError): boolean {
  return error.response?.status === 429;
}

export async function wikidataGet<T = unknown>(config: AxiosRequestConfig): Promise<T> {
  let attempt = 0;

  while (true) {
    try {
      const response = await runSerializedWikidataRequest(async () => {
        await enforceWikidataRateLimit();

        return axios.get<T>(WIKIDATA_API, {
          ...config,
          headers: {
            'User-Agent': USER_AGENT,
            ...(config.headers ?? {}),
          },
          timeout: config.timeout ?? 10000,
        });
      });

      return response.data;
    } catch (err) {
      const axiosErr = err as AxiosError;
      if (!isRateLimited(axiosErr) || attempt >= MAX_RETRIES) {
        throw err;
      }

      const retryAfterHeader = axiosErr.response?.headers?.['retry-after'];
      const retryAfterSeconds = Number(retryAfterHeader);
      const retryDelay = Number.isFinite(retryAfterSeconds) && retryAfterSeconds > 0
        ? retryAfterSeconds * 1000
        : BASE_BACKOFF_MS * (2 ** attempt);

      await sleep(retryDelay);
      attempt += 1;
    }
  }
}
