import { TourRequest } from '../../types/api';

export type GenerationJobStatus = 'queued' | 'running' | 'completed' | 'failed';

export type GenerationJobStep =
  | 'queued'
  | 'sourcing'
  | 'routing'
  | 'planning_narrative'
  | 'narrating'
  | 'validating'
  | 'repairing'
  | 'publishing'
  | 'completed'
  | 'failed';

export interface GenerationJobProgress {
  completedStops: number;
  totalStops: number;
  message?: string;
}

export interface GenerationJobResult {
  tourId: string;
  durationAdapted?: boolean;
  requestedDurationMinutes?: number;
  recommendedDurationMinutes?: number;
  reviewRequired?: boolean;
}

export interface GenerationJob {
  id: string;
  tourId?: string;
  idempotencyKey: string;
  status: GenerationJobStatus;
  step: GenerationJobStep;
  request: TourRequest;
  progress: GenerationJobProgress;
  result?: GenerationJobResult;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: unknown;
  attemptCount?: number;
  accountedSpendUsd?: number;
  spendLimitUsd?: number;
  createdAt: string;
  updatedAt: string;
  startedAt?: string;
  finishedAt?: string;
}
