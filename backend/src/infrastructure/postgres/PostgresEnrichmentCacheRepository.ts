import { PrismaClient } from '@prisma/client';
import { EnrichedContext } from '../../services/enrichment/CityKnowledgeBase';

const CACHE_TTL_MS = process.env.NODE_ENV === 'production'
  ? 30 * 24 * 60 * 60 * 1000  // 30 days in prod
  : 7 * 24 * 60 * 60 * 1000;  // 7 days in dev

export class PostgresEnrichmentCacheRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async get(
    city: string,
    placeName: string,
    theme: string,
    language: string
  ): Promise<EnrichedContext[] | null> {
    const record = await this.prisma.enrichmentCache.findUnique({
      where: {
        city_placeName_theme_language: { city, placeName, theme, language },
      },
    });

    if (!record) return null;

    const age = Date.now() - record.createdAt.getTime();
    const ttl = record.ttlHours * 60 * 60 * 1000;
    if (age > ttl) {
      console.log(`[EnrichmentCache] Expired for ${city}/${placeName}`);
      return null;
    }

    console.log(`[EnrichmentCache] Hit for ${city}/${placeName}/${theme}`);
    return record.results as unknown as EnrichedContext[];
  }

  async set(
    city: string,
    placeName: string,
    theme: string,
    language: string,
    query: string,
    results: EnrichedContext[]
  ): Promise<void> {
    const payload = JSON.parse(JSON.stringify(results)); // Deep clone for Prisma Json

    await this.prisma.enrichmentCache.upsert({
      where: {
        city_placeName_theme_language: { city, placeName, theme, language },
      },
      create: {
        city,
        placeName,
        theme,
        language,
        query,
        results: payload,
        ttlHours: process.env.NODE_ENV === 'production' ? 720 : 168,
      },
      update: {
        createdAt: new Date(),
        query,
        results: payload,
      },
    });

    console.log(`[EnrichmentCache] Cached ${results.length} results for ${city}/${placeName}`);
  }

  async invalidate(
    city: string,
    placeName: string,
    theme: string,
    language: string
  ): Promise<void> {
    await this.prisma.enrichmentCache.deleteMany({
      where: { city, placeName, theme, language },
    });
  }
}
