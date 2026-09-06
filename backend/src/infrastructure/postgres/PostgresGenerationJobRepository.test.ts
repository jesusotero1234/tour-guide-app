import { Prisma, PrismaClient } from '@prisma/client';
import { PostgresGenerationJobRepository } from './PostgresGenerationJobRepository';

type FakeRow = {
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
  leaseOwner: string | null;
  leaseExpiresAt: Date | null;
};

type FakeTourRow = {
  id: string;
  status: string;
};

class FakePrismaClient {
  private rows: Map<string, FakeRow> = new Map();
  private tours: Map<string, FakeTourRow> = new Map();
  private snapshots: FakeRow[][] = [];

  generationJob = {
    findUnique: async (args: { where: { id?: string; idempotencyKey?: string } }) => {
      const where = args.where;
      for (const row of this.rows.values()) {
        if (where.id && row.id === where.id) return { ...row };
        if (where.idempotencyKey && row.idempotencyKey === where.idempotencyKey) return { ...row };
      }
      return null;
    },
    findMany: async (args: { where: unknown; orderBy?: unknown }) => {
      const where = args.where as Record<string, unknown>;
      const results: FakeRow[] = [];
      for (const row of this.rows.values()) {
        if (this.matchesWhere(row, where)) {
          results.push({ ...row });
        }
      }
      if (args.orderBy && (args.orderBy as any).createdAt === 'asc') {
        results.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
      }
      return results;
    },
    create: async (args: { data: Partial<FakeRow> }) => {
      const now = new Date();
      const id = args.data.idempotencyKey || 'gen-id';
      const row: FakeRow = {
        id,
        tourId: null,
        idempotencyKey: args.data.idempotencyKey || 'gen-id',
        status: 'queued',
        step: 'queued',
        request: args.data.request,
        progress: args.data.progress,
        result: null,
        errorCode: null,
        errorMessage: null,
        errorDetails: null,
        createdAt: now,
        updatedAt: now,
        startedAt: null,
        finishedAt: null,
        leaseOwner: null,
        leaseExpiresAt: null,
      };
      this.rows.set(id, row);
      return { ...row };
    },
    update: async (args: { where: { id: string }; data: Partial<FakeRow> }) => {
      const row = this.rows.get(args.where.id);
      if (!row) throw new Error('Record not found');
      const data = { ...args.data };
      for (const key of Object.keys(data) as (keyof FakeRow)[]) {
        if (data[key] === Prisma.DbNull) {
          (data as Record<string, unknown>)[key] = null;
        }
      }
      const updated = { ...row, ...data, updatedAt: new Date() };
      this.rows.set(args.where.id, updated);
      return { ...updated };
    },
    updateMany: async (args: { where: unknown; data: Partial<FakeRow> }) => {
      const where = args.where as Record<string, unknown>;
      const data = { ...args.data };
      for (const key of Object.keys(data) as (keyof FakeRow)[]) {
        if (data[key] === Prisma.DbNull) {
          (data as Record<string, unknown>)[key] = null;
        }
      }
      let count = 0;
      for (const [id, row] of this.rows.entries()) {
        if (this.matchesWhere(row, where)) {
          const updated = { ...row, ...data, updatedAt: new Date() };
          this.rows.set(id, updated);
          count++;
        }
      }
      return { count };
    },
  };

  tour = {
    update: async (args: { where: { id: string }; data: Partial<FakeTourRow> }) => {
      const tour = this.tours.get(args.where.id);
      if (!tour) throw new Error('Tour not found');
      const updated = { ...tour, ...args.data };
      this.tours.set(args.where.id, updated);
      return { ...updated };
    },
  };

  $transaction = async (fn: (tx: any) => Promise<any>) => {
    const snapshot = Array.from(this.rows.values()).map((r) => ({ ...r }));
    this.snapshots.push(snapshot);
    const tx = {
      generationJob: this.generationJob,
      tour: this.tour,
    };
    try {
      const result = await fn(tx);
      return result;
    } catch (e) {
      this.restoreSnapshot(snapshot);
      throw e;
    }
  };

