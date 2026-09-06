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
  attemptCount: number | null;
  accountedSpendUsd: number | null;
  spendLimitUsd: number | null;
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
    attemptCount: row.attemptCount ?? 0,
    accountedSpendUsd: row.accountedSpendUsd ?? 0,
    spendLimitUsd: row.spendLimitUsd ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    startedAt: row.startedAt?.toISOString(),
    finishedAt: row.finishedAt?.toISOString(),
  };
}

function buildUpdateData(input: UpdateGenerationJobInput): Prisma.GenerationJobUncheckedUpdateManyInput {
  const data: Prisma.GenerationJobUncheckedUpdateManyInput = {};
  if (input.status) data.status = input.status;
  if (input.step) data.step = input.step;
  if (input.progress) data.progress = input.progress as object;
  if (input.result) data.result = input.result as object;
  if (input.tourId) data.tourId = input.tourId;
  if (input.errorCode) data.errorCode = input.errorCode;
  if (input.errorMessage) data.errorMessage = input.errorMessage;
  if (input.errorDetails !== undefined) data.errorDetails = input.errorDetails as object;
  if (input.attemptCount !== undefined) {
    if (!Number.isFinite(input.attemptCount) || input.attemptCount < 0 || !Number.isInteger(input.attemptCount)) {
      throw new Error('attemptCount must be a non-negative integer');
    }
    data.attemptCount = input.attemptCount;
  }
  if (input.accountedSpendUsd !== undefined) {
    if (!Number.isFinite(input.accountedSpendUsd) || input.accountedSpendUsd < 0) {
      throw new Error('accountedSpendUsd must be a non-negative finite number');
    }
    data.accountedSpendUsd = input.accountedSpendUsd;
  }
  if (input.spendLimitUsd !== undefined) {
    if (!Number.isFinite(input.spendLimitUsd) || input.spendLimitUsd <= 0) {
      throw new Error('spendLimitUsd must be a positive finite number');
    }
    data.spendLimitUsd = input.spendLimitUsd;
  }
  if (input.startedAt) data.startedAt = new Date(input.startedAt);
  if (input.finishedAt) data.finishedAt = new Date(input.finishedAt);
  return data;
}

function eligibleLeasePredicate(owner: string, now: Date): Prisma.GenerationJobWhereInput {
  return {
    status: 'running',
    leaseOwner: owner,
    leaseExpiresAt: { gt: now },
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
        const result = await this.client.generationJob.updateMany({
          where: { id: existing.id, status: 'failed' },
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
            leaseOwner: null,
            leaseExpiresAt: null,
          },
        });
        if (result.count === 0) {
          const concurrent = await this.client.generationJob.findUnique({
            where: { idempotencyKey: input.idempotencyKey },
          });
          if (!concurrent) throw new Error('Failed to restart job');
          return mapJob(concurrent as unknown as JobRow);
        }
        const restarted = await this.client.generationJob.findUnique({
          where: { id: existing.id },
        });
        if (!restarted) throw new Error('Failed to restart job');
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
    const now = new Date();
    const rows = await this.client.generationJob.findMany({
      where: {
        OR: [
          { status: 'queued' },
          {
            status: 'running',
            OR: [
              { leaseExpiresAt: null },
              { leaseExpiresAt: { lte: now } },
            ],
          },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });
    return rows.map((row) => mapJob(row as unknown as JobRow));
  }

  async update(id: string, input: UpdateGenerationJobInput): Promise<GenerationJob> {
    const row = await this.client.generationJob.update({
      where: { id },
      data: buildUpdateData(input),
    });

    return mapJob(row as unknown as JobRow);
  }

  async claim(id: string, owner: string, leaseMilliseconds: number): Promise<boolean> {
    const now = new Date();
    const expiry = new Date(now.getTime() + leaseMilliseconds);
    const result = await this.client.generationJob.updateMany({
      where: {
        id,
        OR: [
          { status: 'queued' },
          {
            status: 'running',
            OR: [
              { leaseExpiresAt: null },
              { leaseExpiresAt: { lte: now } },
            ],
          },
        ],
      },
      data: {
        status: 'running',
        leaseOwner: owner,
        leaseExpiresAt: expiry,
        startedAt: now,
      },
    });
    return result.count === 1;
  }

  async renewLease(id: string, owner: string, leaseMilliseconds: number): Promise<boolean> {
    const now = new Date();
    const expiry = new Date(now.getTime() + leaseMilliseconds);
    const result = await this.client.generationJob.updateMany({
      where: {
        id,
        ...eligibleLeasePredicate(owner, now),
      },
      data: {
        leaseExpiresAt: expiry,
      },
    });
    return result.count === 1;
  }

  async updateOwned(id: string, owner: string, input: UpdateGenerationJobInput): Promise<boolean> {
    const now = new Date();
    const data = buildUpdateData(input);
    if (input.status === 'failed' || input.status === 'completed') {
      data.leaseOwner = null;
      data.leaseExpiresAt = null;
    }
    const result = await this.client.generationJob.updateMany({
      where: {
        id,
        ...eligibleLeasePredicate(owner, now),
      },
      data,
    });
    return result.count === 1;
  }

  async completeOwned(id: string, owner: string, tourId: string, input: UpdateGenerationJobInput): Promise<boolean> {
    const now = new Date();
    const data = buildUpdateData(input);
    data.status = 'completed';
    data.step = 'completed';
    data.tourId = tourId;
    data.leaseOwner = null;
    data.leaseExpiresAt = null;
    data.finishedAt = now;

    return this.client.$transaction(async (tx) => {
      const result = await tx.generationJob.updateMany({
        where: {
          id,
          ...eligibleLeasePredicate(owner, now),
        },
        data,
      });
      if (result.count === 0) return false;
      await tx.tour.update({
        where: { id: tourId },
        data: { status: 'published' },
      });
      return true;
    });
  }

  async resetCompleted(id: string, updatedAt: string): Promise<boolean> {
    const result = await this.client.generationJob.updateMany({
      where: {
        id,
        status: 'completed',
        updatedAt: new Date(updatedAt),
      },
      data: {
        status: 'queued',
        step: 'queued',
        progress: { completedStops: 0, totalStops: 0, message: 'Queued' },
        result: Prisma.DbNull,
        tourId: null,
        errorCode: null,
        errorMessage: null,
        errorDetails: Prisma.DbNull,
        startedAt: null,
        finishedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      },
    });
    return result.count === 1;
  }
}
