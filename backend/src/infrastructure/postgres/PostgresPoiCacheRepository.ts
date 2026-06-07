import { PrismaClient } from '@prisma/client';
import { RawPoi } from '../../domain/poi/RawPoi';

const CACHE_TTL_MS = process.env.NODE_ENV === 'production'
  ? 30 * 24 * 60 * 60 * 1000
  : 60 * 60 * 1000;

export class PostgresPoiCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(city: string, theme: string): Promise<RawPoi[] | null> {
    const record = await this.prisma.poiCache.findUnique({
      where: { city_theme: { city, theme } },
    });

    if (!record) return null;

    const age = Date.now() - record.fetchedAt.getTime();
    if (age > CACHE_TTL_MS) {
      console.log(`[PoiCache] Cache expired for ${city}/${theme}`);
      return null;
    }

    console.log(`[PoiCache] Cache hit for ${city}/${theme}`);
    return record.payload as unknown as RawPoi[];
  }

  async set(city: string, theme: string, pois: RawPoi[]): Promise<void> {
    await this.prisma.poiCache.upsert({
      where: { city_theme: { city, theme } },
      create: {
        city,
        theme,
        payload: pois as any,
      },
      update: {
        fetchedAt: new Date(),
        payload: pois as any,
      },
    });
    console.log(`[PoiCache] Cached ${pois.length} POIs for ${city}/${theme}`);
  }
}
