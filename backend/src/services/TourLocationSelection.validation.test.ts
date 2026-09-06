import { Request, Response } from 'express';
import { validateCodexTourRequest } from '../api/middleware/validation';

const request = (location?: unknown) => ({
  body: {
    city: 'Seville', country: 'Spain', countryCode: 'ES', theme: 'history',
    language: 'es', durationMinutes: 120,
    ...(location !== undefined ? { location } : {}),
    destination: { qid: 'Q999' }, blueprintRevision: 999,
  },
} as Request);
const location = {
  source: { provider: 'nominatim', osmType: 'relation', osmId: 342563 },
  coordinates: { lat: 37.3886303, lng: -5.9953403 },
};
function response() {
  const res = { status: jest.fn(), json: jest.fn() };
  res.status.mockReturnValue(res);
  return res;
}

describe('generation request location selection', () => {
  it.each([undefined, location])('preserves an optional selection but removes forged canonical identity', value => {
    const req = request(value), res = response(), next = jest.fn();
    validateCodexTourRequest(req, res as unknown as Response, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.body.location).toEqual(value);
    expect(req.body.destination).toBeUndefined();
    expect(req.body.blueprintRevision).toBeUndefined();
    expect(res.status).not.toHaveBeenCalled();
  });
  it.each([null, {}, { ...location, source: { ...location.source, osmId: -1 } },
    { ...location, coordinates: { lat: 91, lng: 0 } }])('rejects malformed selections before job creation', value => {
    const res = response(), next = jest.fn();
    validateCodexTourRequest(request(value), res as unknown as Response, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ code: 'INVALID_LOCATION_SELECTION' }),
    }));
  });
});
