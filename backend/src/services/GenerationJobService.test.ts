import { GenerationJobService } from './GenerationJobService';

const FIXTURE_PROSE = 'This is a deterministic, generic, and neutral fixture prose block designed to satisfy the minimum word count requirement for testing purposes. It contains no specific historical facts, cultural references, or location-specific details, ensuring that the test remains focused on the structural and validation logic rather than content accuracy. The text is intentionally repetitive and bland to avoid triggering any content-based quality checks that might interfere with the primary test objective. It serves as a placeholder for the actual narrative content that would be generated in a production environment, allowing the test to verify that the system correctly handles tours with sufficient text length without relying on specific semantic content. This approach ensures that the test is reproducible and independent of external data sources or model outputs.';

function makeTour(overrides: Record<string, unknown> = {}) {
  const places = Array.from({ length: 5 }, (_, i) => ({
    id: `p${i + 1}`,
    name: `Place ${i + 1}`,
    description: `${FIXTURE_PROSE}\n\n${FIXTURE_PROSE}`,
  }));
  return {
    id: 'tour-1',
    city: 'Madrid',
    country: 'Spain', countryCode: 'ES', language: 'es', durationMinutes: 120,
    theme: 'history',
    status: 'published',
    introduction: 'A valid introduction for the tour.',
    places,
    metadata: {
      textAudit: { passed: true, score: 90, reasons: [] },
      routeDiagnostics: { degraded: false },
    },
    ...overrides,
  };
}

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
  it('explains an infeasible route without publishing or proposing silent duration changes', async () => {
    const queued = makeJob();
    const jobs = {
      findReusableByKey: jest.fn(async()=>null), create:jest.fn(async()=>queued),
      findById:jest.fn(async()=>queued), claim:jest.fn(async()=>true),
      renewLease:jest.fn(async()=>true), updateOwned:jest.fn(async()=>true),
      completeOwned:jest.fn(),
    };
    const generator = {generateTextTour:jest.fn(async()=>{throw new Error('TOUR_ROUTE_UNAVAILABLE');})};
    const service = new GenerationJobService(jobs as any, {} as any, generator);
    const log = jest.spyOn(console,'error').mockImplementation(()=>{});
    try {
      await service.create(queued.request);
      await new Promise(resolve=>setImmediate(resolve));
      await new Promise(resolve=>setImmediate(resolve));
      expect(jobs.updateOwned).toHaveBeenCalledWith('job-1',expect.any(String),expect.objectContaining({
        status:'failed',errorCode:'TOUR_ROUTE_UNAVAILABLE',errorMessage:expect.stringContaining('another duration'),
      }));
      expect(jobs.completeOwned).not.toHaveBeenCalled();
    } finally { log.mockRestore(); }
  });
  it('reuses an active idempotent job', async () => {
    const existing = makeJob({ status: 'running', step: 'narrating' });
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(existing),
      create: jest.fn(), findById: jest.fn(), listPending: jest.fn(),
      claim: jest.fn(), renewLease: jest.fn(), updateOwned: jest.fn(), completeOwned: jest.fn(),
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
      claim: jest.fn().mockResolvedValue(true),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockImplementation(async (_id, _owner, input) => {
        stored = { ...stored, ...input };
        return true;
      }),
      completeOwned: jest.fn().mockImplementation(async (_id, _owner, _tourId, input) => {
        stored = { ...stored, ...input };
        return true;
      }),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour()),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(jobs.completeOwned).toHaveBeenCalledWith('job-1', expect.any(String), 'tour-1', expect.objectContaining({ status: 'completed' }));
    expect(tours.updateStatus).not.toHaveBeenCalled();
  });

  it('fails without publishing or delivering a tour that misses the text gate', async () => {
    const queued = makeJob();
    let stored = queued as any;
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockResolvedValue(true),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockImplementation(async (_id, _owner, input) => {
        stored = { ...stored, ...input };
        return true;
      }),
      completeOwned: jest.fn().mockResolvedValue(true),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour({
        metadata: { textAudit: { passed: false, score: 72, reasons: ['repeated_opening'] }, routeDiagnostics: { degraded: false } },
      })),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(tours.updateStatus).not.toHaveBeenCalled();
    expect(jobs.updateOwned).toHaveBeenCalledWith('job-1', expect.any(String), expect.objectContaining({
      status: 'failed',
      errorCode: 'CITY_QUALITY_NOT_AVAILABLE',
    }));
    expect(stored.result).toBeUndefined();
  });

  it('executes generator exactly once for concurrent creates of same queued job', async () => {
    const queued = makeJob();
    let stored = queued as any;
    const sharedJobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockImplementation(async (id, owner) => {
        if (stored.owner === undefined) {
          stored.owner = owner;
          return true;
        }
        return stored.owner === owner;
      }),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockImplementation(async (_id, _owner, input) => {
        stored = { ...stored, ...input };
        return true;
      }),
      completeOwned: jest.fn().mockImplementation(async (_id, _owner, _tourId, input) => {
        stored = { ...stored, ...input };
        return true;
      }),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour()),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };

    const service1 = new GenerationJobService(sharedJobs as any, tours as any, generator as any);
    const service2 = new GenerationJobService(sharedJobs as any, tours as any, generator as any);

    const [r1, r2] = await Promise.all([
      service1.create(queued.request),
      service2.create(queued.request),
    ]);

    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(r1).toBe(r2);
    expect(generator.generateTextTour).toHaveBeenCalledTimes(1);
    expect(sharedJobs.completeOwned).toHaveBeenCalledTimes(1);
  });

  it('does not run generator when claim fails', async () => {
    const queued = makeJob();
    let stored = queued as any;
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockResolvedValue(false),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockResolvedValue(true),
      completeOwned: jest.fn().mockResolvedValue(true),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour()),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(generator.generateTextTour).not.toHaveBeenCalled();
    expect(jobs.completeOwned).not.toHaveBeenCalled();
  });

  it('stops without completion or failed state when ownership is lost during progress', async () => {
    const queued = makeJob();
    let stored = queued as any;
    let updateOwnedCallCount = 0;
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockResolvedValue(true),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockImplementation(async (_id, _owner, input) => {
        updateOwnedCallCount++;
        if (updateOwnedCallCount === 2) {
          return false;
        }
        stored = { ...stored, ...input };
        return true;
      }),
      completeOwned: jest.fn().mockResolvedValue(true),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour()),
      updateStatus: jest.fn().mockResolvedValue(undefined),
    };
    const generator = {
      generateTextTour: jest.fn().mockImplementation(async (_req, onProgress) => {
        await onProgress({ step: 'narrating', completedStops: 1, totalStops: 10, message: 'Narrating' });
        return { id: 'tour-1' };
      }),
      retrieveTour: jest.fn(),
    };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(jobs.completeOwned).not.toHaveBeenCalled();
    expect(jobs.updateOwned).not.toHaveBeenCalledWith('job-1', expect.any(String), expect.objectContaining({ status: 'failed' }));
  });

  it('settles without unhandled rejection when findById rejects', async () => {
    const queued = makeJob();
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockRejectedValue(new Error('db down')),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockResolvedValue(true),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockResolvedValue(true),
      completeOwned: jest.fn().mockResolvedValue(true),
    };
    const tours = { findById: jest.fn(), updateStatus: jest.fn() };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(generator.generateTextTour).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('settles without unhandled rejection when claim rejects', async () => {
    const queued = makeJob();
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockResolvedValue(queued),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockRejectedValue(new Error('claim failed')),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockResolvedValue(true),
      completeOwned: jest.fn().mockResolvedValue(true),
    };
    const tours = { findById: jest.fn(), updateStatus: jest.fn() };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(generator.generateTextTour).not.toHaveBeenCalled();
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
  });

  it('resets completed job with deleted tour and returns queued', async () => {
    const completed = makeJob({ status: 'completed', result: { tourId: 'tour-1' } });
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(completed),
      create: jest.fn(),
      findById: jest.fn(),
      listPending: jest.fn(),
      claim: jest.fn().mockResolvedValue(false),
      renewLease: jest.fn(),
      updateOwned: jest.fn(),
      completeOwned: jest.fn(),
      resetCompleted: jest.fn().mockImplementation(() => {
        jobs.findReusableByKey.mockResolvedValue(makeJob());
        return true;
      }),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(null),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const result = await service.create(completed.request);

    expect(jobs.resetCompleted).toHaveBeenCalledWith('job-1', completed.updatedAt);
    expect(result.status).toBe('queued');
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it('resets completed job with archived tour and returns queued', async () => {
    const completed = makeJob({ status: 'completed', result: { tourId: 'tour-1' } });
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(completed),
      create: jest.fn(),
      findById: jest.fn(),
      listPending: jest.fn(),
      claim: jest.fn().mockResolvedValue(false),
      renewLease: jest.fn(),
      updateOwned: jest.fn(),
      completeOwned: jest.fn(),
      resetCompleted: jest.fn().mockImplementation(() => {
        jobs.findReusableByKey.mockResolvedValue(makeJob());
        return true;
      }),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour({ status: 'archived' })),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const result = await service.create(completed.request);

    expect(jobs.resetCompleted).toHaveBeenCalledWith('job-1', completed.updatedAt);
    expect(result.status).toBe('queued');
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it('resets completed job with missing result and returns queued', async () => {
    const completed = makeJob({ status: 'completed', result: undefined });
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(completed),
      create: jest.fn(),
      findById: jest.fn(),
      listPending: jest.fn(),
      claim: jest.fn().mockResolvedValue(false),
      renewLease: jest.fn(),
      updateOwned: jest.fn(),
      completeOwned: jest.fn(),
      resetCompleted: jest.fn().mockImplementation(() => {
        jobs.findReusableByKey.mockResolvedValue(makeJob());
        return true;
      }),
    };
    const tours = {
      findById: jest.fn(),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const result = await service.create(completed.request);

    expect(jobs.resetCompleted).toHaveBeenCalledWith('job-1', completed.updatedAt);
    expect(result.status).toBe('queued');
    expect(jobs.claim).not.toHaveBeenCalled();
  });

  it('returns failed for completed job with missing result in get without calling resetCompleted', async () => {
    const completed = makeJob({ status: 'completed', result: undefined });
    const jobs = {
      findById: jest.fn().mockResolvedValue(completed),
      resetCompleted: jest.fn(),
    };
    const tours = {
      findById: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const result = await service.get('job-1');

    expect(result).toEqual(expect.objectContaining({
      status: 'failed',
      errorCode: 'GENERATION_RESULT_UNAVAILABLE',
      result: undefined,
    }));
    expect(jobs.resetCompleted).not.toHaveBeenCalled();
    expect(tours.findById).not.toHaveBeenCalled();
  });

  it('returns existing completed job with valid ready tour without resetting or generating', async () => {
    const completed = makeJob({ status: 'completed', result: { tourId: 'tour-1' } });
    const jobs = {
      findById: jest.fn().mockResolvedValue(completed),
      resetCompleted: jest.fn(),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour()),
    };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const result = await service.get('job-1');

    expect(result).toBe(completed);
    expect(jobs.resetCompleted).not.toHaveBeenCalled();
    expect(generator.generateTextTour).not.toHaveBeenCalled();
  });

  it('handles create race where jobs.create returns completed invalid job', async () => {
    const completedInvalid = makeJob({ status: 'completed', result: { tourId: 'tour-1' } });
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(completedInvalid),
      findById: jest.fn(),
      listPending: jest.fn(),
      claim: jest.fn().mockResolvedValue(false),
      renewLease: jest.fn(),
      updateOwned: jest.fn(),
      completeOwned: jest.fn(),
      resetCompleted: jest.fn().mockImplementation(() => {
        jobs.findReusableByKey.mockResolvedValue(makeJob());
        return true;
      }),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour({ status: 'archived' })),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    const result = await service.create(completedInvalid.request);

    expect(jobs.resetCompleted).toHaveBeenCalledWith('job-1', completedInvalid.updatedAt);
    expect(result.status).toBe('queued');
    expect(result).not.toBe(completedInvalid);
  });

  it('throws bounded error on repeated CAS conflicts', async () => {
    const completedInvalid = makeJob({ status: 'completed', result: { tourId: 'tour-1' } });
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(completedInvalid),
      create: jest.fn(),
      findById: jest.fn(),
      listPending: jest.fn(),
      claim: jest.fn().mockResolvedValue(false),
      renewLease: jest.fn(),
      updateOwned: jest.fn(),
      completeOwned: jest.fn(),
      resetCompleted: jest.fn().mockResolvedValue(false),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour({ status: 'archived' })),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn(), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await expect(service.create(completedInvalid.request)).rejects.toThrow('Generation job changed while checking its result. Please retry.');
    expect(jobs.resetCompleted).toHaveBeenCalledTimes(3);
  });

  it('rejects publication when route diagnostics are missing', async () => {
    const queued = makeJob();
    let stored = queued as any;
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockResolvedValue(true),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockImplementation(async (_id, _owner, input) => {
        stored = { ...stored, ...input };
        return true;
      }),
      completeOwned: jest.fn().mockResolvedValue(true),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour({
        metadata: { textAudit: { passed: true, score: 90, reasons: [] }, routeDiagnostics: undefined },
      })),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(jobs.updateOwned).toHaveBeenCalledWith('job-1', expect.any(String), expect.objectContaining({
      status: 'failed',
      errorCode: 'CITY_QUALITY_NOT_AVAILABLE',
    }));
    expect(stored.result).toBeUndefined();
  });

  it('rejects publication when too few stops', async () => {
    const queued = makeJob();
    let stored = queued as any;
    const jobs = {
      findReusableByKey: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue(queued),
      findById: jest.fn().mockImplementation(async () => stored),
      listPending: jest.fn().mockResolvedValue([]),
      claim: jest.fn().mockResolvedValue(true),
      renewLease: jest.fn().mockResolvedValue(true),
      updateOwned: jest.fn().mockImplementation(async (_id, _owner, input) => {
        stored = { ...stored, ...input };
        return true;
      }),
      completeOwned: jest.fn().mockResolvedValue(true),
    };
    const tours = {
      findById: jest.fn().mockResolvedValue(makeTour({
        places: [{ id: 'p1', name: 'Place 1', description: FIXTURE_PROSE }],
      })),
      updateStatus: jest.fn(),
    };
    const generator = { generateTextTour: jest.fn().mockResolvedValue({ id: 'tour-1' }), retrieveTour: jest.fn() };
    const service = new GenerationJobService(jobs as any, tours as any, generator as any);

    await service.create(queued.request);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));

    expect(jobs.updateOwned).toHaveBeenCalledWith('job-1', expect.any(String), expect.objectContaining({
      status: 'failed',
      errorCode: 'CITY_QUALITY_NOT_AVAILABLE',
    }));
    expect(stored.result).toBeUndefined();
  });
});
