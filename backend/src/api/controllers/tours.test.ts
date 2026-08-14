import { generateTour, getWalkingRoute, listTours } from './tours';
import { CityQualityNotAvailableError } from '../../domain/errors/CityQualityNotAvailableError';
import {
  InvalidTourRouteError,
  WalkingRouteUnavailableError,
} from '../../services/WalkingRouteService';

jest.mock('../../services/orchestrationService', () => ({
  orchestrationService: {
    generateCompleteTour: jest.fn(),
    generateTourFromConcept: jest.fn(),
    retrieveTour: jest.fn(),
    listTours: jest.fn(),
  },
}));

jest.mock('../../services/walkingRouteServiceInstance', () => ({
  walkingRouteService: {
    getRoute: jest.fn(),
  },
}));

const { orchestrationService } = jest.requireMock('../../services/orchestrationService') as {
  orchestrationService: {
    generateCompleteTour: jest.Mock;
    generateTourFromConcept: jest.Mock;
    retrieveTour: jest.Mock;
    listTours: jest.Mock;
  };
};

const { walkingRouteService } = jest.requireMock('../../services/walkingRouteServiceInstance') as {
  walkingRouteService: {
    getRoute: jest.Mock;
  };
};

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('generateTour controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns 422 with structured payload for CITY_QUALITY_NOT_AVAILABLE', async () => {
    orchestrationService.generateCompleteTour.mockRejectedValue(
      new CityQualityNotAvailableError('Kyoto', 'history', {
        passed: false,
        stage: 'output',
        score: 0.48,
        reasons: ['category_collapse', 'route_degraded'],
        signals: {
          routeMaxCategoryShare: 0.88,
          degraded: true,
        },
      })
    );

    const req = {
      body: {
        city: 'Kyoto',
        country: 'Japan',
        countryCode: 'JP',
        theme: 'history',
        language: 'en',
        durationMinutes: 240,
      },
    } as any;
    const res = createResponse();

    await generateTour(req, res as any);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: 'CITY_QUALITY_NOT_AVAILABLE',
        message: 'Todavia no podemos generar un tour de calidad suficiente para esta ciudad.',
        details: {
          city: 'Kyoto',
          theme: 'history',
          reasons: ['category_collapse', 'route_degraded'],
          stage: 'output',
          score: 0.48,
        },
      },
    });
  });
});

describe('generateTourFromConcept controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns 201 with generated concept tour payload', async () => {
    const { generateTourFromConcept } = await import('./tours');

    orchestrationService.generateTourFromConcept.mockResolvedValue({
      id: 'tour-concept-1',
      city: 'Madrid',
      country: 'Spain',
      countryCode: 'ES',
      theme: 'history',
      language: 'es',
      durationMinutes: 120,
      places: [],
      createdAt: new Date().toISOString(),
    });

    const req = {
      body: {
        conceptSlug: 'madrid-historical',
        city: 'Madrid',
        country: 'Spain',
        countryCode: 'ES',
        language: 'es',
        durationMinutes: 120,
      },
    } as any;
    const res = createResponse();

    await generateTourFromConcept(req, res as any);

    expect(orchestrationService.generateTourFromConcept).toHaveBeenCalledWith(req.body);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'tour-concept-1' }));
  });
});

describe('listTours controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('passes readyOnly and countryCode filters to orchestrationService', async () => {
    orchestrationService.listTours.mockResolvedValue({
      success: true,
      data: { tours: [] },
    });

    const req = {
      query: {
        city: 'Madrid',
        countryCode: 'ES',
        language: 'es',
        readyOnly: 'true',
        limit: '12',
      },
    } as any;
    const res = createResponse();

    await listTours(req, res as any);

    expect(orchestrationService.listTours).toHaveBeenCalledWith({
      city: 'Madrid',
      countryCode: 'ES',
      theme: undefined,
      language: 'es',
      readyOnly: true,
      limit: 12,
      offset: undefined,
    });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { tours: [] } });
  });
});

describe('getWalkingRoute controller', () => {
  const publishedTour = {
    id: 'tour-madrid',
    status: 'published',
    places: [
      { id: 'third', position: 2, latitude: 40.4125, longitude: -3.7033 },
      { id: 'first', position: 0, latitude: 40.4168, longitude: -3.7038 },
      { id: 'second', position: 1, latitude: 40.4148, longitude: -3.7074 },
    ],
  };
  const walkingRoute = {
    provider: 'fossgis-osrm-foot',
    geometry: {
      type: 'LineString',
      coordinates: [[-3.7038, 40.4168], [-3.7074, 40.4148]],
    },
    distanceMeters: 3070,
    durationSeconds: 2460,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns route data and preserves the current stop order exactly', async () => {
    orchestrationService.retrieveTour.mockResolvedValue(publishedTour);
    walkingRouteService.getRoute.mockResolvedValue(walkingRoute);
    const res = createResponse();

    await getWalkingRoute({ params: { id: 'tour-madrid' } } as any, res as any);

    expect(walkingRouteService.getRoute).toHaveBeenCalledWith([
      { latitude: 40.4125, longitude: -3.7033 },
      { latitude: 40.4168, longitude: -3.7038 },
      { latitude: 40.4148, longitude: -3.7074 },
    ]);
    expect(res.json).toHaveBeenCalledWith({ data: walkingRoute });
  });

  it('returns TOUR_NOT_FOUND for a missing tour', async () => {
    orchestrationService.retrieveTour.mockRejectedValue(new Error('Failed to retrieve tour: Tour not found'));
    const res = createResponse();

    await getWalkingRoute({ params: { id: 'missing' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'TOUR_NOT_FOUND', message: 'Tour not found' },
    });
    expect(walkingRouteService.getRoute).not.toHaveBeenCalled();
  });

  it('returns TOUR_NOT_FOUND for an unpublished tour', async () => {
    orchestrationService.retrieveTour.mockResolvedValue({ ...publishedTour, status: 'review' });
    const res = createResponse();

    await getWalkingRoute({ params: { id: 'tour-madrid' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'TOUR_NOT_FOUND', message: 'Tour not found' },
    });
    expect(walkingRouteService.getRoute).not.toHaveBeenCalled();
  });

  it('returns INVALID_TOUR_ROUTE for invalid stored coordinates', async () => {
    orchestrationService.retrieveTour.mockResolvedValue(publishedTour);
    walkingRouteService.getRoute.mockRejectedValue(new InvalidTourRouteError());
    const res = createResponse();

    await getWalkingRoute({ params: { id: 'tour-madrid' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(422);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'INVALID_TOUR_ROUTE', message: 'Tour stops do not form a valid walking route' },
    });
  });

  it.each([
    new WalkingRouteUnavailableError(),
    new Error('provider leaked an internal secret'),
  ])('returns a generic WALKING_ROUTE_UNAVAILABLE error for provider failures', async (error) => {
    orchestrationService.retrieveTour.mockResolvedValue(publishedTour);
    walkingRouteService.getRoute.mockRejectedValue(error);
    const res = createResponse();

    await getWalkingRoute({ params: { id: 'tour-madrid' } } as any, res as any);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(res.json).toHaveBeenCalledWith({
      error: { code: 'WALKING_ROUTE_UNAVAILABLE', message: 'Walking route is unavailable' },
    });
  });
});
