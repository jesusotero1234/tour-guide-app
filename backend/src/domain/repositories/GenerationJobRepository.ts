import {
  GenerationJob,
  GenerationJobProgress,
  GenerationJobResult,
  GenerationJobStatus,
  GenerationJobStep,
} from '../entities/GenerationJob';
import { TourRequest } from '../../types/api';

export interface CreateGenerationJobInput {
  idempotencyKey: string;
  request: TourRequest;
}

export interface UpdateGenerationJobInput {
  status?: GenerationJobStatus;
  step?: GenerationJobStep;
  progress?: GenerationJobProgress;
  result?: GenerationJobResult;
  tourId?: string;
  errorCode?: string;
  errorMessage?: string;
  errorDetails?: unknown;
  startedAt?: string;
  finishedAt?: string;
}

export interface GenerationJobRepository {
  create(input: CreateGenerationJobInput): Promise<GenerationJob>;
  findById(id: string): Promise<GenerationJob | null>;
  findReusableByKey(idempotencyKey: string): Promise<GenerationJob | null>;
  listPending(): Promise<GenerationJob[]>;
  update(id: string, input: UpdateGenerationJobInput): Promise<GenerationJob>;
}
