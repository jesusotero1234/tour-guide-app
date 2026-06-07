import { getAllCityConcepts, getCityConcepts } from './concepts';

jest.mock('../../services/cityIntelligence/ConceptDiscoveryService', () => ({
  conceptDiscoveryService: {
    getCityConcepts: jest.fn(),
  },
}));

const { conceptDiscoveryService } = jest.requireMock('../../services/cityIntelligence/ConceptDiscoveryService') as {
  conceptDiscoveryService: {
    getCityConcepts: jest.Mock;
  };
};

function createResponse() {
  const res = {
    status: jest.fn(),
    json: jest.fn(),
    setHeader: jest.fn(),
  };

  res.status.mockReturnValue(res);
  res.json.mockReturnValue(res);
  return res;
}

describe('concepts controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('returns public concepts without low confidence entries', async () => {
    conceptDiscoveryService.getCityConcepts.mockResolvedValue({
      city: 'Madrid',
      countryCode: 'ES',
      language: 'es',
      computedAt: new Date().toISOString(),
      concepts: [{ slug: 'madrid-historical-highlights', confidence: 'high' }],
      rejected: [],
    });

    const req = { params: { city: 'Madrid' }, query: { countryCode: 'ES', language: 'es' } } as any;
    const res = createResponse();

    await getCityConcepts(req, res as any);

    expect(conceptDiscoveryService.getCityConcepts).toHaveBeenCalledWith({
      city: 'Madrid',
      countryCode: 'ES',
      language: 'es',
      includeLowConfidence: false,
    });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'public, max-age=86400');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('returns all concepts for the internal route', async () => {
    conceptDiscoveryService.getCityConcepts.mockResolvedValue({
      city: 'Madrid',
      countryCode: 'ES',
      language: 'es',
      computedAt: new Date().toISOString(),
      concepts: [],
      rejected: [{ slug: 'madrid-royal-route', reason: 'low_confidence' }],
    });

    const req = { params: { city: 'Madrid' }, query: { countryCode: 'ES', language: 'es' } } as any;
    const res = createResponse();

    await getAllCityConcepts(req, res as any);

    expect(conceptDiscoveryService.getCityConcepts).toHaveBeenCalledWith({
      city: 'Madrid',
      countryCode: 'ES',
      language: 'es',
      includeLowConfidence: true,
    });
    expect(res.setHeader).toHaveBeenCalledWith('Cache-Control', 'private, max-age=300');
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });
});
