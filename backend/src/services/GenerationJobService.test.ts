import { GenerationJobService } from './GenerationJobService';

function makeJob(overrides: Record<string, unknown> = {}) {
  return {
    id: 'job-1',
    idempotencyKey: 'key',
    status: 'queued' as const,
    step: 'queued' as const,
    request: {
      city: 'Madrid', country: 'Spain', countryCode: 'ES', theme: 'history', language: 'es', durationMinutes: 120,
    },
    progress: { completedStops: 0, totalStops: 0 },
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('GenerationJobService', () => {
  it('reuses an active idempotent job', async () => {
    const existing = makeJob({ status: 'running', step: 'narrating' });
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(existing),
      create: jest.fn(), findById: jest.fn(), listPending: jest.fn(), update: jest.fn(),
    };
    const service = new GenerationJobService(jobs as any, {} as any, {} as any);
    const result = await service.create(existing.request);

    expect(result).toBe(existing);
    expect(jobs.create).not.toHaveBeenCalled();
  });

  it('publishes a generated tour only when its text audit passed', async () => {
    const queued = makeJob();
    let stored = queued as any;
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async (_id, input) => {
        stored = { ...stored, ...input };
        return stored;
      }),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue({
        id: 'tour-1', city: 'Madrid', theme: 'history', places: [{ id: 'p1' }],
        metadata: { textAudit: { passed: true, score: 90, reasons: [] } },
      }),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(tours.updateStatus).toHaveBeenCalledWith('tour-1', 'published');
    expect(jobs.update).toHaveBeenCalledWith('job-1', expect.objectContaining({ status: 'completed' }));
  });

  it('fails without publishing or delivering a tour that misses the text gate', async () => {
    const queued = makeJob();
    let stored = queued as any;
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      update: jest.fn().mockImplementation(async (_id, input) => {
        stored = { ...stored, ...input };
        return stored;
      }),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue({
        id: 'tour-1', city: 'Madrid', theme: 'history', places: [{ id: 'p1' }],
        metadata: { textAudit: { passed: false, score: 72, reasons: ['repeated_opening'] } },
      }),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(tours.updateStatus).not.toHaveBeenCalled();
    expect(jobs.update).toHaveBeenCalledWith('job-1', expect.objectContaining({
      status: 'failed',
      errorCode: 'CITY_QUALITY_NOT_AVAILABLE',
    }));
    expect(stored.result).toBeUndefined();
  });
});
