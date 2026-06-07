import { getFlexiblePassOptions, listFlexiblePassCities, quoteFlexiblePass } from './passes';

jest.mock('../../services/orchestrationService', () => ({
  orchestrationService: {
    listFlexiblePassCities: jest.fn(),
    getFlexiblePassOptions: jest.fn(),
    quoteFlexiblePass: jest.fn(),
  },
}));

const { orchestrationService } = jest.requireMock('../../services/orchestrationService') as {
  orchestrationService: {
    listFlexiblePassCities: jest.Mock;
    getFlexiblePassOptions: jest.Mock;
    quoteFlexiblePass: jest.Mock;
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

describe('passes controller', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('lists flexible pass cities', async () => {
    orchestrationService.listFlexiblePassCities.mockResolvedValue([{ city: 'Madrid' }]);
    const req = { query: { language: 'es' } } as any;
    const res = createResponse();

    await listFlexiblePassCities(req, res as any);

    expect(orchestrationService.listFlexiblePassCities).toHaveBeenCalledWith('es');
    expect(res.json).toHaveBeenCalledWith({ success: true, data: [{ city: 'Madrid' }] });
  });

  it('gets flexible pass options', async () => {
    orchestrationService.getFlexiblePassOptions.mockResolvedValue({ city: 'Madrid', tours: [] });
    const req = { query: { city: 'Madrid', countryCode: 'ES', language: 'es' } } as any;
    const res = createResponse();

    await getFlexiblePassOptions(req, res as any);

    expect(orchestrationService.getFlexiblePassOptions).toHaveBeenCalledWith({ city: 'Madrid', countryCode: 'ES', language: 'es' });
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { city: 'Madrid', tours: [] } });
  });

  it('quotes a flexible pass selection', async () => {
    orchestrationService.quoteFlexiblePass.mockResolvedValue({ passPriceCents: 1499 });
    const req = { body: { city: 'Madrid', countryCode: 'ES', language: 'es', tourIds: ['a', 'b', 'c'] } } as any;
    const res = createResponse();

    await quoteFlexiblePass(req, res as any);

    expect(orchestrationService.quoteFlexiblePass).toHaveBeenCalledWith(req.body);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { passPriceCents: 1499 } });
  });
});