  private matchesWhere(row: FakeRow, where: Record<string, unknown>): boolean {
    if (where.id && row.id !== where.id) return false;
    if (where.status && row.status !== where.status) return false;
    if (where.leaseOwner !== undefined && row.leaseOwner !== where.leaseOwner) return false;
    if (where.leaseExpiresAt === null && row.leaseExpiresAt !== null) return false;
    if (where.leaseExpiresAt !== undefined && where.leaseExpiresAt !== null) {
      const cond = where.leaseExpiresAt as Record<string, unknown>;
      if (cond.gt !== undefined) {
        if (!row.leaseExpiresAt || row.leaseExpiresAt.getTime() <= (cond.gt as Date).getTime()) return false;
      }
      if (cond.lte !== undefined) {
        if (!row.leaseExpiresAt || row.leaseExpiresAt.getTime() > (cond.lte as Date).getTime()) return false;
      }
    }
    if (where.updatedAt !== undefined) {
      const target = where.updatedAt instanceof Date ? where.updatedAt : new Date(where.updatedAt as string);
      if (row.updatedAt.getTime() !== target.getTime()) return false;
    }
    if (where.OR) {
      const orConditions = where.OR as Record<string, unknown>[];
      const matched = orConditions.some((cond) => this.matchesWhere(row, cond));
      if (!matched) return false;
    }
    return true;
  }

  private restoreSnapshot(snapshot: FakeRow[]) {
    this.rows.clear();
    for (const row of snapshot) {
      this.rows.set(row.id, { ...row });
    }
  }

  seedJob(row: Partial<FakeRow> & { id: string; idempotencyKey: string }) {
    const now = new Date();
    const full: FakeRow = {
      tourId: null,
      status: 'queued',
      step: 'queued',
      request: null,
      progress: null,
      result: null,
      errorCode: null,
      errorMessage: null,
      errorDetails: null,
      createdAt: now,
      updatedAt: now,
      startedAt: null,
      finishedAt: null,
      leaseOwner: null,
      leaseExpiresAt: null,
      ...row,
    };
    this.rows.set(full.id, full);
  }

  seedTour(id: string, status: string) {
    this.tours.set(id, { id, status });
  }
}

