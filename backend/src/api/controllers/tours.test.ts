import { generateTour, listTours } from './tours';
import { CityQualityNotAvailableError } from '../../domain/errors/CityQualityNotAvailableError';

jest.mock('../../services/orchestrationService', () => ({
  orchestrationService: {
    generateCompleteTour: jest.fn(),
    generateTourFromConcept: jest.fn(),
    retrieveTour: jest.fn(),
    listTours: jest.fn(),
  },
}));

const { orchestrationService } = jest.requireMock('../../services/orchestrationService') as {
  orchestrationService: {
    generateCompleteTour: jest.Mock;
    generateTourFromConcept: jest.Mock;
    listTours: jest.Mock;
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
