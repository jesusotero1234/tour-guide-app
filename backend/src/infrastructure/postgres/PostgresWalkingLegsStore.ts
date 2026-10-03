import { PrismaClient } from '@prisma/client';
import type { WalkingLegsStore } from '../../services/WalkingLegs';

export class PostgresWalkingLegsStore implements WalkingLegsStore {
  constructor(private readonly client: PrismaClient) {}

  async find(tourId: string) {
    const row = await this.client.tourWalkingLegs.findUnique({ where: { tourId } });
    return row ? { data: row.data as unknown, sha256: row.sha256 } : null;
  }
}