describe('PostgresGenerationJobRepository', () => {
  let fake: FakePrismaClient;
  let repo: PostgresGenerationJobRepository;
  const originalNow = Date.now;

  beforeEach(() => {
    fake = new FakePrismaClient();
    repo = new PostgresGenerationJobRepository(fake as unknown as PrismaClient);
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2024-01-01T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
    Date.now = originalNow;
  });

  describe('claim', () => {
    it('allows exactly one concurrent claim from two instances sharing the same fake row', async () => {
      fake.seedJob({
        id: 'job-1',
        idempotencyKey: 'key-1',
        status: 'queued',
      });

      const repoA = new PostgresGenerationJobRepository(fake as unknown as PrismaClient);
      const repoB = new PostgresGenerationJobRepository(fake as unknown as PrismaClient);

      const [resultA, resultB] = await Promise.all([
        repoA.claim('job-1', 'owner-a', 60000),
        repoB.claim('job-1', 'owner-b', 60000),
      ]);

      expect([resultA, resultB].sort()).toEqual([false, true]);
    });

    it('reclaims an old expired running row', async () => {
      const past = new Date('2024-01-01T00:00:00Z');
      const expired = new Date(past.getTime() - 1000);
      fake.seedJob({
        id: 'job-2',
        idempotencyKey: 'key-2',
        status: 'running',
        leaseOwner: 'old-owner',
        leaseExpiresAt: expired,
      });

      const result = await repo.claim('job-2', 'new-owner', 60000);
      expect(result).toBe(true);

      const row = await fake.generationJob.findUnique({ where: { id: 'job-2' } });
      expect(row!.leaseOwner).toBe('new-owner');
    });

    it('cannot steal a live lease', async () => {
      const future = new Date('2024-01-01T00:01:00Z');
      fake.seedJob({
        id: 'job-3',
        idempotencyKey: 'key-3',
        status: 'running',
        leaseOwner: 'current-owner',
        leaseExpiresAt: future,
      });

      const result = await repo.claim('job-3', 'stealer', 60000);
      expect(result).toBe(false);
    });
  });

  describe('renewLease', () => {
    it('rejects renewal after expiry', async () => {
      const past = new Date('2024-01-01T00:00:00Z');
      const expired = new Date(past.getTime() - 1000);
      fake.seedJob({
        id: 'job-4',
        idempotencyKey: 'key-4',
        status: 'running',
        leaseOwner: 'owner-1',
        leaseExpiresAt: expired,
      });

      const result = await repo.renewLease('job-4', 'owner-1', 60000);
      expect(result).toBe(false);
    });

    it('rejects renewal by former owner after takeover', async () => {
      const future = new Date('2024-01-01T00:01:00Z');
      fake.seedJob({
        id: 'job-5',
        idempotencyKey: 'key-5',
        status: 'running',
        leaseOwner: 'new-owner',
        leaseExpiresAt: future,
      });

      const result = await repo.renewLease('job-5', 'old-owner', 60000);
      expect(result).toBe(false);
    });
  });

  describe('updateOwned', () => {
    it('rejects update after expiry', async () => {
      const past = new Date('2024-01-01T00:00:00Z');
      const expired = new Date(past.getTime() - 1000);
      fake.seedJob({
        id: 'job-6',
        idempotencyKey: 'key-6',
        status: 'running',
        leaseOwner: 'owner-1',
        leaseExpiresAt: expired,
      });

      const result = await repo.updateOwned('job-6', 'owner-1', { step: 'narrating' });
      expect(result).toBe(false);
    });

    it('rejects update by former owner after takeover', async () => {
      const future = new Date('2024-01-01T00:01:00Z');
      fake.seedJob({
        id: 'job-7',
        idempotencyKey: 'key-7',
        status: 'running',
        leaseOwner: 'new-owner',
        leaseExpiresAt: future,
      });

      const result = await repo.updateOwned('job-7', 'old-owner', { step: 'narrating' });
      expect(result).toBe(false);
    });
  });

  describe('completeOwned', () => {
    it('publishes and completes atomically', async () => {
      const future = new Date('2024-01-01T00:01:00Z');
      fake.seedJob({
        id: 'job-8',
        idempotencyKey: 'key-8',
        status: 'running',
        leaseOwner: 'owner-1',
        leaseExpiresAt: future,
      });
      fake.seedTour('tour-1', 'draft');

      const result = await repo.completeOwned('job-8', 'owner-1', 'tour-1', {
        result: { tourId: 'tour-1' },
      });

      expect(result).toBe(true);
      const job = await fake.generationJob.findUnique({ where: { id: 'job-8' } });
      expect(job!.status).toBe('completed');
      expect(job!.tourId).toBe('tour-1');
      const tour = await fake.tour.update({ where: { id: 'tour-1' }, data: {} });
      expect(tour.status).toBe('published');
    });

    it('rolls back job update when tour update throws', async () => {
      const future = new Date('2024-01-01T00:01:00Z');
      fake.seedJob({
        id: 'job-9',
        idempotencyKey: 'key-9',
        status: 'running',
        leaseOwner: 'owner-1',
        leaseExpiresAt: future,
      });
      // Do not seed tour to force error
      fake.tour.update = async () => {
        throw new Error('Tour update failed');
      };

      await expect(repo.completeOwned('job-9', 'owner-1', 'tour-1', {
        result: { tourId: 'tour-1' },
      })).rejects.toThrow('Tour update failed');

      const job = await fake.generationJob.findUnique({ where: { id: 'job-9' } });
      expect(job!.status).toBe('running');
      expect(job!.leaseOwner).toBe('owner-1');
    });
  });

  describe('resetCompleted', () => {
    it('rejects stale updatedAt', async () => {
      const now = new Date('2024-01-01T00:00:00Z');
      const stale = new Date(now.getTime() - 1000);
      fake.seedJob({
        id: 'job-10',
        idempotencyKey: 'key-10',
        status: 'completed',
        updatedAt: now,
      });

      const result = await repo.resetCompleted('job-10', stale.toISOString());
      expect(result).toBe(false);
    });

    it('does not reset running job', async () => {
      const now = new Date('2024-01-01T00:00:00Z');
      fake.seedJob({
        id: 'job-11',
        idempotencyKey: 'key-11',
        status: 'running',
        updatedAt: now,
      });

      const result = await repo.resetCompleted('job-11', now.toISOString());
      expect(result).toBe(false);
    });

    it('clears result/progress/errors on matching completed', async () => {
      const now = new Date('2024-01-01T00:00:00Z');
      fake.seedJob({
        id: 'job-12',
        idempotencyKey: 'key-12',
        status: 'completed',
        updatedAt: now,
        result: { stops: [1, 2] },
        progress: { completedStops: 2, totalStops: 2, message: 'Done' },
        errorCode: 'ERR',
        errorMessage: 'Error',
        errorDetails: { code: 500 },
        tourId: 'tour-1',
      });

      const result = await repo.resetCompleted('job-12', now.toISOString());
      expect(result).toBe(true);

      const job = await fake.generationJob.findUnique({ where: { id: 'job-12' } });
      if (!job) throw new Error('Expected reset job');
      expect(job.status).toBe('queued');
      expect(job.result).toBeNull();
      expect(job.progress).toEqual({ completedStops: 0, totalStops: 0, message: 'Queued' });
      expect(job.errorCode).toBeNull();
      expect(job.errorMessage).toBeNull();
      expect(job.errorDetails).toBeNull();
      expect(job.tourId).toBeNull();
    });
  });
});
