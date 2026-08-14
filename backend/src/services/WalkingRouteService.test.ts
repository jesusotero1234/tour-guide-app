import {
  InvalidTourRouteError,
  WalkingRouteService,
  WalkingRouteUnavailableError,
} from './WalkingRouteService';

const STOPS = [
  { latitude: 40.4168, longitude: -3.7038 },
  { latitude: 40.4148, longitude: -3.7074 },
  { latitude: 40.4125, longitude: -3.7033 },
];

const VALID_OSRM_RESPONSE = {
  code: 'Ok',
  routes: [
    {
      distance: 3070.4,
      duration: 2459.6,
      geometry: {
        type: 'LineString',
        coordinates: [
          [-3.7038, 40.4168],
          [-3.705, 40.4155],
          [-3.7074, 40.4148],
          [-3.7033, 40.4125],
        ],
      },
    },
  ],
};

function response(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
  };
}

describe('WalkingRouteService', () => {
  it('requests a full GeoJSON foot route with stops in their supplied order', async () => {
    const fetch = jest.fn().mockResolvedValue(response(VALID_OSRM_RESPONSE));
    const service = new WalkingRouteService({ fetch, minimumRequestIntervalMs: 0 });

    const route = await service.getRoute(STOPS);

    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe(
      'https://routing.openstreetmap.de/routed-foot/route/v1/driving/'
      + '-3.7038,40.4168;-3.7074,40.4148;-3.7033,40.4125'
      + '?overview=full&geometries=geojson&steps=false'
    );
    expect(fetch.mock.calls[0][1]).toEqual(expect.objectContaining({
      headers: expect.objectContaining({
        Accept: 'application/json',
        'User-Agent': expect.stringContaining('TourGuideApp'),
      }),
      signal: expect.any(Object),
    }));
    expect(route).toEqual({
      provider: 'fossgis-osrm-foot',
      geometry: VALID_OSRM_RESPONSE.routes[0].geometry,
      distanceMeters: 3070.4,
      durationSeconds: 2459.6,
    });
  });

  it.each([
    { name: 'fewer than two stops', stops: STOPS.slice(0, 1) },
    {
      name: 'a non-finite coordinate',
      stops: [STOPS[0], { latitude: Number.NaN, longitude: -3.7 }],
    },
    {
      name: 'a latitude outside its range',
      stops: [STOPS[0], { latitude: 91, longitude: -3.7 }],
    },
    {
      name: 'a longitude outside its range',
      stops: [STOPS[0], { latitude: 40.4, longitude: -181 }],
    },
  ])('rejects $name before contacting the provider', async ({ stops }) => {
    const fetch = jest.fn();
    const service = new WalkingRouteService({ fetch });

    await expect(service.getRoute(stops)).rejects.toBeInstanceOf(InvalidTourRouteError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('maps NoRoute to an unavailable error and negatively caches it for 60 seconds', async () => {
    let now = 1000;
    const fetch = jest.fn().mockResolvedValue(response({ code: 'NoRoute', routes: [] }));
    const service = new WalkingRouteService({
      fetch,
      now: () => now,
      minimumRequestIntervalMs: 0,
    });

    await expect(service.getRoute(STOPS)).rejects.toBeInstanceOf(WalkingRouteUnavailableError);
    now += 59_999;
    await expect(service.getRoute(STOPS)).rejects.toBeInstanceOf(WalkingRouteUnavailableError);
    expect(fetch).toHaveBeenCalledTimes(1);

    now += 2;
    await expect(service.getRoute(STOPS)).rejects.toBeInstanceOf(WalkingRouteUnavailableError);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('aborts and maps provider timeouts to an unavailable error', async () => {
    jest.useFakeTimers();
    const fetch = jest.fn((_url: string, init: { signal: AbortSignal }) => (
      new Promise<ReturnType<typeof response>>((_resolve, reject) => {
        init.signal.addEventListener('abort', () => {
          const error = new Error('aborted');
          error.name = 'AbortError';
          reject(error);
        });
      })
    ));
    const service = new WalkingRouteService({
      fetch,
      timeoutMs: 8_000,
      minimumRequestIntervalMs: 0,
    });

    const pendingRoute = expect(service.getRoute(STOPS))
      .rejects.toBeInstanceOf(WalkingRouteUnavailableError);
    await jest.advanceTimersByTimeAsync(8_000);

    await pendingRoute;
    expect(fetch.mock.calls[0][1].signal.aborted).toBe(true);
    jest.useRealTimers();
  });

  it.each([
    {
      name: 'a malformed GeoJSON geometry',
      body: {
        ...VALID_OSRM_RESPONSE,
        routes: [{ ...VALID_OSRM_RESPONSE.routes[0], geometry: { type: 'Point', coordinates: [0, 0] } }],
      },
    },
    {
      name: 'an invalid coordinate in the geometry',
      body: {
        ...VALID_OSRM_RESPONSE,
        routes: [{
          ...VALID_OSRM_RESPONSE.routes[0],
          geometry: { type: 'LineString', coordinates: [[-3.7, 40.4], [200, 40.5]] },
        }],
      },
    },
    {
      name: 'non-finite route metrics',
      body: {
        ...VALID_OSRM_RESPONSE,
        routes: [{ ...VALID_OSRM_RESPONSE.routes[0], distance: '3070' }],
      },
    },
  ])('rejects $name from the provider', async ({ body }) => {
    const fetch = jest.fn().mockResolvedValue(response(body));
    const service = new WalkingRouteService({ fetch, minimumRequestIntervalMs: 0 });

    await expect(service.getRoute(STOPS)).rejects.toBeInstanceOf(WalkingRouteUnavailableError);
  });

  it('caches successful routes for 24 hours', async () => {
    let now = 1000;
    const fetch = jest.fn().mockResolvedValue(response(VALID_OSRM_RESPONSE));
    const service = new WalkingRouteService({
      fetch,
      now: () => now,
      minimumRequestIntervalMs: 0,
    });

    await service.getRoute(STOPS);
    now += 24 * 60 * 60 * 1000 - 1;
    await service.getRoute(STOPS);
    expect(fetch).toHaveBeenCalledTimes(1);

    now += 2;
    await service.getRoute(STOPS);
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it('deduplicates simultaneous requests for the same route', async () => {
    let resolveProvider!: (value: ReturnType<typeof response>) => void;
    const providerResponse = new Promise<ReturnType<typeof response>>((resolve) => {
      resolveProvider = resolve;
    });
    const fetch = jest.fn().mockReturnValue(providerResponse);
    const service = new WalkingRouteService({ fetch, minimumRequestIntervalMs: 0 });

    const first = service.getRoute(STOPS);
    const second = service.getRoute(STOPS);
    resolveProvider(response(VALID_OSRM_RESPONSE));

    await expect(first).resolves.toEqual(expect.objectContaining({
      provider: 'fossgis-osrm-foot',
    }));
    await expect(second).resolves.toEqual(await first);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it('starts new provider requests at least 1.1 seconds apart', async () => {
    let now = 5_000;
    const starts: number[] = [];
    const fetch = jest.fn().mockImplementation(async () => {
      starts.push(now);
      return response(VALID_OSRM_RESPONSE);
    });
    const sleep = jest.fn(async (milliseconds: number) => {
      now += milliseconds;
    });
    const service = new WalkingRouteService({ fetch, now: () => now, sleep });

    await Promise.all([
      service.getRoute(STOPS),
      service.getRoute([
        { latitude: 48.8566, longitude: 2.3522 },
        { latitude: 48.8606, longitude: 2.3376 },
      ]),
    ]);

    expect(starts).toEqual([5_000, 6_100]);
    expect(sleep).toHaveBeenCalledWith(1_100);
  });

  it('evicts the least recently used route when the cache reaches its limit', async () => {
    const fetch = jest.fn().mockResolvedValue(response(VALID_OSRM_RESPONSE));
    const service = new WalkingRouteService({
      fetch,
      maximumCacheEntries: 2,
      minimumRequestIntervalMs: 0,
    });
    const routeA = STOPS;
    const routeB = [STOPS[0], { latitude: 40.42, longitude: -3.71 }];
    const routeC = [STOPS[0], { latitude: 40.43, longitude: -3.72 }];

    await service.getRoute(routeA);
    await service.getRoute(routeB);
    await service.getRoute(routeA);
    await service.getRoute(routeC);
    await service.getRoute(routeB);

    expect(fetch).toHaveBeenCalledTimes(4);
  });
});
