import { Prisma, PrismaClient } from '@prisma/client';
import { GenerationJob } from '../../domain/entities/GenerationJob';
import {
  CreateGenerationJobInput,
  GenerationJobRepository,
  UpdateGenerationJobInput,
} from '../../domain/repositories/GenerationJobRepository';

type JobRow = {
  id: string;
  tourId: string | null;
  idempotencyKey: string;
  status: string;
  step: string | null;
  request: unknown;
  progress: unknown;
  result: unknown;
  errorCode: string | null;
  errorMessage: string | null;
  errorDetails: unknown;
  createdAt: Date;
  updatedAt: Date;
  startedAt: Date | null;
  finishedAt: Date | null;
};

function mapJob(row: JobRow): GenerationJob {
  return {
    id: row.id,
    tourId: row.tourId ?? undefined,
    idempotencyKey: row.idempotencyKey,
    status: row.status as GenerationJob['status'],
    step: (row.step || row.status) as GenerationJob['step'],
    request: row.request as GenerationJob['request'],
    progress: row.progress as GenerationJob['progress'],
    result: row.result ? row.result as GenerationJob['result'] : undefined,
    errorCode: row.errorCode ?? undefined,
    errorMessage: row.errorMessage ?? undefined,
    errorDetails: row.errorDetails ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    finishedAt: row.finishedAt?.toISOString(),
  };
}

export class PostgresGenerationJobRepository implements GenerationJobRepository {
  constructor(private readonly client: PrismaClient) {}

  async create(input: CreateGenerationJobInput): Promise<GenerationJob> {
    const existing = await this.client.generationJob.findUnique({
      where: { idempotencyKey: input.idempotencyKey },
    });

    if (existing) {
      if (existing.status === 'failed') {
        const restarted = await this.client.generationJob.update({
          where: { id: existing.id },
          data: {
            status: 'queued',
            step: 'queued',
            request: input.request as object,
            progress: { completedStops: 0, totalStops: 0, message: 'Queued' },
            result: Prisma.DbNull,
            tourId: null,
            errorCode: null,
            errorMessage: null,
            errorDetails: Prisma.DbNull,
            startedAt: null,
            finishedAt: null,
          },
        });
        return mapJob(restarted as unknown as JobRow);
      }

      return mapJob(existing as unknown as JobRow);
    }

    try {
      const created = await this.client.generationJob.create({
        data: {
          idempotencyKey: input.idempotencyKey,
          status: 'queued',
          step: 'queued',
          request: input.request as object,
          progress: { completedStops: 0, totalStops: 0, message: 'Queued' },
        },
      });

      return mapJob(created as unknown as JobRow);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
      const concurrent = await this.client.generationJob.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
      });
      if (!concurrent) throw error;
      return mapJob(concurrent as unknown as JobRow);
    }
  }

  async findById(id: string): Promise<GenerationJob | null> {
    const row = await this.client.generationJob.findUnique({ where: { id } });
    return row ? mapJob(row as unknown as JobRow) : null;
  }

  async findReusableByKey(idempotencyKey: string): Promise<GenerationJob | null> {
    const row = await this.client.generationJob.findUnique({ where: { idempotencyKey } });
    return row ? mapJob(row as unknown as JobRow) : null;
  }

  async listPending(): Promise<GenerationJob[]> {
    const rows = await this.client.generationJob.findMany({
      where: { status: { in: ['queued', 'running'] } },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => mapJob(row as unknown as JobRow));
  }

  async update(id: string, input: UpdateGenerationJobInput): Promise<GenerationJob> {
    const row = await this.client.generationJob.update({
      where: { id },
      data: {
        ...(input.status ? { status: input.status } : {}),
        ...(input.step ? { step: input.step } : {}),
        ...(input.progress ? { progress: input.progress as object } : {}),
        ...(input.result ? { result: input.result as object } : {}),
        ...(input.tourId ? { tourId: input.tourId } : {}),
        ...(input.errorCode ? { errorCode: input.errorCode } : {}),
        ...(input.errorMessage ? { errorMessage: input.errorMessage } : {}),
        ...(input.errorDetails !== undefined ? { errorDetails: input.errorDetails as object } : {}),
        ...(input.startedAt ? { startedAt: new Date(input.startedAt) } : {}),
        ...(input.finishedAt ? { finishedAt: new Date(input.finishedAt) } : {}),
      },
    });

    return mapJob(row as unknown as JobRow);
  }
}
