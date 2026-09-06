import { createHash, randomUUID } from 'crypto';
import { GenerationJob } from '../domain/entities/GenerationJob';
import { GenerationJobRepository } from '../domain/repositories/GenerationJobRepository';
import { TourRepository } from '../domain/repositories/TourRepository';
import { TourRequest } from '../types/api';
import { CityQualityNotAvailableError } from '../domain/errors/CityQualityNotAvailableError';
import { TourDurationNotRecommendedError } from '../domain/errors/TourDurationNotRecommendedError';
import { TourGenerationAttemptError } from './CodexTourProcess';
import { publicationProblems, isPublishedTourReady } from './tourReadiness/publicationReadiness';
import { Tour } from '../domain/entities/Tour';

type TextTourGenerator = {
  generateTextTour(
    request: TourRequest,
    onProgress?: (progress: {
      step: 'routing' | 'planning_narrative' | 'narrating' | 'validating' | 'repairing';
      completedStops: number;
      totalStops: number;
      message: string;
    }) => Promise<void>,
    signal?: AbortSignal,
    budget?: { limitUsd: number },
  ): Promise<{ id: string; reviewRequired?: boolean; accountedUsd?: number }>;
  readonly pipelineVersion?: string;
  prepareRequest?(request: TourRequest): Promise<TourRequest>;
  isReusableTour?(tour: Tour): Promise<boolean>;
  readonly usesBudget?: boolean;
};

export class GenerationJobService {
  private readonly activeJobs = new Set<string>();

  constructor(
    private readonly jobs: GenerationJobRepository,
    private readonly tours: TourRepository,
    private readonly generator: TextTourGenerator,
  ) {}

  private async isReusableResult(job: GenerationJob, tour: Tour | null): Promise<boolean> {
    if (tour) {
      if (tour.language !== job.request.language) return false;
      if (tour.theme !== job.request.theme) return false;
      if (tour.durationMinutes !== job.request.durationMinutes) return false;
      if (tour.countryCode !== job.request.countryCode) return false;
      if (this.generator.isReusableTour) {
        const reusable = await this.generator.isReusableTour(tour);
        if (!reusable) return false;
      }
    }
    if (this.generator.pipelineVersion && tour?.metadata?.generationPipeline !== this.generator.pipelineVersion) {
      return false;
    }
    if (job.result?.reviewRequired) {
      if (tour?.status === 'published') return isPublishedTourReady(tour);
      if (tour?.status !== 'review') return false;
      if (tour?.metadata?.codexAuthor?.publicationPassed !== false) return false;
      const nonEmptyPlaces = tour?.places.filter((p) => p.description?.trim()).length ?? 0;
      if (nonEmptyPlaces < 2) return false;
      return true;
    }
    return isPublishedTourReady(tour);
  }

  private buildIdempotencyKey(request: TourRequest): string {
    const keyFields: Record<string, string | number> = {
      city: request.city.trim().toLocaleLowerCase(),
      countryCode: request.countryCode.trim().toUpperCase(),
      theme: request.theme.trim().toLocaleLowerCase(),
      language: (request.language || 'en').trim().toLocaleLowerCase(),
      durationMinutes: request.durationMinutes || request.duration || 240,
      pipeline: this.generator.pipelineVersion || 'text-v1',
    };
    if (request.destination?.qid) {
      keyFields.destinationQid = request.destination.qid;
      keyFields.researchPolicy = request.destination.policyVersion;
    }
    if (request.blueprintRevision) {
      keyFields.blueprintRevision = request.blueprintRevision;
    }
    return createHash('sha256').update(JSON.stringify(keyFields)).digest('hex');
  }

