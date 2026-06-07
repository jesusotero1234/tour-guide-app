import { PrismaClient } from '@prisma/client';
import { WikidataBatchEnrichment } from '../enrichment/WikidataEnricher';
import { WikipediaEnrichment } from '../enrichment/WikipediaEnricher';

const CACHE_TTL_MS = process.env.NODE_ENV === 'production'
  ? 30 * 24 * 60 * 60 * 1000
  : 7 * 24 * 60 * 60 * 1000;

type CacheKind = 'wikidata' | 'wikipedia';

export class PostgresPoiEnrichmentCacheRepository {
  private initialized = false;
  private initializationPromise: Promise<void> | null = null;

  constructor(private readonly prisma: PrismaClient) {}

  private async ensureTable(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initializationPromise) {
      await this.initializationPromise;
      return;
    }

    this.initializationPromise = (async () => {
      try {
        await this.prisma.$executeRawUnsafe(`
          CREATE TABLE IF NOT EXISTS poi_enrichment_cache (
            cache_kind TEXT NOT NULL,
            cache_key TEXT NOT NULL,
            language TEXT NOT NULL,
            payload JSONB NOT NULL,
            fetched_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (cache_kind, cache_key, language)
          )
        `);
      } catch (error: any) {
        if (error?.code !== '23505') {
          throw error;
        }
      } finally {
        this.initialized = true;
        this.initializationPromise = null;
      }
    })();

    await this.initializationPromise;
  }

  private isFresh(fetchedAt: Date): boolean {
    return Date.now() - fetchedAt.getTime() <= CACHE_TTL_MS;
  }

  private isMissingRelationError(error: unknown): boolean {
    return typeof error === 'object'
      && error !== null
      && 'code' in error
      && (error as { code?: string }).code === 'P2010'
      && 'meta' in error
      && typeof (error as { meta?: { code?: string } }).meta?.code === 'string'
      && (error as { meta?: { code?: string } }).meta?.code === '42P01';
  }

  private async resetAndEnsureTable(): Promise<void> {
    this.initialized = false;
    this.initializationPromise = null;
    await this.ensureTable();
  }

  private async get<T>(cacheKind: CacheKind, cacheKey: string, language: string): Promise<T | null> {
    await this.ensureTable();

    let rows: Array<{ payload: T; fetched_at: Date }>;
    try {
      rows = await this.prisma.$queryRawUnsafe<Array<{ payload: T; fetched_at: Date }>>(
        `
          SELECT payload, fetched_at
          FROM poi_enrichment_cache
          WHERE cache_kind = $1 AND cache_key = $2 AND language = $3
          LIMIT 1
        `,
        cacheKind,
        cacheKey,
        language
      );
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        throw error;
      }

      await this.resetAndEnsureTable();
      rows = await this.prisma.$queryRawUnsafe<Array<{ payload: T; fetched_at: Date }>>(
        `
          SELECT payload, fetched_at
          FROM poi_enrichment_cache
          WHERE cache_kind = $1 AND cache_key = $2 AND language = $3
          LIMIT 1
        `,
        cacheKind,
        cacheKey,
        language
      );
    }

    const row = rows[0];
    if (!row) {
      return null;
    }

    const fetchedAt = row.fetched_at instanceof Date ? row.fetched_at : new Date(row.fetched_at);
    if (!this.isFresh(fetchedAt)) {
      return null;
    }

    return row.payload;
  }

  private async set<T>(cacheKind: CacheKind, cacheKey: string, language: string, payload: T): Promise<void> {
    await this.ensureTable();

    try {
      await this.prisma.$executeRawUnsafe(
        `
          INSERT INTO poi_enrichment_cache (cache_kind, cache_key, language, payload, fetched_at)
          VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
          ON CONFLICT (cache_kind, cache_key, language)
          DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
        `,
        cacheKind,
        cacheKey,
        language,
        JSON.stringify(payload)
      );
    } catch (error) {
      if (!this.isMissingRelationError(error)) {
        throw error;
      }

      await this.resetAndEnsureTable();
      await this.prisma.$executeRawUnsafe(
        `
          INSERT INTO poi_enrichment_cache (cache_kind, cache_key, language, payload, fetched_at)
          VALUES ($1, $2, $3, $4::jsonb, CURRENT_TIMESTAMP)
          ON CONFLICT (cache_kind, cache_key, language)
          DO UPDATE SET payload = EXCLUDED.payload, fetched_at = EXCLUDED.fetched_at
        `,
        cacheKind,
        cacheKey,
        language,
        JSON.stringify(payload)
      );
    }
  }

  async getWikidata(wikidataId: string, language: string): Promise<WikidataBatchEnrichment | null> {
    return this.get<WikidataBatchEnrichment>('wikidata', wikidataId, language);
  }

  async setWikidata(wikidataId: string, language: string, payload: WikidataBatchEnrichment): Promise<void> {
    await this.set('wikidata', wikidataId, language, payload);
  }

  async getWikipedia(osmWikipediaTag: string, language: string): Promise<WikipediaEnrichment | null> {
    return this.get<WikipediaEnrichment>('wikipedia', osmWikipediaTag, language);
  }

  async setWikipedia(osmWikipediaTag: string, language: string, payload: WikipediaEnrichment): Promise<void> {
    await this.set('wikipedia', osmWikipediaTag, language, payload);
  }
}
