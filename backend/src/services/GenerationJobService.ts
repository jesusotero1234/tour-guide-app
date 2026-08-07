import { createHash } from 'crypto';
import { GenerationJob } from '../domain/entities/GenerationJob';
import { GenerationJobRepository } from '../domain/repositories/GenerationJobRepository';
import { TourRepository } from '../domain/repositories/TourRepository';
import { TourRequest } from '../types/api';
import { CityQualityNotAvailableError } from '../domain/errors/CityQualityNotAvailableError';
import { TourDurationNotRecommendedError } from '../domain/errors/TourDurationNotRecommendedError';

type TextTourGenerator = {
  generateTextTour(
    request: TourRequest,
    onProgress?: (progress: {
      step: 'routing' | 'planning_narrative' | 'narrating' | 'validating' | 'repairing';
      completedStops: number;
      totalStops: number;
      message: string;
    }) => Promise<void>,
  ): Promise<{ id: string }>;
  retrieveTour(id: string): Promise<{ id: string }>;
};

export class GenerationJobService {
  private readonly activeJobs = new Set<string>();

  constructor(
    private readonly jobs: GenerationJobRepository,
    private readonly tours: TourRepository,
    private readonly generator: TextTourGenerator,
  ) {}

  private buildIdempotencyKey(request: TourRequest): string {
    return createHash('sha256').update(JSON.stringify({
      city: request.city.trim().toLocaleLowerCase(),
      countryCode: request.countryCode.trim().toUpperCase(),
      theme: request.theme.trim().toLocaleLowerCase(),
      language: (request.language || 'en').trim().toLocaleLowerCase(),
      durationMinutes: request.durationMinutes || request.duration || 240,
      pipeline: 'text-v1',
    })).digest('hex');
  }

  async create(request: TourRequest): Promise<GenerationJob> {
    const normalized: TourRequest = {
      ...request,
      city: request.city.trim(),
      country: request.country.trim(),
      countryCode: request.countryCode.trim().toUpperCase(),
      language: request.language || 'en',
      durationMinutes: request.durationMinutes || request.duration || 240,
    };
    const key = this.buildIdempotencyKey(normalized);
    const reusable = await this.jobs.findReusableByKey(key);
    if (reusable && reusable.status !== 'failed') {
      if (reusable.status === 'queued' || reusable.status === 'running') this.schedule(reusable.id);
      return reusable;
    }

    const job = await this.jobs.create({ idempotencyKey: key, request: normalized });
    this.schedule(job.id);
    return job;
  }

  get(id: string): Promise<GenerationJob | null> {
    return this.jobs.findById(id);
  }

  async resumePending(): Promise<void> {
    const pending = await this.jobs.listPending();
    pending.forEach((job) => this.schedule(job.id));
  }

  private schedule(id: string): void {
    if (this.activeJobs.has(id)) return;
    this.activeJobs.add(id);
    setImmediate(() => {
      void this.run(id).finally(() => this.activeJobs.delete(id));
    });
  }

  private async run(id: string): Promise<void> {
    const job = await this.jobs.findById(id);
    if (!job || job.status === 'completed') return;

    const startedAt = new Date().toISOString();
    await this.jobs.update(id, {
      status: 'running',
      step: 'sourcing',
      startedAt,
      progress: { completedStops: 0, totalStops: 0, message: 'Finding reliable places and sources' },
    });

    try {
      let tourId: string;
      let durationResult: Pick<NonNullable<GenerationJob['result']>, 'durationAdapted' | 'requestedDurationMinutes' | 'recommendedDurationMinutes'> = {};
      try {
        const generated = await this.generator.generateTextTour(job.request, async (progress) => {
          await this.jobs.update(id, {
            step: progress.step,
            progress: {
              completedStops: progress.completedStops,
              totalStops: progress.totalStops,
              message: progress.message,
            },
          });
        });
        tourId = generated.id;
      } catch (error) {
        if (!(error instanceof TourDurationNotRecommendedError)) throw error;
        tourId = error.details.draftTourId;
        durationResult = {
          durationAdapted: true,
          requestedDurationMinutes: error.details.requestedDurationMinutes,
          recommendedDurationMinutes: error.details.recommendedDurationMinutes,
        };
      }

      const draft = await this.tours.findById(tourId);
      if (!draft) throw new Error(`Generated tour not found: ${tourId}`);

      await this.jobs.update(id, {
        step: 'validating',
        progress: {
          completedStops: draft.places.length,
          totalStops: draft.places.length,
          message: 'Checking factual quality, voice, and repetition',
        },
      });
      if (!draft.metadata?.textAudit?.passed) {
        throw new CityQualityNotAvailableError(draft.city, draft.theme, {
          passed: false,
          stage: 'output',
          score: (draft.metadata?.textAudit?.score || 0) / 100,
          reasons: draft.metadata?.textAudit?.reasons || ['missing_text_audit'],
        });
      }
      if (draft.metadata.routeDiagnostics?.degraded) {
        throw new CityQualityNotAvailableError(draft.city, draft.theme, {
          passed: false,
          stage: 'output',
          score: draft.metadata.routeDiagnostics.coverageRatio,
          reasons: [draft.metadata.routeDiagnostics.degradationReason || 'route_degraded'],
        });
      }

      await this.jobs.update(id, {
        step: 'publishing',
        progress: {
          completedStops: draft.places.length,
          totalStops: draft.places.length,
          message: 'Publishing the approved text tour',
        },
      });
      await this.tours.updateStatus(tourId, 'published');

      await this.jobs.update(id, {
        status: 'completed',
        step: 'completed',
        tourId,
        result: { tourId, ...durationResult },
        progress: {
          completedStops: draft.places.length,
          totalStops: draft.places.length,
          message: 'Tour ready',
        },
        finishedAt: new Date().toISOString(),
      });
    } catch (error) {
      const qualityError = error instanceof CityQualityNotAvailableError ? error : null;
      await this.jobs.update(id, {
        status: 'failed',
        step: 'failed',
        errorCode: qualityError ? 'CITY_QUALITY_NOT_AVAILABLE' : 'TOUR_GENERATION_ERROR',
        errorMessage: qualityError
          ? 'No pudimos crear un tour con calidad suficiente para esta ciudad.'
          : 'Tour generation failed.',
        errorDetails: qualityError?.details || { reason: error instanceof Error ? error.message : 'unknown_error' },
        progress: { completedStops: 0, totalStops: 0, message: 'Generation stopped' },
        finishedAt: new Date().toISOString(),
      });
    }
  }
}