  async create(request: TourRequest): Promise<GenerationJob> {
    let normalized: TourRequest = {
      ...request,
      city: request.city.trim(),
      country: request.country.trim(),
      countryCode: request.countryCode.trim().toUpperCase(),
      language: request.language || 'en',
      durationMinutes: request.durationMinutes || request.duration || 240,
    };
    if (this.generator.prepareRequest) {
      normalized = await this.generator.prepareRequest(normalized);
    }
    const key = this.buildIdempotencyKey(normalized);
    for (let attempt = 0; attempt < 3; attempt++) {
      let job = await this.jobs.findReusableByKey(key);
      if (!job || job.status === 'failed') {
        job = await this.jobs.create({ idempotencyKey: key, request: normalized });
      }
      if (job.status === 'completed') {
        if (job.result?.tourId) {
          const tour = await this.tours.findById(job.result.tourId);
          if (await this.isReusableResult(job, tour)) {
            return job;
          }
        }
        await this.jobs.resetCompleted(job.id, job.updatedAt);
        continue;
      }
      if (job.status === 'queued' || job.status === 'running') {
        this.schedule(job.id);
        return job;
      }
    }
    throw new Error('Generation job changed while checking its result. Please retry.');
  }

  async get(id: string): Promise<GenerationJob | null> {
    const job = await this.jobs.findById(id);
    if (!job) return null;
    if (job.status === 'completed') {
      if (!job.result?.tourId) {
        return {
          ...job,
          status: 'failed',
          step: 'failed',
          result: undefined,
          errorCode: 'GENERATION_RESULT_UNAVAILABLE',
          errorMessage: 'The generated tour is not available for publication.',
        };
      }
      const tour = await this.tours.findById(job.result.tourId);
      if (!(await this.isReusableResult(job, tour))) {
        return {
          ...job,
          status: 'failed',
          step: 'failed',
          result: undefined,
          errorCode: 'GENERATION_RESULT_UNAVAILABLE',
          errorMessage: 'The generated tour is not available for publication.',
        };
      }
    }
    if (job.status === 'queued' || job.status === 'running') {
      this.schedule(job.id);
    }
    return job;
  }

  async resumePending(): Promise<void> {
    const pending = await this.jobs.listPending();
    pending.forEach((job) => this.schedule(job.id));
  }

  private schedule(id: string): void {
    if (this.activeJobs.has(id)) return;
    this.activeJobs.add(id);
    setImmediate(() => {
      this.run(id).catch((error) => {
        console.error(`Generation job ${id} failed:`, error);
      }).finally(() => this.activeJobs.delete(id));
    });
  }

