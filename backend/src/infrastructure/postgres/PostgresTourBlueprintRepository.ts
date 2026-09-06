import { PrismaClient, TourBlueprint as Row } from '@prisma/client';
import { BlueprintClaim, TourBlueprint, TourBlueprintRepository, TourBlueprintSnapshot, parseTourBlueprintSnapshot } from '../../services/TourBlueprint';

const TTL_MS = 120000;
function mapped(row: Row): TourBlueprint {
  return { ...row, snapshot: row.snapshot === null ? null : parseTourBlueprintSnapshot(typeof row.snapshot === 'string' ? JSON.parse(row.snapshot) : row.snapshot) };
}
function owned(id: string, owner: string) {
  return { id, status: 'preparing', leaseOwner: owner, leaseExpiresAt: { gt: new Date() } };
}
function validCost(cost: number, maximum: number) {
  if (!Number.isFinite(cost) || cost < 0 || cost > maximum + 1e-9) throw new Error('Invalid blueprint cost');
}
export class PostgresTourBlueprintRepository implements TourBlueprintRepository {
  constructor(private readonly client: PrismaClient) {}
  async revisionForRequest(baseKey: string): Promise<number> {
    const row = await this.client.tourBlueprint.findFirst({ where: { baseKey }, orderBy: { revision: 'desc' } });
    if (!row) return 1;
    return row.status === 'invalidated' || (row.status === 'ready' && (!row.revalidateAfter || row.revalidateAfter <= new Date())) ? row.revision + 1 : row.revision;
  }
  async acquire(baseKey: string, owner: string, limitUsd: number): Promise<BlueprintClaim> {
    if (!Number.isFinite(limitUsd) || limitUsd <= 0) throw new Error('Invalid blueprint budget');
    return this.client.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${baseKey}, 0))`;
      const row = await tx.tourBlueprint.findFirst({ where: { baseKey }, orderBy: { revision: 'desc' } });
      const now = new Date(), leaseExpiresAt = new Date(now.getTime() + TTL_MS);
      if (row?.status === 'ready' && row.revalidateAfter && row.revalidateAfter > now) {
        return { kind: 'ready', blueprint: mapped(row), allowanceUsd: 0 };
      }
      if (row?.status === 'preparing' && row.leaseExpiresAt && row.leaseExpiresAt > now) {
        return { kind: 'waiting', blueprint: mapped(row), allowanceUsd: 0 };
      }
      if (!row || row.status === 'ready' || row.status === 'invalidated') {
        const created = await tx.tourBlueprint.create({ data: {
          baseKey, revision: (row?.revision ?? 0) + 1, status: 'preparing',
          leaseOwner: owner, leaseExpiresAt, attemptCount: 1, spendLimitUsd: limitUsd, accountedSpendUsd: limitUsd,
        } });
        return { kind: 'claimed', blueprint: mapped(created), allowanceUsd: limitUsd };
      }
      const allowanceUsd = Math.min(limitUsd, row.spendLimitUsd - row.accountedSpendUsd);
      if (row.attemptCount >= 2 || allowanceUsd <= 1e-9) throw new Error('BLUEPRINT_BUDGET_EXHAUSTED');
      const updated = await tx.tourBlueprint.update({ where: { id: row.id }, data: {
        status: 'preparing', leaseOwner: owner, leaseExpiresAt, error: null,
        attemptCount: { increment: 1 }, accountedSpendUsd: { increment: allowanceUsd },
      } });
      return { kind: 'claimed', blueprint: mapped(updated), allowanceUsd };
    });
  }
  async renew(id: string, owner: string): Promise<boolean> {
    return (await this.client.tourBlueprint.updateMany({ where: owned(id, owner),
      data: { leaseExpiresAt: new Date(Date.now() + TTL_MS) } })).count === 1;
  }
  async complete(id: string, owner: string, snapshot: TourBlueprintSnapshot, costUsd: number): Promise<boolean> {
    parseTourBlueprintSnapshot(snapshot);
    const days = Number(process.env.TOUR_BLUEPRINT_TTL_DAYS ?? '30');
    if (!Number.isFinite(days) || days <= 0) throw new Error('Invalid blueprint expiry');
    return this.client.$transaction(async tx => {
      const row = await tx.tourBlueprint.findFirst({ where: owned(id, owner) });
      if (!row) return false;
      validCost(costUsd, row.accountedSpendUsd);
      return (await tx.tourBlueprint.updateMany({ where: owned(id, owner), data: {
        // Existing evidence fingerprints depend on JSON key order. Preserve the exact payload through JSONB.
        status: 'ready', snapshot: JSON.stringify(snapshot),
        accountedSpendUsd: costUsd, revalidateAfter: new Date(Date.now() + days * 86400000),
        leaseOwner: null, leaseExpiresAt: null, error: null,
      } })).count === 1;
    });
  }
  async fail(id: string, owner: string, reason: string, costUsd?: number): Promise<void> {
    await this.client.$transaction(async tx => {
      const row = await tx.tourBlueprint.findFirst({ where: owned(id, owner) });
      if (!row) return;
      if (costUsd !== undefined) validCost(costUsd, row.accountedSpendUsd);
      await tx.tourBlueprint.updateMany({ where: owned(id, owner), data: {
        status: 'failed', leaseOwner: null, leaseExpiresAt: null, error: reason.slice(0, 500),
        ...(costUsd !== undefined ? { accountedSpendUsd: costUsd } : {}),
      } });
    });
  }
  async findById(id: string): Promise<TourBlueprint | null> {
    const row = await this.client.tourBlueprint.findUnique({ where: { id } });
    return row ? mapped(row) : null;
  }
  async isCurrent(id: string): Promise<boolean> {
    const row = await this.client.tourBlueprint.findUnique({ where: { id } });
    if (!row || row.status !== 'ready' || !row.revalidateAfter || row.revalidateAfter <= new Date()) return false;
    return await this.client.tourBlueprint.count({ where: { baseKey: row.baseKey, revision: { gt: row.revision } } }) === 0;
  }
}
