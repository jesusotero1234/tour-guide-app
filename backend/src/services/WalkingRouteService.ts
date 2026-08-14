const FOSSGIS_FOOT_ROUTE_URL =
  'https://routing.openstreetmap.de/routed-foot/route/v1/driving';
const PROVIDER = 'fossgis-osrm-foot' as const;
const SUCCESS_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const FAILURE_CACHE_TTL_MS = 60 * 1000;

export interface WalkingRouteStop {
  latitude: number;
  longitude: number;
}

export interface WalkingRouteData {
  provider: typeof PROVIDER;
  geometry: {
    type: 'LineString';
    coordinates: Array<[number, number]>;
  };
  distanceMeters: number;
  durationSeconds: number;
}

interface WalkingRouteHttpResponse {
  ok: boolean;
  status: number;
  json(): Promise<unknown>;
}

type WalkingRouteFetch = (
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
) => Promise<WalkingRouteHttpResponse>;

interface WalkingRouteServiceOptions {
  fetch?: WalkingRouteFetch;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
  timeoutMs?: number;
  minimumRequestIntervalMs?: number;
  maximumCacheEntries?: number;
}

type CacheEntry =
  | { expiresAt: number; route: WalkingRouteData }
  | { expiresAt: number; route: null };

export class InvalidTourRouteError extends Error {
  constructor() {
    super('Tour stops do not form a valid walking route');
    this.name = 'InvalidTourRouteError';
  }
}

export class WalkingRouteUnavailableError extends Error {
  constructor() {
    super('Walking route is unavailable');
    this.name = 'WalkingRouteUnavailableError';
  }
}

function defaultFetch(
  url: string,
  init: { headers: Record<string, string>; signal: AbortSignal }
): Promise<WalkingRouteHttpResponse> {
  return fetch(url, init);
}

function defaultSleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function isCoordinate(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && typeof value[0] === 'number'
    && Number.isFinite(value[0])
    && value[0] >= -180
    && value[0] <= 180
    && typeof value[1] === 'number'
    && Number.isFinite(value[1])
    && value[1] >= -90
    && value[1] <= 90;
}

function parseRouteResponse(value: unknown): WalkingRouteData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;

  const response = value as Record<string, unknown>;
  if (response.code !== 'Ok' || !Array.isArray(response.routes) || response.routes.length === 0) {
    return null;
  }

  const candidate = response.routes[0];
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;

  const route = candidate as Record<string, unknown>;
  const geometry = route.geometry;
  if (!geometry || typeof geometry !== 'object' || Array.isArray(geometry)) return null;

  const geoJson = geometry as Record<string, unknown>;
  if (
    geoJson.type !== 'LineString'
    || !Array.isArray(geoJson.coordinates)
    || geoJson.coordinates.length < 2
    || !geoJson.coordinates.every(isCoordinate)
    || typeof route.distance !== 'number'
    || !Number.isFinite(route.distance)
    || route.distance < 0
    || typeof route.duration !== 'number'
    || !Number.isFinite(route.duration)
    || route.duration < 0
  ) {
    return null;
  }

  return {
    provider: PROVIDER,
    geometry: {
      type: 'LineString',
      coordinates: geoJson.coordinates as Array<[number, number]>,
    },
    distanceMeters: route.distance,
    durationSeconds: route.duration,
  };
}

function validateStops(stops: readonly WalkingRouteStop[]): void {
  if (stops.length < 2) throw new InvalidTourRouteError();

  const valid = stops.every((stop) => (
    Number.isFinite(stop.latitude)
    && stop.latitude >= -90
    && stop.latitude <= 90
    && Number.isFinite(stop.longitude)
    && stop.longitude >= -180
    && stop.longitude <= 180
  ));

  if (!valid) throw new InvalidTourRouteError();
}