  private async run(id: string): Promise<void> {
    const owner = randomUUID();
    const abortController = new AbortController();
    let claimed = false;
    let leaseLost = false;
    let renewing = false;
    let renewalTimer: NodeJS.Timeout | null = null;

    try {
      let job = await this.jobs.findById(id);
      if (!job || job.status === 'completed') return;

      const claimedFlag = await this.jobs.claim(id, owner, 120000);
      if (!claimedFlag) return;
      claimed = true;

      job = await this.jobs.findById(id);
      if (!job) return;

      const startedAt = new Date().toISOString();
      let budgetLimitUsd: number | undefined;
      let budgetPreviousUsd: number | undefined;
      let budgetRemainingUsd: number | undefined;
      let budgetAttempts: number | undefined;

      if (this.generator.usesBudget) {
        const limit = job.spendLimitUsd ?? Number(process.env.TOUR_GENERATION_SPEND_LIMIT_USD ?? '2');
        const previous = job.accountedSpendUsd ?? 0;
        const remaining = limit - previous;
        const attempts = job.attemptCount ?? 0;
        if (!Number.isFinite(limit) || limit <= 0 || !Number.isFinite(previous) || previous < 0 || !Number.isFinite(remaining) || remaining <= 1e-9 || attempts >= 2) {
          throw new Error('TOUR_BUDGET_EXHAUSTED');
        }
        budgetLimitUsd = limit;
        budgetPreviousUsd = previous;
        budgetRemainingUsd = remaining;
        budgetAttempts = attempts;
      }

      const initialUpdate = await this.jobs.updateOwned(id, owner, {
        status: 'running',
        step: 'sourcing',
        startedAt,
        progress: { completedStops: 0, totalStops: 0, message: 'Finding reliable places and sources' },
        ...(this.generator.usesBudget ? {
          accountedSpendUsd: budgetLimitUsd,
          spendLimitUsd: budgetLimitUsd,
          attemptCount: (budgetAttempts ?? 0) + 1,
        } : {}),
      });
      if (!initialUpdate) {
        leaseLost = true;
        return;
      }

      renewalTimer = setInterval(() => {
        if (renewing || leaseLost) return;
        renewing = true;
        this.jobs.renewLease(id, owner, 120000).then((ok) => {
          if (!ok) {
            leaseLost = true;
            abortController.abort();
          }
        }).catch(() => {
          leaseLost = true;
          abortController.abort();
        }).finally(() => {
          renewing = false;
        });
      }, 30000);
      renewalTimer.unref();

      let tourId: string;
      let reviewRequired = false;
      let durationResult: Pick<NonNullable<GenerationJob['result']>, 'durationAdapted' | 'requestedDurationMinutes' | 'recommendedDurationMinutes'> = {};
      let lastLoggedProgressKey: string | null = null;
      try {
        const generated = await this.generator.generateTextTour(job.request, async (progress) => {
          if (leaseLost) throw new Error('Lease lost');
          const ok = await this.jobs.updateOwned(id, owner, {
            step: progress.step,
            progress: {
              completedStops: progress.completedStops,
              totalStops: progress.totalStops,
              message: progress.message,
            },
          });
          if (!ok) {
            leaseLost = true;
            abortController.abort();
            throw new Error('Lease lost');
          }
          if (process.env.TOUR_VERBOSE === '1') {
            const key = `${progress.step}|${progress.completedStops}|${progress.totalStops}|${progress.message}`;
            if (lastLoggedProgressKey !== key) {
              lastLoggedProgressKey = key;
              console.log(`[TOUR] Job ${id} step=${progress.step} completedStops=${progress.completedStops} totalStops=${progress.totalStops} message="${progress.message}"`);
            }
          }
        }, abortController.signal, this.generator.usesBudget ? { limitUsd: budgetRemainingUsd! } : undefined);
        tourId = generated.id;
        reviewRequired = generated.reviewRequired === true;

        if (this.generator.usesBudget) {
          const accountedUsd = generated.accountedUsd;
          if (typeof accountedUsd !== 'number' || !Number.isFinite(accountedUsd) || accountedUsd < 0 || accountedUsd > budgetRemainingUsd!) {
            throw new Error('Invalid generation cost');
          }
          const settled = await this.jobs.updateOwned(id, owner, {
            accountedSpendUsd: (budgetPreviousUsd ?? 0) + accountedUsd,
          });
          if (!settled) {
            leaseLost = true;
            throw new Error('Lease lost');
          }
        }
      } catch (error) {
        if (leaseLost) throw error;
        if (error instanceof TourGenerationAttemptError) {
          if (this.generator.usesBudget) {
            const accountedUsd = error.accountedUsd;
            if (typeof accountedUsd === 'number' && Number.isFinite(accountedUsd) && accountedUsd >= 0 && accountedUsd <= budgetRemainingUsd!) {
              const settled = await this.jobs.updateOwned(id, owner, {
                accountedSpendUsd: (budgetPreviousUsd ?? 0) + accountedUsd,
              });
              if (!settled) {
                leaseLost = true;
                throw new Error('Lease lost');
              }
            }
          }
          throw error;
        }
        if (!(error instanceof TourDurationNotRecommendedError)) throw error;
        tourId = error.details.draftTourId;
        durationResult = {
          durationAdapted: true,
          requestedDurationMinutes: error.details.requestedDurationMinutes,
          recommendedDurationMinutes: error.details.recommendedDurationMinutes,
        };
      }

      if (leaseLost) throw new Error('Lease lost');

      const draft = await this.tours.findById(tourId);
      if (!draft) throw new Error(`Generated tour not found: ${tourId}`);

      if (this.generator.isReusableTour) {
        const reusable = await this.generator.isReusableTour(draft);
        if (!reusable) {
          throw new Error('BLUEPRINT_INVALIDATED_DURING_WRITING');
        }
      }

      const validatingUpdate = await this.jobs.updateOwned(id, owner, {
        step: 'validating',
        progress: {
          completedStops: draft.places.length,
          totalStops: draft.places.length,
          message: 'Checking factual quality, voice, and repetition',
        },
      });
      if (!validatingUpdate) {
        leaseLost = true;
        throw new Error('Lease lost');
      }

      if (reviewRequired) {
        if (draft.status !== 'review') {
          throw new Error('Codex review path requires draft status review');
        }
        if (draft.metadata?.generationPipeline !== this.generator.pipelineVersion) {
          throw new Error('Codex review path requires matching pipeline version');
        }
        if (draft.metadata?.codexAuthor?.publicationPassed !== false) {
          throw new Error('Codex review path requires publicationPassed false');
        }
        if (leaseLost) throw new Error('Lease lost');
        const completed = await this.jobs.updateOwned(id, owner, {
          status: 'completed',
          step: 'completed',
          tourId,
          result: { tourId, reviewRequired: true, ...durationResult },
          progress: {
            completedStops: draft.places.length,
            totalStops: draft.places.length,
            message: 'Draft ready for review',
          },
          finishedAt: new Date().toISOString(),
        });
        if (!completed) {
          leaseLost = true;
        }
      } else {
        const reasons = publicationProblems(draft);
        if (reasons.length > 0) {
          throw new CityQualityNotAvailableError(draft.city, draft.theme, {
            passed: false,
            stage: 'output',
            score: (draft.metadata?.textAudit?.score || 0) / 100,
            reasons,
          });
        }

        if (leaseLost) throw new Error('Lease lost');

        const publishingUpdate = await this.jobs.updateOwned(id, owner, {
          step: 'publishing',
          progress: {
            completedStops: draft.places.length,
            totalStops: draft.places.length,
            message: 'Publishing the approved text tour',
          },
        });
        if (!publishingUpdate) {
          leaseLost = true;
          throw new Error('Lease lost');
        }

        if (leaseLost) throw new Error('Lease lost');

        const completed = await this.jobs.completeOwned(id, owner, tourId, {
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
        if (!completed) {
          leaseLost = true;
        }
      }
    } catch (error) {
      if (claimed && !leaseLost) {
        try {
          await this.jobs.updateOwned(id, owner, {
            status: 'failed',
            step: 'failed',
            errorCode: error instanceof CityQualityNotAvailableError ? 'CITY_QUALITY_NOT_AVAILABLE' : (error instanceof Error && ['TOUR_BUDGET_EXHAUSTED', 'BLUEPRINT_BUDGET_EXHAUSTED', 'TOUR_ROUTE_UNAVAILABLE', 'TOUR_RESEARCH_UNAVAILABLE'].includes(error.message) ? error.message : 'TOUR_GENERATION_ERROR'),
            errorMessage: error instanceof CityQualityNotAvailableError
              ? 'No pudimos crear un tour con calidad suficiente para esta ciudad.'
              : error instanceof Error && error.message === 'TOUR_ROUTE_UNAVAILABLE'
                ? 'We could not prepare a suitable walking route for this duration. Try another duration or destination.'
                : error instanceof Error && ['TOUR_BUDGET_EXHAUSTED', 'BLUEPRINT_BUDGET_EXHAUSTED'].includes(error.message)
                  ? 'This request has reached its generation limit. Further automatic retries are stopped.'
                  : error instanceof Error && error.message === 'TOUR_RESEARCH_UNAVAILABLE'
                    ? 'We could not retrieve and verify enough sources for this route. Please try again later.'
                    : 'Tour generation failed.',
            errorDetails: error instanceof CityQualityNotAvailableError ? error.details : { reason: error instanceof Error ? error.message : 'unknown_error' },
            progress: { completedStops: 0, totalStops: 0, message: 'Generation stopped' },
            finishedAt: new Date().toISOString(),
          });
        } catch (updateError) {
          console.error('Failed to mark job as failed', updateError);
        }
      }
      if (error instanceof Error) {
        console.error(`Generation job ${id} failed:`, error.message);
      } else {
        console.error(`Generation job ${id} failed:`, error);
      }
    } finally {
      abortController.abort();
      if (renewalTimer) {
        clearInterval(renewalTimer);
      }
    }
  }
}
