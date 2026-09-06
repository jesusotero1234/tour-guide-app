jest.mock('../../services/generationJobServiceInstance', () => ({
  generationJobService: { get: jest.fn(), create: jest.fn() },
}));
import { getGenerationJob, createGenerationJob } from './generationJobs';
import { generationJobService } from '../../services/generationJobServiceInstance';
const id = '12345678-1234-1234-1234-123456789abc';
function response() { return { status: jest.fn().mockReturnThis(), json: jest.fn() }; }
beforeEach(() => jest.clearAllMocks());
it('rejects malformed job ids without touching the database', async () => {
  const res = response();
  await getGenerationJob({ params: { id: 'invalid' } } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(400);
  expect(generationJobService.get).not.toHaveBeenCalled();
});
it('returns 404 for missing jobs so the frontend can stop polling', async () => {
  (generationJobService.get as jest.Mock).mockResolvedValue(null);
  const res = response();
  await getGenerationJob({ params: { id } } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(404);
});
it('preserves reviewRequired on completed draft responses', async () => {
  (generationJobService.create as jest.Mock).mockResolvedValue({
    id, status: 'completed', step: 'completed', result: { tourId: id, reviewRequired: true },
    progress: { completedStops: 2, totalStops: 2 },
  });
  const res = response();
  await createGenerationJob({ body: {} } as any, res as any);
  expect(res.status).toHaveBeenCalledWith(200);
  expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ result: { tourId: id, reviewRequired: true } }));
});