export class WalkingRouteService {
  private readonly fetch: WalkingRouteFetch;
  private readonly now: () => number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private readonly timeoutMs: number;
  private readonly minimumRequestIntervalMs: number;
  private readonly maximumCacheEntries: number;
  private readonly cache = new Map<string, CacheEntry>();
  private readonly inFlight = new Map<string, Promise<WalkingRouteData>>();
  private providerQueue: Promise<void> = Promise.resolve();
  private nextProviderRequestAt = 0;

  constructor(options: WalkingRouteServiceOptions = {}) {
    this.fetch = options.fetch ?? defaultFetch;
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.timeoutMs = options.timeoutMs ?? 8_000;
    this.minimumRequestIntervalMs = options.minimumRequestIntervalMs ?? 1_100;
    this.maximumCacheEntries = options.maximumCacheEntries ?? 250;
  }

  async getRoute(stops: readonly WalkingRouteStop[]): Promise<WalkingRouteData> {
    validateStops(stops);
    const key = stops.map((stop) => `${stop.longitude},${stop.latitude}`).join(';');
    const cached = this.readCache(key);
    if (cached) {
      if (!cached.route) throw new WalkingRouteUnavailableError();
      return cached.route;
    }

    const existingRequest = this.inFlight.get(key);
    if (existingRequest) return existingRequest;

    const request = this.requestAndCache(key);
    this.inFlight.set(key, request);

    try {
      return await request;
    } finally {
      this.inFlight.delete(key);
    }
  }

  private readCache(key: string): CacheEntry | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    if (entry.expiresAt <= this.now()) {
      this.cache.delete(key);
      return null;
    }

    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  private writeCache(key: string, entry: CacheEntry): void {
    this.cache.delete(key);
    this.cache.set(key, entry);

    while (this.cache.size > this.maximumCacheEntries) {
      const oldestKey = this.cache.keys().next().value as string | undefined;
      if (!oldestKey) break;
      this.cache.delete(oldestKey);
    }
  }

  private async requestAndCache(key: string): Promise<WalkingRouteData> {
    try {
      const route = await this.scheduleProviderRequest(() => this.requestProvider(key));
      this.writeCache(key, {
        expiresAt: this.now() + SUCCESS_CACHE_TTL_MS,
        route,
      });
      return route;
    } catch {
      this.writeCache(key, {
        expiresAt: this.now() + FAILURE_CACHE_TTL_MS,
        route: null,
      });
      throw new WalkingRouteUnavailableError();
    }
  }

  private scheduleProviderRequest<T>(request: () => Promise<T>): Promise<T> {
    const scheduled = this.providerQueue.then(async () => {
      const waitMs = Math.max(0, this.nextProviderRequestAt - this.now());
      if (waitMs > 0) await this.sleep(waitMs);

      this.nextProviderRequestAt = this.now() + this.minimumRequestIntervalMs;
      return request();
    });

    this.providerQueue = scheduled.then(() => undefined, () => undefined);
    return scheduled;
  }

  private async requestProvider(coordinates: string): Promise<WalkingRouteData> {
    const controller = new AbortController();
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const timeoutFailure = new Promise<never>((_resolve, reject) => {
      timeout = setTimeout(() => {
        controller.abort();
        reject(new WalkingRouteUnavailableError());
      }, this.timeoutMs);
    });

    try {
      const providerRequest = async () => {
        const response = await this.fetch(
          `${FOSSGIS_FOOT_ROUTE_URL}/${coordinates}`
          + '?overview=full&geometries=geojson&steps=false',
          {
            headers: {
              Accept: 'application/json',
              'User-Agent': 'TourGuideApp/1.0 walking-route-proxy',
            },
            signal: controller.signal,
          }
        );

        if (!response.ok) throw new WalkingRouteUnavailableError();
        return response.json();
      };

      const payload = await Promise.race([providerRequest(), timeoutFailure]);
      const route = parseRouteResponse(payload);
      if (!route) throw new WalkingRouteUnavailableError();
      return route;
    } finally {
      if (timeout) clearTimeout(timeout);
    }
  }
}
